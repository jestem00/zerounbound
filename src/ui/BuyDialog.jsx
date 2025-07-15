/*Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/BuyDialog.jsx
  Rev :    r2     2025‑09‑22
  Summary: drop unused import + path‑fixes lint‑clean */
import React, { useState }  from 'react';
import PropTypes            from 'prop-types';
import styledPkg            from 'styled-components';

import PixelHeading           from './PixelHeading.jsx';
import PixelInput             from './PixelInput.jsx';
import PixelButton            from './PixelButton.jsx';
import OperationOverlay       from './OperationOverlay.jsx';
import OperationConfirmDialog from './OperationConfirmDialog.jsx';
import { useWalletContext }   from '../contexts/WalletContext.js';
import { buildBuyParams }     from '../core/marketplace.js';
import { estimateChunked }    from '../core/feeEstimator.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap   = styled.section`margin-top:1.4rem;`;

export default function BuyDialog({
  open, contract, tokenId, market: _market, onClose = () => {},
}) {
  const { toolkit } = useWalletContext() || {};
  const [amount, setAmount]  = useState('1');
  const [price,  setPrice ]  = useState('');
  const [ov,     setOv]      = useState({ open:false });
  const [confirm,setConfirm] = useState(false);
  const [est,    setEst]     = useState(null);

  if (!open) return null;
  const disabled = !toolkit || !amount || !price;

  const snack = (msg, sev='info') =>
    window.dispatchEvent(new CustomEvent('zu:snackbar',
      { detail:{ message:msg, severity:sev } }));

  async function handleBuy() {
    try {
      const params = await buildBuyParams(toolkit,{
        nft: contract,
        tokenId:+tokenId,
        amount:+amount,
        priceMutez: +price * 1_000_000,
      });
      setEst(await estimateChunked(toolkit, params));
      setConfirm(true);
    } catch (e) { snack(e.message || 'Build error','error'); }
  }

  async function submitTx() {
    try {
      setOv({ open:true, label:'Waiting for confirmation …' });
      const op = await toolkit.wallet
        .batch(await buildBuyParams(toolkit,{
          nft: contract,
          tokenId:+tokenId,
          amount:+amount,
          priceMutez: +price * 1_000_000,
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
      <PixelHeading level={4}>Buy Token</PixelHeading>

      <label>
        Amount
        <PixelInput
          type="number" min="1" value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>

      <label>
        Price ꜩ
        <PixelInput
          type="number" min="0" step="0.000001" value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </label>

      <PixelButton disabled={disabled} onClick={handleBuy}>BUY</PixelButton>

      {ov.open && (
        <OperationOverlay {...ov} onCancel={() => setOv({ open:false })} />
      )}

      {confirm && (
        <OperationConfirmDialog
          open
          estimate={est}
          onOk={() => { setConfirm(false); submitTx(); }}
          onCancel={() => setConfirm(false)}
        />
      )}

      <PixelButton size="sm" style={{ marginTop:'.6rem' }} onClick={onClose}>
        Close
      </PixelButton>
    </Wrap>
  );
}

BuyDialog.propTypes = {
  open    : PropTypes.bool,
  contract: PropTypes.string,
  tokenId : PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  market  : PropTypes.string,
  onClose : PropTypes.func,
};
/* EOF */
