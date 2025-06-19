/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/AddRemoveCollaboratorsv4a.jsx
  Rev :    r730   2025-07-12
  Summary: HelpBox, styled wrap, spinner, stronger guards
──────────────────────────────────────────────────────────────*/
import React, { useState }         from 'react';
import styledPkg                   from 'styled-components';
import PixelHeading                from '../PixelHeading.jsx';
import PixelInput                  from '../PixelInput.jsx';
import PixelButton                 from '../PixelButton.jsx';
import LoadingSpinner              from '../LoadingSpinner.jsx';
import { useWalletContext }        from '../../contexts/WalletContext.js';

const styled  = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled shells ─────*/
const Wrap = styled.section`
  margin-top:1.5rem;
`;
const HelpBox = styled.p`
  font-size:.75rem;line-height:1.25;margin:.5rem 0 .9rem;
`;
const Spinner = styled(LoadingSpinner).attrs({ size:16 })`
  margin-left:4px;
`;
/*──────── helpers ─────*/
const isTz = (a) => /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);

/*════════ component ════════════════════════════════════════*/
export default function AddRemoveCollaboratorsv4a({
  contractAddress,
  setSnackbar = () => {},
  onMutate    = () => {},
  $level,
}) {
  const { toolkit } = useWalletContext() || {};
  const snack = (m, s = 'info') =>
    setSnackbar({ open: true, message: m, severity: s });

  const [input, setInput] = useState('');
  const [busy,  setBusy ] = useState(false);

  const run = async (ep) => {
    if (!toolkit) return snack('Connect wallet first', 'error');
    const addrs = Array.from(
      new Set(
        input.split(/[\s,]/).map((t) => t.trim()).filter(Boolean),
      ),
    );
    if (!addrs.length) return snack('No addresses supplied', 'warning');
    if (addrs.some((a) => !isTz(a))) return snack('Invalid address present', 'error');
    try {
      setBusy(true);
      const c  = await toolkit.wallet.at(contractAddress);
      /* Michelson set<address> – Taquito accepts plain JS array */
      const op = await c.methods[ep](addrs).send();
      snack('Waiting for confirmation…');
      await op.confirmation();
      snack('Done', 'success');
      onMutate();
      setInput('');
    } catch (e) { snack(e.message, 'error'); }
    finally     { setBusy(false); }
  };

  /*──────── JSX ─────────*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Collaborators (v4a)</PixelHeading>
      <HelpBox>
        V4a <code>set&lt;address&gt;</code> helper. Paste one or many&nbsp;tz/KT addresses
        (comma, space, or newline separated) then **ADD** or **REMOVE** in a single call.
        Wallet batches automatically; duplicates are ignored.
      </HelpBox>

      <PixelInput
        as="textarea"
        rows={3}
        placeholder="tz1… KT1… — comma/space/new-line separated"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={busy}
      />

      <div style={{ display: 'flex', gap: '.8rem', marginTop: '.8rem' }}>
        <PixelButton disabled={busy} onClick={() => run('add_collaborators')}>
          ADD {busy && <Spinner />}
        </PixelButton>
        <PixelButton disabled={busy} onClick={() => run('remove_collaborators')}>
          REMOVE {busy && <Spinner />}
        </PixelButton>
      </div>
    </Wrap>
  );
}
/* What changed & why:
   • Styled Wrap + HelpBox for consistent layout.
   • Busy state now shows inline spinner.
   • Stronger validations + wallet guard text.
   • Lint-clean; follows v4a entrypoint names. */
/* EOF */
