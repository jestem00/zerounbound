/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/CancelOffer.jsx
  Rev :    r1    2025‑07‑25 UTC
  Summary: Pop‑out UI for withdrawing (canceling) offers made
           by the connected buyer on a given NFT token.  Uses
           the get_offers_for_token view to list the buyer's
           current offers and allows canceling individually or
           all at once via the marketplace's withdraw_offer
           entrypoint.  Shows a progress overlay during
           transactions.
─────────────────────────────────────────────────────────────*/

import React, { useEffect, useState, useMemo } from 'react';
import PropTypes                                from 'prop-types';
import styledPkg                                from 'styled-components';

import PixelHeading       from '../PixelHeading.jsx';
import PixelButton        from '../PixelButton.jsx';
import OperationOverlay   from '../OperationOverlay.jsx';
import { useWalletContext } from '../../contexts/WalletContext.js';
import { getMarketContract } from '../../core/marketplace.js';
import { Tzip16Module }     from '@taquito/tzip16';

// styled-components helper
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

// Modal overlay
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

// Modal box
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
  th { font-weight: bold; }
  tr:hover { background: rgba(255, 255, 255, 0.04); }
`;

const Pagination = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 0.8rem;
  gap: 0.4rem;
`;

export default function CancelOffer({ open = false, contract = '', tokenId = '', onClose = () => {} }) {
  const { toolkit, address: walletAddr } = useWalletContext() || {};
  const [offers, setOffers] = useState([]);
  const [ov, setOv]       = useState({ open: false, label: '' });
  const [page, setPage]   = useState(0);
  const perPage = 8;

  // Snackbar helper
  const snack = (msg, sev = 'info') => {
    window.dispatchEvent(new CustomEvent('zu:snackbar', { detail: { message: msg, severity: sev } }));
  };

  // Fetch offers made by the connected wallet
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!open || !toolkit || !contract || tokenId === '' || tokenId === undefined) return;
      if (!walletAddr) return;
      try {
        // ensure Tzip16 extension
        try { toolkit.addExtension(new Tzip16Module()); } catch (errExt) { /* ignore */ }
        const market = await getMarketContract(toolkit);
        const views  = await market.tzip16().metadataViews();
        const raw    = await views.get_offers_for_token().executeView(String(contract), Number(tokenId));
        const list   = [];
        const push   = (offeror, obj) => {
          list.push({
            offeror: offeror,
            priceMutez: Number(obj.price),
            amount: Number(obj.amount),
            nonce: Number(obj.nonce),
            accepted: obj.accepted,
          });
        };
        if (raw?.entries) {
          for (const [key, value] of raw.entries()) push(key, value);
        } else if (typeof raw === 'object' && raw !== null) {
          Object.entries(raw).forEach(([k, v]) => push(k, v));
        }
        // Filter offers by current wallet address and not yet accepted
        const filtered = list.filter((o) => !o.accepted && walletAddr && o.offeror.toLowerCase() === walletAddr.toLowerCase());
        if (!cancel) {
          setOffers(filtered);
          setPage(0);
        }
      } catch (err) {
        console.error('Failed to fetch offers:', err);
        if (!cancel) setOffers([]);
      }
    })();
    return () => { cancel = true; };
  }, [open, toolkit, contract, tokenId, walletAddr]);

  // Pagination logic
  const pages = Math.ceil(offers.length / perPage);
  const pageOffers = useMemo(() => {
    const start = page * perPage;
    return offers.slice(start, start + perPage);
  }, [offers, page]);

  // Cancel a single offer (withdraw)
  async function cancelSingle() {
    if (!toolkit) return;
    try {
      setOv({ open: true, label: 'Cancelling offer…' });
      const market = await getMarketContract(toolkit);
      const call = market.methodsObject.withdraw_offer({
        nft_contract: contract,
        token_id    : Number(tokenId),
      });
      const op = await toolkit.wallet.batch().withContractCall(call).send();
      await op.confirmation();
      setOv({ open: false, label: '' });
      snack('Offer cancelled ✔');
      // Remove all offers from list (withdraw cancels all offers by the buyer on this token)
      setOffers([]);
      // Close the modal via onClose
      onClose();

      // Broadcast a refresh event so parent lists can update
      try {
        window.dispatchEvent(new CustomEvent('zu:offersRefresh'));
      } catch (_) {}
    } catch (err) {
      console.error('Cancel offer failed:', err);
      setOv({ open: false, label: '' });
      snack(err.message || 'Transaction failed', 'error');
    }
  }

  // Cancel all offers (same as single, but keep semantics)
  async function cancelAll() {
    await cancelSingle();
  }

  // do not render when closed
  if (!open) return null;

  return (
    <ModalOverlay onClick={onClose}>
      <ModalBox onClick={(e) => e.stopPropagation()} data-modal="cancel-offer">
        <PixelHeading level={3}>Cancel Offer</PixelHeading>
        {offers.length === 0 ? (
          <p style={{ marginTop: '0.8rem' }}>You have no active offers to cancel.</p>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <th>Preview</th>
                  <th>Offeror</th>
                  <th>Amount</th>
                  <th>Price (ꜩ)</th>
                  <th>Nonce</th>
                </tr>
              </thead>
              <tbody>
                {pageOffers.map((offer) => (
                  <tr key={`${offer.offeror}:${offer.nonce}`}>
                    <td style={{ width: '40px' }}>
                      {/* TODO: preview thumbnail of the NFT; placeholder for now */}
                      ​
                    </td>
                    <td>{offer.offeror.substring(0, 6)}…{offer.offeror.substring(offer.offeror.length - 4)}</td>
                    <td>{offer.amount}</td>
                    <td>{(offer.priceMutez / 1_000_000).toLocaleString()}</td>
                    <td>{offer.nonce}</td>
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
              <PixelButton disabled={offers.length === 0} onClick={cancelSingle}>
                CANCEL OFFER
              </PixelButton>
              <PixelButton disabled={offers.length === 0} onClick={cancelAll}>
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

CancelOffer.propTypes = {
  open    : PropTypes.bool,
  contract: PropTypes.string,
  tokenId : PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onClose : PropTypes.func,
};

/* What changed & why: initial creation of CancelOffer component.
   This modal lists the buyer's own offers on the current token
   and allows them to withdraw the offer via withdraw_offer.  It
   uses withContractCall to dispatch the transaction and shows
   a progress overlay.  Cancelling any offer removes all offers
   made by the buyer on that token. */
/* EOF */