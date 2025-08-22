/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/RepairUriV4a.jsx
  Rev :    r831   2025‑08‑17
  Summary: dropdown now lists *only* tokens the connected
           wallet appears in `metadata.creators`; retains
           watchdog, diff diagnostics, dynamic storageLimit,
           packed batching, and uri‑key picker.
──────────────────────────────────────────────────────────────*/
import React, {
  useCallback, useEffect, useState, useMemo,
} from 'react';
import styledPkg           from 'styled-components';
import { char2Bytes }      from '@taquito/utils';

import PixelHeading        from '../PixelHeading.jsx';
import PixelButton         from '../PixelButton.jsx';
import PixelInput          from '../PixelInput.jsx';
import MintUpload          from './MintUpload.jsx';
import LoadingSpinner      from '../LoadingSpinner.jsx';
import OperationOverlay    from '../OperationOverlay.jsx';
import OperationConfirmDialog from '../OperationConfirmDialog.jsx';
import PixelConfirmDialog  from '../PixelConfirmDialog.jsx';
import RenderMedia         from '../../utils/RenderMedia.jsx';
import TokenMetaPanel      from '../TokenMetaPanel.jsx';

import {
  sliceTail, splitPacked, PACKED_SAFE_BYTES, buildAppendTokenMetaCalls,
} from '../../core/batchV4a.js';
import {
  loadSliceCheckpoint, saveSliceCheckpoint,
  clearSliceCheckpoint, purgeExpiredSliceCache,
} from '../../utils/sliceCacheV4a.js';
import listLiveTokenIds    from '../../utils/listLiveTokenIds.js';
import { listUriKeys }     from '../../utils/uriHelpers.js';
import { estimateChunked } from '../../core/feeEstimator.js';
import { jFetch }          from '../../core/net.js';
import { TZKT_API }        from '../../config/deployTarget.js';
import { useWalletContext } from '../../contexts/WalletContext.js';

/*──────── constants ─────*/
const CONFIRM_TIMEOUT_MS = 120_000;
const CHUNK              = 80;            /* ids per filter‑query        */

/*──────── watchdog ─────*/
async function confirmOrTimeout(op, timeout = CONFIRM_TIMEOUT_MS) {
  return Promise.race([
    op.confirmation(1),
    new Promise((_, rej) =>
      setTimeout(
        () => rej(new Error(
          'Confirmation timeout — network congestion. Click RETRY or RESUME later.',
        )), timeout)),
  ]);
}

/*──────── styled shells ─────*/
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap      = styled.section`margin-top:1.5rem;`;
const SelectBox = styled.div`flex:1;position:relative;`;
const Spinner   = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;`;
const HelpBox   = styled.p`
  font-size:.75rem;line-height:1.25;margin:.5rem 0 .9rem;`;

/*════════ component ════════════════════════════════════════*/
export default function RepairUriV4a({
  contractAddress,
  setSnackbar = () => {},
  onMutate    = () => {},
  $level,
}) {
  const {
    toolkit,
    network = 'ghostnet',
    address: walletAddress,
  } = useWalletContext() || {};
  const snack = (m, s = 'info') =>
    setSnackbar({ open:true, message:m, severity:s });

  /* token list */
  const [tokOpts, setTokOpts]       = useState([]);
  const [loadingTok, setLoadingTok] = useState(false);
  const fetchTokens = useCallback(async () => {
    if (!contractAddress) return;
    setLoadingTok(true);

    /* step‑1: base list (ids + names) */
    let base = await listLiveTokenIds(contractAddress, network, true);

    /* step‑2: filter to tokens whose `metadata.creators`
       array includes the connected wallet.  If wallet not
       connected we keep the full list (read‑only browse).   */
    if (walletAddress && base.length) {
      const api = `${TZKT_API}/v1`;
      const mine = [];

      for (let i = 0; i < base.length; i += CHUNK) {
        const sliceIds = base.slice(i, i + CHUNK).map((t) => t.id);
        const rows = await jFetch(
          `${api}/tokens`
          + `?contract=${contractAddress}`
          + `&tokenId.in=${sliceIds.join(',')}`
          + '&select=tokenId,metadata.name,metadata.creators'
          + `&limit=${sliceIds.length}`,
        ).catch(() => []);

        rows.forEach((r) => {
          const creators = r['metadata.creators'] || [];
          const id       = +r.tokenId;
          const nm       = r['metadata.name'] ?? `Token ${id}`;
          const match =
            Array.isArray(creators)
              ? creators.some((c) =>
                  String(c).toLowerCase() === walletAddress.toLowerCase())
              : typeof creators === 'string'
                  && creators.toLowerCase().includes(walletAddress.toLowerCase());

          if (match) mine.push({ id, name: nm.slice(0, 40) });
        });
      }
      base = mine;
    }

    base.sort((a, b) => a.id - b.id);
    setTokOpts(base);
    setLoadingTok(false);
  }, [contractAddress, network, walletAddress]);
  useEffect(() => { void fetchTokens(); }, [fetchTokens]);

  /* local state */
  const [tokenId,  setTokenId ]  = useState('');
  const [uriKey,   setUriKey  ]  = useState('');
  const [uriKeys,  setUriKeys ]  = useState([]);
  const [file,     setFile    ]  = useState(null);
  const [dataUrl,  setDataUrl ]  = useState('');
  const [meta,     setMeta    ]  = useState(null);
  const [origHex,  setOrigHex ]  = useState('');
  const [diff,     setDiff    ]  = useState([]);

  /* resume checkpoint */
  const [resumeInfo, setResumeInfo] = useState(null);

  /* tx prep / overlay */
  const [preparing,  setPreparing ] = useState(false);
  const [batches,    setBatches   ] = useState(null);
  const [estimate,   setEstimate  ] = useState(null);
  const [overlay,    setOverlay   ] = useState({ open:false });
  const [confirmOpen,setConfirm   ] = useState(false);

  /* conflict dialog */
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictMsg,  setConflictMsg ] = useState('');

  /* housekeeping */
  useEffect(() => { purgeExpiredSliceCache(); }, []);

  /* derived */
  const storageLabel = useMemo(
    () => (uriKey || 'artifactUri'),
    [uriKey],
  );
  const checkpointArgs = useMemo(
    () => [contractAddress, tokenId, storageLabel, network],
    [contractAddress, tokenId, storageLabel, network],
  );

  /*──── meta fetch ─*/
  const loadMeta = useCallback(async (id) => {
    setMeta(null); setOrigHex(''); setDiff([]); setUriKeys([]); setUriKey('');
    if (!contractAddress || id === '') return;
    let rows = [];
    try {
      rows = await jFetch(
        `${TZKT_API}/v1/tokens?contract=${contractAddress}&tokenId=${id}&limit=1`,
      );
    } catch {/* ignore */}
    const m = rows[0]?.metadata || {};
    setMeta(m);
    const keys = listUriKeys(m);
    setUriKeys(keys);
    const first = keys.find((k) => /artifacturi/i.test(k)) || keys[0] || '';
    setUriKey(first || 'artifactUri');
  }, [contractAddress]);
  useEffect(() => { void loadMeta(tokenId); }, [tokenId, loadMeta]);

  /* resume checkpoint fetch */
  useEffect(() => {
    let active = true;
    if (!contractAddress || tokenId === '') { setResumeInfo(null); return undefined; }
    loadSliceCheckpoint(...checkpointArgs).then((r) => {
      if (active) setResumeInfo(r);
    });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractAddress, tokenId, storageLabel]);

  /* load original hex */
  useEffect(() => {
    if (!uriKey || !meta) return;
    const val = meta[uriKey];
    const hx  = typeof val === 'string' && val.startsWith('0x')
      ? val.trim()
      : `0x${char2Bytes(val || '')}`;
    setOrigHex(hx);
  }, [uriKey, meta]);

  /* upload handler */
  const onUpload = useCallback((v) => {
    if (!v) { setFile(null); setDataUrl(''); return; }

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

  /* diff calc */
  useEffect(() => {
    if (!dataUrl || !origHex) return;
    const { tail, conflict, origLonger } =
      sliceTail(origHex, `0x${char2Bytes(dataUrl)}`);

    if (conflict) {
      setConflictOpen(true);
      setDiff([]);
      setConflictMsg(
        origLonger
          ? 'On‑chain data is already longer than the uploaded file. ' +
            'A duplicate or garbage slice was likely appended earlier. ' +
            'Use “Clear URI” (or Update Token Metadata) to replace the value.'
          : 'Uploaded file differs before missing tail. Pick the exact original file.',
      );
      return;
    }
    setConflictOpen(false);
    setConflictMsg('');
    setDiff(tail);
  }, [dataUrl, origHex]);

  /* estimator & batch builder */
  const buildAndEstimate = async (slices) => {
    if (!toolkit) return snack('Connect wallet', 'error');
    if (!slices.length) return;
    setPreparing(true);
    try {
      const flat = await buildAppendTokenMetaCalls(
        toolkit,
        contractAddress,
        storageLabel,
        +tokenId,
        slices,
      );

      const est = await estimateChunked(toolkit, flat, 8);
      setEstimate({
        feeTez    : (est.fee  / 1e6).toFixed(6),
        storageTez: (est.burn / 1e6).toFixed(6),
      });

      const packs = await splitPacked(toolkit, flat, PACKED_SAFE_BYTES);
      setBatches(packs.length ? packs : [flat]);

      await saveSliceCheckpoint(...checkpointArgs, {
        total : packs.length,
        next  : resumeInfo?.next ?? 0,
        slices,
      });

      setConfirm(true);
    } catch (e) { snack(e.message, 'error'); }
    finally   { setPreparing(false); }
  };

  /* CTA handlers */
  const handleCompareRepair = () => buildAndEstimate(diff);
  const resumeUpload        = () => {
    if (!resumeInfo?.slices?.length) return snack('No checkpoint', 'info');
    const tail = resumeInfo.slices.slice(resumeInfo.next ?? 0);
    if (!tail.length) return snack('Checkpoint already complete', 'success');
    buildAndEstimate(tail);
  };

  /* slice executor */
  const runSlice = useCallback(async (idx) => {
    if (!batches || idx >= batches.length) return;
    try {
      setOverlay({ open:true, status:'Waiting for signature…',
                   current:idx+1, total:batches.length, error:false });
      const op = await toolkit.wallet.batch(batches[idx]).send();

      setOverlay({ open:true, status:'Broadcasting…',
                   current:idx+1, total:batches.length, error:false });

      await confirmOrTimeout(op);

      // Persist progress and update local resumeInfo to reflect the
      // completed batch. Without updating resumeInfo state, the next
      // retry would reset to the first batch. See issue #retryReset.
      await saveSliceCheckpoint(...checkpointArgs, {
        ...resumeInfo,
        next: idx + 1,
      });
      setResumeInfo((prev) => (
        prev ? { ...prev, next: idx + 1 } : { next: idx + 1, total: batches.length }
      ));

      if (idx + 1 < batches.length) {
        requestAnimationFrame(() => runSlice(idx + 1));
      } else {
        await clearSliceCheckpoint(...checkpointArgs);
        setOverlay({ open:false });
        setBatches(null);
        setResumeInfo(null);
        snack('Repair complete', 'success');
        onMutate();
      }
    } catch (e) {
      setOverlay({ open:true, error:true,
                   status:e.message || String(e),
                   current:idx+1, total:batches.length });
    }
  }, [batches, toolkit, checkpointArgs, resumeInfo, onMutate]);

  /* guards */
  const disabled = preparing
    || (!file && !dataUrl && !resumeInfo)
    || !tokenId
    || !origHex
    || conflictOpen;

  /*──────── JSX ─*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Repair URI (v4a/v4c)</PixelHeading>

      {/* token picker */}
      <div style={{ display:'flex', gap:'.6rem' }}>
        <PixelInput
          placeholder="Token‑ID"
          style={{ flex:1 }}
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value.replace(/\D/g,''))}
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
      <div style={{ display:'flex', gap:'.6rem', marginTop:'.4rem' }}>
        <SelectBox>
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
        ① Pick token → ② choose URI key → ③ upload the <em>exact</em> original
        file. Missing bytes will be appended automatically.<br/>
        ⚠ If on‑chain bytes are <strong>longer</strong> than your upload
        (duplicate slice), you will have to clear the uri with the proper update_token_metadata entrypoint for ZeroTerminal minted tokens<br/>
        ⛓ Repairs are chunked; a watchdog aborts if confirmation exceeds&nbsp;2 min,
        allowing safe RETRY / RESUME.
      </HelpBox>

      {/* resume banner */}
      {resumeInfo && !file && (
        <p style={{ fontSize:'.8rem', color:'var(--zu-accent)', margin:'4px 0' }}>
          Resume detected ({resumeInfo.next}/{resumeInfo.total} batches pending).
          <PixelButton size="xs" style={{ marginLeft:6 }} onClick={resumeUpload}>
            RESUME
          </PixelButton>
        </p>
      )}

      {/* preview panes */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'1rem',
                    justifyContent:'space-between' }}>
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
            contractVersion="v4a"           /* NEW */
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
        {preparing && <LoadingSpinner style={{ position:'static' }} />}
      </div>

      {/* conflict dialog */}
      {conflictOpen && (
        <PixelConfirmDialog
          title="Conflict detected"
          message={conflictMsg}
          confirmLabel="OK"
          onConfirm={() => {
            setConflictOpen(false);
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
          slices={batches?.length || 1}
          estimate={estimate}
          onOk={() => { setConfirm(false); runSlice(0); }}
          onCancel={() => { setConfirm(false); setBatches(null); }}
        />
      )}
    </Wrap>
  );
}
/* EOF */
