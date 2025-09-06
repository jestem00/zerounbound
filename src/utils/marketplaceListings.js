/*Developed by @jams2blues
  File: src/utils/marketplaceListings.js
  Rev:  r62
  Summary: Restore marketplace discovery: probe both `collection_listings`
           and `listings` big‑maps; resilient pointer & shape handling;
           no network hard‑assumptions; preserves r7 page behaviour. */

import { NETWORK_KEY } from '../config/deployTarget.js';
import { marketplaceAddr } from '../core/marketplace.js';
import { jFetch } from '../core/net.js';

/*──────── dynamic TzKT base resolver (no `/v1`) ─────────────*/
const tzktBaseForNet = (net = NETWORK_KEY) =>
  /mainnet/i.test(net) ? 'https://api.tzkt.io' : 'https://api.ghostnet.tzkt.io';

/*──────── helpers ───────────*/
const isKt = (s) => typeof s === 'string' && /^KT1[0-9A-Za-z]{33}$/.test(s);

/** Extract a KT1 address from heterogeneous TzKT key shapes. */
function addrFromKey(key) {
  if (isKt(key)) return key;
  if (key && typeof key === 'object') {
    if (isKt(key.address)) return key.address;
    if (isKt(key.value)) return key.value;
    // Some shapes encode Michelson pairs as arrays/objects; try common fields
    if (Array.isArray(key)) {
      for (const item of key) {
        if (isKt(item)) return item;
        if (item && typeof item === 'object') {
          const v = item.address || item.value || item.string;
          if (isKt(v)) return v;
        }
      }
    } else {
      const v = key.string || key.bytes || key.prim;
      if (isKt(v)) return v;
    }
  }
  return '';
}

/** Probe a marketplace for relevant big‑maps; return pointers if found. */
async function probeMarketIndexes(base, market) {
  try {
    const rows = await jFetch(
      `${base}/v1/contracts/${market}/bigmaps?select=path,ptr,id,active&limit=200`,
      1,
    );
    const out = {};
    for (const r of rows || []) {
      const path = r?.path || r?.name || '';
      const ptr  = Number(r?.ptr ?? r?.id);
      if (!Number.isFinite(ptr)) continue;
      if (path === 'collection_listings') out.collection_listings = ptr;
      if (path === 'listings') out.listings = ptr;
    }
    return out;
  } catch {
    return {};
  }
}

/** Select a set of viable market indices for a given network. */
async function resolveMarketIndices(net) {
  const base = tzktBaseForNet(net);
  const primary = marketplaceAddr(net);
  const markets = [primary]; // Keep it minimal & deterministic
  const results = [];
  for (const m of markets) {
    if (!isKt(m)) continue;
    const idx = await probeMarketIndexes(base, m);
    if (idx.collection_listings || idx.listings) {
      results.push({ market: m, base, idx });
    }
  }
  return results;
}

/** Walk an arbitrary nested map/array and yield listing objects. */
function* walkListings(value, depth = 0) {
  if (!value || depth > 3) return;
  const v = value;
  const looksListing =
    typeof v === 'object' &&
    ('price' in v || 'priceMutez' in v) &&
    ('token_id' in v || 'tokenId' in v || 'token' in v);

  if (looksListing) {
    yield v;
    return;
  }
  if (Array.isArray(v)) {
    for (const it of v) yield* walkListings(it, depth + 1);
    return;
  }
  if (typeof v === 'object') {
    for (const it of Object.values(v)) yield* walkListings(it, depth + 1);
  }
}

// Attempt to extract a numeric nonce from an arbitrary TzKT key shape
function extractNonceFromKey(key) {
  const tryNum = (x) => {
    const n = Number(x);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  if (key == null) return null;
  if (typeof key === 'number' || typeof key === 'string') return tryNum(key);
  if (Array.isArray(key)) {
    for (const it of key) {
      const n = extractNonceFromKey(it);
      if (n != null) return n;
    }
    return null;
  }
  if (typeof key === 'object') {
    // Common field names
    const cand = key.nonce ?? key.listing_nonce ?? key.id ?? key['2'];
    const n1 = tryNum(cand);
    if (n1 != null) return n1;
    // Search nested values
    for (const v of Object.values(key)) {
      const n = extractNonceFromKey(v);
      if (n != null) return n;
    }
  }
  return null;
}

/*──────── Public API ─────────*/

/**
 * Enumerate NFT contract addresses that currently have active listings.
 * Aggregates results from either `collection_listings` or `listings` big‑maps.
 */
export async function listActiveCollections(net = NETWORK_KEY, filterZeroContract = true) {
  const resolved = await resolveMarketIndices(net);
  const addrs = new Set();

  for (const { idx, base } of resolved) {
    // Preferred path: keys of collection_listings are collection KT1s
    if (idx.collection_listings) {
      try {
        const keys = await jFetch(
          `${base}/v1/bigmaps/${idx.collection_listings}/keys?active=true&select=key&limit=10000`,
          2,
        );
        for (const k of keys || []) {
          const addr = addrFromKey(k);
          if (isKt(addr)) addrs.add(addr);
        }
      } catch { /* ignore */ }
    }

    // Fallback path: keys of listings often encode collection in the key
    if (idx.listings) {
      try {
        const keys = await jFetch(
          `${base}/v1/bigmaps/${idx.listings}/keys?active=true&select=key&limit=10000`,
          2,
        );
        for (const k of keys || []) {
          const addr = addrFromKey(k);
          if (isKt(addr)) addrs.add(addr);
        }
      } catch { /* ignore */ }
    }
  }

  const unique = Array.from(addrs);
  if (!filterZeroContract) return unique;

  // Optional metadata filter; tolerant to failures
  const filtered = [];
  for (const kt of unique) {
    try {
      const meta = await jFetch(`${tzktBaseForNet(net)}/v1/contracts/${kt}/metadata`, 1);
      const ver = (meta?.version || meta?.ver || '') + '';
      const ifaces = meta?.interfaces || meta?.interface || [];
      const ok =
        /ZeroContract/i.test(ver) ||
        (Array.isArray(ifaces) &&
          ifaces.some((x) => /TZIP-?12/i.test(x)) &&
          ifaces.some((x) => /TZIP-?16/i.test(x)));
      if (ok) filtered.push(kt);
    } catch { /* ignore */ }
  }
  return filtered;
}

/**
 * Retrieve all active listings for a given collection via TzKT big‑maps.
 * Supports both `collection_listings` (keyed by collection KT1) and
 * `listings` (various key shapes). Returns lowest‑price per token id.
 */
export async function listListingsForCollectionViaBigmap(nftContract, net = NETWORK_KEY) {
  const resolved = await resolveMarketIndices(net);
  const byToken = new Map();

  const push = (tokenId, listing) => {
    const id = Number(tokenId);
    if (!Number.isFinite(id)) return;
    const active = !!(listing?.active ?? listing?.is_active ?? true);
    let price = Number(listing?.price ?? listing?.priceMutez);
    let amount = Number(listing?.amount ?? listing?.quantity ?? listing?.amountTokens ?? 0);
    if (!Number.isFinite(price) || !Number.isFinite(amount)) return;
    if (!active || amount <= 0) return;
    const prev = byToken.get(id);
    if (!prev || price < prev.priceMutez) {
      byToken.set(id, {
        contract: nftContract,
        tokenId: id,
        priceMutez: price,
        seller: listing?.seller,
        nonce: Number(listing?.nonce ?? listing?.listing_nonce ?? listing?.id ?? 0),
        amount,
        active: true,
      });
    }
  };

  for (const { idx, base } of resolved) {
    // Preferred: collection_listings → direct lookup by KT1 key
    if (idx.collection_listings) {
      // Attempt direct /keys/{key} first; fallback to query param
      let holder = null;
      try {
        holder = await jFetch(
          `${base}/v1/bigmaps/${idx.collection_listings}/keys/${encodeURIComponent(nftContract)}?select=value`,
          1,
        );
      } catch {
        // Fallback forms to accommodate different key serializers
        const variants = [
          `${base}/v1/bigmaps/${idx.collection_listings}/keys?key=${encodeURIComponent(
            nftContract,
          )}&select=value&limit=1`,
          `${base}/v1/bigmaps/${idx.collection_listings}/keys?key.address=${encodeURIComponent(
            nftContract,
          )}&select=value&limit=1`,
          `${base}/v1/bigmaps/${idx.collection_listings}/keys?key.value=${encodeURIComponent(
            nftContract,
          )}&select=value&limit=1`,
        ];
        for (const url of variants) {
          const rows = await jFetch(url, 1).catch(() => null);
          if (Array.isArray(rows) && rows[0]?.value) {
            holder = rows[0].value;
            break;
          }
        }
      }
      if (holder && typeof holder === 'object') {
        // holder: { [tokenId]: { [nonce]: listing } }
        for (const [tid, nonceMap] of Object.entries(holder)) {
          if (nonceMap && typeof nonceMap === 'object') {
            for (const listing of Object.values(nonceMap)) push(tid, listing);
          }
        }
      }
    }

    // Fallback: listings → scan active keys and filter to collection
    if (idx.listings) {
      let entries = [];
      // Try server‑side filter first
      const tryUrls = [
        `${base}/v1/bigmaps/${idx.listings}/keys?active=true&select=key,value&value.nft_contract=${encodeURIComponent(
          nftContract,
        )}&limit=10000`,
        `${base}/v1/bigmaps/${idx.listings}/keys?active=true&select=key,value&limit=10000`,
      ];
      for (const url of tryUrls) {
        entries = await jFetch(url, 1).catch(() => []);
        if (Array.isArray(entries) && entries.length) break;
      }
      for (const entry of entries) {
        const keyAddr = addrFromKey(entry?.key);
        if (!isKt(keyAddr) || keyAddr.toLowerCase() !== nftContract.toLowerCase()) continue;
        const val = entry?.value;
        // listings bigmap often returns: value = { [nonce]: listing }
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          const pairs = Object.entries(val);
          if (pairs.length) {
            for (const [nonceKey, listing] of pairs) {
              if (!listing || typeof listing !== 'object') continue;
              const tokenId = Number(listing.token_id ?? listing.tokenId ?? listing?.token?.id);
              if (!Number.isFinite(tokenId)) continue;
              if (listing.nonce == null && listing.listing_nonce == null) listing.nonce = Number(nonceKey); // eslint-disable-line no-param-reassign
              push(tokenId, listing);
            }
            continue;
          }
        }
        // Fallback: nested shapes
        for (const listing of walkListings(val)) {
          const tokenId = Number(listing.token_id ?? listing.tokenId ?? listing?.token?.id);
          push(tokenId, listing);
        }
      }
    }
  }

  return Array.from(byToken.values());
}

/* What changed & why: r62 — Fixed “no active listings” by tolerating both
   index names (`collection_listings` and `listings`), normalising TzKT key
   shapes, and walking nested values. Keeps r7 explore page contract. */
