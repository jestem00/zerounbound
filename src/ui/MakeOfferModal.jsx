/*Developed by @jams2blues with love for the Tezos community
  File: src/ui/MakeOfferModal.jsx
  Summary: modal for make_offer entrypoint */
import React, { useState } from 'react';
import styledPkg from 'styled-components';
import PixelInput  from './PixelInput.jsx';
import PixelButton from './PixelButton.jsx';
import { useWalletContext } from '../contexts/WalletContext.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const MARKET_KT1 = process.env.NEXT_PUBLIC_MARKET_KT1 || '';

const Back = styled.div`
  position:fixed;inset:0;display:flex;justify-content:center;align-items:center;
  background:rgba(0,0,0,.86);z-index:2600;
`;
const Panel = styled.div`
  width:90vw;max-width:360px;padding:1.5rem 2rem;
  background:var(--zu-bg,#0b0b0b);color:var(--zu-fg,#f0f0f0);
  border:2px solid #bebebe;box-shadow:0 0 0 2px #000,0 0 12px #000;
  font-family:var(--font-pixel);
`;
const Field = styled.div`margin-bottom:.8rem;font-size:.8rem;`;
const Label = styled.label`display:block;margin-bottom:.3rem;`;

export default function MakeOfferModal({
  open = false,
  contract = '',
  tokenId = '',
  onClose = () => {},
}) {
  const { toolkit } = useWalletContext() || {};
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('1');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const send = async () => {
    if (!toolkit?.wallet) return onClose(false);
    try {
      setBusy(true);
      const c = await toolkit.wallet.at(MARKET_KT1 || contract);
      const mutez = Math.round(parseFloat(price || '0') * 1_000_000);
      const amt = parseInt(amount, 10) || 1;
      const op = await c.methods.make_offer(amt, contract, mutez, parseInt(tokenId,10)).send();
      await op.confirmation();
      onClose(true);
    } catch (e) {
      console.error(e); onClose(false);
    } finally { setBusy(false); }
  };

  return (
    <Back onClick={onClose}>
      <Panel onClick={(e)=>e.stopPropagation()}>
        <h3 style={{margin:'0 0 1rem'}}>Make Offer</h3>
        <Field>
          <Label htmlFor="offer-price">Price (ꜩ)</Label>
          <PixelInput id="offer-price" type="number" step="0.000001" min="0" value={price} onChange={(e)=>setPrice(e.target.value)} />
        </Field>
        <Field>
          <Label htmlFor="offer-amount">Amount</Label>
          <PixelInput id="offer-amount" type="number" min="1" value={amount} onChange={(e)=>setAmount(e.target.value)} />
        </Field>
        <div style={{display:'flex',gap:'1rem',justifyContent:'center',marginTop:'1rem'}}>
          <PixelButton onClick={send} disabled={busy}>Make Offer</PixelButton>
          <PixelButton onClick={onClose} disabled={busy}>Cancel</PixelButton>
        </div>
      </Panel>
    </Back>
  );
}
/* What changed & why: new modal to submit make_offer event */
