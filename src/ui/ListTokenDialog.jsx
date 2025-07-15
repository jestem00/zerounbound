/*Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/ListTokenDialog.jsx
  Rev :    r2     2025‑09‑22
  Summary: fix OperationOverlay spread + lint‑clean */
import React, { useState }  from 'react';
import PropTypes            from 'prop-types';
import styledPkg            from 'styled-components';

import PixelHeading           from './PixelHeading.jsx';
import PixelInput             from './PixelInput.jsx';
import PixelButton            from './PixelButton.jsx';
import OperationOverlay       from './OperationOverlay.jsx';
import OperationConfirmDialog from './OperationConfirmDialog.jsx';
import { useWalletContext }   from '../contexts/WalletContext.js';
import { buildListParams }    from '../core/marketplace.js';
import { estimateChunked }    from '../core/feeEstimator.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap   = styled.section`margin-top:1.4rem;`;

export default function ListTokenDialog({
  open, contract, tokenId, market: _market, onClose = () => {},
}) {
  const { toolkit }          = useWalletContext() || {};
  const [price, setPrice]    = useState('');
  const [ov,    setOv]       = useState({ open:false });
  const [confirm,setConfirm] = useState(false);
  const [est,   setEst]      = useState(null);

  if (!open) return null;
  const disabled = !toolkit || !price;

  const snack = (m,s='info') =>
    window.dispatchEvent(new CustomEvent('zu:snackbar',
      { detail:{ message:m, severity:s } }));

  async function handleList() {
    try {
      const params = await buildListParams(toolkit,{
        nft: contract,
        tokenId:+tokenId,
        amount:1,
        priceMutez: +price * 1_000_000,
      });
      setEst(await estimateChunked(toolkit, params));
      setConfirm(true);
    } catch (e) { snack(e.message,'error'); }
  }

  async function submitTx() {
    try {
      setOv({ open:true, label:'Listing token …' });
      const op = await toolkit.wallet
        .batch(await buildListParams(toolkit,{
          nft: contract,
          tokenId:+tokenId,
          amount:1,
          priceMutez: +price * 1_000_000,
        }))
        .send();
      await op.confirmation();
      setOv({ open:false });
      snack('Listing created ✔');
      onClose();
    } catch (e) {
      setOv({ open:false });
      snack(e.message,'error');
    }
  }

  return (
    <Wrap>
      <PixelHeading level={4}>List Token</PixelHeading>

      <label>
        Price ꜩ
        <PixelInput
          type="number" min="0" step="0.000001" value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </label>

      <PixelButton disabled={disabled} onClick={handleList}>
        LIST TOKEN
      </PixelButton>

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

ListTokenDialog.propTypes = {
  open    : PropTypes.bool,
  contract: PropTypes.string,
  tokenId : PropTypes.oneOfType([PropTypes.string,PropTypes.number]),
  market  : PropTypes.string,
  onClose : PropTypes.func,
};
/* EOF */
