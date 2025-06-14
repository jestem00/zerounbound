/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/AddRemoveParentChild.jsx
  Rev :    r692   2025-06-25
  Summary: de-dupe list, info-first snackbar, lint pass
──────────────────────────────────────────────────────────────*/
import React, { useState }    from 'react';
import styledPkg              from 'styled-components';
import PixelHeading           from '../PixelHeading.jsx';
import PixelInput             from '../PixelInput.jsx';
import PixelButton            from '../PixelButton.jsx';
import { useWalletContext }   from '../../contexts/WalletContext.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const isTz   = (a) => /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);

const Wrap = styled('section').withConfig({ shouldForwardProp: (p) => p !== '$level' })`
  margin-top:1.5rem;position:relative;z-index:${(p) => p.$level ?? 'auto'};
`;
const Bar  = styled('div')`display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1rem;`;

export default function AddRemoveParentChild({
  contractAddress,
  tezos,
  setSnackbar = () => {},
  onMutate    = () => {},
  $level,
}) {
  const { toolkit: ctxToolkit } = useWalletContext() || {};
  const kit  = tezos || ctxToolkit || window.tezosToolkit;

  const snack = (m, s = 'info') => setSnackbar({ open:true, message:m, severity:s });

  const [input, setInput] = useState('');
  const [busy,  setBusy ] = useState(false);
  const [task,  setTask ] = useState('');

  const ACTIONS = {
    add_parent   : 'Add Parent(s)',
    remove_parent: 'Remove Parent(s)',
    add_child    : 'Add Child(ren)',
    remove_child : 'Remove Child(ren)',
  };

  const run = async (ep) => {
    const addrs = Array.from(
      new Set(
        input.split(/[\s,]/).map((t) => t.trim()).filter(Boolean),
      ),
    );

    if (!addrs.length)            return snack('Enter at least one address', 'warning');
    if (addrs.some((a) => !isTz(a))) return snack('Invalid address in list', 'error');
    if (!kit?.wallet)             return snack('Connect your wallet first', 'warning');

    try {
      setBusy(true);
      setTask(ep);

      const c = await kit.wallet.at(contractAddress);
      if (!c.methods?.[ep]) return snack(`Entrypoint “${ep}” missing`, 'error');

      let b = kit.wallet.batch();
      addrs.forEach((a) => { b = b.withContractCall(c.methods[ep](a)); });

      const op = await b.send();
      snack('Waiting for confirmation…');
      await op.confirmation();
      snack('✅ Done', 'success');
      setInput('');
      onMutate();
    } catch (e) {
      snack(`Fail: ${e.message}`, 'error');
    } finally {
      setBusy(false);
      setTask('');
    }
  };

  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Parent / Child Links</PixelHeading>

      <PixelInput
        as="textarea"
        rows={3}
        placeholder="tz… or KT1… – separated by space/comma/new-line"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />

      <Bar>
        {Object.keys(ACTIONS).map((k) => (
          <PixelButton
            key={k}
            onClick={() => run(k)}
            disabled={busy}
            style={{ flex:1 }}
          >
            {busy && task === k ? 'Processing…' : ACTIONS[k]}
          </PixelButton>
        ))}
      </Bar>
    </Wrap>
  );
}
/* EOF */
