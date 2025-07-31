/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/my/collections.jsx
  Rev :    r3    2025‑07‑31 UTC
  Summary: Restrict My Collections to ZeroContract deployments only.
           This refactor retains the dynamic fetching of manager,
           creator and owned contracts but now imports jFetch and
           hashMatrix to filter the resulting addresses.  After
           collecting candidate contracts, the page queries each
           contract’s typeHash via TzKT and includes only those
           matching a known ZeroContract version, ensuring off‑site
           collections (e.g. objkt.com) never appear.  The page
           continues to redirect to explore with the admin filter.
────────────────────────────────────────────────────────────*/

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

// jFetch provides rate‑limited, retryable fetches with global
// concurrency control.  Importing here ensures we respect the
// platform’s TzKT API throttling invariants when fetching
// contract metadata to determine ZeroContract versions.
import { jFetch }            from '../../core/net.js';

// hashMatrix contains a mapping of numeric typeHash values to
// ZeroContract version identifiers.  We use it to derive the
// allowed set of typeHash codes recognised by the explorer.
import hashMatrix            from '../../data/hashMatrix.json' assert { type: 'json' };

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
    // Fetch collections whenever the connected address changes.  In
    // addition to gathering managed/created/owned contracts, this
    // implementation fetches each contract’s metadata to ensure the
    // typeHash corresponds to a known ZeroContract version.  See
    // docs in hashMatrix.json and TZIP invariants for details.
    async function fetchCollections() {
      if (!address) {
        setCollections([]);
        return;
      }
      setLoading(true);
      try {
        /*
         * Gather candidate contract addresses across three
         * categories related to the connected wallet:
         * 1. Contracts where the user is the manager (admin).
         * 2. Contracts where the user minted tokens.
         * 3. Contracts where the user currently holds token balances.
         */
        const unique = new Set();
        // Manager contracts
        try {
          const resMgr = await fetch(
            `${TZKT_API}/v1/contracts?manager=${address}&limit=1000&select=address`,
          );
          const dataMgr = await resMgr.json();
          dataMgr.forEach((row) => {
            const addr = row.address ?? row['address'];
            if (addr) unique.add(addr);
          });
        } catch (e) {
          console.warn('Failed to fetch managed contracts:', e);
        }
        // Creator contracts
        try {
          const resCre = await fetch(
            `${TZKT_API}/v1/tokens?creator=${address}&limit=1000&select=contract.address`,
          );
          const dataCre = await resCre.json();
          dataCre.forEach((row) => {
            const addr = row.contract?.address ?? row['contract.address'];
            if (addr) unique.add(addr);
          });
        } catch (e) {
          console.warn('Failed to fetch created tokens:', e);
        }
        // Owned contracts (balances)
        try {
          const resBal = await fetch(
            `${TZKT_API}/v1/tokens/balances?account=${address}&balance.ne=0&limit=1000&select=token.contract.address`,
          );
          const dataBal = await resBal.json();
          dataBal.forEach((row) => {
            const addr = row.token?.contract?.address ?? row['token.contract.address'];
            if (addr) unique.add(addr);
          });
        } catch (e) {
          console.warn('Failed to fetch owned tokens:', e);
        }
        // Convert to array for iteration and filter to ZeroContract versions.
        const allAddrs = Array.from(unique);
        // Derive a set of allowed typeHash values from hashMatrix.
        const allowedHashes = new Set(
          Object.keys(hashMatrix).map((h) => Number(h)),
        );
        const details = await Promise.allSettled(
          allAddrs.map((addr) =>
            jFetch(`${TZKT_API}/v1/contracts/${addr}`).catch((err) => {
              console.warn(`Failed to fetch contract details for ${addr}:`, err);
              return null;
            }),
          ),
        );
        const filtered = [];
        details.forEach((res, idx) => {
          if (res.status === 'fulfilled' && res.value) {
            const typeHash = Number(res.value?.typeHash);
            // Extract and normalise the version string from contract metadata.
            const ver = (res.value?.metadata?.version || '').toString();
            const verOK = /^zerocontractv/i.test(ver.trim());
            if (allowedHashes.has(typeHash) && verOK) {
              filtered.push(allAddrs[idx]);
            }
          }
        });
        setCollections(filtered);
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

/* What changed & why: Added filtering to ensure only ZeroContract collections
   appear.  This version imports jFetch and hashMatrix to collect
   managed/created/owned contract addresses, then fetches each
   contract’s typeHash and filters to known ZeroContract versions.
   The UI and redirect logic remain unchanged. */
/* EOF */