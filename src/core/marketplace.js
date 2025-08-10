/*─────────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/marketplace.js
  Rev :    r930    2025‑08‑07
  Summary: v2a listing support — buildListParams now understands an
           optional offline_balance flag required by the new ZeroSum
           contract when listing v2a tokens (broken balance_of).
           Tries object and positional signatures, falling back
           safely to legacy shapes. Keep all other behaviour intact.
──────────────────────────────────────────────────────────────────*/

import { OpKind } from '@taquito/taquito';
import { Tzip16Module } from '@taquito/tzip16';
import { NETWORK_KEY, MARKETPLACE_ADDRESSES, MARKETPLACE_ADDRESS } from '../config/deployTarget.js';

/*──────── Marketplace address resolver ───────────────────────*/
export const marketplaceAddr = (net = NETWORK_KEY) => {
  const key = /mainnet/i.test(net) ? 'mainnet' : 'ghostnet';
  return MARKETPLACE_ADDRESSES[key] || MARKETPLACE_ADDRESSES.ghostnet;
};

/**
 * Get the ZeroSum marketplace contract handle.
 * Returns a Contract (toolkit.contract.at) so methodsObject/methods &
 * contractViews are preserved. TZIP‑16 extension is registered.
 */
export async function getMarketContract(toolkit) {
  const addr = MARKETPLACE_ADDRESS || marketplaceAddr(NETWORK_KEY);
  try {
    toolkit.addExtension?.(new Tzip16Module());
  } catch {
    /* ignore double‑registration */
  }
  return toolkit.contract.at(addr);
}

/*─────────────────────────────────────────────────────────────
  Off‑chain & on‑chain views (unchanged behaviour)
─────────────────────────────────────────────────────────────*/

export async function fetchListings({ toolkit, nftContract, tokenId }) {
  try {
    const results = await fetchOnchainListings({ toolkit, nftContract, tokenId });
    return Array.isArray(results) ? results : [];
  } catch {
    return [];
  }
}

export async function fetchLowestListing({ toolkit, nftContract, tokenId }) {
  let list = [];
  try {
    list = await fetchOnchainListings({ toolkit, nftContract, tokenId });
  } catch {
    /* ignore */
  }
  if (!list?.length) {
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

export async function fetchOffers({ toolkit, nftContract, tokenId }) {
  try {
    const results = await fetchOnchainOffers({ toolkit, nftContract, tokenId });
    return Array.isArray(results) ? results : [];
  } catch {
    return [];
  }
}

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

/*──────── On‑chain views — unchanged ─────────────────────────*/
async function getViewCaller(market, toolkit) {
  try {
    const pkh = await toolkit.signer.publicKeyHash();
    if (typeof pkh === 'string' && pkh.startsWith('tz')) return pkh;
  } catch {
    /* ignore */
  }
  return market.address;
}

export async function fetchOnchainListings({ toolkit, nftContract, tokenId }) {
  const market = await getMarketContract(toolkit);
  const viewCaller = await getViewCaller(market, toolkit);
  const raw = await market.contractViews
    .onchain_listings_for_token({
      nft_contract: nftContract,
      token_id: Number(tokenId),
    })
    .executeView({ viewCaller });

  const out = [];
  const push = (n, o) =>
    out.push({
      nonce: Number(n),
      priceMutez: Number(o.price),
      amount: Number(o.amount),
      seller: o.seller,
      active: o.active,
    });

  if (raw?.entries) {
    for (const [k, v] of raw.entries()) push(k, v);
  } else if (raw && typeof raw === 'object') {
    Object.entries(raw).forEach(([k, v]) => push(k, v));
  }
  return out;
}

export async function fetchOnchainOffers({ toolkit, nftContract, tokenId }) {
  const market = await getMarketContract(toolkit);
  const viewCaller = await getViewCaller(market, toolkit);
  const raw = await market.contractViews
    .onchain_offers_for_token({
      nft_contract: nftContract,
      token_id: Number(tokenId),
    })
    .executeView({ viewCaller });
  const offers = [];
  const push = (k, o) =>
    offers.push({
      offeror: k,
      priceMutez: Number(o.price),
      amount: Number(o.amount),
      nonce: Number(o.nonce),
      accepted: o.accepted,
    });
  if (raw?.entries) {
    for (const [k, v] of raw.entries()) push(k, v);
  } else if (raw && typeof raw === 'object') {
    Object.entries(raw).forEach(([k, v]) => push(k, v));
  }
  return offers;
}

export async function fetchOnchainListingDetails({ toolkit, nftContract, tokenId, nonce }) {
  const market = await getMarketContract(toolkit);
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
}

export async function fetchOnchainListingsForSeller({ toolkit, seller }) {
  const market = await getMarketContract(toolkit);
  const viewCaller = await getViewCaller(market, toolkit);
  const raw = await market.contractViews.onchain_listings_for_seller(seller).executeView({ viewCaller });
  return Array.isArray(raw)
    ? raw.map((r) => ({
        contract: r.nft_contract,
        tokenId: Number(r.token_id),
        seller: r.seller,
        priceMutez: Number(r.price),
        amount: Number(r.amount),
        active: r.active,
        startTime: r.start_time,
        saleSplits: r.sale_splits,
        royaltySplits: r.royalty_splits,
      }))
    : [];
}

export async function fetchOnchainOffersForBuyer({ toolkit, buyer }) {
  const market = await getMarketContract(toolkit);
  const viewCaller = await getViewCaller(market, toolkit);
  const raw = await market.contractViews.onchain_offers_for_buyer(buyer).executeView({ viewCaller });
  return Array.isArray(raw)
    ? raw.map((r) => ({
        offeror: r.offeror,
        priceMutez: Number(r.price),
        amount: Number(r.amount),
        nonce: Number(r.nonce),
        accepted: r.accepted,
      }))
    : [];
}

export async function fetchOnchainListingsForCollection({ toolkit, nftContract }) {
  const market = await getMarketContract(toolkit);
  const viewCaller = await getViewCaller(market, toolkit);
  const raw = await market.contractViews
    .onchain_listings_for_collection({
      nft_contract: nftContract,
    })
    .executeView({ viewCaller });
  return Array.isArray(raw)
    ? raw.map((r) => ({
        contract: r.nft_contract,
        tokenId: Number(r.token_id),
        seller: r.seller,
        priceMutez: Number(r.price),
        amount: Number(r.amount),
        active: r.active,
        startTime: r.start_time,
        saleSplits: r.sale_splits,
        royaltySplits: r.royalty_splits,
      }))
    : [];
}

export async function fetchOnchainOffersForCollection({ toolkit, nftContract }) {
  const market = await getMarketContract(toolkit);
  const viewCaller = await getViewCaller(market, toolkit);
  const raw = await market.contractViews
    .onchain_offers_for_collection({
      nft_contract: nftContract,
    })
    .executeView({ viewCaller });
  return Array.isArray(raw)
    ? raw.map((r) => ({
        offeror: r.offeror,
        priceMutez: Number(r.price),
        amount: Number(r.amount),
        nonce: Number(r.nonce),
        accepted: r.accepted,
      }))
    : [];
}

/*─────────────────────────────────────────────────────────────
  Param‑builder helpers for wallet.batch() transactions
─────────────────────────────────────────────────────────────*/

export async function buildBuyParams(toolkit, { nftContract, tokenId, priceMutez, seller, nonce, amount = 1 }) {
  const c = await getMarketContract(toolkit);
  let transferParams;

  let objFn = c.methodsObject?.buy || c.methodsObject?.['buy'];
  let posFn = c.methods?.buy || c.methods?.['buy'];

  if (typeof objFn !== 'function' && typeof posFn !== 'function') {
    const findKey = (keys) =>
      keys.find((k) => k.toLowerCase().replace(/_/g, '').includes('buy'));
    const objKeys = c.methodsObject ? Object.keys(c.methodsObject) : [];
    const methKeys = c.methods ? Object.keys(c.methods) : [];
    const foundObj = findKey(objKeys);
    const foundPos = findKey(methKeys);
    if (!objFn && foundObj && typeof c.methodsObject?.[foundObj] === 'function') objFn = c.methodsObject[foundObj];
    if (!posFn && foundPos && typeof c.methods?.[foundPos] === 'function') posFn = c.methods[foundPos];
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

  return [{ kind: OpKind.TRANSACTION, ...transferParams }];
}

/**
 * Build parameters for listing a token.
 * Supports both legacy signature and the new variant that includes
 * an `offline_balance` boolean (required for v2a listings).
 *
 * Named‑object keys (when supported by Taquito):
 *  {
 *    amount, nft_contract, price, royalty_splits, sale_splits,
 *    start_delay, token_id, [offline_balance]   ← optional
 *  }
 *
 * Positional (fallback) — we try in this order:
 *   1) amt, nft, price, royalty, sale, delay, tokenId
 *   2) amt, nft, price, offline, royalty, sale, delay, tokenId
 */
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
    offline_balance = false, // <— NEW
  },
) {
  const c = await getMarketContract(toolkit);
  const amt = Number(amount);
  const tokId = Number(tokenId);
  const delay = Number(startDelay);
  const price = Number(priceMutez);

  // Try named‑object first (most robust).
  const tryObject = () => {
    const base = {
      amount: amt,
      nft_contract: nftContract,
      price,
      royalty_splits: royaltySplits,
      sale_splits: saleSplits,
      start_delay: delay,
      token_id: tokId,
    };
    const withOffline = { ...base, offline_balance: true };
    // Attempt with offline flag first when requested; if the contract
    // rejects unknown key, we will fall back to base (no flag).
    if (offline_balance) {
      try {
        return (c.methodsObject?.list_token || c.methodsObject?.['list_token'])(withOffline).toTransferParams();
      } catch {
        // swallow and try without the flag
      }
    }
    return (c.methodsObject?.list_token || c.methodsObject?.['list_token'])(base).toTransferParams();
  };

  // Positional fallbacks
  const tryPositionalNoOffline = () =>
    (c.methods?.list_token || c.methods?.['list_token'])(
      amt,
      nftContract,
      price,
      royaltySplits,
      saleSplits,
      delay,
      tokId,
    ).toTransferParams();

  const tryPositionalWithOffline = () =>
    (c.methods?.list_token || c.methods?.['list_token'])(
      amt,
      nftContract,
      price,
      true, // offline_balance
      royaltySplits,
      saleSplits,
      delay,
      tokId,
    ).toTransferParams();

  let transferParams;

  // Select callable shape
  const hasObject = typeof (c.methodsObject?.list_token || c.methodsObject?.['list_token']) === 'function';
  const hasPositional = typeof (c.methods?.list_token || c.methods?.['list_token']) === 'function';

  if (!hasObject && !hasPositional) {
    // Fallback: try to discover a mangled entrypoint like listtoken
    const findKey = (keys) =>
      keys.find((k) => {
        const cleaned = k.toLowerCase().replace(/_/g, '');
        return cleaned.includes('list') && cleaned.includes('token');
      });
    const objK = c.methodsObject ? findKey(Object.keys(c.methodsObject)) : null;
    const metK = c.methods ? findKey(Object.keys(c.methods)) : null;
    if (objK && typeof c.methodsObject[objK] === 'function') {
      c.methodsObject.list_token = c.methodsObject[objK];
    }
    if (metK && typeof c.methods[metK] === 'function') {
      c.methods.list_token = c.methods[metK];
    }
  }

  // Attempt in robust order
  try {
    if (hasObject) {
      transferParams = tryObject();
    } else if (offline_balance) {
      try {
        transferParams = tryPositionalWithOffline();
      } catch {
        transferParams = tryPositionalNoOffline();
      }
    } else {
      transferParams = tryPositionalNoOffline();
    }
  } catch (e) {
    // Last‑ditch: invert royalty/sale order if a decorator changed arg order.
    try {
      transferParams = (c.methods?.list_token || c.methods?.['list_token'])(
        amt,
        nftContract,
        price,
        saleSplits,
        royaltySplits,
        delay,
        tokId,
      ).toTransferParams();
    } catch {
      throw new Error(`list_token entrypoint unavailable or signature mismatch: ${e?.message || e}`);
    }
  }

  return [{ kind: OpKind.TRANSACTION, ...transferParams }];
}

export async function buildCancelParams(toolkit, { nftContract, tokenId, listingNonce }) {
  const c = await getMarketContract(toolkit);
  let transferParams;
  let objFn = c.methodsObject?.cancel_listing || c.methodsObject?.['cancel_listing'];
  let posFn = c.methods?.cancel_listing || c.methods?.['cancel_listing'];
  if (typeof objFn !== 'function' && typeof posFn !== 'function') {
    const findKey = (keys) =>
      keys.find((k) => k.toLowerCase().replace(/_/g, '').includes('cancellisting'));
    const objKeys = c.methodsObject ? Object.keys(c.methodsObject) : [];
    const methKeys = c.methods ? Object.keys(c.methods) : [];
    const foundObj = findKey(objKeys);
    const foundPos = findKey(methKeys);
    if (!objFn && foundObj && typeof c.methodsObject?.[foundObj] === 'function') objFn = c.methodsObject[foundObj];
    if (!posFn && foundPos && typeof c.methods?.[foundPos] === 'function') posFn = c.methods[foundPos];
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
  return [{ kind: OpKind.TRANSACTION, ...transferParams }];
}

export async function buildAcceptOfferParams(toolkit, { nftContract, tokenId, amount = 1, listingNonce, offeror }) {
  const c = await getMarketContract(toolkit);
  let transferParams;
  let objFn = c.methodsObject?.accept_offer || c.methodsObject?.['accept_offer'];
  let posFn = c.methods?.accept_offer || c.methods?.['accept_offer'];
  if (typeof objFn !== 'function' && typeof posFn !== 'function') {
    const findKey = (keys) =>
      keys.find((k) => k.toLowerCase().replace(/_/g, '').includes('acceptoffer'));
    const objKeys = c.methodsObject ? Object.keys(c.methodsObject) : [];
    const methKeys = c.methods ? Object.keys(c.methods) : [];
    const foundObj = findKey(objKeys);
    const foundPos = findKey(methKeys);
    if (!objFn && foundObj && typeof c.methodsObject?.[foundObj] === 'function') objFn = c.methodsObject[foundObj];
    if (!posFn && foundPos && typeof c.methods?.[foundPos] === 'function') posFn = c.methods[foundPos];
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
  return [{ kind: OpKind.TRANSACTION, ...transferParams }];
}

export async function buildOfferParams(toolkit, { nftContract, tokenId, priceMutez, amount = 1 }) {
  const c = await getMarketContract(toolkit);
  let transferParams;
  let objFn = c.methodsObject?.make_offer || c.methodsObject?.['make_offer'];
  let posFn = c.methods?.make_offer || c.methods?.['make_offer'];
  if (typeof objFn !== 'function' && typeof posFn !== 'function') {
    const findKey = (keys) =>
      keys.find((k) => k.toLowerCase().replace(/_/g, '').includes('makeoffer'));
    const objKeys = c.methodsObject ? Object.keys(c.methodsObject) : [];
    const methKeys = c.methods ? Object.keys(c.methods) : [];
    const foundObj = findKey(objKeys);
    const foundPos = findKey(methKeys);
    if (!objFn && foundObj && typeof c.methodsObject?.[foundObj] === 'function') objFn = c.methodsObject[foundObj];
    if (!posFn && foundPos && typeof c.methods?.[foundPos] === 'function') posFn = c.methods[foundPos];
  }
  if (typeof objFn === 'function') {
    transferParams = objFn({
      amount: Number(amount),
      nft_contract: nftContract,
      price: Number(priceMutez),
      token_id: Number(tokenId),
    }).toTransferParams();
  } else if (typeof posFn === 'function') {
    transferParams = posFn(
      Number(amount),
      nftContract,
      Number(priceMutez),
      Number(tokenId),
    ).toTransferParams();
  } else {
    throw new Error('make_offer entrypoint unavailable on marketplace contract');
  }
  return [{ kind: OpKind.TRANSACTION, ...transferParams }];
}

/* What changed & why: Added offline_balance support in buildListParams,
   robustly trying object and positional signatures to preserve behaviour
   across marketplace builds. Kept all other logic intact. */
