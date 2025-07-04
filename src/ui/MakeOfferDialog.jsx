/*Developed by @jams2blues with love for the Tezos community
  File: src/ui/MakeOfferDialog.jsx
  Rev : r3     2025‑09‑16
  Summary: raise z‑index → overlay always on top */

import React, { useState } from 'react';
import styledPkg           from 'styled-components';
import PixelInput          from './PixelInput.jsx';
import PixelButton         from './PixelButton.jsx';
import { useWalletContext } from '../contexts/WalletContext.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled shells ─────────────────────────────────────*/
const Back = styled.div`
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, .86);
  z-index: 6000;                 /* ↑ was 2600 – now eclipses every card/grid */
`;

const Panel = styled.div`
  width: 90vw;
  max-width: 360px;
  background: #0b0b0b;
  color: #fff;
  border: 2px solid #bebebe;
  padding: 1.5rem;
  box-shadow: 0 0 12px #000;
  display: flex;
  flex-direction: column;
  gap: .75rem;
  font-family: var(--font-pixel);
`;

export default function MakeOfferDialog({
  open = false,
  contract = '',
  tokenId = '',
  marketContract = '',
  onClose = () => {},
}) {
  const { toolkit }       = useWalletContext() || {};
  const [amount, setAmount] = useState('1');
  const [price, setPrice]   = useState('');
  const [busy,  setBusy]    = useState(false);

  if (!open) return null;

  const send = async () => {
    const kit = toolkit || window?.tezosToolkit;
    const amtN        = Number(amount);
    const priceMutez  = Math.floor(parseFloat(price) * 1_000_000);

    if (!kit?.wallet)                return alert('Connect wallet first');
    if (!Number.isFinite(amtN) || amtN <= 0)       return alert('Bad amount');
    if (!Number.isFinite(priceMutez) || priceMutez <= 0) return alert('Bad price');
    if (!marketContract)             return alert('Market contract missing');

    try {
      setBusy(true);
      const c  = await kit.wallet.at(marketContract);
      const op = await c.methods.make_offer(
        amtN,
        contract,
        priceMutez,
        Number(tokenId),
      ).send();
      await op.confirmation();
      onClose();
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Back onClick={onClose}>
      <Panel onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 .5rem' }}>Make Offer</h3>

        <PixelInput
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <PixelInput
          placeholder="Price ꜩ"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <PixelButton onClick={send}   disabled={busy}>OK</PixelButton>
          <PixelButton onClick={onClose} disabled={busy}>Cancel</PixelButton>
        </div>
      </Panel>
    </Back>
  );
}

/* What changed & why:
   • z‑index bumped to 6000 so modal never clips inside TokenCard overflow. */
/* EOF */
