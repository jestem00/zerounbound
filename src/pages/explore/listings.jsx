/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/explore/listings.jsx
  Rev :    r1     2025‑07‑24 UTC
  Summary: listings page – displays all tokens across known
           contracts that currently have an active ZeroSum
           marketplace listing. Loads contract addresses from
           hashMatrix.json, fetches live token IDs and lowest
           listing prices via listLiveTokenIds() and
           fetchLowestListing(), then renders a simple grid
           with buy/list/offer controls via MarketplaceBar.
─────────────────────────────────────────────────────────────*/

import React, { useEffect, useState } from 'react';
import styledPkg                        from 'styled-components';
import { useWalletContext }             from '../../contexts/WalletContext.js';
import { fetchLowestListing }           from '../../core/marketplace.js';
import listLiveTokenIds                 from '../../utils/listLiveTokenIds.js';
import MarketplaceBar                   from '../../ui/MarketplaceBar.jsx';
import TokenCard                        from '../../ui/TokenCard.jsx';
import ExploreNav                       from '../../ui/ExploreNav.jsx';
import LoadingSpinner                   from '../../ui/LoadingSpinner.jsx';
import hashMatrix                       from '../../data/hashMatrix.json';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*
 * A responsive grid container mirroring the main explore grid. It
 * automatically adjusts the number of columns based on viewport width
 * using CSS variable --col (see invariant I105). Each token card
 * occupies one grid cell and includes an action bar for buying,
 * listing or offering on the marketplace.
 */
const Grid = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, var(--col));
  gap: 1.2rem;
  justify-content: stretch;
`;

export default function ListingsPage() {
  const { toolkit } = useWalletContext() || {};
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    async function load() {
      if (!toolkit) return;
      setLoading(true);
      const net = toolkit._network?.type && /mainnet/i.test(toolkit._network.type) ? 'mainnet' : 'ghostnet';
      // Only attempt to load contracts that look like KT1 addresses.
      const addrs = Object.keys(hashMatrix || {})
        .filter((a) => /^KT1[0-9A-Za-z]{33}$/.test(a));
      const result = [];
      for (const contract of addrs) {
        try {
          const ids = await listLiveTokenIds(contract, net);
          for (const id of ids) {
            const listing = await fetchLowestListing({ toolkit, nftContract: contract, tokenId: id });
            if (listing && listing.priceMutez > 0) {
              result.push({ contract, tokenId: id, priceMutez: listing.priceMutez });
            }
          }
        } catch {/* ignore network errors per contract */}
      }
      if (!cancel) {
        setItems(result);
        setLoading(false);
      }
    }
    load();
    return () => { cancel = true; };
  }, [toolkit]);

  if (!toolkit) {
    return (
      <>
        <ExploreNav hideSearch />
        <p style={{ marginTop: '2rem' }}>Connect your wallet to view marketplace listings.</p>
      </>
    );
  }
  if (loading) {
    return (
      <>
        <ExploreNav hideSearch />
        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      </>
    );
  }
  return (
    <>
      <ExploreNav hideSearch />
      {items.length === 0 ? (
        <p style={{ marginTop: '2rem' }}>No active listings found.</p>
      ) : (
        <Grid>
          {items.map(({ contract, tokenId }) => (
            <div key={`${contract}-${tokenId}`}>
              <TokenCard contract={contract} tokenId={tokenId} />
              <div style={{ marginTop: '0.6rem' }}>
                <MarketplaceBar contractAddress={contract} tokenId={tokenId} />
              </div>
            </div>
          ))}
        </Grid>
      )}
    </>
  );
}

/* What changed & why: new page implementing /explore/listings –
   traverses all known contract addresses from hashMatrix.json,
   loads live token IDs and queries the lowest active listing via
   ZeroSum off‑chain views. Renders each token with MarketplaceBar
   for buy/list/offer controls. */
/* EOF */