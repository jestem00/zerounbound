/* Developed by @jams2blues — ZeroContract Studio
   File: src/pages/api/explore/feed.js
   Rev : r1
   Summary: Edge-friendly, serverless aggregator for explore/tokens.
            Returns dense, pre-filtered ZeroContract tokens fast, with
            burn filtering and minimal fields. Cache: s-maxage=30. */

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
    if (isDataUri(v)) return true;
  }
  if (Array.isArray(m?.formats)) {
    for (const f of m.formats) {
      const cand = f?.uri || f?.url;
      if (isDataUri(cand)) return true;
    }
  }
  return false;
}

async function j(url) {
  const res = await fetch(url, { headers: { 'accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ctype = (res.headers.get('content-type') || '').toLowerCase();
  if (ctype.includes('application/json')) return res.json();
  return res.text().then((t) => { try { return JSON.parse(t); } catch { return []; } });
}

async function listTokens(contractFilter, offset = 0, limit = 48) {
  // Prefer nested typeHash filter for full family coverage; fall back to contract.in
  const qs = new URLSearchParams();
  qs.set('standard', 'fa2');
  qs.set('sort.desc', 'firstTime');
  qs.set('offset', String(Math.max(0, offset|0)));
  qs.set('limit',  String(Math.max(1, Math.min(200, limit|0))));
  qs.set('totalSupply.gt', '0');
  qs.set('select', 'contract,tokenId,metadata,holdersCount,totalSupply,contract.typeHash');
  if (contractFilter && /^KT1[0-9A-Za-z]{33}$/.test(contractFilter)) {
    qs.set('contract', contractFilter);
  } else {
    qs.set('contract.typeHash.in', TYPE_HASHES);
  }
  let rows = await j(`${apiBase}/tokens?${qs.toString()}`).catch(() => []);
  if (Array.isArray(rows) && rows.length) return rows;

  if (!contractFilter) {
    try {
      const cq = new URLSearchParams();
      cq.set('typeHash.in', TYPE_HASHES);
      cq.set('select', 'address');
      cq.set('sort.desc', 'lastActivityTime');
      cq.set('limit', '800');
      const contracts = await j(`${apiBase}/contracts?${cq.toString()}`);
      const addrs = (contracts || []).map((r) => (typeof r === 'string' ? r : r.address)).filter(Boolean);
      if (addrs.length) {
        const qb = new URLSearchParams();
        qb.set('standard', 'fa2');
        qb.set('sort.desc', 'firstTime');
        qb.set('offset', String(Math.max(0, offset|0)));
        qb.set('limit',  String(Math.max(1, Math.min(200, limit|0))));
        qb.set('totalSupply.gt', '0');
        qb.set('select', 'contract,tokenId,metadata,holdersCount,totalSupply');
        qb.set('contract.in', addrs.join(','));
        rows = await j(`${apiBase}/tokens?${qb.toString()}`);
      }
    } catch { rows = []; }
  }
  return Array.isArray(rows) ? rows : [];
}

async function filterSinglesBurned(contractsToSingleIds) {
  // Returns Map<kt1, Set<burnedId>> for tokens where the ONLY holder is the burn address.
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
  return burned; // Map<kt, Set(id)>
}

export default async function handler(req, res) {
  try {
    const { offset = '0', limit = '48', contract = '' } = req.query || {};
    const startOffset = Math.max(0, Number(offset) || 0);
    const acceptTarget = Math.max(1, Math.min(200, Number(limit) || 48));

    const PAGE = 120;            // scan larger raw pages to find acceptances faster
    const TIME_BUDGET_MS = 3000; // a bit more time to evaluate previews & burn

    let cursor = startOffset;
    let accepted = [];
    let scanned = 0;
    let hardEnd = false;
    const t0 = Date.now();

    // Scan ahead until we accept >= target or hit time budget/end
    while (accepted.length < acceptTarget && !hardEnd && (Date.now() - t0) < TIME_BUDGET_MS) {
      const chunk = await listTokens(contract, cursor, PAGE);
      const rawLen = Array.isArray(chunk) ? chunk.length : 0;
      scanned += rawLen;
      if (rawLen === 0) { hardEnd = true; break; }

      const prelim = (chunk || []).map((r) => ({
        ...r,
        metadata: decodeHexFields(r?.metadata || {}),
      })).filter((r) => hasRenderablePreview(r.metadata));

      // Burn filter optimized: only check tokens with exactly 1 holder
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
      const kept = prelim.filter((r) => {
        const hc = Number(r.holdersCount);
        if (hc > 1) return true;
        const kt = r.contract?.address || r.contract;
        const id = Number(r.tokenId);
        const set = burnedSingles.get(kt);
        return !(set && set.has(id));
      });

      accepted.push(...kept);
      cursor += PAGE; // advance by raw page regardless of accept count
    }

    // Trim to target size
    if (accepted.length > acceptTarget) accepted = accepted.slice(0, acceptTarget);

    res.setHeader('cache-control', 'public, s-maxage=30, stale-while-revalidate=60');
    res.status(200).json({ items: accepted, cursor, end: hardEnd });
  } catch (e) {
    res.status(200).json({ items: [], cursor: Number(req?.query?.offset || 0), end: false });
  }
}
