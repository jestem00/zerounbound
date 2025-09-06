/*
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/u/[address].jsx
  Rev :    r1
  Summary: Minimal user landing page. Resolves .tez and X/Twitter
           alias, shows quick links and recent on‑chain activity via
           TzKT. SSR‑safe and network‑agnostic.
*/

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import styledPkg from 'styled-components';
import ExploreNav from '../../ui/ExploreNav.jsx';
import { tzktBase } from '../../utils/tzkt.js';
import { NETWORK_KEY } from '../../config/deployTarget.js';
import { useTezosDomain } from '../../utils/resolveTezosDomain.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Wrap = styled.main`
  max-width: 1200px; margin: 0 auto; padding: 1.5rem;
  display: grid; gap: 1rem; grid-template-columns: 1fr; color: var(--zu-fg);
`;
const Card = styled.section` border: 2px solid var(--zu-accent); padding: 1rem; background: var(--zu-bg-alt); `;

async function fetchAlias(addr) {
  try { const r = await fetch(`/api/handle/${addr}`); if (!r.ok) return null; const j = await r.json(); return j.alias || null; } catch { return null; }
}

export default function UserPage() {
  const router = useRouter();
  const address = String(router.query.address || '');
  const [alias, setAlias] = useState('');
  const domain = useTezosDomain(address, NETWORK_KEY);
  const base = tzktBase(NETWORK_KEY);
  const [ops, setOps] = useState([]);

  useEffect(() => { if (address) fetchAlias(address).then((a)=>a && setAlias(a)); }, [address]);
  useEffect(() => {
    if (!address) return;
    let stop = false;
    (async () => {
      const rows = await fetch(`${base}/operations/transactions?anyof.sender.target=${address}&status=applied&limit=50&sort.desc=timestamp`).then((r)=>r.json()).catch(()=>[]);
      if (!stop) setOps(Array.isArray(rows)?rows:[]);
    })();
    return () => { stop = true; };
  }, [address, base]);

  return (
    <>
      <ExploreNav />
      <Wrap>
        <Card>
          <h2 style={{ marginTop: 0 }}>Profile</h2>
          <div><strong>Address:</strong> <code>{address}</code></div>
          {domain && (<div><strong>.tez:</strong> {domain}</div>)}
          {alias && (<div><strong>Alias:</strong> {alias}</div>)}
          <div style={{ marginTop: '.5rem' }}>
            <a href={`https://tzkt.io/${address}`} target="_blank" rel="noopener noreferrer">TzKT ↗</a>
            {' · '}
            <a href={`https://objkt.com/profile/${address}`} target="_blank" rel="noopener noreferrer">OBJKT ↗</a>
          </div>
        </Card>
        <Card>
          <h3 style={{ marginTop: 0 }}>Recent activity</h3>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {ops.map((o) => (
              <li key={o.id}>
                <code>{o.parameter?.entrypoint || 'op'}</code> · {new Date(o.timestamp).toLocaleString()} · <a href={`https://tzkt.io/${o.hash}`} target="_blank" rel="noopener noreferrer">hash</a>
              </li>
            ))}
            {ops.length === 0 && (<li>No recent activity.</li>)}
          </ul>
        </Card>
      </Wrap>
    </>
  );
}

