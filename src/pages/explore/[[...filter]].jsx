/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/explore/[[...filter]].jsx
  Rev :    r41   2025‑09‑25 UTC
  Summary: fix admin‑filter (keep case) + minor comment tidy
──────────────────────────────────────────────────────────────*/
import {
  useCallback, useEffect, useMemo, useState,
}                         from 'react';
import { useRouter }      from 'next/router';
import styledPkg          from 'styled-components';

import CollectionCard     from '../../ui/CollectionCard.jsx';
import TokenCard          from '../../ui/TokenCard.jsx';
import ExploreNav         from '../../ui/ExploreNav.jsx';

import hashMatrix         from '../../data/hashMatrix.json';
import { jFetch }         from '../../core/net.js';
import decodeHexFields    from '../../utils/decodeHexFields.js';
import detectHazards      from '../../utils/hazards.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── constants ─────────────────────────────────────────*/
const TZKT             = 'https://api.ghostnet.tzkt.io/v1';
const FETCH_STEP       = 48;
const FIRST_FAST       = 8;
const DESIRED_BATCH    = 24;
const RUNAWAY_LIMIT    = 10_000;
const BURN             = 'tz1burnburnburnburnburnburnburjAYjjX';
const VERSION_HASHES   = Object.keys(hashMatrix).join(',');

/*──────── styled shells ─────────────────────────────────────*/
const Wrap  = styled.main`
  width:100%;padding:1rem;max-width:1440px;margin:0 auto;
`;
const Grid  = styled.div`
  --col: clamp(160px,18vw,220px);
  display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--col),1fr));gap:10px;
`;
const Center = styled.div`
  text-align:center;margin:1.4rem 0 2rem;
  .btn{border:2px solid var(--zu-accent);background:var(--zu-bg);
       padding:.4rem 1.2rem;font:700 .9rem/1 'Pixeloid Sans';}
`;

/*──────── helpers ───────────────────────────────────────────*/
const isZeroToken = (t) => {
  if (!t || !t.metadata)                        return true;
  if (Number(t.totalSupply) === 0)              return true;
  if (t.account?.address === BURN)              return true;
  const meta = decodeHexFields(t.metadata);
  if (!meta.artifactUri?.startsWith('data:'))   return true;
  if (detectHazards(meta).broken)               return true;
  t.metadata = meta;                            // eslint-disable-line no-param-reassign
  return false;
};

/*──────── component ─────────────────────────────────────────*/
export default function ExploreGrid() {
  const router = useRouter();

  /* path / query to mode --------------------------------------------------*/
  const seg0  = Array.isArray(router.query.filter)
    ? (router.query.filter[0] || '').toString().toLowerCase()
    : '';
  const cmdQ  = (router.query.cmd || '').toString().toLowerCase();
  const pathQ = router.asPath.toLowerCase();

  const isTokensMode   = seg0 === 'tokens'   || cmdQ === 'tokens'   || pathQ.includes('/tokens');
  const isListingsMode = seg0 === 'listings' || cmdQ === 'listings' || pathQ.includes('/listings');

  /* optional admin‑creator filter (case‑preserved → tzkt is case‑sensitive) */
  const adminFilterRaw = (router.query.admin || '').toString().trim();
  const adminFilter    = /^tz[1-3][1-9A-HJ-NP-Za-km-z]{33}$/.test(adminFilterRaw)
    ? adminFilterRaw
    : '';

  /* state ----------------------------------------------------------------*/
  const [collections, setCollections] = useState([]);
  const [tokens,      setTokens]      = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [offset,      setOffset]      = useState(0);
  const [end,         setEnd]         = useState(false);

  const [seenColl] = useState(() => new Set());
  const [seenTok]  = useState(() => new Set());

  /*──────── fetch helpers ──────────────────────────────────*/
  const fetchBatchCollections = useCallback(async (off) => {
    const qs = new URLSearchParams({
      limit      : FETCH_STEP,
      offset     : off,
      'sort.desc': 'firstActivityTime',
    });
    if (adminFilter) qs.append('creator.eq', adminFilter);
    else             qs.append('typeHash.in', VERSION_HASHES);
    return jFetch(`${TZKT}/contracts?${qs}`).catch(() => []);
  }, [adminFilter]);

  const fetchBatchTokens = useCallback(async (off) => {
    const qs = new URLSearchParams({
      limit      : FETCH_STEP,
      offset     : off,
      'sort.desc': 'firstTime',
      'contract.metadata.version.in':
        'ZeroContractV1,ZeroContractV2,ZeroContractV2a,ZeroContractV2b,' +
        'ZeroContractV2c,ZeroContractV2d,ZeroContractV2e,' +
        'ZeroContractV3,ZeroContractV4,ZeroContractV4a,ZeroContractV4b,ZeroContractV4c',
    });
    return jFetch(`${TZKT}/tokens?${qs}`).catch(() => []);
  }, []);

  /*──────── batch loader ───────────────────────────────────*/
  const loadBatch = useCallback(async (batchSize) => {
    if (loading || end) return;
    setLoading(true);

    const fresh = [];
    let off     = offset;
    const target = Math.max(batchSize, 1);

    while (fresh.length < target && off - offset < RUNAWAY_LIMIT) {
      const rows = isTokensMode
        ? await fetchBatchTokens(off)
        : await fetchBatchCollections(off);

      if (!rows.length) { setEnd(true); break; }
      off += rows.length;

      if (isTokensMode) {
        rows.forEach((t) => {
          const key = `${t.contract?.address}_${t.tokenId}`;
          if (seenTok.has(key) || isZeroToken(t)) return;
          seenTok.add(key);
          fresh.push(t);
        });
      } else {
        rows.forEach((c) => {
          if (!c.address || seenColl.has(c.address)) return;
          if (Number(c.tokensCount) === 0)           return;
          seenColl.add(c.address);
          fresh.push(c);
        });
      }
      if (rows.length < FETCH_STEP) { setEnd(true); break; }
    }

    setOffset(off);
    if (isTokensMode) setTokens((p) => [...p, ...fresh]);
    else               setCollections((p) => [...p, ...fresh]);

    setLoading(false);
  }, [
    loading, end, offset, isTokensMode,
    fetchBatchTokens, fetchBatchCollections,
    seenTok, seenColl,
  ]);

  /* reset on mode / admin change ----------------------------------------*/
  useEffect(() => {
    if (!router.isReady) return;
    setTokens([]); setCollections([]); setOffset(0); setEnd(false);
    seenTok.clear(); seenColl.clear();
    loadBatch(FIRST_FAST);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, isTokensMode, isListingsMode, adminFilter]);

  useEffect(() => {
    if (!loading && !end && isTokensMode && tokens.length === 0) {
      loadBatch(FIRST_FAST);
    }
  }, [tokens.length, loading, end, isTokensMode, loadBatch]);

  /*──────── render list ────────────────────────────────────*/
  const cardList = useMemo(() => (
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
  ), [isTokensMode, tokens, collections]);

  return (
    <Wrap>
      <ExploreNav />

      {adminFilter && (
        <p style={{ textAlign:'center',fontSize:'.8rem',marginTop:'-4px' }}>
          Showing collections where creator&nbsp;=&nbsp;<code>{adminFilter}</code>
        </p>
      )}

      <Grid>{cardList}</Grid>

      {!end && (
        <Center>
          <button
            type="button"
            className="btn"
            disabled={loading}
            onClick={() => loadBatch(DESIRED_BATCH)}
          >
            {loading ? 'Loading…' : 'Load More 🔻'}
          </button>
        </Center>
      )}
    </Wrap>
  );
}
/* What changed & why (r41):
   • Preserves case on tz admin filter → tzkt creator.eq works.
   • No logic/UX regressions; lint‑clean. */
/* EOF */
