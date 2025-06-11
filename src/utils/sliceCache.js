// File: src/utils/sliceCache.js
/* Developed by @jams2blues – ZeroContract slice-cache helper
   Summary: Resumable slice upload checkpoints + expiry purge */

const PREFIX = 'zuSliceCache';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** DJB2 string hash → uint32 */
export function strHash(s) {
  return s
    .split('')
    .reduce((h, c) => ((h << 5) + h) + c.charCodeAt(0), 5381) >>> 0;
}

function makeKey(addr, id, label = 'artifact') {
  return `${PREFIX}:${addr}:${id}:${label}`;
}

/** Load saved cache or null */
export function loadSliceCache(addr, id, label) {
  const item = localStorage.getItem(makeKey(addr, id, label));
  return item ? JSON.parse(item) : null;
}

/** Save checkpoint + timestamp */
export function saveSliceCache(addr, id, label, info) {
  const payload = { ...info, timestamp: Date.now() };
  localStorage.setItem(makeKey(addr, id, label), JSON.stringify(payload));
}

/** Remove one entry */
export function clearSliceCache(addr, id, label) {
  localStorage.removeItem(makeKey(addr, id, label));
}

/** Purge all entries older than maxAgeDays (default 1) */
export function purgeExpiredSliceCache(maxAgeDays = 1) {
  const now = Date.now();
  const maxAge = maxAgeDays * MS_PER_DAY;
  for (const k of Object.keys(localStorage)) {
    if (!k.startsWith(PREFIX)) continue;
    try {
      const { timestamp } = JSON.parse(localStorage.getItem(k) || '{}');
      if (typeof timestamp === 'number' && now - timestamp > maxAge) {
        localStorage.removeItem(k);
      }
    } catch {
      localStorage.removeItem(k);
    }
  }
}
