/*Developed by @jams2blues
File: src/pages/explore/collections.jsx
Rev: r11
Summary: Merge r7+r9+r10 and fix unfiltered-loading regression:
- Remove brittle tokensCount projection from list query
(some TzKT builds 400) -> restores unfiltered browse.
- Keep non-empty "Total" with server attempt + fallback,
and reconcile to exact rows.length at end.
- Stable scan-ahead paging; compact 5-up+ responsive grid.
- Admin filter intact (discoverCreated).
- Show "Total: ..." instead of 0 until reliable. */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/router';
import styledPkg from 'styled-components';

import ExploreNav      from '../../ui/ExploreNav.jsx';
import PixelButton     from '../../ui/PixelButton.jsx';
import LoadingSpinner  from '../../ui/LoadingSpinner.jsx';
import CollectionCard  from '../../ui/CollectionCard.jsx';

import { useWalletContext } from '../../contexts/WalletContext.js';
import hashMatrix            from '../../data/hashMatrix.json';
import { jFetch }            from '../../core/net.js';
import { TZKT_API, NETWORK_KEY } from '../../config/deployTarget.js';
import { discoverCreated }   from '../../utils/contractDiscovery.js';

/*-----------------------------------------------------------*
 * Styled
 *-----------------------------------------------------------*/
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Wrap = styled.main`
  width: 100%;
  padding: 0 12px 32px;
  margin: 0 auto;
  max-width: 1440px;
`;

const ControlsRow = styled.div`
  display: flex;
  align-items: center;
  gap: .6rem;
  padding: 10px 2px 8px;
  flex-wrap: wrap;
  justify-content: space-between;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1rem;
  line-height: 1;
  font-weight: 600;
`;

const Counts = styled.p`
  margin: 0;
  opacity: .9;
  font-size: .9rem;
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;

const AdminBanner = styled.p`
  width: 100%;
  margin: 4px 0 0;
  font-size: .85rem;
  opacity: .9;
  display: flex;
  align-items: center;
  gap: 6px;
  code{font-size:.85rem}
  button{
    background: none; border: none; cursor: pointer;
    font-size: 1rem; line-height: 1; margin-top: -2px;
  }
`;

/* Responsive, compact: >=5 columns on typical desktops; scales up. */
const Grid = styled.div`
  --col: clamp(170px, 18.75vw, 220px);
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--col), 1fr));
  gap: 10px;
  align-items: stretch;
`;

const Center = styled.div`
  text-align: center;
  margin: 1rem 0 1.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
`;

const Subtle = styled.p`
  width: 100%;
  margin: .4rem 0 .8rem;
  text-align: left;
  opacity: .85;
  font-size: .9rem;
`;

/*-----------------------------------------------------------*
 * Helpers
 *-----------------------------------------------------------*/

/** Choose the active TzKT v1 base from deployTarget + wallet network. */
function useTzktV1Base(toolkit) {
  const net = useMemo(() => {
    const t = String(toolkit?._network?.type || '').toLowerCase();
    if (t.includes('mainnet')) return 'mainnet';
    if (t.includes('ghostnet')) return 'ghostnet';
    return (NETWORK_KEY || 'mainnet').toLowerCase().includes('mainnet') ? 'mainnet' : 'ghostnet';
  }, [toolkit]);

  if (typeof TZKT_API === 'string' && TZKT_API) {
    const base = TZKT_API.replace(/\/+$/, '');
    return base.endsWith('/v1') ? base : `${base}/v1`;
  }
  return net === 'mainnet' ? 'https://api.tzkt.io/v1' : 'https://api.ghostnet.tzkt.io/v1';
}

/** Allowed ZeroContract type-hashes (numeric) derived from hashMatrix. */
const ALLOWED_TYPE_HASHES = new Set(
  Object.keys(hashMatrix)
    .filter((k) => /^-?\d+$/.test(k))
    .map((k) => Number(k)),
);

/** Normalize TzKT rows to a minimal contract object. */
function toContractObj(row) {
  if (!row) return null;
  if (typeof row === 'string') return { address: row };
  const addr = row.address || row.contract || row.contractAddress || '';
  if (!addr) return null;
  return {
    address: addr,
    alias: row.alias,
    typeHash: typeof row.typeHash === 'number' ? row.typeHash : Number(row.typeHash ?? NaN),
    lastActivityTime: row.lastActivityTime || row.last_activity_time || row.lastSeen || undefined,
    // tokensCount intentionally omitted (see r11 notes)
  };
}

// removed legacy nonEmpty() helper - we now pre-filter via /tokens/count

/*-----------------------------------------------------------*
 * Page
 *-----------------------------------------------------------*/
export default function ExploreCollections() {
  const router = useRouter();
  const { toolkit } = useWalletContext() || {};
  const TZKT = useTzktV1Base(toolkit);
  const NETWORK = useMemo(() => (TZKT.includes('ghostnet') ? 'ghostnet' : 'mainnet'), [TZKT]);

  // Filters from query
  const adminFilter = useMemo(() => {
    const v = router?.query?.admin;
    return typeof v === 'string' ? v.trim() : '';
  }, [router?.query?.admin]);

  // State
  const [rows, setRows]               = useState([]);
  const [offset, setOffset]           = useState(0);
  const [end, setEnd]                 = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [totalCount, setTotalCount]   = useState(null); // nullable while computing
  const [initialised, setInitialised] = useState(false);

  const seen = useRef(new Set());
  const fetching = useRef(false);
  const nonEmptyCache = useRef(new Map()); // address -> boolean

  /** RESET when base/filter changes */
  useEffect(() => {
    setRows([]); setOffset(0); setEnd(false);
    setError(''); setTotalCount(null); setInitialised(false);
    seen.current.clear();
  }, [TZKT, adminFilter]);

  /**
   * Non-empty network-wide total for allowed contracts.
   * Primary: server-side attempt with `tokensCount.gt=0`.
   * Fallback: plain count (may include empties) and we reconcile
   *           to the exact non-empty total when paging reaches end.
   */
  const fetchNonEmptyTotal = useCallback(async () => {
    const base = new URLSearchParams();
    // NOTE: keep the filter narrow but compatible; some forks don't allow `kind` on /contracts/count
    base.set('typeHash.in', [...ALLOWED_TYPE_HASHES].join(','));

    // 1) Try non-empty on server
    const qsNE = new URLSearchParams(base);
    qsNE.set('tokensCount.gt', '0');

    try {
      const n = await jFetch(`${TZKT}/contracts/count?${qsNE.toString()}`);
      const num = Number(n || 0);
      if (Number.isFinite(num) && num > 0) return { value: num, precise: true };
    } catch { /* fall through */ }

    // 2) Fallback: count without non-empty constraint (may be imprecise)
    try {
      const m = await jFetch(`${TZKT}/contracts/count?${base.toString()}`);
      const num = Number(m || 0);
      return { value: Number.isFinite(num) ? num : 0, precise: false };
    } catch {
      return { value: 0, precise: false };
    }
  }, [TZKT]);

  /**
   * Page fetcher (unfiltered browse).
   * IMPORTANT: Avoid brittle columns - do NOT project `tokensCount` here
   * (some TzKT builds 400 that projection). We also provide a loose fallback
   * for servers that don't honor `typeHash.in` by fetching without it and
   * filtering client-side.
   */
  const fetchBatchCollections = useCallback(async (startOffset = 0, step = 48) => {
    const qs = new URLSearchParams();
    // No `kind` to maximize compatibility across forks.
    qs.set('select', 'address,alias,typeHash,lastActivityTime');
    qs.set('typeHash.in', [...ALLOWED_TYPE_HASHES].join(','));
    qs.set('offset', String(startOffset));
    qs.set('limit', String(step));

    const strictUrl = `${TZKT}/contracts?${qs.toString()}`;
    let list = await jFetch(strictUrl).catch(() => null);

    // Fallback: drop the `typeHash.in` constraint if the server rejected the query.
    if (!Array.isArray(list)) {
      const loose = new URLSearchParams();
      loose.set('select', 'address,alias,typeHash,lastActivityTime');
      loose.set('offset', String(startOffset));
      loose.set('limit', String(step));
      list = await jFetch(`${TZKT}/contracts?${loose.toString()}`).catch(() => []);
    }

    if (!Array.isArray(list)) {
      return [];
    }

    const enriched = list.map((row) => {
      if (!row || typeof row !== 'object') return row;
      const lastActivity = Date.parse(row.lastActivityTime || row.last_activity_time || '') || 0;
      return { ...row, _lastActivityTs: lastActivity };
    });

    enriched.sort((a, b) => {
      const ta = Number(a?._lastActivityTs || 0);
      const tb = Number(b?._lastActivityTs || 0);
      if (tb !== ta) return tb - ta;
      const aa = String(a?.address || '');
      const bb = String(b?.address || '');
      return aa.localeCompare(bb);
    });

    return enriched.map((row) => {
      if (row && typeof row === 'object' && '_lastActivityTs' in row) {
        const clone = { ...row };
        delete clone._lastActivityTs;
        return clone;
      }
      return row;
    });
  }, [TZKT]);

  /** Robust non-empty check for contracts (any token with totalSupply>0). */
  const filterNonEmpty = useCallback(async (list = []) => {
    const out = [];
    const chunk = (arr, n = 8) => { const r = []; for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n)); return r; };
    const unknown = list.filter((c) => !nonEmptyCache.current.has(c.address));
    for (const grp of chunk(unknown, 8)) {
      await Promise.all(grp.map(async (c) => {
        try {
          // Avoid TzKT /tokens/count inconsistencies by checking rows directly
          const rows = await jFetch(`${TZKT}/tokens?contract=${encodeURIComponent(c.address)}&select=tokenId,totalSupply&limit=10000`);
          const anyLive = Array.isArray(rows) && rows.some((r) => Number(r?.totalSupply ?? r?.total_supply ?? 0) > 0);
          nonEmptyCache.current.set(c.address, anyLive);
        } catch {
          nonEmptyCache.current.set(c.address, true); // best-effort: let card decide later
        }
      }));
    }
    for (const c of list) {
      const ok = nonEmptyCache.current.get(c.address);
      if (ok == null || ok === true) out.push(c);
    }
    return out;
  }, [TZKT]);

  /** Admin list - discover by creator (client-side), then pre-filter empties. */
  const fetchAdminCollections = useCallback(async () => {
    if (!adminFilter) return [];
    const list = await discoverCreated(adminFilter, NETWORK).catch(() => []);
    return Array.isArray(list) ? list : [];
  }, [adminFilter, NETWORK]);

  /** Core paginator with scan-ahead; avoids flicker and ensures forward progress. */
  const loadMore = useCallback(async (initial = false) => {
    if (adminFilter) return;            // no "load more" in admin view
    if (fetching.current || end) return;

    fetching.current = true;
    if (!initial) setLoading(true);

    const PAGE = 48;
    const SCAN_AHEAD = initial ? 2 : 4; // pull a couple of pages up-front
    let localOffset = initial ? 0 : offset;
    let reachedEnd = false;
    const next = [];

    try {
      for (let i = 0; i < SCAN_AHEAD; i += 1) {
        const batch = await fetchBatchCollections(localOffset, PAGE);
        localOffset += batch.length;
        if (batch.length < PAGE) reachedEnd = true;

        for (const raw of batch) {
          const c = toContractObj(raw);
          if (!c) continue;

          // Gate by known ZeroContract type-hash (client-side safety, even if server ignored it)
          const h = Number(c.typeHash ?? NaN);
          if (Number.isFinite(h) && !ALLOWED_TYPE_HASHES.has(h)) continue;

          const k = c.address;
          if (!k || seen.current.has(k)) continue;
          seen.current.add(k);
          next.push(c);
        }

        // Break early if we already have a visible increment
        if (next.length >= PAGE) break;
      }

      if (next.length) {
        const filtered = await filterNonEmpty(next);
        setRows((prev) => [...prev, ...filtered]);
        setOffset(localOffset);
      }
      if (reachedEnd || next.length === 0) setEnd(true);
    } catch (e) {
      console.error('Collections paging error', e);
      setError('Failed to load collections.');
      setEnd(true);
    } finally {
      setLoading(false);
      fetching.current = false;
    }
  }, [adminFilter, end, offset, fetchBatchCollections]);

  /** Initial load - full setup for both paths without double-fetching. */
  useEffect(() => {
    let abort = false;

    (async () => {
      setLoading(true); setError('');

      try {
        if (adminFilter) {
          const created = await fetchAdminCollections();
          if (abort) return;

          // Normalise + gate by typeHash; allow unknown tokensCount (card hides empty)
          const uniq = [];
          for (const raw of created) {
            const c = toContractObj(raw);
            if (!c) continue;
            const h = Number(c.typeHash ?? NaN);
            if (Number.isFinite(h) && !ALLOWED_TYPE_HASHES.has(h)) continue;
            if (!c.address || seen.current.has(c.address)) continue;
            seen.current.add(c.address);
            uniq.push(c);
          }

          const filtered = await filterNonEmpty(uniq);
          setRows(filtered);
          // Best-effort total for admin view
          const adminTotal = filtered.length;
          setTotalCount(adminTotal);
          setEnd(true); // delivered all at once
          setInitialised(true);
        } else {
          const total = await fetchNonEmptyTotal();
          if (abort) return;

          // If server gave a precise count use it; else keep a non-precise
          // number for early feedback - but never lock in a suspicious 0.
          const initialTotal =
            total?.precise ? total.value : (total?.value ? total.value : null);
          setTotalCount(initialTotal);

          await loadMore(true);
          if (abort) return;
          setInitialised(true);
        }
      } catch (e) {
        console.error('Collections init error', e);
        if (!abort) setError('Failed to load collections.');
      } finally {
        if (!abort) setLoading(false);
      }
    })();

    return () => { abort = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [TZKT, adminFilter]);

  useEffect(() => {
    if (adminFilter) return undefined;
    if (!initialised) return undefined;
    if (fetching.current || loading || end) return undefined;
    const delay = rows.length >= 96 ? 600 : 260;
    const id = setTimeout(() => { loadMore(false); }, delay);
    return () => clearTimeout(id);
  }, [adminFilter, end, initialised, loading, loadMore, rows.length]);

  /**
   * Reconcile totals: once we've reached end in the unfiltered view,
   * we now know the exact non-empty count (rows.length). If the header
   * total was approximate or missing, replace it with the precise one.
   */
  useEffect(() => {
    if (!adminFilter && end) {
      setTotalCount((prev) => {
        const exact = rows.length;
        if (prev == null) return exact;
        return exact > 0 && exact !== prev ? exact : prev;
      });
    }
  }, [adminFilter, end, rows.length]);

  /*---------------------------------------------------------*
   * Render helpers
   *---------------------------------------------------------*/
  const showingCount = rows.length;

  const headerCounts = useMemo(() => {
    const showing = Number(showingCount || 0).toLocaleString();
    if (totalCount == null) {
      return <>Total: ... <span>({`showing ${showing}`})</span> {loading && <LoadingSpinner size={16} />}</>;
    }
    const total = Number(totalCount || 0).toLocaleString();
    return <>Total: {total} <span>({`showing ${showing}`})</span> {loading && <LoadingSpinner size={16} />}</>;
  }, [totalCount, showingCount, loading]);

  const grid = useMemo(() => (
    <Grid>
      {rows.map((c) => (
        <CollectionCard
          key={c.address}
          contract={c}
          // no initialTokensCount -> card handles empties when hideIfEmpty is set
          hideIfEmpty
        />
      ))}
    </Grid>
  ), [rows]);

  /*---------------------------------------------------------*
   * UI
   *---------------------------------------------------------*/
  return (
    <Wrap>
      <ExploreNav />

      <ControlsRow>
        <Title>Explore - Collections</Title>
        <Counts aria-live="polite">{headerCounts}</Counts>

        {!!adminFilter && (
          <AdminBanner>
            <strong>Collections by&nbsp;</strong>
            <code>{adminFilter}</code>
            <span>- Showing collections created/administered by this address.</span>
            <button
              type="button"
              aria-label="Clear filter"
              onClick={() => router.push('/explore/collections')}
              title="Clear filter"
            >
              X
            </button>
          </AdminBanner>
        )}
      </ControlsRow>

      {error && <Subtle role="alert">{error}</Subtle>}

      {initialised && grid}

      {!initialised && (
        <Center><LoadingSpinner size={32} /></Center>
      )}

      {/* Empty-state hint (only for unfiltered view after load) */}
      {!adminFilter && end && rows.length === 0 && (
        <Center><Subtle>No collections found.</Subtle></Center>
      )}

      {!adminFilter && !end && (
        <Center>
          <PixelButton
            type="button"
            onClick={() => loadMore(false)}
            disabled={loading || fetching.current}
            size="sm"
            aria-busy={loading || fetching.current}
          >
            {loading || fetching.current ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <LoadingSpinner size={16} />
                Loading...
              </span>
            ) : 'Load More +'}
          </PixelButton>
        </Center>
      )}
    </Wrap>
  );
}

/* What changed & why (r11):
   - FIX: Unfiltered browse could show 0 because selecting `tokensCount`
     on /contracts is not supported on some TzKT deployments (HTTP 400).
     We removed that projection from list queries and rely on Card.hideIfEmpty.
   - Robust list fetch: try `typeHash.in` but fall back to a loose query
     if the server rejects it, and filter by allowed hashes client-side.
   - Accurate totals: attempt server non-empty count, otherwise show
     Total: ... and reconcile to the precise rows.length when paging ends.
   - Grid: compact 5-up+ remains; admin filter (discoverCreated) unchanged.
*/







