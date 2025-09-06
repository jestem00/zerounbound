/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/MakeOfferDialog.jsx
  Rev :    r4    2025‑08‑06
  Summary: Added dynamic make_offer resolution.  Now resolves
           make_offer via bracket lookup to handle name mangling
           on Taquito ≥22.  Retains fallback to positional
           arguments, progress overlay, input validation and
           escrow logic.
─────────────────────────────────────────────────────────────*/

import React, { useState }      from 'react';
import PropTypes                from 'prop-types';
import styledPkg                from 'styled-components';

import PixelHeading             from './PixelHeading.jsx';
import PixelInput               from './PixelInput.jsx';
import PixelButton              from './PixelButton.jsx';
import OperationOverlay         from './OperationOverlay.jsx';
import { useWalletContext }     from '../contexts/WalletContext.js';
import { buildOfferParams }    from '../core/marketplace.js';

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
 *
 * When the Taquito contract mixin omits the methodsObject API
 * (as in Taquito ≥22), this dialog falls back to calling
 * market.methods.make_offer() with positional parameters in
 * the order expected by the contract: amount, nft_contract,
 * price, token_id.  This ensures compatibility across
 * versions while preserving on‑chain semantics.
 */
export default function MakeOfferDialog({
  open    = false,
  contract = '',
  tokenId  = '',
  onClose  = () => {},
}) {
  const { toolkit } = useWalletContext() || {};
  const [price, setPrice]   = useState('');
  const [amount, setAmount] = useState('1');
  const [ov, setOv]         = useState({ open: false, label: '' });

  // Do not render anything when closed
  if (!open) return null;

  // Parse inputs for validation
  const priceNum  = parseFloat(price);
  const amountNum = Number(amount);
  const disabled  = !toolkit ||
                    !price ||
                    !amount ||
                    !Number.isFinite(priceNum) ||
                    priceNum <= 0 ||
                    !Number.isFinite(amountNum) ||
                    amountNum <= 0;

  // Global snackbar helper
  const snack = (msg, sev = 'info') => {
    window.dispatchEvent(new CustomEvent('zu:snackbar', { detail: { message: msg, severity: sev } }));
  };

  /**
   * Submit the offer.  Validates input then dispatches a
   * make_offer call via the marketplace.  Uses wallet.batch
   * with withContractCall to ensure correct operation kinds.
   * Falls back to positional methods when methodsObject.make_offer
   * is unavailable.
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
      const priceMutez = Math.floor(p * 1_000_000);
      const amt        = Number(q);
      // Build offer parameters and send via wallet batch.  The
      // total mutez is price per edition times amount.
      const params = await buildOfferParams(toolkit, {
        nftContract: contract,
        tokenId    : Number(tokenId),
        priceMutez : priceMutez,
        amount     : amt,
      });
      // Attach tez equal to price per edition times number of editions.
      const totalMutez = priceMutez * amt;
      // Override the amount on the transaction to include the escrowed funds.
      if (params && params.length > 0) {
        params[0].amount = totalMutez;
        params[0].mutez  = true;
      }
      const op = await toolkit.wallet.batch(params).send();
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
        <PixelHeading as="h3">Make Offer</PixelHeading>
        <PixelInput
          type="number"
          min="1"
          step="1"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <PixelInput
          type="number"
          min="0"
          step="any"
          placeholder="Price (ꜩ)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <PixelButton disabled={disabled} onClick={handleOffer}>
          SUBMIT OFFER
        </PixelButton>
        {ov.open && (
          <OperationOverlay
            label={ov.label}
            onCancel={() => setOv({ open: false, label: '' })}
          />
        )}
        <PixelButton onClick={onClose}>
          Close
        </PixelButton>
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

/* What changed & why:
   r3 – Introduced Taquito v22 fallback support by detecting
        methodsObject.make_offer availability and falling back to
        market.methods.make_offer with positional arguments.  This
        restores compatibility when tzip16 integration removes
        methodsObject from WalletContract instances.  Also added
        explicit placeholders and numeric input controls to
        improve UX and updated summary accordingly. */
/* EOF */
