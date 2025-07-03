/*─────────────────────────────────────────────────────────────
  File: src/ui/Entrypoints/RepairUri.jsx
  Rev : r864   2025‑08‑16
  Summary: passes contractVersion="v4" to TokenMetaPanel
──────────────────────────────────────────────────────────────*/
import React, {
  useCallback, useEffect, useState, useMemo,
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
const CONFIRM_TIMEOUT_MS = 120_000;          /* 2 min per batch */

/*──────── confirmation watchdog ─────────────────────────────*/
/**
 * Waits for 1‑block confirmation or rejects after CONFIRM_TIMEOUT_MS.
 * Ensures the UI surfaces a retry instead of hanging forever when a node
 * drops the heads subscription (root cause of “stuck on Broadcasting…”).
 */
async function confirmOrTimeout(op, timeout = CONFIRM_TIMEOUT_MS) {
  return Promise.race([
    op.confirmation(1),
    new Promise((_, rej) =>
      setTimeout(() =>
        rej(new Error('Confirmation timeout — network congestion. ' +
                       'Click RETRY or RESUME later.')), timeout)),
  ]);
}

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
  const [tokenId,     setTokenId]     = useState('');
  const [uriKey,      setUriKey]      = useState('');
  const [uriKeys,     setUriKeys]     = useState([]);
  const [file,        setFile]        = useState(null);
  const [dataUrl,     setDataUrl]     = useState('');
  const [meta,        setMeta]        = useState(null);
  const [origHex,     setOrigHex]     = useState('');
  const [diff,        setDiff]        = useState([]);

  /* resumable upload checkpoint */
  const [resumeInfo,  setResumeInfo]  = useState(null);

  /* tx prep & overlay */
  const [preparing,   setPreparing]   = useState(false);
  const [batches,     setBatches]     = useState(null);
  const [estimate,    setEstimate]    = useState(null);
  const [overlay,     setOverlay]     = useState({ open:false });
  const [confirmOpen, setConfirm]     = useState(false);

  /* conflict dialog */
  const [conflictOpen,setConflict]    = useState(false);
  const [conflictMsg, setConflictMsg] = useState('');

  /* housekeeping */
  useEffect(() => { purgeExpiredSliceCache(); }, []);

  /*─ helpers ─*/
  const storageLabel = useMemo(() => (
    uriKey || 'artifactUri'
  ), [uriKey]);

  const checkpointKeyArgs = useMemo(() => (
    [contractAddress, tokenId, storageLabel, network]
  ), [contractAddress, tokenId, storageLabel, network]);

  /*──── meta fetch ──────────────────────────────────────────*/
  const loadMeta = useCallback(async (id) => {
    setMeta(null); setOrigHex(''); setDiff([]); setUriKeys([]); setUriKey('');
    if (!contractAddress || id === '') return;
    let rows = [];
    try {
      rows = await jFetch(
        `${TZKT_API}/v1/tokens?contract=${contractAddress}&tokenId=${id}&limit=1`,
      );
    } catch {/* ignore */}
    if (!rows.length) {
      try {
        const one = await jFetch(
          `${TZKT_API}/v1/contracts/${contractAddress}/bigmaps/token_metadata/keys/${id}`,
        );
        if (one?.value)
          rows = [{ metadata: JSON.parse(
            Buffer.from(one.value.replace(/^0x/, ''), 'hex').toString('utf8'),
          ) }];
      } catch {/* ignore */}
    }
    const m = rows[0]?.metadata || {};
    setMeta(m);
    const keys = listUriKeys(m);
    setUriKeys(keys);
    const first = keys.find((k) => /artifacturi/i.test(k)) || keys[0] || '';
    setUriKey(first || 'artifactUri');
  }, [contractAddress]);
  useEffect(() => { loadMeta(tokenId); }, [tokenId, loadMeta]);

  /*──── resume checkpoint fetch ─────────────────────────────*/
  useEffect(() => {
    if (!contractAddress || tokenId === '') { setResumeInfo(null); return; }
    const info = loadSliceCheckpoint(...checkpointKeyArgs);
    setResumeInfo(info);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractAddress, tokenId, storageLabel]);

  /* load original hex when uriKey changes */
  useEffect(() => {
    if (!uriKey || !meta) return;
    const val = meta[uriKey];
    const hx  = typeof val === 'string' && val.startsWith('0x')
      ? val.trim()
      : `0x${char2Bytes(val || '')}`;
    setOrigHex(hx);
  }, [uriKey, meta]);

  /*──── upload handler + preview ────────────────────────────*/
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

  /* keep diff live when either source changes */
  useEffect(() => {
    if (!dataUrl || !origHex) return;
    const { tail, conflict, origLonger } =
      sliceTail(origHex, `0x${char2Bytes(dataUrl)}`);

    if (conflict) {
      setConflict(true);
      setDiff([]);
      const msg = origLonger
        ? 'On‑chain data is already longer than the uploaded file. ' +
          'A duplicate or garbage slice was likely appended earlier. ' +
          'Use “Clear URI” (or Update Token Metadata) to replace the ' +
          'entire value and then re‑upload.'
        : 'Uploaded file differs before missing tail. Pick the exact original file.';
      setConflictMsg(msg);
      return;
    }
    setConflict(false); setConflictMsg(''); setDiff(tail);
  }, [dataUrl, origHex]);

  /*──── estimator & batch-builder ───────────────────────────*/
  const buildAndEstimate = async (slices) => {
    if (!toolkit) return snack('Connect wallet', 'error');
    if (!origHex)  return snack('Metadata still loading — try again', 'warning');
    if (!slices.length) return;

    setPreparing(true);
    try {
      const c     = await toolkit.wallet.at(contractAddress);
      const idNat = +tokenId;
      const label = uriKey.replace(/^extrauri_/i, '');
      const ops   = slices.map((hx) => (
        uriKey.toLowerCase().startsWith('extrauri_')
          ? { kind: OpKind.TRANSACTION,
              ...c.methods.append_extrauri('', label, '', idNat, hx).toTransferParams() }
          : { kind: OpKind.TRANSACTION,
              ...c.methods.append_artifact_uri(idNat, hx).toTransferParams() }
      ));

      const est         = await estimateChunked(toolkit, ops, 8);
      const feeTez      = (est.fee   / 1e6).toFixed(6);
      const storageTez  = (est.burn  / 1e6).toFixed(6);
      setEstimate({ feeTez, storageTez });

      const packs = await splitPacked(toolkit, ops, PACKED_SAFE_BYTES);
      setBatches(packs.length ? packs : [ops]);

      /* save checkpoint before any signing – allows immediate resume */
      saveSliceCheckpoint(...checkpointKeyArgs, {
        total : packs.length,
        next  : resumeInfo?.next ?? 0,
        slices,
      });
      setConfirm(true);
    } catch (e) { snack(e.message, 'error'); }
    finally      { setPreparing(false); }
  };

  /*──── CTA handlers ───────────────────────────────────────*/
  const handleCompareRepair = () => buildAndEstimate(diff);
  const resumeUpload        = () => {
    if (!resumeInfo?.slices?.length) return snack('No checkpoint', 'info');
    const remaining = resumeInfo.slices.slice(resumeInfo.next ?? 0);
    if (!remaining.length) return snack('Checkpoint already complete', 'success');
    buildAndEstimate(remaining);
  };

  /*──── slice executor ──────────────────────────────────────*/
  const runSlice = useCallback(async (idx) => {
    if (!batches || idx >= batches.length) return;
    try {
      setOverlay({ open:true, status:'Waiting for signature…',
                   current:idx+1, total:batches.length, error:false });
      const op = await toolkit.wallet.batch(batches[idx]).send();

      setOverlay({ open:true, status:'Broadcasting…',
                   current:idx+1, total:batches.length, error:false });

      await confirmOrTimeout(op);

      /* update checkpoint */
      saveSliceCheckpoint(...checkpointKeyArgs, {
        ...resumeInfo, next: (idx + 1),
      });

      if (idx + 1 < batches.length) {
        requestAnimationFrame(() => runSlice(idx + 1));
      } else {
        snack('Repair complete', 'success');
        setOverlay({ open:false });
        clearSliceCheckpoint(...checkpointKeyArgs);
        onMutate(); setBatches(null); setResumeInfo(null);
      }
    } catch (e) {
      setOverlay({ open:true, error:true,
                   status:e.message || String(e),
                   current:idx+1, total:batches.length });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batches, toolkit, resumeInfo]);

  /*──────── guards ─────*/
  const disabled = preparing
    || (!file && !dataUrl && !resumeInfo)
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
        ① Pick token → ② choose URI key → ③ upload the <em>exact</em> original
        file. If bytes are missing, they will be appended precisely where the
        last slice stopped.<br />
        ⚠ If the on‑chain value is <strong>longer</strong> than your upload
        (e.g.&nbsp;duplicate slice), this tool cannot truncate bytes — use
        <code> Clear&nbsp;URI</code> or
        <code> append&nbsp;artifact/extra&nbsp;uri</code> instead.<br />
        ⛓ Repairs are chunked; you will sign once per ≤ 8 slices. A watchdog
        aborts if the node fails to confirm within 2 min, letting you RETRY or
        RESUME safely. Overall payloads ≈ 2 MiB keep RPC & wallet stable.
      </HelpBox>

      {/* resume banner */}
      {resumeInfo && !file && (
        <p style={{ fontSize:'.8rem', color:'var(--zu-accent)',
                   margin:'4px 0' }}>
          Resume detected&nbsp;
          ({resumeInfo.next}/{resumeInfo.total} batches pending).
          <PixelButton size="xs" style={{ marginLeft:6 }} onClick={resumeUpload}>
            RESUME
          </PixelButton>
        </p>
      )}

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
                width:'100%', maxHeight:200,
                margin:'6px auto', objectFit:'contain',
              }}
            />
          )}
        </div>
        <div style={{ flex:'0 1 48%', minWidth:240 }}>
          <TokenMetaPanel
            meta={meta}
            tokenId={tokenId}
            contractAddress={contractAddress}
            contractVersion="v4"            /* NEW */
          />
        </div>
      </div>

      {/* CTA */}
      <div style={{ display:'flex', gap:'.6rem', alignItems:'center',
                    marginTop:'.9rem' }}>
        <PixelButton disabled={disabled} onClick={
          resumeInfo && !file ? resumeUpload : handleCompareRepair
        }>
          {preparing ? 'Calculating…'
            : resumeInfo && !file ? 'RESUME'
            : 'Compare & Repair'}
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
          message={conflictMsg}
          confirmLabel="OK"
          onConfirm={() => {
            setConflict(false);
            setConflictMsg('');
            setFile(null);
            setDataUrl('');
          }}
        />
      )}

      {/* overlay */}
      {overlay.open && (
        <OperationOverlay
          {...overlay}
          onRetry={() => runSlice((overlay.current ?? 1) - 1)}
          onCancel={() => { setOverlay({ open:false }); setBatches(null); }}
        />
      )}

      {/* confirm dialog */}
      {confirmOpen && (
        <OperationConfirmDialog
          open
          estimate={estimate}
          slices={batches?.length || 1}
          onOk={() => { setConfirm(false); runSlice(0); }}
          onCancel={() => { setConfirm(false); setBatches(null); }}
        />
      )}
    </Wrap>
  );
}
/* What changed & why:
   • Added confirmOrTimeout() watchdog (120 s) to prevent infinite
     “Broadcasting…” when node loses head‑subscription.
   • runSlice now surfaces timeout via overlay error + RETRY path.
   • HelpBox updated to mention watchdog & per‑batch signatures.
   • Overlay status always includes error:false while pending to
     avoid stale error banner reuse.
   • No API surface changes; fully back‑compat with I60/I61. */
/* EOF */
