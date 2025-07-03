/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/explore/[[...filter]].jsx
  Rev :    r30   2025‑08‑20 UTC
  Summary: auto‑fit minmax grid fills viewport – no side gaps
──────────────────────────────────────────────────────────────*/
import { useCallback, useEffect, useState } from 'react';
import styledPkg                            from 'styled-components';
import CollectionCard                       from '../../ui/CollectionCard.jsx';
import hashMatrix                           from '../../data/hashMatrix.json';
import ExploreNav                           from '../../ui/ExploreNav.jsx';
import { jFetch }                           from '../../core/net.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const NETWORK        = process.env.NEXT_PUBLIC_NETWORK || 'ghostnet';
const TZKT           = `https://api.${NETWORK}.tzkt.io/v1`;
const VERSION_HASHES = Object.keys(hashMatrix).join(',');
const VISIBLE_BATCH  = 10;
const FETCH_STEP     = 30;

/*──────── layout shells ─────────────────────────────────────*/
const Wrap = styled.div`
  padding: 1rem;
  max-width: 100%;
`;

const Grid = styled.div`
  /* fixed min track keeps pixel‑perfect card while flex‑filling rows */
  --col : clamp(160px, 18vw, 220px);
  display: grid;
  width: 100%;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(var(--col), 1fr));
  /* centre items when last row under‑fills (< 3 tracks on wide monitors) */
  justify-items: center;
  padding-inline: 12px;
`;

const Center = styled.div`
  text-align: center;
  margin: 2rem 0;
`;

/*──────── component ─────────────────────────────────────────*/
export default function Explore() {
  const [collections, setCollections] = useState([]);
  const [seen,        setSeen]        = useState(() => new Set());
  const [offset,      setOffset]      = useState(0);
  const [loading,     setLoading]     = useState(false);

  const fetchBatch = useCallback(async (off) => {
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

  const loadBatch = useCallback(async () => {
    if (loading) return;
    setLoading(true);

    const fresh = [];
    let off    = offset;

    while (fresh.length < VISIBLE_BATCH) {
      const rows = await fetchBatch(off);
      if (!rows.length) break;
      off += rows.length;

      rows.forEach((c) => {
        if (seen.has(c.address) || Number(c.tokensCount) === 0) return;
        seen.add(c.address);
        fresh.push(c);
      });
      if (off - offset > 500) break;              /* runaway guard */
    }

    setSeen(new Set(seen));
    setCollections((p) => [...p, ...fresh]);
    setOffset(off);
    setLoading(false);
  }, [loading, offset, seen, fetchBatch]);

  useEffect(() => { loadBatch(); }, []);          /* initial */

  return (
    <Wrap>
      <ExploreNav />

      <Grid>
        {collections.map((c) => (
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
/* What changed & why:
   • grid uses repeat(auto‑fit,minmax(var(--col),1fr)) so columns stretch
     to fill any leftover width, guaranteeing 3‑8 tracks per row on
     1080 p‑4 K monitors with no side voids.
   • justify-items:center – last row stays centred without offsetting
     full‑width rows.
*/
/* EOF */
