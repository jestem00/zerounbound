/*Developed by @jams2blues
  File: src/utils/cache.js
  Rev: r12
  Summary: LocalStorage cache for lists & details with TTL. */

const _CACHE_KEY_INTERNAL = 'zu_contract_cache_v2';

/* read all cache (object of key -> { data, ts }) */
function readAll() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(_CACHE_KEY_INTERNAL);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

/* write entire object back (with a hard cap to keep size sane) */
function writeAll(obj) {
  if (typeof window === 'undefined') return;
  // keep only 200 newest entries
  const entries = Object.entries(obj).sort(([,a],[,b]) => (b?.ts||0) - (a?.ts||0)).slice(0, 200);
  try { localStorage.setItem(_CACHE_KEY_INTERNAL, JSON.stringify(Object.fromEntries(entries))); } catch {}
}

/** get raw cache entry { data, ts } */
export function getCache(key) {
  const all = readAll();
  return all[key] || null;
}

/** merge patch and bump ts */
export function patchCache(key, dataPatch) {
  if (typeof window === 'undefined') return;
  const all = readAll();
  const prev = all[key]?.data || {};
  all[key] = { data: { ...prev, ...dataPatch }, ts: Date.now() };
  writeAll(all);
}

/** remove everything */
export function nukeCache() {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(_CACHE_KEY_INTERNAL); } catch {}
}

/* list helpers used by ContractCarousels */
export const listKey = (kind, wallet, net) => `${kind}_${wallet}_${net}`;
export const getList = (k, ttlMs) => {
  const row = getCache(k);
  if (!row) return null;
  if (ttlMs && Date.now() - row.ts > ttlMs) return null;
  return row.data?.v || null;
};
export const cacheList = (k, v) => patchCache(k, { v });

export default { getCache, patchCache, nukeCache, listKey, getList, cacheList };

/* What changed & why:
   • Deterministic merge & TTL; shared across discovery/enrich. */ // EOF
