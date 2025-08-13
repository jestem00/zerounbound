/*Developed by @jams2blues
  File: src/utils/contractMeta.js
  Rev: r27
  Summary: Fast enrich (name, image, tokensCount, version, date); big‑map hex fallback. */

import { getCache, patchCache } from './cache.js';
import { contractsBatch } from './tzkt.js';
import { typeHashToVersion } from './allowedHashes.js';

/** decode 0x… hex -> JSON object; safe */
export function decodeHexJson(hex = '') {
  try {
    const clean = String(hex).replace(/^0x/i, '');
    if (!clean) return {};
    const bytes = clean.match(/.{1,2}/g).map((b) => parseInt(b, 16));
    const str = new TextDecoder('utf-8').decode(new Uint8Array(bytes));
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

/**
 * Enrich a list of basics [{address,typeHash,timestamp}] with
 * metadata (name,image), tokensCount, version, date.
 * Uses cache per‑address (DETAIL_TTL handled by caller via force flag).
 */
export async function enrichContracts(basics = [], network = 'mainnet', opts = {}) {
  const { force = false, ttlMs = 7 * 24 * 60 * 60 * 1000 } = opts;
  if (!basics.length) return [];

  // Use per‑address detail cache when fresh
  const want = [];
  const fromCache = [];
  for (const it of basics) {
    const row = getCache(it.address);
    const detail = row?.data?.detail || null;
    const fresh = detail && (!ttlMs || (Date.now() - (row?.ts || 0) < ttlMs));
    if (!force && fresh) {
      fromCache.push({ ...detail, total: Number.isFinite(detail.total) ? detail.total : null });
    } else {
      want.push(it.address);
    }
  }

  let enriched = [];
  if (want.length) {
    const batched = await contractsBatch(want, network);
    enriched = batched.map((r) => {
      const meta = r.metadata || {};
      const name = (meta.name && String(meta.name).trim()) || r.address;
      const image = pickBestImage(meta);
      const version = typeHashToVersion(r.typeHash);
      const date = r.lastActivityTime || r.firstActivityTime || null;
      const total = Number.isFinite(r.tokensCount) ? r.tokensCount : null;

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
    });
  }

  const byAddr = new Map([...fromCache, ...enriched].map((d) => [d.address, d]));
  // fill in any addresses that did not come back (keep a placeholder)
  for (const it of basics) {
    if (!byAddr.has(it.address)) {
      const det = {
        address: it.address,
        typeHash: it.typeHash,
        name: it.address,
        description: '',
        imageUri: null,
        total: null,
        version: typeHashToVersion(it.typeHash),
        date: it.timestamp || null,
      };
      byAddr.set(it.address, det);
    }
  }

  return [...byAddr.values()]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

export default { enrichContracts, decodeHexJson, pickBestImage };

/* What changed & why:
   • Replaces heavy per‑contract counting with tokensCount from TzKT.
   • Uses detail cache per‑KT1 to keep 7s load. */ // EOF
