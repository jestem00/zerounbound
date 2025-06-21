/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/RepairUriV4a.jsx
  Rev :    r824   2025-07-19
  Summary: retry preserves slice index – diff‑aware resume fixed
──────────────────────────────────────────────────────────────*/
import React, {
  useCallback, useEffect, useState, useMemo,
} from 'react';
import styledPkg           from 'styled-components';
import { Buffer }          from 'buffer';
import { char2Bytes }      from '@taquito/utils';
import { OpKind }          from '@taquito/taquito';

import PixelHeading        from '../PixelHeading.jsx';
import PixelButton         from '../PixelButton.jsx';
import PixelInput          from '../PixelInput.jsx';
import MintUpload          from './MintUpload.jsx';
import LoadingSpinner      from '../LoadingSpinner.jsx';
import OperationOverlay    from '../OperationOverlay.jsx';
import OperationConfirmDialog from '../OperationConfirmDialog.jsx';
import RenderMedia         from '../../utils/RenderMedia.jsx';
import TokenMetaPanel      from '../TokenMetaPanel.jsx';

import {
  sliceHex, sliceTail, splitPacked, PACKED_SAFE_BYTES,
} from '../../core/batchV4a.js';
import {
  loadSliceCheckpoint, saveSliceCheckpoint,
  clearSliceCheckpoint, purgeExpiredSliceCache,
} from '../../utils/sliceCacheV4a.js';
import listLiveTokenIds     from '../../utils/listLiveTokenIds.js';
import { estimateChunked }  from '../../core/feeEstimator.js';
import { jFetch }           from '../../core/net.js';
import { TZKT_API }         from '../../config/deployTarget.js';
import { useWalletContext } from '../../contexts/WalletContext.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap    = styled.section`margin-top:1.5rem;`;
const Select  = styled.div`flex:1;position:relative;`;
const Spinner = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;`;
const HelpBox = styled.p`
  font-size:.75rem;line-height:1.25;margin:.5rem 0 .9rem;`;

/*──────── helpers ─────*/
const API     = `${TZKT_API}/v1`;
const hex2str = (h) => Buffer.from(h.replace(/^0x/, ''), 'hex').toString('utf8');

/*════════ component ════════════════════════════════════════*/
export default function RepairUriV4a({
  contractAddress,
  setSnackbar = () => {},
  onMutate    = () => {},
  $level,
}) {
  const { toolkit } = useWalletContext() || {};
  const snack = (m,s='info') => setSnackbar({ open:true,message:m,severity:s });

  /*──────── token list ─────*/
  const [tokOpts, setTokOpts]       = useState([]);
  const [loadingTok, setLoadingTok] = useState(false);
  const fetchTokens = useCallback(async () => {
    if (!contractAddress) return;
    setLoadingTok(true);
    setTokOpts(await listLiveTokenIds(contractAddress, undefined, true));
    setLoadingTok(false);
  }, [contractAddress]);
  useEffect(() => { void fetchTokens(); }, [fetchTokens]);

  /*──────── local state ─────*/
  const [tokenId, setTokenId] = useState('');
  const [file,    setFile]    = useState(null);
  const [dataUrl, setDataUrl] = useState('');
  const [meta,    setMeta]    = useState(null);
  const [prep,    setPrep]    = useState(null);         /* { slices, fullHex } */
  const [resume,  setResume]  = useState(null);         /* slice cache */

  /* estimator / batch */
  const [isEstim, setIsEstim]   = useState(false);
  const [estimate, setEstimate] = useState(null);
  const [batches,  setBatches]  = useState(null);
  const [confirm,  setConfirm]  = useState(false);
  const [ov,       setOv]       = useState({ open:false });

  /* housekeeping */
  useEffect(() => { purgeExpiredSliceCache(); }, []);
  useEffect(() => {
    if (!tokenId) { setResume(null); return; }
    setResume(loadSliceCheckpoint(contractAddress, tokenId, 'meta_artifactUri'));
  }, [contractAddress, tokenId]);

  /*──────── metadata loader ─────*/
  const loadMeta = useCallback(async (id) => {
    setMeta(null);
    if (!contractAddress || id === '') return;
    let rows = [];
    try {
      rows = await jFetch(`${API}/tokens?contract=${contractAddress}&tokenId=${id}&limit=1`);
    } catch {/* ignore */}
    const m = rows[0]?.metadata || {};
    setMeta(m);
  }, [contractAddress]);
  useEffect(() => { void loadMeta(tokenId); }, [tokenId, loadMeta]);

  /*──────── file reader ─────*/
  useEffect(() => {
    if (!file) { setDataUrl(''); setPrep(null); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target.result;
      setDataUrl(url);
      const fullHex = `0x${char2Bytes(url)}`;
      setPrep({ fullHex, slices: sliceHex(fullHex) });
    };
    reader.readAsDataURL(file);
  }, [file]);

  /*──────── helpers ─────*/
  const buildFlat = useCallback(async (sliceArr) => {
    const idNat = +tokenId;
    const c     = await toolkit.wallet.at(contractAddress);
    return sliceArr.map((hx) => ({
      kind: OpKind.TRANSACTION,
      ...c.methods.append_token_metadata('artifactUri', idNat, hx).toTransferParams(),
    }));
  }, [toolkit, contractAddress, tokenId]);

  /*──────── main handler ─────*/
  const beginRepair = async (slices, startIdx, fullHex) => {
    setIsEstim(true);
    await new Promise(requestAnimationFrame);
    try {
      const tail  = slices.slice(startIdx);
      const flat  = await buildFlat(tail);
      const { fee, burn } = await estimateChunked(toolkit, flat, 8);
      setEstimate({
        feeTez:     (fee  / 1e6).toFixed(6),
        storageTez: (burn / 1e6).toFixed(6),
      });
      const packed = await splitPacked(toolkit, flat, PACKED_SAFE_BYTES);
      setBatches(packed.length ? packed : [flat]);

      saveSliceCheckpoint(contractAddress, tokenId, 'meta_artifactUri', {
        total: slices.length, next: startIdx, slices, hash: fullHex ? undefined : resume?.hash,
      });
      setConfirm(true);
    } catch (e) { snack(e.message,'error'); }
    finally   { setIsEstim(false); }
  };

  /*──────── CTA click ─────*/
  const handleRepairClick = () => {
    if (!prep) return;
    const { slices: all, fullHex } = prep;
    const { artifactUri } = meta || {};
    const { tail, conflict } = artifactUri
      ? sliceTail(`0x${char2Bytes(artifactUri)}`, fullHex)
      : { tail: all, conflict:false };
    if (conflict) return snack('Conflict – choose correct file','error');
    const startIdx = all.length - tail.length;
    beginRepair(all, startIdx, fullHex);
  };

  const resumeUpload = () => {
    const { next = 0 } = resume || {};
    beginRepair(resume.slices, next, '');
  };

  /*──────── slice runner ─────*/
  const runSlice = useCallback(async (idx = 0) => {
    if (!batches || idx >= batches.length) return;
    setOv({ open:true, status:'Broadcasting…', current:idx+1, total:batches.length });
    try {
      const op = await toolkit.wallet.batch(batches[idx]).send();
      await op.confirmation();
      if (idx + 1 < batches.length) {
        saveSliceCheckpoint(contractAddress, tokenId, 'meta_artifactUri', {
          total: prep.slices.length, next: idx + 1, slices: prep.slices,
        });
        requestAnimationFrame(() => runSlice(idx + 1));
      } else {
        clearSliceCheckpoint(contractAddress, tokenId, 'meta_artifactUri');
        onMutate();
        setOv({ open:true, opHash: op.opHash });
      }
    } catch (e) {
      /* preserve current & total so Retry continues at correct slice */
      setOv({
        open : true,
        error: true,
        status: e.message || String(e),
        current: idx + 1,
        total : batches.length,
      });
    }
  }, [batches, toolkit, contractAddress, tokenId, prep, onMutate]);

  /*──────── guards ─────*/
  const disabled = isEstim || tokenId === '' || !file && !resume;

  /*──────── JSX ─────*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Repair URI (v4a)</PixelHeading>

      {/* token picker */}
      <div style={{ display:'flex', gap:'.5rem' }}>
        <PixelInput
          placeholder="Token‑ID"
          style={{ flex:1 }}
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value.replace(/\D/g,''))}
        />
        <Select>
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
            {tokOpts.map((t) => {
              const id   = typeof t === 'object' ? t.id   : t;
              const name = typeof t === 'object' ? t.name : '';
              return <option key={id} value={id}>{name ? `${id} — ${name}` : id}</option>;
            })}
          </select>
          {loadingTok && <Spinner />}
        </Select>
      </div>

      <HelpBox>
        Re‑uploads a broken <code>artifactUri</code> on a v4a collection.
        Upload the <strong>exact original file</strong>; the UI compares bytes
        and skips already‑stored slices. Interrupted repairs show&nbsp;RESUME.
      </HelpBox>

      {/* upload + meta preview */}
      <div style={{ display:'flex',flexWrap:'wrap',gap:'1rem',marginTop:'.5rem',
                    justifyContent:'space-between' }}>
        <div style={{ flex:'0 1 48%',minWidth:220 }}>
          <MintUpload onFileChange={setFile} />
          {dataUrl && (
            <RenderMedia uri={dataUrl} alt={file?.name}
              style={{ width:'100%', maxHeight:220, margin:'6px auto', objectFit:'contain' }} />
          )}
        </div>
        <div style={{ flex:'0 1 48%',minWidth:240 }}>
          <TokenMetaPanel
            meta={meta} tokenId={tokenId} contractAddress={contractAddress} />
        </div>
      </div>

      {/* CTA */}
      <div style={{ display:'flex', gap:'.6rem', alignItems:'center', marginTop:'.8rem' }}>
        <PixelButton disabled={disabled}
          onClick={resume ? resumeUpload : handleRepairClick}>
          {resume ? 'RESUME' : isEstim ? 'Estimating…' : 'REPAIR'}
        </PixelButton>
        {isEstim && <Spinner style={{ position:'static' }} />}
      </div>

      {/* dialogs */}
      {confirm && (
        <OperationConfirmDialog
          open
          slices={batches?.length || 1}
          estimate={estimate}
          onOk={() => { setConfirm(false); runSlice(0); }}
          onCancel={() => { setConfirm(false); setBatches(null); }}
        />
      )}
      {ov.open && (
        <OperationOverlay
          {...ov}
          onRetry={() => runSlice((ov.current ?? 1) - 1)}
          onCancel={() => { setOv({ open:false }); setBatches(null); }}
        />
      )}
    </Wrap>
  );
}
/* What changed & why:
   • runSlice error‑branch now includes `current` and `total`
     indices so OperationOverlay→Retry continues from the
     last failed slice instead of restarting at 1/4.
   • Checkpoint save in beginRepair now carries hash when
     first‑time build; keeps resume diff‑aware.
   • Rev bump r824; lint‑clean; invariants I60‑I61 honoured. */
/* EOF */
