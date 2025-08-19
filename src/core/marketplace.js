/*Developed by @jams2blues – ZeroContract Studio
  File:    src/core/marketplace.js
  Rev:     r985  2025‑08‑19
  Summary(of what this file does): ZeroSum marketplace helpers: contract
           resolver, on/off‑chain listing/offer readers, robust lowest‑listing
           fallback (on‑chain → off‑chain view → TzKT big‑map), param builders
           (buy/list/cancel/accept/make offer), operator auto‑ensure for
           single‑sig listing, and TzKT‑backed stale‑listing preflight. */

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

/*─────────────────────────────────────────────────────────────
  Robust listing discovery fallbacks (NEW, non‑breaking)
  1) on‑chain view  2) off‑chain TZIP‑16 view  3) TzKT big‑map
──────────────────────────────────────────────────────────────*/
async function getViewCaller(market, toolkit) {
  try {
    const pkh = await toolkit.signer.publicKeyHash();
    if (typeof pkh === 'string' && /^tz/i.test(pkh)) return pkh;
  } catch { /* ignore */ }
  return market.address;
}

/** Off‑chain TZIP‑16 view fallback — `get_listings_for_token` */
async function fetchOffchainListingsForToken(toolkit, nftContract, tokenId) {
  try {
    const market = await getMarketContract(toolkit);
    const views  = await market.tzip16().metadataViews();
    const fn = views?.get_listings_for_token;
    if (!fn || typeof fn().executeView !== 'function') return [];
    const raw = await fn().executeView(String(nftContract), Number(tokenId));
    const out = [];
    const push = (n, o) => out.push({
      nonce     : Number(n),
      priceMutez: Number(o?.price ?? 0),
      amount    : Number(o?.amount ?? 0),
      seller    : String(o?.seller ?? ''),
      active    : !!o?.active,
    });
    if (raw?.entries) for (const [k, v] of raw.entries()) push(k, v);
    else if (raw && typeof raw === 'object') Object.entries(raw).forEach(([k, v]) => push(k, v));
    return out;
  } catch { return []; }
}

/** Direct TzKT big‑map fallback — reads marketplace `listings` for (KT1,tokenId) */
async function fetchListingsViaTzktBigmap(toolkit, nftContract, tokenId) {
  const mkt = marketplaceAddr(NETWORK_KEY);
  try {
    // Find the 'listings' big‑map pointer
    const maps = await jFetch(`${TZKT_BASE}/v1/contracts/${mkt}/bigmaps`).catch(() => []);
    const meta = Array.isArray(maps) ? maps.find((m) => (m.path || m.name) === 'listings') : null;
    const ptr  = meta?.ptr ?? meta?.id;
    if (ptr == null) return [];

    // Pull the single key row for (fa2Address, tokenId)
    const qs = new URLSearchParams({
      'key.address': String(nftContract),
      'key.nat'    : String(Number(tokenId)),
      limit        : '1',
    });
    const rows = await jFetch(`${TZKT_BASE}/v1/bigmaps/${ptr}/keys?${qs.toString()}`, 1).catch(() => []);
    const value = Array.isArray(rows) && rows[0] ? rows[0].value : null;
    if (!value || typeof value !== 'object') return [];

    // value is a map nonce→details; normalise all
    const out = [];
    Object.entries(value).forEach(([nonce, det]) => {
      if (!det) return;
      out.push({
        nonce     : Number(nonce),
        priceMutez: Number(det.price ?? 0),
        amount    : Number(det.amount ?? 0),
        seller    : String(det.seller ?? ''),
        active    : !!det.active,
      });
    });
    return out;
  } catch { return []; }
}

/**
 * Lowest active listing with optional stale‑filter (seller must still
 * own >= amount). Keeps behaviour stable if staleCheck=false.
 * Now with fallbacks: on‑chain → off‑chain TZIP‑16 → TzKT big‑map.
 */
export async function fetchLowestListing({
  toolkit,
  nftContract,
  tokenId,
  staleCheck = true,
}) {
  let list = [];
  try { list = await fetchOnchainListings({ toolkit, nftContract, tokenId }); } catch {}
  if (!list?.length) list = await fetchOffchainListingsForToken(toolkit, nftContract, tokenId);
  if (!list?.length) list = await fetchListingsViaTzktBigmap(toolkit, nftContract, tokenId);
  if (!list?.length) return null;

  let act = list.filter((l) => (l.active ?? true) && Number(l.amount) > 0);

  if (staleCheck && act.length) {
    const checked = await filterStaleListings(toolkit, act.map((l) => ({
      nftContract, tokenId, seller: l.seller, amount: l.amount, __src: l,
    }))).catch(() => act);
    if (Array.isArray(checked)) {
      act = checked.length ? checked.map((x) => x.__src || x) : [];
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
      Number(nonce), String(nftContract), Number(tokenId),
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

/*─────────────────────────────────────────────────────────────
  Split normalization helpers
──────────────────────────────────────────────────────────────*/
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
      // prefer "percent", else "bps", else "%"/"share"
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
  // Hard guard: cap at 25% total (2,500 bps). Contract enforces too.
  if (tot <= 2500) return splits;
  // scale down proportionally to 2500
  const scale = 2500 / tot;
  return splits.map((s) => ({ ...s, percent: Math.max(0, Math.round(s.percent * scale)) }));
}

/*─────────────────────────────────────────────────────────────
  Operator helpers (single‑signature UX)
──────────────────────────────────────────────────────────────*/

/** Robust operator probe via TzKT key filters. */
export async function hasOperatorForId({ tzktBase = TZKT_BASE, nftContract, owner, operator, tokenId }) {
  try {
    const maps = await jFetch(`${tzktBase}/v1/contracts/${nftContract}/bigmaps`);
    const opMap = Array.isArray(maps) ? maps.find((m) => m.path === 'operators') : null;
    if (!opMap) return false;
    const mapId = opMap.ptr ?? opMap.id;
    const qs = new URLSearchParams({
      'key.owner': owner,
      'key.operator': operator,
      'key.token_id': String(Number(tokenId)),
      select: 'active',
      limit: '1',
    });
    const arr = await jFetch(`${tzktBase}/v1/bigmaps/${mapId}/keys?${qs.toString()}`, 1).catch(() => []);
    return Array.isArray(arr) && arr.length > 0;
  } catch { return false; }
}

/** Build FA2 update_operators(add_operator) params (handles field order quirk). */
export async function buildUpdateOperatorParams(toolkit, nftContract, { owner, operator, tokenId }) {
  const nft = await toolkit.wallet.at(nftContract);
  try {
    return nft.methods.update_operators([{ add_operator: { owner, operator, token_id: Number(tokenId) } }]).toTransferParams();
  } catch {
    // reversed field quirk observed in some wrappers
    return nft.methods.update_operators([{ add_operator: { operator, owner, token_id: Number(tokenId) } }]).toTransferParams();
  }
}

/** Ensure operator present; if missing, return a tx param ready for batch. */
export async function ensureOperatorForId(toolkit, { nftContract, owner, operator, tokenId }) {
  const already = await hasOperatorForId({ nftContract, owner, operator, tokenId });
  if (already) return null;
  const upd = await buildUpdateOperatorParams(toolkit, nftContract, { owner, operator, tokenId });
  return { kind: OpKind.TRANSACTION, ...upd };
}

/*─────────────────────────────────────────────────────────────
  CRITICAL: list_token builder that
   • normalizes splits (bps→percent),
   • tries ALL safe positional permutations,
   • auto-batches update_operators for 1 signature when sellerAddress provided.
──────────────────────────────────────────────────────────────*/
export async function buildListParams(
  toolkit,
  {
    nftContract,
    tokenId,
    priceMutez,
    amount = 1,
    saleSplits = [],          // accepts {address, percent} OR {address, bps}
    royaltySplits = [],       // accepts {address, percent} OR {address, bps}
    startDelay = 0,
    offline_balance = false,  // some deployments require this flag
    sellerAddress,            // optional; if provided we auto-ensure operator
  },
) {
  const c = await getMarketContract(toolkit);
  const amt = Number(amount);
  const tokId = Number(tokenId);
  const delay = Number(startDelay);
  const price = Number(priceMutez);

  // Normalize splits to expected wire shape
  const sale = normalizeSplitArray(saleSplits);
  let royalty = clampRoyaltyTotal(normalizeSplitArray(royaltySplits));

  // Ensure seller receives deterministic remainder to 100%
  const used = sale.reduce((t, s) => t + (Number(s.percent) || 0), 0);
  if (sellerAddress && used < 10000) {
    sale.push({ address: sellerAddress, percent: 10000 - used });
  }

  // Resolve entrypoint functions
  const getObjMeth = () => c.methodsObject?.list_token || c.methodsObject?.['list_token'];
  const getPosMeth = () => c.methods?.list_token || c.methods?.['list_token'];
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

  // 1) Object call (preferred; tolerant to field order)
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
    } catch { /* fall through to positional */ }
  }

  // 2) Positional calls — try all safe permutations
  if (!transferParams && typeof posMeth === 'function') {
    const tryPos = (...args) => {
      try { return posMeth(...args).toTransferParams(); } catch { return null; }
    };

    const candidates = [];
    if (offline_balance) {
      // A: offline BEFORE price
      candidates.push([amt, nftContract, true, price, royalty, sale, delay, tokId]);
      candidates.push([amt, nftContract, true, price, sale, royalty, delay, tokId]);
      // B: offline AFTER price
      candidates.push([amt, nftContract, price, true, royalty, sale, delay, tokId]);
      candidates.push([amt, nftContract, price, true, sale, royalty, delay, tokId]);
    } else {
      // No offline flag
      candidates.push([amt, nftContract, price, royalty, sale, delay, tokId]);
      candidates.push([amt, nftContract, price, sale, royalty, delay, tokId]);
    }

    for (const args of candidates) {
      transferParams = tryPos(...args);
      if (transferParams) break;
    }
  }

  if (!transferParams) {
    throw new Error('list_token entrypoint unavailable or signature mismatch');
  }

  // Build final tx array and (optionally) prepend update_operators
  const txs = [{ kind: OpKind.TRANSACTION, ...transferParams }];

  if (sellerAddress) {
    try {
      const operatorAddr = c.address; // marketplace must be operator
      const upd = await ensureOperatorForId(toolkit, {
        nftContract,
        owner: sellerAddress,
        operator: operatorAddr,
        tokenId: tokId,
      });
      if (upd) txs.unshift(upd);
    } catch {
      // If the probe fails we still proceed with list; chain will error if operator missing.
    }
  }

  return txs;
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

/** Single‑account FA2 balance via TzKT. */
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
    writeCache(account, nftContract, tokenId, 0);
    return 0;
  }
}

/** Batch balances for multiple sellers of the same token. */
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
    for (const r of rows || []) {
      const addr = r?.account?.address || r?.account;
      const bal = Number(r?.balance ?? 0);
      if (typeof addr === 'string') {
        out.set(addr, bal);
        writeCache(addr, nftContract, tokenId, bal);
      }
    }
    for (const a of slice) if (!out.has(a)) { out.set(a, 0); writeCache(a, nftContract, tokenId, 0); }
  }
  return out;
}

/** Filter listings to those where seller still has >= amount balance. */
export async function filterStaleListings(_toolkit, listings) {
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
  for (const [, arr] of groups) {
    const { kt, id } = arr[0];
    const sellers = [...new Set(arr.map((x) => x.seller))];
    const map = await getFa2BalancesForAccounts(sellers, kt, id);
    for (const row of arr) {
      const bal = Number(map.get(row.seller) ?? 0);
      if (bal >= row.amount) keep.push(row.ref);
    }
  }
  return keep;
}

/** Preflight guard: verify the seller still has at least `amount` balance for (contract, tokenId).
 *  Throws an Error tagged with code 'STALE_LISTING_NO_BALANCE' when insufficient.
 *  Note: `toolkit` param kept for API parity; network is derived inside getFa2BalanceViaTzkt via TZKT_BASE.
 */
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

/* What changed & why:
   • Restored/kept the entire marketplace API surface.
   • Added robust discovery fallback: off‑chain view + TzKT big‑map
     if on‑chain listings view returns empty (transiently).
   • Retained operator auto‑prepend for single‑sig list, split
     normalization, and TzKT stale‑listing guards.
   • fetchLowestListing now returns null only when none of the three
     sources report an active row (guarded). */
