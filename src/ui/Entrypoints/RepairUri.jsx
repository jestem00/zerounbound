/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/RepairUri.jsx
  Rev :    r811   2025‑07‑11 T02:05 UTC
  Summary: recognise on‑chain “0x…” values → no false conflict;
           CTA enabled for unfinished extra URI slices
──────────────────────────────────────────────────────────────*/

import React, {
  useCallback, useEffect, useState,
} from 'react';
import styledPkg           from 'styled-components';
import { OpKind }          from '@taquito/taquito';
import { Buffer }          from 'buffer';

import PixelHeading        from '../PixelHeading.jsx';
import PixelInput          from '../PixelInput.jsx';
import PixelButton         from '../PixelButton.jsx';
import MintUpload          from './MintUpload.jsx';
import OperationOverlay    from '../OperationOverlay.jsx';
import OperationConfirmDialog from '../OperationConfirmDialog.jsx';
import PixelConfirmDialog  from '../PixelConfirmDialog.jsx';
import RenderMedia         from '../../utils/RenderMedia.jsx';
import TokenMetaPanel      from '../TokenMetaPanel.jsx';
import LoadingSpinner      from '../LoadingSpinner.jsx';

import { char2Bytes }      from '@taquito/utils';
import { jFetch }          from '../../core/net.js';
import { useWalletContext } from '../../contexts/WalletContext.js';
import { TZKT_API }         from '../../config/deployTarget.js';
import { listUriKeys }      from '../../utils/uriHelpers.js';
import { sliceTail, PACKED_SAFE_BYTES, splitPacked } from '../../core/batch.js';
import {
  clearSliceCheckpoint, purgeExpiredSliceCache,
} from '../../utils/sliceCache.js';
import listLiveTokenIds    from '../../utils/listLiveTokenIds.js';
import { estimateChunked } from '../../core/feeEstimator.js';

/*──────── styled shells ─────*/
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap = styled('div')`
  display:flex;flex-direction:column;gap:1.1rem;
  position:relative;z-index:${(p)=>p.$level??'auto'};
`;
const SelectBox = styled.div`position:relative;flex:1;`;
const Spinner   = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;
`;
const HelpBox = styled.p`
  font-size:.75rem;line-height:1.25;margin:.5rem 0 .9rem;
`;

/*════════ component ════════════════════════════════════════*/
export default function RepairUri({
  contractAddress,
  setSnackbar = () => {},
  onMutate    = () => {},
  $level,
}) {
  const { toolkit, network = 'ghostnet' } = useWalletContext() || {};
  const snack = (m, s = 'info') =>
    setSnackbar({ open: true, message: m, severity: s });

  /* token list */
  const [tokOpts,     setTokOpts]     = useState([]);
  const [loadingTok,  setLoadingTok]  = useState(false);
  const fetchTokens = useCallback(async () => {
    if (!contractAddress) return;
    setLoadingTok(true);
    setTokOpts(await listLiveTokenIds(contractAddress, network, true));
    setLoadingTok(false);
  }, [contractAddress, network]);
  useEffect(() => { void fetchTokens(); }, [fetchTokens]);

  /* local state */
  const [tokenId, setTokenId] = useState('');
  const [uriKey,  setUriKey]  = useState('');
  const [uriKeys, setUriKeys] = useState([]);

  const [file,    setFile]    = useState(null);
  const [dataUrl, setDataUrl] = useState('');
  const [meta,    setMeta]    = useState(null);
  const [origHex, setOrigHex] = useState('');
  const [diff,    setDiff]    = useState([]);

  const [preparing, setPreparing] = useState(false);
  const [batches,   setBatches]   = useState(null);
  const [estimate,  setEstimate]  = useState(null);

  const [overlay,    setOverlay]    = useState({ open:false });
  const [conflictOpen, setConflict] = useState(false);
  const [confirmOpen,  setConfirm]  = useState(false);

  const reset = () => {
    setFile(null); setDataUrl(''); setDiff([]);
    setBatches(null); setEstimate(null);
    clearSliceCheckpoint(contractAddress, tokenId,
      uriKey || 'artifactUri', network);
  };

  /*──── meta fetch ──────────────────────────────────────────*/
  const loadMeta = useCallback(async (id) => {
    setMeta(null); setOrigHex(''); setDiff([]); setUriKeys([]); setUriKey('');
    if (!contractAddress || id === '') return;
    let rows = [];
    try {
      rows = await jFetch(
        `${TZKT_API}/v1/tokens?contract=${contractAddress}&tokenId=${id}&limit=1`,
      );
    } catch {}
    if (!rows.length) {
      try {
        const one = await jFetch(
          `${TZKT_API}/v1/contracts/${contractAddress}/bigmaps/token_metadata/keys/${id}`,
        );
        if (one?.value)
          rows = [{ metadata: JSON.parse(
            Buffer.from(one.value.replace(/^0x/, ''), 'hex').toString('utf8'),
          ) }];
      } catch {}
    }
    const m = rows[0]?.metadata || {};
    setMeta(m);
    const keys = listUriKeys(m);
    setUriKeys(keys);
    const first = keys.find((k) => /artifacturi/i.test(k)) || keys[0] || '';
    setUriKey(first || 'artifactUri');
  }, [contractAddress]);
  useEffect(() => { loadMeta(tokenId); }, [tokenId, loadMeta]);

  /* load original hex when uriKey changes */
  useEffect(() => {
    if (!uriKey || !meta) return;
    const val = meta[uriKey];
    /* value may already be on‑chain hex (“0x…”) OR plain string */
    const hx  = typeof val === 'string' && val.startsWith('0x')
      ? val.trim()
      : `0x${char2Bytes(val || '')}`;
    setOrigHex(hx);
  }, [uriKey, meta]);

  useEffect(() => { purgeExpiredSliceCache(); }, []);

  /*──── upload handler + preview ────────────────────────────*/
  const onUpload = useCallback((v) => {
    if (!v) { reset(); return; }

    const f  = v instanceof File              ? v
             : v && v.file instanceof File    ? v.file
             : null;
    const du = typeof v === 'string'          ? v
             : v && typeof v.dataUrl === 'string' ? v.dataUrl
             : '';

    if (f)  setFile(f);
    if (du) setDataUrl(du);

    if (f && !du) {
      const r = new FileReader();
      r.onload = (e) => setDataUrl(e.target.result);
      r.readAsDataURL(f);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* keep diff live when either source changes */
  useEffect(() => {
    if (!dataUrl || !origHex) return;
    const { tail, conflict } = sliceTail(origHex, `0x${char2Bytes(dataUrl)}`);
    if (conflict) { setConflict(true); setDiff([]); return; }
    setDiff(tail);
  }, [dataUrl, origHex]);

  /* helper – build diff ad‑hoc */
  const buildDiff = useCallback(async () => {
    if ((!file && !dataUrl) || !origHex) return [];
    let fullData = dataUrl;
    if (!fullData && file) {
      fullData = await new Promise((res) => {
        const r = new FileReader(); r.onload = (e) => res(e.target.result);
        r.readAsDataURL(file);
      });
      setDataUrl(fullData);
    }
    const { tail, conflict } = sliceTail(origHex, `0x${char2Bytes(fullData)}`);
    if (conflict) { setConflict(true); return []; }
    if (!tail.length) snack('File matches on‑chain', 'success');
    setDiff(tail);
    return tail;
  }, [file, dataUrl, origHex, snack]);

  /*──── builder & estimator ─────────────────────────────────*/
  const buildAndEstimate = async () => {
    if (!toolkit) return snack('Connect wallet', 'error');
    if (!origHex)  return snack('Metadata still loading — try again', 'warning');

    const tail = diff.length ? diff : await buildDiff();
    if (!tail.length) return;

    setPreparing(true);
    try {
      const c     = await toolkit.wallet.at(contractAddress);
      const idNat = +tokenId;
      const label = uriKey.replace(/^extrauri_/i, '');
      const ops   = tail.map((hx) => (
        uriKey.toLowerCase().startsWith('extrauri_')
          ? { kind: OpKind.TRANSACTION,
              ...c.methods.append_extrauri('', label, '', idNat, hx).toTransferParams() }
          : { kind: OpKind.TRANSACTION,
              ...c.methods.append_artifact_uri(idNat, hx).toTransferParams() }
      ));

      const { fee, burn } = await estimateChunked(toolkit, ops, 8);
      setEstimate({
        feeTez:     (fee   / 1e6).toFixed(6),
        storageTez: (burn  / 1e6).toFixed(6),
      });
      setBatches(await splitPacked(toolkit, ops, PACKED_SAFE_BYTES));
      setConfirm(true);
    } catch (e) { snack(e.message, 'error'); }
    finally      { setPreparing(false); }
  };

  /*──── slice executor ──────────────────────────────────────*/
  const runSlice = useCallback(async (idx) => {
    if (!batches || idx >= batches.length) return;
    try {
      setOverlay({ open:true, status:'Preparing transaction…', current:idx+1, total:batches.length });
      const op = await toolkit.wallet.batch(batches[idx]).send();
      setOverlay({ open:true, status:'Waiting for confirmation…', current:idx+1, total:batches.length });
      await op.confirmation();
      if (idx + 1 < batches.length) {
        requestAnimationFrame(() => runSlice(idx + 1));
      } else {
        snack('Repair complete', 'success');
        setOverlay({ open:false });
        reset(); onMutate();
      }
    } catch (e) {
      setOverlay({ open:true, error:true, status:e.message || String(e), current:idx+1, total:batches.length });
    }
  }, [batches, toolkit, onMutate, snack]);

  /* enable‑guard */
  const disabled = preparing
    || !file && !dataUrl
    || !tokenId
    || !origHex
    || conflictOpen;

  /*──────── JSX ─────────────────────────────────────────────*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Repair&nbsp;URI</PixelHeading>

      {/* token picker */}
      <div style={{ display:'flex', gap:'.6rem' }}>
        <PixelInput
          placeholder="Token-ID"
          style={{ flex:1 }}
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value.replace(/\D/g, ''))}
        />
        <SelectBox>
          <select
            style={{ width:'100%', height:32 }}
            disabled={loadingTok}
            value={tokenId || ''}
            onChange={(e) => setTokenId(e.target.value)}
          >
            <option value="">
              {loadingTok ? 'Loading…'
                          : tokOpts.length ? 'Select token' : '— none —'}
            </option>
            {tokOpts.map(({ id, name }) => (
              <option key={id} value={id}>
                {name ? `${id} — ${name}` : id}
              </option>
            ))}
          </select>
          {loadingTok && <Spinner />}
        </SelectBox>
      </div>

      {/* uriKey dropdown */}
      <div style={{ display:'flex', gap:'.6rem' }}>
        <SelectBox style={{ flex:1 }}>
          <select
            style={{ width:'100%', height:32 }}
            value={uriKey}
            onChange={(e) => setUriKey(e.target.value)}
            disabled={!uriKeys.length}
          >
            {uriKeys.length
              ? uriKeys.map((k) => <option key={k} value={k}>{k}</option>)
              : <option value="artifactUri">artifactUri</option>}
          </select>
        </SelectBox>
      </div>

      <HelpBox>
        ① Pick token → ② choose URI key → ③ upload original file.
        Any order works; only missing tail bytes are appended.
      </HelpBox>

      {/* preview panes */}
      <div style={{
        display:'flex', flexWrap:'wrap',
        gap:'1rem', justifyContent:'space-between',
      }}>
        <div style={{ flex:'0 1 46%', minWidth:210 }}>
          <MintUpload
            onFileChange={onUpload}
            onFileDataUrlChange={onUpload}
            accept="*/*"
          />
          {dataUrl && (
            <RenderMedia
              uri={dataUrl}
              alt={file?.name}
              style={{
                width:'100%', maxHeight:200, margin:'6px auto', objectFit:'contain',
              }}
            />
          )}
        </div>
        <div style={{ flex:'0 1 48%', minWidth:240 }}>
          <TokenMetaPanel
            meta={meta}
            tokenId={tokenId}
            contractAddress={contractAddress}
          />
        </div>
      </div>

      {/* CTA */}
      <div style={{ display:'flex', gap:'.6rem', alignItems:'center', marginTop:'.9rem' }}>
        <PixelButton disabled={disabled} onClick={buildAndEstimate}>
          {preparing ? 'Calculating…' : 'Compare & Repair'}
        </PixelButton>
        {preparing && (
          <>
            <LoadingSpinner style={{ position:'static' }} />
            <span style={{ fontSize:'.7rem' }}>Calculating…</span>
          </>
        )}
      </div>

      {/* conflict dialog */}
      {conflictOpen && (
        <PixelConfirmDialog
          title="Conflict detected"
          message="Uploaded file differs before missing tail. Pick the exact original file."
          confirmLabel="OK"
          onConfirm={() => { setConflict(false); reset(); }}
        />
      )}

      {/* overlay */}
      {overlay.open && (
        <OperationOverlay
          {...overlay}
          onRetry={() => runSlice((overlay.current ?? 1) - 1)}
          onCancel={() => { setOverlay({ open:false }); reset(); }}
        />
      )}

      {/* confirm dialog */}
      {confirmOpen && (
        <OperationConfirmDialog
          open
          estimate={estimate}
          slices={batches?.length || 1}
          onOk={() => { setConfirm(false); runSlice(0); }}
          onCancel={() => { setConfirm(false); reset(); }}
        />
      )}
    </Wrap>
  );
}
/* What changed & why:
   • Correctly recognises on‑chain values already prefixed
     with “0x”: avoids double‑encoding bug that caused
     `sliceTail` to mark every extra URI as conflict ⇒ CTA
     permanently disabled.  
   • enable‑guard simplified; now hinges on presence of
     upload + origHex (meta fetched) + no conflict.  
   • All other logic unchanged. Lint‑clean, invariants intact.
*/
/* EOF */
