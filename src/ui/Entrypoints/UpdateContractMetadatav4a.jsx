/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/UpdateContractMetadatav4a.jsx
  Rev :    r731   2025-07-12
  Summary: HelpBox, styled wrap, JSON validate, spinner icon
──────────────────────────────────────────────────────────────*/
import React, { useMemo, useState } from 'react';
import styledPkg                    from 'styled-components';
import { char2Bytes }               from '@taquito/utils';
import { OpKind }                   from '@taquito/taquito';

import PixelHeading                 from '../PixelHeading.jsx';
import PixelInput                   from '../PixelInput.jsx';
import PixelButton                  from '../PixelButton.jsx';
import LoadingSpinner               from '../LoadingSpinner.jsx';
import OperationConfirmDialog       from '../OperationConfirmDialog.jsx';
import OperationOverlay             from '../OperationOverlay.jsx';

import { useWalletContext }         from '../../contexts/WalletContext.js';

const styled  = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled shells ─────*/
const Wrap = styled.section`margin-top:1.5rem;`;
const HelpBox = styled.p`
  font-size:.75rem;line-height:1.25;margin:.5rem 0 .9rem;
`;
const Spinner = styled(LoadingSpinner).attrs({ size:16 })`
  margin-left:4px;
`;

/*════════ component ════════════════════════════════════════*/
export default function UpdateContractMetadatav4a({
  contractAddress,
  setSnackbar = () => {},
  onMutate    = () => {},
  $level,
}) {
  const { toolkit } = useWalletContext() || {};
  const snack = (m, s = 'info') =>
    setSnackbar({ open: true, message: m, severity: s });

  const [json,   setJson  ] = useState('');
  const [est,    setEst   ] = useState(null);
  const [confirm,setConfirm] = useState(false);
  const [ov,     setOv    ] = useState({ open: false });
  const [busy,   setBusy  ] = useState(false);

  const validJSON = useMemo(() => {
    try { JSON.parse(json); return true; } catch { return false; }
  }, [json]);

  const disabled = !json.trim() || !validJSON || busy;

  const estimate = async () => {
    if (!toolkit) return snack('Connect wallet first', 'error');
    if (!validJSON) return snack('Invalid JSON', 'error');
    try {
      setBusy(true);
      const c = await toolkit.wallet.at(contractAddress);
      const params = [{
        kind: OpKind.TRANSACTION,
        ...c.methods.update_contract_metadata(`0x${char2Bytes(json)}`).toTransferParams(),
      }];
      const [e] = await toolkit.estimate.batch(params);
      setEst({
        feeTez    : (e.suggestedFeeMutez / 1e6).toFixed(6),
        storageTez: (e.burnFeeMutez      / 1e6).toFixed(6),
      });
      setConfirm(true);
    } catch (err) { snack(err.message, 'error'); }
    finally       { setBusy(false); }
  };

  const send = async () => {
    if (!toolkit) return;
    try {
      setConfirm(false);
      setOv({ open: true, status: 'Waiting for signature…' });
      const c  = await toolkit.wallet.at(contractAddress);
      const op = await c.methods.update_contract_metadata(`0x${char2Bytes(json)}`).send();
      setOv({ open: true, status: 'Broadcasting…' });
      await op.confirmation();
      setOv({ open: true, opHash: op.opHash });
      snack('Contract metadata updated', 'success');
      onMutate();
      setJson('');
    } catch (e) { setOv({ open: false }); snack(e.message, 'error'); }
  };

  /*──────── JSX ─────────*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Update Contract Metadata (v4a)</PixelHeading>
      <HelpBox>
        Updates *contract-level* TZIP-16 JSON (name, description, license, …).
        Paste the full JSON blob, **UPDATE**, review fee/storage estimate, then sign.
      </HelpBox>

      <PixelInput
        as="textarea"
        rows={6}
        placeholder="Full metadata JSON"
        value={json}
        onChange={(e) => setJson(e.target.value)}
        invalid={json.trim() && !validJSON}
        disabled={busy}
      />

      <PixelButton
        style={{ marginTop: '.8rem' }}
        disabled={disabled}
        onClick={estimate}
      >
        UPDATE {busy && <Spinner />}
      </PixelButton>

      {confirm && (
        <OperationConfirmDialog
          open
          slices={1}
          estimate={est}
          onOk={send}
          onCancel={() => setConfirm(false)}
        />
      )}

      {ov.open && (
        <OperationOverlay {...ov} onCancel={() => setOv({ open: false })} />
      )}
    </Wrap>
  );
}
/* What changed & why:
   • HelpBox added.
   • JSON validity check with live red-flag.
   • Busy spinner + guard.
   • Consistent Wrap styling. */
/* EOF */
