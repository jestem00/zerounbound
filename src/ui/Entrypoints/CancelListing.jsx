/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/CancelListing.jsx
  Rev :    r1     2025‑07‑24 UTC
  Summary: UI component for cancelling an active marketplace
           listing on ZeroSum.  Prompts for the listing nonce
           and uses the new marketplace helpers to build and
           dispatch the cancel_listing transaction.
─────────────────────────────────────────────────────────────*/

import React, { useState }    from 'react';
import PropTypes              from 'prop-types';
import styledPkg              from 'styled-components';

import PixelHeading           from '../PixelHeading.jsx';
import PixelInput             from '../PixelInput.jsx';
import PixelButton            from '../PixelButton.jsx';
import OperationOverlay       from '../OperationOverlay.jsx';
import OperationConfirmDialog from '../OperationConfirmDialog.jsx';
import { useWalletContext }   from '../../contexts/WalletContext.js';
import { getMarketContract }  from '../../core/marketplace.js';
import { estimateChunked }    from '../../core/feeEstimator.js';
import { OpKind }             from '@taquito/taquito';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap   = styled.section`margin-top:1.4rem;`;

export default function CancelListing({
  open,
  contract,
  tokenId,
  onClose = () => {},
}) {
  const { toolkit } = useWalletContext() || {};
  const [nonce, setNonce]    = useState('');
  const [ov, setOv]          = useState({ open:false });
  const [confirm, setConfirm]= useState(false);
  const [est, setEst]        = useState(null);

  if (!open) return null;
  const disabled = !toolkit || nonce === '';

  const snack = (msg, sev='info') =>
    window.dispatchEvent(new CustomEvent('zu:snackbar',
      { detail:{ message:msg, severity:sev } }));

  async function buildParams() {
    const c = await getMarketContract(toolkit);
    return [{
      kind: OpKind.TRANSACTION,
      ...c.methodsObject.cancel_listing({
        listing_nonce: Number(nonce),
        nft_contract : contract,
        token_id     : Number(tokenId),
      }).toTransferParams(),
    }];
  }

  async function handleCancel() {
    try {
      const params = await buildParams();
      setEst(await estimateChunked(toolkit, params));
      setConfirm(true);
    } catch (e) { snack(e.message || 'Build error','error'); }
  }

  async function submitTx() {
    try {
      setOv({ open:true, label:'Cancelling listing …' });
      const op = await toolkit.wallet
        .batch(await buildParams())
        .send();
      await op.confirmation();
      setOv({ open:false });
      snack('Listing cancelled ✔');
      onClose();
    } catch (e) {
      setOv({ open:false });
      snack(e.message || 'Transaction failed','error');
    }
  }

  return (
    <Wrap>
      <PixelHeading as="h2">Cancel Listing</PixelHeading>
      <div style={{ marginTop:'0.6rem', marginBottom:'0.9rem' }}>
        <label htmlFor="nonce" style={{ display:'block', marginBottom:'0.4rem' }}>Listing Nonce</label>
        <PixelInput
          id="nonce"
          type="number"
          min="0"
          value={nonce}
          onChange={(e) => setNonce(e.target.value)}
        />
      </div>
      <PixelButton
        disabled={disabled}
        onClick={handleCancel}
      >
        CANCEL LISTING
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

CancelListing.propTypes = {
  open    : PropTypes.bool,
  contract: PropTypes.string,
  tokenId : PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onClose : PropTypes.func,
};

/* What changed & why: new component implementing the
   cancel_listing entrypoint of ZeroSum.  Prompts user for the
   listing nonce and dispatches the operation via wallet.batch(). */
/* EOF */