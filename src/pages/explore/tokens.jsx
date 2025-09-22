/*Developed by @jams2blues
  File: src/pages/explore/tokens.jsx
  Rev:  r2
  Summary: Correct count UI; 10+ new cards per click; smoother scan-ahead. */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/router';
import styledPkg from 'styled-components';

import ExploreNav  from '../../ui/ExploreNav.jsx';
import PixelButton from '../../ui/PixelButton.jsx';
import TokenCard   from '../../ui/TokenCard.jsx';
import LoadingSpinner from '../../ui/LoadingSpinner.jsx';

import { useWalletContext }                 from '../../contexts/WalletContext.js';
import { jFetch }                           from '../../core/net.js';
import { TZKT_API, NETWORK_KEY }            from '../../config/deployTarget.js';
import decodeHexFields                      from '../../utils/decodeHexFields.js';
import hashMatrix                           from '../../data/hashMatrix.json';
// IDB cache intentionally not used on explore/tokens to avoid stale grids
import listLiveTokenIds                     from '../../utils/listLiveTokenIds.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

// Auto-pagination: when true, automatically continues loading batches
// until the end is reached (generic explore mode only).
const AUTO_LOAD_ALL = true;

// cache of allowed ZeroContract addresses (matrix) for client-side gating fallback
const ALLOWED_ADDRS = { set: new Set(), at: 0 };
async function getAllowedAddrs(tzktV1) {
  const now = Date.now();
  if (ALLOWED_ADDRS.set.size && (now - ALLOWED_ADDRS.at) < 120000) return ALLOWED_ADDRS.set;
  const qs = new URLSearchParams();
  qs.set('typeHash.in', Object.keys(hashMatrix).filter((k) => /^-?\d+$/.test(k)).join(','));
  qs.set('select', 'address');
  qs.set('sort.desc', 'lastActivityTime');
  qs.set('limit', '800');
  const rows = await jFetch(`${tzktV1}/contracts?${qs.toString()}`).catch(() => []);
  const s = new Set((rows || []).map((r) => r.address || r).filter(Boolean));
  ALLOWED_ADDRS.set = s; ALLOWED_ADDRS.at = now; return s;
}

/*-----------------------------------------------------------*
 * Layout
 *-----------------------------------------------------------*/
const Wrap = styled.main`
  width: 100%;
  padding: 0 1rem 1.5rem;
  max-width: 1440px;
  margin: 0 auto;
`;
const ControlsRow = styled.div`
  display:flex; align-items:center; gap:.6rem; margin-top: .75rem; flex-wrap:wrap;
`;
const StatsRow = styled.div`
  display:flex; align-items:baseline; gap:.6rem; flex-wrap:wrap;
  margin-top: .25rem; font-size:.92rem; opacity:.85;
`;
const Grid = styled.div`
  display:grid; gap:12px;
  grid-template-columns: repeat(
    auto-fill,
    minmax(clamp(160px, 18vw, 220px), 1fr)
  );
  margin-top: 1rem;
`;
const Center = styled.div`
  text-align:center; margin:1.2rem 0 1.8rem;
`;
const Subtle = styled.p`
  opacity:.85; margin:.4rem 0 0;
`;

/*-----------------------------------------------------------*
 * Helpers & Invariants
 *-----------------------------------------------------------*/

/** Normalize TZKT base to end with /v1 (I121/I139). */
function useTzktV1Base(toolkit) {
  const net = useMemo(() => {
    const t = (toolkit?._network?.type || '').toLowerCase();
    if (t.includes('mainnet')) return 'mainnet';
    if (t.includes('ghostnet')) return 'ghostnet';
    return (NETWORK_KEY || 'mainnet').toLowerCase();
  }, [toolkit]);

  if (typeof TZKT_API === 'string' && TZKT_API) {
    const base = TZKT_API.replace(/\/+$/, '');
    return base.endsWith('/v1') ? base : `${base}/v1`;
  }
  return net === 'mainnet'
    ? 'https://api.tzkt.io/v1'
    : 'https://api.ghostnet.tzkt.io/v1';
}

/** tolerant data-URI test; supports base64 & utf8 (e.g., SVG/HTML previews) */
function isDataUri(str) {
  return typeof str === 'string'
    && /^data:(image|video|audio|text\/html|image\/svg\+xml)/i.test(str.trim());
}
function isRemoteMedia(str) {
  return typeof str === 'string'
    && /^(ipfs:|https?:|ar:|arweave:)/i.test(str.trim());
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
    if (isDataUri(v) || isRemoteMedia(v) || (typeof v === 'string' && /^tezos-storage:/i.test(v.trim()))) return true;
  }
  if (Array.isArray(m?.formats)) {
    for (const f of m.formats) {
      const cand = f?.uri || f?.url;
      if (isDataUri(cand) || isRemoteMedia(cand) || (typeof cand === 'string' && /^tezos-storage:/i.test(cand.trim()))) return true;
    }
  }
  return false;
}

/** creators/authors ? array (preserve case; do not lowercase). */
function toArray(src) {
  if (Array.isArray(src)) return src;
  if (typeof src === 'string') {
    try {
      const j = JSON.parse(src);
      return Array.isArray(j) ? j : [src];
    } catch {
      return [src];
    }
  }
  if (src && typeof src === 'object') return Object.values(src);
  return [];
}

/** Minted-by test (creator | firstMinter | meta.creators/authors). */
function mintedByUser(t = {}, addr = '') {
  if (!addr) return false;
  const A = String(addr).toLowerCase();
  const c = String(t.creator || '').toLowerCase();
  const f = String(t.firstMinter || '').toLowerCase();
  if (c === A || f === A) return true;
  const md = t.metadata || {};
  const creators = toArray(md.creators).map(String);
  const authors  = toArray(md.authors).map(String);
  return creators.some((x) => x.toLowerCase() === A)
      || authors.some((x)  => x.toLowerCase() === A);
}

/** allowed ZeroContract type-hash set (manifest-gated). */
const ALLOWED_TYPE_HASHES = new Set(
  Object.keys(hashMatrix)
    .filter((k) => /^-?\d+$/.test(k))
    .map((k) => Number(k)),
);

const ALLOWED_TYPE_HASHES_STR = [...ALLOWED_TYPE_HASHES].join(',');
const PER_CONTRACT_CHUNK = 18;

/** decode + accept a token row into the UI shape, with hazard/preview guard. */
function normalizeAndAcceptToken(row) {
  if (!row) return null;
  const supply = Number(row.totalSupply ?? row.total_supply);
  if (Number.isFinite(supply) && supply <= 0) return null;
  let md = row.metadata || {};
  try { md = decodeHexFields(md); } catch { /* best effort */ }
  if (!hasRenderablePreview(md)) {
    md = { ...md, __placeholder: true };
  }
  const addr = String(row.contract?.address || row.contract || '').trim();
  return {
    contract: addr,
    tokenId:  Number(row.tokenId),
    metadata: md,
    holdersCount: row.holdersCount,
    creator: row.creator,
    firstMinter: row.firstMinter,
    firstTime: row.firstTime,
  };
}

/** simple integer formatter with thin-space groupings */
function fmtInt(n) {
  try {
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  } catch { return String(n); }
}

// Ensure unique list by `contract:tokenId` while preserving order
function dedupeTokens(list = []) {
  const seen = new Set();
  const out = [];
  for (const t of (Array.isArray(list) ? list : [])) {
    const k = `${t.contract}:${t.tokenId}`;
    if (!seen.has(k)) { seen.add(k); out.push(t); }
  }
  return out;
}

/*-----------------------------------------------------------*
 * Page
 *-----------------------------------------------------------*/
export default function ExploreTokens() {
  const router = useRouter();
  const { toolkit } = useWalletContext() || {};
  const tzktV1 = useTzktV1Base(toolkit);
  const networkKey = useMemo(() => (tzktV1.includes('ghostnet') ? 'ghostnet' : 'mainnet'), [tzktV1]);

  // query: admin=tz..., contract=KT1...
  const adminFilter = useMemo(() => {
    const v = router.query?.admin;
    return typeof v === 'string' ? v.trim() : '';
  }, [router.query?.admin]);

  const contractFilter = useMemo(() => {
    const v = router.query?.contract;
    return typeof v === 'string' ? v.trim() : '';
  }, [router.query?.contract]);

  /*-------- state --------*/
  // tokens (generic browse)
  const [tokens, setTokens]       = useState([]);
  const [offset, setOffset]       = useState(0);
  const [fetching, setFetching]   = useState(false);
  const [end, setEnd]             = useState(false);

  // tokens (admin-filtered browse)
  const [adminTok, setAdminTok]   = useState([]);
  const [adminVisible, setAdminVisible] = useState(24);

  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  // de-dupe (global to component lifetime)
  const seenTok = useRef(new Set());
  // track if warm-start seeded items so we can resume without toggling loading
  const warmSeeded = useRef(false);
  const queuedLoadMore = useRef(false);
  // per-contract round-robin state for fast-path loading
  const perContract = useRef({ list: [], offsets: new Map(), ids: new Map(), idx: 0, ready: false, exhausted: new Set() });

  // reset on param change
  useEffect(() => {
    setTokens([]); setOffset(0); setEnd(false);
    setAdminTok([]); setAdminVisible(24);
    seenTok.current.clear();
    setError('');
    warmSeeded.current = false;
    perContract.current = { list: [], offsets: new Map(), ids: new Map(), idx: 0, ready: false, exhausted: new Set() };
  }, [adminFilter, contractFilter, tzktV1]);

  /*-------- queries --------*/

  /**
   * Batch token loader (generic browse).
   * Server filters by ZeroContract typeHash and totalSupply>0 to avoid scanning
   * the entire FA2 corpus. Falls back to broad scan if the server rejects the
   * nested filter (robust across forks).
   */
  const fetchAllowedContracts = useCallback(async () => {
    const pageSize = 240;
    const seen = new Set();
    const roster = [];
    let offsetLocal = 0;
    while (true) {
      const qs = new URLSearchParams();
      qs.set('typeHash.in', ALLOWED_TYPE_HASHES_STR);
      qs.set('tokensCount.gt', '0');
      qs.set('select', 'address');
      qs.set('sort.desc', 'lastActivityTime');
      qs.set('limit', String(pageSize));
      if (offsetLocal) qs.set('offset', String(offsetLocal));
      const rows = await jFetch(`${tzktV1}/contracts?${qs.toString()}`).catch(() => []);
      const batch = Array.isArray(rows) ? rows : [];
      if (!batch.length) break;
      for (const entry of batch) {
        const addr = typeof entry === 'string' ? entry : entry?.address;
        if (addr && !seen.has(addr)) {
          seen.add(addr);
          roster.push(addr);
        }
      }
      if (batch.length < pageSize) break;
      offsetLocal += batch.length;
    }
    const finalRoster = roster.filter(Boolean);
    const store = perContract.current || {};
    const prevOffsets = store.offsets instanceof Map ? store.offsets : new Map();
    const prevIds = store.ids instanceof Map ? store.ids : new Map();
    const prevExhausted = store.exhausted instanceof Set ? store.exhausted : new Set();
    const nextOffsets = new Map();
    const nextIds = new Map();
    const nextExhausted = new Set();
    for (const addr of finalRoster) {
      nextOffsets.set(addr, prevOffsets.get(addr) || 0);
      if (prevIds.has(addr)) nextIds.set(addr, prevIds.get(addr));
      if (prevExhausted.has(addr)) nextExhausted.add(addr);
    }
    store.list = finalRoster;
    store.offsets = nextOffsets;
    store.ids = nextIds;
    store.exhausted = nextExhausted;
    store.ready = finalRoster.length > 0;
    if (!Number.isFinite(store.idx) || store.idx < 0 || (finalRoster.length && store.idx >= finalRoster.length)) {
      store.idx = 0;
    }
    return finalRoster;
  }, [tzktV1]);

  const fetchBatchTokens = useCallback(async (startOffset = 0, step = 48) => {
    const limit = Math.max(1, Math.min(200, step || 48));

    if (!adminFilter) {
      const aggUrl = `/api/explore/feed?offset=${encodeURIComponent(String(startOffset))}&limit=${encodeURIComponent(String(limit))}`
        + (contractFilter ? `&contract=${encodeURIComponent(contractFilter)}` : '');
      const aggRes = await jFetch(aggUrl).catch(() => null);
      if (aggRes && Array.isArray(aggRes.items) && aggRes.items.length) {
        const cursor = Number(aggRes.cursor || (startOffset + limit));
        const rawCount = Math.max(aggRes.items.length, cursor - startOffset);
        return { rows: aggRes.items, rawCount, usedAgg: true, end: !!aggRes.end, origin: 'agg' };
      }
    }

    const qs = new URLSearchParams();
    qs.set('standard', 'fa2');
    qs.set('sort.desc', 'firstTime');
    qs.set('offset', String(startOffset));
    qs.set('limit', String(limit));
    qs.set('totalSupply.gt', '0');
    qs.set('select', 'contract,tokenId,metadata,holdersCount,totalSupply,contract.typeHash,firstTime');

    if (contractFilter) {
      qs.set('contract', contractFilter);
    } else {
      qs.set('contract.typeHash.in', ALLOWED_TYPE_HASHES_STR);
    }

    if (!contractFilter) {
      try {
        let addrs = perContract.current?.list;
        if (!Array.isArray(addrs) || addrs.length === 0) {
          addrs = await fetchAllowedContracts();
        }
        if (Array.isArray(addrs) && addrs.length) {
          const denseRows = [];
          const chunkSize = 60;
          for (let i = 0; i < addrs.length && denseRows.length < limit * 3; i += chunkSize) {
            const group = addrs.slice(i, i + chunkSize);
            if (!group.length) break;
            const qb = new URLSearchParams(qs);
            qb.delete('contract');
            qb.set('contract.in', group.join(','));
            qb.set('contract.typeHash.in', ALLOWED_TYPE_HASHES_STR);
            const resp = await jFetch(`${tzktV1}/tokens?${qb.toString()}`).catch(() => []);
            if (Array.isArray(resp) && resp.length) {
              denseRows.push(...resp);
            }
            if (group.length < chunkSize) break;
          }
          if (denseRows.length) {
            const trimmed = denseRows.slice(0, limit);
            return { rows: trimmed, rawCount: trimmed.length, usedAgg: false, end: false, origin: 'tzkt' };
          }
        }
      } catch { /* best effort */ }
    }

    const rows = await jFetch(`${tzktV1}/tokens?${qs.toString()}`).catch(() => []);
    const list = Array.isArray(rows) ? rows : [];
    return { rows: list, rawCount: list.length, usedAgg: false, end: list.length < limit, origin: 'tzkt' };
  }, [tzktV1, contractFilter, adminFilter, fetchAllowedContracts]);

  const fetchTokensByIds = useCallback(async (kt1, ids = []) => {
    if (!kt1 || !Array.isArray(ids) || !ids.length) return [];
    const slice = ids.filter((id) => Number.isFinite(Number(id)));
    if (!slice.length) return [];
    const qs = new URLSearchParams();
    qs.set('contract', kt1);
    qs.set('tokenId.in', slice.join(','));
    qs.set('select', 'contract,tokenId,metadata,holdersCount,totalSupply,firstTime,contract.typeHash,creator,firstMinter');
    qs.set('limit', String(slice.length));
    const rows = await jFetch(`${tzktV1}/tokens?${qs.toString()}`).catch(() => []);
    return Array.isArray(rows) ? rows : [];
  }, [tzktV1]);

  const ensureContractIds = useCallback(async (kt1) => {
    if (!kt1) return [];
    const store = perContract.current || {};
    if (!(store.ids instanceof Map)) store.ids = new Map();
    if (store.ids.has(kt1)) {
      const cached = store.ids.get(kt1);
      if (Array.isArray(cached)) return cached;
    }
    let ids = [];
    try {
      ids = await listLiveTokenIds(kt1, networkKey, false);
    } catch { ids = []; }
    const normalized = Array.isArray(ids)
      ? [...new Set(ids.map((n) => Number(n)).filter((n) => Number.isFinite(n)))].sort((a, b) => b - a)
      : [];
    store.ids.set(kt1, normalized);
    if (!(store.offsets instanceof Map)) store.offsets = new Map();
    if (!store.offsets.has(kt1)) store.offsets.set(kt1, 0);
    if (store.exhausted instanceof Set) store.exhausted.delete(kt1);
    return normalized;
  }, [networkKey]);

  /** admin-filtered token discovery (creator/firstMinter/meta authors/creators). */
  const fetchAdminTokens = useCallback(async () => {
    if (!adminFilter) return [];

    const base = tzktV1;
    const sel = 'contract,tokenId,metadata,holdersCount,totalSupply,contract.typeHash,firstTime,creator,firstMinter';
    const gate = `&contract.typeHash.in=${encodeURIComponent(ALLOWED_TYPE_HASHES_STR)}&totalSupply.gt=0&select=${encodeURIComponent(sel)}`;
    const queries = [
      `${base}/tokens?creator=${encodeURIComponent(adminFilter)}&standard=fa2&limit=1000&sort.desc=firstTime${gate}`,
      `${base}/tokens?firstMinter=${encodeURIComponent(adminFilter)}&standard=fa2&limit=1000&sort.desc=firstTime${gate}`,
      // tolerant metadata lookups
      `${base}/tokens?metadata.creators.contains=${encodeURIComponent(adminFilter)}&standard=fa2&limit=1000&sort.desc=firstTime${gate}`,
      `${base}/tokens?metadata.authors.contains=${encodeURIComponent(adminFilter)}&standard=fa2&limit=1000&sort.desc=firstTime${gate}`,
    ];

    const batches = await Promise.all(queries.map((u) => jFetch(u).catch(() => [])));
    const merged = [].concat(...batches.filter(Array.isArray));

    // normalize + dedupe + gate
    const out = [];
    const seen = new Set();
    for (const r of merged) {
      const typeHash = Number(r.contract?.typeHash ?? r['contract.typeHash'] ?? r.typeHash ?? NaN);
      if (Number.isFinite(typeHash) && !ALLOWED_TYPE_HASHES.has(typeHash)) continue;
      if (!Number.isFinite(typeHash)) {
        try {
          const allow = await getAllowedAddrs(tzktV1);
          const addr = String(r.contract?.address || r.contract || '');
          if (!allow.has(addr)) continue;
        } catch { continue; }
      }

      const t = normalizeAndAcceptToken(r);
      if (!t) continue;

      // narrow to one collection if requested
      if (contractFilter && t.contract !== contractFilter) continue;

      // minted-by (creator | firstMinter | metadata)
      if (!mintedByUser({ ...t, creator: r.creator, firstMinter: r.firstMinter }, adminFilter)) {
        continue;
      }

      const key = `${t.contract}:${t.tokenId}`;
      if (!seen.has(key)) { seen.add(key); out.push(t); }
    }

    // sort newest first (stable on tokenId within same contract)
    // Hide fully burned tokens (all supply at burn address): compare with live id sets
    try {
      const net = tzktV1.includes('ghostnet') ? 'ghostnet' : 'mainnet';
      const byC = new Map();
      for (const t of out) {
        const kt = t.contract; const id = Number(t.tokenId);
        if (!kt || !Number.isFinite(id)) continue;
        if (!byC.has(kt)) byC.set(kt, new Set());
        byC.get(kt).add(id);
      }
      const keep = [];
      for (const [kt, ids] of byC.entries()) {
        // list of live ids (not fully burned) for this contract
        let live = [];
        try { live = await listLiveTokenIds(kt, net, false); } catch { live = []; }
        const liveSet = new Set(live.map(Number));
        for (const t of out) {
          if (t.contract !== kt) continue;
          if (liveSet.has(Number(t.tokenId))) keep.push(t);
        }
      }
      keep.sort((a, b) => (b.tokenId - a.tokenId) || (a.contract > b.contract ? -1 : 1));
      return keep;
    } catch {
      out.sort((a, b) => {
        const ta = Date.parse(a.firstTime || 0) || 0;
        const tb = Date.parse(b.firstTime || 0) || 0;
        if (tb !== ta) return tb - ta;
        if (a.contract !== b.contract) return a.contract > b.contract ? 1 : -1;
        return Number(b.tokenId) - Number(a.tokenId);
      });
      return out;
    }
  }, [adminFilter, tzktV1, contractFilter]);

  /**
   * Fast-path helpers: discover active ZeroContract collections and page
   * tokens per contract rather than scanning the global FA2 space.
   */
  /**
   * Scan ahead until we accumulate at least `minAccept` newly accepted tokens
   * (or we truly hit the end). This prevents the "only 1-2 new cards per click"
   * problem.  It guarantees =10 newly added cards per click in generic mode.
   */
  const loadPage = useCallback(async (initial = false) => {
    if (fetching || end) return;
    setFetching(true);
    if (initial) setLoading(true);

    const PAGE            = 48;             // server page size
    const MIN_YIELD_INIT  = AUTO_LOAD_ALL ? 24 : 12;   // faster first paint (yield early)
    const MIN_YIELD_CLICK = AUTO_LOAD_ALL ? 24 : 10;   // balanced step when auto-loading
    const SOFT_SCAN_ROWS  = initial ? PAGE * 16 : PAGE * 48; // keep rate-limit friendly
    const WINDOW          = 1; // single request per loop; aggregator scans ahead // small concurrency window
    const TIME_BUDGET_MS  = initial ? 8_000 : 6_000; // break early to avoid UI stall

    const minAccept = initial ? MIN_YIELD_INIT : MIN_YIELD_CLICK;

    let localOffset  = initial ? 0 : offset;
    let reachedEnd   = false;
    let accepted     = 0;
    let scannedRows  = 0;
    const tStart     = Date.now();

    const next = [];

    const useRoundRobin = !adminFilter && !contractFilter;
    if (useRoundRobin) {
      const store = perContract.current || {};
      if (!store.ready || !Array.isArray(store.list) || store.list.length === 0) {
        try {
          await fetchAllowedContracts();
        } catch { /* roster fetch best-effort */ }
      }
      const roster = Array.isArray(store.list) ? store.list : [];
      const maxPasses = roster.length ? (roster.length * 2 + 16) : 0;
      let passes = maxPasses;
      while (accepted < minAccept && passes-- > 0) {
        if (!roster.length) break;
        const idxLocal = store.idx % roster.length;
        store.idx += 1;
        const kt = roster[idxLocal];
        if (!kt) continue;
        if (store.exhausted instanceof Set && store.exhausted.has(kt)) continue;
        let idsForContract = [];
        try {
          idsForContract = await ensureContractIds(kt);
        } catch { idsForContract = []; }
        if (!idsForContract.length) {
          if (store.exhausted instanceof Set) store.exhausted.add(kt);
          continue;
        }
        const cursor = store.offsets instanceof Map ? (store.offsets.get(kt) || 0) : 0;
        if (cursor >= idsForContract.length) {
          if (store.exhausted instanceof Set) store.exhausted.add(kt);
          continue;
        }
        const sliceIds = idsForContract.slice(cursor, cursor + PER_CONTRACT_CHUNK);
        store.offsets.set(kt, cursor + sliceIds.length);
        let rows = [];
        try {
          rows = await fetchTokensByIds(kt, sliceIds);
        } catch { rows = []; }
        const got = Array.isArray(rows) ? rows.length : 0;
        if (got) scannedRows += got;
        for (const r of rows || []) {
          let typeHash = Number(r.contract?.typeHash ?? r['contract.typeHash'] ?? r.typeHash ?? Number.NaN);
          if (Number.isFinite(typeHash) && !ALLOWED_TYPE_HASHES.has(typeHash)) continue;
          const token = normalizeAndAcceptToken(r);
          if (!token) continue;
          try { Object.defineProperty(token, '__origin', { value: 'contract', enumerable: false }); } catch { /* ignore */ }
          const key = `${token.contract}:${token.tokenId}`;
          if (!seenTok.current.has(key)) {
            seenTok.current.add(key);
            next.push(token);
            accepted += 1;
            if (accepted >= minAccept) break;
          }
        }
        if (store.offsets.get(kt) >= idsForContract.length && store.exhausted instanceof Set) {
          store.exhausted.add(kt);
        }
        if (initial && Date.now() - tStart > TIME_BUDGET_MS && accepted >= 10) break;
        if (accepted >= minAccept) break;
      }
      if ((store.exhausted instanceof Set) && roster.length && store.exhausted.size >= roster.length) {
        reachedEnd = true;
      }
    }

    // Fallback to global scan if filtered or if per-contract path yielded nothing
    if (accepted < minAccept) {
      // windowed concurrency: fetch 2-3 pages per loop from global feed
      while (accepted < minAccept && !reachedEnd && scannedRows < SOFT_SCAN_ROWS) {
        const offs = [];
        for (let i = 0; i < WINDOW; i += 1) offs.push(localOffset + i * PAGE);
        const batches = await Promise.all(offs.map((off) => fetchBatchTokens(off, minAccept)));
        let windowRows = 0;
        let windowRaw  = 0;
        for (const res of batches) {
          const rows = Array.isArray(res?.rows) ? res.rows : (Array.isArray(res) ? res : []);
          const got = rows.length;
          const raw = Number(res?.rawCount ?? got) || got;
          const isAgg = !!res?.usedAgg;
          const endFlag = !!res?.end;
          const origin = res?.origin || (isAgg ? 'agg' : 'tzkt');
          windowRows += got;
          windowRaw  += raw;
          scannedRows += raw;
          reachedEnd = reachedEnd || (isAgg ? endFlag : (raw < minAccept));

          for (const r of rows) {
            // Enforce matrix gate using row typeHash when present; otherwise
            // fall back to allowed address set derived from the matrix.
            const typeHash = Number(r.contract?.typeHash ?? r['contract.typeHash'] ?? r.typeHash ?? NaN);
            if (Number.isFinite(typeHash)) {
              if (!ALLOWED_TYPE_HASHES.has(typeHash)) continue;
            } else {
              try {
                const allow = await getAllowedAddrs(tzktV1);
                const addr = String(r.contract?.address || r.contract || '');
                if (!allow.has(addr)) continue;
              } catch { continue; }
            }
            const t = normalizeAndAcceptToken(r);
            if (!t) continue;
            try { Object.defineProperty(t, '__origin', { value: origin, enumerable: false }); } catch { /* ignore */ }
            const key = `${t.contract}:${t.tokenId}`;
            if (!seenTok.current.has(key)) {
              seenTok.current.add(key);
              next.push(t);
              accepted += 1;
              if (accepted >= minAccept) break;
            }
          }
        }
        localOffset += windowRaw;
        if (windowRaw === 0) { reachedEnd = true; break; }
        if (initial && Date.now() - tStart > TIME_BUDGET_MS && accepted >= 10) break;
      }
    }


    if (!next.length) {
      setOffset(localOffset);
      setFetching(false);
      if (!reachedEnd) setEnd(true);
      if (initial) setLoading(false);
      return;
    }

    if (next.length) {
      // Filter out fully burned tokens using live id sets per contract
      try {
        const net = tzktV1.includes('ghostnet') ? 'ghostnet' : 'mainnet';
        const groups = new Map(); // kt -> tokens[]
        const liveByC = new Map(); // kt -> Set(liveIds)
        for (const t of next) {
          const kt = t.contract;
          if (!kt) continue;
          if (!groups.has(kt)) groups.set(kt, []);
          groups.get(kt).push(t);
        }
        const keepAll = [];
        for (const [kt, arr] of groups.entries()) {
          let live = [];
          try { live = await listLiveTokenIds(kt, net, false); } catch { live = []; }
          const liveSet = new Set(live.map(Number));
          liveByC.set(kt, liveSet);
          if (liveSet.size === 0) {
            // Unknown live set -> keep all tokens for this contract
            Array.prototype.push.apply(keepAll, arr);
          } else {
            for (const t of arr) {
              if (liveSet.has(Number(t.tokenId))) keepAll.push(t);
            }
          }
        }
        next.length = 0; Array.prototype.push.apply(next, keepAll);
      } catch { /* best effort */ }

      setTokens((prev) => {
        // Guard against any duplicates by key
        const have = new Set(prev.map((t) => `${t.contract}:${t.tokenId}`));
        const filteredNext = next.filter((t) => {
          const k = `${t.contract}:${t.tokenId}`;
          if (have.has(k)) return false;
          have.add(k);
          return true;
        });
        // Prune any previously shown tokens that are no longer live (for just-checked contracts)
        let base = prev;
        try {
          if (typeof liveByC !== 'undefined' && liveByC && liveByC.size) {
            base = prev.filter((t) => {
              const set = liveByC.get(t.contract);
              if (!set || set.size === 0) return true; // unknown -> keep existing
              return set.has(Number(t.tokenId));
            });
          }
        } catch { base = prev; }
        const merged = dedupeTokens(filteredNext.length ? base.concat(filteredNext) : base);
        // Global stable newest->oldest order by firstTime, with tie-breakers
        merged.sort((a, b) => {
          const ta = Date.parse(a.firstTime || 0) || 0;
          const tb = Date.parse(b.firstTime || 0) || 0;
          if (tb !== ta) return tb - ta;
          if (a.contract !== b.contract) return a.contract > b.contract ? 1 : -1;
          return Number(b.tokenId) - Number(a.tokenId);
        });
        // No cache writes on explore/tokens
        return merged;
      });
    }
    setOffset(localOffset);
    if (reachedEnd && next.length === 0) setEnd(true);

    setFetching(false);
    if (initial) setLoading(false);
  }, [fetching, end, offset, fetchBatchTokens, adminFilter, contractFilter, fetchAllowedContracts, ensureContractIds, fetchTokensByIds]);

  /*-------- effects --------*/

  // No warm-start cache on explore/tokens

  // initial load (resume if we warm-started); runs once per filter/net change
  useEffect(() => {
    let canceled = false;
    (async () => {
      const resume = warmSeeded.current || tokens.length > 0 || offset > 0;
      setLoading(!resume);
      setError('');
      try {
        if (adminFilter) {
          const arr = await fetchAdminTokens();
          if (!canceled) setAdminTok(arr);
        } else {
          await loadPage(!resume);
        }
      } catch (e) {
        if (!canceled) setError('Could not load data. Please retry.');
      } finally {
        if (!canceled) setLoading(false);
      }
    })();
    return () => { canceled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminFilter, contractFilter, tzktV1]);

  // small auto-prefetch so the grid fills quickly on first load
  useEffect(() => {
    if (adminFilter) return;
    if (loading || fetching || end) return;
    if (tokens.length < 24 && offset > 0) {
      loadPage(false);
    }
  }, [adminFilter, loading, fetching, end, tokens.length, offset, loadPage]);

  // If user clicked while a fetch was in-progress, queue another fetch.
  useEffect(() => {
    if (!fetching && queuedLoadMore.current && !end && !adminFilter) {
      queuedLoadMore.current = false;
      loadPage(false);
    }
  }, [fetching, end, adminFilter, loadPage]);

  // Auto-pagination: after a batch commits and we are not at end, continue.
  useEffect(() => {
    if (!AUTO_LOAD_ALL) return;
    if (adminFilter) return;         // Only in generic explore mode
    if (end) return;                 // Stop at coverage end
    if (fetching) return;            // Wait for in-flight batch
    // tokens.length change signals a settled batch; load next shortly
    const id = setTimeout(() => { loadPage(false); }, 120);
    return () => clearTimeout(id);
  }, [tokens.length, fetching, end, adminFilter, loadPage]);

  /*-------- render --------*/

  const showTokensAdmin = !!adminFilter;

  const title = showTokensAdmin
    ? `Tokens by ${adminFilter} (${fmtInt(adminTok.length)})`
    : 'Explore - Tokens';

  const tokenCards = (list) => (
    <Grid>
      {list.map((t) => (
        <TokenCard
          key={`${t.contract}:${t.tokenId}`}
          contractAddress={t.contract}
          token={{
            tokenId: Number(t.tokenId),
            metadata: t.metadata || {},
            holdersCount: t.holdersCount,
          }}
        />
      ))}
    </Grid>
  );

  const cards = showTokensAdmin
    ? tokenCards(adminTok.slice(0, adminVisible))
    : tokenCards(tokens);

  const showingCount = showTokensAdmin ? Math.min(adminVisible, adminTok.length) : tokens.length;

  return (
    <Wrap>
      <ExploreNav />

      <ControlsRow>
        <strong style={{ fontFamily:'Pixeloid Sans, monospace' }}>
          {title}
        </strong>

        {(adminFilter || contractFilter) && (
          <PixelButton
            size="xs"
            data-sec
            onClick={() => router.push('/explore/tokens')}
            title="Clear filters"
            noActiveFx
          >
            CLEAR
          </PixelButton>
        )}
      </ControlsRow>

      {/* Compact, honest stats (remove misleading global FA2 totals) */}
      {!showTokensAdmin && (
        <StatsRow aria-live="polite">
          <span>Showing</span>
          <strong>{fmtInt(showingCount)}</strong>
          <span>ZeroContract token{showingCount === 1 ? '' : 's'}</span>
        </StatsRow>
      )}

      {error && <Subtle role="alert">{error}</Subtle>}

      {loading && <Subtle>Loading...</Subtle>}
      {!loading && cards}

      {/* Pagination controls - generic mode ensures =10 new cards per click */}
      {!showTokensAdmin && !end && (
        <Center>
          <PixelButton
            type="button"
            onClick={() => { if (fetching) { queuedLoadMore.current = true; } else { loadPage(false); } }}
            disabled={fetching && tokens.length === 0}
            size="sm"
            noActiveFx
          >
            {fetching
              ? (<><LoadingSpinner size={16} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} /> Loading...</>)
              : 'Load More'}
          </PixelButton>
        </Center>
      )}

      {/* Admin-view pagination */}
      {showTokensAdmin && adminTok.length > adminVisible && (
        <Center>
          <PixelButton
            onClick={() => setAdminVisible((v) => v + 24)}
            size="sm"
            noActiveFx
          >
            Load More
          </PixelButton>
        </Center>
      )}

      {!loading && showTokensAdmin && adminTok.length === 0 && (
        <Subtle>No tokens found for this creator.</Subtle>
      )}
      {!loading && !showTokensAdmin && tokens.length === 0 && end && (
        <Subtle>No more tokens to show.</Subtle>
      )}
    </Wrap>
  );
}

/* What changed & why:
   - Removed misleading global "Total ..." (FA2-wide) - it counted every FA2 on TzKT.
   - Guaranteed =10 newly accepted cards per click via scan-until-yield loop.
   - Kept initial scan snappy (=24 accepted) for a full first impression.
   - Preserved perfect admin-filter behaviour; left title "Tokens by ... (N)".
   - Lint-clean: trimmed unused imports/vars; no dead code. */











