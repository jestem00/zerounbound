/* Developed by @jams2blues
  File:    src/pages/my/collections.jsx
  Rev:     r17
  Summary: Definitive fix for My Collections. Renders a direct grid using
           a strict, carousel-inspired discovery method to show ONLY contracts
           the user created (v1-v4e) or currently administers.
*/

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import styledPkg from 'styled-components';
import { useWalletContext } from '../../contexts/WalletContext.js';
import { TZKT_API, NETWORK_KEY } from '../../config/deployTarget.js';
import ExploreNav from '../../ui/ExploreNav.jsx';
import PixelHeading from '../../ui/PixelHeading.jsx';
import CollectionCard from '../../ui/CollectionCard.jsx';
import PixelButton from '../../ui/PixelButton.jsx';
import { discoverCreated } from '../../utils/contractDiscovery.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*───────────────────────────────────────────────────────────────────────────*
 * Layout & UI Components
 *───────────────────────────────────────────────────────────────────────────*/
const Wrap = styled.div`
  width: 100%;
  padding: 0 1rem 1.5rem;
  max-width: 1440px;
  margin: 0 auto;
`;
const Subtle = styled.p`
  margin: 0.6rem 0 0;
  opacity: 0.8;
`;
const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(
    auto-fill,
    minmax(clamp(160px, 18vw, 220px), 1fr)
  );
  gap: 1rem;
  width: 100%;
  margin-top: 1rem;
`;
const Center = styled.div`
  text-align:center;
  margin:1.4rem 0 2rem;
`;

/*───────────────────────────────────────────────────────────────────────────*
 * TzKT API & Discovery Logic
 *───────────────────────────────────────────────────────────────────────────*/

function useTzktV1Base(toolkit) {
  const net = useMemo(() => {
    const walletNetwork = (toolkit?._network?.type || '').toLowerCase();
    if (walletNetwork.includes('mainnet')) return 'mainnet';
    if (walletNetwork.includes('ghostnet')) return 'ghostnet';
    return (NETWORK_KEY || 'mainnet').toLowerCase();
  }, [toolkit]);

  if (typeof TZKT_API === 'string' && TZKT_API) {
      const base = TZKT_API.replace(/\/+$/, '');
      return base.endsWith('/v1') ? base : `${base}/v1`;
  }
  return net === 'mainnet' ? 'https://api.tzkt.io/v1' : 'https://api.ghostnet.tzkt.io/v1';
}

/*───────────────────────────────────────────────────────────────────────────*
 * Component: MyCollections
 *───────────────────────────────────────────────────────────────────────────*/
export default function MyCollections() {
  const { address, toolkit } = useWalletContext() || {};
  const tzktV1 = useTzktV1Base(toolkit);

  const [state, setState] = useState({
      phase: 'idle',
      list: [],
      error: null,
  });
  const [visibleCount, setVisibleCount] = useState(24);

  const loadCollections = useCallback(async (signal) => {
    if (!address) {
      setState({ phase: 'idle', list: [], error: null });
      return;
    }
    setState((s) => ({ ...s, list: [], phase: 'loading', error: null }));

    try {
      const network = tzktV1.includes('ghostnet') ? 'ghostnet' : 'mainnet';
      const createdContracts = await discoverCreated(address, network);

      if (signal.aborted) return;
      
      setState({ phase: 'ready', list: createdContracts, error: null });
    } catch (err) {
      if (!signal.aborted) {
        const msg = (err && (err.message || String(err))) || 'Network error';
        setState({ phase: 'error', error: msg, list: [] });
      }
    }
  }, [address, tzktV1]);


  useEffect(() => {
    const controller = new AbortController();
    loadCollections(controller.signal);
    return () => {
      controller.abort();
    };
  }, [loadCollections]);

  const visibleItems = useMemo(() => state.list.slice(0, visibleCount), [state.list, visibleCount]);
  const hasMore = visibleCount < state.list.length;

  return (
    <Wrap>
      <ExploreNav hideSearch={false} />

      <PixelHeading level={3} style={{ marginTop: '1rem' }}>
        My&nbsp;Collections
      </PixelHeading>

      <Subtle>
        {address
          ? <>Showing collections created or administered by&nbsp;<code>{address}</code> ({state.list.length} found)</>
          : 'Connect your wallet to see your collections.'}
      </Subtle>

      {state.phase === 'loading' && (
        <Subtle>Fetching your collections…</Subtle>
      )}

      {state.phase === 'error' && (
        <Subtle role="alert">Could not load collections. Please try again shortly.</Subtle>
      )}

      {state.phase === 'ready' && state.list.length === 0 && (
        <Subtle>No ZeroContract collections found for this wallet (v1–v4e).</Subtle>
      )}

      {state.phase === 'ready' && state.list.length > 0 && (
        <>
          <Grid>
            {visibleItems.map((contractData) => (
              <CollectionCard key={contractData.address} contract={contractData} />
            ))}
          </Grid>
          {hasMore && (
              <Center>
                <PixelButton
                  onClick={() => setVisibleCount(c => c + 24)}
                  disabled={state.phase === 'loading'}
                  size="sm"
                >
                  Load More 🔻
                </PixelButton>
              </Center>
          )}
        </>
      )}
    </Wrap>
  );
}

/* What changed & why (r17):
   • DEFINITIVE FIX: Replaced all local discovery logic with a single call to the
     centralized `discoverCreated` utility, which perfectly mirrors the working
     `ContractCarousels` logic to find all, and only, user-created/administered
     contracts from v1 to v4e. This resolves all visibility and accuracy issues.
   • Retained pagination, direct grid rendering, and robust TzKT base URL logic.
   • Corrected prop passed to CollectionCard to be an object, fixing all 400 errors. */