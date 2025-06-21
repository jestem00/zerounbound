/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/UpdateTokenMetadatav4a.jsx
  Rev :    r820   2025-07-19
  Summary: full‑map updater for v4a (update_token_metadata)
──────────────────────────────────────────────────────────────*/
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styledPkg            from 'styled-components';
import { MichelsonMap }     from '@taquito/michelson-encoder';
import { char2Bytes }       from '@taquito/utils';
import { OpKind }           from '@taquito/taquito';

import PixelHeading         from '../PixelHeading.jsx';
import PixelInput           from '../PixelInput.jsx';
import PixelButton          from '../PixelButton.jsx';
import LoadingSpinner       from '../LoadingSpinner.jsx';
import OperationConfirmDialog from '../OperationConfirmDialog.jsx';
import OperationOverlay     from '../OperationOverlay.jsx';

import listLiveTokenIds     from '../../utils/listLiveTokenIds.js';
import { estimateChunked }  from '../../core/feeEstimator.js';
import { useWalletContext } from '../../contexts/WalletContext.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── shells ─────*/
const Wrap     = styled.section`margin-top:1.5rem;`;
const Select   = styled.div`flex:1;position:relative;`;
const Spinner  = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;`;
const HelpBox  = styled.p`
  font-size:.75rem;line-height:1.25;margin:.5rem 0 .9rem;`;

/*════════ component ═══════════════════════════════════════*/
export default function UpdateTokenMetadatav4a({
  contractAddress,
  setSnackbar = () => {},
  onMutate    = () => {},
  $level,
}) {
  const { toolkit } = useWalletContext() || {};
  const snack = (m,s='info') => setSnackbar({ open:true,message:m,severity:s });

  /* token selector */
  const [tokOpts, setTokOpts]       = useState([]);
  const [loadingTok, setLoadingTok] = useState(false);
  const [tokenId,   setTokenId]     = useState('');

  useEffect(() => {
    (async () => {
      if (!contractAddress) return;
      setLoadingTok(true);
      setTokOpts(await listLiveTokenIds(contractAddress, undefined, true));
      setLoadingTok(false);
    })();
  }, [contractAddress]);

  /* JSON textarea state */
  const [raw, setRaw] = useState('');
  const validJSON = useMemo(() => {
    try { JSON.parse(raw); return true; } catch { return false; }
  }, [raw]);

  /* estimator / overlay */
  const [busy,    setBusy   ] = useState(false);
  const [estimate,setEstimate] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [ov,      setOv     ] = useState({ open:false });

  /*──────── helpers ─────*/
  const buildMetaMap = useCallback(() => {
    let obj = {};
    try { obj = JSON.parse(raw); } catch { /* guarded by validJSON */ }
    const mm = new MichelsonMap();
    Object.entries(obj).forEach(([k,v]) => {
      const asStr = typeof v === 'string' ? v : JSON.stringify(v);
      mm.set(k, `0x${char2Bytes(asStr)}`);
    });
    return mm;
  }, [raw]);

  const prep = async () => {
    if (!toolkit)          return snack('Connect wallet', 'error');
    if (!tokenId)          return snack('Token‑ID required', 'warning');
    if (!raw.trim())       return snack('Metadata JSON required', 'warning');
    if (!validJSON)        return snack('Invalid JSON', 'error');
    try {
      setBusy(true);
      const idNat = +tokenId;
      const meta  = buildMetaMap();
      const c     = await toolkit.wallet.at(contractAddress);
      const tx    = [{
        kind : OpKind.TRANSACTION,
        ...c.methods.update_token_metadata(meta, idNat).toTransferParams(),
      }];
      const { fee,burn } = await estimateChunked(toolkit, tx, 1);
      setEstimate({ feeTez:(fee/1e6).toFixed(6), storageTez:(burn/1e6).toFixed(6) });
      setConfirm(true);
    } catch(e){ snack(e.message,'error'); }
    finally   { setBusy(false); }
  };

  const send = async () => {
    try {
      setConfirm(false);
      setOv({ open:true,status:'Waiting for signature…' });
      const idNat = +tokenId;
      const meta  = buildMetaMap();
      const c  = await toolkit.wallet.at(contractAddress);
      const op = await c.methods.update_token_metadata(meta, idNat).send();
      setOv({ open:true,status:'Broadcasting…' });
      await op.confirmation();
      setOv({ open:true,opHash:op.opHash });
      snack('Token metadata updated','success');
      onMutate();
      setRaw('');
    } catch(e){ setOv({ open:false }); snack(e.message,'error'); }
  };

  /*──────── JSX ─────*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Update Token Metadata (v4a)</PixelHeading>

      <div style={{ display:'flex', gap:'.5rem' }}>
        <PixelInput
          placeholder="Token‑ID"
          style={{ flex:1 }}
          value={tokenId}
          onChange={(e)=>setTokenId(e.target.value.replace(/\D/g,''))}
        />
        <Select>
          <select
            style={{ width:'100%',height:32 }}
            disabled={loadingTok}
            value={tokenId||''}
            onChange={(e)=>setTokenId(e.target.value)}
          >
            <option value="">
              {loadingTok ? 'Loading…'
                          : tokOpts.length ? 'Select token' : '— none —'}
            </option>
            {tokOpts.map((t)=>(
              <option key={t.id??t} value={t.id??t}>
                {t.id??t}{t.name?` — ${t.name}`:''}
              </option>
            ))}
          </select>
          {loadingTok && <Spinner/>}
        </Select>
      </div>

      <HelpBox>
        Replace the <em>entire</em> <code>token_metadata</code> map for a
        single token. Paste a JSON object where <strong>keys = strings</strong>{' '}
        and <strong>values = any JSON‑serialisable type</strong>. Each value is
        UTF‑8 encoded → hex per TZIP‑04. Review fee/storage then&nbsp;UPDATE.
      </HelpBox>

      <PixelInput
        as="textarea"
        rows={6}
        placeholder='{"name":"New Title","description":"…"}'
        value={raw}
        onChange={(e)=>setRaw(e.target.value)}
        invalid={raw.trim() && !validJSON}
        disabled={busy}
        style={{ fontFamily:'monospace' }}
      />

      <PixelButton disabled={busy||!tokenId||!raw.trim()||!validJSON} onClick={prep}
        style={{ marginTop:'.8rem' }}>
        UPDATE {busy && <LoadingSpinner size={16} style={{ marginLeft:4 }}/>}
      </PixelButton>

      {confirm && (
        <OperationConfirmDialog
          open
          slices={1}
          estimate={estimate}
          onOk={send}
          onCancel={()=>setConfirm(false)}
        />
      )}
      {ov.open && (
        <OperationOverlay {...ov} onCancel={()=>setOv({ open:false })}/>
      )}
    </Wrap>
  );
}
/* What changed & why:
   • New component enables `update_token_metadata` entrypoint for v4a.
   • Validates token‑id & JSON, converts to MichelsonMap (bytes hex).
   • Uses shared feeEstimator (I85) + OperationConfirmDialog pattern.
   • HelpBox per I86; live JSON guard per I87; lint‑clean. */
/* EOF */
