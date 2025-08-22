/*─────────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/contractMeta.js
  Rev:     r43  2025-08-21 UTC
  Summary: Back-compat restore + improvements.
           • Restores named export enrichContracts used by carousels
           • Keeps new fetchContractMeta (exact counts via computeTokenTotal)
           • Unifies cache on idbCache; preserves fast TzKT batching
──────────────────────────────────────────────────────────────────*/

import { getCache, patchCache }           from './idbCache.js';
import { tzktBase, contractsBatch }       from './tzkt.js';
import { typeHashToVersion }              from './allowedHashes.js';
import computeTokenTotal                  from './computeTokenTotal.js';
import countOwners                        from './countOwners.js';
import { jFetch }                         from '../core/net.js';

/** decode 0x… hex -> JSON object; safe */
export function decodeHexJson(hex = '') {
  try {
    const clean = String(hex).replace(/^0x/i, '');
    if (!clean) return {};
    const bytes = clean.match(/.{1,2}/g).map((b) => parseInt(b, 16));
    const str   = new TextDecoder('utf-8').decode(new Uint8Array(bytes));
    return JSON.parse(str);
  } catch { return {}; }
}

/** pick best image key from metadata */
export function pickBestImage(meta = {}) {
  const keys = ['imageUri', 'displayUri', 'thumbnailUri', 'image', 'logo', 'icon'];
  for (const k of keys) {
    const v = meta?.[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/*──────────────── internal helpers ───────────────────────────*/
async function fetchStorage(address, network) {
  const base = tzktBase(network);
  const url  = `${base}/contracts/${encodeURIComponent(address)}/storage`;
  return jFetch(url, 2);
}

/**
 * Public API (accurate counts): compact snapshot with tokens & owners.
 * Uses computeTokenTotal() for version-safe, burn-exclusive totals.
 *
 * @param {string} address KT1
 * @param {string} network 'mainnet' | 'ghostnet'
 */
export async function fetchContractMeta(address, network = 'mainnet') {
  if (!address) throw new Error('fetchContractMeta: missing address');

  const storage = await fetchStorage(address, network).catch(() => null);
  const tokens  = await computeTokenTotal(address, network, storage).catch(() => 0);
  const owners  = await countOwners(address, network).catch(() => 0);

  return {
    address,
    network,
    counts : { tokens, owners },
    storage,
  };
}

/**
 * Back-compat API for carousels:
 * Enrich [{address,typeHash,timestamp}] with (name,image,total,version,date).
 * • Fast path uses TzKT contractsBatch() → tokensCount
 * • Optional { exactTotals:true } routes to computeTokenTotal() per KT1
 *   (heavier; bounded by the caller’s usage)
 */
export async function enrichContracts(basics = [], network = 'mainnet', opts = {}) {
  const {
    force      = false,
    ttlMs      = 7 * 24 * 60 * 60 * 1000, // 7d
    exactTotals = false,                   // default: keep fast tokensCount
  } = opts;

  if (!Array.isArray(basics) || basics.length === 0) return [];

  // 1) Attempt to use per-address detail cache when fresh
  const want = [];
  const fromCache = [];
  for (const it of basics) {
    const row    = getCache(it.address);
    const detail = row?.data?.detail || null;
    const fresh  = detail && (!ttlMs || (Date.now() - (row?.ts || 0) < ttlMs));
    if (!force && fresh) {
      fromCache.push({ ...detail, total: Number.isFinite(detail.total) ? detail.total : null });
    } else {
      want.push(it.address);
    }
  }

  // 2) Fetch what we still need in batched calls (cheap + fast)
  let enriched = [];
  if (want.length) {
    const batched = await contractsBatch(want, network);
    enriched = await Promise.all(batched.map(async (r) => {
      const meta    = r.metadata || {};
      const name    = (meta.name && String(meta.name).trim()) || r.address;
      const image   = pickBestImage(meta);
      const version = typeHashToVersion(r.typeHash);
      const date    = r.lastActivityTime || r.firstActivityTime || null;

      // Prefer fast tokensCount; optionally compute exact total when requested
      let total = Number.isFinite(r.tokensCount) ? r.tokensCount : null;
      if (exactTotals && (total == null)) {
        total = await computeTokenTotal(r.address, network).catch(() => null);
      }

      const det = {
        address: r.address,
        typeHash: r.typeHash,
        name,
        description: meta.description || '',
        imageUri: image,
        total,
        version,
        date,
      };
      patchCache(r.address, { detail: det });
      return det;
    }));
  }

  // 3) Merge cache + fetched, fill gaps, and sort by activity date
  const byAddr = new Map([...fromCache, ...enriched].map((d) => [d.address, d]));

  for (const it of basics) {
    if (!byAddr.has(it.address)) {
      byAddr.set(it.address, {
        address    : it.address,
        typeHash   : it.typeHash,
        name       : it.address,
        description: '',
        imageUri   : null,
        total      : null,
        version    : typeHashToVersion(it.typeHash),
        date       : it.timestamp || null,
      });
    }
  }

  return [...byAddr.values()]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

/* Default export (object) preserved for older imports */
const api = { enrichContracts, fetchContractMeta, decodeHexJson, pickBestImage };
export default api;

/* What changed & why (r43):
   • Restored named export enrichContracts + default object (back‑compat)
   • Kept new fetchContractMeta (accurate tokens/owners via computeTokenTotal)
   • Switched to idbCache; fixed edge-cases; safe sorting & gap‑filling */
// EOF
