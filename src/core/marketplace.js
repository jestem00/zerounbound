/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/marketplace.js
  Rev:     r988  2025‑08‑22
  Summary(of what this file does): Marketplace helpers — full API
           (listings/offers/details, buy/list/cancel/offer param
           builders, operator ensure), lowest‑listing with multi‑
           source fallback (on‑chain → off‑chain TZIP‑16 → TzKT
           big‑map), plus TzKT‑backed stale‑seller guards. Hardened
           TzKT fallbacks, safe addr guards, view‑caller resiliency,
           and network‑scoped caches. */
// NOTE: keep API shape stable; other modules rely on these exports.

import { OpKind } from '@taquito/taquito';
import { Tzip16Module, tzip16 } from '@taquito/tzip16';

import {
  NETWORK_KEY,
  MARKETPLACE_ADDRESSES,
  MARKETPLACE_ADDRESS,
  TZKT_API,
} from '../config/deployTarget.js';

import { jFetch } from './net.js';
import { tzktBase as tzktBaseForNet } from '../utils/tzkt.js';

/*──────────────── constants & helpers ────────────────*/
const RAW_TZKT = String(TZKT_API || 'https://api.tzkt.io').replace(/\/+$/, ''); // no /v1
const tzktV1 = (net = NETWORK_KEY) => {
  // Prefer project util (already ends with /v1). Fallback to RAW_TZKT + /v1.
  try {
    const b = tzktBaseForNet?.(net);
    if (typeof b === 'string' && /\/v1\/?$/.test(b)) return b.replace(/\/+$/, '');
  } catch { /* ignore */ }
  return `${RAW_TZKT}/v1`;
};

export const marketplaceAddr = (net = NETWORK_KEY) => {
  const key = /mainnet/i.test(String(net)) ? 'mainnet' : 'ghostnet';
  return (MARKETPLACE_ADDRESSES?.[key] || MARKETPLACE_ADDRESSES?.ghostnet || MARKETPLACE_ADDRESS || '').trim();
};

const safeMarketplaceAddress = (net = NETWORK_KEY) =>
  String(MARKETPLACE_ADDRESS || marketplaceAddr(net) || '').trim();

const isTz  = (s) => /^tz[1-3][0-9A-Za-z]{33}$/i.test(String(s || ''));
const isKt  = (s) => /^KT1[0-9A-Za-z]{33}$/i.test(String(s || ''));
const isNat = (n) => Number.isFinite(Number(n)) && Number(n) >= 0;

/* Normalize a Taquito toolkit and ensure tzip16 plugin is present */
function ensureTzip16(toolkit) {
  if (!toolkit) throw new Error('Tezos toolkit is required');
  try { toolkit.addExtension?.(new Tzip16Module()); } catch { /* already added */ }
  return toolkit;
}

/* Derive a view caller; fall back to marketplace address if signer is unavailable */
async function getViewCaller(contract, toolkit) {
  try { return await toolkit.signer.publicKeyHash(); } catch {}
  try { return (await toolkit.wallet.pkh?.()) || String(contract?.address || ''); } catch {}
  return String(contract?.address || '');
}

/*──────────────── contract handle ────────────────*/
export async function getMarketContract(toolkit) {
  ensureTzip16(toolkit);
  const addr = safeMarketplaceAddress(NETWORK_KEY);
  if (!isKt(addr)) throw new Error('Marketplace address is not configured');
  return toolkit.contract.at(addr, tzip16);
}

/*──────────────── on‑chain & off‑chain views ────────────────*/
export async function fetchOnchainListings({ toolkit, nftContract, tokenId }) {
  const market = await getMarketContract(toolkit);
  const viewCaller = await getViewCaller(market, toolkit);

  let raw;
  try {
    raw = await market.contractViews
      .onchain_listings_for_token({ nft_contract: nftContract, token_id: Number(tokenId) })
      .executeView({ viewCaller });
  } catch { raw = null; }

  const out = [];
  const push = (n, o) => out.push({
    nonce     : Number(n),
    priceMutez: Number(o?.price),
    amount    : Number(o?.amount),
    seller    : String(o?.seller || ''),
    active    : !!o?.active,
  });

  if (raw?.entries) for (const [k, v] of raw.entries()) push(k, v);
  else if (raw && typeof raw === 'object') Object.entries(raw).forEach(([k, v]) => push(k, v));

  return out;
}

export async function fetchOnchainOffers({ toolkit, nftContract, tokenId }) {
  const market = await getMarketContract(toolkit);
  const viewCaller = await getViewCaller(market, toolkit);

  let raw;
  try {
    raw = await market.contractViews
      .onchain_offers_for_token({ nft_contract: nftContract, token_id: Number(tokenId) })
      .executeView({ viewCaller });
  } catch { raw = null; }

  const offers = [];
  const push = (k, o) => offers.push({
    offeror   : String(k || o?.offeror || ''),
    priceMutez: Number(o?.price),
    amount    : Number(o?.amount),
    nonce     : Number(o?.nonce),
    accepted  : !!o?.accepted,
  });

  if (raw?.entries) for (const [k, v] of raw.entries()) push(k, v);
  else if (raw && typeof raw === 'object') Object.entries(raw).forEach(([k, v]) => push(k, v));

  return offers;
}

/** TZIP‑16 Metadata view: per‑token off‑chain listings (when present). Robust across names. */
async function fetchOffchainListingsForToken({ toolkit, nftContract, tokenId }) {
  try {
    const market = await getMarketContract(toolkit);
    const views  = await market.tzip16().metadataViews();
    const v =
      views?.offchain_listings_for_token ||
      views?.offchain_listings_for_nft ||
      views?.get_listings_for_token;
    if (!v) return [];

    let raw;
    try {
      raw = await v().executeView({ nft_contract: nftContract, token_id: Number(tokenId) });
    } catch {
      // permissive positional invocation
      try { raw = await v().executeView(String(nftContract), Number(tokenId)); }
      catch { raw = null; }
    }

    const out = [];
    const push = (n, o) => out.push({
      nonce     : Number(n ?? o?.nonce),
      priceMutez: Number(o?.price ?? o?.priceMutez),
      amount    : Number(o?.amount ?? o?.quantity ?? 0),
      seller    : String(o?.seller || ''),
      active    : !!(o?.active ?? true),
    });

    if (Array.isArray(raw)) {
      raw.forEach((r, i) => push(r?.nonce ?? i, r));
    } else if (raw?.entries) {
      for (const [k, v2] of raw.entries()) push(k, v2);
    } else if (raw && typeof raw === 'object') {
      Object.entries(raw).forEach(([k, v2]) => push(k, v2));
    }
    return out;
  } catch { return []; }
}

/*──────────────── TzKT big‑map fallback (hardened) ────────────────*/

async function probeMarketIndexes(TZKT_V1, market) {
  try {
    const rows = await jFetch(`${TZKT_V1}/contracts/${market}/bigmaps?select=path,ptr,id,active&limit=200`, 1);
    const out = {};
    for (const r of rows || []) {
      const path = r?.path || r?.name || '';
      const ptr  = Number(r?.ptr ?? r?.id);
      if (!Number.isFinite(ptr)) continue;
      if (path === 'collection_listings') out.collection_listings = ptr;
      if (path === 'listings') out.listings = ptr;
      if (path === 'listings_active') out.listings_active = ptr; // not all deployments
    }
    return out;
  } catch { return {}; }
}

function* walkListings(value, depth = 0) {
  if (!value || depth > 3) return;
  const v = value;
  const looksListing =
    typeof v === 'object' &&
    ('price' in v || 'priceMutez' in v) &&
    ('token_id' in v || 'tokenId' in v || 'token' in v);
  if (looksListing) { yield v; return; }
  if (Array.isArray(v)) { for (const it of v) yield* walkListings(it, depth + 1); return; }
  if (typeof v === 'object') { for (const it of Object.values(v)) yield* walkListings(it, depth + 1); }
}

/** Read active listings for a single (contract, tokenId) through TzKT. */
async function fetchListingsViaTzktBigmap({ nftContract, tokenId, net = NETWORK_KEY }) {
  const market = safeMarketplaceAddress(net);
  if (!isKt(market)) return []; // hard stop; avoids /contracts/undefined/bigmaps
  const TZKT_V1 = tzktV1(net);
  const idx = await probeMarketIndexes(TZKT_V1, market);

  const out = [];

  // 1) collection_listings path (preferred)
  if (idx.collection_listings) {
    // /v1/bigmaps/{ptr}/keys?key=KT1..&active=true&select=value
    const q1 = new URLSearchParams({ key: nftContract, active: 'true', select: 'value', limit: '10000' });
    const rows = await jFetch(`${TZKT_V1}/bigmaps/${idx.collection_listings}/keys?${q1}`, 1).catch(() => []);
    for (const r of rows || []) for (const l of walkListings(r)) out.push(l);
  }

  // 2) listings path (value‑filter; fallback to broad scan)
  if (idx.listings && out.length === 0) {
    const q2 = new URLSearchParams({
      'value.nft_contract': nftContract,
      'value.token_id'   : String(tokenId),
      active             : 'true',
      select             : 'value',
      limit              : '10000',
    });
    let rows = await jFetch(`${TZKT_V1}/bigmaps/${idx.listings}/keys?${q2}`, 1).catch(() => null);

    if (!Array.isArray(rows)) {
      const broad = await jFetch(`${TZKT_V1}/bigmaps/${idx.listings}/keys?active=true&select=value&limit=10000`, 1)
        .catch(() => []);
      rows = (broad || []).filter((v) => {
        const c = v?.nft_contract || v?.contract || v?.collection;
        const id = Number(v?.token_id ?? v?.tokenId ?? v?.token?.token_id ?? v?.token?.id);
        return String(c) === nftContract && id === Number(tokenId);
      });
    }
    for (const r of rows || []) for (const l of walkListings(r)) out.push(l);
  }

  // Normalize
  return out.map((l) => ({
    nonce     : Number(l?.nonce ?? l?.listing_nonce ?? l?.id ?? 0),
    priceMutez: Number(l?.price ?? l?.priceMutez),
    amount    : Number(l?.amount ?? l?.quantity ?? l?.amountTokens ?? 0),
    seller    : String(l?.seller || l?.owner || ''),
    active    : !!(l?.active ?? l?.is_active ?? true),
  })).filter((x) => x.active && Number.isFinite(x.priceMutez) && x.priceMutez >= 0);
}

/*──────────────── high‑level: stable API & fallbacks ────────────────*/
export async function fetchListings({ toolkit, nftContract, tokenId }) {
  try {
    const results = await fetchOnchainListings({ toolkit, nftContract, tokenId });
    return Array.isArray(results) ? results : [];
  } catch { return []; }
}

/**
 * Return the lowest active listing for (nftContract, tokenId), or null.
 * Order of attempts:
 *   1) On‑chain view
 *   2) Off‑chain (TZIP‑16) view
 *   3) TzKT big‑map fallback
 * Then (optionally) filter sellers who no longer hold stock (≥ requested amount).
 * Accepts both signatures for backward compatibility:
 *   • fetchLowestListing({ toolkit, nftContract, tokenId, staleCheck? })
 *   • fetchLowestListing(toolkit, { nftContract, tokenId, staleCheck? })
 */
export async function fetchLowestListing(arg1, arg2) {
  const opts = arg2 ? { toolkit: arg1, ...arg2 } : { ...(arg1 || {}) };
  const { toolkit, nftContract, tokenId, staleCheck = true } = opts;

  let list = [];
  try { list = await fetchOnchainListings({ toolkit, nftContract, tokenId }); } catch {}
  if (!list?.length) { try { list = await fetchOffchainListingsForToken({ toolkit, nftContract, tokenId }); } catch {} }
  if (!list?.length) { try { list = await fetchListingsViaTzktBigmap({ nftContract, tokenId }); } catch {} }

  list = (list || [])
    .map((l) => ({ ...l, nftContract, tokenId }))
    .filter((l) => (l.active ?? true) && Number(l.amount) > 0 && Number.isFinite(l.priceMutez));

  if (!list.length) return null;

  let act = list;
  if (staleCheck && toolkit) {
    try {
      const checked = await filterStaleListings(toolkit, list);
      act = Array.isArray(checked) && checked.length ? checked : act;
    } catch { /* keep act */ }
  }
  if (!act.length) return null;
  return act.reduce((m, c) => (c.priceMutez < m.priceMutez ? c : m));
}

/* Offers passthrough */
export async function fetchOffers({ toolkit, nftContract, tokenId }) {
  try {
    const results = await fetchOnchainOffers({ toolkit, nftContract, tokenId });
    return Array.isArray(results) ? results : [];
  } catch { return []; }
}

/** Listing details by nonce (TZIP‑16 metadata view). */
export async function fetchListingDetails({ toolkit, nftContract, tokenId, nonce }) {
  const market = await getMarketContract(toolkit);
  const views  = await market.tzip16().metadataViews();
  if (!views?.offchain_listing_details) {
    const err = new Error('Metadata view offchain_listing_details unavailable');
    err.code = 'MISSING_LISTING_DETAILS';
    throw err;
  }
  let raw;
  try {
    raw = await views.offchain_listing_details().executeView({
      listing_nonce: Number(nonce),
      nft_contract : nftContract,
      token_id     : Number(tokenId),
    });
  } catch {
    raw = await views.offchain_listing_details().executeView(Number(nonce), String(nftContract), Number(tokenId));
  }
  return {
    contract     : raw.nft_contract,
    tokenId      : Number(raw.token_id),
    seller       : raw.seller,
    priceMutez   : Number(raw.price),
    amount       : Number(raw.amount),
    active       : !!raw.active,
    startTime    : raw.start_time,
    saleSplits   : raw.sale_splits,
    royaltySplits: raw.royalty_splits,
  };
}

/*──────────────── additional on‑chain convenience ────────────────*/
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
    active       : !!raw.active,
    startTime    : raw.start_time,
    saleSplits   : raw.sale_splits,
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
        contract     : r.nft_contract,
        tokenId      : Number(r.token_id),
        seller       : r.seller,
        priceMutez   : Number(r.price),
        amount       : Number(r.amount),
        active       : !!r.active,
        startTime    : r.start_time,
        saleSplits   : r.sale_splits,
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
        offeror    : r.offeror,
        priceMutez : Number(r.price),
        amount     : Number(r.amount),
        nonce      : Number(r.nonce),
        accepted   : !!r.accepted,
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
        contract     : r.nft_contract,
        tokenId      : Number(r.token_id),
        seller       : r.seller,
        priceMutez   : Number(r.price),
        amount       : Number(r.amount),
        active       : !!r.active,
        startTime    : r.start_time,
        saleSplits   : r.sale_splits,
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
        offeror   : r.offeror,
        priceMutez: Number(r.price),
        amount    : Number(r.amount),
        nonce     : Number(r.nonce),
        accepted  : !!r.accepted,
      }))
    : [];
}

/*──────────────── param‑builder helpers for wallet.batch() ────────────────*/
export async function buildBuyParams(
  toolkit,
  { nftContract, tokenId, priceMutez, seller, nonce, amount = 1 },
) {
  const c = await getMarketContract(toolkit);
  let transferParams;

  let objFn = c.methodsObject?.buy || c.methodsObject?.['buy'];
  let posFn = c.methods?.buy || c.methods?.['buy'];

  if (typeof objFn !== 'function' && typeof posFn !== 'function') {
    const findKey = (keys) => keys.find((k) => k.toLowerCase().replace(/_/g, '').includes('buy'));
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

/*──────────────── split normalization helpers ────────────────*/
function toPercentNat(x) {
  if (x == null) return 0;
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  // treat values <= 25 as percentages (2 decimals possible) → bps
  if (n > 25) return Math.max(0, Math.min(10000, Math.round(n)));
  return Math.max(0, Math.min(10000, Math.round(n * 100)));
}
function normalizeSplitArray(arr = []) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((s) => {
      const addr = s?.address || s?.recipient;
      const p =
        s?.percent != null ? toPercentNat(s.percent) :
        s?.bps != null     ? toPercentNat(s.bps) :
        s?.share != null   ? toPercentNat(s.share) :
        0;
      return (typeof addr === 'string' && addr && p > 0) ? { address: addr, percent: p } : null;
    })
    .filter(Boolean);
}
function clampRoyaltyTotal(splits) {
  const tot = splits.reduce((t, s) => t + (Number(s.percent) || 0), 0);
  if (tot <= 2500) return splits;        // ≤ 25%
  const scale = 2500 / tot;              // scale down proportionally
  return splits.map((s) => ({ ...s, percent: Math.max(0, Math.round(s.percent * scale)) }));
}

/*──────────────── operator helpers (single‑signature UX) ────────────────*/
export async function hasOperatorForId({ tzktBase = tzktV1(NETWORK_KEY), nftContract, owner, operator, tokenId }) {
  try {
    const maps = await jFetch(`${tzktBase}/contracts/${nftContract}/bigmaps`, 1);
    const opMap = Array.isArray(maps) ? maps.find((m) => (m.path || m.name) === 'operators') : null;
    if (!opMap) return false;
    const mapId = opMap.ptr ?? opMap.id;
    const qs = new URLSearchParams({
      'key.owner'   : owner,
      'key.operator': operator,
      'key.token_id': String(Number(tokenId)),
      select        : 'active',
      limit         : '1',
    });
    const arr = await jFetch(`${tzktBase}/bigmaps/${mapId}/keys?${qs}`, 1).catch(() => []);
    return Array.isArray(arr) && arr.length > 0;
  } catch { return false; }
}

export async function buildUpdateOperatorParams(toolkit, nftContract, { owner, operator, tokenId }) {
  const nft = await toolkit.wallet.at(nftContract);
  try {
    return nft.methods.update_operators([{ add_operator: { owner, operator, token_id: Number(tokenId) } }]).toTransferParams();
  } catch {
    return nft.methods.update_operators([{ add_operator: { operator, owner, token_id: Number(tokenId) } }]).toTransferParams();
  }
}

export async function ensureOperatorForId(toolkit, { nftContract, owner, operator, tokenId }) {
  const already = await hasOperatorForId({ nftContract, owner, operator, tokenId });
  if (already) return null;
  const upd = await buildUpdateOperatorParams(toolkit, nftContract, { owner, operator, tokenId });
  return { kind: OpKind.TRANSACTION, ...upd };
}

/*──────────────── list/cancel/offer/accept builders ────────────────*/
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
    sellerAddress,
  },
) {
  const c = await getMarketContract(toolkit);
  const amt   = Number(amount);
  const tokId = Number(tokenId);
  const delay = Number(startDelay);
  const price = Number(priceMutez);

  const sale    = normalizeSplitArray(saleSplits);
  let royalty   = clampRoyaltyTotal(normalizeSplitArray(royaltySplits));
  const usedBps = sale.reduce((t, s) => t + (Number(s.percent) || 0), 0);
  if (sellerAddress && usedBps < 10000) { sale.push({ address: sellerAddress, percent: 10000 - usedBps }); }

  const getObjMeth = () => c.methodsObject?.list_token || c.methodsObject?.['list_token'];
  const getPosMeth = () => c.methods?.list_token     || c.methods?.['list_token'];
  let objMeth = getObjMeth();
  let posMeth = getPosMeth();

  if (typeof objMeth !== 'function' && typeof posMeth !== 'function') {
    const pick = (keys) => keys.find((k) => k.toLowerCase().replace(/_/g, '').includes('listtoken'));
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
      royalty_splits: royalty,
      sale_splits: sale,
      start_delay: delay,
      token_id: tokId,
    };
    try {
      const input = offline_balance ? { ...base, offline_balance: true } : base;
      transferParams = objMeth(input).toTransferParams();
    } catch { /* try positional */ }
  }

  if (!transferParams && typeof posMeth === 'function') {
    const tryPos = (...args) => { try { return posMeth(...args).toTransferParams(); } catch { return null; } };
    const candidates = [];
    if (offline_balance) {
      candidates.push([amt, nftContract, true, price, royalty, sale, delay, tokId]);
      candidates.push([amt, nftContract, true, price, sale, royalty, delay, tokId]);
      candidates.push([amt, nftContract, price, true, royalty, sale, delay, tokId]);
      candidates.push([amt, nftContract, price, true, sale, royalty, delay, tokId]);
    } else {
      candidates.push([amt, nftContract, price, royalty, sale, delay, tokId]);
      candidates.push([amt, nftContract, price, sale, royalty, delay, tokId]);
    }
    for (const args of candidates) { transferParams = tryPos(...args); if (transferParams) break; }
  }

  if (!transferParams) throw new Error('list_token entrypoint unavailable or signature mismatch');

  const txs = [{ kind: OpKind.TRANSACTION, ...transferParams }];

  if (sellerAddress) {
    try {
      const operatorAddr = c.address;
      const upd = await ensureOperatorForId(toolkit, {
        nftContract, owner: sellerAddress, operator: operatorAddr, tokenId: tokId,
      });
      if (upd) txs.unshift(upd);
    } catch { /* proceed; chain will error if operator truly missing */ }
  }
  return txs;
}

export async function buildCancelParams(toolkit, { nftContract, tokenId, listingNonce }) {
  const c = await getMarketContract(toolkit);
  let transferParams;

  let objFn = c.methodsObject?.cancel_listing || c.methodsObject?.['cancel_listing'];
  let posFn = c.methods?.cancel_listing || c.methods?.['cancel_listing'];

  if (typeof objFn !== 'function' && typeof posFn !== 'function') {
    const pick = (keys) => keys.find((k) => k.toLowerCase().replace(/_/g, '').includes('cancellisting'));
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
    const pick = (keys) => keys.find((k) => k.toLowerCase().replace(/_/g, '').includes('acceptoffer'));
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
    const pick = (keys) => keys.find((k) => k.toLowerCase().replace(/_/g, '').includes('makeoffer'));
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

/** Cancel/withdraw an offer for a token. Robust to entrypoint naming. */
export async function buildCancelOfferParams(toolkit, { nftContract, tokenId, offerNonce }) {
  const c = await getMarketContract(toolkit);
  let transferParams;

  // Accept a variety of likely entrypoint names
  const candidatesObj = [
    'cancel_offer', 'withdraw_offer', 'cancel_token_offer', 'withdraw_token_offer',
  ].filter(Boolean);
  const candidatesPos = candidatesObj.slice();

  let objFn = null;
  let posFn = null;

  for (const name of candidatesObj) {
    if (typeof c.methodsObject?.[name] === 'function') { objFn = c.methodsObject[name]; break; }
  }
  if (!objFn && c.methodsObject) {
    // fuzzy search
    const key = Object.keys(c.methodsObject).find((k) => k.toLowerCase().replace(/_/g, '').includes('cancel') && k.toLowerCase().includes('offer'));
    if (key) objFn = c.methodsObject[key];
  }
  for (const name of candidatesPos) {
    if (typeof c.methods?.[name] === 'function') { posFn = c.methods[name]; break; }
  }
  if (!posFn && c.methods) {
    const key = Object.keys(c.methods).find((k) => k.toLowerCase().replace(/_/g, '').includes('cancel') && k.toLowerCase().includes('offer'));
    if (key) posFn = c.methods[key];
  }

  if (typeof objFn === 'function') {
    // Try (offer_nonce, nft_contract, token_id) & also (nft_contract, token_id, offer_nonce)
    const attempt = () => {
      try {
        return objFn({
          offer_nonce: Number(offerNonce),
          nft_contract: nftContract,
          token_id: Number(tokenId),
        }).toTransferParams();
      } catch {
        return objFn({
          nft_contract: nftContract,
          token_id: Number(tokenId),
          offer_nonce: Number(offerNonce),
        }).toTransferParams();
      }
    };
    transferParams = attempt();
  } else if (typeof posFn === 'function') {
    const tryPos = (...args) => { try { return posFn(...args).toTransferParams(); } catch { return null; } };
    const tries = [
      [Number(offerNonce), nftContract, Number(tokenId)],
      [nftContract, Number(tokenId), Number(offerNonce)],
    ];
    for (const t of tries) { transferParams = tryPos(...t); if (transferParams) break; }
  } else {
    throw new Error('cancel_offer entrypoint unavailable on marketplace contract');
  }
  return [{ kind: OpKind.TRANSACTION, ...transferParams }];
}

/*──────────────── STALE‑LISTING GUARDS (TzKT‑backed) ────────────────*/
const SELLER_BAL_TTL = 30_000; // 30s cache per (seller,contract,token,network)
const sellerBalCache = new Map(); // key -> { at, balance }
const now = () => Date.now();
const cacheKey = (net, a, c, t) => `${String(net || NETWORK_KEY)}|${a}|${c}|${t}`;
function readCache(net, a, c, t) {
  const k = cacheKey(net, a, c, t);
  const hit = sellerBalCache.get(k);
  if (hit && now() - hit.at < SELLER_BAL_TTL) return hit.balance;
  return null;
}
function writeCache(net, a, c, t, balance) {
  sellerBalCache.set(cacheKey(net, a, c, t), { at: now(), balance: Number(balance || 0) });
}

/** Single‑account FA2 balance via TzKT. Exported (used by UI preflight). */
export async function getFa2BalanceViaTzkt(account, nftContract, tokenId, net = NETWORK_KEY) {
  if (!isTz(account) || !isKt(nftContract)) return 0;
  const cached = readCache(net, account, nftContract, tokenId);
  if (cached != null) return cached;

  const TZKT_V1 = tzktV1(net);
  const qs = new URLSearchParams({
    account,
    'token.contract': nftContract,
    'token.tokenId' : String(tokenId),
    select          : 'balance',
    limit           : '1',
  });
  const url = `${TZKT_V1}/tokens/balances?${qs}`;
  try {
    const rows = await jFetch(url, 1);
    const first = Array.isArray(rows) && rows.length ? rows[0] : 0;
    const n = Number(first || 0);
    const bal = Number.isFinite(n) ? n : 0;
    writeCache(net, account, nftContract, tokenId, bal);
    return bal;
  } catch {
    writeCache(net, account, nftContract, tokenId, 0);
    return 0;
  }
}

/** Batch balances for multiple sellers of the same token. */
export async function getFa2BalancesForAccounts(accounts, nftContract, tokenId, net = NETWORK_KEY) {
  const TZKT_V1 = tzktV1(net);
  const need = [];
  const out = new Map();

  for (const a of (accounts || [])) {
    const hit = readCache(net, a, nftContract, tokenId);
    if (hit != null) out.set(a, hit);
    else need.push(a);
  }
  if (!need.length) return out;

  const CHUNK = 50;
  for (let i = 0; i < need.length; i += CHUNK) {
    const slice = need.slice(i, i + CHUNK);
    const qs = new URLSearchParams({
      'account.in'   : slice.join(','),
      'token.contract': nftContract,
      'token.tokenId': String(tokenId),
      limit          : String(slice.length),
    });
    const url = `${TZKT_V1}/tokens/balances?${qs}`;
    const rows = await jFetch(url, 1).catch(() => []);
    for (const r of rows || []) {
      const addr = r?.account?.address || r?.account;
      const bal  = Number(r?.balance ?? 0);
      if (typeof addr === 'string') {
        out.set(addr, bal);
        writeCache(net, addr, nftContract, tokenId, bal);
      }
    }
    for (const a of slice) if (!out.has(a)) { out.set(a, 0); writeCache(net, a, nftContract, tokenId, 0); }
  }
  return out;
}

/** Utility: keep sellers with balance at least `minUnits` for one (contract, tokenId). */
async function keepSellersWithBalanceAtLeast(TZKT_V1, nftContract, tokenId, sellers, minUnits = 1) {
  const unique = [...new Set((sellers || []).filter(isTz))];
  if (!unique.length) return new Set();
  const kept = new Set();
  const CHUNK = 50;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    const qs = new URLSearchParams({
      'token.contract'  : nftContract,
      'token.tokenId'   : String(tokenId),
      'account.in'      : slice.join(','),
      select            : 'account,balance',
      limit             : String(slice.length),
    });
    const url = `${TZKT_V1}/tokens/balances?${qs}`;
    const rows = await jFetch(url, 1).catch(() => []);
    for (const r of rows || []) {
      const addr = String(r?.account?.address || r?.account || '');
      const bal  = Number(r?.balance || 0);
      if (isTz(addr) && bal >= minUnits) kept.add(addr.toLowerCase());
    }
  }
  return kept;
}

/** Filter listings to those where seller still has >= required amount for (contract, tokenId). */
export async function filterStaleListings(_toolkit, listings, net = NETWORK_KEY) {
  if (!Array.isArray(listings) || listings.length === 0) return [];
  const groups = new Map(); // key -> [items]
  for (const it of listings || []) {
    const kt = it.nftContract || it.contract;
    const id = Number(it.tokenId ?? it.token_id);
    const seller = it.seller;
    if (!isKt(kt) || !Number.isFinite(id) || !isTz(seller)) continue;
    const key = `${kt}|${id}`;
    const arr = groups.get(key) || [];
    arr.push({ kt, id, seller, amount: Number(it.amount ?? 1), ref: it });
    groups.set(key, arr);
  }

  const keep = [];
  for (const [, arr] of groups) {
    const { kt, id } = arr[0];
    const sellers = [...new Set(arr.map((x) => x.seller))];
    const map = await getFa2BalancesForAccounts(sellers, kt, id, net);
    for (const row of arr) {
      const bal = Number(map.get(row.seller) ?? 0);
      if (bal >= row.amount) keep.push(row.ref);
    }
  }
  return keep;
}

/** Preflight guard: verify the seller still has at least `amount` balance for (contract, tokenId).
 *  Throws an Error tagged with code 'STALE_LISTING_NO_BALANCE' when insufficient. */
export async function preflightBuy(toolkit, { nftContract, tokenId, seller, amount = 1 }) {
  const bal = await getFa2BalanceViaTzkt(String(seller), String(nftContract), Number(tokenId));
  const need = Number(amount) || 1;
  if (!Number.isFinite(bal) || bal < need) {
    const err = new Error('Listing is stale: seller does not own required balance for this token.');
    err.code = 'STALE_LISTING_NO_BALANCE';
    err.details = { seller: String(seller), nftContract: String(nftContract), tokenId: Number(tokenId), amount: need, balance: Number(bal || 0) };
    throw err;
  }
  return { ok: true, balance: Number(bal) };
}

/* What changed & why (r988):
   • ADD: network‑scoped cache keys for FA2 balance TTL (I156 ≤60s); prevents
     cross‑network leakage when TARGET is switched.
   • ADD: buildCancelOfferParams with robust name/signature discovery to match
     CancelOffer UI entry‑point.
   • HARDEN: fetchListingDetails throws tagged error when metadata view missing.
   • KEEP: hardened TzKT fallbacks (+ no double‑/v1), safe addr guards, dynamic
     method resolution for all param builders, and stale‑listing guards. */
