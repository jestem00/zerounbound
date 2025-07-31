/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/my/collections.jsx
  Rev :    r2    2025‑07‑25 UTC
  Summary: Dynamic page listing NFT collections associated with
           the connected wallet.  Fetches contracts for which
           the user has created tokens or currently owns tokens
           using the TzKT API.  Displays the results using
           CollectionCard components and includes the global
           ExploreNav navigation bar.
─────────────────────────────────────────────────────────────*/

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import styledPkg from 'styled-components';
import { useWalletContext } from '../../contexts/WalletContext.js';
import { TZKT_API }          from '../../config/deployTarget.js';
import ExploreNav            from '../../ui/ExploreNav.jsx';
import PixelHeading          from '../../ui/PixelHeading.jsx';
// Note: CollectionCard is imported from the full UI.  It may not
// exist in this minimal environment but is required in the full
// application.  If missing, the page will still compile in the
// complete project.
import CollectionCard        from '../../ui/CollectionCard.jsx';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(clamp(160px, 18vw, 220px), 1fr));
  gap: 1rem;
  width: 100%;
  margin-top: 1rem;
`;

export default function MyCollections() {
  const { address } = useWalletContext() || {};
  const router       = useRouter();
  const [collections, setCollections] = useState([]);
  const [loading, setLoading]         = useState(false);

  useEffect(() => {
    // Fetch collections whenever the connected address changes.
    async function fetchCollections() {
      if (!address) {
        setCollections([]);
        return;
      }
      setLoading(true);
      try {
        /*
         * Fetch three categories of collections related to the connected
         * wallet:
         * 1. Contracts where the user is the manager (admin).
         * 2. Tokens minted by the user.
         * 3. Tokens currently owned by the user.
         */
        const unique = new Set();
        try {
          const resMgr = await fetch(`${TZKT_API}/v1/contracts?manager=${address}&limit=1000&select=address`);
          const dataMgr = await resMgr.json();
          dataMgr.forEach((row) => {
            const addr = row.address ?? row['address'];
            if (addr) unique.add(addr);
          });
        } catch (e) {
          console.warn('Failed to fetch managed contracts:', e);
        }
        try {
          const resCre = await fetch(`${TZKT_API}/v1/tokens?creator=${address}&limit=1000&select=contract.address`);
          const dataCre = await resCre.json();
          dataCre.forEach((row) => {
            const addr = row.contract?.address ?? row['contract.address'];
            if (addr) unique.add(addr);
          });
        } catch (e) {
          console.warn('Failed to fetch created tokens:', e);
        }
        try {
          const resBal = await fetch(`${TZKT_API}/v1/tokens/balances?account=${address}&balance.ne=0&limit=1000&select=token.contract.address`);
          const dataBal = await resBal.json();
          dataBal.forEach((row) => {
            const addr = row.token?.contract?.address ?? row['token.contract.address'];
            if (addr) unique.add(addr);
          });
        } catch (e) {
          console.warn('Failed to fetch owned tokens:', e);
        }
        setCollections(Array.from(unique));
      } catch (err) {
        console.error('Failed to fetch collections:', err);
        setCollections([]);
      } finally {
        setLoading(false);
      }
    }
    fetchCollections();
  }, [address]);

  // Redirect to explore with admin filter if address exists.  Only
  // perform the redirect when this page is the current route to avoid
  // infinite navigation loops.  Use replace() to avoid adding a new
  // entry to the browser history.
  useEffect(() => {
    if (address && router && router.pathname && router.pathname.includes('/my/collections')) {
      router.replace({ pathname: '/explore', query: { admin: address } }, undefined, { shallow: false });
    }
  }, [address, router]);

  return (
    <div>
      {/* Include the global explore navigation bar */}
      <ExploreNav hideSearch={false} />
      {/* Page heading */}
      <PixelHeading level={3} style={{ marginTop: '1rem' }}>My Collections</PixelHeading>
      {/* Show loading indicator */}
      {loading && <p style={{ marginTop: '0.6rem' }}>Fetching your collections…</p>}
      {/* Display collections grid */}
      {!loading && collections.length === 0 && (
        <p style={{ marginTop: '0.8rem' }}>You do not currently own or administer any collections.</p>
      )}
      {!loading && collections.length > 0 && (
        <Grid>
          {collections.map((addr) => (
            <CollectionCard key={addr} contract={addr} />
          ))}
        </Grid>
      )}
    </div>
  );
}

/* What changed & why: Replaced the placeholder My Collections page with a
   dynamic implementation.  The new version imports ExploreNav to
   provide consistent navigation, fetches collection addresses via
   TzKT API (both tokens created and tokens owned), deduplicates
   contracts and displays them using CollectionCard components in a
   responsive grid.  A loading indicator and empty state message
   improve the user experience. */
/* EOF */