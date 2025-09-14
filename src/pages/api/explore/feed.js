/* Developed by @jams2blues ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ZeroContract Studio
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
const STRICT_ZERO_GATING = String(process.env.STRICT_ZERO_GATING || '1') !== '0';

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
  const res = await fetch(url, { headers: { 'accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ctype = (res.headers.get('content-type') || '').toLowerCase();
  if (ctype.includes('application/json')) return res.json();
  return res.text().then((t) => { try { return JSON.parse(t); } catch { return []; } });
}

let ALLOWED_ADDR_CACHE = { at: 0, list: [] };
// Cache for ZeroContract entrypoint fingerprint checks
const ZERO_EP_CACHE = new Map(); // addr -> { ok:boolean, at:number }
const ZERO_EP_TTL = 5 * 60_000; // 5 minutes
// Strict gating toggle (defaults on). When disabled, falls back to typeHash-only.
const CODEHASH_TTL = 10 * 60_000; // kept for compatibility; not used in address-probe path

async function getAllowedContracts() {
  const now = Date.now();
  if (ALLOWED_ADDR_CACHE.list.length && (now - ALLOWED_ADDR_CACHE.at) < 2 * 60_000) {
    return ALLOWED_ADDR_CACHE.list;
  }
  // Strict address-level gating is performed below; legacy codeHash path removed
  try {
    const cq = new URLSearchParams();
    cq.set('typeHash.in', TYPE_HASHES);
    cq.set('select', 'address');
    cq.set('sort.desc', 'lastActivityTime');
    cq.set('limit', '800');
    const rows = await j(`${apiBase}/contracts?${cq.toString()}`).catch(() => []);
    const addrsRaw = (rows || []).map((r) => r.address).filter(Boolean);
    if (!STRICT_ZERO_GATING) {
      ALLOWED_ADDR_CACHE = { at: now, list: addrsRaw };
      return addrsRaw;
    }
    const ZERO_EP_MARKERS = [
      'append_artifact_uri', 'append_extrauri', 'clear_uri', 'destroy',
      'append_token_metadata', 'update_token_metadata', 'update_contract_metadata',
      'edit_token_metadata', 'edit_contract_metadata',
    ];
    const okAddrs = [];
    const CONC = 12; let idx = 0;
    await Promise.all(new Array(CONC).fill(0).map(async () => {
      while (idx < addrsRaw.length) {
        const addr = addrsRaw[idx++];
        try {
          const res = await j(`${apiBase}/contracts/${encodeURIComponent(addr)}/entrypoints`).catch(() => null);
          const list = Array.isArray(res) ? res : (Array.isArray(res?.entrypoints) ? res.entrypoints : (res && typeof res === 'object' ? Object.keys(res) : []));
          const names = new Set((list || []).map((s) => String(s).toLowerCase()));
          if (ZERO_EP_MARKERS.some((m) => names.has(m))) okAddrs.push(addr);
        } catch { /* skip */ }
      }
    }));
    ALLOWED_ADDR_CACHE = { at: now, list: okAddrs };
    return okAddrs;
  } catch { ALLOWED_ADDR_CACHE = { at: now, list: [] }; return []; }
}

async function listTokens(contractFilter, offset = 0, limit = 48) {
  const baseParams = () => {
    const p = new URLSearchParams();
    p.set('standard', 'fa2');
    p.set('sort.desc', 'firstTime');
    p.set('offset', String(Math.max(0, offset|0)));
    p.set('limit',  String(Math.max(1, Math.min(200, limit|0))));
    p.set('totalSupply.gt', '0');
    p.set('select', 'contract,tokenId,metadata,holdersCount,totalSupply,firstTime,contract.typeHash');
    return p;
  };

  // Prefer contract.in list to avoid broad FA2 scans; fallback if empty
  if (!contractFilter) {
    try {
      const addrs = await getAllowedContracts();
      if (addrs.length) {
        const qb = baseParams();
        qb.set('contract.in', addrs.join(','));
        const rows = await j(`${apiBase}/tokens?${qb.toString()}`).catch(() => []);
        if (Array.isArray(rows) && rows.length) return rows;
      }
    } catch { /* ignore */ }
  }

  const qs = baseParams();
  if (contractFilter && /^KT1[0-9A-Za-z]{33}$/.test(contractFilter)) qs.set('contract', contractFilter);
  else qs.set('contract.typeHash.in', TYPE_HASHES);
  const rows = await j(`${apiBase}/tokens?${qs.toString()}`).catch(() => []);
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

      let prelim = (chunk || []).map((r) => ({
        ...r,
        metadata: decodeHexFields(r?.metadata || {}),
      })).filter((r) => hasRenderablePreview(r.metadata));

      // ZeroContract fingerprint gate (filters out lookalikes such as bootloaders)
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







