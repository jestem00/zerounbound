/*Developed by @jams2blues
  File: src/core/marketplace.js
  Rev:  r980
  Summary: Fix syntax, correct TzKT queries (no 400s), add
           batch stale‑listing filter + caching; integrate into
           lowest‑listing; export robust balance helpers. */

import { OpKind } from '@taquito/taquito';
import { Tzip16Module } from '@taquito/tzip16';
import {
  NETWORK_KEY,
  MARKETPLACE_ADDRESSES,
  MARKETPLACE_ADDRESS,
  TZKT_API,
} from '../config/deployTarget.js';
import { jFetch } from './net.js';

/*─────────────────────────────
  Marketplace address resolver
──────────────────────────────*/
export const marketplaceAddr = (net = NETWORK_KEY) => {
  const key = /mainnet/i.test(net) ? 'mainnet' : 'ghostnet';
  return MARKETPLACE_ADDRESSES[key] || MARKETPLACE_ADDRESSES.ghostnet;
};

/*─────────────────────────────
  Contract handle (+TZIP‑16)
──────────────────────────────*/
export async function getMarketContract(toolkit) {
  const addr = MARKETPLACE_ADDRESS || marketplaceAddr(NETWORK_KEY);
  try { toolkit.addExtension?.(new Tzip16Module()); } catch { /* already added */ }
  return toolkit.contract.at(addr);
}

/*─────────────────────────────
  Helpers: TzKT base + caching
──────────────────────────────*/
const TZKT_BASE = String(TZKT_API || 'https://api.tzkt.io').replace(/\/+$/, '');
const now = () => Date.now();
const SELLER_BAL_TTL = 30_000; // 30s cache per (seller,contract,token)
const sellerBalCache = new Map(); // key -> { at, balance }

const cacheKey = (a, c, t) => `${a}|${c}|${t}`;

function readCache(a, c, t) {
  const k = cacheKey(a, c, t);
  const hit = sellerBalCache.get(k);
  if (hit && now() - hit.at < SELLER_BAL_TTL) return hit.balance;
  return null;
}
function writeCache(a, c, t, balance) {
  sellerBalCache.set(cacheKey(a, c, t), { at: now(), balance: Number(balance || 0) });
}

/*─────────────────────────────────────────────────────────────
  Off‑chain & on‑chain views (existing behaviour maintained)
──────────────────────────────────────────────────────────────*/
export async function fetchListings({ toolkit, nftContract, tokenId }) {
  try {
    const results = await fetchOnchainListings({ toolkit, nftContract, tokenId });
    return Array.isArray(results) ? results : [];
  } catch { return []; }
}

/**
 * Lowest active listing with optional stale‑filter (seller must still
 * own >= amount). Keeps behaviour stable if staleCheck=false.
 */
export async function fetchLowestListing({
  toolkit,
  nftContract,
  tokenId,
  staleCheck = true,
}) {
  let list = [];
  try { list = await fetchOnchainListings({ toolkit, nftContract, tokenId }); } catch {}
  if (!list?.length) return null;

  let act = list.filter((l) => l.active && Number(l.amount) > 0);

  if (staleCheck && act.length) {
    const checked = await filterStaleListings(toolkit, act.map((l) => ({
      nftContract, tokenId, seller: l.seller, amount: l.amount, __src: l,
    }))).catch(() => act);
    // filterStaleListings returns original listing objects via __src
    if (Array.isArray(checked) && checked.length) {
      act = checked.map((x) => x.__src || x);
    } else {
      // If check failed, keep original list to avoid false negatives.
    }
  }

  if (!act.length) return null;
  return act.reduce((m, c) => (c.priceMutez < m.priceMutez ? c : m));
}

export async function fetchOffers({ toolkit, nftContract, tokenId }) {
  try {
    const results = await fetchOnchainOffers({ toolkit, nftContract, tokenId });
    return Array.isArray(results) ? results : [];
  } catch { return []; }
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

/*──────── On‑chain views (unchanged API shape) ─────────────────*/
async function getViewCaller(market, toolkit) {
  try {
    const pkh = await toolkit.signer.publicKeyHash();
    if (typeof pkh === 'string' && /^tz/i.test(pkh)) return pkh;
  } catch { /* ignore */ }
  return market.address;
}

export async function fetchOnchainListings({ toolkit, nftContract, tokenId }) {
  const market = await getMarketContract(toolkit);
  const viewCaller = await getViewCaller(market, toolkit);
  const raw = await market.contractViews
    .onchain_listings_for_token({ nft_contract: nftContract, token_id: Number(tokenId) })
    .executeView({ viewCaller });

  const out = [];
  const push = (n, o) => out.push({
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
    .onchain_offers_for_token({ nft_contract: nftContract, token_id: Number(tokenId) })
    .executeView({ viewCaller });

  const offers = [];
  const push = (k, o) => offers.push({
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
  const raw = await market.contractViews
    .onchain_listings_for_seller(seller)
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

export async function fetchOnchainOffersForBuyer({ toolkit, buyer }) {
  const market = await getMarketContract(toolkit);
  const viewCaller = await getViewCaller(market, toolkit);
  const raw = await market.contractViews
    .onchain_offers_for_buyer(buyer)
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

export async function fetchOnchainListingsForCollection({ toolkit, nftContract }) {
  const market = await getMarketContract(toolkit);
  const viewCaller = await getViewCaller(market, toolkit);
  const raw = await market.contractViews
    .onchain_listings_for_collection({ nft_contract: nftContract })
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
    .onchain_offers_for_collection({ nft_contract: nftContract })
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
──────────────────────────────────────────────────────────────*/
export async function buildBuyParams(
  toolkit,
  { nftContract, tokenId, priceMutez, seller, nonce, amount = 1 },
) {
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
    }).toTransferParams({ amount: Number(priceMutez), mutez: true });
  } else if (typeof posFn === 'function') {
    transferParams = posFn(
      Number(amount),
      nftContract,
      Number(nonce),
      seller,
      Number(tokenId),
    ).toTransferParams({ amount: Number(priceMutez), mutez: true });
  } else {
    throw new Error('buy entrypoint unavailable on marketplace contract');
  }

  return [{ kind: OpKind.TRANSACTION, ...transferParams }];
}

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
  const c = await getMarketContract(toolkit);
  const amt = Number(amount);
  const tokId = Number(tokenId);
  const delay = Number(startDelay);
  const price = Number(priceMutez);

  const getObjMeth = () => c.methodsObject?.list_token || c.methodsObject?.['list_token'];
  const getPosMeth = () => c.methods?.list_token || c.methods?.['list_token'];

  // try resolve by fuzzy name if missing
  let objMeth = getObjMeth();
  let posMeth = getPosMeth();
  if (typeof objMeth !== 'function' && typeof posMeth !== 'function') {
    const pick = (keys) =>
      keys.find((k) => k.toLowerCase().replace(/_/g, '').includes('listtoken'));
    const ok = c.methodsObject ? pick(Object.keys(c.methodsObject)) : null;
    const pk = c.methods ? pick(Object.keys(c.methods)) : null;
    if (ok && typeof c.methodsObject[ok] === 'function') objMeth = c.methodsObject[ok];
    if (pk && typeof c.methods[pk] === 'function') posMeth = c.methods[pk];
  }

  let transferParams;

  if (typeof objMeth === 'function') {
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
    try {
      transferParams = (offline_balance ? objMeth(withOffline) : objMeth(base)).toTransferParams();
    } catch {
      // fall back to positional if object shape mismatch
    }
  }

  if (!transferParams && typeof posMeth === 'function') {
    try {
      // Prefer signature with offline flag if requested
      transferParams = (offline_balance
        ? posMeth(amt, nftContract, price, true, royaltySplits, saleSplits, delay, tokId)
        : posMeth(amt, nftContract, price, royaltySplits, saleSplits, delay, tokId)
      ).toTransferParams();
    } catch (e) {
      // try legacy order (sale, royalty) if any contracts still use it
      try {
        transferParams = posMeth(
          amt, nftContract, price, saleSplits, royaltySplits, delay, tokId,
        ).toTransferParams();
      } catch {
        throw new Error(`list_token entrypoint unavailable or signature mismatch: ${e?.message || e}`);
      }
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
    const pick = (keys) =>
      keys.find((k) => k.toLowerCase().replace(/_/g, '').includes('cancellisting'));
    const ok = c.methodsObject ? pick(Object.keys(c.methodsObject)) : null;
    const pk = c.methods ? pick(Object.keys(c.methods)) : null;
    if (ok && typeof c.methodsObject[ok] === 'function') objFn = c.methodsObject[ok];
    if (pk && typeof c.methods[pk] === 'function') posFn = c.methods[pk];
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

export async function buildAcceptOfferParams(
  toolkit,
  { nftContract, tokenId, amount = 1, listingNonce, offeror },
) {
  const c = await getMarketContract(toolkit);
  let transferParams;

  let objFn = c.methodsObject?.accept_offer || c.methodsObject?.['accept_offer'];
  let posFn = c.methods?.accept_offer || c.methods?.['accept_offer'];
  if (typeof objFn !== 'function' && typeof posFn !== 'function') {
    const pick = (keys) =>
      keys.find((k) => k.toLowerCase().replace(/_/g, '').includes('acceptoffer'));
    const ok = c.methodsObject ? pick(Object.keys(c.methodsObject)) : null;
    const pk = c.methods ? pick(Object.keys(c.methods)) : null;
    if (ok && typeof c.methodsObject[ok] === 'function') objFn = c.methodsObject[ok];
    if (pk && typeof c.methods[pk] === 'function') posFn = c.methods[pk];
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
    const pick = (keys) =>
      keys.find((k) => k.toLowerCase().replace(/_/g, '').includes('makeoffer'));
    const ok = c.methodsObject ? pick(Object.keys(c.methodsObject)) : null;
    const pk = c.methods ? pick(Object.keys(c.methods)) : null;
    if (ok && typeof c.methodsObject[ok] === 'function') objFn = c.methodsObject[ok];
    if (pk && typeof c.methods[pk] === 'function') posFn = c.methods[pk];
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

/*─────────────────────────────────────────────────────────────
  STALE‑LISTING GUARDS (TzKT‑backed; avoid 400s)
──────────────────────────────────────────────────────────────*/

/**
 * Single‑account FA2 balance via TzKT.
 * Uses projection to one column only (no nested dot fields).
 */
export async function getFa2BalanceViaTzkt(account, nftContract, tokenId) {
  const cached = readCache(account, nftContract, tokenId);
  if (cached != null) return cached;

  const qs = new URLSearchParams({
    account,
    'token.contract': nftContract,
    'token.tokenId': String(tokenId),
    select: 'balance',
    limit: '1',
  });
  const url = `${TZKT_BASE}/v1/tokens/balances?${qs.toString()}`;
  try {
    const rows = await jFetch(url, 1);
    const first = Array.isArray(rows) && rows.length ? rows[0] : 0;
    const n = Number(first || 0);
    const bal = Number.isFinite(n) ? n : 0;
    writeCache(account, nftContract, tokenId, bal);
    return bal;
  } catch {
    // If TzKT is unreachable, treat as 0 to be safe for "stale" checks in UI,
    // but DO NOT block chain tx (preflightBuy distinguishes).
    writeCache(account, nftContract, tokenId, 0);
    return 0;
  }
}

/**
 * Batch balances for multiple sellers of the same token.
 * Avoids invalid projections: no "account.address" (prevents 400).
 */
export async function getFa2BalancesForAccounts(accounts, nftContract, tokenId) {
  const need = [];
  const out = new Map();

  for (const a of accounts) {
    const hit = readCache(a, nftContract, tokenId);
    if (hit != null) out.set(a, hit);
    else need.push(a);
  }
  if (!need.length) return out;

  // Chunk to respect URL size & rate limiting
  const CHUNK = 50;
  for (let i = 0; i < need.length; i += CHUNK) {
    const slice = need.slice(i, i + CHUNK);
    const qs = new URLSearchParams({
      'account.in': slice.join(','),
      'token.contract': nftContract,
      'token.tokenId': String(tokenId),
      limit: String(slice.length),
    });
    const url = `${TZKT_BASE}/v1/tokens/balances?${qs.toString()}`;
    const rows = await jFetch(url, 1).catch(() => []);
    // Default shape includes { account: { address }, balance, ... }
    for (const r of rows || []) {
      const addr = r?.account?.address || r?.account;
      const bal = Number(r?.balance ?? 0);
      if (typeof addr === 'string') {
        out.set(addr, bal);
        writeCache(addr, nftContract, tokenId, bal);
      }
    }
    // fill zeros for not‑returned accounts
    for (const a of slice) if (!out.has(a)) { out.set(a, 0); writeCache(a, nftContract, tokenId, 0); }
  }
  return out;
}

/**
 * Filter listings to those where seller still has >= `amount` balance.
 * Accepts an array of { nftContract, tokenId, seller, amount, __src? }.
 * Returns the *same array items* (not copies) for passing entries.
 */
export async function filterStaleListings(toolkit, listings) {
  // Group by (contract, tokenId) to batch seller checks
  const groups = new Map(); // key -> [items]
  for (const it of listings || []) {
    const kt = it.nftContract || it.contract;
    const id = Number(it.tokenId ?? it.token_id);
    const seller = it.seller;
    if (!kt || !Number.isFinite(id) || !seller) continue;
    const key = `${kt}|${id}`;
    const arr = groups.get(key) || [];
    arr.push({ kt, id, seller, amount: Number(it.amount ?? 1), ref: it });
    groups.set(key, arr);
  }

  const keep = [];
  for (const [key, arr] of groups) {
    const { kt, id } = arr[0];
    const sellers = [...new Set(arr.map((x) => x.seller))];
    const map = await getFa2BalancesForAccounts(sellers, kt, id);
    for (const row of arr) {
      const bal = Number(map.get(row.seller) || 0);
      if (bal >= row.amount) keep.push(row.ref);
    }
  }
  return keep;
}

/**
 * Pre‑flight guard used by Buy flows (surface helpful error early).
 */
export async function preflightBuy(toolkit, { nftContract, tokenId, seller, amount = 1 }) {
  const amt = Number(amount) || 1;
  if (!seller || !nftContract || tokenId == null) {
    const err = new Error('Missing listing details (seller/nonce/price).');
    err.code = 'MISSING_LISTING_DETAILS';
    throw err;
  }
  const bal = await getFa2BalanceViaTzkt(seller, nftContract, tokenId);
  if (bal < amt) {
    const err = new Error('Listing appears stale: seller has insufficient balance.');
    err.code = 'STALE_LISTING_NO_BALANCE';
    err.details = { seller, nftContract, tokenId, balance: bal, needed: amt };
    throw err;
  }
  return { ok: true, balance: bal };
}

/* What changed & why: Fixed stray parens causing TS1005; corrected TzKT
   queries (remove invalid account.address projection); added batch
   balance checks + caching and integrated stale‑filter into lowest
   listing. */
