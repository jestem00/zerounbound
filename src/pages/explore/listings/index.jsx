/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/explore/listings/index.jsx
  Rev :    r2    2025‑07‑30 UTC
  Summary: Responsive marketplace listings page.  Presents
           listing cards in a grid that adapts to screen size
           (≈5 cards per row on 1080p+).  Loads active
           listings via marketplace big‑maps, falls back to
           on‑chain views or token enumeration and paginates
           results (10 per page).  Delegates to
           TokenListingCard for rich details (hazards, authors,
           price, ID).  Works without a connected wallet and
           respects the current network selection.
─────────────────────────────────────────────────────────────*/

import React, { useEffect, useState } from 'react';
import styledPkg                        from 'styled-components';

// Use wallet context to detect the active network and provide
// toolkit for on‑chain view fallbacks
import { useWalletContext }             from '../../../contexts/WalletContext.js';

// Import UI components
import TokenListingCard                 from '../../../ui/TokenListingCard.jsx';
import ExploreNav                       from '../../../ui/ExploreNav.jsx';
import LoadingSpinner                   from '../../../ui/LoadingSpinner.jsx';

// Network configuration
import { NETWORK_KEY }                  from '../../../config/deployTarget.js';

// Marketplace helpers for discovery and fallback
import {
  listActiveCollections,
  listListingsForCollectionViaBigmap,
} from '../../../utils/marketplaceListings.js';
import listLiveTokenIds                 from '../../../utils/listLiveTokenIds.js';
import { fetchOnchainListingsForCollection } from '../../../core/marketplace.js';

// Static fallback list of known ZeroContract collections
import hashMatrix                       from '../../../data/hashMatrix.json';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/* A responsive grid container mirroring the main explore grid.  It
 * automatically adjusts the number of columns based on viewport
 * width using CSS variable --col (see invariant I105).  Each
 * token card occupies one grid cell. */
const Grid = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--col), 1fr));
  gap: 1.2rem;
  justify-content: stretch;
  /* Define a responsive column width similar to the explore grid
   * (see invariant I105).  This ensures 4–5 cards appear per row
   * on large screens and gracefully scales down on mobile. */
  --col: clamp(160px, 18vw, 220px);
`;

export default function ListingsPage() {
  const { toolkit } = useWalletContext() || {};
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  // Control the number of items shown before requiring a Load More click.
  // Start with 10 items and increment by 10 on each click.
  const [showCount, setShowCount] = useState(10);

  useEffect(() => {
    let cancel = false;
    async function load() {
      // Determine the active network.  When a wallet is connected
      // the toolkit exposes its network type; otherwise fall back
      // to the configured NETWORK_KEY from deployTarget.js.
      const net = toolkit && toolkit._network?.type && /mainnet/i.test(toolkit._network.type)
        ? 'mainnet'
        : (NETWORK_KEY || 'ghostnet');
      setLoading(true);
      const result = [];
      // 1 · Discover collection addresses with active listings.  Do not
      // filter by ZeroContract here; the metadata endpoint is unreliable.
      let addrs = [];
      try {
        addrs = await listActiveCollections(net, false);
      } catch {
        addrs = [];
      }
      // Fallback to static hashMatrix addresses if the API fails
      if (!addrs || addrs.length === 0) {
        addrs = Object.keys(hashMatrix || {}).filter((a) => /^KT1[0-9A-Za-z]{33}$/.test(a));
      }
      // 2 · For each collection, fetch the lowest listing per token
      for (const contract of addrs) {
        let listings = [];
        // 2a · Try the big‑map first.  This returns the lowest listing per
        // token without requiring a wallet.
        try {
          const viaBigmap = await listListingsForCollectionViaBigmap(contract, net);
          if (Array.isArray(viaBigmap) && viaBigmap.length) {
            listings = viaBigmap;
          }
        } catch {
          listings = [];
        }
        // 2b · If big‑map returns nothing and a wallet is available, try
        // on‑chain views as a secondary source.  Group by token and
        // select the lowest price per token.
        if ((!listings || listings.length === 0) && toolkit) {
          try {
            const raw = await fetchOnchainListingsForCollection({ toolkit, nftContract: contract });
            if (Array.isArray(raw) && raw.length) {
              const byToken = new Map();
              for (const l of raw) {
                if (!l.active || Number(l.amount) <= 0) continue;
                const id    = Number(l.tokenId ?? l.token_id);
                const price = Number(l.priceMutez ?? l.price);
                const prev  = byToken.get(id);
                if (!prev || price < prev.priceMutez) {
                  byToken.set(id, { contract, tokenId: id, priceMutez: price });
                }
              }
              listings = [...byToken.values()];
            }
          } catch {
            /* ignore view errors */
          }
        }
        // 2c · Final fallback: if still no listings and wallet exists, just
        // push token IDs so the Buy bar can recheck the price later.
        if ((!listings || listings.length === 0) && toolkit) {
          try {
            const ids = await listLiveTokenIds(contract, net);
            for (const id of ids) {
              result.push({ contract, tokenId: id, priceMutez: undefined });
            }
          } catch {
            /* ignore network errors */
          }
        } else {
          result.push(...(listings || []));
        }
      }
      if (!cancel) {
        setItems(result);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancel = true;
    };
  }, [toolkit]);

  // Handler to load additional items when the user clicks the Load More button.
  const loadMore = () => {
    setShowCount((c) => c + 10);
  };

  // When the effect is loading, show a spinner
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
        <>
          <Grid>
            {items.slice(0, showCount).map(({ contract, tokenId, priceMutez }) => (
              <TokenListingCard
                key={`${contract}-${tokenId}`}
                contract={contract}
                tokenId={tokenId}
                priceMutez={priceMutez}
              />
            ))}
          </Grid>
          {showCount < items.length && (
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <button
                type="button"
                onClick={loadMore}
                style={{
                  background: 'none',
                  border: '2px solid var(--zu-accent,#00c8ff)',
                  color: 'var(--zu-fg,#fff)',
                  padding: '0.4rem 1rem',
                  fontFamily: 'Pixeloid Sans, monospace',
                  cursor: 'pointer',
                }}
              >
                Load More 🔻
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

/* What changed & why: Relocated the marketplace listings page into a
   nested index route (explore/listings/index.jsx) to resolve route
   conflicts with the optional catch-all route.  The component
   retains dynamic discovery logic and works with or without a
   wallet. */