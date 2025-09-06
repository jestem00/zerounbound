/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/marketplace.js
  Rev:     r989  2025‑10‑11
  Summary(of what this file does): Marketplace helpers — full API
           (listings/offers/details, buy/list/cancel/offer param
           builders, operator ensure), lowest‑listing with multi‑
           source fallback (on‑chain → off‑chain TZIP‑16 → TzKT
           big‑map), plus TzKT‑backed stale‑seller guards.  This
           rev preserves **all** previous API surface and augments
           collection‑level on‑chain views by delegating to
           zeroSumViews.js which tries all param shapes, fixing the
           “0 For Sale” count.
──────────────────────────────────────────────────────────────*/

import { OpKind, TezosToolkit } from '@taquito/taquito';
import { Tzip16Module, tzip16 } from '@taquito/tzip16';

import {
  NETWORK_KEY,
  MARKETPLACE_ADDRESSES,
  MARKETPLACE_ADDRESS,
  TZKT_API,
} from '../config/deployTarget.js';

import { jFetch } from './net.js';
import { tzktBase as tzktBaseForNet } from '../utils/tzkt.js';
import { RPC_URLS } from '../config/deployTarget.js';
import { ENABLE_ONCHAIN_VIEWS as CFG_ENABLE_ONCHAIN_VIEWS, ENABLE_OFFCHAIN_MARKET_VIEWS as CFG_ENABLE_OFFCHAIN_MARKET_VIEWS } from '../config/deployTarget.js';

// NEW: robust on‑chain wrappers
import { onchainListingsForCollection } from './zeroSumViews.js';

// View toggles come from deployTarget.js (project invariant)
const ENABLE_ONCHAIN_VIEWS = CFG_ENABLE_ONCHAIN_VIEWS !== false;
const ENABLE_OFFCHAIN_MARKET_VIEWS = !!CFG_ENABLE_OFFCHAIN_MARKET_VIEWS;
let RPC_DEGRADED_UNTIL = 0; // epoch ms; when > now, skip RPC views
const RPC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const nowTs = () => Date.now();
const isRpcDegraded = () => nowTs() < RPC_DEGRADED_UNTIL;
const markRpcDegraded = () => { RPC_DEGRADED_UNTIL = nowTs() + RPC_COOLDOWN_MS; };

async function withRpcFallback(toolkit, fn) {
  const tried = new Set();
  const cand = [];
  try { const u = toolkit?.rpc?.url; if (u) cand.push(u); } catch {}
  for (const u of (RPC_URLS || [])) if (!cand.includes(u)) cand.push(u);
  let lastErr;
  for (const url of cand) {
    try {
      const tk = (!url || toolkit?.rpc?.url === url)
        ? toolkit
        : (() => { const t = new TezosToolkit(url); ensureTzip16(t); return t; })();
      return await fn(tk);
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('All RPC endpoints failed');
}

/*──────────────── constants & helpers ────────────────*/
const RAW_TZKT = String(TZKT_API || 'https://api.tzkt.io').replace(/\/+$/, ''); // no /v1
const tzktV1 = (net = NETWORK_KEY) => {
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

/*──────────────── on‑chain & off‑chain views (token‑level) ───────────────*/
export async function fetchOnchainListings({ toolkit, nftContract, tokenId }) {
  if (!ENABLE_ONCHAIN_VIEWS || isRpcDegraded()) return [];
  let raw;
  try {
    raw = await withRpcFallback(toolkit, async (tk) => {
      const market = await getMarketContract(tk);
      const viewCaller = await getViewCaller(market, tk);
      return market.contractViews
        .onchain_listings_for_token({ nft_contract: nftContract, token_id: Number(tokenId) })
        .executeView({ viewCaller });
    });
  } catch {
    markRpcDegraded();
    raw = null;
  }

  const out = [];
  const push = (n, o) => out.push({
    nonce     : Number(n ?? o?.nonce ?? 0),
    priceMutez: Number(o?.price),
    amount    : Number(o?.amount),
    seller    : String(o?.seller || ''),
    active    : !!o?.active,
  });

  if (raw?.entries) for (const [k, v] of raw.entries()) push(k, v);
  else if (Array.isArray(raw)) raw.forEach((v, i) => push(i, v));
  else if (raw && typeof raw === 'object') Object.entries(raw).forEach(([k, v]) => push(k, v));

  return out;
}

export async function fetchOnchainOffers({ toolkit, nftContract, tokenId }) {
  if (!ENABLE_ONCHAIN_VIEWS || isRpcDegraded()) return [];
  let raw;
  try {
    raw = await withRpcFallback(toolkit, async (tk) => {
      const market = await getMarketContract(tk);
      const viewCaller = await getViewCaller(market, tk);
      return market.contractViews
        .onchain_offers_for_token({ nft_contract: nftContract, token_id: Number(tokenId) })
        .executeView({ viewCaller });
    });
  } catch {
    markRpcDegraded();
    raw = null;
  }

  const offers = [];
  const push = (k, o) => offers.push({
    offeror   : String(k || o?.offeror || ''),
    priceMutez: Number(o?.price),
    amount    : Number(o?.amount),
    nonce     : Number(o?.nonce),
    accepted  : !!o?.accepted,
  });

  if (raw?.entries) for (const [k, v] of raw.entries()) push(k, v);
  else if (Array.isArray(raw)) raw.forEach((v, i) => push(i, v));
  else if (raw && typeof raw === 'object') Object.entries(raw).forEach(([k, v]) => push(k, v));

  return offers;
}

/**
 * TZIP‑16 Metadata view: per‑token off‑chain listings (when present).
 *
 * Some RPC providers intermittently 500 on run_code for metadata views. To
 * avoid spamming failing POSTs and noisy console output, we apply a simple
 * circuit‑breaker: after a failure we skip attempting this call for a short
 * cooldown window.
 */
let OFFCHAIN_LISTINGS_RETRY_AFTER = 0; // epoch ms
const OFFCHAIN_LISTINGS_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

async function fetchOffchainListingsForToken({ toolkit, nftContract, tokenId }) {
  if (!ENABLE_ONCHAIN_VIEWS || !ENABLE_OFFCHAIN_MARKET_VIEWS || isRpcDegraded()) return [];
  if (Date.now() < OFFCHAIN_LISTINGS_RETRY_AFTER) return [];
  try {
    const raw = await withRpcFallback(toolkit, async (tk) => {
      const market = await getMarketContract(tk);
      const views  = await market.tzip16().metadataViews();
      const v =
        views?.offchain_listings_for_token ||
        views?.offchain_listings_for_nft ||
        views?.get_listings_for_token;
      if (!v) return null;
      try { return await v().executeView({ nft_contract: nftContract, token_id: Number(tokenId) }); }
      catch { return await v().executeView(String(nftContract), Number(tokenId)); }
    });

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
  } catch {
    // Failure: set cooldown to reduce repeated POST /run_code errors.
    OFFCHAIN_LISTINGS_RETRY_AFTER = Date.now() + OFFCHAIN_LISTINGS_COOLDOWN_MS;
    markRpcDegraded();
    return [];
  }
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
      if (path === 'listings_active') out.listings_active = ptr;
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
  if (!isKt(market)) return [];
  const TZKT_V1 = tzktV1(net);
  const idx = await probeMarketIndexes(TZKT_V1, market);

  const out = [];

  if (idx.collection_listings) {
    // Pull the entire holder object for this collection and extract
    // tokenId → { nonce → listing } preserving the nonce key.
    const q1 = new URLSearchParams({ key: nftContract, active: 'true', select: 'value', limit: '1' });
    const rows = await jFetch(`${TZKT_V1}/bigmaps/${idx.collection_listings}/keys?${q1}`, 1).catch(() => []);
    for (const r of rows || []) {
      const holder = r?.value || r;
      if (!holder || typeof holder !== 'object') continue;
      for (const [tid, nonceMap] of Object.entries(holder)) {
        const tokId = Number(tid);
        if (!Number.isFinite(tokId)) continue;
        if (nonceMap && typeof nonceMap === 'object') {
          for (const [nonceKey, listing] of Object.entries(nonceMap)) {
            if (!listing || typeof listing !== 'object') continue;
            if (listing.nonce == null && listing.listing_nonce == null) listing.nonce = Number(nonceKey);
            out.push({ ...listing, token_id: tokId });
          }
        }
      }
    }
  }

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
    for (const r of rows || []) {
      const value = r?.value ?? r;
      if (value && typeof value === 'object') {
        // value is a map of nonce -> listing; capture nonce from the key
        for (const [nonceKey, listing] of Object.entries(value)) {
          if (!listing || typeof listing !== 'object') continue;
          const tokId = Number(listing?.token_id ?? listing?.tokenId ?? listing?.token?.id);
          if (!Number.isFinite(tokId)) continue;
          const withNonce = { ...listing };
          if (withNonce.nonce == null && withNonce.listing_nonce == null) withNonce.nonce = Number(nonceKey);
          out.push(withNonce);
        }
      }
    }
  }

  // Some marketplace deployments keep an explicit active bigmap; consult it as
  // a final TzKT-only source before giving up.
  if (idx.listings_active && out.length === 0) {
    const q3 = new URLSearchParams({
      'value.nft_contract': nftContract,
      'value.token_id'   : String(tokenId),
      select             : 'value',
      active             : 'true',
      limit              : '10000',
    });
    const rows = await jFetch(`${TZKT_V1}/bigmaps/${idx.listings_active}/keys?${q3}`, 1).catch(() => []);
    for (const r of rows || []) for (const l of walkListings(r)) out.push(l);
  }

  return out.map((l) => ({
    // Normalize nonce; tolerate sources that expose bigmap row id as id
    // (legacy behavior kept for broad compatibility).
    nonce     : Number(l?.nonce ?? l?.listing_nonce ?? l?.id ?? 0),
    priceMutez: Number(l?.price ?? l?.priceMutez),
    amount    : Number(l?.amount ?? l?.quantity ?? l?.amountTokens ?? 0),
    seller    : String(l?.seller || l?.owner || ''),
    active    : !!(l?.active ?? l?.is_active ?? true),
  })).filter((x) => x.active && Number.isFinite(x.priceMutez) && x.priceMutez >= 0);
}

/*──────────────── high‑level: stable API & fallbacks ────────────────*/
export async function fetchListings({ toolkit, nftContract, tokenId }) {
  // Prefer TzKT for stability; on-chain only if enabled & healthy
  try {
    let results = await fetchListingsViaTzktBigmap({ nftContract, tokenId });
    if (!results?.length && ENABLE_ONCHAIN_VIEWS && !isRpcDegraded()) {
      results = await fetchOnchainListings({ toolkit, nftContract, tokenId });
    }
    return Array.isArray(results) ? results : [];
  } catch { return []; }
}

/** Lowest listing for a (contract, tokenId). Keeps previous logic. */
export async function fetchLowestListing(arg1, arg2) {
  const opts = arg2 ? { toolkit: arg1, ...arg2 } : { ...(arg1 || {}) };
  const { toolkit, nftContract, tokenId, staleCheck = true } = opts;

  let list = [];
    try { list = await fetchOnchainListings({ toolkit, nftContract, tokenId }); } catch {}
  if (!list?.length && ENABLE_OFFCHAIN_MARKET_VIEWS && !isRpcDegraded()) { try { list = await fetchOffchainListingsForToken({ toolkit, nftContract, tokenId }); } catch {} }
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
  if (!ENABLE_ONCHAIN_VIEWS || isRpcDegraded()) {
    const err = new Error('ONCHAIN_VIEWS_DISABLED');
    err.code = 'ONCHAIN_VIEWS_DISABLED';
    throw err;
  }
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

/*──────────────── NEW: collection‑level listings (robust) ───────────────*/
export async function fetchOnchainListingsForCollection({ toolkit, nftContract }) {
  const marketAddress = safeMarketplaceAddress(NETWORK_KEY);
  if (!isKt(marketAddress)) return [];
  try {
    // Delegates to zeroSumViews.js which fixes parameter shape issues
    const rows = await onchainListingsForCollection(toolkit, marketAddress, String(nftContract));
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
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

/*──────────────── param‑builder helpers, operators, stale guards ─────────
  NOTE: The remaining content intentionally mirrors r988 to preserve
  full backwards‑compatibility across the app.  Only minimal fixes
  above were introduced to collection‑level on‑chain views.          */

function toPercentNat(x) {
  if (x == null) return 0;
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
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
  if (tot <= 2500) return splits;
  const scale = 2500 / tot;
  return splits.map((s) => ({ ...s, percent: Math.max(0, Math.round(s.percent * scale)) }));
}

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

export async function buildBuyParams(toolkit, { nftContract, tokenId, priceMutez, seller, nonce, amount = 1 }) {
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

export async function buildListParams(toolkit, {
  nftContract, tokenId, priceMutez, amount = 1, saleSplits = [], royaltySplits = [], startDelay = 0, offline_balance = false, sellerAddress,
}) {
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

export async function buildAcceptOfferParams(toolkit, { nftContract, tokenId, amount = 1, listingNonce, offeror }) {
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

/*──────────────── STALE‑LISTING GUARDS (TzKT‑backed) ────────────────*/
const SELLER_BAL_TTL = 30_000; // 30s
const sellerBalCache = new Map();
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
export async function filterStaleListings(_toolkit, listings, net = NETWORK_KEY) {
  if (!Array.isArray(listings) || listings.length === 0) return [];
  const groups = new Map();
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

/* What changed & why (r989):
   • FIX: collection listings now execute through zeroSumViews.js
     which tries all parameter shapes ({address}|{nft_contract}|positional).
     This resolves “0 For Sale” when ABI exposes a generic `address` arg.
   • KEPT: entire r988 API surface (param builders, stale guards, etc.). */
// EOF








