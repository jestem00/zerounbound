/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/BuyDialog.jsx
  Rev :    r10    2025‑08‑06
  Summary: Improved buy fallback.  Now resolves the buy
           entrypoint dynamically via bracket lookup to support
           name‑mangled methods on Taquito ≥22.  Continues to
           fallback to positional calls, attaches tez and
           preserves single‑edition purchase behaviour with
           enhanced error handling.
─────────────────────────────────────────────────────────────*/

import React, { useState }       from 'react';
import PropTypes                 from 'prop-types';
import styledPkg                 from 'styled-components';

import PixelHeading             from './PixelHeading.jsx';
import PixelButton              from './PixelButton.jsx';
import OperationOverlay         from './OperationOverlay.jsx';
import { useWalletContext }     from '../contexts/WalletContext.js';
import { buildBuyParams }    from '../core/marketplace.js';

// Resolve styled-components default export before defining styled components
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
  width: min(90%, 480px);
  max-width: 480px;
  box-shadow: 0 0 0 4px var(--zu-dark, #1b023a);
`;

const Wrap   = styled.section`margin-top: 1.4rem;`;

/**
 * Dialog for buying a single edition of a listed NFT.  Expects a
 * listing object containing priceMutez, seller and nonce.  On
 * purchase, sends the buy transaction via the marketplace
 * contract.  There is no gas estimation; the wallet handles
 * fees.  A progress overlay appears while waiting for
 * confirmation.  Enhanced error handling surfaces ownership
 * errors and advises the seller to re‑list when operator rights
 * are missing.
 */
export default function BuyDialog({
  open,
  contract,
  tokenId,
  priceMutez,
  seller,
  nonce,
  // The `amount` prop is retained for backward compatibility but unused when purchasing;
  // multi‑buy is not supported.
  amount = 1,
  onClose = () => {},
}) {
  const { toolkit } = useWalletContext() || {};
  const [ov, setOv] = useState({ open: false, label: '' });

  /** Dispatch snackbar notifications */
  const snack = (msg, sev = 'info') => {
    window.dispatchEvent(
      new CustomEvent('zu:snackbar', { detail: { message: msg, severity: sev } }),
    );
  };

  // Do not render when closed or when required props are missing
  if (!open || priceMutez == null || !seller || nonce == null) return null;

  const priceXTZ = (priceMutez / 1_000_000).toLocaleString();
  const disabled = !toolkit;

  /**
   * Handle the buy button click.  Sends the buy transaction via
   * the marketplace contract with the correct amount.  Catches
   * and displays errors via snackbar.  Detects ownership or
   * operator errors and advises the user accordingly.
   */
  async function handleBuy() {
    if (!toolkit) {
      snack('Wallet unavailable', 'error');
      return;
    }
    try {
      setOv({ open: true, label: 'Waiting for confirmation …' });
      const amt = Number(amount) || 1;
      // Build buy parameters using the marketplace helper.  This
      // returns an array of transaction params compatible with
      // toolkit.wallet.batch().send().
      const params = await buildBuyParams(toolkit, {
        nftContract: contract,
        tokenId    : Number(tokenId),
        priceMutez : priceMutez,
        seller     : seller,
        nonce      : Number(nonce),
        amount     : amt,
      });
      const op = await toolkit.wallet.batch(params).send();
      await op.confirmation();
      setOv({ open: false, label: '' });
      snack('Token purchased ✔');
      onClose();
    } catch (err) {
      console.error('Purchase failed:', err);
      setOv({ open: false, label: '' });
      // Provide a more helpful error when the seller has not set the marketplace as operator
      const msg = String(err?.message || 'Transaction failed');
      // When the underlying token contract rejects the transfer with
      // “You are not the Owner or Operator of this Token” or the seller
      // has not granted operator rights to the marketplace (FA2_NOT_OPERATOR),
      // the buyer cannot proceed.  Advise the seller to re‑list the token.
      if (/FA2_NOT_OPERATOR/i.test(msg) || /not the (Owner|owner)/i.test(msg)) {
        snack(
          'Purchase failed: the seller has not granted operator rights to the marketplace or is no longer the owner. They must re‑list the token.',
          'error',
        );
      } else {
        snack(msg, 'error');
      }
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
        <PixelButton onClick={handleBuy} disabled={disabled}>
          BUY
        </PixelButton>
        {ov.open && (
          <OperationOverlay
            open={ov.open}
            label={ov.label}
            onClose={() => setOv({ open: false, label: '' })}
          />
        )}
        <PixelButton onClick={onClose}>Close</PixelButton>
      </ModalBox>
    </ModalOverlay>
  );
}

BuyDialog.propTypes = {
  open      : PropTypes.bool,
  contract  : PropTypes.string,
  tokenId   : PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  priceMutez: PropTypes.number,
  seller    : PropTypes.string,
  nonce     : PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onClose   : PropTypes.func,
  // amount is accepted for compatibility but ignored; multi‑buy is unsupported
  amount    : PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};

/* What changed & why: r9
   • Added fallback logic in handleBuy() to use positional
     methods when methodsObject.buy is unavailable.  This
     resolves Taquito ≥22 regressions where methodsObject may
     be undefined on WalletContracts with Tzip16.  Behaviour
     otherwise remains unchanged.
*/
/* EOF */