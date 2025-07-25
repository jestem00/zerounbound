/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/my/tokens.jsx
  Rev :    r2    2025‑07‑25 UTC
  Summary: Dynamic page showing tokens associated with the
           connected wallet.  Separates tokens minted by the
           user from those purchased via the marketplace.  Uses
           the TzKT API to fetch balances and creations, and
           displays them using TokenCard components.  Includes
           ExploreNav navigation and filter controls.
─────────────────────────────────────────────────────────────*/

import React, { useState, useEffect } from 'react';
import styledPkg from 'styled-components';
import { useWalletContext } from '../../contexts/WalletContext.js';
import { TZKT_API }          from '../../config/deployTarget.js';
import ExploreNav            from '../../ui/ExploreNav.jsx';
import PixelHeading          from '../../ui/PixelHeading.jsx';
import PixelButton           from '../../ui/PixelButton.jsx';
import TokenCard             from '../../ui/TokenCard.jsx';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(clamp(160px, 18vw, 220px), 1fr));
  gap: 1rem;
  width: 100%;
  margin-top: 1rem;
`;

export default function MyTokens() {
  const { address } = useWalletContext() || {};
  // filter can be 'creations' or 'purchases'
  const [filter, setFilter]       = useState('creations');
  const [creations, setCreations] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [visible, setVisible]     = useState(10);

  // Counts for display labels
  const creationsCount = creations.length;
  const purchasesCount = purchases.length;

  useEffect(() => {
    // Fetch tokens whenever the connected wallet address changes.
    async function fetchTokens() {
      if (!address) {
        setCreations([]);
        setPurchases([]);
        return;
      }
      setLoading(true);
      try {
        /*
         * Fetch tokens created/minted by the user.  The TzKT API allows deep
         * filtering by nested metadata fields, so query tokens whose
         * `metadata.creators` or `metadata.authors` array contains the
         * connected wallet.  Also retain the legacy `creator` filter for
         * contracts that populate that field instead of the metadata.
         * Collect contract+tokenId pairs from all three queries into a
         * unified minted set.  Note: each query is limited to 1000 entries.
         */
        const mintedSet = new Set();
        try {
          // tokens where metadata.creators contains the address
          const resMetaCreators = await fetch(
            `${TZKT_API}/v1/tokens?metadata.creators.[*]=${address}&limit=1000&select=contract.address,tokenId`
          );
          const dataMetaCreators = await resMetaCreators.json();
          (Array.isArray(dataMetaCreators) ? dataMetaCreators : []).forEach((row) => {
            const c = row.contract?.address ?? row['contract.address'];
            const id = row.tokenId ?? row['tokenId'];
            if (c && id != null) mintedSet.add(`${c}:${id}`);
          });
          // tokens where metadata.authors contains the address (fallback)
          const resMetaAuthors = await fetch(
            `${TZKT_API}/v1/tokens?metadata.authors.[*]=${address}&limit=1000&select=contract.address,tokenId`
          );
          const dataMetaAuthors = await resMetaAuthors.json();
          (Array.isArray(dataMetaAuthors) ? dataMetaAuthors : []).forEach((row) => {
            const c = row.contract?.address ?? row['contract.address'];
            const id = row.tokenId ?? row['tokenId'];
            if (c && id != null) mintedSet.add(`${c}:${id}`);
          });
          // tokens where the legacy `creator` field equals the address
          const resCre = await fetch(
            `${TZKT_API}/v1/tokens?creator=${address}&limit=1000&select=contract.address,tokenId`
          );
          const dataCre = await resCre.json();
          (Array.isArray(dataCre) ? dataCre : []).forEach((row) => {
            const c = row.contract?.address ?? row['contract.address'];
            const id = row.tokenId ?? row['tokenId'];
            if (c && id != null) mintedSet.add(`${c}:${id}`);
          });
        } catch (err) {
          // ignore errors from minted queries; mintedSet may remain empty
          console.error('Failed to fetch minted token identifiers:', err);
        }

        // Fetch all token balances for the user (owned tokens)
        const resBal = await fetch(
          `${TZKT_API}/v1/tokens/balances?account=${address}&balance.ne=0&token.standard=fa2&limit=1000&select=token.contract.address,token.tokenId,token.metadata`
        );
        const dataBal = await resBal.json();
        // Normalize owned tokens and default metadata
        const owned = (Array.isArray(dataBal) ? dataBal : [])
          .map((row) => ({
            contract: row.token?.contract?.address ?? row['token.contract.address'],
            tokenId : row.token?.tokenId            ?? row['token.tokenId'],
            metadata: row.token?.metadata            ?? row['token.metadata'] ?? {},
          }))
          .filter((t) => t.contract && t.tokenId != null)
          .map((t) => ({ ...t, tokenId: String(t.tokenId), metadata: t.metadata || {} }))
          // Filter out tokens lacking any metadata entirely
          .filter((t) => {
            const m = t.metadata;
            return m && Object.keys(m).length > 0;
          });

        // Filter tokens down to fully on‑chain NFTs (ZeroContract).  Only include
        // tokens whose metadata URIs are all data URIs.  This removes IPFS/
        // remote‑hosted tokens from the personalised views on mainnet.
        const focOwned = owned.filter((t) => {
          const m = t.metadata || {};
          const uriKeys = Object.keys(m).filter((k) => /uri$/i.test(k));
          // If no URI fields exist, treat as non‑FOC and exclude.
          if (uriKeys.length === 0) return false;
          return uriKeys.every((k) => {
            const val = m[k];
            return typeof val === 'string' && val.trim().toLowerCase().startsWith('data:');
          });
        });

        // Determine created tokens that are minted by the user and still owned.
        // Use the mintedSet composed from metadata and creator queries.  Only tokens
        // present in mintedSet are considered creations; the rest are purchases.
        const createdOwned = focOwned.filter((t) => mintedSet.has(`${t.contract}:${t.tokenId}`));
        const purchased = focOwned.filter((t) => !mintedSet.has(`${t.contract}:${t.tokenId}`));

        setCreations(createdOwned);
        setPurchases(purchased);
        setVisible(10);
      } catch (err) {
        console.error('Failed to fetch tokens:', err);
        setCreations([]);
        setPurchases([]);
      } finally {
        setLoading(false);
      }
    }
    fetchTokens();
  }, [address]);

  // Determine which list to show based on the current filter
  const tokens = filter === 'creations' ? creations : purchases;
  // Tokens to display with pagination
  const visibleTokens = tokens.slice(0, visible);

  const loadMore = () => {
    setVisible((v) => v + 10);
  };

  return (
    <div>
      {/* Include the global explore navigation bar */}
      <ExploreNav hideSearch={false} />
      {/* Page heading */}
      <PixelHeading level={3} style={{ marginTop: '1rem' }}>My Tokens</PixelHeading>
      {/* Filter buttons */}
      <div style={{ marginTop: '0.8rem', display: 'flex', gap: '0.4rem' }}>
        <PixelButton
          style={{ background: 'var(--zu-accent-sec)', color: 'var(--zu-btn-fg)' }}
          warning={filter === 'creations'}
          onClick={() => setFilter('creations')}
        >
          My Creations ({creationsCount})
        </PixelButton>
        <PixelButton
          style={{ background: 'var(--zu-accent-sec)', color: 'var(--zu-btn-fg)' }}
          warning={filter === 'purchases'}
          onClick={() => setFilter('purchases')}
        >
          My Purchases ({purchasesCount})
        </PixelButton>
      </div>
      {/* Loading indicator */}
      {loading && <p style={{ marginTop: '0.8rem' }}>Fetching your tokens…</p>}
      {/* Empty state */}
      {!loading && tokens.length === 0 && (
        <p style={{ marginTop: '0.8rem' }}>
          {filter === 'creations'
            ? 'You have not minted any tokens yet.'
            : 'You have not purchased any tokens yet.'}
        </p>
      )}
      {/* Tokens grid */}
      {!loading && visibleTokens.length > 0 && (
        <>
          <Grid>
            {visibleTokens.map((t) => (
              <TokenCard
                key={`${t.contract}:${t.tokenId}`}
                contractAddress={t.contract}
                token={{ tokenId: Number(t.tokenId), metadata: t.metadata || {} }}
              />
            ))}
          </Grid>
          {visible < tokens.length && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <PixelButton onClick={loadMore}>Load More 🔻</PixelButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* What changed & why: Converted the My Tokens page from a static
   placeholder into a dynamic implementation.  The page now
   imports ExploreNav for navigation, fetches tokens created and
   purchased by the connected wallet using the TzKT API, and
   deduplicates to separate minted tokens from purchased ones.
   Tokens are displayed with TokenCard components in a responsive
   grid, and users can toggle between creations and purchases.
   Loading and empty states improve UX. */
/* EOF */