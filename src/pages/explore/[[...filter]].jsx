/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/explore/[[...filter]].jsx
  Rev :    r31   2025‑08‑27 UTC
  Summary: ?cmd=tokens mode → infinite‑scroll token gallery
──────────────────────────────────────────────────────────────*/
import { useCallback, useEffect, useState } from 'react';
import { useRouter }                       from 'next/router';
import styledPkg                            from 'styled-components';
import CollectionCard                       from '../../ui/CollectionCard.jsx';
import TokenCard                            from '../../ui/TokenCard.jsx';
import hashMatrix                           from '../../data/hashMatrix.json';
import ExploreNav                           from '../../ui/ExploreNav.jsx';
import { jFetch }                           from '../../core/net.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const NETWORK        = process.env.NEXT_PUBLIC_NETWORK || 'ghostnet';
const TZKT           = `https://api.${NETWORK}.tzkt.io/v1`;

/*── contract‑version filter (collections only) ─────────────*/
const VERSION_HASHES = Object.keys(hashMatrix).join(',');

/*── pagination ─────────────────────────────────────────────*/
const VISIBLE_BATCH  = 10;
const FETCH_STEP     = 30;

/*──────── layout shells ─────────────────────────────────────*/
const Wrap = styled.div`
  padding: 1rem;
  max-width: 100%;
`;

const Grid = styled.div`
  --col : clamp(160px, 18vw, 220px);
  display: grid;
  width: 100%;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(var(--col), 1fr));
  justify-items: center;
  padding-inline: 12px;
`;

const Center = styled.div`
  text-align: center;
  margin: 2rem 0;
`;

/*──────── component ─────────────────────────────────────────*/
export default function Explore() {
  const router              = useRouter();
  const isTokensMode        = (router.query.cmd || '') === 'tokens';

  /* collections state */
  const [collections, setCollections] = useState([]);
  const [seenColl,    setSeenColl]    = useState(() => new Set());

  /* tokens state */
  const [tokens,      setTokens]      = useState([]);
  const [seenTok,     setSeenTok]     = useState(() => new Set());

  const [offset,      setOffset]      = useState(0);
  const [loading,     setLoading]     = useState(false);

  /*──── fetch helpers ──────────────────────────────────────*/
  const fetchBatchCollections = useCallback(async (off) => {
    const params = new URLSearchParams({
      limit           : FETCH_STEP.toString(),
      offset          : off.toString(),
      'tokensCount.gt': '0',
      select          : 'address,creator,tokensCount,firstActivityTime,typeHash',
      'sort.desc'     : 'firstActivityTime',
    });
    params.append('typeHash.in', VERSION_HASHES);
    return jFetch(`${TZKT}/contracts?${params.toString()}`).catch(() => []);
  }, []);

  const fetchBatchTokens = useCallback(async (off) => {
    const params = new URLSearchParams({
      limit     : FETCH_STEP.toString(),
      offset    : off.toString(),
      'sort.desc':'firstTime',
    });
    /* keep it zero‑contract only (version filter) */
    params.append('contract.metadata.version.in',
      'ZeroContractV1,ZeroContractV2,ZeroContractV2a,ZeroContractV2b,ZeroContractV2c,ZeroContractV2d,ZeroContractV2e,ZeroContractV3,ZeroContractV4,ZeroContractV4a,ZeroContractV4b');
    return jFetch(`${TZKT}/tokens?${params.toString()}`).catch(() => []);
  }, []);

  /*──── loader (shared) ────────────────────────────────────*/
  const loadBatch = useCallback(async () => {
    if (loading) return;
    setLoading(true);

    const fresh = [];
    let off     = offset;

    while (fresh.length < VISIBLE_BATCH) {
      const rows = isTokensMode
        ? await fetchBatchTokens(off)
        : await fetchBatchCollections(off);

      if (!rows.length) break;
      off += rows.length;

      if (isTokensMode) {
        rows.forEach((t) => {
          const key = `${t.contract?.address}_${t.tokenId}`;
          if (seenTok.has(key)) return;
          seenTok.add(key);
          fresh.push(t);
        });
      } else {
        rows.forEach((c) => {
          if (seenColl.has(c.address) || Number(c.tokensCount) === 0) return;
          seenColl.add(c.address);
          fresh.push(c);
        });
      }
      if (off - offset > 500) break;              /* runaway guard */
    }

    if (isTokensMode) {
      setSeenTok(new Set(seenTok));
      setTokens((p) => [...p, ...fresh]);
    } else {
      setSeenColl(new Set(seenColl));
      setCollections((p) => [...p, ...fresh]);
    }
    setOffset(off);
    setLoading(false);
  }, [loading, offset, isTokensMode,
      fetchBatchCollections, fetchBatchTokens,
      seenColl, seenTok]);

  useEffect(() => { loadBatch(); }, [isTokensMode]); /* reset on mode change */

  /*──── render ─────────────────────────────────────────────*/
  return (
    <Wrap>
      <ExploreNav />

      <Grid>
        {isTokensMode
          ? tokens.map((t) => (
              <TokenCard
                key={`${t.contract?.address}_${t.tokenId}`}
                token={t}
                contractAddress={t.contract?.address}
                contractName={t.contract?.metadata?.name}
              />
            ))
          : collections.map((c) => (
              <CollectionCard key={c.address} contract={c} />
            ))}
      </Grid>

      <Center>
        <button type="button" className="btn" onClick={loadBatch} disabled={loading}>
          {loading ? 'Loading…' : 'Load More 🔻'}
        </button>
      </Center>
    </Wrap>
  );
}
/* What changed & why (r31):
   • Detects “?cmd=tokens” query → switches to token‑gallery mode.
   • Added TokenCard rendering with infinite‑scroll batch loader.
   • Separate seen sets avoid duplicate fetches across modes.
   • Offset resets when mode toggles ensuring fresh pagination. */
