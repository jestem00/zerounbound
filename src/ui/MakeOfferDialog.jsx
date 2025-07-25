/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/MakeOfferDialog.jsx
  Rev :    r1    2025‑07‑25 UTC
  Summary: Pop‑out modal for making an offer on a token.  Allows
           buyers to specify an amount and price (ꜩ) to offer for
           a given NFT token.  Builds the marketplace call using
           make_offer, dispatches it in a single wallet batch
           operation (withContractCall for proper kinds), and
           displays a progress overlay.  Input values are
           validated before submission.  Closes on success.
─────────────────────────────────────────────────────────────*/

import React, { useState }      from 'react';
import PropTypes                from 'prop-types';
import styledPkg                from 'styled-components';

import PixelHeading             from './PixelHeading.jsx';
import PixelInput               from './PixelInput.jsx';
import PixelButton              from './PixelButton.jsx';
import OperationOverlay         from './OperationOverlay.jsx';
import { useWalletContext }     from '../contexts/WalletContext.js';
import { getMarketContract }    from '../core/marketplace.js';
import { Tzip16Module }         from '@taquito/tzip16';

// styled-components helper
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

// Modal overlay covering the entire viewport
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

// Inner box for the modal content
const ModalBox = styled.section`
  background: var(--zu-bg, #0a001e);
  border: 2px solid var(--zu-accent, #8f3ce1);
  padding: 1rem;
  width: min(90%, 480px);
  max-width: 480px;
  box-shadow: 0 0 0 4px var(--zu-dark, #1b023a);
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
`;

/**
 * Modal dialog to create an offer on an NFT token.  Buyers
 * specify how many editions they wish to purchase and the
 * price per edition in ꜩ.  The offer is submitted via the
 * marketplace's make_offer entrypoint.  Fees are computed by
 * the wallet; no off‑chain estimation or confirm step.  A
 * progress overlay is shown during submission.
 */
export default function MakeOfferDialog({ open = false, contract = '', tokenId = '', onClose = () => {} }) {
  const { toolkit } = useWalletContext() || {};
  const [price, setPrice]     = useState('');
  const [amount, setAmount]   = useState('1');
  const [ov, setOv]           = useState({ open: false, label: '' });

  // Do not render anything when closed
  if (!open) return null;

  // Parse inputs for validation
  const priceNum  = parseFloat(price);
  const amountNum = Number(amount);
  const disabled  = !toolkit || !price || !amount || !Number.isFinite(priceNum) || priceNum <= 0 || !Number.isFinite(amountNum) || amountNum <= 0;

  // Global snackbar helper
  const snack = (msg, sev = 'info') => {
    window.dispatchEvent(new CustomEvent('zu:snackbar', { detail: { message: msg, severity: sev } }));
  };

  /**
   * Submit the offer.  Validates input then dispatches a
   * make_offer call via the marketplace.  Uses wallet.batch
   * with withContractCall to ensure correct operation kinds.
   */
  async function handleOffer() {
    // Local validation
    const p = parseFloat(price);
    const q = parseInt(amount, 10);
    if (!Number.isFinite(p) || p <= 0) {
      snack('Enter a valid price', 'error');
      return;
    }
    if (!Number.isFinite(q) || q <= 0) {
      snack('Enter a valid amount', 'error');
      return;
    }
    if (!toolkit) return;
    try {
      setOv({ open: true, label: 'Submitting offer …' });
      const market = await getMarketContract(toolkit);
      // Ensure Tzip16 extension (optional; safe if repeated)
      try { toolkit.addExtension(new Tzip16Module()); } catch (err) { /* ignore */ }
      const priceMutez = Math.floor(p * 1_000_000);
      // Build the make_offer call.  The marketplace expects the buyer to
      // escrow the full offer value (price per edition × amount) on
      // submission.  We therefore send the total in the send() options.
      const call = market.methodsObject.make_offer({
        amount      : Number(q),
        nft_contract: contract,
        price       : priceMutez,
        token_id    : Number(tokenId),
      });
      const totalMutez = priceMutez * Number(q);
      // Send the call directly with the total amount of mutez.  Using
      // .send() instead of withContractCall() ensures the tez is
      // attached to the contract call.  The wallet will compute fees.
      const op = await call.send({ amount: totalMutez, mutez: true });
      await op.confirmation();
      setOv({ open: false, label: '' });
      snack('Offer submitted ✔');
      onClose();
    } catch (err) {
      console.error('Offer failed:', err);
      setOv({ open: false, label: '' });
      snack(err.message || 'Transaction failed', 'error');
    }
  }

  return (
    <ModalOverlay onClick={onClose}>
      <ModalBox onClick={(e) => e.stopPropagation()} data-modal="make-offer">
        <PixelHeading level={3}>Make Offer</PixelHeading>
        <div>
          <p style={{ fontSize: '0.75rem', marginBottom: '0.2rem', opacity: 0.9 }}>Amount</p>
          <PixelInput
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <p style={{ fontSize: '0.75rem', marginBottom: '0.2rem', opacity: 0.9 }}>Price (ꜩ)</p>
          <PixelInput
            type="number"
            min="0"
            step="0.000001"
            placeholder="0.0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <PixelButton disabled={disabled} onClick={handleOffer}>SUBMIT OFFER</PixelButton>
        {ov.open && (
          <OperationOverlay
            label={ov.label}
            onClose={() => setOv({ open: false, label: '' })}
          />
        )}
        <PixelButton onClick={onClose}>Close</PixelButton>
      </ModalBox>
    </ModalOverlay>
  );
}

MakeOfferDialog.propTypes = {
  open    : PropTypes.bool,
  contract: PropTypes.string,
  tokenId : PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onClose : PropTypes.func,
};

/* What changed & why: initial creation of MakeOfferDialog.  This
   modal replicates the 8‑bit style of other dialogs and
   provides simple inputs for amount and price.  It validates
   user input, resolves the marketplace contract via
   getMarketContract, builds a make_offer call and dispatches
   the transaction using withContractCall.  Shows a progress
   overlay during submission and closes on success. */
/* EOF */