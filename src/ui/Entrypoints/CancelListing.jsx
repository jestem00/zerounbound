/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/CancelListing.jsx
  Rev :    r6    2025‑07‑31 UTC
  Summary: pop‑out UI for cancelling marketplace listings. Now
           prioritises on‑chain views over off‑chain views to
           detect new listings immediately, filters by seller
           address and amount>0 instead of relying on the
           sometimes‑stale `active` flag, and resets state when
           wallet changes.  Presents listings in a paginated
           table with checkboxes and batches cancel calls in a
           single operation.  Uses OperationOverlay’s `status`
           prop for progress feedback.
────────────────────────────────────────────────────────────*/

import React, { useEffect, useState, useMemo } from 'react';
import PropTypes                                from 'prop-types';
import styledPkg                                from 'styled-components';

import PixelHeading       from '../PixelHeading.jsx';
import PixelButton        from '../PixelButton.jsx';
import OperationOverlay   from '../OperationOverlay.jsx';
import { useWalletContext } from '../../contexts/WalletContext.js';
import {
  fetchListings,
  fetchOnchainListings,
  marketplaceAddr,
  buildCancelParams,
} from '../../core/marketplace.js';

// styled-components helper
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

// Modal overlay and box for pop‑out behaviour
const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.65);
  z-index: 9999;
`;

const ModalBox = styled.section`
  background: var(--zu-bg, #0a001e);
  border: 2px solid var(--zu-accent, #8f3ce1);
  padding: 1rem;
  width: min(90%, 600px);
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 0 0 4px var(--zu-dark, #1b023a);
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 0.6rem;
  font-size: 0.9rem;
  th, td {
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid var(--zu-accent, #8f3ce1);
    text-align: left;
  }
  th {
    font-weight: bold;
  }
  tr:hover {
    background: rgba(255, 255, 255, 0.04);
  }
`;

const Pagination = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 0.8rem;
  gap: 0.4rem;
`;

export default function CancelListing({ open, contract, tokenId, onClose = () => {} }) {
  const { toolkit, address: walletAddr } = useWalletContext() || {};
  const [listings, setListings] = useState([]);
  const [selected, setSelected] = useState({});
  const [page, setPage] = useState(0);
  const perPage = 8;
  const [ov, setOv] = useState({ open: false, label: '' });

  // Snackbar helper
  const snack = (msg, sev = 'info') => {
    window.dispatchEvent(new CustomEvent('zu:snackbar', { detail: { message: msg, severity: sev } }));
  };

  // Fetch listings when dialog opens. Prefer on‑chain views for
  // freshness and fall back to off‑chain views only when on‑chain
  // returns nothing or fails. Results are filtered by seller
  // address and non‑zero amount instead of the sometimes‑stale
  // `active` flag.
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!open || !toolkit || !contract || tokenId == null) return;
      try {
        let all;
        // Prefer on‑chain view for accuracy; fallback to off‑chain if it fails or is empty
        try {
          all = await fetchOnchainListings({ toolkit, nftContract: contract, tokenId });
        } catch {
          all = [];
        }
        if (!all || all.length === 0) {
          try {
            all = await fetchListings({ toolkit, nftContract: contract, tokenId });
          } catch {
            all = [];
          }
        }
        // Filter listings owned by this wallet with non‑zero amount
        let filtered = (all || []).filter((l) => {
          if (!l || !l.seller || !walletAddr) return false;
          const sameSeller = l.seller.toLowerCase() === walletAddr.toLowerCase();
          const amount     = Number(l.amount);
          return sameSeller && amount > 0;
        });

        // Fallback: if no listings were found via on/off‑chain views but a wallet address exists,
        // query TzKT’s seller_listings big‑map directly.  This uses the network from the toolkit
        // to construct the base API URL and resolves the marketplace address via marketplaceAddr().
        if (filtered.length === 0 && walletAddr) {
          try {
            const netType = toolkit?._network?.type ?? 'mainnet';
            const marketAddr = marketplaceAddr(netType);
            const base = /mainnet/i.test(netType) ? 'https://api.tzkt.io' : 'https://api.ghostnet.tzkt.io';
            // Resolve the seller_listings big‑map pointer
            const mapsRes = await fetch(`${base}/v1/contracts/${marketAddr}/bigmaps?path=seller_listings`);
            const maps = await mapsRes.json();
            let ptr;
            if (Array.isArray(maps) && maps.length > 0) {
              const match = maps.find((m) => (m.path || m.name) === 'seller_listings');
              ptr = match ? (match.ptr ?? match.id) : undefined;
            }
            if (ptr != null) {
              // Fetch all keys (sellers) and filter by our wallet address
              const keysRes = await fetch(`${base}/v1/bigmaps/${ptr}/keys?active=true`);
              const keys = await keysRes.json();
              const fallbacks = [];
              for (const entry of keys) {
                let keyAddr;
                const k = entry.key;
                if (typeof k === 'string') {
                  keyAddr = k;
                } else if (k && typeof k.address === 'string') {
                  keyAddr = k.address;
                } else if (k && typeof k.value === 'string') {
                  keyAddr = k.value;
                }
                if (!keyAddr || keyAddr.toLowerCase() !== walletAddr.toLowerCase()) continue;
                const val = entry.value;
                const items = Array.isArray(val) ? val : [];
                for (const item of items) {
                  // Each item may include nft_contract, token_id, nonce, price, amount, active, seller
                    const itemContract = item.nft_contract || (item.contract && item.contract.address);
                    const itemTokenId  = item.token_id ?? item.tokenId;
                    const nonce        = item.nonce ?? item.listing_nonce;
                    const price        = item.price;
                    const amountVal    = item.amount;
                    const isActive     = item.active;
                    if (!itemContract || nonce == null) continue;
                    if (itemContract === contract && Number(itemTokenId) === Number(tokenId) && Number(amountVal) > 0) {
                      fallbacks.push({
                        nonce      : Number(nonce),
                        priceMutez : Number(price),
                        amount     : Number(amountVal),
                        seller     : walletAddr,
                        active     : isActive,
                      });
                    }
                }
              }
              if (fallbacks.length > 0) {
                filtered = fallbacks;
              }
            }
          } catch (fallbackErr) {
            console.error('TzKT fallback failed:', fallbackErr);
          }
        }

        if (!cancel) {
          setListings(filtered);
          // Reset selection and page when new listings are loaded
          setSelected({});
          setPage(0);
        }
      } catch (e) {
        console.error('Failed to fetch listings:', e);
        if (!cancel) {
          setListings([]);
          setSelected({});
        }
      }
    })();
    return () => { cancel = true; };
  }, [open, toolkit, contract, tokenId, walletAddr]);

  // Pagination logic
  const pages = Math.ceil(listings.length / perPage);
  const pageListings = useMemo(() => {
    const start = page * perPage;
    return listings.slice(start, start + perPage);
  }, [listings, page]);

  // Toggle selection for a listing
  const toggle = (nonce) => {
    setSelected((prev) => ({ ...prev, [nonce]: !prev[nonce] }));
  };

  // Select or deselect all listings on the current page
  const toggleAll = () => {
    const allSelected = pageListings.every((l) => selected[l.nonce]);
    const updates = { ...selected };
    for (const l of pageListings) {
      updates[l.nonce] = !allSelected;
    }
    setSelected(updates);
  };

  // Determine if any listing is selected
  const hasSelected = Object.values(selected).some((v) => v);

  // Cancel selected listings
  async function handleCancel() {
    if (!toolkit) return;
    const nonces = Object.keys(selected).filter((k) => selected[k]);
    if (nonces.length === 0) {
      snack('Select at least one listing to cancel', 'warning');
      return;
    }
    try {
      setOv({ open: true, label: 'Cancelling listing(s)…' });
      const calls = [];
      for (const nStr of nonces) {
        const params = await buildCancelParams(toolkit, {
          nftContract : contract,
          tokenId     : tokenId,
          listingNonce: Number(nStr),
        });
        calls.push(...params);
      }
      const op = await toolkit.wallet.batch(calls).send();
      await op.confirmation();
      setOv({ open: false, label: '' });
      snack('Listings cancelled ✔');
      onClose();
    } catch (e) {
      console.error('Cancel failed:', e);
      setOv({ open: false, label: '' });
      snack(e.message || 'Transaction failed', 'error');
    }
  }

  // Do not render when closed
  if (!open) return null;

  return (
    <ModalOverlay onClick={onClose}>
      <ModalBox onClick={(e) => e.stopPropagation()} data-modal="cancel-listing">
        <PixelHeading>Cancel Listings</PixelHeading>
        {listings.length === 0 ? (
          <p>No active listings to cancel.</p>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <th><input type="checkbox" onChange={toggleAll} checked={pageListings.every((l) => selected[l.nonce])} /></th>
                  <th>Nonce</th>
                  <th>Amount</th>
                  <th>Price (ꜩ)</th>
                </tr>
              </thead>
              <tbody>
                {pageListings.map((l) => (
                  <tr key={l.nonce}>
                    <td><input type="checkbox" checked={!!selected[l.nonce]} onChange={() => toggle(l.nonce)} /></td>
                    <td>{l.nonce}</td>
                    <td>{l.amount}</td>
                    <td>{(l.priceMutez / 1_000_000).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {pages > 1 && (
              <Pagination>
                {Array.from({ length: pages }, (_, i) => (
                  <PixelButton key={i} onClick={() => setPage(i)} disabled={i === page}>{i + 1}</PixelButton>
                ))}
              </Pagination>
            )}
            <div style={{ display:'flex', gap:'0.8rem', marginTop:'1rem' }}>
              <PixelButton onClick={handleCancel} disabled={!hasSelected}>Cancel Selected</PixelButton>
              <PixelButton onClick={onClose}>Close</PixelButton>
            </div>
          </>
        )}
        {ov.open && (
          <OperationOverlay
            status={ov.label}
            onCancel={() => setOv({ open: false, label: '' })}
          />
        )}
      </ModalBox>
    </ModalOverlay>
  );
}

CancelListing.propTypes = {
  open    : PropTypes.bool,
  contract: PropTypes.string,
  tokenId : PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onClose : PropTypes.func,
};

/* What changed & why: Switched to prioritising on‑chain views over
   off‑chain views to pick up newly created listings.  Added a TzKT
   fallback: when both off‑chain and on‑chain views return no
   listings for a token, the component queries the marketplace
   seller_listings big‑map via the TzKT API and extracts any
   matching listings for the connected wallet.  Filtering now
   relies on matching the seller address and a non‑zero amount
   rather than the sometimes‑stale `active` flag.  Updated revision
   and summary accordingly and retained OperationOverlay status
   support. */
