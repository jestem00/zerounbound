/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/marketplace.js
  Rev :    r914    2025‑07‑24 UTC
  Summary: ZeroSum marketplace helpers.  Provides high‑level
           functions to interact with the deployed ZeroSum
           contracts on Ghostnet and Mainnet.  Includes
           utilities to fetch listings, offers and listing
           details via off‑chain views and to build parameter
           objects for marketplace entrypoints such as buy,
           list, accept_offer and cancel_listing.  All calls
           assume that a Taquito toolkit with the appropriate
           network configuration has been provided.
─────────────────────────────────────────────────────────────*/

import { OpKind, TezosToolkit }      from '@taquito/taquito';
import { Tzip16Module, tzip16 }      from '@taquito/tzip16';

/*── deployed marketplace addresses ──────────────────────────*/
export const GHOSTNET_ADDR = 'KT1HmDjRUJSx4uUoFVZyDWVXY5WjDofEgH2G';
export const MAINNET_ADDR  = 'KT1Pg8KjHptWXJgN79vCnuWnYUZF3gz9hUhu';

/** Resolve the marketplace address from a network label. */
export const marketplaceAddr = (net = 'ghostnet') =>
  /mainnet/i.test(net) ? MAINNET_ADDR : GHOSTNET_ADDR;

/**
 * Obtain a handle to the ZeroSum contract for the given toolkit.
 * Registers the Tzip16 module so that off‑chain views can be
 * executed.  Uses the toolkit's network type to pick the correct
 * marketplace address.
 *
 * @param {TezosToolkit} toolkit an instantiated Taquito toolkit
 * @returns {Promise<import('@taquito/taquito').WalletContract>} wallet contract
 */
export async function getMarketContract(toolkit) {
  const addr = marketplaceAddr(toolkit._network?.type);
  /*
   * Enable off‑chain views.  The Taquito toolkit may not expose
   * the internal `_plugins` array on all versions, which would
   * cause `undefined.some` errors.  Instead of inspecting the
   * private field we unconditionally attempt to install the
   * Tzip16Module.  Taquito ignores duplicate extensions, so
   * repeated calls are safe.  Wrap in a try/catch to silence
   * any unexpected errors.
   */
  try {
    toolkit.addExtension(new Tzip16Module());
  } catch (e) {
    /* ignored */
  }
  return toolkit.wallet.at(addr, tzip16);
}

/**
 * Query the get_listings_for_token off‑chain view and return a
 * normalised array of listing objects.  Each entry contains the
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
  const market = await getMarketContract(toolkit);
  const views  = await market.tzip16().metadataViews();
  const raw    = await views.get_listings_for_token()
    .executeView(String(nftContract), Number(tokenId));
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
 * Return the cheapest active listing for the given token.  If no
 * active listing exists the function returns null.  The returned
 * object includes nonce, priceMutez, amount and seller.
 *
 * @param {object} opts options
 * @param {TezosToolkit} opts.toolkit
 * @param {string} opts.nftContract
 * @param {number|string} opts.tokenId
 * @returns {Promise<null|{nonce:number,priceMutez:number,amount:number,seller:string}>}
 */
export async function fetchLowestListing({ toolkit, nftContract, tokenId }) {
  const list = await fetchListings({ toolkit, nftContract, tokenId });
  const act  = list.filter((l) => l.active && l.amount > 0);
  if (!act.length) return null;
  return act.reduce((m, c) => (c.priceMutez < m.priceMutez ? c : m));
}

/**
 * Fetch all offers for a given token via get_offers_for_token view.
 * The returned array normalises each entry with offeror, priceMutez,
 * amount, nonce and accepted flag.
 *
 * @param {object} opts
 * @param {TezosToolkit} opts.toolkit
 * @param {string} opts.nftContract
 * @param {number|string} opts.tokenId
 * @returns {Promise<Array<{offeror:string,priceMutez:number,amount:number,nonce:number,accepted:boolean}>>}
 */
export async function fetchOffers({ toolkit, nftContract, tokenId }) {
  const market = await getMarketContract(toolkit);
  const views  = await market.tzip16().metadataViews();
  const raw    = await views.get_offers_for_token()
    .executeView(String(nftContract), Number(tokenId));
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
 * Fetch detailed information for a specific listing nonce via the
 * get_listing_details off‑chain view.  Returns a structured
 * object with seller, price, amount, start time and splits.
 *
 * @param {object} opts
 * @param {TezosToolkit} opts.toolkit
 * @param {string} opts.nftContract
 * @param {number|string} opts.tokenId
 * @param {number|string} opts.nonce
 * @returns {Promise<{contract:string,tokenId:number,seller:string,priceMutez:number,amount:number,active:boolean,startTime:string,saleSplits:Array,royaltySplits:Array}>}
 */
export async function fetchListingDetails({ toolkit, nftContract, tokenId, nonce }) {
  const market = await getMarketContract(toolkit);
  const views  = await market.tzip16().metadataViews();
  const raw    = await views.get_listing_details()
    .executeView(Number(nonce), String(nftContract), Number(tokenId));
  return {
    contract    : raw.nft_contract,
    tokenId     : Number(raw.token_id),
    seller      : raw.seller,
    priceMutez  : Number(raw.price),
    amount      : Number(raw.amount),
    active      : raw.active,
    startTime   : raw.start_time,
    saleSplits  : raw.sale_splits,
    royaltySplits: raw.royalty_splits,
  };
}

/*─────────────────────────────────────────────────────────────
  Param‑builder helpers for wallet.batch() transactions
─────────────────────────────────────────────────────────────*/

/**
 * Build parameters for a buy operation.  Uses the buy entrypoint
 * where the payment amount is passed as the transaction amount.
 *
 * @param {TezosToolkit} toolkit
 * @param {object} opts
 * @param {string} opts.nftContract
 * @param {number|string} opts.tokenId
 * @param {number} opts.priceMutez
 * @param {string} opts.seller
 * @param {number} opts.nonce
 * @param {number} [opts.amount=1]
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
 * splits arrays can be empty.
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
 * listing nonce and token identifiers.
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
 * the offer is accepted.
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

/* What changed & why: initial creation of marketplace helpers
   module.  Exposes constants for deployed marketplace addresses,
   functions to retrieve and normalise off‑chain views (listings,
   offers, listing details) and parameter builders for all
   marketplace entrypoints (buy, list_token, cancel_listing,
   accept_offer and make_offer).  This module centralises the
   marketplace logic and uses Tzip16 to execute off‑chain
   views. */
/* EOF */