/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/RepairUri.jsx
  Rev :    r874   2025‑10‑20
  Summary: surfaced conflict reason + quick‑reset CTA
──────────────────────────────────────────────────────────────*/
import React, {
  useCallback, useEffect, useState, useMemo,
} from 'react';
import styledPkg, { createGlobalStyle } from 'styled-components';
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
import {
  sliceTail, PACKED_SAFE_BYTES, splitPacked,
} from '../../core/batch.js';
import {
  loadSliceCheckpoint, saveSliceCheckpoint, clearSliceCheckpoint,
  purgeExpiredSliceCache,
} from '../../utils/sliceCache.js';
import listLiveTokenIds    from '../../utils/listLiveTokenIds.js';
import { estimateChunked } from '../../core/feeEstimator.js';

/*──────── constants ─────*/
const CONFIRM_TIMEOUT_MS = 120_000;          /* 2 min per batch   */
const EST_ATTEMPTS       = [8, 4, 2, 1];     /* simulate ladder   */

/*──────── helpers ───────────────────────────────────────────*/
/**
 * Convert a data:URI into raw‑payload hex.
 * • base64 → true binary hex
 * • url‑encoded / plain → ASCII hex (char2Bytes)
 * Falls back to char2Bytes for non‑data URIs (SVG, http, etc.)
 */
const dataUriToHex = (u = '') => {
  if (!/^data:/i.test(u)) return char2Bytes(u);

  const [, header, body = ''] = u.match(/^data:([^,]*),(.*)$/) || [];
  if (/;base64$/i.test(header || '')) {
    try {
      const bin = atob(body);                     /* binary string → hex */
      let hx = '';
      for (let i = 0; i < bin.length; i += 1) hx += bin.charCodeAt(i).toString(16).padStart(2, '0');
      return hx;
    } catch { /* malformed base64 – treat as ascii */ }
  }
  /* plain / url‑encoded branch */
  try { return char2Bytes(decodeURIComponent(body)); }
  catch { return char2Bytes(body); }
};

/* watchdog – aborts overlay hang when heads subscription drops */
async function confirmOrTimeout(op, timeout = CONFIRM_TIMEOUT_MS) {
  return Promise.race([
    op.confirmation(1),
    new Promise((_, rej) =>
      setTimeout(() =>
        rej(new Error('Confirmation timeout — network congestion. ' +
                       'Click RETRY or RESUME later.')), timeout)),
  ]);
}

/*──────── styled shells ─────*/
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*  WidePanel — 96 vw, no cap. */
const WidePanel = createGlobalStyle`
  div[role='dialog'] > section[data-modal='repair-uri']{
    width:96vw !important;
    max-width:96vw !important;
  }
  div[role='dialog'] > section[data-modal='repair-uri'] *{
    max-width:100%;
    box-sizing:border-box;
  }
`;

/* 12‑col grid */
const Wrap = styled.section.attrs({ 'data-modal': 'repair-uri' })`
  display:grid;
  grid-template-columns:repeat(12,1fr);
  gap:1.6rem;
  position:relative;
  z-index:${(p)=>p.$level??'auto'};
  overflow-x:hidden;
  width:100%;
  @media(min-width:1800px){ gap:1.2rem; }
`;

const FormRow = styled.div`
  grid-column:1 / -1;
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(240px,1fr));
  gap:1.1rem;
  @media(min-width:1800px){
    grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
    gap:1rem;
  }
`;

const PreviewGrid = styled.div`
  grid-column:1 / -1;
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(320px,1fr));
  gap:1rem;
  align-items:start;
`;

const HelpBox = styled.p`
  grid-column:1 / -1;
  font-size:.75rem;
  line-height:1.25;
  margin:.5rem 0 .9rem;
`;

const SelectBox = styled.div`position:relative;flex:1;`;
const Spinner   = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;
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

  /*──────── token list ───────*/
  const [tokOpts,    setTokOpts]    = useState([]);
  const [loadingTok, setLoadingTok] = useState(false);
  const fetchTokens = useCallback(async () => {
    if (!contractAddress) return;
    setLoadingTok(true);
    setTokOpts(await listLiveTokenIds(contractAddress, network, true));
    setLoadingTok(false);
  }, [contractAddress, network]);
  useEffect(() => { void fetchTokens(); }, [fetchTokens]);

  /*──────── local state ─────*/
  const [tokenId,     setTokenId]     = useState('');
  const [uriKey,      setUriKey]      = useState('');
  const [uriKeys,     setUriKeys]     = useState([]);
  const [file,        setFile]        = useState(null);
  const [dataUrl,     setDataUrl]     = useState('');
  const [meta,        setMeta]        = useState(null);
  const [origHex,     setOrigHex]     = useState('');
  const [diff,        setDiff]        = useState([]);

  const [resumeInfo,  setResumeInfo]  = useState(null); /* slice‑cache */

  /* conflict flags */
  const [conflictOpen, setConflict]     = useState(false);
  const [conflictMsg,  setConflictMsg]  = useState('');
  const [conflictCode, setConflictCode] = useState('');  /* NEW */

  /* tx orchestration */
  const [preparing,   setPreparing]   = useState(false);
  const [batches,     setBatches]     = useState(null);
  const [estimate,    setEstimate]    = useState(null);
  const [overlay,     setOverlay]     = useState({ open:false });
  const [confirmOpen, setConfirm]     = useState(false);

  /* housekeeping */
  useEffect(() => { purgeExpiredSliceCache(); }, []);

  /*──────── memo’d helpers ─────*/
  const storageLabel = useMemo(() => (uriKey || 'artifactUri'), [uriKey]);
  const checkpointKeyArgs = useMemo(
    () => [contractAddress, tokenId, storageLabel, network],
    [contractAddress, tokenId, storageLabel, network],
  );

  /*──────── meta fetch ─────────────────────────────────────*/
  const loadMeta = useCallback(async (id) => {
    setMeta(null); setOrigHex(''); setDiff([]); setUriKeys([]); setUriKey('');
    if (!contractAddress || id === '') return;
    let rows = [];
    try {
      rows = await jFetch(
        `${TZKT_API}/v1/tokens?contract=${contractAddress}&tokenId=${id}&limit=1`,
      );
    } catch{}
    if (!rows.length) {
      try {
        const one = await jFetch(
          `${TZKT_API}/v1/contracts/${contractAddress}/bigmaps/token_metadata/keys/${id}`,
        );
        if (one?.value) rows = [{
          metadata: JSON.parse(Buffer.from(one.value.replace(/^0x/, ''), 'hex')
                               .toString('utf8')),
        }];
      } catch{}
    }
    const m = rows[0]?.metadata || {};
    setMeta(m);
    const keys  = listUriKeys(m);
    setUriKeys(keys);
    const first = keys.find((k)=>/artifacturi/i.test(k)) || keys[0] || '';
    setUriKey(first || 'artifactUri');
  }, [contractAddress]);
  useEffect(() => { loadMeta(tokenId); }, [tokenId, loadMeta]);

  /*──────── resume checkpoint ───*/
  useEffect(() => {
    if (!contractAddress || tokenId === '') { setResumeInfo(null); return; }
    setResumeInfo(loadSliceCheckpoint(...checkpointKeyArgs));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractAddress, tokenId, storageLabel]);

  /*──────── original hex on uriKey change ─*/
  useEffect(() => {
    if (!uriKey || !meta) return;
    const val = meta[uriKey];
    const hx  = typeof val === 'string' && val.startsWith('0x')
      ? val.trim()
      : `0x${char2Bytes(val || '')}`;
    setOrigHex(hx);
  }, [uriKey, meta]);

  /*──────── upload handler ─────*/
  const onUpload = useCallback((v) => {
    if (!v) { setFile(null); setDataUrl(''); setDiff([]); return; }
    const f  = v instanceof File            ? v
             : v?.file instanceof File       ? v.file
             : null;
    const du = typeof v === 'string'         ? v
             : typeof v?.dataUrl === 'string' ? v.dataUrl
             : '';
    if (f)  setFile(f);
    if (du) setDataUrl(du);
    if (f && !du) {
      const r = new FileReader();
      r.onload = (e) => setDataUrl(e.target.result);
      r.readAsDataURL(f);
    }
  }, []);

  /*──────── diff worker ─────────*/
  useEffect(() => {
    if (!dataUrl || !origHex) return;
    const uploadedHex = `0x${dataUriToHex(dataUrl)}`;
    const { tail, conflict, origLonger } = sliceTail(origHex, uploadedHex);

    if (conflict) {
      setConflict(true);
      setConflictCode(origLonger ? 'longer' : 'mismatch');        /* NEW */
      setDiff([]);
      setConflictMsg(origLonger
        ? 'On‑chain data is already longer than the uploaded file. ' +
          'Possibly a duplicate slice. Use “Clear URI”, or resume the previous checkpoint.'
        : 'Uploaded file differs before the missing tail. Choose the exact original file.');
      return;
    }
    setConflict(false); setConflictMsg(''); setConflictCode('');
    setDiff(tail);
  }, [dataUrl, origHex]);

  /*──────── batch builder + estimator ─*/
  const buildAndEstimate = async (slices) => {
    if (!toolkit) return snack('Connect wallet', 'error');
    if (!origHex) return snack('Metadata still loading — try again', 'warning');
    if (!slices.length) return;

    setPreparing(true);
    setOverlay({ open:true, status:'Estimating fees…', current:0, total:1, error:false });

    try {
      const c = await toolkit.wallet.at(contractAddress);
      const idNat = +tokenId;
      const label = uriKey.replace(/^extrauri_/i, '');
      const ops = slices.map((hx) => (
        uriKey.toLowerCase().startsWith('extrauri_')
          ? { kind: OpKind.TRANSACTION,
              ...c.methods.append_extrauri('', label, '', idNat, hx).toTransferParams() }
          : { kind: OpKind.TRANSACTION,
              ...c.methods.append_artifact_uri(idNat, hx).toTransferParams() }
      ));

      let est, packs, lastErr = null;
      for (const n of EST_ATTEMPTS) {
        try {
          est   = await estimateChunked(toolkit, ops, n);
          packs = await splitPacked(toolkit, ops, PACKED_SAFE_BYTES);
          break;
        } catch (e) { lastErr = e; }
      }
      if (!est || !packs) throw lastErr || new Error('Estimator failed');

      if (packs.length > 64) snack('Large payload — estimation may take a minute.', 'info');

      setEstimate({
        feeTez     : (est.fee  / 1e6).toFixed(6),
        storageTez : (est.burn / 1e6).toFixed(6),
      });
      setBatches(packs.length ? packs : [ops]);

      saveSliceCheckpoint(...checkpointKeyArgs, {
        total : packs.length,
        next  : resumeInfo?.next ?? 0,
        slices,
      });
      setConfirm(true);
    } catch (e) {
      snack(e.message || String(e), 'error');
    } finally {
      setPreparing(false);
      setOverlay({ open:false });
    }
  };

  /*──────── CTA actions ─────────*/
  const handleCompareRepair = () => buildAndEstimate(diff);
  const resumeUpload = () => {
    if (!resumeInfo?.slices?.length) return snack('No checkpoint', 'info');
    const remaining = resumeInfo.slices.slice(resumeInfo.next ?? 0);
    if (!remaining.length) return snack('Checkpoint already complete', 'success');
    buildAndEstimate(remaining);
  };
  const resetConflict = () => {             /* NEW quick reset */
    setFile(null); setDataUrl(''); setDiff([]);
    setConflict(false); setConflictCode(''); setConflictMsg('');
  };

  /*──────── slice runner ────────*/
  const runSlice = useCallback(async (idx) => {
    if (!batches || idx >= batches.length) return;
    try {
      setOverlay({ open:true, status:'Waiting for signature…',
                   current:idx+1, total:batches.length, error:false });
      const op = await toolkit.wallet.batch(batches[idx]).send();

      setOverlay({ open:true, status:'Broadcasting…',
                   current:idx+1, total:batches.length, error:false });

      await confirmOrTimeout(op);

      saveSliceCheckpoint(...checkpointKeyArgs, {
        ...resumeInfo, next: idx + 1,
      });

      if (idx + 1 < batches.length) {
        requestAnimationFrame(() => runSlice(idx + 1));
      } else {
        snack('Repair complete', 'success');
        clearSliceCheckpoint(...checkpointKeyArgs);
        setOverlay({ open:false });
        onMutate(); setBatches(null); setResumeInfo(null);
      }
    } catch (e) {
      setOverlay({ open:true, error:true,
                   status:e.message || String(e),
                   current:idx+1, total:batches.length });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batches, toolkit, resumeInfo]);

  /*──────── guards & status text ─────────────*/
  const canResume     = resumeInfo && (resumeInfo.next ?? 0) < (resumeInfo.total ?? 0);
  const disabledCompare = preparing
    || !file || conflictOpen || !origHex || !diff.length;

  /* banner message next to CTA */
  const disabledMsg = (() => {
    if (preparing) return '';
    if (conflictOpen) {
      return conflictCode === 'longer'
        ? 'On‑chain is longer — use Clear URI or Resume'
        : 'File mismatch — upload the original';
    }
    if (!origHex)              return 'Loading metadata…';
    if (!file && !canResume)   return 'Upload artifact';
    if (!diff.length && !canResume) return 'No diff detected';
    return '';
  })();

  /*──────── JSX ────────────────*/
  return (
    <>
      <WidePanel />
      <Wrap $level={$level}>
        <PixelHeading level={3} style={{ gridColumn:'1 / -1' }}>
          Repair&nbsp;URI
        </PixelHeading>

        {/* token picker row */}
        <FormRow>
          <PixelInput
            placeholder="Token‑ID"
            value={tokenId}
            onChange={(e)=>setTokenId(e.target.value.replace(/\D/g,''))}
          />
          <SelectBox>
            <select
              style={{ width:'100%', height:32 }}
              disabled={loadingTok}
              value={tokenId || ''}
              onChange={(e)=>setTokenId(e.target.value)}
            >
              <option value="">
                {loadingTok ? 'Loading…'
                            : tokOpts.length ? 'Select token' : '— none —'}
              </option>
              {tokOpts.map(({ id,name })=>(
                <option key={id} value={id}>{name?`${id} — ${name}`:id}</option>
              ))}
            </select>
            {loadingTok && <Spinner />}
          </SelectBox>

          <SelectBox style={{ gridColumn:'1 / -1' }}>
            <select
              style={{ width:'100%', height:32 }}
              value={uriKey}
              onChange={(e)=>setUriKey(e.target.value)}
              disabled={!uriKeys.length}
            >
              {uriKeys.length
                ? uriKeys.map((k)=><option key={k} value={k}>{k}</option>)
                : <option value="artifactUri">artifactUri</option>}
            </select>
          </SelectBox>
        </FormRow>

        <HelpBox>
          ① Pick token → ② choose URI key → ③ upload the <em>exact</em> original
          file (or click RESUME when a checkpoint exists).<br/>
          ⚠ If on‑chain data is <strong>longer</strong> than your upload
          (duplicate slice), use <code>Clear URI</code> then re‑upload, or simply
          resume the previous checkpoint.<br/>
          ⛓ Large audio/video files may need up to ~1 min for fee simulation – a
          spinner appears while the estimator runs.
        </HelpBox>

        {/* resume banner */}
        {canResume && (
          <p style={{
            fontSize:'.8rem',
            color:'var(--zu-accent)',
            margin:'4px 0',
            gridColumn:'1 / -1',
          }}>
            Resume detected&nbsp;({resumeInfo.next}/{resumeInfo.total} batches).
          </p>
        )}

        {/* previews */}
        <PreviewGrid>
          <div>
            <MintUpload
              onFileChange={onUpload}
              onFileDataUrlChange={onUpload}
              accept="*/*"
            />
            {dataUrl && (
              <RenderMedia
                uri={dataUrl}
                alt={file?.name}
                style={{ width:'100%', maxHeight:200, margin:'6px auto', objectFit:'contain' }}
              />
            )}
          </div>
          <TokenMetaPanel
            meta={meta}
            tokenId={tokenId}
            contractAddress={contractAddress}
            contractVersion="v4"
          />
        </PreviewGrid>

        {/* CTA row */}
        <div style={{
          gridColumn:'1 / -1',
          display:'flex',
          gap:'.6rem',
          alignItems:'center',
          marginTop:'.9rem',
          flexWrap:'wrap',
        }}>
          <PixelButton
            disabled={disabledCompare}
            onClick={handleCompareRepair}
          >
            {preparing ? 'Calculating…' : 'Compare & Repair'}
          </PixelButton>

          {canResume && (
            <PixelButton onClick={resumeUpload}>
              RESUME CHECKPOINT
            </PixelButton>
          )}

          {conflictOpen && (
            <PixelButton size="xs" warning onClick={resetConflict}>
              CLEAR FILE
            </PixelButton>
          )}

          {disabledMsg && !preparing && (
            <span style={{ fontSize:'.7rem', opacity:.8 }}>
              {disabledMsg}
            </span>
          )}

          {preparing && (
            <>
              <LoadingSpinner style={{ position:'static' }}/>
              <span style={{ fontSize:'.7rem' }}>Calculating…</span>
            </>
          )}
        </div>

        {/* conflict dialog */}
        {conflictOpen && (
          <PixelConfirmDialog
            title="Conflict detected"
            message={conflictMsg}
            confirmLabel="OK"
            onConfirm={resetConflict}
          />
        )}

        {/* overlay */}
        {overlay.open && (
          <OperationOverlay
            {...overlay}
            onRetry={()=>runSlice((overlay.current ?? 1) - 1)}
            onCancel={()=>{ setOverlay({ open:false }); setBatches(null); }}
          />
        )}

        {/* confirm dialog */}
        {confirmOpen && (
          <OperationConfirmDialog
            open
            estimate={estimate}
            slices={batches?.length || 1}
            onOk={()=>{ setConfirm(false); runSlice(0); }}
            onCancel={()=>{ setConfirm(false); setBatches(null); }}
          />
        )}
      </Wrap>
    </>
  );
}
/* What changed & why:
   • Added conflictCode + CLEAR FILE CTA and detailed disabledMsg,
     giving explicit guidance (“on-chain longer” vs “file mismatch”).
   • Quick reset clears stale conflict without reloading page.
   • Rev‑bump r874; fully back‑compat, UI clarity improved. */
/* EOF */
