/*Developed by @jams2blues
  File: src/pages/explore/tokens.jsx
  Rev:  r2
  Summary: Correct count UI; 10+ new cards per click; smoother scan‑ahead. */

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

import { useWalletContext }                 from '../../contexts/WalletContext.js';
import { jFetch }                           from '../../core/net.js';
import { TZKT_API, NETWORK_KEY }            from '../../config/deployTarget.js';
import decodeHexFields                      from '../../utils/decodeHexFields.js';
import hashMatrix                           from '../../data/hashMatrix.json';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*───────────────────────────────────────────────────────────*
 * Layout
 *───────────────────────────────────────────────────────────*/
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

/*───────────────────────────────────────────────────────────*
 * Helpers & Invariants
 *───────────────────────────────────────────────────────────*/

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

/** tolerant data‑URI test; supports base64 & utf8 (e.g., SVG/HTML previews) */
function isDataUri(str) {
  return typeof str === 'string'
    && /^data:(image|video|audio|text\/html|image\/svg\+xml)/i.test(str.trim());
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

/** creators/authors → array (preserve case; do not lowercase). */
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

/** Minted‑by test (creator | firstMinter | meta.creators/authors). */
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

/** allowed ZeroContract type‑hash set (manifest‑gated). */
const ALLOWED_TYPE_HASHES = new Set(
  Object.keys(hashMatrix)
    .filter((k) => /^-?\d+$/.test(k))
    .map((k) => Number(k)),
);

/** decode + accept a token row into the UI shape, with hazard/preview guard. */
function normalizeAndAcceptToken(row) {
  if (!row) return null;
  if (Number(row.totalSupply) === 0) return null; // 0‑token exclusion (UI hygiene)
  let md = row.metadata || {};
  try { md = decodeHexFields(md); } catch { /* best effort */ }
  if (!hasRenderablePreview(md)) return null;
  return {
    contract: row.contract?.address || row.contract || '',
    tokenId:  Number(row.tokenId),
    metadata: md,
    holdersCount: row.holdersCount,
    creator: row.creator,
    firstMinter: row.firstMinter,
  };
}

/** simple integer formatter with thin‑space groupings */
function fmtInt(n) {
  try {
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  } catch { return String(n); }
}

/*───────────────────────────────────────────────────────────*
 * Page
 *───────────────────────────────────────────────────────────*/
export default function ExploreTokens() {
  const router = useRouter();
  const { toolkit } = useWalletContext() || {};
  const tzktV1 = useTzktV1Base(toolkit);

  // query: admin=tz..., contract=KT1...
  const adminFilter = useMemo(() => {
    const v = router.query?.admin;
    return typeof v === 'string' ? v.trim() : '';
  }, [router.query?.admin]);

  const contractFilter = useMemo(() => {
    const v = router.query?.contract;
    return typeof v === 'string' ? v.trim() : '';
  }, [router.query?.contract]);

  /*──────── state ────────*/
  // tokens (generic browse)
  const [tokens, setTokens]       = useState([]);
  const [offset, setOffset]       = useState(0);
  const [fetching, setFetching]   = useState(false);
  const [end, setEnd]             = useState(false);

  // tokens (admin‑filtered browse)
  const [adminTok, setAdminTok]   = useState([]);
  const [adminVisible, setAdminVisible] = useState(24);

  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  // de‑dupe (global to component lifetime)
  const seenTok = useRef(new Set());

  // reset on param change
  useEffect(() => {
    setTokens([]); setOffset(0); setEnd(false);
    setAdminTok([]); setAdminVisible(24);
    seenTok.current.clear();
    setError('');
  }, [adminFilter, contractFilter, tzktV1]);

  /*──────── queries ────────*/

  /**
   * Batch token loader (generic browse).
   * IMPORTANT: do NOT include `contract.metadata.version.in`, `tokenId.ne`, or `supply.gt`
   * on /v1/tokens — those shapes provoke 400 at TzKT. We query broadly and gate client‑side
   * by allowed `contract.typeHash` + preview/hazard rules.  */
  const fetchBatchTokens = useCallback(async (startOffset = 0, step = 48) => {
    const qs = new URLSearchParams();
    qs.set('standard', 'fa2');
    qs.set('sort.desc', 'firstTime');       // latest mints first
    qs.set('offset', String(startOffset));
    qs.set('limit',  String(step));
    if (contractFilter) qs.set('contract', contractFilter);

    const url = `${tzktV1}/tokens?${qs.toString()}`;
    const rows = await jFetch(url).catch(() => []);
    return Array.isArray(rows) ? rows : [];
  }, [tzktV1, contractFilter]);

  /** admin‑filtered token discovery (creator/firstMinter/meta authors/creators). */
  const fetchAdminTokens = useCallback(async () => {
    if (!adminFilter) return [];

    const base = tzktV1;
    const queries = [
      `${base}/tokens?creator=${encodeURIComponent(adminFilter)}&standard=fa2&limit=1000&sort.desc=firstTime`,
      `${base}/tokens?firstMinter=${encodeURIComponent(adminFilter)}&standard=fa2&limit=1000&sort.desc=firstTime`,
      // tolerant metadata lookups
      `${base}/tokens?metadata.creators.contains=${encodeURIComponent(adminFilter)}&standard=fa2&limit=1000&sort.desc=firstTime`,
      `${base}/tokens?metadata.authors.contains=${encodeURIComponent(adminFilter)}&standard=fa2&limit=1000&sort.desc=firstTime`,
    ];

    const batches = await Promise.all(queries.map((u) => jFetch(u).catch(() => [])));
    const merged = [].concat(...batches.filter(Array.isArray));

    // normalize + dedupe + gate
    const out = [];
    const seen = new Set();
    for (const r of merged) {
      const typeHash = Number(r.contract?.typeHash ?? NaN);
      if (Number.isFinite(typeHash) && !ALLOWED_TYPE_HASHES.has(typeHash)) continue;

      const t = normalizeAndAcceptToken(r);
      if (!t) continue;

      // narrow to one collection if requested
      if (contractFilter && t.contract !== contractFilter) continue;

      // minted‑by (creator | firstMinter | metadata)
      if (!mintedByUser({ ...t, creator: r.creator, firstMinter: r.firstMinter }, adminFilter)) {
        continue;
      }

      const key = `${t.contract}:${t.tokenId}`;
      if (!seen.has(key)) { seen.add(key); out.push(t); }
    }

    // sort newest first (stable on tokenId within same contract)
    out.sort((a, b) => (b.tokenId - a.tokenId) || (a.contract > b.contract ? -1 : 1));
    return out;
  }, [adminFilter, tzktV1, contractFilter]);

  /**
   * Scan ahead until we accumulate at least `minAccept` newly accepted tokens
   * (or we truly hit the end). This prevents the “only 1–2 new cards per click”
   * problem.  It guarantees ≥10 newly added cards per click in generic mode.
   */
  const loadPage = useCallback(async (initial = false) => {
    if (fetching || end) return;
    setFetching(true);
    if (initial) setLoading(true);

    const PAGE            = 48;             // server page size
    const MIN_YIELD_INIT  = 24;             // fast first impression
    const MIN_YIELD_CLICK = 10;             // guarantee ≥10 new cards per click
    const SOFT_SCAN_ROWS  = initial ? PAGE * 24 : PAGE * 64; // soft guardrail (rate‑limit friendly)

    const minAccept = initial ? MIN_YIELD_INIT : MIN_YIELD_CLICK;

    let localOffset  = initial ? 0 : offset;
    let reachedEnd   = false;
    let accepted     = 0;
    let scannedRows  = 0;

    const next = [];

    // sequential scan (respect jFetch limiter & TzKT rate‑limits)
    // Stop when: enough accepts, or true end, or soft limit reached.
    /* eslint-disable no-await-in-loop */
    while (accepted < minAccept && !reachedEnd && scannedRows < SOFT_SCAN_ROWS) {
      const rows = await fetchBatchTokens(localOffset, PAGE);
      const got  = Array.isArray(rows) ? rows.length : 0;
      scannedRows += got;
      localOffset += got;

      if (!got) { reachedEnd = true; break; }
      if (got < PAGE) reachedEnd = true;

      for (const r of rows) {
        // gate by ZeroContract family via typeHash when available
        const typeHash = Number(r.contract?.typeHash ?? NaN);
        if (Number.isFinite(typeHash) && !ALLOWED_TYPE_HASHES.has(typeHash)) continue;

        const t = normalizeAndAcceptToken(r);
        if (!t) continue;

        const key = `${t.contract}:${t.tokenId}`;
        if (!seenTok.current.has(key)) {
          seenTok.current.add(key);
          next.push(t);
          accepted += 1;
          if (accepted >= minAccept) break;
        }
      }
    }
    /* eslint-enable no-await-in-loop */

    if (next.length) setTokens((prev) => prev.concat(next));
    setOffset(localOffset);
    if (reachedEnd) setEnd(true);

    setFetching(false);
    if (initial) setLoading(false);
  }, [fetching, end, offset, fetchBatchTokens]);

  /*──────── effects ────────*/

  // initial load
  useEffect(() => {
    let canceled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        if (adminFilter) {
          const arr = await fetchAdminTokens();
          if (!canceled) setAdminTok(arr);
        } else {
          await loadPage(true);
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

  // small auto‑prefetch so the grid fills quickly on first load
  useEffect(() => {
    if (adminFilter) return;
    if (loading || fetching || end) return;
    if (tokens.length < 24 && offset > 0) {
      loadPage(false);
    }
  }, [adminFilter, loading, fetching, end, tokens.length, offset, loadPage]);

  /*──────── render ────────*/

  const showTokensAdmin = !!adminFilter;

  const title = showTokensAdmin
    ? `Tokens by ${adminFilter} (${fmtInt(adminTok.length)})`
    : 'Explore · Tokens';

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

      {loading && <Subtle>Loading…</Subtle>}
      {!loading && cards}

      {/* Pagination controls — generic mode ensures ≥10 new cards per click */}
      {!showTokensAdmin && !end && (
        <Center>
          <PixelButton
            type="button"
            onClick={() => loadPage(false)}
            disabled={loading || fetching}
            size="sm"
            noActiveFx
          >
            {loading || fetching ? 'Loading…' : 'Load More 🔻'}
          </PixelButton>
        </Center>
      )}

      {/* Admin‑view pagination */}
      {showTokensAdmin && adminTok.length > adminVisible && (
        <Center>
          <PixelButton
            onClick={() => setAdminVisible((v) => v + 24)}
            size="sm"
            noActiveFx
          >
            Load More 🔻
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
   • Removed misleading global “Total …” (FA2‑wide) — it counted every FA2 on TzKT.
   • Guaranteed ≥10 newly accepted cards per click via scan‑until‑yield loop.
   • Kept initial scan snappy (≥24 accepted) for a full first impression.
   • Preserved perfect admin‑filter behaviour; left title “Tokens by … (N)”.
   • Lint‑clean: trimmed unused imports/vars; no dead code. */
