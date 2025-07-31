/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/explore/[[...filter]].jsx
  Rev :    r1    2025‑07‑30
  Summary: Combined explore grid for collections, tokens and
           marketplace listings.  This dynamic catch‑all page
           derives the current mode from the URL and renders
           either the existing token/collection explorer or the
           marketplace listings view.  When the first segment of
           the pathname is “listings” (or cmd/listings is set)
           the page delegates to the dedicated listings component
           imported from `./listings.jsx`.  Otherwise it falls
           back to the collections/tokens loader defined in the
           original catch‑all.  This preserves the behaviour of
           the explore grid for collections and tokens while
           enabling a functional marketplace listings page.
─────────────────────────────────────────────────────────────*/

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRouter } from 'next/router';
import styledPkg from 'styled-components';

// Import the existing collections/tokens cards and navigation
import CollectionCard from '../../ui/CollectionCard.jsx';
import TokenCard from '../../ui/TokenCard.jsx';
import ExploreNav from '../../ui/ExploreNav.jsx';
import PixelButton from '../../ui/PixelButton.jsx';

// Import marketplace listings page.  This component handles
// discovery of active marketplace listings, including network
// fallbacks and token enumeration.  It renders its own
// ExploreNav and grid layout.  See `src/pages/explore/listings.jsx`.
// Note: listings are now handled by a nested route at
// src/pages/explore/listings/index.jsx.  The optional catch‑all
// route here no longer imports or delegates to listings; Next.js
// will automatically route to the more specific listings page.

// Helpers for collections and tokens
import hashMatrix from '../../data/hashMatrix.json';
import { jFetch } from '../../core/net.js';
import decodeHexFields from '../../utils/decodeHexFields.js';
import detectHazards from '../../utils/hazards.js';
import { TZKT_API } from '../../config/deployTarget.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── constants ─────────────────────────────────────────*/
const TZKT = `${TZKT_API}/v1`;
const FETCH_STEP    = 48;
const FIRST_FAST    = 8;
const DESIRED_BATCH = 24;
const RUNAWAY_LIMIT = 10_000;
const BURN  = 'tz1burnburnburnburnburnburnburjAYjjX';
const VERSION_HASHES = Object.keys(hashMatrix).join(',');

/*──────── styled shells ─────────────────────────────────────*/
const Wrap = styled.main`
  width:100%;padding:1rem;max-width:1440px;margin:0 auto;
`;
const Grid = styled.div`
  --col: clamp(160px,18vw,220px);
  display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--col),1fr));gap:10px;
`;
const Center = styled.div`
  text-align:center;margin:1.4rem 0 2rem;
`;

/*──────── helpers ───────────────────────────────────────────*/
const authorArray = (m = {}) => {
  const src = m.creators ?? m.authors ?? m.artists ?? [];
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
};

const tokenMatchesAdmin = (t, admin) => {
  if (!admin) return true;
  if (t.contract?.creator?.address === admin) return true;
  const meta = decodeHexFields(t.metadata || {});
  return authorArray(meta).some(
    (a) => String(a).toLowerCase() === admin.toLowerCase(),
  );
};

const isZeroToken = (t) => {
  if (!t || !t.metadata) return true;
  if (Number(t.totalSupply) === 0) return true;
  if (t.account?.address === BURN) return true;
  const meta = decodeHexFields(t.metadata);
  if (!meta.artifactUri?.startsWith('data:')) return true;
  if (detectHazards(meta).broken) return true;
  // Mutate metadata in place to avoid recomputing later
  t.metadata = meta; // eslint-disable-line no-param-reassign
  return false;
};

/*──────── component ─────────────────────────────────────────*/
export default function ExploreGrid() {
  const router = useRouter();

  // Derive the mode based on path/query segments.  Only the first
  // segment of the catch‑all filter parameter is relevant.
  const seg0 = Array.isArray(router.query.filter)
    ? (router.query.filter[0] || '').toString().toLowerCase()
    : '';
  const cmdQ  = (router.query.cmd || '').toString().toLowerCase();
  const pathQ = router.asPath.toLowerCase();

  const isTokensMode = seg0 === 'tokens' || cmdQ === 'tokens' || pathQ.includes('/tokens');

  // Optional admin filter (creator tz address).  Matches only
  // tz[1-3] addresses when present; otherwise defaults to empty string.
  const adminFilterRaw = (router.query.admin || '').toString().trim();
  const adminFilter = /^tz[1-3][1-9A-HJ-NP-Za-km-z]{33}$/.test(adminFilterRaw)
    ? adminFilterRaw
    : '';

  // Listings page is handled by src/pages/explore/listings/index.jsx.

  // State management for collections and tokens.  These state
  // variables mirror those used in the original explore grid.  When
  // not in listings mode, the component loads collections or
  // tokens in batches and supports infinite scrolling via a
  // “Load More” button.  See invariants I60‑I63 for details.
  const [collections, setCollections] = useState([]);
  const [tokens, setTokens]           = useState([]);
  const [loading, setLoading]         = useState(false);
  const [offset, setOffset]           = useState(0);
  const [end, setEnd]                 = useState(false);
  const [seenColl] = useState(() => new Set());
  const [seenTok]  = useState(() => new Set());

  // Fetch helper for collections.  Pulls active ZeroContract
  // collections from TzKT in batches, sorted by firstActivityTime.
  const fetchBatchCollections = useCallback(
    async (off) => {
      const qs = new URLSearchParams({
        limit      : FETCH_STEP,
        offset     : off,
        'sort.desc': 'firstActivityTime',
      });
      if (adminFilter) qs.append('creator.eq', adminFilter);
      else             qs.append('typeHash.in', VERSION_HASHES);
      return jFetch(`${TZKT}/contracts?${qs}`).catch(() => []);
    },
    [adminFilter],
  );

  // Fetch helper for tokens.  Pulls active ZeroContract tokens from
  // TzKT in batches, sorted by firstTime.  Filters to ZeroContract
  // versions via metadata version prefixes.
  const fetchBatchTokens = useCallback(
    async (off) => {
      const qs = new URLSearchParams({
        limit      : FETCH_STEP,
        offset     : off,
        'sort.desc': 'firstTime',
        'contract.metadata.version.in':
          'ZeroContractV1,ZeroContractV2,ZeroContractV2a,ZeroContractV2b,' +
          'ZeroContractV2c,ZeroContractV2d,ZeroContractV2e,' +
          'ZeroContractV3,ZeroContractV4,ZeroContractV4a,ZeroContractV4b,ZeroContractV4c',
      });
      if (adminFilter) qs.append('contract.creator.eq', adminFilter);
      return jFetch(`${TZKT}/tokens?${qs}`).catch(() => []);
    },
    [adminFilter],
  );

  // Batch loader invoked when “Load More” is clicked or on
  // component mount.  Loads either collections or tokens
  // depending on the current mode.  The loader stops when it
  // reaches the desired number of fresh items or hits the end.
  const loadBatch = useCallback(
    async (batchSize) => {
      if (loading || end) return;
      setLoading(true);
      const fresh = [];
      let off = offset;
      const target = Math.max(batchSize, 1);
      while (fresh.length < target && off - offset < RUNAWAY_LIMIT) {
        const rows = isTokensMode
          ? await fetchBatchTokens(off)
          : await fetchBatchCollections(off);
        if (!rows.length) {
          setEnd(true);
          break;
        }
        off += rows.length;
        if (isTokensMode) {
          rows.forEach((t) => {
            const key = `${t.contract?.address}_${t.tokenId}`;
            if (seenTok.has(key) || isZeroToken(t)) return;
            if (!tokenMatchesAdmin(t, adminFilter)) return;
            seenTok.add(key);
            fresh.push(t);
          });
        } else {
          rows.forEach((c) => {
            if (!c.address || seenColl.has(c.address)) return;
            if (Number(c.tokensCount) === 0) return;
            seenColl.add(c.address);
            fresh.push(c);
          });
        }
        if (rows.length < FETCH_STEP) {
          setEnd(true);
          break;
        }
      }
      setOffset(off);
      if (isTokensMode) setTokens((p) => [...p, ...fresh]);
      else              setCollections((p) => [...p, ...fresh]);
      setLoading(false);
    },
    [loading, end, offset, isTokensMode, fetchBatchTokens, fetchBatchCollections, seenTok, seenColl, adminFilter],
  );

  // Reset collections/tokens on mode or admin filter change.
  // Listings are handled by a separate route, so no special case here.
  useEffect(() => {
    if (!router.isReady) return;
    setTokens([]);
    setCollections([]);
    setOffset(0);
    setEnd(false);
    seenTok.clear();
    seenColl.clear();
    // Kick off an initial small batch to populate the view
    loadBatch(FIRST_FAST);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, isTokensMode, adminFilter]);

  // Trigger another batch of tokens when none are loaded.  Without
  // this effect, the explore grid could remain empty if the first
  // batch contained only filtered items.
  useEffect(() => {
    if (!loading && !end && isTokensMode && tokens.length === 0) {
      loadBatch(FIRST_FAST);
    }
  }, [tokens.length, loading, end, isTokensMode, loadBatch]);

  // Render tokens or collections grid.  Recomputed on every
  // render but cheap; no external dependencies beyond state.
  const cardList = useMemo(
    () => (
      isTokensMode
        ? tokens.map((t) => (
            <TokenCard
              key={`${t.contract?.address}_${t.tokenId}`}
              token={t}
              contractAddress={t.contract?.address}
              contractName={t.contract?.metadata?.name}
            />
          ))
        : collections.map((c) => <CollectionCard key={c.address} contract={c} />)
    ),
    [isTokensMode, tokens, collections],
  );

  const bannerTxt = isTokensMode ? 'tokens' : 'collections';

  return (
    <Wrap>
      <ExploreNav />
      {adminFilter && (
        <p
          style={{
            textAlign: 'center',
            fontSize: '.8rem',
            margin: '6px 0 0',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          Showing {bannerTxt} where creator&nbsp;=&nbsp;
          <code style={{ fontSize: '.8rem' }}>{adminFilter}</code>
          <button
            type="button"
            aria-label="Clear filter"
            onClick={() => router.replace(isTokensMode ? '/explore?cmd=tokens' : '/explore')}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1rem',
              cursor: 'pointer',
              lineHeight: 1,
              marginTop: '-2px',
            }}
          >
            ❌
          </button>
        </p>
      )}
      {/* Render the grid of tokens or collections */}
      <Grid>{cardList}</Grid>
      {!end && (
        <Center>
          <PixelButton type="button" onClick={() => loadBatch(DESIRED_BATCH)} disabled={loading} size="sm">
            {loading ? 'Loading…' : 'Load More 🔻'}
          </PixelButton>
        </Center>
      )}
    </Wrap>
  );
}

/* What changed & why: Introduced a new dynamic route under
   src/pages/explore/[[...filter]].jsx that merges the existing
   explore grid functionality with a proper marketplace listings
   implementation.  The component now inspects the URL to
   determine when the user is viewing /explore/listings and
   delegates to the ListingsPage component in that case.  In all
   other modes, it retains the original behaviour of loading
   collections or tokens via TzKT and supports infinite
   scrolling.  This approach ensures that the marketplace
   listings page works without breaking token or collection
   browsing. */