/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/marketplaceHelper.js
  Rev :    r2    2025‑10‑09
  Summary(of what this file does): Lightweight, network‑aware
           marketplace helper to count active listings for a
           collection.  Uses a **single** TzKT big‑map scan
           (listings_active → listings → collection_listings)
           with robust shape discovery, then falls back to per‑
           token probes only if needed.  No Taquito/toolkit req.
──────────────────────────────────────────────────────────────*/

import { jFetch } from './net.js';
import {
  NETWORK_KEY,
  MARKETPLACE_ADDRESSES,
  MARKETPLACE_ADDRESS,
  TZKT_API,
} from '../config/deployTarget.js';
import { tzktBase as tzktBaseForNet } from '../utils/tzkt.js';

/*──────────────── invariants & helpers ─────────────────────*/

/** Normalize a TzKT base that **ends with /v1** (no double /v1). */
function tzktV1(net = NETWORK_KEY) {
  try {
    const b = tzktBaseForNet?.(net);
    if (typeof b === 'string' && /\/v1\/?$/.test(b)) return b.replace(/\/+$/, '');
  } catch { /* ignore */ }
  if (typeof TZKT_API === 'string' && TZKT_API) {
    const base = TZKT_API.replace(/\/+$/, '');
    return base.endsWith('/v1') ? base : `${base}/v1`;
  }
  return /ghostnet/i.test(String(net))
    ? 'https://api.ghostnet.tzkt.io/v1'
    : 'https://api.tzkt.io/v1';
}

export const marketplaceAddr = (net = NETWORK_KEY) => {
  const key = /mainnet/i.test(String(net)) ? 'mainnet' : 'ghostnet';
  return (MARKETPLACE_ADDRESSES?.[key] || MARKETPLACE_ADDRESSES?.ghostnet || MARKETPLACE_ADDRESS || '').trim();
};

const safeMarketplaceAddress = (net = NETWORK_KEY) =>
  String(MARKETPLACE_ADDRESS || marketplaceAddr(net) || '').trim();

const isKt = (s) => /^KT1[0-9A-Za-z]{33}$/i.test(String(s || ''));

/*──────────────── TzKT discovery ───────────────────────────*/

/** Probe marketplace big‑maps; return ptrs (ids) for likely paths. */
async function probeMarketIndexes(TZKT_V1, market) {
  try {
    const rows = await jFetch(`${TZKT_V1}/contracts/${market}/bigmaps?select=path,ptr,id,active&limit=200`, 1);
    const out = {};
    for (const r of rows || []) {
      const path = r?.path || r?.name || '';
      const ptr  = Number(r?.ptr ?? r?.id);
      if (!Number.isFinite(ptr)) continue;
      if (path === 'listings_active') out.listings_active = ptr; // preferred
      if (path === 'listings')        out.listings = ptr;
      if (path === 'collection_listings') out.collection_listings = ptr;
    }
    return out;
  } catch { return {}; }
}

function* walkListings(value, depth = 0) {
  if (!value || depth > 4) return;
  const v = value;
  const looksListing =
    typeof v === 'object' &&
    ('price' in v || 'priceMutez' in v) &&
    ('token_id' in v || 'tokenId' in v || 'token' in v);
  if (looksListing) { yield v; return; }
  if (Array.isArray(v)) { for (const it of v) yield* walkListings(it, depth + 1); return; }
  if (typeof v === 'object') { for (const it of Object.values(v)) yield* walkListings(it, depth + 1); }
}

function normalizeTokenId(v) {
  const id = Number(v?.token_id ?? v?.tokenId ?? v?.token?.token_id ?? v?.token?.id);
  return Number.isFinite(id) ? id : null;
}

function isActiveListing(v) {
  // Big‑map `listings_active` implies active; keep permissive checks for others.
  const flag = v?.active ?? v?.is_active;
  return (flag == null) ? true : !!flag;
}

/*──────────────── fast, collection‑wide scan ───────────────*/

/**
 * Return a Set of tokenIds in `nftContract` that currently have at least
 * one active listing, by scanning the marketplace big‑maps directly.
 * This makes at most **one** HTTP request when listings_active is present.
 */
async function scanActiveTokenIdsForCollection(nftContract, net = NETWORK_KEY) {
  if (!isKt(nftContract)) return new Set();
  const market = safeMarketplaceAddress(net);
  if (!isKt(market)) return new Set();

  const TZKT_V1 = tzktV1(net);
  const idx = await probeMarketIndexes(TZKT_V1, market);
  const ids = new Set();

  // 1) Preferred: listings_active (already filtered to active)
  if (idx.listings_active) {
    // Try a few likely property names for the contract pointer in value
    const candidates = [
      `value.nft_contract=${nftContract}`,
      `value.contract=${nftContract}`,
      `value.collection=${nftContract}`,
    ];
    let rows = [];
    for (const c of candidates) {
      const qs = `${c}&select=value&limit=10000`;
      rows = await jFetch(`${TZKT_V1}/bigmaps/${idx.listings_active}/keys?${qs}`, 1).catch(() => []);
      if (Array.isArray(rows) && rows.length) break;
    }
    for (const r of rows || []) {
      const id = normalizeTokenId(r);
      if (id != null) ids.add(id);
      // If TzKT returns nested values (rare), walk and collect.
      for (const l of walkListings(r)) {
        const tid = normalizeTokenId(l);
        if (tid != null && isActiveListing(l)) ids.add(tid);
      }
    }
  }

  // 2) Fallback: listings (need to check active flag)
  if (!ids.size && idx.listings) {
    const candidates = [
      `active=true&value.nft_contract=${nftContract}`,
      `active=true&value.contract=${nftContract}`,
      `active=true&value.collection=${nftContract}`,
    ];
    let rows = [];
    for (const c of candidates) {
      const qs = `${c}&select=value&limit=10000`;
      rows = await jFetch(`${TZKT_V1}/bigmaps/${idx.listings}/keys?${qs}`, 1).catch(() => []);
      if (Array.isArray(rows) && rows.length) break;
    }
    // If still empty, broad-scan and filter in JS (expensive but bounded ≤10k).
    if (!Array.isArray(rows) || !rows.length) {
      const broad = await jFetch(`${TZKT_V1}/bigmaps/${idx.listings}/keys?active=true&select=value&limit=10000`, 1).catch(() => []);
      rows = (broad || []).filter((v) => {
        const c = v?.nft_contract || v?.contract || v?.collection;
        return String(c) === nftContract;
      });
    }
    for (const r of rows || []) {
      const id = normalizeTokenId(r);
      if (id != null && isActiveListing(r)) ids.add(id);
      for (const l of walkListings(r)) {
        const tid = normalizeTokenId(l);
        if (tid != null && isActiveListing(l)) ids.add(tid);
      }
    }
  }

  // 3) Last resort: collection_listings → walk nested values
  if (!ids.size && idx.collection_listings) {
    const q1 = new URLSearchParams({ key: nftContract, select: 'value', limit: '10000' });
    const rows = await jFetch(`${TZKT_V1}/bigmaps/${idx.collection_listings}/keys?${q1}`, 1).catch(() => []);
    for (const r of rows || []) {
      for (const l of walkListings(r)) {
        const tid = normalizeTokenId(l);
        if (tid != null && isActiveListing(l)) ids.add(tid);
      }
    }
  }
  return ids;
}

/*──────────────── public API ───────────────────────────────*/

/**
 * Count distinct tokenIds in `tokenIds` (optional) that are actively listed
 * on the configured marketplace for the given network.  When tokenIds is
 * omitted, returns the total for the whole collection.
 */
export async function countActiveListingsForCollection(nftContract, tokenIds = [], net = NETWORK_KEY) {
  // Fast path: collection‑wide scan
  const activeSet = await scanActiveTokenIdsForCollection(nftContract, net);

  if (activeSet.size === 0) {
    // Nothing found — either no listings or an index mismatch.
    // As a safety net, probe per‑token for the provided ids (if any).
    if (Array.isArray(tokenIds) && tokenIds.length) {
      let count = 0;
      for (const id of [...new Set(tokenIds.map(Number).filter(Number.isFinite))]) {
        try {
          const ids = await scanActiveTokenIdsForCollection(nftContract, net);
          if (ids.has(Number(id))) count += 1;
        } catch { /* ignore this id */ }
      }
      return count;
    }
    return 0;
  }

  // Intersect with provided tokenIds if present
  if (Array.isArray(tokenIds) && tokenIds.length) {
    const only = new Set(tokenIds.map(Number).filter(Number.isFinite));
    let n = 0;
    activeSet.forEach((id) => { if (only.has(id)) n += 1; });
    return n;
  }
  return activeSet.size;
}

/* What changed & why (r2):
   • New fast collection‑wide scan via listings_active → listings →
     collection_listings with shape fallbacks; avoids per‑token loops.
   • Normalized tzkt base using utils.tzktBase() when available; fixed
     double-/v1 risk; maintained network‑scoped address selection.
   • Returned a strict intersection when tokenIds are supplied. */
