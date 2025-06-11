/*Developed by @jams2blues with love for the Tezos community
  File: src/ui/Entrypoints/AddRemoveCollaborator.jsx
  Summary: Batch add / remove collaborators — snackbar-driven feedback */

import React, { useState }     from 'react';
import styledPkg               from 'styled-components';
import PixelHeading            from '../PixelHeading.jsx';
import PixelInput              from '../PixelInput.jsx';
import PixelButton             from '../PixelButton.jsx';
import { useWalletContext }    from '../../contexts/WalletContext.js';

const styled  = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const isTz    = (a) => /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);
const Wrap    = styled('section').withConfig({ shouldForwardProp: p => p !== '$level' })`
  margin-top: 1.5rem;
  position: relative;
  z-index: ${({ $level }) => $level ?? 'auto'};
`;

export default function AddRemoveCollaborator({
  contractAddress,
  tezos,
  setSnackbar = () => {},
  onMutate   = () => {},
  $level,
}) {
  /* toolkit resolution */
  const { toolkit: ctxToolkit } = useWalletContext() || {};
  const kit = tezos || ctxToolkit || window.tezosToolkit;

  /* local helpers */
  const snack = (m, s = 'info') =>
    setSnackbar({ open: true, message: m, severity: s });

  /* component state */
  const [input, setInput] = useState('');
  const [busy,  setBusy]  = useState(false);
  const [task,  setTask]  = useState('');

  /* batch runner */
  const run = async (method) => {
    if (!kit?.wallet)        return snack('Connect your wallet first', 'warning');

    const list = input.split(/[\s,]/).map(t => t.trim()).filter(Boolean);
    if (!list.length)        return snack('Paste at least one address', 'warning');
    if (list.some(a => !isTz(a)))
      return snack('One or more addresses are invalid', 'error');

    try {
      setBusy(true);
      setTask(method);

      const c = await kit.wallet.at(contractAddress);
      if (!c.methods[method])
        throw new Error(`Entrypoint "${method}" missing on contract`);

      let batch = kit.wallet.batch();
      list.forEach((a) => { batch = batch.withContractCall(c.methods[method](a)); });

      const op = await batch.send();
      snack('Waiting for confirmation…', 'info');
      await op.confirmation();
      snack(
        `${method.startsWith('add') ? 'Added' : 'Removed'} ${list.length} collaborator(s)`,
        'success',
      );
      setInput('');
      onMutate();               /* refresh parent counters */
    } catch (e) {
      snack(`Failed: ${e.message}`, 'error');
    } finally {
      setBusy(false);
      setTask('');
    }
  };

  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Collaborators</PixelHeading>

      <PixelInput
        as="textarea"
        rows={3}
        value={input}
        placeholder="tz1… / KT1… — space, comma or new-line separated"
        onChange={(e) => setInput(e.target.value)}
      />

      <div style={{ display: 'flex', gap: '.75rem', marginTop: '.75rem' }}>
        <PixelButton
          style={{ flex: 1 }}
          disabled={busy}
          onClick={() => run('add_collaborator')}
        >
          {busy && task === 'add_collaborator' ? 'Processing…' : 'Add'}
        </PixelButton>

        <PixelButton
          style={{ flex: 1 }}
          disabled={busy}
          onClick={() => run('remove_collaborator')}
        >
          {busy && task === 'remove_collaborator' ? 'Processing…' : 'Remove'}
        </PixelButton>
      </div>
    </Wrap>
  );
}
/* What changed & why: removed undefined `toast`, added `snack` helper,
   guarded inputs, cleaned stray code — restores runtime. */
