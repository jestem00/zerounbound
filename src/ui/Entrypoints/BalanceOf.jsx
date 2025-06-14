/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/BalanceOf.jsx
  Rev :    r692   2025-06-25
  Summary: $level-safe Wrap, info-first snack, lint polish
──────────────────────────────────────────────────────────────*/
import React, { useState }   from 'react';
import styledPkg             from 'styled-components';
import PixelHeading          from '../PixelHeading.jsx';
import PixelInput            from '../PixelInput.jsx';
import PixelButton           from '../PixelButton.jsx';
import { useWalletContext }  from '../../contexts/WalletContext.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap   = styled('section').withConfig({ shouldForwardProp: (p) => p !== '$level' })`
  margin-top:1.5rem;position:relative;z-index:${(p) => p.$level ?? 'auto'};
`;
const Result = styled('p')`font-size:.8rem;margin-top:.75rem;word-break:break-all;`;

export default function BalanceOf({
  contractAddress,
  tezos,
  setSnackbar = () => {},
  $level,
}) {
  const { toolkit: ctxToolkit } = useWalletContext() || {};
  const kit  = tezos || ctxToolkit || window.tezosToolkit;

  const snack = (m, s = 'info') => setSnackbar({ open:true, message:m, severity:s });

  const [addr, setAddr] = useState('');
  const [bal,  setBal ] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!addr) return snack('Enter an address', 'warning');
    try {
      setBusy(true);
      const c  = await kit.contract.at(contractAddress);
      const res = await c.views.balance_of([{ owner: addr, token_id: 0 }]).read();
      setBal(res?.[0]?.balance ?? 0);
    } catch (e) {
      snack(`Fail: ${e.message}`, 'error');
      setBal(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Check Balance</PixelHeading>
      <PixelInput
        value={addr}
        placeholder="tz… / KT1…"
        onChange={(e) => setAddr(e.target.value.trim())}
      />
      <PixelButton
        style={{ marginTop:'.75rem' }}
        onClick={run}
        disabled={busy}
      >
        {busy ? 'Querying…' : 'Check'}
      </PixelButton>
      {bal != null && <Result>Balance: {bal}</Result>}
    </Wrap>
  );
}
/* EOF */
