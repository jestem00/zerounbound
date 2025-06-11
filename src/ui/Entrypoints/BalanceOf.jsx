/*Developed by @jams2blues with love for the Tezos community
  File: src/ui/Entrypoints/BalanceOf.jsx
  Summary: Check balance – wallet ctx fallback */

import React, { useState } from 'react';
import styledPkg from 'styled-components';
import PixelHeading from '../PixelHeading.jsx';
import PixelInput from '../PixelInput.jsx';
import PixelButton from '../PixelButton.jsx';
import { useWalletContext } from '../../contexts/WalletContext.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Box = styled('div')`margin-top:1.5rem;`;
const Result = styled('p')`font-size:.8rem;margin-top:.75rem;word-break:break-all;`;

export default function BalanceOf({
  contractAddress,
  tezos,
  setSnackbar = () => {},
  $level,
}) {
  const { toolkit: ctxToolkit } = useWalletContext() || {};
  const kit = tezos || ctxToolkit || window.tezosToolkit;
  const snack = (m, s = 'warning') => setSnackbar({ open: true, message: m, severity: s });

  const [addr, setAddr] = useState('');
  const [bal, setBal] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!addr) return snack('Enter an address');
    try {
      setBusy(true);
      const c = await kit.contract.at(contractAddress);
      const v = await c.views.balance_of([{ owner: addr, token_id: 0 }]).read();
      setBal(v?.[0]?.balance ?? 0);
    } catch (e) {
      snack(`Fail: ${e.message}`, 'error');
      setBal(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box $level={$level}>
      <PixelHeading level={3}>Check Balance</PixelHeading>
      <PixelInput
        value={addr}
        placeholder="tz… / KT1…"
        onChange={(e) => setAddr(e.target.value.trim())}
      />
      <PixelButton style={{ marginTop: '.75rem' }} onClick={run} disabled={busy}>
        {busy ? 'Querying…' : 'Check'}
      </PixelButton>
      {bal != null && <Result>Balance: {bal}</Result>}
    </Box>
  );
}
/* What changed & why: wallet context toolkit fallback */
