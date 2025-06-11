/*Developed by @jams2blues with love for the Tezos community
  File: src/ui/Entrypoints/Burn.jsx
  Summary: Burn tokens – wallet ctx aware */

import React, { useState } from 'react';
import styledPkg from 'styled-components';
import PixelHeading from '../PixelHeading.jsx';
import PixelInput from '../PixelInput.jsx';
import PixelButton from '../PixelButton.jsx';
import { useWalletContext } from '../../contexts/WalletContext.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Box = styled('div')`margin-top:1.5rem;`;

export default function Burn({
  contractAddress,
  tezos,
  setSnackbar = () => {},
  onMutate = () => {},
  $level,
}) {
  const { toolkit: ctxToolkit } = useWalletContext() || {};
  const kit = tezos || ctxToolkit || window.tezosToolkit;
  const snack = (m, s = 'warning') => setSnackbar({ open: true, message: m, severity: s });

  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) return snack('Enter a positive number');
    if (!kit?.wallet) return snack('Connect your wallet', 'error');

    try {
      setBusy(true);
      const c = await kit.wallet.at(contractAddress);
      const op = await c.methods.burn(0, n).send();
      snack('Waiting for confirmation…', 'info');
      await op.confirmation();
      snack('Burned', 'success');
      setQty('');
      onMutate();
    } catch (e) {
      snack(`Fail: ${e.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box $level={$level}>
      <PixelHeading level={3}>Burn</PixelHeading>
      <PixelInput
        value={qty}
        placeholder="Amount"
        type="number"
        min="1"
        onChange={(e) => setQty(e.target.value)}
      />
      <PixelButton style={{ marginTop: '.75rem' }} onClick={run} disabled={busy}>
        {busy ? 'Processing…' : 'Burn'}
      </PixelButton>
    </Box>
  );
}
/* What changed & why: toolkit from wallet context */
