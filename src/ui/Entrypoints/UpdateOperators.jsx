/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/UpdateOperators.jsx
  Rev :    r694   2025-06-25
  Summary: $level-safe Wrap, clearer guards, lint
──────────────────────────────────────────────────────────────*/
import React, { useState }   from 'react';
import styledPkg             from 'styled-components';
import PixelHeading          from '../PixelHeading.jsx';
import PixelInput            from '../PixelInput.jsx';
import PixelButton           from '../PixelButton.jsx';
import { useWalletContext }  from '../../contexts/WalletContext.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Box = styled('section').withConfig({ shouldForwardProp: (p) => p !== '$level' })`
  margin-top:1.5rem;position:relative;z-index:${(p) => p.$level ?? 'auto'};
`;
const isTz = (a) => /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);

export default function UpdateOperators({
  contractAddress,
  tezos,
  setSnackbar = () => {},
  onMutate    = () => {},
  $level,
}) {
  const { toolkit: ctxToolkit } = useWalletContext() || {};
  const kit   = tezos || ctxToolkit || window.tezosToolkit;
  const snack = (m, s='warning') => setSnackbar({ open:true, message:m, severity:s });

  const [addr, setAddr]   = useState('');
  const [busy, setBusy]   = useState(false);
  const [adding, setAdd]  = useState(true);

  const run = async () => {
    if (!isTz(addr))   return snack('Enter a valid address');
    if (!kit?.wallet)  return snack('Connect wallet', 'error');

    try {
      setBusy(true);
      const c  = await kit.wallet.at(contractAddress);
      const ep = adding ? 'add_operator' : 'remove_operator';
      if (!c.methods[ep]) return snack(`Entrypoint “${ep}” missing`, 'error');

      const op = await c.methods[ep](addr).send();
      snack('Waiting…', 'info');
      await op.confirmation();
      snack('Done', 'success');
      setAddr('');
      onMutate();
    } catch (e) { snack(`Fail: ${e.message}`, 'error'); }
    finally   { setBusy(false); }
  };

  return (
    <Box $level={$level}>
      <PixelHeading level={3}>Update Operators</PixelHeading>

      <PixelInput
        value={addr}
        placeholder="Operator address"
        onChange={(e) => setAddr(e.target.value.trim())}
      />

      <div style={{ display:'flex', gap:'.75rem', marginTop:'.75rem' }}>
        <PixelButton
          style={{ flex:1 }}
          disabled={busy}
          onClick={() => { setAdd(true); run(); }}
        >
          {busy && adding ? 'Processing…' : 'Add'}
        </PixelButton>
        <PixelButton
          style={{ flex:1 }}
          disabled={busy}
          onClick={() => { setAdd(false); run(); }}
        >
          {busy && !adding ? 'Processing…' : 'Remove'}
        </PixelButton>
      </div>
    </Box>
  );
}
/* EOF */
