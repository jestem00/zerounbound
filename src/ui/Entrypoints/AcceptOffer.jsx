/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/AcceptOffer.jsx
  Rev :    r2    2025‑07‑25 UTC
  Summary: Pop‑out UI for accepting marketplace offers on a
           listed NFT.  Fetches active offers via the
           get_offers_for_token off‑chain view, displays them
           in a paginated table and allows the seller to accept
           a specific offer with a single click.  Uses
           withContractCall to dispatch the accept_offer
           transaction, showing a progress overlay.
─────────────────────────────────────────────────────────────*/

import React, { useEffect, useState, useMemo } from 'react';
import PropTypes                                from 'prop-types';
import styledPkg                                from 'styled-components';

import PixelHeading       from '../PixelHeading.jsx';
import PixelButton        from '../PixelButton.jsx';
import OperationOverlay   from '../OperationOverlay.jsx';
import { useWalletContext } from '../../contexts/WalletContext.js';
import { getMarketContract } from '../../core/marketplace.js';
import { Tzip16Module } from '@taquito/tzip16';
// note: Tzip16Module imported above; remove duplicate import

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

export default function AcceptOffer({ open = false, contract = '', tokenId = '', onClose = () => {} }) {
  const { toolkit, address: walletAddr } = useWalletContext() || {};
  const [offers, setOffers] = useState([]);
  const [ov, setOv]       = useState({ open: false, label: '' });
  const [page, setPage]   = useState(0);
  const perPage = 8;

  // Snackbar helper
  const snack = (msg, sev = 'info') => {
    window.dispatchEvent(new CustomEvent('zu:snackbar', { detail: { message: msg, severity: sev } }));
  };

  // Fetch active offers when the dialog opens
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!open || !toolkit || !contract || tokenId === '' || tokenId === undefined) return;
      try {
        // ensure Tzip16 extension
        try { toolkit.addExtension(new Tzip16Module()); } catch (_) {}
        const market = await getMarketContract(toolkit);
        const views  = await market.tzip16().metadataViews();
        // Fetch offers via off‑chain view
        const rawOffers = await views.get_offers_for_token().executeView(String(contract), Number(tokenId));
        const list = [];
        const pushOffer = (offeror, obj) => {
          list.push({
            offeror    : offeror,
            priceMutez : Number(obj.price),
            amount     : Number(obj.amount),
            nonce      : Number(obj.nonce), // listing nonce stored in offers bigmap
            accepted   : obj.accepted,
          });
        };
        if (rawOffers?.entries) {
          for (const [key, value] of rawOffers.entries()) pushOffer(key, value);
        } else if (typeof rawOffers === 'object' && rawOffers !== null) {
          Object.entries(rawOffers).forEach(([k, v]) => pushOffer(k, v));
        }
        // Validate each offer by checking listing details. Remove offers where listing amount is 0.
        const validated = [];
        for (const offer of list) {
          if (offer.accepted || offer.amount <= 0) continue;
          let valid = false;
          try {
            const det = await views.get_listing_details().executeView(Number(offer.nonce), String(contract), Number(tokenId));
            if (det && det.amount !== undefined && Number(det.amount) > 0) {
              valid = true;
            }
          } catch (_) {
            // ignore errors; treat as invalid
          }
          if (valid) {
            validated.push(offer);
          }
        }
        if (!cancel) {
          setOffers(validated);
          setPage(0);
        }
      } catch (err) {
        console.error('Failed to fetch offers:', err);
        if (!cancel) {
          setOffers([]);
        }
      }
    })();
    return () => { cancel = true; };
  }, [open, toolkit, contract, tokenId]);

  // Pagination logic
  const pages = Math.ceil(offers.length / perPage);
  const pageOffers = useMemo(() => {
    const start = page * perPage;
    return offers.slice(start, start + perPage);
  }, [offers, page]);

  // Accept a single offer
  async function acceptOffer(offer) {
    if (!toolkit) return;
    try {
      setOv({ open: true, label: 'Accepting offer…' });
      const market = await getMarketContract(toolkit);
      const call   = market.methodsObject.accept_offer({
        amount       : Number(offer.amount),
        listing_nonce: Number(offer.nonce),
        nft_contract : contract,
        offeror      : offer.offeror,
        token_id     : Number(tokenId),
      });
      // Dispatch accept_offer via a wallet batch.  This pattern aligns
      // with other marketplace actions and ensures proper parameter
      // wrapping for the Tezos RPC.
      const op = await toolkit.wallet.batch().withContractCall(call).send();
      await op.confirmation();
      setOv({ open: false, label: '' });
      snack('Offer accepted ✔');
      // Remove accepted offer from list
      setOffers((prev) => prev.filter((o) => o.nonce !== offer.nonce || o.offeror !== offer.offeror));
      // Close the modal by calling onClose from props
      onClose();

      // Notify other components (e.g., MyOffers page) to refresh offers
      try {
        window.dispatchEvent(new CustomEvent('zu:offersRefresh'));
      } catch (_) {}
    } catch (err) {
      console.error('Accept offer failed:', err);
      setOv({ open: false, label: '' });
      snack(err.message || 'Transaction failed', 'error');
    }
  }

  // do not render when closed
  if (!open) return null;

  return (
    <ModalOverlay onClick={onClose}>
      <ModalBox onClick={(e) => e.stopPropagation()} data-modal="accept-offer">
        <PixelHeading level={3}>Accept Offers</PixelHeading>
        {offers.length === 0 ? (
          <p style={{ marginTop: '0.8rem' }}>No active offers to accept.</p>
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
                  <th></th>
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
                    <td>
                      <PixelButton
                        size="xs"
                        onClick={() => acceptOffer(offer)}
                      >
                        ACCEPT
                      </PixelButton>
                    </td>
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

AcceptOffer.propTypes = {
  open    : PropTypes.bool,
  contract: PropTypes.string,
  tokenId : PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onClose : PropTypes.func,
};

/* What changed & why: initial creation of AcceptOffer component.
   This pop‑out overlay fetches active offers via the
   get_offers_for_token view and displays them in a table with
   pagination.  Sellers can accept an offer by clicking the
   corresponding button, which dispatches an accept_offer
   transaction via the marketplace using withContractCall.  A
   progress overlay shows transaction status and offers are
   removed from the list upon success. */
/* EOF */