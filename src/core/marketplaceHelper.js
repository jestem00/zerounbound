/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/marketplaceHelper.js
  Rev :    r3    2025‑10‑10
  Summary: Marketplace helpers for collection listing counts.
           1) Prefer ZeroSum on‑chain TZIP‑16 view executed via
              TzKT endpoint (no wallet/toolkit required).
           2) Fallback to big‑map scanning (listings_active →
              listings → collection_listings).
           Normalises results to {tokenId, priceMutez, amount, seller}.
──────────────────────────────────────────────────────────────*/

import { jFetch } from './net.js';
import {
  NETWORK_KEY,
  MARKETPLACE_ADDRESSES,
  MARKETPLACE_ADDRESS,
  TZKT_API,
} from '../config/deployTarget.js';
import { tzktBase as tzktBaseForNet } from '../utils/tzkt.js';

/*──────────────── base helpers ─────────────────────────────*/

const isKt = (s) => /^KT1[0-9A-Za-z]{33}$/i.test(String(s || ''));
const isTz = (s) => /^tz[0-9A-Za-z]{34}$/i.test(String(s || ''));

/** Normalise a TzKT base that ends with /v1 (no duplicate /v1). */
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

export function marketplaceAddr(net = NETWORK_KEY) {
  const key = /mainnet/i.test(String(net)) ? 'mainnet' : 'ghostnet';
  const explicit = (MARKETPLACE_ADDRESS || '').trim();
  const byMap = (MARKETPLACE_ADDRESSES?.[key] || MARKETPLACE_ADDRESSES?.ghostnet || '').trim();
  return explicit || byMap;
}

/*──────────────── view via TzKT ───────────────────────────*/

/** Walk any nested structure and yield likely listing objects. */
function* walkListings(value, depth = 0) {
  if (value == null || depth > 6) return;
  const v = value;
  const looksListing =
    typeof v === 'object' && v !== null &&
    ('price' in v || 'priceMutez' in v) &&
    ('token_id' in v || 'tokenId' in v || (v.token && ('token_id' in v.token || 'id' in v.token)));
  if (looksListing) {
    yield v;
    return;
  }
  if (Array.isArray(v)) { for (const it of v) yield* walkListings(it, depth + 1); return; }
  if (typeof v === 'object') { for (const it of Object.values(v)) yield* walkListings(it, depth + 1); }
}

/** Normalise one listing-ish record. Returns null when insufficient. */
function normListing(v) {
  if (!v || typeof v !== 'object') return null;
  const tokenId = Number(v.token_id ?? v.tokenId ?? v?.token?.token_id ?? v?.token?.id);
  const priceMutez = Number(v.priceMutez ?? v.price ?? v?.pricing?.price ?? v?.price_mutez);
  const amount = Number(v.amount ?? v.quantity ?? v.amountTokens ?? v?.qty ?? 0);
  const seller = String(v.seller ?? v.owner ?? v.address ?? v?.sellerAddress ?? '');
  const startTime = v.start_time ?? v.startTime ?? v.startedAt ?? null;
  const active =
    (v.active ?? v.is_active ?? v?.flags?.active ?? v?.status === 'active' ?? true);
  if (!Number.isFinite(tokenId) || !Number.isFinite(priceMutez) || priceMutez < 0 || amount <= 0) return null;
  return { tokenId, priceMutez, amount, seller, startTime, active: !!active };
}

/**
 * Execute the ZeroSum on‑chain view via TzKT:
 * /v1/contracts/{MARKET}/views/onchain_listings_for_collection?input=<addr>
 * Tries several input encodings to satisfy both micheline/json flavours.
 */
export async function fetchCollectionListingsViaView(nftContract, net = NETWORK_KEY) {
  const market = marketplaceAddr(net);
  if (!isKt(market) || !isKt(nftContract)) return [];
  const base = tzktV1(net).replace(/\/+$/, '');
  const urlBase = `${base}/contracts/${market}/views/onchain_listings_for_collection`;

  const attempts = [
    { input: nftContract, unlimited: 'true' },
    { input: `"${nftContract}"`, unlimited: 'true' },
    { input: JSON.stringify({ string: nftContract }), format: 'json', unlimited: 'true' },
  ];

  let data = null;
  for (const qsObj of attempts) {
    try {
      const qs = new URLSearchParams(qsObj);
      const res = await jFetch(`${urlBase}?${qs.toString()}`, 2).catch(() => null);
      if (res != null) { data = res; break; }
    } catch { /* try next */ }
  }
  if (data == null) return [];

  // Flatten into array of candidate listing objects.
  let entries = [];
  if (Array.isArray(data)) entries = data;
  else if (data && typeof data === 'object') {
    if (Array.isArray(data.result)) entries = data.result;
    else if (Array.isArray(data.values)) entries = data.values;
    else entries = Object.values(data);
  }

  const out = [];
  for (const e of entries) for (const l of walkListings(e)) {
    const n = normListing(l);
    if (n && n.active) out.push(n);
  }

  // Deduplicate per tokenId by lowest price.
  const byToken = new Map();
  for (const r of out) {
    const prev = byToken.get(r.tokenId);
    if (!prev || r.priceMutez < prev.priceMutez) byToken.set(r.tokenId, r);
  }

  return Array.from(byToken.values()).sort((a,b)=>a.tokenId-b.tokenId);
}

/*──────────────── big‑map fallback scan ───────────────────*/

/** Probe marketplace big‑maps; return ptrs for likely paths. */
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
      if (path === 'seller_listings') out.seller_listings = ptr;
      if (path === 'collection_listings') out.collection_listings = ptr;
    }
    return out;
  } catch { return {}; }
}

function normalizeTokenId(v) {
  const id = Number(v?.token_id ?? v?.tokenId ?? v?.token?.token_id ?? v?.token?.id);
  return Number.isFinite(id) ? id : null;
}

function isActiveListing(v) {
  const flag = v?.active ?? v?.is_active;
  return (flag == null) ? true : !!flag;
}

/** Fast collection‑wide scan returning Set of active tokenIds. */
async function scanActiveTokenIdsForCollection(nftContract, net = NETWORK_KEY) {
  if (!isKt(nftContract)) return new Set();
  const market = marketplaceAddr(net);
  if (!isKt(market)) return new Set();

  const TZKT_V1 = tzktV1(net);
  const idx = await probeMarketIndexes(TZKT_V1, market);
  const ids = new Set();

  // 1) listings_active (already filtered to active)
  if (idx.listings_active) {
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
      for (const l of walkListings(r)) {
        const tid = normalizeTokenId(l);
        if (tid != null && isActiveListing(l)) ids.add(tid);
      }
    }
  }

  // 2) listings (need to check active flag)
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

  // 3) collection_listings (walk nested)
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

/** Prefer the view; fall back to scanning. */
export async function getCollectionListings(nftContract, net = NETWORK_KEY) {
  const viaView = await fetchCollectionListingsViaView(nftContract, net).catch(() => []);
  if (Array.isArray(viaView) && viaView.length) return viaView;

  // Fallback to active tokenIds scan → convert to minimal listing rows without price.
  const activeIds = await scanActiveTokenIdsForCollection(nftContract, net).catch(() => new Set());
  return Array.from(activeIds).map((id) => ({ tokenId: id, priceMutez: NaN, amount: 0, seller: '' }));
}

/** Count number of distinct tokens for sale (view preferred). */
export async function countActiveListingsForCollection(nftContract, tokenIds = [], net = NETWORK_KEY) {
  const rows = await getCollectionListings(nftContract, net);
  if (!Array.isArray(rows) || rows.length === 0) return 0;

  // If tokenIds provided, intersect; else return unique count.
  const unique = new Set(rows.map((r) => Number(r.tokenId)).filter(Number.isFinite));
  if (Array.isArray(tokenIds) && tokenIds.length) {
    const only = new Set(tokenIds.map(Number).filter(Number.isFinite));
    let n = 0; unique.forEach((id) => { if (only.has(id)) n += 1; }); return n;
  }
  return unique.size;
}

/**
 * Fetch active listings for a given seller via TzKT big‑maps.
 * Uses `seller_listings` to discover (contract, tokenId, listing_nonce)
 * then reads the corresponding entry from `listings` for full details.
 * Returns normalised rows: { contract, tokenId, priceMutez, amount, seller, nonce, active }.
 */
export async function fetchSellerListingsViaTzkt(seller, net = NETWORK_KEY) {
  const addr = String(seller || '').trim();
  if (!isTz(addr)) return [];
  const market = marketplaceAddr(net);
  if (!isKt(market)) return [];

  const TZKT_V1 = tzktV1(net);
  const idx = await probeMarketIndexes(TZKT_V1, market);
  if (!idx.seller_listings || !idx.listings) return [];

  // 1) Read seller index for (kt, id, nonce)
  let refs = [];
  try {
    const row = await jFetch(`${TZKT_V1}/bigmaps/${idx.seller_listings}/keys/${encodeURIComponent(addr)}?select=value`, 1);
    if (Array.isArray(row)) refs = row;
    else if (row && typeof row === 'object') refs = [row];
  } catch { refs = []; }
  if (!refs.length) return [];

  // Group by (kt,id) to minimise requests
  const want = new Map(); // key -> Set(nonices)
  for (const r of refs) {
    const kt = String(r?.nft_contract || r?.contract || r?.collection || '').trim();
    const id = Number(r?.token_id ?? r?.tokenId ?? r?.token?.id);
    const n  = Number(r?.listing_nonce ?? r?.nonce ?? r?.id);
    if (!isKt(kt) || !Number.isFinite(id) || !Number.isFinite(n)) continue;
    const key = `${kt}|${id}`;
    const set = want.get(key) || new Set();
    set.add(n);
    want.set(key, set);
  }
  if (!want.size) return [];

  // 2) For each (kt,id), read listing map and extract desired nonces
  const out = [];
  for (const [key, nonces] of want.entries()) {
    const [kt, idStr] = key.split('|');
    const id = Number(idStr);
    try {
      const qs = new URLSearchParams({ 'key.address': kt, 'key.nat': String(id), select: 'value', limit: '1', active: 'true' });
      const rows = await jFetch(`${TZKT_V1}/bigmaps/${idx.listings}/keys?${qs}`, 1).catch(() => []);
      const holder = Array.isArray(rows) && rows[0]?.value ? rows[0].value : null;
      if (holder && typeof holder === 'object') {
        for (const n of nonces) {
          const listing = holder?.[String(n)];
          if (listing && typeof listing === 'object') {
            const price = Number(listing?.price ?? listing?.priceMutez);
            const amount = Number(listing?.amount ?? listing?.quantity ?? listing?.amountTokens ?? 0);
            const active = !!(listing?.active ?? listing?.is_active ?? true);
            const s = String(listing?.seller || addr);
            if (Number.isFinite(price) && amount > 0 && active) {
              out.push({ contract: kt, tokenId: id, priceMutez: price, amount, seller: s, nonce: n, active: true });
            }
          }
        }
      }
    } catch { /* skip this pair */ }
  }
  return out;
}

/** Execute onchain_listings_for_token via TzKT (robust input variants).
 * Returns: [{ contract, tokenId, priceMutez, amount, seller, nonce, active }]
 */
export async function fetchTokenListingsViaView(nftContract, tokenId, net = NETWORK_KEY) {
  const market = marketplaceAddr(net);
  if (!isKt(market) || !isKt(nftContract) || !Number.isFinite(Number(tokenId))) return [];
  const base = tzktV1(net).replace(/\/+$/, '');
  const urlBase = `${base}/contracts/${market}/views/onchain_listings_for_token`;

  const id = Number(tokenId);
  const attempts = [
    // Micheline JSON: (Pair address nat)
    { input: JSON.stringify({ prim: 'Pair', args: [{ string: nftContract }, { int: String(id) }] }), format: 'json', unlimited: 'true' },
    // Micheline JSON: (Pair nat address) — some ABIs flip order
    { input: JSON.stringify({ prim: 'Pair', args: [{ int: String(id) }, { string: nftContract }] }), format: 'json', unlimited: 'true' },
    // Michelson expression: (Pair "KT1.." 123)
    { input: `(Pair \"${nftContract}\" ${id})`, unlimited: 'true' },
  ];

  let raw = null;
  for (const qsObj of attempts) {
    try {
      const qs = new URLSearchParams(qsObj);
      raw = await jFetch(`${urlBase}?${qs.toString()}`, 1);
      if (raw != null) break;
    } catch { /* try next variant */ }
  }
  if (raw == null) return [];

  const out = [];
  const push = (n, v) => {
    if (!v || typeof v !== 'object') return;
    const contract = String(v.nft_contract || v.contract || v.collection || '');
    const tid = Number(v.token_id ?? v.tokenId ?? v?.token?.id ?? v?.token?.token_id ?? id);
    const seller = String(v.seller || v.owner || '');
    const price  = Number(v.priceMutez ?? v.price ?? 0);
    const amount = Number(v.amount ?? v.quantity ?? v.amountTokens ?? 0);
    const active = !!(v.active ?? v.is_active ?? true);
    // Prefer explicit nonce fields on the value; fall back to key for map-shaped results
    const nonce  = Number(v.nonce ?? v.listing_nonce ?? v.id ?? n);
    if (!isKt(contract) || !Number.isFinite(tid) || !Number.isFinite(price) || price < 0 || amount <= 0) return;
    out.push({ contract, tokenId: tid, seller, priceMutez: price, amount, nonce, active });
  };

  try {
    if (raw?.entries && typeof raw.entries === 'function') {
      for (const [k, v] of raw.entries()) push(k, v);
    } else if (Array.isArray(raw)) {
      raw.forEach((v, i) => push(i, v));
    } else if (raw && typeof raw === 'object') {
      for (const [k, v] of Object.entries(raw)) push(k, v);
    }
  } catch { /* ignore shape issues */ }

  return out.filter((r) => r.active && Number.isFinite(r.nonce));
}

/**
 * Resolve the canonical listing for a given (contract, tokenId, seller) by
 * scanning the `listings` big-map holder directly. Returns null if not found.
 * Shape: { contract, tokenId, priceMutez, amount, seller, nonce }
 */
export async function resolveSellerListingForToken(nftContract, tokenId, seller, net = NETWORK_KEY) {
  const kt = String(nftContract || '').trim();
  const id = Number(tokenId);
  const tz = String(seller || '').trim();
  if (!isKt(kt) || !Number.isFinite(id) || !isTz(tz)) return null;
  const market = marketplaceAddr(net);
  if (!isKt(market)) return null;

  const TZKT_V1 = tzktV1(net);
  const idx = await probeMarketIndexes(TZKT_V1, market);
  if (!idx.listings) return null;
  try {
    const qs = new URLSearchParams({ 'key.address': kt, 'key.nat': String(id), select: 'value', limit: '1', active: 'true' });
    const rows = await jFetch(`${TZKT_V1}/bigmaps/${idx.listings}/keys?${qs}`, 1).catch(() => []);
    const holder = Array.isArray(rows) && rows[0]?.value ? rows[0].value : null;
    if (holder && (typeof holder === 'object' || Array.isArray(holder))) {
      let chosen = null;
      const tzLc = tz.toLowerCase();
      if (Array.isArray(holder)) {
        for (const listing of holder) {
          if (!listing || typeof listing !== 'object') continue;
          const s = String(listing?.seller || listing?.owner || '');
          const price = Number(listing?.price ?? listing?.priceMutez);
          const amount = Number(listing?.amount ?? listing?.quantity ?? listing?.amountTokens ?? 0);
          const active = !!(listing?.active ?? listing?.is_active ?? true);
          const nonce = Number(listing?.nonce ?? listing?.listing_nonce ?? listing?.id);
          if (s.toLowerCase() !== tzLc || !Number.isFinite(price) || amount <= 0 || !active || !Number.isFinite(nonce)) continue;
          const row = { contract: kt, tokenId: id, priceMutez: price, amount, seller: s, nonce, active: true };
          if (!chosen || Number(row.nonce) > Number(chosen.nonce)) chosen = row;
        }
      } else {
        for (const [nonceKey, listing] of Object.entries(holder)) {
          if (!listing || typeof listing !== 'object') continue;
          const s = String(listing?.seller || listing?.owner || '');
          const price = Number(listing?.price ?? listing?.priceMutez);
          const amount = Number(listing?.amount ?? listing?.quantity ?? listing?.amountTokens ?? 0);
          const active = !!(listing?.active ?? listing?.is_active ?? true);
          if (String(s).toLowerCase() !== tzLc || !Number.isFinite(price) || amount <= 0 || !active) continue;
          const nonce = Number(nonceKey);
          if (!Number.isFinite(nonce)) continue;
          const row = { contract: kt, tokenId: id, priceMutez: price, amount, seller: s, nonce, active: true };
          if (!chosen || Number(row.nonce) > Number(chosen.nonce)) chosen = row;
        }
      }
      return chosen;
    }
  } catch { /* ignore */ }
  return null;
}

/** Verify a specific (contract, tokenId, seller, nonce) exists and is active via TzKT big-map. */
export async function verifyListingPairViaTzkt(nftContract, tokenId, seller, nonce, net = NETWORK_KEY) {
  const kt = String(nftContract || '').trim();
  const id = Number(tokenId);
  const tz = String(seller || '').trim();
  const nn = Number(nonce);
  if (!isKt(kt) || !Number.isFinite(id) || !isTz(tz) || !Number.isFinite(nn)) return null;
  const market = marketplaceAddr(net);
  if (!isKt(market)) return null;

  const TZKT_V1 = tzktV1(net);
  const idx = await probeMarketIndexes(TZKT_V1, market);
  if (!idx.listings) return null;
  try {
    const qs = new URLSearchParams({ 'key.address': kt, 'key.nat': String(id), select: 'value', limit: '1', active: 'true' });
    const rows = await jFetch(`${TZKT_V1}/bigmaps/${idx.listings}/keys?${qs}`, 1).catch(() => []);
    const holder = Array.isArray(rows) && rows[0]?.value ? rows[0].value : null;
    if (holder && typeof holder === 'object') {
      const listing = holder?.[String(nn)];
      if (listing && typeof listing === 'object') {
        const s = String(listing?.seller || listing?.owner || '');
        const price = Number(listing?.price ?? listing?.priceMutez);
        const amount = Number(listing?.amount ?? listing?.quantity ?? 0);
        const active = !!(listing?.active ?? listing?.is_active ?? true);
        if (s && s.toLowerCase() === tz.toLowerCase() && Number.isFinite(price) && amount > 0 && active) {
          return { contract: kt, tokenId: id, priceMutez: price, amount, seller: s, nonce: nn, active: true };
        }
      }
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Robust resolver for a seller’s listing nonce that also consults the
 * `collection_listings` holder when available. Some deployments keep
 * the canonical listing map there rather than under `listings`.
 * Returns: { contract, tokenId, priceMutez, amount, seller, nonce, active } | null
 */
export async function resolveSellerListingForTokenRobust(nftContract, tokenId, seller, net = NETWORK_KEY) {
  const kt = String(nftContract || '').trim();
  const id = Number(tokenId);
  const tz = String(seller || '').trim();
  if (!isKt(kt) || !Number.isFinite(id) || !isTz(tz)) return null;
  const market = marketplaceAddr(net);
  if (!isKt(market)) return null;

  const TZKT_V1 = tzktV1(net);
  const idx = await probeMarketIndexes(TZKT_V1, market);

  // 1) Prefer collection_listings: key is collection KT1; value is tokenId -> { nonce -> listing }
  if (idx.collection_listings) {
    try {
      let holder = null;
      // Try direct key then query variants
      try {
        holder = await jFetch(`${TZKT_V1}/bigmaps/${idx.collection_listings}/keys/${encodeURIComponent(kt)}?select=value`, 1);
      } catch {
        const variants = [
          `${TZKT_V1}/bigmaps/${idx.collection_listings}/keys?key=${encodeURIComponent(kt)}&select=value&limit=1`,
          `${TZKT_V1}/bigmaps/${idx.collection_listings}/keys?key.address=${encodeURIComponent(kt)}&select=value&limit=1`,
        ];
        for (const url of variants) { try { holder = await jFetch(url, 1); if (holder) break; } catch { /* next */ } }
        if (Array.isArray(holder)) holder = holder[0]?.value ?? holder[0] ?? null;
      }
      const tzLc = tz.toLowerCase();
      if (holder && typeof holder === 'object') {
        const bucket = holder[String(id)];
        const scanPairs = (obj) => {
          let best = null;
          for (const [nonceKey, listing] of Object.entries(obj || {})) {
            if (!listing || typeof listing !== 'object') continue;
            const s = String(listing?.seller || listing?.owner || '');
            const price = Number(listing?.price ?? listing?.priceMutez);
            const amount = Number(listing?.amount ?? listing?.quantity ?? listing?.amountTokens ?? 0);
            const active = !!(listing?.active ?? listing?.is_active ?? true);
            const nonce = Number(listing?.nonce ?? listing?.listing_nonce ?? nonceKey);
            if (s.toLowerCase() !== tzLc || !Number.isFinite(price) || amount <= 0 || !active || !Number.isFinite(nonce)) continue;
            const row = { contract: kt, tokenId: id, priceMutez: price, amount, seller: s, nonce, active: true };
            if (!best || Number(row.nonce) > Number(best.nonce)) best = row;
          }
          return best;
        };
        let chosen = null;
        if (bucket && typeof bucket === 'object') chosen = scanPairs(bucket);
        if (!chosen) {
          // Some shapes flatten token -> listing arrays; scan the whole holder conservatively
          for (const val of Object.values(holder)) {
            if (chosen) break;
            if (val && typeof val === 'object') {
              const tryOne = scanPairs(val);
              if (tryOne) chosen = tryOne;
            }
          }
        }
        if (chosen) return chosen;
      }
    } catch { /* continue */ }
  }

  // 2) Fallback to existing resolvers
  const viaListings = await resolveSellerListingForToken(nftContract, tokenId, seller, net).catch(() => null);
  if (viaListings) return viaListings;
  const viaIdx = await fetchSellerListingsViaTzkt(seller, net).catch(() => []);
  const match = (viaIdx || []).find((r) => String(r.contract) === kt && Number(r.tokenId) === id);
  return match || null;
}

/* What changed & why (r3):
   • Implemented fetchCollectionListingsViaView() that executes
     `onchain_listings_for_collection` through TzKT, handling multiple
     input encodings and heterogeneous result shapes.
   • Added getCollectionListings() (view preferred, fallback to scan).
   • Kept legacy big‑map scanning to preserve behaviour when views
     are unavailable. */
