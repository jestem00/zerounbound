/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/BuyDialog.jsx
  Rev :    r8    2025‑08‑04
  Summary: Reverted to single‑edition purchase.  Multi‑buy is
           not supported by the marketplace contract.  This
           dialog always purchases exactly one edition at the
           listing price and no longer exposes a quantity
           selector.  Enhanced error handling from earlier
           revisions is preserved.
─────────────────────────────────────────────────────────────*/

import React, { useState }       from 'react';
import PropTypes                 from 'prop-types';
import styledPkg                 from 'styled-components';

import PixelHeading             from './PixelHeading.jsx';
import PixelButton              from './PixelButton.jsx';
import OperationOverlay         from './OperationOverlay.jsx';
import { useWalletContext }     from '../contexts/WalletContext.js';
import { getMarketContract }    from '../core/marketplace.js';

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
      const market = await getMarketContract(toolkit);
      // Always purchase exactly one edition.  Multi‑buy is not supported.
      const args = {
        amount      : Number(amount) || 1,
        nft_contract: contract,
        nonce       : Number(nonce),
        seller      : seller,
        token_id    : Number(tokenId),
      };
      const op = await market.methodsObject.buy(args).send({ amount: priceMutez, mutez: true });
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
        <Wrap>
          <PixelHeading as="h2">Buy Token</PixelHeading>
          <p style={{ marginTop: '0.6rem', marginBottom: '1.2rem' }}>
            You are about to buy <strong>1</strong> edition for{' '}
            <strong>{priceXTZ} ꜩ</strong>.
          </p>
          <PixelButton disabled={disabled} onClick={handleBuy}>
            BUY
          </PixelButton>
          {ov.open && (
            <OperationOverlay
              label={ov.label}
              onClose={() => setOv({ open: false, label: '' })}
            />
          )}
          <PixelButton onClick={onClose}>Close</PixelButton>
        </Wrap>
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

/* What changed & why: r8
   • Reverted to a single‑edition purchase after experimenting with
     multi‑buy.  The marketplace contract does not support buying
     multiple editions in one transaction.  This dialog now always
     purchases one edition, removes the quantity selector and total
     price calculation, and retains enhanced error handling for
     operator/ownership errors. */
