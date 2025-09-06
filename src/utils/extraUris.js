/*
─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/extraUris.js
  Rev :    r9     2025‑08‑26
  Summary: Centralised discovery/normalisation of extra URIs for a
           given token. Scans token metadata (historical shapes) and
           reads off‑chain views via Taquito (primary) and TzKT (GET,
           fallback). Produces stable [{ key,name,description,value,mime }].
           r9: Adds support for executing off‑chain views via
           metadataViews.get_extrauris() using Taquito’s tzip16
           extension, ensuring names and descriptions returned from
           modern contracts are correctly parsed. Retains fallback to
           executeView() and BCD/TzKT for older deployments.
──────────────────────────────────────────────────────────────*/

import { jFetch } from '../core/net.js';
import { mimeFromDataUri } from './uriHelpers.js';
import { mimeFromFilename } from '../constants/mimeTypes.js';
import { RPC_URLS, ENABLE_ONCHAIN_VIEWS } from '../config/deployTarget.js';
import { TezosToolkit } from '@taquito/taquito';

/*──────────────────────────────── helpers ───────────────────────────────*/

const RE_HEX_WITH_0X = /^0x[0-9a-fA-F]+$/;
const RE_HEX_BARE    = /^[0-9a-fA-F]+$/;

const lc  = (x) => String(x ?? '').toLowerCase();
const str = (v) => (typeof v === 'string' ? v : (v == null ? '' : String(v)));

/** bytes hex → UTF‑8 string (tolerant) */
function hexToUtf8(hex = '') {
  try {
    const s = String(hex || '');
    const h = s.startsWith('0x') ? s.slice(2) : s;
    if (!RE_HEX_BARE.test(h)) return s;
    const out = new Uint8Array(h.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
    return new TextDecoder().decode(out).replace(/[\u0000-\u001F\u007F]/g, '');
  } catch {
    return String(hex || '');
  }
}

/** Michelson-string-ish → JS string.
 * Accepts primitives like "foo", {string:"foo"}, {bytes:"0x68656c6c6f"}.
 */
function toStringish(v) {
  if (v == null) return '';
  if (typeof v === 'string') {
    if (RE_HEX_WITH_0X.test(v) || RE_HEX_BARE.test(v)) {
      // Some indexers return bytes as hex for string fields.
      const decoded = hexToUtf8(v);
      // Prefer decoded only if it looks printable or a data URI.
      return decoded && decoded !== v ? decoded : v;
    }
    return v;
  }
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(toStringish).join('');
  if (typeof v === 'object') {
    if (typeof v.string === 'string') return v.string;
    if (typeof v.bytes  === 'string') return hexToUtf8(v.bytes);
    // Some toolkits wrap bytes into { 0: ..., 1: ... } etc.
    const keys = Object.keys(v);
    if (keys.length === 1) return toStringish(v[keys[0]]);
  }
  return String(v);
}

/** Build one normalised output row. */
function normOne(value, name = '', key = '') {
  const url = str(value).trim();
  if (!url || /^about:blank$/i.test(url)) return null;
  const mime = mimeFromDataUri?.(url) || mimeFromFilename?.(url) || '';
  return {
    key  : key  || '',
    name : name || '',
    description: '',
    value: url,
    mime,
  };
}

/*──────────────────────────── from metadata ─────────────────────────────*/

/**
 * Collect extra URIs from a token metadata object.
 * Shapes: extraUri/extra_uri/extraURL/extra_urls, arrays (extraUris,
 * extra_uris, extras), "extra*" namespaced keys, formats[].
 * Primaries are excluded. Returns deduped array.
 */
export function collectExtraUrisFromMeta(meta = {}) {
  const out = [];
  if (!meta || typeof meta !== 'object') return out;

  // Primary URIs to avoid duplicates with extras
  const primarySet = new Set(
    [
      meta.artifactUri,
      meta.artifact_uri,
      meta.displayUri,
      meta.display_uri,
      meta.thumbnailUri,
      meta.thumbnail_uri,
      meta.imageUri,
      meta.image,
    ]
      .filter(Boolean)
      .map(String)
  );

  // helper to push row if not primary
  const push = (val, name = '', key = '', desc = '') => {
    const n = normOne(val, name, key);
    if (!n) return;
    if (primarySet.has(n.value)) return;
    if (desc) n.description = desc;
    out.push(n);
  };

  // Triad scanning: group extras by slug (substring after extrauri_)
  const extrasBySlug = {};
  const slugFromKey = (k) => {
    const m = k.match(/^extrauri[_-](.+?)$/i);
    return m ? m[1] : null;
  };
  // gather base values
  for (const [k, v] of Object.entries(meta)) {
    const slug = slugFromKey(k);
    if (!slug) continue;
    // skip suffix keys
    if (/_(name|description|desc|mime|mimetype)$/i.test(k)) continue;
    const slugLc = slug.toLowerCase();
    extrasBySlug[slugLc] = extrasBySlug[slugLc] || {};
    extrasBySlug[slugLc].value = v;
    extrasBySlug[slugLc].key   = k;
  }
  // gather names/descriptions/mimes
  for (const [k, v] of Object.entries(meta)) {
    let m;
    m = k.match(/^extrauri[_-](.+?)_(name)$/i);
    if (m) {
      const slugLc = m[1].toLowerCase();
      extrasBySlug[slugLc] = extrasBySlug[slugLc] || {};
      extrasBySlug[slugLc].name = toStringish(v);
      continue;
    }
    m = k.match(/^extrauri[_-](.+?)_(description|desc)$/i);
    if (m) {
      const slugLc = m[1].toLowerCase();
      extrasBySlug[slugLc] = extrasBySlug[slugLc] || {};
      extrasBySlug[slugLc].description = toStringish(v);
      continue;
    }
    m = k.match(/^extrauri[_-](.+?)_(mime|mimetype)$/i);
    if (m) {
      const slugLc = m[1].toLowerCase();
      extrasBySlug[slugLc] = extrasBySlug[slugLc] || {};
      extrasBySlug[slugLc].mimeOverride = toStringish(v);
    }
  }
  // push triad extras
  Object.entries(extrasBySlug).forEach(([slugLc, data]) => {
    const val  = data.value;
    const key  = data.key || `extrauri_${slugLc}`;
    const name = data.name || '';
    const desc = data.description || '';
    if (val != null) push(val, name, key, desc);
  });

  // Legacy single fields (no friendly name)
  if (meta.extraUri   != null) push(meta.extraUri,   '', 'extraUri');
  if (meta.extra_uri  != null) push(meta.extra_uri,  '', 'extra_uri');
  if (meta.extraURL   != null) push(meta.extraURL,   '', 'extraURL');
  if (meta.extra_urls != null) push(meta.extra_urls, '', 'extra_urls');

  // arrays of extras
  const arrs = [];
  if (Array.isArray(meta.extraUris))  arrs.push(meta.extraUris);
  if (Array.isArray(meta.extra_uris)) arrs.push(meta.extra_uris);
  if (Array.isArray(meta.extras))     arrs.push(meta.extras);
  for (const arr of arrs) {
    for (const it of arr) {
      if (!it) continue;
      if (typeof it === 'string') {
        push(it, '', '');
      } else if (typeof it === 'object') {
        push(
          it.uri ?? it.url ?? it.value ?? '',
          toStringish(it.name ?? it.title ?? ''),
          toStringish(it.key ?? ''),
          toStringish(it.description ?? it.desc ?? '')
        );
      }
    }
  }

  // other namespaced extra keys (not part of triad or other shapes)
  for (const [k, v] of Object.entries(meta)) {
    const keyLc = lc(k);
    if (!keyLc.startsWith('extra')) continue;
    if (/_(name|description|desc|mime|mimetype)$/i.test(keyLc)) continue;
    // skip triad-handled slugs
    const mSlug = k.match(/^extrauri[_-](.+)$/i);
    if (mSlug && extrasBySlug[mSlug[1].toLowerCase()]) continue;
    if (typeof v === 'string') {
      push(v, '', k);
    } else if (v && typeof v === 'object') {
      push(
        v.uri ?? v.url ?? v.value ?? '',
        toStringish(v.name ?? v.title ?? ''),
        k,
        toStringish(v.description ?? v.desc ?? '')
      );
    }
  }

  // formats[] extras
  if (Array.isArray(meta.formats)) {
    for (const f of meta.formats) {
      if (!f || typeof f !== 'object') continue;
      const cand = f.uri ?? f.url ?? '';
      if (!cand) continue;
      if (!primarySet.has(cand) && !out.some((x) => x.value === cand)) {
        push(cand, toStringish(f.label ?? f.name ?? ''), 'format');
      }
    }
  }

  // dedupe by value
  const seenVals = new Set();
  const dedup = [];
  for (const e of out) {
    if (seenVals.has(e.value)) continue;
    seenVals.add(e.value);
    dedup.push(e);
  }
  return dedup;
}

/*──────────────────────── parse view results ─────────────────────────*/

async function parseEntries(entries) {
  const out = [];
  for (const raw of entries || []) {
    if (raw == null) continue;
    let parsed = null;

    // Array [desc, key, name, value]
    if (!parsed && Array.isArray(raw) && raw.length >= 4) {
      const desc = toStringish(raw[0]);
      const key  = toStringish(raw[1]);
      const name = toStringish(raw[2]);
      const val  = toStringish(raw[3]);
      const norm = normOne(val, name || '', key || '');
      if (norm) {
        norm.description = desc || '';
        parsed = norm;
      }
    }

    // Numeric keys {0:desc,1:key,2:name,3:value}
    if (!parsed && raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const ks = Object.keys(raw);
      if (ks.includes('0') && ks.includes('1') && ks.includes('2') && ks.includes('3')) {
        const desc = toStringish(raw['0']);
        const key  = toStringish(raw['1']);
        const name = toStringish(raw['2']);
        const val  = toStringish(raw['3']);
        const norm = normOne(val, name || '', key || '');
        if (norm) {
          norm.description = desc || '';
          parsed = norm;
        }
      }
    }

    // Pair-of-pairs {0:{0:desc,1:key}, 1:{0:name,1:value}}
    if (!parsed && raw && typeof raw === 'object' && !Array.isArray(raw)) {
      if ('0' in raw && '1' in raw) {
        const p0 = raw['0'];
        const p1 = raw['1'];
        let desc, key, name, val;
        if (Array.isArray(p0) && p0.length >= 2) {
          desc = toStringish(p0[0]); key = toStringish(p0[1]);
        } else if (p0 && typeof p0 === 'object') {
          desc = toStringish(p0['0'] ?? p0.description ?? p0.desc);
          key  = toStringish(p0['1'] ?? p0.key ?? p0.id);
        }
        if (Array.isArray(p1) && p1.length >= 2) {
          name = toStringish(p1[0]); val = toStringish(p1[1]);
        } else if (p1 && typeof p1 === 'object') {
          name = toStringish(p1['0'] ?? p1.name ?? p1.title ?? p1.label);
          val  = toStringish(p1['1'] ?? p1.value ?? p1.uri ?? p1.url);
        }
        if (val != null) {
          const norm = normOne(val, name || '', key || '');
          if (norm) {
            norm.description = desc || '';
            parsed = norm;
          }
        }
      }
    }

    // Named/nested object
    if (!parsed && raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const item = {};
      Object.entries(raw).forEach(([k, v]) => { item[lc(k)] = v; });
      let nested = null;
      let val = item.value;
      if (val && typeof val === 'object') {
        nested = {};
        Object.entries(val).forEach(([k, v]) => { nested[lc(k)] = v; });
        val = nested.value ?? nested.uri ?? nested.url ?? '';
      }
      if (!val) val = item.uri || item.url || '';
      let key  = item.key ?? item.id;
      if ((key == null || key === '') && nested) key = nested.key ?? nested.id;
      let name = item.name ?? item.title ?? item.label;
      if ((name == null || name === '') && nested) name = nested.name ?? nested.title ?? nested.label;
      let desc = item.description ?? item.desc;
      if ((desc == null || desc === '') && nested) desc = nested.description ?? nested.desc;
      const k  = toStringish(key);
      const nm = toStringish(name);
      const ds = toStringish(desc);
      const vv = toStringish(val);
      const norm = normOne(vv, nm || '', k || '');
      if (norm) {
        norm.description = ds || '';
        parsed = norm;
      }
    }

    if (parsed) out.push(parsed);
  }
  // dedupe by value
  const seenVals = new Set();
  return out.filter((it) => {
    if (seenVals.has(it.value)) return false;
    seenVals.add(it.value);
    return true;
  });
}

/*──────────────────────── view fetchers (RPC/TzKT) ─────────────────────*/

async function fetchViaTzkt(apiBase, contract, tokenId, viewNames = []) {
  if (!apiBase || !contract || tokenId == null) return [];
  const names = Array.isArray(viewNames) && viewNames.length
    ? viewNames
    : ['get_extrauris','extrauris_for_token','extrauri_for_token','extrauris'];
  for (const name of names) {
    try {
      const base = apiBase.replace(/\/+$/, '');
      const url  = `${base}/contracts/${encodeURIComponent(contract)}/views/${encodeURIComponent(name)}`;
      const qs   = new URLSearchParams({ input: String(tokenId), unlimited: 'true', format: 'json' });
      const data = await jFetch(`${url}?${qs}`, { method: 'GET' }).catch(() => null);
      // Debug: log raw TzKT response
      if (typeof window !== 'undefined' && window.console && process && process.env && process.env.NODE_ENV !== 'production') {
        try {
          console.log('fetchViaTzkt raw data', JSON.parse(JSON.stringify(data)));
        } catch {
          /* ignore JSON stringify errors */
        }
      }
      if (!data) continue;
      const entries = [];
      if (Array.isArray(data)) entries.push(...data);
      else if (data && typeof data.entries === 'function') {
        for (const [, v] of data.entries()) entries.push(v);
      } else if (data && typeof data === 'object') {
        Object.values(data).forEach((v) => entries.push(v));
      }
      const parsed = await parseEntries(entries);
      if (parsed.length) return parsed;
    } catch { /* ignore and try next */ }
  }
  return [];
}

// --- Failover wrappers ------------------------------------------------------
// Try current toolkit first; if it fails (e.g., CORS on run_code), rotate
// through configured RPC_URLS with fresh TezosToolkit instances until one
// succeeds or all fail.
async function fetchViaTzip16Failover(toolkit, contract, tokenId) {
  try {
    const first = await fetchViaTzip16(toolkit, contract, tokenId);
    if (Array.isArray(first) && first.length) return first;
  } catch { /* continue */ }
  for (const url of RPC_URLS) {
    try {
      const alt = new TezosToolkit(url);
      const rows = await fetchViaTzip16(alt, contract, tokenId);
      if (Array.isArray(rows) && rows.length) return rows;
    } catch { /* try next */ }
  }
  return [];
}

async function fetchViaToolkitFailover(toolkit, contract, tokenId) {
  try {
    const first = await fetchViaToolkit(toolkit, contract, tokenId);
    if (Array.isArray(first) && first.length) return first;
  } catch { /* continue */ }
  for (const url of RPC_URLS) {
    try {
      const alt = new TezosToolkit(url);
      const rows = await fetchViaToolkit(alt, contract, tokenId);
      if (Array.isArray(rows) && rows.length) return rows;
    } catch { /* try next */ }
  }
  return [];
}

async function fetchViaToolkit(toolkit, contract, tokenId) {
  if (!toolkit || !contract || tokenId == null) return [];
  try {
    const c = await toolkit.contract.at(contract);
    const names = ['get_extrauris','extrauris_for_token','extrauri_for_token','extrauris'];
    let raw;
    for (const vn of names) {
      if (c.views && typeof c.views[vn] === 'function') {
        try { raw = await c.views[vn](Number(tokenId)).read(); }
        catch { raw = undefined; }
        if (raw) break;
      }
    }
    if (!raw) return [];
    // Debug: log raw toolkit view response
    if (typeof window !== 'undefined' && window.console && process && process.env && process.env.NODE_ENV !== 'production') {
      try {
        console.log('fetchViaToolkit raw', JSON.parse(JSON.stringify(raw)));
      } catch {
        /* ignore JSON stringify errors */
      }
    }
    const entries = [];
    if (Array.isArray(raw)) entries.push(...raw);
    else if (raw && typeof raw.entries === 'function') {
      for (const [, v] of raw.entries()) entries.push(v);
    } else if (raw && typeof raw === 'object') {
      Object.values(raw).forEach((v) => entries.push(v));
    }
    return parseEntries(entries);
  } catch {
    return [];
  }
}

/**
 * Fetch extra URIs via Taquito’s TZIP-16 off-chain view executor. This uses
 * the tzip16 extension to call `executeView` on the contract. If the
 * extension is unavailable or the call fails, returns an empty array.
 *
 * The view result is assumed to be a list of items matching the
 * `get_extrauris` signature and is parsed via `parseEntries`.
 *
 * @param {object} toolkit TezosToolkit instance
 * @param {string} contract KT1 address
 * @param {string|number} tokenId token ID
 * @returns {Promise<Array<{key:string,name:string,description:string,value:string,mime:string}>>>}
 */
async function fetchViaTzip16(toolkit, contract, tokenId) {
  // Perform an off‑chain view call using Taquito’s tzip16 metadataViews API.
  // When successful, returns a parsed list of objects containing key/name/description/value.
  if (!toolkit || !contract || tokenId == null) return [];
  try {
    // Dynamically import tzip16 extension so that builds lacking this package do not fail.
    const mod = await import('@taquito/tzip16');
    const tzip16 = mod.tzip16 || mod.default?.tzip16;
    const Tzip16Module = mod.Tzip16Module || mod.default?.Tzip16Module;
    if (!tzip16 || !Tzip16Module) return [];
    // Register the extension once. Catch duplicate extension errors.
    try {
      toolkit.addExtension(new Tzip16Module());
    } catch {
      /* ignore duplicate extension errors */
    }
    // Load the contract with tzip16 interface
    const c = await toolkit.contract.at(contract, tzip16);
    // Retrieve the tzip16 interface
    const t16 = typeof c.tzip16 === 'function' ? c.tzip16() : c.tzip16;
    if (!t16) return [];
    // Prefer the metadataViews helper. This method lists all off‑chain views
    // defined in the contract metadata and exposes them via executeView.
    if (typeof t16.metadataViews === 'function') {
      try {
        const metaViews = await t16.metadataViews();
        if (metaViews && typeof metaViews.get_extrauris === 'function') {
          const viewRes = await metaViews.get_extrauris().executeView(Number(tokenId));
          let entries = [];
          if (Array.isArray(viewRes)) {
            entries = viewRes;
          } else if (viewRes && typeof viewRes.entries === 'function') {
            for (const [, v] of viewRes.entries()) entries.push(v);
          } else if (viewRes && typeof viewRes === 'object') {
            entries = Object.values(viewRes);
          }
          const parsed = await parseEntries(entries);
          if (parsed && parsed.length) return parsed;
        }
      } catch {
        // ignore and fall back
      }
    }
    // Fall back to generic executeView if metadataViews is unavailable or fails.
    if (typeof t16.executeView !== 'function') return [];
    const viewResult = await t16.executeView('get_extrauris', [Number(tokenId)], undefined, { viewCaller: contract });
    let entries = [];
    if (Array.isArray(viewResult)) entries = viewResult;
    else if (viewResult && typeof viewResult.entries === 'function') {
      for (const [, v] of viewResult.entries()) entries.push(v);
    } else if (viewResult && typeof viewResult === 'object') {
      entries = Object.values(viewResult);
    }
    return parseEntries(entries);
  } catch {
    return [];
  }
}

/**
 * Fetch extra URIs via BetterCallDev (views/execute). Fallback when TzKT and
 * toolkit views return entries without names/descriptions. Requires network
 * (e.g. 'mainnet' or 'ghostnet') to build URL. Returns parsed entries or
 * empty array on failure.
 * Note: Implementation may need adjustment depending on BCD API shape.
 */
/**
 * Fetch extra URIs via Better Call Dev as a last resort.  Attempts a GET
 * to /views/get_extrauris?input=<tokenId> first, then POST to
 * /views/execute if necessary.  This function is only invoked when both
 * toolkit and TzKT return no entries or entries missing name/description.
 *
 * Note: The BCD API may reject cross‑origin calls in some environments;
 * errors are silently ignored.  When successful, logs the raw response
 * in development mode.
 *
 * @param {string} network Either "mainnet" or "ghostnet" (defaults to mainnet)
 * @param {string} contract KT1 address
 * @param {string|number} tokenId Token ID
 */
async function fetchViaBCD(network, contract, tokenId) {
  if (!network || !contract || tokenId == null) return [];
  const net = /ghostnet/i.test(network) ? 'ghostnet' : 'mainnet';
  const token = String(tokenId);
  // Try GET first
  try {
    const getUrl = `https://api.better-call.dev/v1/contract/${net}/${contract}/views/get_extrauris`;
    const qs = new URLSearchParams({ input: token });
    const data = await jFetch(`${getUrl}?${qs.toString()}`, { method: 'GET' }).catch(() => null);
    if (typeof window !== 'undefined' && window.console && process && process.env && process.env.NODE_ENV !== 'production') {
      try {
        console.log('fetchViaBCD (GET) raw', JSON.parse(JSON.stringify(data)));
      } catch {
        /* ignore */
      }
    }
    if (data) {
      let entries = [];
      if (Array.isArray(data)) entries = data;
      else if (Array.isArray(data.values)) entries = data.values;
      else if (Array.isArray(data.result)) entries = data.result;
      else if (typeof data === 'object') entries = Object.values(data);
      const parsed = await parseEntries(entries);
      if (parsed.length) return parsed;
    }
  } catch {
    /* ignore */
  }
  // Try POST
  try {
    const postUrl = `https://api.better-call.dev/v1/contract/${net}/${contract}/views/execute`;
    const payload = {
      name: 'get_extrauris',
      implementation: 0,
      data: { '@nat_1': Number(tokenId) },
      kind: 'off-chain',
    };
    const data = await jFetch(postUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => null);
    if (typeof window !== 'undefined' && window.console && process && process.env && process.env.NODE_ENV !== 'production') {
      try {
        console.log('fetchViaBCD (POST) raw', JSON.parse(JSON.stringify(data)));
      } catch {
        /* ignore */
      }
    }
    if (data) {
      let entries = [];
      if (Array.isArray(data)) entries = data;
      else if (Array.isArray(data.values)) entries = data.values;
      else if (Array.isArray(data.result)) entries = data.result;
      else if (typeof data === 'object') entries = Object.values(data);
      const parsed = await parseEntries(entries);
      if (parsed.length) return parsed;
    }
  } catch {
    /* ignore */
  }
  return [];
}

/**
 * Attempt to fetch friendly names and descriptions for extra URIs by reading
 * the on-chain storage. The v4/v4e contract stores these fields in the
 * `extrauri_counters` bigmap. Each entry in this bigmap is a pair with
 * three maps: descriptions, labels and names. The descriptions and names
 * maps contain string values keyed by the index of the extra URI (0, 1,
 * ...).  This helper queries the bigmap via TzKT and merges the values
 * onto existing meta rows based on index order. It returns an updated
 * copy of the provided metaRows; if it cannot fetch or parse the bigmap,
 * it returns the original metaRows unchanged.
 *
 * @param {string} apiBase TzKT base URL (ending with /v1)
 * @param {string} contract KT1 address
 * @param {string|number} tokenId token ID to fetch
 * @param {Array} metaRows existing metadata-derived rows to enrich
 * @returns {Promise<Array>} new array of rows with friendly fields if found
 */
async function enrichFromBigmap(apiBase, contract, tokenId, metaRows) {
  try {
    if (!apiBase || !contract || tokenId == null || !Array.isArray(metaRows)) {
      return metaRows;
    }
    // Step 1: fetch list of bigmaps for the contract
    const bmaps = await jFetch(`${apiBase.replace(/\/+/g, '')}/contracts/${contract}/bigmaps`, { method: 'GET' }).catch(() => null);
    if (!bmaps || !Array.isArray(bmaps)) return metaRows;
    let ptr;
    for (const m of bmaps) {
      if (m && m.path === 'extrauri_counters') { ptr = m.ptr; break; }
    }
    if (!ptr) return metaRows;
    // Step 2: fetch the value for this tokenId from the bigmap. We try multiple
    // query shapes since TzKT may support different filters. We first try
    // using key=<tokenId>; if that fails, fallback to /keys/<tokenId>.
    let kv = null;
    // try query parameter
    try {
      kv = await jFetch(`${apiBase.replace(/\/+/g, '')}/bigmaps/${ptr}/keys?key=${tokenId}&select=value`, { method: 'GET' }).catch(() => null);
    } catch {}
    // if kv is array with empty, try direct path
    if (!kv || (Array.isArray(kv) && kv.length === 0)) {
      try {
        kv = await jFetch(`${apiBase.replace(/\/+/g, '')}/bigmaps/${ptr}/keys/${tokenId}`, { method: 'GET' }).catch(() => null);
      } catch {}
    }
    // kv might be an array of objects { value: { descriptions: {...}, names: {...} } }
    let val;
    if (kv) {
      if (Array.isArray(kv)) {
        if (kv.length > 0 && kv[0] && typeof kv[0].value === 'object') {
          val = kv[0].value;
        }
      } else if (kv && typeof kv.value === 'object') {
        val = kv.value;
      }
    }
    if (!val || typeof val !== 'object') return metaRows;
    const namesMap = (val.names || val.labels || {});
    const descMap  = (val.descriptions || {});
    // Convert to arrays sorted by numeric keys
    const indices = [];
    for (const k in namesMap) {
      if (Object.prototype.hasOwnProperty.call(namesMap, k) && !Number.isNaN(Number(k))) {
        indices.push(Number(k));
      }
    }
    // Also include indices present in descriptions but not names
    for (const k in descMap) {
      if (Object.prototype.hasOwnProperty.call(descMap, k) && !Number.isNaN(Number(k))) {
        const n = Number(k);
        if (!indices.includes(n)) indices.push(n);
      }
    }
    if (!indices.length) return metaRows;
    indices.sort((a, b) => a - b);
    const updated = metaRows.map((r, i) => {
      const idx = indices[i];
      if (idx == null) return r;
      const nameVal = namesMap[idx] != null ? toStringish(namesMap[idx]) : '';
      const descVal = descMap[idx]  != null ? toStringish(descMap[idx])  : '';
      if ((nameVal && !r.name) || (descVal && !r.description)) {
        return {
          ...r,
          name: nameVal || r.name,
          description: descVal || r.description,
        };
      }
      return r;
    });
    return updated;
  } catch {
    return metaRows;
  }
}

function mergeByKey(primary = [], secondary = []) {
  const out = [];
  const byKey   = new Map();
  const byValue = new Map();
  const push = (row) => {
    if (!row || typeof row.value !== 'string') return;
    if (byValue.has(row.value)) return;
    out.push(row);
    byValue.set(row.value, row);
    if (row.key) byKey.set(lc(row.key), row);
  };
  primary.forEach(push);
  for (const m of secondary) {
    if (!m) continue;
    const k = m.key ? lc(m.key) : '';
    const match = k && byKey.get(k);
    if (match) {
      if (!match.name && m.name) match.name = m.name;
      if (!match.description && m.description) match.description = m.description;
      const mIsData = /^data:/i.test(m.value || '');
      const vIsData = /^data:/i.test(match.value || '');
      if (mIsData && !vIsData) {
        match.value = m.value;
        match.mime  = mimeFromDataUri(match.value) || match.mime;
      }
      continue;
    }
    if (!byValue.has(m.value)) push(m);
  }
  return out;
}

/**
 * Fetch extras and return a stable list. Preference order:
 *  1) Toolkit views (on‑chain call) if available;
 *  2) TzKT GET views (server call) as fallback;
 *  3) Metadata extras appended last.
 */
export async function fetchExtraUris({ toolkit, addr, tokenId, apiBase, meta } = {}) {
  let m = meta;
  const base = (apiBase || 'https://api.tzkt.io/v1').replace(/\/+$/, '') + '';
  if (!m && addr && tokenId != null) {
    try {
      const url = `${base}/tokens?contract=${encodeURIComponent(addr)}&tokenId=${encodeURIComponent(tokenId)}&limit=1`;
      const arr = await jFetch(url, { method: 'GET' }).catch(() => []);
      const row = Array.isArray(arr) ? arr[0] : null;
      if (row && row.metadata && typeof row.metadata === 'object') m = row.metadata;
      else m = {};
    } catch { m = {}; }
  }
  // Prefer TzKT GET views first (no browser run_code CORS)
  const fromTzkt = (addr && tokenId != null)
    ? await fetchViaTzkt(base, addr, tokenId) : [];
  let viewRows = fromTzkt;

  // Only if nothing was found and on-chain views are enabled, try RPC paths
  if ((!viewRows || viewRows.length === 0) && ENABLE_ONCHAIN_VIEWS) {
    const fromTzip16 = (addr && tokenId != null && toolkit)
      ? await fetchViaTzip16Failover(toolkit, addr, tokenId)
      : [];
    const fromToolkit = (addr && tokenId != null && toolkit && !fromTzip16.length)
      ? await fetchViaToolkitFailover(toolkit, addr, tokenId) : [];
    viewRows = fromTzip16.length ? fromTzip16 : fromToolkit;
  }
  const metaRows = (m && typeof m === 'object') ? collectExtraUrisFromMeta(m) : [];

  // If the view returned no rows or only rows missing friendly fields, try BetterCallDev
  if ((viewRows.length === 0) || viewRows.every((r) => (!r.name && !r.description))) {
    try {
      const networkGuess = base.toLowerCase().includes('ghostnet') ? 'ghostnet' : 'mainnet';
      const bcdRows = await fetchViaBCD(networkGuess, addr, tokenId);
      if (bcdRows && bcdRows.length) {
        viewRows = bcdRows;
      }
    } catch {
      /* swallow BCD failures */
    }
  }

  // If metaRows exist but still lack friendly fields, attempt to enrich them
  // by reading the contract’s extrauri_counters bigmap via TzKT. This will
  // merge names/descriptions onto the metadata extras based on index order.
  let enrichedMetaRows = metaRows;
  try {
    if (metaRows && metaRows.length) {
      const needsEnrich = metaRows.some((r) => (!r.name && !r.description));
      if (needsEnrich) {
        enrichedMetaRows = await enrichFromBigmap(base, addr, tokenId, metaRows);
      }
    }
  } catch {
    enrichedMetaRows = metaRows;
  }

  // Debug: log raw rows when running in development (browser environment)
  if (typeof window !== 'undefined' && window.console && process && process.env && process.env.NODE_ENV !== 'production') {
    try {
      console.log('fetchExtraUris viewRows', JSON.parse(JSON.stringify(viewRows)));
      console.log('fetchExtraUris metaRows', JSON.parse(JSON.stringify(metaRows)));
    } catch {
      /* ignore JSON stringify errors */
    }
  }

  const combined = mergeByKey(viewRows, enrichedMetaRows);
  // Final dedupe by value
  const seen = new Set();
  return combined.filter((it) => {
    if (!it || typeof it.value !== 'string') return false;
    if (seen.has(it.value)) return false;
    seen.add(it.value);
    return true;
  });
}

/* What changed & why (r8):
   • Force GET for TzKT views and remove POST fallback causing 405s.
   • Decode Michelson bytes to UTF‑8 strings; parse nested objects robustly.
   • Avoid defaulting name to key in normOne; keep name empty when absent.
   • Merge view results with metadata extras by key, updating name and description
     from metadata or view as appropriate, and dedupe by value.
 */
