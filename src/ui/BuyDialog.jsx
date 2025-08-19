/* Developed by @jams2blues
   File: zerounbound/src/ui/BuyDialog.jsx
   Rev:  r12   2025‑10‑24
   Summary: Unified messaging + strict preflight + core buy builder
            (v1–v4e). Keeps prop aliases and focus flow intact. */

import React, { useEffect, useRef, useState } from 'react';
import PropTypes                 from 'prop-types';
import styledPkg                 from 'styled-components';

import PixelHeading             from './PixelHeading.jsx';
import PixelButton              from './PixelButton.jsx';
import OperationOverlay         from './OperationOverlay.jsx';
import { useWalletContext }     from '../contexts/WalletContext.js';

import { buildBuyParams, preflightBuy } from '../core/marketplace.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── Modal ────────*/
const ModalOverlay = styled.div`
  position: fixed; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.65); z-index: 9999;
`;
const ModalBox = styled.section`
  background: var(--zu-bg, #0a001e);
  border: 2px solid var(--zu-accent, #8f3ce1);
  padding: 1rem; width: min(90%, 480px); max-width: 480px;
  box-shadow: 0 0 0 4px var(--zu-dark, #1b023a);
`;
const Wrap = styled.section` margin-top: 1.0rem; `;

export default function BuyDialog(props) {
  const {
    open,
    isOpen,                     // alias
    contract,
    contractAddress,            // alias
    tokenId,
    priceMutez,
    seller,
    nonce,
    listingNonce,               // alias
    amount = 1,
    onClose = () => {},
  } = props;

  const OPEN     = (open ?? isOpen) === true;
  const CONTRACT = contract || contractAddress;
  const NONCE    = (nonce ?? listingNonce);

  const { toolkit } = useWalletContext() || {};
  const [ov, setOv] = useState({ open: false, label: '' });

  const closeBtnRef = useRef(null);
  useEffect(() => { if (OPEN) closeBtnRef.current?.focus?.(); }, [OPEN]);

  const snack = (msg, sev = 'info') => {
    window.dispatchEvent(new CustomEvent('zu:snackbar', { detail: { message: msg, severity: sev } }));
  };

  if (!OPEN || priceMutez == null || !seller || NONCE == null) return null;

  const priceXTZ = (priceMutez / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 6, maximumFractionDigits: 6,
  });

  async function handleBuy() {
    if (!toolkit) { snack('Wallet unavailable', 'error'); return; }

    try {
      // Stale listing preflight (TzKT)
      await preflightBuy(toolkit, {
        nftContract: CONTRACT,
        tokenId    : Number(tokenId),
        seller,
        amount     : Number(amount) || 1,
      });

      setOv({ open: true, label: 'Waiting for confirmation …' });

      const params = await buildBuyParams(toolkit, {
        nftContract: CONTRACT,
        tokenId    : Number(tokenId),
        priceMutez : Number(priceMutez),
        seller,
        nonce      : Number(NONCE),
        amount     : Number(amount) || 1,
      });

      const op = await toolkit.wallet.batch(params).send();
      await op.confirmation();

      setOv({ open: false, label: '' });
      snack('Token purchased ✔');
      onClose();
    } catch (err) {
      console.error('Purchase failed:', err);
      setOv({ open: false, label: '' });

      // Prefer tagged messages; fall back to plain text
      if (err?.code === 'STALE_LISTING_NO_BALANCE') {
        snack('Purchase failed: listing appears stale (seller balance insufficient). Ask seller to re‑list.', 'error');
        return;
      }
      if (err?.code === 'UNSUPPORTED_MARKET_BUY') {
        snack('Unsupported marketplace buy/collect entrypoint for this version.', 'error');
        return;
      }
      const msg = String(err?.message || 'Transaction failed');
      if (/FA2_NOT_OPERATOR/i.test(msg) || /not the (Owner|owner)/i.test(msg)) {
        snack('Seller has not granted operator rights or is no longer the owner. They must re‑list.', 'error');
        return;
      }
      snack(msg, 'error');
    }
  }

  return (
    <ModalOverlay onClick={onClose}>
      <ModalBox onClick={(e) => e.stopPropagation()} data-modal="buy-token">
        <PixelHeading>Buy Token</PixelHeading>
        <Wrap>
          <p>
            You are about to buy 1 edition for{' '}
            <strong>{priceXTZ} ꜩ</strong>.
          </p>
        </Wrap>
        <PixelButton onClick={handleBuy}>BUY</PixelButton>
        {ov.open && (
          <OperationOverlay
            open={ov.open}
            label={ov.label}
            onClose={() => setOv({ open: false, label: '' })}
          />
        )}
        <PixelButton ref={closeBtnRef} onClick={onClose} data-sec>
          Close
        </PixelButton>
      </ModalBox>
    </ModalOverlay>
  );
}

BuyDialog.propTypes = {
  open      : PropTypes.bool,
  isOpen    : PropTypes.bool, // alias
  contract  : PropTypes.string,
  contractAddress: PropTypes.string, // alias
  tokenId   : PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  priceMutez: PropTypes.number,
  seller    : PropTypes.string,
  nonce     : PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  listingNonce: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onClose   : PropTypes.func,
  amount    : PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};
/* What changed & why: unified error for unsupported entrypoints; kept stale
   preflight + aliases; still defers param building to core (v1–v4e). */
// EOF
