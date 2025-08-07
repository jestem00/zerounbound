/*─────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File:    src/core/marketplace.js
Rev :    r928    2025‑08‑06
Summary: Add read/write marketplace address separation, offline
         balance support and expose marketplaceAddrs helper.
         getMarketContract selects write or read instance;
         fetchListings aggregates across all read addresses;
         buildListParams accepts an offline_balance flag.
*/

import { OpKind } from '@taquito/taquito';
import { Tzip16Module } from '@taquito/tzip16';
import {
  TARGET,
  MARKETPLACE_WRITE_ADDRESSES,
  MARKETPLACE_READ_ADDRESSES,
  TZKT_API,
} from '../config/deployTarget.js';
import { jFetch } from './net.js';

// Resolve read‑only marketplace addresses for a given network key.
export const marketplaceAddrs = (net = TARGET) => {
  const key = /mainnet/i.test(net) ? 'mainnet' : 'ghostnet';
  return MARKETPLACE_READ_ADDRESSES[key];
};

// Legacy helper – retain single‑address resolver for backward compat.
export const marketplaceAddr = (net = TARGET) => marketplaceAddrs(net)[0];
/**
 * Obtain a handle to the ZeroSum marketplace contract for the given toolkit.
 * Registers the TZIP‑16 module so that off‑chain views can be executed.
 * Uses the toolkit’s network type (if available) or the configured
 * NETWORK_KEY to pick the correct marketplace address.
 *
 * @param {import('@taquito/taquito').TezosToolkit} toolkit an instantiated Taquito toolkit
 * @returns {Promise<import('@taquito/taquito').Contract>} contract instance
 */
export async function getMarketContract(toolkit, { write = true } = {}) {
  const addr = write
    ? MARKETPLACE_WRITE_ADDRESSES[TARGET]
    : MARKETPLACE_READ_ADDRESSES[TARGET][0];
  try {
    toolkit.addExtension(new Tzip16Module());
  } catch {
    /* ignore */
  }
  return toolkit.contract.at(addr);
}

function* _eachMarketAddr() {
  for (const a of MARKETPLACE_READ_ADDRESSES[TARGET]) yield a;
}

/*─────────────────────────────────────────────────────────────
  Off‑chain view helpers
─────────────────────────────────────────────────────────────*/

// Fetch all listings for a given token from every marketplace instance.
export async function fetchListings({ toolkit: _tk, nftContract, tokenId }) {
  const out = [];
  for (const mkt of _eachMarketAddr()) {
    try {
      const res = await jFetch(
        `${TZKT_API}/v1/contracts/${mkt}/bigmaps/listings/keys?token_contract=${nftContract}&token_id=${tokenId}`,
      );
      if (Array.isArray(res)) out.push(...res);
    } catch {
      /* ignore individual failures */
    }
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
  // Prefer on‑chain offers view and avoid off‑chain run_code calls.
  try {
    const results = await fetchOnchainOffers({ toolkit, nftContract, tokenId });
    return Array.isArray(results) ? results : [];
  } catch {
    return [];
  }
}

// Fetch detailed listing information via the off‑chain view.
export async function fetchListingDetails({ toolkit, nftContract, tokenId, nonce }) {
  const market = await getMarketContract(toolkit);
  const views = await market.tzip16().metadataViews();
  let raw;
  try {
    raw = await views.offchain_listing_details().executeView({
      listing_nonce: Number(nonce),
      nft_contract: nftContract,
      token_id: Number(tokenId),
    });
  } catch {
    raw = await views.offchain_listing_details().executeView(
      Number(nonce),
      String(nftContract),
      Number(tokenId),
    );
  }
  return {
    contract: raw.nft_contract,
    tokenId: Number(raw.token_id),
    seller: raw.seller,
    priceMutez: Number(raw.price),
    amount: Number(raw.amount),
    active: raw.active,
    startTime: raw.start_time,
    saleSplits: raw.sale_splits,
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
  try { toolkit.addExtension?.(new Tzip16Module()); } catch {}
  const out = [];
  const push = (n, o) =>
    out.push({
      nonce: Number(n),
      priceMutez: Number(o.price),
      amount: Number(o.amount),
      seller: o.seller,
      active: o.active,
    });
  for (const addr of _eachMarketAddr()) {
    try {
      const market = await toolkit.contract.at(addr);
      const viewCaller = await getViewCaller(market, toolkit);
      const raw = await market.contractViews
        .onchain_listings_for_token({
          nft_contract: nftContract,
          token_id: Number(tokenId),
        })
        .executeView({ viewCaller });
      if (raw?.entries) {
        for (const [k, v] of raw.entries()) push(k, v);
      } else if (typeof raw === 'object') {
        Object.entries(raw).forEach(([k, v]) => push(k, v));
      }
    } catch {}
  }
  return out;
}

// Fetch all offers for a token using the on‑chain view.
export async function fetchOnchainOffers({ toolkit, nftContract, tokenId }) {
  try { toolkit.addExtension?.(new Tzip16Module()); } catch {}
  const offers = [];
  const push = (k, o) =>
    offers.push({
      offeror: k,
      priceMutez: Number(o.price),
      amount: Number(o.amount),
      nonce: Number(o.nonce),
      accepted: o.accepted,
    });
  for (const addr of _eachMarketAddr()) {
    try {
      const market = await toolkit.contract.at(addr);
      const viewCaller = await getViewCaller(market, toolkit);
      const raw = await market.contractViews
        .onchain_offers_for_token({
          nft_contract: nftContract,
          token_id: Number(tokenId),
        })
        .executeView({ viewCaller });
      if (raw?.entries) {
        for (const [k, v] of raw.entries()) push(k, v);
      } else if (typeof raw === 'object') {
        Object.entries(raw).forEach(([k, v]) => push(k, v));
      }
    } catch {}
  }
  return offers;
}

// Fetch detailed information for a specific listing using the on‑chain view.
export async function fetchOnchainListingDetails({ toolkit, nftContract, tokenId, nonce }) {
  try { toolkit.addExtension?.(new Tzip16Module()); } catch {}
  for (const addr of _eachMarketAddr()) {
    try {
      const market = await toolkit.contract.at(addr);
      const viewCaller = await getViewCaller(market, toolkit);
      const raw = await market.contractViews
        .onchain_listing_details({
          listing_nonce: Number(nonce),
          nft_contract: nftContract,
          token_id: Number(tokenId),
        })
        .executeView({ viewCaller });
      return {
        contract: raw.nft_contract,
        tokenId: Number(raw.token_id),
        seller: raw.seller,
        priceMutez: Number(raw.price),
        amount: Number(raw.amount),
        active: raw.active,
        startTime: raw.start_time,
        saleSplits: raw.sale_splits,
        royaltySplits: raw.royalty_splits,
      };
    } catch {}
  }
  throw new Error('listing details unavailable');
}

// Fetch all listings made by a specific seller via the on‑chain view.
export async function fetchOnchainListingsForSeller({ toolkit, seller }) {
  try { toolkit.addExtension?.(new Tzip16Module()); } catch {}
  const out = [];
  for (const addr of _eachMarketAddr()) {
    try {
      const market = await toolkit.contract.at(addr);
      const viewCaller = await getViewCaller(market, toolkit);
      const raw = await market.contractViews
        .onchain_listings_for_seller(seller)
        .executeView({ viewCaller });
      if (Array.isArray(raw)) {
        out.push(
          ...raw.map((r) => ({
            contract: r.nft_contract,
            tokenId: Number(r.token_id),
            seller: r.seller,
            priceMutez: Number(r.price),
            amount: Number(r.amount),
            active: r.active,
            startTime: r.start_time,
            saleSplits: r.sale_splits,
            royaltySplits: r.royalty_splits,
          })),
        );
      }
    } catch {}
  }
  return out;
}

// Fetch all offers made by a specific buyer using the on‑chain view.
export async function fetchOnchainOffersForBuyer({ toolkit, buyer }) {
  try { toolkit.addExtension?.(new Tzip16Module()); } catch {}
  const out = [];
  for (const addr of _eachMarketAddr()) {
    try {
      const market = await toolkit.contract.at(addr);
      const viewCaller = await getViewCaller(market, toolkit);
      const raw = await market.contractViews
        .onchain_offers_for_buyer(buyer)
        .executeView({ viewCaller });
      if (Array.isArray(raw)) {
        out.push(
          ...raw.map((r) => ({
            offeror: r.offeror,
            priceMutez: Number(r.price),
            amount: Number(r.amount),
            nonce: Number(r.nonce),
            accepted: r.accepted,
          })),
        );
      }
    } catch {}
  }
  return out;
}

// Fetch all listings for an entire collection via the on‑chain view.
export async function fetchOnchainListingsForCollection({ toolkit, nftContract }) {
  try { toolkit.addExtension?.(new Tzip16Module()); } catch {}
  const out = [];
  for (const addr of _eachMarketAddr()) {
    try {
      const market = await toolkit.contract.at(addr);
      const viewCaller = await getViewCaller(market, toolkit);
      const raw = await market.contractViews
        .onchain_listings_for_collection({
          nft_contract: nftContract,
        })
        .executeView({ viewCaller });
      if (Array.isArray(raw)) {
        out.push(
          ...raw.map((r) => ({
            contract: r.nft_contract,
            tokenId: Number(r.token_id),
            seller: r.seller,
            priceMutez: Number(r.price),
            amount: Number(r.amount),
            active: r.active,
            startTime: r.start_time,
            saleSplits: r.sale_splits,
            royaltySplits: r.royalty_splits,
          })),
        );
      }
    } catch {}
  }
  return out;
}

// Fetch all offers made on an entire collection via the on‑chain view.
export async function fetchOnchainOffersForCollection({ toolkit, nftContract }) {
  try { toolkit.addExtension?.(new Tzip16Module()); } catch {}
  const out = [];
  for (const addr of _eachMarketAddr()) {
    try {
      const market = await toolkit.contract.at(addr);
      const viewCaller = await getViewCaller(market, toolkit);
      const raw = await market.contractViews
        .onchain_offers_for_collection({
          nft_contract: nftContract,
        })
        .executeView({ viewCaller });
      if (Array.isArray(raw)) {
        out.push(
          ...raw.map((r) => ({
            offeror: r.offeror,
            priceMutez: Number(r.price),
            amount: Number(r.amount),
            nonce: Number(r.nonce),
            accepted: r.accepted,
          })),
        );
      }
    } catch {}
  }
  return out;
}

/*─────────────────────────────────────────────────────────────
  Param‑builder helpers for wallet.batch() transactions
─────────────────────────────────────────────────────────────*/

// Build parameters for a buy operation.
export async function buildBuyParams(toolkit, { nftContract, tokenId, priceMutez, seller, nonce, amount = 1 }) {
  const c = await getMarketContract(toolkit);
  let transferParams;
  // Prefer the named‑argument API when available.  Fallback to
  // positional arguments on older Taquito versions or when
  // methodsObject is undefined.  Use bracket lookup to handle
  // potential name mangling by decorators.
  let objFn = c.methodsObject?.buy || c.methodsObject?.['buy'];
  let posFn = c.methods?.buy || c.methods?.['buy'];
  if (typeof objFn !== 'function' && typeof posFn !== 'function') {
    // Fallback: search for an entrypoint containing both "buy" and "token" or just "buy".
    const findKey = (keys) => {
      return keys.find((k) => {
        const cleaned = k.toLowerCase().replace(/_/g, '');
        // match buy or buytoken or tokenbuy etc.
        return cleaned.includes('buy');
      });
    };
    const objKeys = c.methodsObject ? Object.keys(c.methodsObject) : [];
    const methKeys = c.methods ? Object.keys(c.methods) : [];
    const foundObj = findKey(objKeys);
    const foundPos = findKey(methKeys);
    if (!objFn && foundObj && typeof c.methodsObject?.[foundObj] === 'function') {
      objFn = c.methodsObject[foundObj];
    }
    if (!posFn && foundPos && typeof c.methods?.[foundPos] === 'function') {
      posFn = c.methods[foundPos];
    }
  }
  if (typeof objFn === 'function') {
    transferParams = objFn({
      amount: Number(amount),
      nft_contract: nftContract,
      nonce: Number(nonce),
      seller,
      token_id: Number(tokenId),
    }).toTransferParams({ amount: priceMutez, mutez: true });
  } else if (typeof posFn === 'function') {
    transferParams = posFn(
      Number(amount),
      nftContract,
      Number(nonce),
      seller,
      Number(tokenId),
    ).toTransferParams({ amount: priceMutez, mutez: true });
  } else {
    throw new Error('buy entrypoint unavailable on marketplace contract');
  }
  return [
    {
      kind: OpKind.TRANSACTION,
      ...transferParams,
    },
  ];
}

// Build parameters for listing a token for sale.
export async function buildListParams(
  toolkit,
  {
    nftContract,
    tokenId,
    priceMutez,
    amount = 1,
    saleSplits = [],
    royaltySplits = [],
    startDelay = 0,
    offline_balance = false,
  },
) {
  // Retrieve the marketplace contract.  This returns a WalletContract
  // instance via getMarketContract() so that .send() can be invoked on
  // contract methods.  Some Taquito versions may omit methodsObject on
  // WalletContracts; fallback logic below handles both named and
  // positional APIs accordingly.
  const c = await getMarketContract(toolkit);
  const amt = Number(amount);
  const tokId = Number(tokenId);
  const delay = Number(startDelay);
  // Prefer the named‑argument API when available.  Some versions of
  // Taquito expose entrypoints under methodsObject; if absent fall
  // back to methods with positional arguments.  The list_token
  // entrypoint has the following Micheline signature:
  // (nat %amount)
  // (pair (address %nft_contract)
  //       (pair (mutez %price)
  //             (pair (bool %offline_balance)
  //                   (pair (list %royalty_splits (pair address nat))
  //                         (pair (list %sale_splits (pair address nat))
  //                               (pair (int %start_delay) (nat %token_id)))))))
  let transferParams;
  // Use bracket lookup to handle potential name mangling by decorators.
  let objFn = c.methodsObject?.list_token || c.methodsObject?.['list_token'];
  let posFn = c.methods?.list_token || c.methods?.['list_token'];
  // If both functions are undefined, attempt to locate an entrypoint
  // whose name contains both "list" and "token" (case‑insensitive,
  // ignoring underscores).  This fallback supports contracts where
  // decorators rename entrypoints or remove underscores.
  if (typeof objFn !== 'function' && typeof posFn !== 'function') {
    const findKey = (keys) => {
      return keys.find((k) => {
        const cleaned = k.toLowerCase().replace(/_/g, '');
        return cleaned.includes('list') && cleaned.includes('token');
      });
    };
    const objKeys = c.methodsObject ? Object.keys(c.methodsObject) : [];
    const methKeys = c.methods ? Object.keys(c.methods) : [];
    const foundObj = findKey(objKeys);
    const foundPos = findKey(methKeys);
    if (!objFn && foundObj && typeof c.methodsObject?.[foundObj] === 'function') {
      objFn = c.methodsObject[foundObj];
    }
    if (!posFn && foundPos && typeof c.methods?.[foundPos] === 'function') {
      posFn = c.methods[foundPos];
    }
  }
  if (typeof objFn === 'function') {
    transferParams = objFn({
      amount: amt,
      nft_contract: nftContract,
      price: priceMutez,
      offline_balance,
      // The contract parameter order expects royalty_splits first
      // followed by sale_splits.  Passing both explicitly avoids
      // misalignment when Taquito generates positional arguments.
      royalty_splits: royaltySplits,
      sale_splits: saleSplits,
      start_delay: delay,
      token_id: tokId,
    }).toTransferParams();
  } else if (typeof posFn === 'function') {
    transferParams = posFn(
      amt,
      nftContract,
      priceMutez,
      offline_balance,
      royaltySplits,
      saleSplits,
      delay,
      tokId,
    ).toTransferParams();
  } else {
    throw new Error('list_token entrypoint unavailable on marketplace contract');
  }
  return [
    {
      kind: OpKind.TRANSACTION,
      ...transferParams,
    },
  ];
}

// Build parameters for cancelling a listing.
export async function buildCancelParams(toolkit, { nftContract, tokenId, listingNonce }) {
  const c = await getMarketContract(toolkit);
  let transferParams;
  let objFn = c.methodsObject?.cancel_listing || c.methodsObject?.['cancel_listing'];
  let posFn = c.methods?.cancel_listing || c.methods?.['cancel_listing'];
  if (typeof objFn !== 'function' && typeof posFn !== 'function') {
    const findKey = (keys) => {
      return keys.find((k) => {
        const cleaned = k.toLowerCase().replace(/_/g, '');
        return cleaned.includes('cancel') && cleaned.includes('listing');
      });
    };
    const objKeys = c.methodsObject ? Object.keys(c.methodsObject) : [];
    const methKeys = c.methods ? Object.keys(c.methods) : [];
    const foundObj = findKey(objKeys);
    const foundPos = findKey(methKeys);
    if (!objFn && foundObj && typeof c.methodsObject?.[foundObj] === 'function') {
      objFn = c.methodsObject[foundObj];
    }
    if (!posFn && foundPos && typeof c.methods?.[foundPos] === 'function') {
      posFn = c.methods[foundPos];
    }
  }
  if (typeof objFn === 'function') {
    transferParams = objFn({
      listing_nonce: Number(listingNonce),
      nft_contract: nftContract,
      token_id: Number(tokenId),
    }).toTransferParams();
  } else if (typeof posFn === 'function') {
    transferParams = posFn(Number(listingNonce), nftContract, Number(tokenId)).toTransferParams();
  } else {
    throw new Error('cancel_listing entrypoint unavailable on marketplace contract');
  }
  return [
    {
      kind: OpKind.TRANSACTION,
      ...transferParams,
    },
  ];
}

// Build parameters for accepting an offer.
export async function buildAcceptOfferParams(toolkit, { nftContract, tokenId, amount = 1, listingNonce, offeror }) {
  const c = await getMarketContract(toolkit);
  let transferParams;
  let objFn = c.methodsObject?.accept_offer || c.methodsObject?.['accept_offer'];
  let posFn = c.methods?.accept_offer || c.methods?.['accept_offer'];
  if (typeof objFn !== 'function' && typeof posFn !== 'function') {
    const findKey = (keys) => {
      return keys.find((k) => {
        const cleaned = k.toLowerCase().replace(/_/g, '');
        return cleaned.includes('accept') && cleaned.includes('offer');
      });
    };
    const objKeys = c.methodsObject ? Object.keys(c.methodsObject) : [];
    const methKeys = c.methods ? Object.keys(c.methods) : [];
    const foundObj = findKey(objKeys);
    const foundPos = findKey(methKeys);
    if (!objFn && foundObj && typeof c.methodsObject?.[foundObj] === 'function') {
      objFn = c.methodsObject[foundObj];
    }
    if (!posFn && foundPos && typeof c.methods?.[foundPos] === 'function') {
      posFn = c.methods[foundPos];
    }
  }
  if (typeof objFn === 'function') {
    transferParams = objFn({
      amount: Number(amount),
      listing_nonce: Number(listingNonce),
      nft_contract: nftContract,
      offeror,
      token_id: Number(tokenId),
    }).toTransferParams();
  } else if (typeof posFn === 'function') {
    transferParams = posFn(
      Number(amount),
      Number(listingNonce),
      nftContract,
      offeror,
      Number(tokenId),
    ).toTransferParams();
  } else {
    throw new Error('accept_offer entrypoint unavailable on marketplace contract');
  }
  return [
    {
      kind: OpKind.TRANSACTION,
      ...transferParams,
    },
  ];
}

// Build parameters for making an offer.
export async function buildOfferParams(toolkit, { nftContract, tokenId, priceMutez, amount = 1 }) {
  const c = await getMarketContract(toolkit);
  let transferParams;
  let objFn = c.methodsObject?.make_offer || c.methodsObject?.['make_offer'];
  let posFn = c.methods?.make_offer || c.methods?.['make_offer'];
  if (typeof objFn !== 'function' && typeof posFn !== 'function') {
    const findKey = (keys) => {
      return keys.find((k) => {
        const cleaned = k.toLowerCase().replace(/_/g, '');
        return cleaned.includes('make') && cleaned.includes('offer');
      });
    };
    const objKeys = c.methodsObject ? Object.keys(c.methodsObject) : [];
    const methKeys = c.methods ? Object.keys(c.methods) : [];
    const foundObj = findKey(objKeys);
    const foundPos = findKey(methKeys);
    if (!objFn && foundObj && typeof c.methodsObject?.[foundObj] === 'function') {
      objFn = c.methodsObject[foundObj];
    }
    if (!posFn && foundPos && typeof c.methods?.[foundPos] === 'function') {
      posFn = c.methods[foundPos];
    }
  }
  if (typeof objFn === 'function') {
    transferParams = objFn({
      amount: Number(amount),
      nft_contract: nftContract,
      price: priceMutez,
      token_id: Number(tokenId),
    }).toTransferParams();
  } else if (typeof posFn === 'function') {
    transferParams = posFn(
      Number(amount),
      nftContract,
      priceMutez,
      Number(tokenId),
    ).toTransferParams();
  } else {
    throw new Error('make_offer entrypoint unavailable on marketplace contract');
  }
  return [
    {
      kind: OpKind.TRANSACTION,
      ...transferParams,
    },
  ];
}

/* What changed & why: corrected positional list_token argument order so
   price precedes offline_balance, preventing ParametersInvalidBeaconError
   and ensuring v2a listings succeed with the offline balance flag. */