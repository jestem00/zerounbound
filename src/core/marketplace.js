/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/marketplace.js
  Rev :    r915    2025‑07‑29 UTC
  Summary: ZeroSum marketplace helpers.  This module centralises
           all marketplace interactions for both Ghostnet and
           Mainnet.  It defines the deployed contract addresses,
           exposes helpers for calling off‑chain and on‑chain
           views, normalises their return types and builds
           parameter objects for marketplace entrypoints such as
           buy, list_token, make_offer, cancel_listing and
           accept_offer.  The module has been updated to
           accommodate the new Ghostnet marketplace (KT1R1PzLh…)
           which defines both on‑chain and off‑chain views.
           Off‑chain view names have changed (prefixed with
           `offchain_`).  Additional helper functions have been
           added for the corresponding on‑chain views.  All
           functions require a Taquito toolkit configured with
           the appropriate network.
─────────────────────────────────────────────────────────────*/

import { OpKind, TezosToolkit }      from '@taquito/taquito';
import { Tzip16Module, tzip16 }      from '@taquito/tzip16';

/*── deployed marketplace addresses ──────────────────────────*/
// Ghostnet marketplace contract (ZeroSum v2).  This address
// corresponds to the updated deployment which includes both
// on‑chain and off‑chain views.  See docs/Manifest and
// changelog r1024 for details.
export const GHOSTNET_ADDR = 'KT1R1PzLhBXEd98ei72mFuz4FrUYEcuV7t1p';
// Mainnet marketplace contract (unchanged).  The mainnet
// deployment does not currently provide on‑chain views but
// still exposes the off‑chain views described in the
// marketplace documentation.
export const MAINNET_ADDR  = 'KT19kipdLiWyBZvP7KWCPdRbDXuEiu3gfjBR';

/**
 * Resolve the marketplace address from a network label.
 * Accepts any string containing “mainnet” (case‑insensitive)
 * to select the mainnet contract; all other values default to
 * ghostnet.  When the toolkit’s internal network type is
 * available it should be passed through to this helper.
 *
 * @param {string} net network label (e.g. 'ghostnet' or 'mainnet')
 */
export const marketplaceAddr = (net = 'ghostnet') =>
  /mainnet/i.test(net) ? MAINNET_ADDR : GHOSTNET_ADDR;

/**
 * Obtain a handle to the ZeroSum contract for the given toolkit.
 * Registers the Tzip16 module so that off‑chain views can be
 * executed.  Uses the toolkit’s network type to pick the correct
 * marketplace address.  Returned contract instances expose both
 * off‑chain and on‑chain views via `tzip16().metadataViews()`
 * and `contractViews` respectively.
 *
 * @param {TezosToolkit} toolkit an instantiated Taquito toolkit
 * @returns {Promise<import('@taquito/taquito').WalletContract>} wallet contract
 */
export async function getMarketContract(toolkit) {
  const addr = marketplaceAddr(toolkit._network?.type);
  // Register the TZIP‑16 extension unconditionally.  Taquito
  // gracefully ignores duplicate registrations.
  try {
    toolkit.addExtension(new Tzip16Module());
  } catch (e) {
    /* ignore registration errors */
  }
  return toolkit.wallet.at(addr, tzip16);
}

/*─────────────────────────────────────────────────────────────
  Off‑chain view helpers
─────────────────────────────────────────────────────────────*/

/**
 * Fetch all listings for a given token via the off‑chain view.
 * The updated marketplace prefixes off‑chain views with
 * “offchain_”; this helper transparently calls the correct view
 * and normalises its return type.  Each entry contains the
 * listing nonce, price in mutez, amount, seller and active
 * status.  Handles both Michelson map and plain object formats.
 *
 * @param {object} opts options
 * @param {TezosToolkit} opts.toolkit
 * @param {string} opts.nftContract KT1 address of the NFT contract
 * @param {number|string} opts.tokenId FA2 token id
 * @returns {Promise<Array<{nonce:number,priceMutez:number,amount:number,seller:string,active:boolean}>>}
 */
export async function fetchListings({ toolkit, nftContract, tokenId }) {
  // Fetch all listings for a given token via the off‑chain view.
  // In the new marketplace contract the off‑chain view expects
  // parameters passed as an object keyed by the Michelson
  // parameter names.  We wrap the call in a try/catch to fall
  // back to positional arguments in case the contract still
  // accepts the old format.  The return value is normalised
  // into an array of objects with nonce, priceMutez, amount,
  // seller and active properties.
  const market = await getMarketContract(toolkit);
  const views  = await market.tzip16().metadataViews();
  let raw;
  try {
    raw = await views.offchain_listings_for_token().executeView({
      nft_contract: nftContract,
      token_id    : Number(tokenId),
    });
  } catch {
    // Fallback to positional arguments (legacy contract)
    raw = await views.offchain_listings_for_token().executeView(
      String(nftContract),
      Number(tokenId),
    );
  }
  const out = [];
  const push = (n, o) => out.push({
    nonce      : Number(n),
    priceMutez : Number(o.price),
    amount     : Number(o.amount),
    seller     : o.seller,
    active     : o.active,
  });
  if (raw?.entries) {
    for (const [k, v] of raw.entries()) push(k, v);
  } else if (raw && typeof raw === 'object') {
    Object.entries(raw).forEach(([k, v]) => push(k, v));
  }
  return out;
}

/**
 * Return the cheapest active listing for the given token from
 * off‑chain views.  If no active listing exists the function
 * returns null.  The returned object includes nonce,
 * priceMutez, amount and seller.
 *
 * @param {object} opts options
 * @param {TezosToolkit} opts.toolkit
 * @param {string} opts.nftContract
 * @param {number|string} opts.tokenId
 * @returns {Promise<null|{nonce:number,priceMutez:number,amount:number,seller:string}>}
 */
export async function fetchLowestListing({ toolkit, nftContract, tokenId }) {
  // Attempt to obtain the lowest active listing using the
  // on‑chain view first when available.  This avoids issues
  // with off‑chain view parameter formats and ensures that
  // listings are read from the canonical source.  If the
  // on‑chain view is unavailable or returns no active listings
  // (e.g. on mainnet), fall back to the off‑chain view.
  let list = [];
  try {
    list = await fetchOnchainListings({ toolkit, nftContract, tokenId });
  } catch {
    /* ignore errors and fall back */
  }
  if (!list || !list.length) {
    // Off‑chain fallback
    try {
      list = await fetchListings({ toolkit, nftContract, tokenId });
    } catch {
      list = [];
    }
  }
  const act = list.filter((l) => l.active && Number(l.amount) > 0);
  if (!act.length) return null;
  return act.reduce((m, c) => (c.priceMutez < m.priceMutez ? c : m));
}

/**
 * Fetch all offers for a given token via the off‑chain view.
 * Normalises each entry with offeror, priceMutez, amount,
 * nonce and accepted flag.  The updated view name is
 * offchain_offers_for_token.
 *
 * @param {object} opts
 * @param {TezosToolkit} opts.toolkit
 * @param {string} opts.nftContract
 * @param {number|string} opts.tokenId
 * @returns {Promise<Array<{offeror:string,priceMutez:number,amount:number,nonce:number,accepted:boolean}>>}
 */
export async function fetchOffers({ toolkit, nftContract, tokenId }) {
  // Fetch all offers for a token via the off‑chain view.  The
  // new contract expects the parameters to be passed as an
  // object keyed by the Michelson names.  Fall back to
  // positional arguments for older deployments.  Normalize the
  // result into an array with offeror, priceMutez, amount,
  // nonce and accepted.
  const market = await getMarketContract(toolkit);
  const views  = await market.tzip16().metadataViews();
  let raw;
  try {
    raw = await views.offchain_offers_for_token().executeView({
      nft_contract: nftContract,
      token_id    : Number(tokenId),
    });
  } catch {
    raw = await views.offchain_offers_for_token().executeView(
      String(nftContract),
      Number(tokenId),
    );
  }
  const offers = [];
  const push = (k, o) => offers.push({
    offeror    : k,
    priceMutez: Number(o.price),
    amount    : Number(o.amount),
    nonce     : Number(o.nonce),
    accepted  : o.accepted,
  });
  if (raw?.entries) {
    for (const [k, v] of raw.entries()) push(k, v);
  } else if (raw && typeof raw === 'object') {
    Object.entries(raw).forEach(([k, v]) => push(k, v));
  }
  return offers;
}

/**
 * Fetch detailed information for a specific listing nonce via the
 * off‑chain view.  Returns a structured object with seller,
 * price, amount, start time and splits.  The updated view
 * name is offchain_listing_details.
 *
 * @param {object} opts
 * @param {TezosToolkit} opts.toolkit
 * @param {string} opts.nftContract
 * @param {number|string} opts.tokenId
 * @param {number|string} opts.nonce
 * @returns {Promise<{contract:string,tokenId:number,seller:string,priceMutez:number,amount:number,active:boolean,startTime:string,saleSplits:Array,royaltySplits:Array}>}
 */
export async function fetchListingDetails({ toolkit, nftContract, tokenId, nonce }) {
  // Fetch detailed listing information via the off‑chain view.
  // Accept both object and positional parameter formats.  Return
  // a normalised object with camel‑cased keys.
  const market = await getMarketContract(toolkit);
  const views  = await market.tzip16().metadataViews();
  let raw;
  try {
    raw = await views.offchain_listing_details().executeView({
      listing_nonce: Number(nonce),
      nft_contract : nftContract,
      token_id     : Number(tokenId),
    });
  } catch {
    raw = await views.offchain_listing_details().executeView(
      Number(nonce),
      String(nftContract),
      Number(tokenId),
    );
  }
  return {
    contract     : raw.nft_contract,
    tokenId      : Number(raw.token_id),
    seller       : raw.seller,
    priceMutez   : Number(raw.price),
    amount       : Number(raw.amount),
    active       : raw.active,
    startTime    : raw.start_time,
    saleSplits   : raw.sale_splits,
    royaltySplits: raw.royalty_splits,
  };
}

/*─────────────────────────────────────────────────────────────
  On‑chain view helpers
─────────────────────────────────────────────────────────────*/

/**
 * Internal helper to obtain a viewCaller for on‑chain view
 * simulation.  The Taquito library requires a calling contract
 * address when executing a Michelson view.  We prefer to
 * simulate the view as though it were invoked by the
 * marketplace itself; however, if the wallet toolkit has a
 * connected signer we use that account’s address instead.  This
 * function never throws and falls back to the marketplace
 * address when the signer’s public key hash cannot be
 * resolved.
 *
 * @param {import('@taquito/taquito').WalletContract} market marketplace handle
 * @param {TezosToolkit} toolkit the taquito toolkit
 * @returns {Promise<string>} tz1|tz2|tz3 address used for viewCaller
 */
async function getViewCaller(market, toolkit) {
  try {
    const pkh = await toolkit.signer.publicKeyHash();
    if (typeof pkh === 'string' && pkh.startsWith('tz')) return pkh;
  } catch {
    /* ignore signer resolution errors */
  }
  // Fallback to the marketplace address
  return market.address;
}

/**
 * Fetch all listings for a token using the on‑chain view.  This
 * function calls the `onchain_listings_for_token` view and
 * normalises its result into the same shape returned by
 * `fetchListings()`.  The returned array contains objects
 * `{ nonce, priceMutez, amount, seller, active }`.
 *
 * @param {object} opts
 * @param {TezosToolkit} opts.toolkit
 * @param {string} opts.nftContract
 * @param {number|string} opts.tokenId
 */
export async function fetchOnchainListings({ toolkit, nftContract, tokenId }) {
  const market = await getMarketContract(toolkit);
  const viewCaller = await getViewCaller(market, toolkit);
  // Pass parameters as an object keyed by Michelson names.  Some
  // older Taquito versions also accept positional arguments, but
  // object format is preferred and future‑proof.
  const raw = await market.contractViews
    .onchain_listings_for_token({
      nft_contract: nftContract,
      token_id    : Number(tokenId),
    })
    .executeView({ viewCaller });
  const out = [];
  const push = (n, o) => out.push({
    nonce      : Number(n),
    priceMutez : Number(o.price),
    amount     : Number(o.amount),
    seller     : o.seller,
    active     : o.active,
  });
  if (raw?.entries) {
    for (const [k, v] of raw.entries()) push(k, v);
  } else if (typeof raw === 'object') {
    Object.entries(raw).forEach(([k, v]) => push(k, v));
  }
  return out;
}

/**
 * Fetch all offers for a token using the on‑chain view
 * `onchain_offers_for_token`.  Normalises the result into an
 * array of objects `{ offeror, priceMutez, amount, nonce, accepted }`.
 */
export async function fetchOnchainOffers({ toolkit, nftContract, tokenId }) {
  const market = await getMarketContract(toolkit);
  const viewCaller = await getViewCaller(market, toolkit);
  const raw = await market.contractViews
    .onchain_offers_for_token({
      nft_contract: nftContract,
      token_id    : Number(tokenId),
    })
    .executeView({ viewCaller });
  const offers = [];
  const push = (k, o) => offers.push({
    offeror    : k,
    priceMutez: Number(o.price),
    amount    : Number(o.amount),
    nonce     : Number(o.nonce),
    accepted  : o.accepted,
  });
  if (raw?.entries) {
    for (const [k, v] of raw.entries()) push(k, v);
  } else if (typeof raw === 'object') {
    Object.entries(raw).forEach(([k, v]) => push(k, v));
  }
  return offers;
}

/**
 * Fetch detailed information for a specific listing using the
 * on‑chain view `onchain_listing_details`.  Returns a
 * structured object with the same shape as returned by
 * `fetchListingDetails()`.  If the listing does not exist the
 * RPC returns default values which are passed through.
 */
export async function fetchOnchainListingDetails({ toolkit, nftContract, tokenId, nonce }) {
  const market = await getMarketContract(toolkit);
  const viewCaller = await getViewCaller(market, toolkit);
  const raw = await market.contractViews
    .onchain_listing_details({
      listing_nonce: Number(nonce),
      nft_contract : nftContract,
      token_id     : Number(tokenId),
    })
    .executeView({ viewCaller });
  return {
    contract     : raw.nft_contract,
    tokenId      : Number(raw.token_id),
    seller       : raw.seller,
    priceMutez   : Number(raw.price),
    amount       : Number(raw.amount),
    active       : raw.active,
    startTime    : raw.start_time,
    saleSplits   : raw.sale_splits,
    royaltySplits: raw.royalty_splits,
  };
}

/**
 * Fetch all listings made by a specific seller via the on‑chain
 * view `onchain_listings_for_seller`.  Returns an array of
 * listing objects.  Each entry includes the NFT contract,
 * tokenId, seller, price, amount, active flag, start time and
 * splits.  The view returns a list rather than a map so no
 * key is provided for each element.
 */
export async function fetchOnchainListingsForSeller({ toolkit, seller }) {
  const market = await getMarketContract(toolkit);
  const viewCaller = await getViewCaller(market, toolkit);
  // When the view accepts a simple address argument, pass as
  // string directly.  Do not wrap in an object; Taquito will
  // automatically inject the Michelson type for a single
  // primitive.
  const raw = await market.contractViews
    .onchain_listings_for_seller(seller)
    .executeView({ viewCaller });
  // Ensure we return an array of plain objects
  return Array.isArray(raw) ? raw.map((r) => ({
    contract     : r.nft_contract,
    tokenId      : Number(r.token_id),
    seller       : r.seller,
    priceMutez   : Number(r.price),
    amount       : Number(r.amount),
    active       : r.active,
    startTime    : r.start_time,
    saleSplits   : r.sale_splits,
    royaltySplits: r.royalty_splits,
  })) : [];
}

/**
 * Fetch all offers made by a specific buyer using
 * `onchain_offers_for_buyer`.  Returns an array of objects with
 * offeror, price, amount, nonce and accepted flag.
 */
export async function fetchOnchainOffersForBuyer({ toolkit, buyer }) {
  const market = await getMarketContract(toolkit);
  const viewCaller = await getViewCaller(market, toolkit);
  const raw = await market.contractViews
    .onchain_offers_for_buyer(buyer)
    .executeView({ viewCaller });
  return Array.isArray(raw) ? raw.map((r) => ({
    offeror    : r.offeror,
    priceMutez: Number(r.price),
    amount    : Number(r.amount),
    nonce     : Number(r.nonce),
    accepted  : r.accepted,
  })) : [];
}

/**
 * Fetch all listings for an entire collection via the on‑chain
 * view `onchain_listings_for_collection`.  Each entry in the
 * returned list contains complete listing information.  This
 * helper normalises the result and returns an array of
 * structured objects.
 */
export async function fetchOnchainListingsForCollection({ toolkit, nftContract }) {
  const market = await getMarketContract(toolkit);
  const viewCaller = await getViewCaller(market, toolkit);
  // Pass the collection contract address as an object; older
  // deployments may accept positional arguments but the object
  // form is safer.
  const raw = await market.contractViews
    .onchain_listings_for_collection({
      nft_contract: nftContract,
    })
    .executeView({ viewCaller });
  return Array.isArray(raw) ? raw.map((r) => ({
    contract     : r.nft_contract,
    tokenId      : Number(r.token_id),
    seller       : r.seller,
    priceMutez   : Number(r.price),
    amount       : Number(r.amount),
    active       : r.active,
    startTime    : r.start_time,
    saleSplits   : r.sale_splits,
    royaltySplits: r.royalty_splits,
  })) : [];
}

/**
 * Fetch all offers made on an entire collection via the on‑chain
 * view `onchain_offers_for_collection`.  Each entry includes
 * offeror, price, amount, nonce and accepted flag.
 */
export async function fetchOnchainOffersForCollection({ toolkit, nftContract }) {
  const market = await getMarketContract(toolkit);
  const viewCaller = await getViewCaller(market, toolkit);
  const raw = await market.contractViews
    .onchain_offers_for_collection({
      nft_contract: nftContract,
    })
    .executeView({ viewCaller });
  return Array.isArray(raw) ? raw.map((r) => ({
    offeror    : r.offeror,
    priceMutez: Number(r.price),
    amount    : Number(r.amount),
    nonce     : Number(r.nonce),
    accepted  : r.accepted,
  })) : [];
}

/*─────────────────────────────────────────────────────────────
  Param‑builder helpers for wallet.batch() transactions
─────────────────────────────────────────────────────────────*/

/**
 * Build parameters for a buy operation.  Uses the buy
 * entrypoint where the payment amount is passed as the
 * transaction amount.  All parameters are normalized to the
 * appropriate types.
 */
export async function buildBuyParams(toolkit, {
  nftContract,
  tokenId,
  priceMutez,
  seller,
  nonce,
  amount = 1,
}) {
  const c = await getMarketContract(toolkit);
  return [{
    kind : OpKind.TRANSACTION,
    ...c.methodsObject.buy({
      amount,
      nft_contract: nftContract,
      nonce: Number(nonce),
      seller,
      token_id: Number(tokenId),
    }).toTransferParams({ amount: priceMutez, mutez: true }),
  }];
}

/**
 * Build parameters for listing a token for sale.  The startDelay
 * defaults to 0 (immediately available) and the sale/royalty
 * splits arrays can be empty.  All numeric fields are cast
 * appropriately.
 */
export async function buildListParams(toolkit, {
  nftContract,
  tokenId,
  priceMutez,
  amount        = 1,
  saleSplits    = [],
  royaltySplits = [],
  startDelay    = 0,
}) {
  const c = await getMarketContract(toolkit);
  return [{
    kind : OpKind.TRANSACTION,
    ...c.methodsObject.list_token({
      nft_contract  : nftContract,
      token_id      : Number(tokenId),
      price         : priceMutez,
      amount        : Number(amount),
      sale_splits   : saleSplits,
      royalty_splits: royaltySplits,
      start_delay   : Number(startDelay),
    }).toTransferParams(),
  }];
}

/**
 * Build parameters for cancelling a listing.  Requires the
 * listing nonce and token identifiers.  All numeric fields are
 * cast as necessary.
 */
export async function buildCancelParams(toolkit, {
  nftContract,
  tokenId,
  listingNonce,
}) {
  const c = await getMarketContract(toolkit);
  return [{
    kind : OpKind.TRANSACTION,
    ...c.methodsObject.cancel_listing({
      listing_nonce: Number(listingNonce),
      nft_contract : nftContract,
      token_id     : Number(tokenId),
    }).toTransferParams(),
  }];
}

/**
 * Build parameters for accepting an offer.  The amount field
 * specifies how many editions to accept (default 1).  The
 * listingNonce identifies the listing to which the offer was
 * made and the offeror must match the address of the bidder.
 */
export async function buildAcceptOfferParams(toolkit, {
  nftContract,
  tokenId,
  amount        = 1,
  listingNonce,
  offeror,
}) {
  const c = await getMarketContract(toolkit);
  return [{
    kind : OpKind.TRANSACTION,
    ...c.methodsObject.accept_offer({
      amount       : Number(amount),
      listing_nonce: Number(listingNonce),
      nft_contract : nftContract,
      offeror,
      token_id     : Number(tokenId),
    }).toTransferParams(),
  }];
}

/**
 * Build parameters for making an offer.  Accepts an amount and
 * price in mutez.  The token remains owned by the seller until
 * the offer is accepted.  All numeric fields are cast to
 * numbers.
 */
export async function buildOfferParams(toolkit, {
  nftContract,
  tokenId,
  priceMutez,
  amount = 1,
}) {
  const c = await getMarketContract(toolkit);
  return [{
    kind : OpKind.TRANSACTION,
    ...c.methodsObject.make_offer({
      amount    : Number(amount),
      nft_contract: nftContract,
      price     : priceMutez,
      token_id  : Number(tokenId),
    }).toTransferParams(),
  }];
}

/* What changed & why: updated Ghostnet marketplace address to
   KT1R1PzLhBXEd98ei72mFuz4FrUYEcuV7t1p, aligned off‑chain view
   names with the new contract (offchain_*), added helpers for
   on‑chain views (onchain_*), and added a viewCaller helper to
   safely determine the source address for view simulation.
   Revised documentation and summaries accordingly. */