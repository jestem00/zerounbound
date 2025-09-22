/* Developed by @jams2blues - ZeroContract Studio
   File: src/pages/api/explore/feed.js
   Rev : r2 2025-09-19
   Summary: Respect client offsets, trim to deterministic slices and keep
            ZIP preview sanitisation aligned with ascii-only output. */

import { TZKT_API } from '../../../config/deployTarget.js';
import hashMatrix from '../../../data/hashMatrix.json';
import decodeHexFields from '../../../utils/decodeHexFields.js';

const BURN_ADDR = 'tz1burnburnburnburnburnburnburjAYjjX';

const TYPE_HASHES = Object.keys(hashMatrix)
  .filter((k) => /^-?\d+$/.test(k))
  .join(',');

const apiBase = `${String(TZKT_API || '').replace(/\/+$/, '')}/v1`;

function isDataUri(str) {
  return typeof str === 'string' && /^data:(image|video|audio|text\/html|image\/svg\+xml)/i.test(str.trim());
}
function isTezosStorage(str) {
  return typeof str === 'string' && /^tezos-storage:/i.test(str.trim());
}
function isRemoteMedia(str) {
  return typeof str === 'string' && /^(ipfs:|https?:|ar:|arweave:)/i.test(str.trim());
}
function hasRenderablePreview(m = {}) {
  const keys = [
    'displayUri', 'display_uri',
    'imageUri',   'image_uri', 'image',
    'thumbnailUri','thumbnail_uri',
    'artifactUri','artifact_uri',
    'mediaUri',   'media_uri',
  ];
  for (const k of keys) {
    const v = m && typeof m === 'object' ? m[k] : null;
    if (isDataUri(v) || isTezosStorage(v) || isRemoteMedia(v)) return true;
  }
  if (Array.isArray(m?.formats)) {
    for (const f of m.formats) {
      const cand = f?.uri || f?.url;
      if (isDataUri(cand) || isTezosStorage(cand) || isRemoteMedia(cand)) return true;
    }
  }
  return false;
}

async function j(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ctype = (res.headers.get('content-type') || '').toLowerCase();
  if (ctype.includes('application/json')) return res.json();
  return res.text().then((txt) => { try { return JSON.parse(txt); } catch { return []; } });
}

let ALLOWED_ADDR_CACHE = { at: 0, list: [] };
async function getAllowedContracts() {
  const now = Date.now();
  if (ALLOWED_ADDR_CACHE.list.length && (now - ALLOWED_ADDR_CACHE.at) < 120_000) {
    return ALLOWED_ADDR_CACHE.list;
  }
  const cq = new URLSearchParams();
  cq.set('typeHash.in', TYPE_HASHES);
  cq.set('select', 'address');
  cq.set('sort.desc', 'lastActivityTime');
  cq.set('limit', '800');
  const contracts = await j(`${apiBase}/contracts?${cq.toString()}`).catch(() => []);
  const addrs = (contracts || [])
    .map((row) => (typeof row === 'string' ? row : row?.address))
    .filter(Boolean);
  ALLOWED_ADDR_CACHE = { at: now, list: addrs };
  return addrs;
}

async function listTokens(contractFilter, offset = 0, limit = 48) {
  const qs = new URLSearchParams();
  qs.set('standard', 'fa2');
  qs.set('sort.desc', 'firstTime');
  qs.set('offset', String(Math.max(0, offset | 0)));
  qs.set('limit', String(Math.max(1, Math.min(200, limit | 0))));
  qs.set('totalSupply.gt', '0');
  qs.set('select', 'contract,tokenId,metadata,holdersCount,totalSupply,firstTime,contract.typeHash');

  if (contractFilter && /^KT1[0-9A-Za-z]{33}$/.test(contractFilter)) qs.set('contract', contractFilter);
  else qs.set('contract.typeHash.in', TYPE_HASHES);

  const rows = await j(`${apiBase}/tokens?${qs.toString()}`).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function filterSinglesBurned(contractsToSingleIds) {
  const burned = new Map();
  const entries = [...contractsToSingleIds.entries()].filter(([, ids]) => ids.length);
  for (const [kt, ids] of entries) {
    const qs = new URLSearchParams();
    qs.set('token.contract', kt);
    qs.set('token.tokenId.in', ids.join(','));
    qs.set('account', BURN_ADDR);
    qs.set('balance.gt', '0');
    qs.set('select', 'token.tokenId');
    qs.set('limit', String(Math.max(1000, ids.length)));
    const rows = await j(`${apiBase}/tokens/balances?${qs.toString()}`).catch(() => []);
    const set = new Set();
    for (const r of rows || []) {
      const id = +(r['token.tokenId'] ?? r?.tokenId ?? NaN);
      if (Number.isFinite(id)) set.add(id);
    }
    burned.set(kt, set);
  }
  return burned;
}

export default async function handler(req, res) {
  try {
    const { offset = '0', limit = '48', contract = '' } = req.query || {};
    const startOffset = Math.max(0, Number(offset) || 0);
    const acceptTarget = Math.max(1, Math.min(200, Number(limit) || 48));

    const PAGE = 120;
    const TIME_BUDGET_MS = 3000;

    const allowedContracts = contract ? null : await getAllowedContracts();
    const allowSet = allowedContracts ? new Set(allowedContracts) : null;

    let cursor = startOffset;
    let scanned = 0;
    let hardEnd = false;
    const accepted = [];
    const seen = new Set();
    const t0 = Date.now();

    while (accepted.length < acceptTarget && !hardEnd && (Date.now() - t0) < TIME_BUDGET_MS) {
      const chunk = await listTokens(contract, cursor, PAGE);
      const rawLen = Array.isArray(chunk) ? chunk.length : 0;
      scanned += rawLen;
      if (rawLen === 0) { hardEnd = true; break; }

      const prelim = (chunk || [])
        .filter((row) => {
          const kt = row?.contract?.address || row?.contract;
          if (!kt) return false;
          if (allowSet && !allowSet.has(kt)) return false;
          return true;
        })
        .map((row) => ({
          ...row,
          metadata: decodeHexFields(row?.metadata || {}),
        }))
        .filter((row) => hasRenderablePreview(row.metadata))
        .filter((row) => {
          const key = `${row.contract?.address || row.contract}:${row.tokenId}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

      const singlesByC = new Map();
      for (const r of prelim) {
        const kt = r.contract?.address || r.contract;
        const id = Number(r.tokenId);
        const hc = Number(r.holdersCount);
        if (!kt || !Number.isFinite(id)) continue;
        if (hc === 1) {
          if (!singlesByC.has(kt)) singlesByC.set(kt, []);
          singlesByC.get(kt).push(id);
        }
      }
      const burnedSingles = await filterSinglesBurned(singlesByC).catch(() => new Map());
      for (const r of prelim) {
        const hc = Number(r.holdersCount);
        if (hc > 1) {
          accepted.push(r);
          continue;
        }
        const kt = r.contract?.address || r.contract;
        const id = Number(r.tokenId);
        const set = burnedSingles.get(kt);
        if (!(set && set.has(id))) accepted.push(r);
      }

      cursor += PAGE;
    }

    const trimmed = accepted.length > acceptTarget ? accepted.slice(0, acceptTarget) : accepted;
    const nextCursor = startOffset + scanned;
    res.setHeader('cache-control', 'public, s-maxage=30, stale-while-revalidate=60');
    res.status(200).json({ items: trimmed, cursor: nextCursor, end: hardEnd });
  } catch (e) {
    res.status(200).json({ items: [], cursor: Number(req?.query?.offset || 0), end: false });
  }
}
