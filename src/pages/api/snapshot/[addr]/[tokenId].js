/*
  Developed by @jams2blues — ZeroContract Studio
  File:    src/pages/api/snapshot/[addr]/[tokenId].js
  Rev :    r2    2025-08-28
  Summary: Serverless endpoint that produces a raster snapshot of a
           token’s primary media. Prefers fully on-chain data URIs,
           decodes base64 directly for raster types and uses sharp
           only when conversion is needed (e.g., SVG). Adds strong
           CDN caching with ETag and immutable TTL, minimizing cost.
*/

import sharp from 'sharp';
import fetch from 'node-fetch';
import path from 'path';
import { promises as fs } from 'fs';

import { TZKT_API } from '../../../../config/deployTarget.js';
import decodeHexFields, { decodeHexJson } from '../../../../utils/decodeHexFields.js';

// Determine the best candidate URI from the token metadata; prefer data: URIs.
function pickBestUri(meta = {}) {
  const fields = [
    'displayUri', 'display_uri',
    'imageUri', 'image_uri', 'image',
    'thumbnailUri', 'thumbnail_uri',
    'artifactUri', 'artifact_uri',
  ];
  const vals = [];
  for (const key of fields) {
    const val = meta[key];
    if (typeof val === 'string' && val.trim()) vals.push(val.trim());
  }
  const dataFirst = vals.find((u) => /^data:/i.test(u));
  if (dataFirst) return dataFirst;
  return vals[0] || '';
}

// Normalise IPFS URIs to a public gateway.
function normaliseUri(uri) {
  if (typeof uri !== 'string') return '';
  if (uri.startsWith('ipfs://')) {
    return uri.replace(/^ipfs:\/\//i, 'https://ipfs.io/ipfs/');
  }
  return uri;
}

// Fetch token metadata from TzKT. Returns null on error.
async function fetchTokenMeta(addr, tokenId) {
  try {
    const url = `${TZKT_API.replace(/\/+$/, '')}/v1/tokens?contract=${encodeURIComponent(addr)}&tokenId=${encodeURIComponent(tokenId)}&select=metadata&limit=1`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    // When select=metadata is used, TzKT returns the metadata value directly.
    let metaCandidate = arr[0];
    if (metaCandidate && typeof metaCandidate === 'object' && 'metadata' in metaCandidate) {
      metaCandidate = metaCandidate.metadata;
    }
    if (typeof metaCandidate === 'string') {
      try { metaCandidate = JSON.parse(metaCandidate); }
      catch { metaCandidate = decodeHexJson(metaCandidate) || {}; }
    }
    return decodeHexFields(metaCandidate || {});
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const { addr, tokenId } = req.query;
  const contract = String(addr || '').trim();
  const id = String(tokenId || '').trim();

  // Long‑lived CDN cache (minted media is immutable) + conditional requests.
  res.setHeader('Cache-Control', 'public, s-maxage=2592000, stale-while-revalidate=604800, immutable');
  res.setHeader('Vary', 'Accept');

  if (!/^KT1[0-9A-Za-z]{33}$/.test(contract) || !/^[0-9]+$/.test(id)) {
    return serveFallback(res);
  }

  try {
    const meta = await fetchTokenMeta(contract, id);
    let uri = pickBestUri(meta || {});
    if (!uri) throw new Error('No URI');
    uri = normaliseUri(uri);

    let buffer; let mime = '';
    if (uri.startsWith('data:')) {
      const comma = uri.indexOf(',');
      if (comma < 0) throw new Error('Malformed data URI');
      const metaPart = uri.slice(5, comma);
      mime = (metaPart.split(';')[0] || '').toLowerCase();
      const payload = uri.slice(comma + 1);
      const isB64 = /;base64/i.test(metaPart);
      // Support both base64 and UTF-8/URL-encoded data URIs (e.g., SVG)
      if (isB64) buffer = Buffer.from(payload, 'base64');
      else buffer = Buffer.from(decodeURIComponent(payload), 'utf8');
    } else {
      const resp = await fetch(uri);
      if (!resp.ok) throw new Error(`Failed to download ${uri}`);
      const arrayBuffer = await resp.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      try { mime = String(resp.headers.get('content-type') || '').toLowerCase(); } catch { /* ignore */ }
    }

    // ETag for deterministic caching/304s
    const etag = 'W/"' + createEtag(buffer) + '"';
    if (req.headers['if-none-match'] === etag) { res.statusCode = 304; return res.end(); }

    // If already a web‑friendly raster, serve as-is.
    const rasterTypes = new Set(['image/png','image/jpeg','image/jpg','image/webp','image/gif']);
    if (rasterTypes.has(mime)) {
      res.setHeader('Content-Type', mime || 'image/png');
      res.setHeader('ETag', etag);
      return res.status(200).end(buffer);
    }

    // Otherwise convert to PNG via sharp (SVG/unknown types).
    const png = await sharp(buffer).png().toBuffer();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('ETag', etag);
    return res.status(200).end(png);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('snapshot fallback:', err?.message || err);
    return serveFallback(res);
  }
}

async function serveFallback(res) {
  try {
    const filePath = path.join(process.cwd(), 'public', 'sprites', 'Banner.png');
    const data = await fs.readFile(filePath);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('ETag', 'W/"banner"');
    return res.status(200).end(data);
  } catch {
    // As an absolute last resort send a 1×1 transparent PNG
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/woAAn8B9YvWJ3oAAAAASUVORK5CYII=',
      'base64',
    );
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('ETag', 'W/"pixel"');
    return res.status(200).end(pixel);
  }
}

function createEtag(buf) {
  // Lightweight non‑crypto hash suitable for cache validators
  let h = 2166136261;
  for (let i = 0; i < buf.length; i++) { h ^= buf[i]; h = (h * 16777619) >>> 0; }
  return h.toString(16);
}

/* What changed & why:
   - Prefer on-chain data URIs; avoid Sharp for common raster types to keep
     cold starts fast and cost low. Strong CDN caching via ETag + immutable.
   - Still falls back to the site banner when content cannot be decoded. */
