/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/zeroSumViews.js
  Rev :    r1   2025‑08‑27
  Summary(of what this file does): Thin, SSR‑safe wrappers around
           ZeroSum marketplace TZIP‑16 views. Primary: fetch
           `onchain_listings_for_collection` (param: address),
           with robust fallbacks (TzKT/BCD) and strict, deduped
           normalization for UI consumption.
──────────────────────────────────────────────────────────────*/

import { NETWORK_KEY, MARKETPLACE_ADDRESSES, MARKETPLACE_ADDRESS, TZKT_API } from '../config/deployTarget.js';
import { jFetch } from './net.js';

/*──────── address + network helpers ─────────────────────────*/
const isKt = (s) => typeof s === 'string' && /^KT1[0-9A-Za-z]{33}$/i.test(s.trim());

export const marketplaceAddr = (net = NETWORK_KEY) => {
  const key = /mainnet/i.test(String(net)) ? 'mainnet' : 'ghostnet';
  return (MARKETPLACE_ADDRESSES?.[key] || MARKETPLACE_ADDRESSES?.ghostnet || MARKETPLACE_ADDRESS || '').trim();
};

const tzktV1Base = (net = NETWORK_KEY) => {
  const base = String(TZKT_API || (/mainnet/i.test(String(net)) ? 'https://api.tzkt.io' : 'https://api.ghostnet.tzkt.io')).replace(/\/+$/, '');
  return `${base}/v1`;
};

/*──────── shape guards & normalizers ────────────────────────*/
/** Convert MichelsonMap-esque / iterator / object-of-objects into a flat array */
function toArrayish(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v?.entries === 'function') {
    const out = [];
    for (const [, val] of v.entries()) out.push(val);
    return out;
  }
  if (typeof v === 'object') return Object.values(v);
  return [];
}

/** Safely pick a number (mutez or nat). */
function toNum(n, d = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : d;
}
/** Safely pick a bool with sensible default (active=true absent → true). */
function toBool(b, d = true) {
  return typeof b === 'boolean' ? b : d;
}
/** Normalize the many shapes we may see from toolkit/TzKT/BCD into one listing row. */
function normListing(x = {}) {
  if (!x || typeof x !== 'object') return null;

  // Common field aliases
  const tokenId =
    toNum(
      x.token_id ?? x.tokenId ?? x.token?.token_id ?? x.token?.id ?? x.id,
      NaN,
    );
  if (!Number.isFinite(tokenId)) return null;

  const priceMutez = toNum(
    x.priceMutez ?? x.price_mutez ?? x.price ?? x.amount_mutez ?? x.amountMutez,
    NaN,
  );
  if (!Number.isFinite(priceMutez)) return null;

  const amount = toNum(x.amount ?? x.balance ?? x.qty ?? 1, 1);
  const seller =
    (typeof x.seller === 'string' && x.seller) ||
    (x.seller && typeof x.seller === 'object' && (x.seller.address || x.seller.owner)) ||
    '';
  const startTime = x.start_time ?? x.startTime ?? x.listed_at ?? null;
  const active = toBool(x.active ?? x.is_active ?? x.listing_active ?? x.live, true);

  return { tokenId, priceMutez, amount, seller: String(seller || ''), startTime, active };
}

/** Deduplicate by tokenId, **keeping lowest price** for the UI. */
function dedupeLowest(list = []) {
  const byId = new Map();
  for (const row of list) {
    if (!row) continue;
    const prev = byId.get(row.tokenId);
    if (!prev || row.priceMutez < prev.priceMutez) byId.set(row.tokenId, row);
  }
  return Array.from(byId.values()).sort((a, b) => a.tokenId - b.tokenId);
}

/*──────── primary path: Taquito TZIP‑16 ─────────────────────*/
async function viaTzip16({ toolkit, market, nftContract }) {
  if (!toolkit || !market || !nftContract) return [];
  try {
    // Dynamic import (SSR‑safe) + extension register (idempotent)
    const mod = await import('@taquito/tzip16');
    const Tzip16Module = mod.Tzip16Module || mod.default?.Tzip16Module;
    const tzip16 = mod.tzip16 || mod.default?.tzip16;
    if (!Tzip16Module || !tzip16) return [];

    try { toolkit.addExtension(new Tzip16Module()); } catch { /* duplicate ok */ }
    const c = await toolkit.contract.at(market, tzip16);
    const t16 = typeof c.tzip16 === 'function' ? c.tzip16() : c.tzip16;

    const names = [
      'onchain_listings_for_collection',      // expected
      'listings_for_collection',              // alt
      'onchain_listings_for_collection_view', // defensive
    ];

    // Prefer metadataViews facade
    if (typeof t16?.metadataViews === 'function') {
      const views = await t16.metadataViews();
      for (const name of names) {
        const v = views?.[name];
        if (typeof v === 'function') {
          try {
            const res = await v().executeView(String(nftContract));
            const arr = toArrayish(res).map(normListing).filter(Boolean);
            if (arr.length) return arr;
          } catch { /* try next */ }
        }
      }
    }

    // Fallback to generic executeView
    if (typeof t16?.executeView === 'function') {
      for (const name of names) {
        try {
          const res = await t16.executeView(name, [String(nftContract)], undefined, { viewCaller: market });
          const arr = toArrayish(res).map(normListing).filter(Boolean);
          if (arr.length) return arr;
        } catch { /* next */ }
      }
    }
    return [];
  } catch {
    return [];
  }
}

/*──────── fallback path: TzKT `views` endpoint ───────────────*/
async function viaTzkt({ net = NETWORK_KEY, market, nftContract }) {
  try {
    const base = tzktV1Base(net);
    const names = [
      'onchain_listings_for_collection',
      'listings_for_collection',
    ];
    for (const name of names) {
      const url = `${base}/contracts/${encodeURIComponent(market)}/views/${encodeURIComponent(name)}?` +
                  new URLSearchParams({ input: String(nftContract), unlimited: 'true', format: 'json' }).toString();
      const raw = await jFetch(url, { method: 'GET' }).catch(() => null);
      if (!raw) continue;
      const arr = toArrayish(raw).map(normListing).filter(Boolean);
      if (arr.length) return arr;
    }
    return [];
  } catch { return []; }
}

/*──────── last‑resort path: BCD views ───────────────────────*/
async function viaBCD({ net = NETWORK_KEY, market, nftContract }) {
  try {
    const network = /ghostnet/i.test(String(net)) ? 'ghostnet' : 'mainnet';
    const url = `https://api.better-call.dev/v1/contract/${network}/${market}/views/onchain_listings_for_collection`;
    const qs  = new URLSearchParams({ input: String(nftContract) });
    const raw = await jFetch(`${url}?${qs.toString()}`, { method: 'GET' }).catch(() => null);
    if (!raw) return [];
    const arr = toArrayish(raw).map(normListing).filter(Boolean);
    return arr;
  } catch { return []; }
}

/*──────── public API ────────────────────────────────────────*/
/**
 * Fetch active listings for a collection (ZeroSum marketplace),
 * normalized for UI: [{ tokenId, priceMutez, amount, seller, startTime, active }]
 * Results are **deduped per tokenId** keeping the **lowest** price.
 *
 * It tries, in order: Taquito TZIP‑16 → TzKT views → BCD views.
 *
 * @param {Object} p
 * @param {object} p.toolkit  TezosToolkit instance (optional but preferred)
 * @param {string} p.nftContract Collection KT1
 * @param {string} [p.net=NETWORK_KEY]
 */
export async function fetchOnchainListingsForCollection({ toolkit, nftContract, net = NETWORK_KEY } = {}) {
  if (!isKt(nftContract)) return [];

  const market = marketplaceAddr(net);
  if (!isKt(market)) return [];

  // 1) TZIP‑16 via toolkit (client‑side)
  const v1 = await viaTzip16({ toolkit, market, nftContract });
  if (v1.length) return dedupeLowest(v1.filter((r) => r.active && r.amount > 0));

  // 2) TzKT HTTP
  const v2 = await viaTzkt({ net, market, nftContract });
  if (v2.length) return dedupeLowest(v2.filter((r) => r.active && r.amount > 0));

  // 3) BCD HTTP
  const v3 = await viaBCD({ net, market, nftContract });
  if (v3.length) return dedupeLowest(v3.filter((r) => r.active && r.amount > 0));

  return [];
}

/* What changed & why: r1 – New dedicated view executor that actually
   calls the ZeroSum TZIP‑16 `onchain_listings_for_collection` view,
   with resilient fallbacks and strict output normalization. */
//EOF
