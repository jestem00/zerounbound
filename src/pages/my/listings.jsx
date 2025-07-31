/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/my/listings.jsx
  Rev :    r1    2025‑07‑30 UTC
  Summary: My Listings page.  Displays all active marketplace
           listings created by the connected wallet.  Uses the
           on‑chain view `onchain_listings_for_seller` to
           enumerate listings and renders each as a
           TokenListingCard.  Paginated at 10 items per page
           with a “Load More 🔻” button.  Works only when
           a wallet is connected; otherwise prompts the user to
           connect.
─────────────────────────────────────────────────────────────*/

import React, { useEffect, useState } from 'react';
import styledPkg from 'styled-components';

import { useWalletContext } from '../../contexts/WalletContext.js';
import ExploreNav from '../../ui/ExploreNav.jsx';
import LoadingSpinner from '../../ui/LoadingSpinner.jsx';
import TokenListingCard from '../../ui/TokenListingCard.jsx';

import {
  fetchOnchainListingsForSeller,
} from '../../core/marketplace.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/* Grid layout using the same responsive column formula as other explore
 * pages.  The CSS variable `--col` is defined locally to clamp
 * the column width between 160px and 220px with an intermediate
 * 18vw scaling for medium screens (see invariant I105). */
const Grid = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--col), 1fr));
  gap: 1.2rem;
  justify-content: stretch;
  --col: clamp(160px, 18vw, 220px);
`;

export default function MyListingsPage() {
  const { address, toolkit } = useWalletContext() || {};
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCount, setShowCount] = useState(10);

  useEffect(() => {
    // Reset when wallet address changes
    setItems([]);
    setShowCount(10);
    if (!address || !toolkit) {
      setLoading(false);
      return;
    }
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        // Fetch all listings for the connected seller via on-chain view
        const listings = await fetchOnchainListingsForSeller({ toolkit, seller: address });
        if (!cancel && Array.isArray(listings)) {
          // Map listings into a format accepted by TokenListingCard
          const normalized = listings
            .filter((l) => l.active && Number(l.amount) > 0)
            .map((l) => ({
              contract: l.contract,
              tokenId: l.tokenId,
              priceMutez: l.priceMutez,
            }));
          setItems(normalized);
        }
      } catch (err) {
        // Silently ignore errors; leave items empty
        console.warn('Failed to fetch seller listings', err);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [address, toolkit]);

  const loadMore = () => {
    setShowCount((c) => c + 10);
  };

  if (!address) {
    return (
      <>
        <ExploreNav />
        <p style={{ marginTop: '2rem', textAlign: 'center' }}>Connect your wallet to view your listings.</p>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <ExploreNav />
        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      </>
    );
  }

  return (
    <>
      <ExploreNav />
      {items.length === 0 ? (
        <p style={{ marginTop: '2rem' }}>You have no active listings.</p>
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

/* What changed & why: Initial creation of the My Listings page.  It
   queries the on‑chain view `onchain_listings_for_seller` to
   find all active listings made by the connected wallet and
   displays them using TokenListingCard in a responsive grid.  A
   simple pagination mechanism shows 10 listings at a time and
   loads more on demand.  The page prompts the user to connect
   a wallet when no address is available. */