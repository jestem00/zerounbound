/*
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/AcceptOffer.jsx
  Rev :    r5   2025-08-31
  Summary: Accept offers dialog. Fetches active offers via metadata view,
           shows them in a paginated table, and builds accept params via
           marketplace helper. Prices render with full precision (ꜩ).
*/

import React, { useEffect, useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import styledPkg from 'styled-components';

import PixelHeading from '../PixelHeading.jsx';
import PixelButton from '../PixelButton.jsx';
import OperationOverlay from '../OperationOverlay.jsx';
import { useWalletContext } from '../../contexts/WalletContext.js';
import { getMarketContract, buildAcceptOfferParams } from '../../core/marketplace.js';
import { Tzip16Module } from '@taquito/tzip16';
import { formatMutez } from '../../utils/formatTez.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const ModalOverlay = styled.div`
  position: fixed; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.65); z-index: 9999;
`;
const ModalBox = styled.section`
  background: var(--zu-bg, #0a001e);
  border: 2px solid var(--zu-accent, #8f3ce1);
  padding: 1rem; width: min(90%, 600px); max-width: 600px;
  max-height: 90vh; overflow-y: auto; box-shadow: 0 0 0 4px var(--zu-dark, #1b023a);
`;
const Table = styled.table`
  width: 100%; border-collapse: collapse; margin-top: 0.6rem; font-size: 0.9rem;
  th, td { padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--zu-accent, #8f3ce1); text-align: left; }
  th { font-weight: bold; }
  tr:hover { background: rgba(255,255,255,.04); }
`;
const Pagination = styled.div` display:flex; justify-content:center; margin-top:0.8rem; gap:0.4rem; `;

export default function AcceptOffer({ open = false, contract = '', tokenId = '', onClose = () => {} }) {
  const { toolkit } = useWalletContext() || {};
  const [offers, setOffers] = useState([]);
  const [ov, setOv] = useState({ open: false, label: '' });
  const [page, setPage] = useState(0);
  const perPage = 8;

  const snack = (msg, sev = 'info') => {
    window.dispatchEvent(new CustomEvent('zu:snackbar', { detail: { message: msg, severity: sev } }));
  };

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!open || !toolkit || !contract || tokenId === '' || tokenId === undefined) return;
      try {
        try { toolkit.addExtension(new Tzip16Module()); } catch {}
        const market = await getMarketContract(toolkit);
        const views  = await market.tzip16().metadataViews();
        const raw   = await views.get_offers_for_token().executeView(String(contract), Number(tokenId));
        const list  = [];
        const pushOffer = (offeror, obj) => {
          list.push({
            offeror   : offeror,
            priceMutez: Number(obj.price),
            amount    : Number(obj.amount),
            nonce     : Number(obj.nonce),
            accepted  : obj.accepted,
          });
        };
        if (raw?.entries) {
          for (const [key, value] of raw.entries()) pushOffer(key, value);
        } else if (raw && typeof raw === 'object') {
          Object.entries(raw).forEach(([k, v]) => pushOffer(k, v));
        }
        const validated = [];
        for (const offer of list) {
          if (offer.accepted || offer.amount <= 0) continue;
          try {
            const det = await views.get_listing_details().executeView(Number(offer.nonce), String(contract), Number(tokenId));
            if (det && det.amount !== undefined && Number(det.amount) > 0) validated.push(offer);
          } catch {}
        }
        if (!cancel) { setOffers(validated); setPage(0); }
      } catch (err) {
        console.error('Failed to fetch offers:', err);
        if (!cancel) setOffers([]);
      }
    })();
    return () => { cancel = true; };
  }, [open, toolkit, contract, tokenId]);

  const pages = Math.ceil(offers.length / perPage);
  const pageOffers = useMemo(() => {
    const start = page * perPage;
    return offers.slice(start, start + perPage);
  }, [offers, page]);

  async function acceptOffer(offer) {
    if (!toolkit) return;
    try {
      setOv({ open: true, label: 'Accepting offer…' });
      const params = await buildAcceptOfferParams(toolkit, {
        nftContract : contract,
        tokenId     : Number(tokenId),
        amount      : Number(offer.amount),
        listingNonce: Number(offer.nonce),
        offeror     : offer.offeror,
      });
      const op = await toolkit.wallet.batch(params).send();
      await op.confirmation();
      setOv({ open: false, label: '' });
      snack('Offer accepted ✅');
      setOffers((prev) => prev.filter((o) => o.nonce !== offer.nonce || o.offeror !== offer.offeror));
      onClose();
      try { window.dispatchEvent(new CustomEvent('zu:offersRefresh')); } catch {}
    } catch (err) {
      console.error('Accept offer failed:', err);
      setOv({ open: false, label: '' });
      snack(err.message || 'Transaction failed', 'error');
    }
  }

  if (!open) return null;

  return (
    <ModalOverlay onClick={onClose}>
      <ModalBox onClick={(e) => e.stopPropagation()} data-modal="accept-offer">
        <PixelHeading>Accept Offers</PixelHeading>
        {offers.length === 0 ? (
          <p>No active offers to accept.</p>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <th>Offeror</th>
                  <th>Amount</th>
                  <th>Price (ꜩ)</th>
                  <th>Nonce</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pageOffers.map((offer) => (
                  <tr key={`${offer.offeror}-${offer.nonce}`}>
                    <td>{offer.offeror.substring(0, 6)}…{offer.offeror.substring(offer.offeror.length - 4)}</td>
                    <td>{offer.amount}</td>
                    <td>{formatMutez(offer.priceMutez)}</td>
                    <td>{offer.nonce}</td>
                    <td>
                      <PixelButton onClick={() => acceptOffer(offer)}>ACCEPT</PixelButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {pages > 1 && (
              <Pagination>
                {Array.from({ length: pages }, (_, idx) => (
                  <PixelButton key={idx} onClick={() => setPage(idx)} disabled={idx === page}>
                    {idx + 1}
                  </PixelButton>
                ))}
              </Pagination>
            )}
          </>
        )}
        {ov.open && (
          <OperationOverlay open={ov.open} label={ov.label} onClose={() => setOv({ open: false, label: '' })} />
        )}
        <PixelButton onClick={onClose}>Close</PixelButton>
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
