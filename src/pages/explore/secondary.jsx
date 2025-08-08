/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/explore/secondary.jsx
  Rev :    r4    2025‑08‑06 UTC
  Summary: Secondary market page.  Displays listings where the
           seller is not the original creator of the token.
           Aggregates data across multiple marketplace
           instances using on‑chain views, big‑map fallbacks and
           off‑chain views. A dynamic TzKT API selector ensures
           metadata is fetched from the correct chain when the
           connected wallet’s network differs from the default.
           Requires a connected wallet because on‑chain views are
           needed to obtain seller addresses. Paginated at 10
           items per page and works alongside the primary
           listings page to differentiate between primary and
           secondary sales.
─────────────────────────────────────────────────────────────*/

import React, { useEffect, useState } from 'react';
import styledPkg from 'styled-components';

// Wallet context to determine the active wallet and toolkit
import { useWalletContext } from '../../contexts/WalletContext.js';
// Navigation bar
import ExploreNav from '../../ui/ExploreNav.jsx';
// Loading spinner for asynchronous operations
import LoadingSpinner from '../../ui/LoadingSpinner.jsx';
// Listing card component
import TokenListingCard from '../../ui/TokenListingCard.jsx';

// Network configuration for API base URLs
import { NETWORK_KEY } from '../../config/deployTarget.js';

// Marketplace helpers for discovering collections
import { listActiveCollections, listListingsForCollectionViaBigmap } from '../../utils/marketplaceListings.js';
// Marketplace helpers for querying on‑chain views
import { fetchOnchainListingsForCollection, fetchListings, marketplaceAddrs } from '../../core/marketplace.js';

// Helper to decode hex-encoded metadata strings
import decodeHexFields from '../../utils/decodeHexFields.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/* Grid definition: same responsive columns as other explore pages.
 * The CSS variable `--col` clamps the column width between 160px
 * and 220px, scaling at 18vw on intermediate screens.  See
 * invariant I105 for details. */
const Grid = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--col), 1fr));
  gap: 1.2rem;
  justify-content: stretch;
  --col: clamp(160px, 18vw, 220px);
`;

export default function SecondaryPage() {
  const { toolkit } = useWalletContext() || {};
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCount, setShowCount] = useState(10);

  useEffect(() => {
    // Reset when wallet or toolkit changes
    setItems([]);
    setShowCount(10);
    // Secondary page requires a connected wallet to query on‑chain views
    if (!toolkit) {
      setLoading(false);
      return;
    }
    let cancel = false;
    (async () => {
      setLoading(true);
      const result = [];
      // Determine network from toolkit or fallback.  This is used to
      // derive the correct TzKT API base URL when fetching token
      // metadata so that listings on both Ghostnet and Mainnet are
      // resolved properly.
      const net = toolkit._network?.type && /mainnet/i.test(toolkit._network.type)
        ? 'mainnet'
        : (NETWORK_KEY || 'ghostnet');
      // Choose the appropriate TzKT API for the resolved network.
      // When the active network differs from the default network
      // configured in deployTarget.js, using a static TZKT_API will
      // query the wrong chain and no listings will be found.  This
      // dynamic selector ensures the metadata lookup always hits the
      // correct chain.
      const tzktBase = net === 'mainnet'
        ? 'https://api.tzkt.io'
        : 'https://api.ghostnet.tzkt.io';
      try {
        // Discover all collections with active listings (do not filter by metadata)
        let addrs = [];
        try {
          addrs = await listActiveCollections(net, false);
        } catch {
          addrs = [];
        }
        // For each collection, fetch listings via on‑chain view and filter
        for (const contract of addrs) {
          let listings = [];
          try {
            const raw = await fetchOnchainListingsForCollection({ toolkit, nftContract: contract });
            if (Array.isArray(raw) && raw.length) {
              listings = raw.filter((l) => l.active && Number(l.amount) > 0);
            }
          } catch {
            listings = [];
          }
          // Fallback: if no listings were returned from the on‑chain view,
          // attempt to recover listings via the listings big‑map and
          // off‑chain views.  This ensures secondary sales are still
          // discoverable when the on‑chain view is unavailable or empty.
          if ((!listings || listings.length === 0) && toolkit) {
            try {
              const viaBigmap = await listListingsForCollectionViaBigmap(contract, net);
              if (Array.isArray(viaBigmap) && viaBigmap.length) {
                const fallback = [];
                for (const { tokenId: id } of viaBigmap) {
                  try {
                    const offchain = await fetchListings({
                      toolkit,
                      nftContract: contract,
                      tokenId: id,
                    });
                    if (Array.isArray(offchain) && offchain.length) {
                      offchain.forEach((oc) => {
                        if (oc.active && Number(oc.amount) > 0) {
                          fallback.push({
                            tokenId: Number(id),
                            seller : oc.seller,
                            price  : oc.priceMutez,
                            priceMutez: oc.priceMutez,
                            amount : oc.amount,
                            active : oc.active,
                          });
                        }
                      });
                    }
                  } catch {
                    /* ignore off‑chain view errors */
                  }
                }
                listings = fallback;
              }
            } catch {
              /* ignore fallback errors */
            }
            // If still no listings found after off‑chain fallback, attempt to
            // parse listings directly from the marketplace’s listings big‑map.
            if (!listings || listings.length === 0) {
              try {
                const markets = marketplaceAddrs(net);
                const aggregated = [];
                for (const market of markets) {
                  try {
                    const maps = await fetch(`${tzktBase}/v1/contracts/${market}/bigmaps?path=listings`).then((r) => r.json());
                    let ptr;
                    if (Array.isArray(maps) && maps.length > 0) {
                      const match = maps.find((m) => (m.path || m.name) === 'listings');
                      ptr = match ? (match.ptr ?? match.id) : undefined;
                    }
                    if (ptr == null) continue;
                    const entries = await fetch(`${tzktBase}/v1/bigmaps/${ptr}/keys?active=true`).then((r) => r.json());
                    for (const entry of entries) {
                      const keyAddr = entry.key?.address || entry.key?.value || entry.key;
                      if (!keyAddr || typeof keyAddr !== 'string' || keyAddr.toLowerCase() !== contract.toLowerCase()) {
                        continue;
                      }
                      const values = entry.value || {};
                      for (const listing of Object.values(values)) {
                        if (!listing || typeof listing !== 'object') continue;
                        const tokenId = Number(listing.token_id ?? listing.tokenId);
                        let price = listing.price ?? listing.priceMutez;
                        let amount = listing.amount ?? listing.quantity ?? listing.amountTokens;
                        price = typeof price === 'string' ? Number(price) : price;
                        amount = typeof amount === 'string' ? Number(amount) : amount;
                        const active = listing.active !== false;
                        if (!active || !Number.isFinite(tokenId) || !Number.isFinite(price) || amount <= 0) continue;
                        aggregated.push({
                          tokenId,
                          seller : listing.seller,
                          priceMutez: price,
                          price : price,
                          amount,
                          active,
                        });
                      }
                    }
                  } catch {
                    /* ignore individual market errors */
                  }
                }
                listings = aggregated;
              } catch {
                /* ignore TzKT big‑map errors */
              }
            }
          }
          for (const l of listings) {
            const tokenId = Number(l.tokenId ?? l.token_id ?? l.tokenId);
            // Normalise seller string (off‑chain fallback may set .seller)
            const seller  = (l.seller || '').toLowerCase();
            // Fetch token metadata to determine creators list
            try {
              const metaUrl = `${tzktBase}/v1/tokens?contract=${contract}&tokenId=${tokenId}&select=metadata,creators`;
              const res    = await fetch(metaUrl);
              if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                  let md = data[0].metadata;
                  if (typeof md === 'string') {
                    try { md = decodeHexFields(md); } catch { md = {}; }
                  }
                  // Extract creators from metadata first; fallback to top‑level creators
                  const creatorsField = md.creators ?? data[0].creators ?? [];
                  const creators = Array.isArray(creatorsField)
                    ? creatorsField
                    : typeof creatorsField === 'string'
                      ? creatorsField.split(/[,;]\s*/)
                      : [];
                  const creatorMatch = creators
                    .map((c) => {
                      if (typeof c === 'string') return c.toLowerCase();
                      if (c && typeof c.address === 'string') return c.address.toLowerCase();
                      return '';
                    })
                    .filter(Boolean)
                    .includes(seller);
                  if (!creatorMatch) {
                    // Secondary sale; add to results
                    result.push({
                      contract,
                      tokenId,
                      priceMutez: Number(l.priceMutez ?? l.price),
                    });
                  }
                }
              }
            } catch {
              /* ignore metadata errors */
            }
          }
        }
      } finally {
        if (!cancel) {
          setItems(result);
          setLoading(false);
        }
      }
    })();
    return () => { cancel = true; };
  }, [toolkit]);

  const loadMore = () => {
    setShowCount((c) => c + 10);
  };

  // Prompt user to connect wallet when not connected
  if (!toolkit) {
    return (
      <>
        <ExploreNav />
        <p style={{ marginTop: '2rem', textAlign: 'center' }}>Connect your wallet to view the secondary market.</p>
      </>
    );
  }

  // Show spinner while loading
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
        <p style={{ marginTop: '2rem' }}>No secondary listings found.</p>
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

/* What changed & why: r3 – Added robust fallbacks for listing
   discovery.  When the on‑chain view returns no listings, the
   component now consults the marketplace’s listings big‑map and
   off‑chain views via `listListingsForCollectionViaBigmap` and
   `fetchListings` to recover active sales.  Metadata creators
   extraction prioritises the metadata field over the top‑level
   creators array and normalises object forms.  The dynamic TzKT
   API selection introduced in r2 remains intact. */
