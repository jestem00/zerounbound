/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/AcceptOffer.jsx
  Rev :    r1     2025‑07‑24 UTC
  Summary: UI component for accepting an offer on a marketplace
           listing via the ZeroSum contract.  Allows the user
           to specify the listing nonce, offeror address and
           amount (editions) and dispatches the accept_offer
           operation through wallet.batch().
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
import { buildAcceptOfferParams } from '../../core/marketplace.js';
import { estimateChunked }    from '../../core/feeEstimator.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap   = styled.section`margin-top:1.4rem;`;

/**
 * AcceptOffer component
 *
 * Props:
 *   open     — controls visibility
 *   contract — FA2 contract address for the token
 *   tokenId  — the token id
 *   onClose  — callback invoked when closing the component
 */
export default function AcceptOffer({
  open,
  contract,
  tokenId,
  onClose = () => {},
}) {
  const { toolkit }          = useWalletContext() || {};
  const [nonce, setNonce]    = useState('');
  const [offeror, setOfferor]= useState('');
  const [amount, setAmount]  = useState('1');
  const [ov, setOv]          = useState({ open:false });
  const [confirm, setConfirm]= useState(false);
  const [est, setEst]        = useState(null);

  if (!open) return null;

  const disabled = !toolkit || nonce === '' || offeror === '' || Number(amount) <= 0;

  const snack = (msg, sev='info') =>
    window.dispatchEvent(new CustomEvent('zu:snackbar',
      { detail:{ message:msg, severity:sev } }));

  async function buildParams() {
    return await buildAcceptOfferParams(toolkit, {
      nftContract : contract,
      tokenId     : Number(tokenId),
      listingNonce: Number(nonce),
      offeror     : offeror,
      amount      : Number(amount),
    });
  }

  async function handleAccept() {
    try {
      const params = await buildParams();
      setEst(await estimateChunked(toolkit, params));
      setConfirm(true);
    } catch (e) { snack(e.message || 'Build error','error'); }
  }

  async function submitTx() {
    try {
      setOv({ open:true, label:'Accepting offer …' });
      const op = await toolkit.wallet.batch(await buildParams()).send();
      await op.confirmation();
      setOv({ open:false });
      snack('Offer accepted ✔');
      onClose();
    } catch (e) {
      setOv({ open:false });
      snack(e.message || 'Transaction failed','error');
    }
  }

  return (
    <Wrap>
      <PixelHeading as="h2">Accept Offer</PixelHeading>
      <div style={{ marginTop:'0.6rem', marginBottom:'0.9rem' }}>
        <label htmlFor="nonce" style={{ display:'block', marginBottom:'0.4rem' }}>
          Listing Nonce
        </label>
        <PixelInput
          id="nonce"
          type="number"
          min="0"
          value={nonce}
          onChange={(e) => setNonce(e.target.value)}
        />
      </div>
      <div style={{ marginBottom:'0.9rem' }}>
        <label htmlFor="offeror" style={{ display:'block', marginBottom:'0.4rem' }}>
          Offeror Address
        </label>
        <PixelInput
          id="offeror"
          type="text"
          value={offeror}
          onChange={(e) => setOfferor(e.target.value)}
        />
      </div>
      <div style={{ marginBottom:'0.9rem' }}>
        <label htmlFor="amount" style={{ display:'block', marginBottom:'0.4rem' }}>
          Amount
        </label>
        <PixelInput
          id="amount"
          type="number"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <PixelButton
        disabled={disabled}
        onClick={handleAccept}
      >
        ACCEPT OFFER
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

AcceptOffer.propTypes = {
  open    : PropTypes.bool,
  contract: PropTypes.string,
  tokenId : PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onClose : PropTypes.func,
};

/* What changed & why: new component implementing the accept_offer entrypoint
   of ZeroSum.  Allows the collector to accept an existing offer by
   entering the listing nonce, the offeror address and the desired
   amount, then dispatches the operation via wallet.batch(). */
/* EOF */