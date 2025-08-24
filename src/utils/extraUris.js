/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/extraUris.js
  Rev :    r5     2025‑10‑24
  Summary: Centralized discovery/normalization of "extra URIs"
           for a given token.

           • First, call robust off‑chain views on the NFT contract
             (multiple common names supported). Results are returned
             exactly as { key, name, description, value, mime } with
             correct field mapping.
           • Then, merge in any extras discoverable directly from the
             token metadata (without overriding view results).
           • Always dedupe by value; keep first‑seen order stable.

           r5 highlights:
           – NEW: Off‑chain views discovery/execution (get_extrauris,
                  get_extra_uris, extrauris_for_token, get_extras_for_token,
                  get_token_extras, etc.) with both object + positional args.
           – FIX: When normalizing metadata objects, pass both name and key
                  so keys don’t overwrite names (bug that caused “jpeg” to
                  appear as the Name).
           – ENRICH: Always return { key, name, description, value, mime }.
──────────────────────────────────────────────────────────────*/

import { Tzip16Module, tzip16 } from '@taquito/tzip16';
import { jFetch } from '../core/net.js';
import { mimeFromDataUri } from './uriHelpers.js';
import { mimeFromFilename } from '../constants/mimeTypes.js';

/*──────────────────────── helpers ─────────────────────────*/

/** Safe lowercase helper. */
function lc(x) { return String(x || '').toLowerCase(); }

/** String coercion. */
function str(v) { return typeof v === 'string' ? v : ''; }

/** Best‑effort MIME detection. */
function detectMime(value = '', hint = '') {
  return (hint && String(hint)) || mimeFromDataUri(value) || mimeFromFilename(value) || '';
}

/**
 * Normalize one candidate into our canonical shape.
 * Returns null if not usable.
 */
function normOne(value, name = '', key = '', description = '', mimeHint = '') {
  const url = str(value).trim();
  if (!url) return null;
  if (/^about:blank$/i.test(url)) return null;

  const finalKey  = String(key || '').trim() || String(name || '').trim();
  const finalName = String(name || '').trim() || String(key || '').trim();
  const finalDesc = String(description || '').trim();

  return {
    key        : finalKey,
    name       : finalName,
    description: finalDesc,
    value      : url,
    mime       : detectMime(url, mimeHint),
  };
}

/** Push helper with inline de‑dupe by value (preserves first‑seen order). */
function pushUnique(arr, item) {
  if (!item) return;
  if (arr.some((e) => e.value === item.value)) return;
  arr.push(item);
}

/*──────────────────────── metadata scan ─────────────────────────*/
/**
 * Collect extra URIs from a decoded token metadata object.
 * Accepts multiple shapes:
 *  • extraUri / extra_uri: string | { uri|url|value, name, key, description }
 *  • extraUris / extra_uris / extras: array<string|object>
 *  • namespaced keys: extraUri:<label>, extra_uri_<n>, extrauri_<n> → string|object
 *  • formats[]: array<{ uri|url, name|label }>
 *
 * @param {object} meta Decoded token metadata (already de‑hexed)
 * @returns {Array<{key,name,description,value,mime}>}
 */
export function collectExtraUrisFromMeta(meta = {}) {
  const out = [];

  const primarySet = new Set(
    [
      meta.artifactUri,  meta.artifact_uri,
      meta.displayUri,   meta.display_uri,
      meta.thumbnailUri, meta.thumbnail_uri,
      meta.imageUri,     meta.image,
    ]
      .filter(Boolean)
      .map(String),
  );

  const push = (val, name = '', key = '', description = '', mimeHint = '') => {
    const n = normOne(val, name, key, description, mimeHint);
    if (!n) return;
    if (primarySet.has(n.value)) return;      // exclude primaries
    pushUnique(out, n);
  };

  // 1) Straight keys (string or object)
  const straightKeys = ['extraUri', 'extra_uri', 'extraURL', 'extra_urls'];
  for (const k of straightKeys) {
    const v = meta[k];
    if (!v) continue;
    if (typeof v === 'string') push(v, k, k);
    else if (typeof v === 'object') {
      push(v.uri ?? v.url ?? v.value ?? '', v.name ?? v.title ?? k, v.key ?? k, v.description ?? '', v.mime);
    }
  }

  // 2) Arrays of extras
  const arrs = [];
  if (Array.isArray(meta.extraUris))  arrs.push(meta.extraUris);
  if (Array.isArray(meta.extra_uris)) arrs.push(meta.extra_uris);
  if (Array.isArray(meta.extras))     arrs.push(meta.extras);

  for (const arr of arrs) {
    for (const it of arr) {
      if (!it) continue;
      if (typeof it === 'string') {
        push(it, '', '', '');
      } else if (typeof it === 'object') {
        const val = it.uri ?? it.url ?? it.value ?? '';
        const name = it.name ?? it.title ?? '';
        const key  = it.key ?? name ?? '';
        const desc = it.description ?? it.desc ?? it.notes ?? '';
        push(val, name, key, desc, it.mime);
      }
    }
  }

  // 3) Namespaced keys starting with "extra"
  if (meta && typeof meta === 'object') {
    for (const [k, v] of Object.entries(meta)) {
      const keyLc = lc(k);
      if (!keyLc.startsWith('extra')) continue;
      if (typeof v === 'string') {
        push(v, '', k, '');
      } else if (v && typeof v === 'object') {
        const val = v.uri ?? v.url ?? v.value ?? '';
        const name = v.name ?? v.title ?? '';
        const desc = v.description ?? v.desc ?? v.notes ?? '';
        // Preserve the *actual* property name as the key if caller didn't set one.
        push(val, name, v.key ?? k, desc, v.mime);
      }
    }
  }

  // 4) formats[] — sometimes used for alternates
  if (Array.isArray(meta.formats)) {
    let idx = 0;
    for (const f of meta.formats) {
      if (!f || typeof f !== 'object') continue;
      const cand = f.uri ?? f.url ?? '';
      if (!cand) continue;
      // Stable synthetic key for formats
      const label = f.label ?? f.name ?? mimeFromFilename(cand) ?? '';
      push(cand, label, `format:${String(idx).padStart(2, '0')}`, '', f.mime);
      idx += 1;
    }
  }

  return out;
}

/*──────────────────────── off‑chain view discovery ─────────────────────────*/

/** Ensure toolkit has tzip16 extension. */
function ensureTzip16(toolkit) {
  if (!toolkit) return null;
  try { toolkit.addExtension?.(new Tzip16Module()); } catch {/* already added or not needed */}
  return toolkit;
}

/** Try to execute a TZIP‑16 view factory with several argument shapes. */
async function tryExecuteView(factory, tokenId) {
  const vf = typeof factory === 'function' ? factory() : null;
  if (!vf || typeof vf.executeView !== 'function') return null;

  // Ordered attempts — accept the first successful, truthy result
  const argsList = [
    undefined,                                   // no arguments
    Number(tokenId),                              // positional (token_id)
    { token_id: Number(tokenId) },                // named
    { tokenId: Number(tokenId) },
    { id: Number(tokenId) },
    { tid: Number(tokenId) },
    { token: Number(tokenId) },
  ];

  for (const args of argsList) {
    try {
      const res = await vf.executeView(args);
      if (res != null) return res;
    } catch { /* try next shape */ }
  }
  return null;
}

/** Find the most likely extra‑uris view on a contract’s TZIP‑16 metadata. */
function pickExtraView(viewsObj = {}) {
  // Keys ordered by priority; both token‑specific and generic are supported.
  const candidates = [
    'extrauris_for_token',
    'extra_uris_for_token',
    'get_extrauris_for_token',
    'get_extra_uris_for_token',
    'get_extras_for_token',
    'get_token_extras',
    'token_extras',
    'extras_for_token',
    'extras_by_token',
    'extrauris',
    'extra_uris',
    'get_extrauris',
    'get_extra_uris',
    'get_extras',
    'extras',
  ];

  const keys = Object.keys(viewsObj || {});
  for (const name of candidates) {
    const found = keys.find((k) => lc(k) === name);
    if (found && typeof viewsObj[found] === 'function') {
      return { name: found, factory: viewsObj[found] };
    }
  }
  // Heuristic fallback: any view containing "extra" is better than nothing
  const fuzzy = keys.find((k) => lc(k).includes('extra') && typeof viewsObj[k] === 'function');
  return fuzzy ? { name: fuzzy, factory: viewsObj[fuzzy] } : null;
}

/** Normalize arbitrary view return values into [{ key, name, description, value, mime }]. */
function normalizeViewResult(raw, tokenId) {
  const out = [];
  const push = (val, name = '', key = '', description = '', mimeHint = '') =>
    pushUnique(out, normOne(val, name, key, description, mimeHint));

  const tryObjectLike = (obj) => {
    // 1) Array of descriptor objects/strings
    if (Array.isArray(obj)) {
      obj.forEach((it, i) => {
        if (!it) return;
        if (typeof it === 'string') {
          push(it, '', '', '');
        } else if (typeof it === 'object') {
          const val = it.value ?? it.uri ?? it.url ?? '';
          const name = it.name ?? it.title ?? it.label ?? '';
          const key  = it.key ?? it.id ?? it.slug ?? name ?? `extra:${i}`;
          const desc = it.description ?? it.desc ?? it.notes ?? '';
          push(val, name, key, desc, it.mime);
        }
      });
      return;
    }

    // 2) Map‑ish with entries()
    if (obj?.entries && typeof obj.entries === 'function') {
      for (const [k, v] of obj.entries()) {
        if (!v) continue;
        if (typeof v === 'string') {
          push(v, '', String(k), '');
        } else if (typeof v === 'object') {
          push(v.value ?? v.uri ?? v.url ?? '', v.name ?? v.title ?? '', String(v.key ?? k), v.description ?? v.desc ?? '', v.mime);
        }
      }
      return;
    }

    // 3) Object map keyed by tokenId → array/obj/string
    //    or flat object keyed by extra‑keys → descriptor/string
    const keys = Object.keys(obj || {});
    if (!keys.length) return;

    // If looks like { "123": [...] } then select by tokenId
    if (keys.every((k) => /^\d+$/.test(k))) {
      const arr = obj[String(Number(tokenId))] ?? obj[String(tokenId)];
      if (arr != null) tryObjectLike(arr);
      return;
    }

    // Otherwise treat each property as an extra entry
    for (const k of keys) {
      const v = obj[k];
      if (!v) continue;
      if (typeof v === 'string') {
        push(v, '', k, '');
      } else if (typeof v === 'object') {
        push(v.value ?? v.uri ?? v.url ?? '', v.name ?? v.title ?? '', String(v.key ?? k), v.description ?? v.desc ?? '', v.mime);
      }
    }
  };

  tryObjectLike(raw);
  return out;
}

/**
 * Fetch extra URIs via the NFT contract’s off‑chain (TZIP‑16) view.
 * Returns a normalized array or [] on failure.
 */
async function fetchExtraUrisViaViews({ toolkit, addr, tokenId }) {
  if (!toolkit || !addr) return [];
  ensureTzip16(toolkit);

  try {
    const c = await toolkit.contract.at(addr, tzip16);
    const views = await c.tzip16().metadataViews();
    const picked = pickExtraView(views);
    if (!picked) return [];

    const raw = await tryExecuteView(picked.factory, tokenId);
    if (raw == null) return [];

    return normalizeViewResult(raw, tokenId);
  } catch {
    return [];
  }
}

/*──────────────────────── public API ─────────────────────────*/

/**
 * HIGH‑LEVEL: return the best set of extras for (addr, tokenId)
 * in the canonical shape { key, name, description, value, mime }.
 *
 * Order of discovery:
 *   1) Off‑chain (TZIP‑16) view on the NFT contract.
 *   2) Token metadata scan as robust fallback.
 *   3) Optional in‑flight metadata fetch via TzKT when meta not supplied.
 */
export async function fetchExtraUris({ toolkit, addr, tokenId, apiBase, meta } = {}) {
  // 1) Off‑chain view (preferred)
  let viaViews = [];
  try { viaViews = await fetchExtraUrisViaViews({ toolkit, addr, tokenId }); } catch { viaViews = []; }

  // 2) Metadata (caller can pass; otherwise we best‑effort fetch)
  let m = meta;
  if (!m) {
    try {
      const url = `${(apiBase || 'https://api.tzkt.io/v1').replace(/\/+$/,'')}/tokens?contract=${addr}&tokenId=${tokenId}&limit=1`;
      const [row] = await jFetch(url).catch(() => []);
      m = row && typeof row.metadata === 'object' ? row.metadata : {};
    } catch { m = {}; }
  }
  const viaMeta = collectExtraUrisFromMeta(m || {});

  // 3) Merge with stability: view results first, then add non‑duplicates from meta
  const out = [];
  const push = (e) => pushUnique(out, e);
  viaViews.forEach(push);
  viaMeta.forEach(push);

  return out;
}

export default fetchExtraUris;
/* EOF */
