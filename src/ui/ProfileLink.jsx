/*
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/ProfileLink.jsx
  Rev :    r1
  Summary: Clickable Tezos profile link which resolves .tez
           domains and X/Twitter alias via existing route.
*/

import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useTezosDomain } from '../utils/resolveTezosDomain.js';
import { shortAddr } from '../utils/formatAddress.js';

const MEM = new Map();

async function fetchAlias(addr) {
  if (MEM.has(addr)) return MEM.get(addr);
  try {
    const { jFetch } = await import('../core/net.js');
    const j = await jFetch(`/api/handle/${addr}`, 1).catch(() => null);
    const val = j?.alias || null;
    MEM.set(addr, val);
    return val;
  } catch { return null; }
}

export default function ProfileLink({ address }) {
  const isKt = /^KT1[0-9A-Za-z]{33}$/i.test(String(address || ''));
  const isTz = /^tz[1-4][0-9A-Za-z]{33}$/i.test(String(address || ''));
  const [alias, setAlias] = useState(null);
  const domain = useTezosDomain(isTz ? address : '');
  useEffect(() => { if (isTz) fetchAlias(address).then((a) => setAlias(a)); }, [address, isTz]);
  const label = (isTz ? (domain || alias || shortAddr(address)) : shortAddr(address));
  const href  = isTz ? `/u/${address}` : `/contracts/${address}`;
  return <a href={href} style={{ color: 'var(--zu-accent-sec)', textDecoration: 'none' }}>{label}</a>;
}

ProfileLink.propTypes = { address: PropTypes.string.isRequired };
