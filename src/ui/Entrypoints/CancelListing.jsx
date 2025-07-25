/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/CancelListing.jsx
  Rev :    r4    2025‑07‑25 UTC
  Summary: pop‑out UI for cancelling active marketplace listings.
           Fetches the seller’s active listings via off‑chain view,
           displays them in a paginated table with checkboxes, and
           allows canceling selected listings or all listings in
           one operation.  Removed per‑row cancel buttons per user
           request.  Uses a modal overlay consistent with other
           entry‑point dialogs and batches cancel calls in a
           single operation.
─────────────────────────────────────────────────────────────*/

import React, { useEffect, useState, useMemo } from 'react';
import PropTypes                                from 'prop-types';
import styledPkg                                from 'styled-components';

import PixelHeading       from '../PixelHeading.jsx';
import PixelButton        from '../PixelButton.jsx';
import OperationOverlay   from '../OperationOverlay.jsx';
import { useWalletContext } from '../../contexts/WalletContext.js';
import { fetchListings, buildCancelParams } from '../../core/marketplace.js';

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

  // Fetch active listings when dialog opens
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!open || !toolkit || !contract || tokenId == null) return;
      try {
        const all = await fetchListings({ toolkit, nftContract: contract, tokenId });
        // Filter to active listings owned by the connected wallet
        const filtered = (all || []).filter((l) => l.active && l.seller && walletAddr && l.seller.toLowerCase() === walletAddr.toLowerCase());
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
        <PixelHeading level={3}>Cancel Listings</PixelHeading>
        {listings.length === 0 ? (
          <p style={{ marginTop: '0.8rem' }}>No active listings to cancel.</p>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      onChange={toggleAll}
                      checked={pageListings.every((l) => selected[l.nonce])}
                      aria-label="Select all listings on this page"
                    />
                  </th>
                  <th>Nonce</th>
                  <th>Amount</th>
                  <th>Price (ꜩ)</th>
                </tr>
              </thead>
              <tbody>
                {pageListings.map((l) => (
                  <tr key={l.nonce}>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!selected[l.nonce]}
                        onChange={() => toggle(l.nonce)}
                        aria-label={`Select listing ${l.nonce}`}
                      />
                    </td>
                    <td>{l.nonce}</td>
                    <td>{l.amount}</td>
                    <td>{(l.priceMutez / 1_000_000).toLocaleString()}</td>
                    {/* Per-row cancel button */}
                  </tr>
                ))}
              </tbody>
            </Table>
            {pages > 1 && (
              <Pagination>
                {[...Array(pages)].map((_, idx) => (
                  <PixelButton
                    key={idx}
                    warning={idx === page}
                    onClick={() => setPage(idx)}
                  >
                    {idx + 1}
                  </PixelButton>
                ))}
              </Pagination>
            )}
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.6rem' }}>
              <PixelButton disabled={!hasSelected} onClick={handleCancel}>
                CANCEL SELECTED
              </PixelButton>
              <PixelButton
                disabled={listings.length === 0}
                onClick={() => {
                  // Select all for cancel
                  const allSel = {};
                  listings.forEach((l) => {
                    allSel[l.nonce] = true;
                  });
                    setSelected(allSel);
                    handleCancel();
                }}
              >
                CANCEL ALL
              </PixelButton>
            </div>
          </>
        )}
        {ov.open && (
          <OperationOverlay
            label={ov.label}
            onClose={() => setOv({ open: false, label: '' })}
          />
        )}
        <PixelButton style={{ marginTop: '1rem' }} onClick={onClose}>Close</PixelButton>
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

/* What changed & why: updated to r4 – removed the per‑row cancel
   buttons after user feedback; the dialog now relies solely on
   checkboxes to select listings for cancellation or the Cancel All
   button.  Updated revision and summary accordingly. */
/* EOF */