/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/BuyDialog.jsx
  Rev :    r3     2025‑07‑24 UTC
  Summary: updated for ZeroSum marketplace: remove user
           inputs for amount/price, accept a listing prop with
           seller/nonce/priceMutez and utilise new
           marketplace helpers to build buy params.  Displays
           the price in XTZ and provides simplified confirm
           flow.
─────────────────────────────────────────────────────────────*/

import React, { useState }    from 'react';
import PropTypes              from 'prop-types';
import styledPkg              from 'styled-components';

import PixelHeading           from './PixelHeading.jsx';
import PixelButton            from './PixelButton.jsx';
import OperationOverlay       from './OperationOverlay.jsx';
import OperationConfirmDialog from './OperationConfirmDialog.jsx';
import { useWalletContext }   from '../contexts/WalletContext.js';
import { buildBuyParams }     from '../core/marketplace.js';
import { estimateChunked }    from '../core/feeEstimator.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap   = styled.section`margin-top:1.4rem;`;

export default function BuyDialog({
  open,
  contract,
  tokenId,
  listing,
  onClose = () => {},
}) {
  const { toolkit } = useWalletContext() || {};
  const [ov, setOv]       = useState({ open:false });
  const [confirm, setConfirm] = useState(false);
  const [est, setEst]     = useState(null);

  if (!open) return null;
  if (!listing) return null;

  const priceXTZ = (listing.priceMutez / 1_000_000).toLocaleString();
  const disabled = !toolkit;

  const snack = (msg, sev='info') =>
    window.dispatchEvent(new CustomEvent('zu:snackbar',
      { detail:{ message:msg, severity:sev } }));

  async function handleBuy() {
    try {
      const params = await buildBuyParams(toolkit, {
        nftContract: contract,
        tokenId: +tokenId,
        priceMutez: listing.priceMutez,
        seller: listing.seller,
        nonce: listing.nonce,
      });
      setEst(await estimateChunked(toolkit, params));
      setConfirm(true);
    } catch (e) { snack(e.message || 'Build error','error'); }
  }

  async function submitTx() {
    try {
      setOv({ open:true, label:'Waiting for confirmation …' });
      const op = await toolkit.wallet
        .batch(await buildBuyParams(toolkit, {
          nftContract: contract,
          tokenId: +tokenId,
          priceMutez: listing.priceMutez,
          seller: listing.seller,
          nonce: listing.nonce,
        }))
        .send();
      await op.confirmation();
      setOv({ open:false });
      snack('Token purchased ✔');
      onClose();
    } catch (e) {
      setOv({ open:false });
      snack(e.message || 'Transaction failed','error');
    }
  }

  return (
    <Wrap>
      <PixelHeading as="h2">Buy Token</PixelHeading>
      <p style={{ marginTop:'0.6rem', marginBottom:'1.2rem' }}>
        You are about to buy <strong>1</strong> edition for{' '}
        <strong>{priceXTZ} ꜩ</strong>.
      </p>
      <PixelButton
        disabled={disabled}
        onClick={handleBuy}
      >
        BUY
      </PixelButton>
      {ov.open && (
        <OperationOverlay
          open
          label={ov.label}
          onClose={() => setOv({ open:false })}
        />
      )}
      {confirm && (
        <OperationConfirmDialog
          open
          onConfirm={() => { setConfirm(false); submitTx(); }}
          onCancel={() => setConfirm(false)}
        />
      )}
      <PixelButton onClick={onClose}>Close</PixelButton>
    </Wrap>
  );
}

BuyDialog.propTypes = {
  open    : PropTypes.bool,
  contract: PropTypes.string,
  tokenId : PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  listing : PropTypes.shape({
    priceMutez: PropTypes.number,
    amount    : PropTypes.number,
    seller    : PropTypes.string,
    nonce     : PropTypes.number,
    active    : PropTypes.bool,
  }),
  onClose : PropTypes.func,
};

/* What changed & why: rewrote component for live ZeroSum marketplace.
   Removed price/amount inputs; accepts listing prop with priceMutez,
   seller and nonce; uses new buildBuyParams helper; displays
   price in XTZ and simplifies confirm flow. */
/* EOF */