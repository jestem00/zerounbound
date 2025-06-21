/*Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/sliceCacheV4a.js
  Rev :    r707   2025-06-13
  Summary: drop legacy duplicate block; keep single I60/I61-compliant
           implementation with back-compat shims.
─────────────────────────────────────────────────────────────*/

const PREFIX       = 'zuSliceCache';          /* localStorage key-root     */
const CHUNK_SIZE   = 32_768;                  /* raw-bytes per slice       */
const BYTES_MAX    = 5 * 1024 * 1024;         /* 5 MB hard cap             */
const BYTES_TARGET = 4 * 1024 * 1024;         /* shrink-to size on flush   */
const DAY_MS       = 86_400_000;              /* 24 h                      */

/*──────── helpers ───────────────────────────────────────────*/

/** Return `"ghostnet"` | `"mainnet"` by hostname. */
function detectNet () {
  if (typeof window === 'undefined') return 'ghostnet';
  return /ghostnet/i.test(window.location.hostname) ? 'ghostnet' : 'mainnet';
}

/** Build composite storage key. */
function keyOf (net, contract, tokenId, label = 'artifact') {
  return `${PREFIX}:${net}:${contract}:${tokenId}:${label}`;
}

/** Async SHA-256 digest → hex. */
async function sha256Hex (txt = '') {
  const buf  = new TextEncoder().encode(txt);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/*──────── size helpers ─────────────────────────────────────*/

function cacheBytes () {
  let n = 0;
  for (const k in localStorage) {
    if (k.startsWith(PREFIX)) n += k.length + localStorage.getItem(k).length;
  }
  return n;
}

function shrinkCache () {
  let total = cacheBytes();
  if (total <= BYTES_MAX) return;

  const items = [];
  for (const k in localStorage) {
    if (!k.startsWith(PREFIX)) continue;
    try {
      const { updated = 0 } = JSON.parse(localStorage.getItem(k) || '{}');
      items.push({ k, updated });
    } catch { localStorage.removeItem(k); }
  }
  items.sort((a, b) => a.updated - b.updated);       /* oldest first */
  for (const { k } of items) {
    localStorage.removeItem(k);
    total = cacheBytes();
    if (total <= BYTES_TARGET) break;
  }
}

/*──────── core API ─────────────────────────────────────────*/

/**
 * Load checkpoint or null.
 * @returns {object|null}
 */
export function loadSliceCheckpoint (
  contract,
  tokenId,
  label = 'artifact',
  net   = detectNet(),
) {
  try {
    const raw = localStorage.getItem(keyOf(net, contract, tokenId, label));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/**
 * Persist / merge checkpoint (idempotent).
 * `info` may supply either `next` or legacy `nextIdx`.
 */
export function saveSliceCheckpoint (
  contract,
  tokenId,
  label,
  info,
  net = detectNet(),
) {
  try {
    const now = Date.now();
    const rec = {
      tokenId : +tokenId,
      label,
      chunkSize: CHUNK_SIZE,
      updated  : now,
      ...info,
    };
    if (rec.next == null && rec.nextIdx != null) rec.next = rec.nextIdx;
    localStorage.setItem(
      keyOf(net, contract, tokenId, label),
      JSON.stringify(rec),
    );
    shrinkCache();
  } catch {/* quota / private-mode – ignore */}
}

/** Delete checkpoint. */
export function clearSliceCheckpoint (
  contract,
  tokenId,
  label = 'artifact',
  net   = detectNet(),
) {
  try { localStorage.removeItem(keyOf(net, contract, tokenId, label)); } catch {}
}

/*──────── hygiene (I61) ────────────────────────────────────*/

/**
 * Non-blocking purge – runs in micro-task.
 *  • updated ≥ 24 h
 *  • total === 0
 *  • hash mismatch
 *  • global size cap handled by shrinkCache()
 */
export function purgeExpiredSliceCache () {
  if (typeof window === 'undefined') return;        /* SSR */
  queueMicrotask(async () => {
    const now = Date.now();
    for (const k in localStorage) {
      if (!k.startsWith(PREFIX)) continue;
      let drop = false;
      let obj  = null;
      try { obj = JSON.parse(localStorage.getItem(k) || '{}'); } catch { drop = true; }

      if (!obj || typeof obj !== 'object') drop = true;
      else {
        if (now - (obj.updated || 0) >= DAY_MS) drop = true;
        if (!obj.total || obj.total === 0)      drop = true;

        /* hash integrity */
        if (!drop && obj.hash && Array.isArray(obj.slices) && obj.slices.length) {
          try {
            const fullHex = obj.slices.join('');
            const want    = String(obj.hash).replace(/^sha256:/i, '');
            const got     = await sha256Hex(fullHex);
            if (got !== want) drop = true;
          } catch { drop = true; }
        }
      }
      if (drop) try { localStorage.removeItem(k); } catch {}
    }
    shrinkCache();                                 /* enforce global cap */
  });
}

/*──────── legacy aliases (r590-r705 b/c) ───────────────────*/
export const loadSliceCache  = loadSliceCheckpoint;
export const saveSliceCache  = saveSliceCheckpoint;
export const clearSliceCache = clearSliceCheckpoint;

/** 32-bit DJB-2 hash – retained for UI checksum previews. */
export function strHash (s = '') {
  /* eslint-disable no-bitwise */
  return s.split('').reduce((h, c) => (h << 5) + h + c.charCodeAt(0), 5381) >>> 0;
}
/* EOF */
