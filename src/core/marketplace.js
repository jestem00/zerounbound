/*─────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File:    src/core/marketplace.js
Rev :    r916    2025‑07‑31
Summary: ZeroSum marketplace helpers.  Centralizes marketplace
         interactions for both Ghostnet and Mainnet.  Imports
         network-specific marketplace addresses (MARKETPLACE_ADDRESSES)
         and NETWORK_KEY from deployTarget.js to select the correct
         ZeroSum contract.  Falls back to NETWORK_KEY when
         toolkit._network is undefined to avoid ghostnet/mainnet mixups.
*/

import { OpKind } from '@taquito/taquito';
import { Tzip16Module, tzip16 } from '@taquito/tzip16';
import { NETWORK_KEY, MARKETPLACE_ADDRESSES } from '../config/deployTarget.js';

// Resolve the marketplace address based on the network.  When a network
// string is provided, match “mainnet” case-insensitively to select
// the mainnet contract; otherwise default to ghostnet.  Fallbacks to
// the global NETWORK_KEY when undefined.
export const marketplaceAddr = (net = NETWORK_KEY) => {
  const key = /mainnet/i.test(net) ? 'mainnet' : 'ghostnet';
  return MARKETPLACE_ADDRESSES[key] || MARKETPLACE_ADDRESSES.ghostnet;
};

/**
 * Obtain a handle to the ZeroSum marketplace contract for the given toolkit.
 * Registers the TZIP-16 module so that off‑chain views can be executed.
 * Uses the toolkit’s network type (if available) or the configured
 * NETWORK_KEY to pick the correct marketplace address.
 *
 * @param {import('@taquito/taquito').TezosToolkit} toolkit an instantiated Taquito toolkit
 * @returns {Promise<import('@taquito/taquito').WalletContract>} wallet contract instance
 */
export async function getMarketContract(toolkit) {
  const netType = toolkit?._network?.type ?? NETWORK_KEY;
  const addr = marketplaceAddr(netType);
  try {
    toolkit.addExtension(new Tzip16Module());
  } catch (e) {
    /* ignore duplicate registration errors */
  }
  return toolkit.wallet.at(addr, tzip16);
}

/*─────────────────────────────────────────────────────────────
  Off‑chain view helpers
─────────────────────────────────────────────────────────────*/

// Fetch all listings for a given token via the off‑chain view.
export async function fetchListings({ toolkit, nftContract, tokenId }) {
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

// Return the cheapest active listing for the given token from off‑chain views.
export async function fetchLowestListing({ toolkit, nftContract, tokenId }) {
  let list = [];
  try {
    list = await fetchOnchainListings({ toolkit, nftContract, tokenId });
  } catch {
    /* ignore errors and fall back */
  }
  if (!list || !list.length) {
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

// Fetch all offers for a given token via the off‑chain view.
export async function fetchOffers({ toolkit, nftContract, tokenId }) {
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

// Fetch detailed listing information via the off‑chain view.
export async function fetchListingDetails({ toolkit, nftContract, tokenId, nonce }) {
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

async function getViewCaller(market, toolkit) {
  try {
    const pkh = await toolkit.signer.publicKeyHash();
    if (typeof pkh === 'string' && pkh.startsWith('tz')) return pkh;
  } catch {
    /* ignore signer resolution errors */
  }
  return market.address;
}

// Fetch all listings for a token using the on‑chain view.
export async function fetchOnchainListings({ toolkit, nftContract, tokenId }) {
  const market = await getMarketContract(toolkit);
  const viewCaller = await getViewCaller(market, toolkit);
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

// Fetch all offers for a token using the on‑chain view.
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

// Fetch detailed information for a specific listing using the on‑chain view.
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

// Fetch all listings made by a specific seller via the on‑chain view.
export async function fetchOnchainListingsForSeller({ toolkit, seller }) {
  const market = await getMarketContract(toolkit);
  const viewCaller = await getViewCaller(market, toolkit);
  const raw = await market.contractViews
    .onchain_listings_for_seller(seller)
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

// Fetch all offers made by a specific buyer using the on‑chain view.
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

// Fetch all listings for an entire collection via the on‑chain view.
export async function fetchOnchainListingsForCollection({ toolkit, nftContract }) {
  const market = await getMarketContract(toolkit);
  const viewCaller = await getViewCaller(market, toolkit);
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

// Fetch all offers made on an entire collection via the on‑chain view.
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

// Build parameters for a buy operation.
export async function buildBuyParams(toolkit, { nftContract, tokenId, priceMutez, seller, nonce, amount = 1 }) {
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

// Build parameters for listing a token for sale.
export async function buildListParams(toolkit, { nftContract, tokenId, priceMutez, amount = 1, saleSplits = [], royaltySplits = [], startDelay = 0 }) {
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

// Build parameters for cancelling a listing.
export async function buildCancelParams(toolkit, { nftContract, tokenId, listingNonce }) {
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

// Build parameters for accepting an offer.
export async function buildAcceptOfferParams(toolkit, { nftContract, tokenId, amount = 1, listingNonce, offeror }) {
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

// Build parameters for making an offer.
export async function buildOfferParams(toolkit, { nftContract, tokenId, priceMutez, amount = 1 }) {
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

/* What changed & why: imported marketplace addresses from deployTarget.js and
   NETWORK_KEY, removed hard‑coded GHOSTNET and MAINNET address constants,
   updated marketplaceAddr and getMarketContract to use these values, and
   updated the revision and summary. */