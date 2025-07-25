/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/BuyDialog.jsx
  Rev :    r5    2025‑07‑25 UTC
  Summary: pop‑out buy dialog for ZeroSum marketplace.  Uses
           getMarketContract to resolve the marketplace based on
           the current network, removes gas estimation and
           confirmation steps, dispatches the buy call directly
           with the listing price, and displays a modal overlay
           while waiting for confirmation.
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
 * confirmation.
 */
export default function BuyDialog({
  open,
  contract,
  tokenId,
  priceMutez,
  seller,
  nonce,
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
   * and displays errors via snackbar.
   */
  async function handleBuy() {
    if (!toolkit) {
      snack('Wallet unavailable', 'error');
      return;
    }
    try {
      setOv({ open: true, label: 'Waiting for confirmation …' });
      const market = await getMarketContract(toolkit);
      const args = {
        amount     : Number(amount) || 1,
        nft_contract: contract,
        nonce      : Number(nonce),
        seller     : seller,
        token_id   : Number(tokenId),
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
      if (/FA2_NOT_OPERATOR/i.test(msg)) {
        snack('Purchase failed: seller has not granted operator rights to the marketplace. They must re‑list the token.', 'error');
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
  open     : PropTypes.bool,
  contract : PropTypes.string,
  tokenId  : PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  priceMutez: PropTypes.number,
  seller   : PropTypes.string,
  nonce    : PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  amount   : PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onClose  : PropTypes.func,
};

/* What changed & why: converted the buy dialog into a pop‑out modal
   overlay with the same pixel‑art styling as the listing dialog;
   continues to use getMarketContract to resolve the marketplace;
   removes gas estimation and confirm steps; dispatches buy
   transactions directly with the listing price; shows a progress
   overlay while waiting for confirmation and surfaces errors via
   snackbar. */
/* EOF */