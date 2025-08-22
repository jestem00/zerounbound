/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/RepairUri.jsx
  Rev :    r936   2025-07-14
  Summary: refined currentBytesList calc
──────────────────────────────────────────────────────────────*/
import React, {
  useCallback, useEffect, useState, useMemo, useRef,
} from 'react';
import styledPkg from 'styled-components';
import { OpKind } from '@taquito/taquito';
import { Buffer } from 'buffer';

import PixelHeading from '../PixelHeading.jsx';
import PixelInput from '../PixelInput.jsx';
import PixelButton from '../PixelButton.jsx';
import MintUpload from './MintUpload.jsx';
import OperationOverlay from '../OperationOverlay.jsx';
import OperationConfirmDialog from '../OperationConfirmDialog.jsx';
import PixelConfirmDialog from '../PixelConfirmDialog.jsx';
import RenderMedia from '../../utils/RenderMedia.jsx';
import TokenMetaPanel from '../TokenMetaPanel.jsx';
import LoadingSpinner from '../LoadingSpinner.jsx';
import IntegrityBadge from '../IntegrityBadge.jsx';

import { char2Bytes } from '@taquito/utils';
import { jFetch } from '../../core/net.js';
import { useWalletContext } from '../../contexts/WalletContext.js';
import {
  sliceTail,
  splitPacked,
  SLICE_MAX_BYTES,
  SLICE_MIN_BYTES,
  PACKED_SAFE_BYTES,
} from '../../core/batch.js';
import {
  loadSliceCheckpoint, saveSliceCheckpoint, clearSliceCheckpoint,
  purgeExpiredSliceCache,
} from '../../utils/sliceCache.js';
import listLiveTokenIds from '../../utils/listLiveTokenIds.js';
import { estimateChunked, HARD_GAS_LIMIT, HARD_STORAGE_LIMIT, isSimTimeout } from '../../core/feeEstimator.js';
import { mimeFromFilename, preferredExt } from '../../constants/mimeTypes.js';
import { listUriKeys, mimeFromDataUri } from '../../utils/uriHelpers.js';
import { checkOnChainIntegrity } from '../../utils/onChainValidator.js';

/*──────── constants ─────*/
const CONFIRM_TIMEOUT_MS = 120_000;          /* 2 min per batch   */
const POLL_ATTEMPTS = 3;                     /* TzKT polls on timeout */
const POLL_INTERVAL_MS = 5000;               /* 5 s between polls */

const WARN_MB = 1.5;
const WARN_BYTES = WARN_MB * 1024 * 1024;

const WARN_TEXT = `Files beyond ${WARN_MB}MB are experimental, attempt at your own risk, and only if you know what you are doing. Flaws, failures, and interruptions are highly likely and you could lose tezos if the file becomes corrupted in any way. Our repair_uri function can attempt to pick up where the last slice left off, but that is not guaranteed.`;

/*──────── helpers ───────────────────────────────────────────*/
/**
 * Convert a full data:URI string into hex of its bytes.
 * Always encodes the entire URI as string (no base64 decode).
 * Falls back to char2Bytes for non-data URIs.
 */
const dataUriToHex = (u = '') => char2Bytes(u);

/* watchdog – aborts overlay hang when heads subscription drops */
async function confirmOrTimeout(op, timeout = CONFIRM_TIMEOUT_MS) {
  return Promise.race([
    op.confirmation(1),
    new Promise((_, rej) =>
      setTimeout(() =>
        rej(new Error('Confirmation timeout — network congestion. ' +
                       'Click RETRY or RESUME later.')), timeout)),
  ]);
}

/* poll TzKT for op inclusion after timeout */
async function pollOpStatus(opHash, TZKT_API) {
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    try {
      const res = await jFetch(`${TZKT_API}/v1/operations/${opHash}`);
      if (res?.length && res[0]?.status === 'applied') return true;
    } catch {}
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

/*──────── debounce hook ─────*/
function useDebounce(value, delay = 500) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

/*──────── styled shells ─────*/
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/* 12-col grid */
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

const StatusSpan = styled.span`
  font-size:.7rem;
  opacity:.8;
  color: ${props => props.error ? 'var(--zu-error)' : 'var(--zu-accent)'};
`;

/*════════ component ════════════════════════════════════════*/
export default function RepairUri({
  contractAddress,
  setSnackbar = () => {},
  onMutate    = () => {},
  $level,
  contractVersion = '',
}) {
  const { toolkit, network = 'ghostnet' } = useWalletContext() || {};
  const TZKT_API = `https://api.${network}.tzkt.io`;
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
  const [fullHex,     setFullHex]     = useState('');
  const [tail,        setTail]        = useState('');
  const [integrity,   setIntegrity]   = useState({ status: 'unknown', score: 0, reasons: [] });

  const [resumeInfo,  setResumeInfo]  = useState(null); /* slice-cache */

  /* conflict flags */
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictMsg,  setConflictMsg]  = useState('');
  const [conflictCode, setConflictCode] = useState('');

  /* tx orchestration */
  const [preparing,   setPreparing]   = useState(false);
  const [batches,     setBatches]     = useState(null);
  const [estimate,    setEstimate]    = useState(null);
  const [overlay,     setOverlay]     = useState({ open:false });
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [force, setForce] = useState(false);
  const [status, setStatus] = useState('');
  const [statusError, setStatusError] = useState(false);
  const [isDebug, setIsDebug] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [sliceSize, setSliceSize] = useState(SLICE_MAX_BYTES);
  const metaCache = useRef(new Map());

  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const pendingFile = useRef(null);

  const debouncedTokenId = useDebounce(tokenId, 500);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsDebug(new URLSearchParams(window.location.search).get('debug') === '1');
    }
  }, []);

  /* housekeeping */
  useEffect(() => { purgeExpiredSliceCache(); }, []);

  /*──────── memo’d helpers ─────*/
  const storageLabel = useMemo(() => (uriKey || 'artifactUri'), [uriKey]);
  const checkpointKeyArgs = useMemo(
    () => [contractAddress, tokenId, storageLabel, network],
    [contractAddress, tokenId, storageLabel, network],
  );


  const warnMany = tail.length > 50;

  /*──────── meta fetch ─────────────────────────────────────*/
  const loadMeta = useCallback(async (id) => {
    setMeta(null); setOrigHex(''); setTail(''); setUriKeys([]); setUriKey('');
    setIsLoadingMeta(true);
    if (!contractAddress || id === '') { setIsLoadingMeta(false); return; }
    const cacheKey = `${contractAddress}:${id}:${network}`;
    const cached = metaCache.current.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 5000) {
      setMeta(cached.value);
      const keys = listUriKeys(cached.value);
      setUriKeys(keys);
      const first = keys.find((k) => /artifacturi/i.test(k)) || keys[0] || '';
      setUriKey(first || 'artifactUri');
      setIsLoadingMeta(false);
      return;
    }
    let m = null;
    try {
      let rows = [];
      rows = await jFetch(
        `${TZKT_API}/v1/tokens?contract=${contractAddress}&tokenId=${id}&limit=1`,
      );
      if (!rows.length) {
        const one = await jFetch(
          `${TZKT_API}/v1/contracts/${contractAddress}/bigmaps/token_metadata/keys/${id}`,
        );
        if (one?.value) rows = [{
          metadata: JSON.parse(Buffer.from(one.value.replace(/^0x/, ''), 'hex')
                               .toString('utf8')),
        }];
      }
      m = rows[0]?.metadata || {};
    } catch (e) {
      console.warn('[RepairUri] TZKT fetch failed:', e.message);
    }
    if ((!m || Object.keys(m).length === 0) && /^v4(b?)$/i.test(contractVersion)) {
      try {
        const c = await toolkit.contract.at(contractAddress);
        const viewRes = await c.views.get_token_metadata(id).executeView({ viewCaller: contractAddress });
        m = viewRes || {};
      } catch (e) {
        console.warn('[RepairUri] Off-chain view failed:', e.message);
      }
    }
    if (!m || Object.keys(m).length === 0) m = {};
    setMeta(m);
    const keys = listUriKeys(m);
    setUriKeys(keys);
    const first = keys.find((k) => /artifacturi/i.test(k)) || keys[0] || '';
    setUriKey(first || 'artifactUri');
    metaCache.current.set(cacheKey, { value: m, timestamp: Date.now() });
    setIsLoadingMeta(false);
  }, [contractAddress, network, toolkit, TZKT_API, contractVersion]);

  useEffect(() => { if (debouncedTokenId !== '') void loadMeta(debouncedTokenId); }, [loadMeta, debouncedTokenId]);

  /*──────── resume checkpoint ───*/
  useEffect(() => {
    let active = true;
    if (!contractAddress || tokenId === '') { setResumeInfo(null); return undefined; }
    loadSliceCheckpoint(...checkpointKeyArgs).then((r) => {
      if (active) setResumeInfo(r);
    });
    return () => { active = false; };
  }, [contractAddress, tokenId, checkpointKeyArgs]);

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
  const onUpload = useCallback((v, skipWarn = false) => {
    if (!v) { setFile(null); setDataUrl(''); setTail(''); setIntegrity({ status: 'unknown', score: 0, reasons: [] }); return; }
    const f  = v instanceof File            ? v
             : v?.file instanceof File       ? v.file
             : null;
    const du = typeof v === 'string'         ? v
             : typeof v?.dataUrl === 'string' ? v.dataUrl
             : '';
    if (f) {
      setFile(f);
      if (!skipWarn && f.size > WARN_BYTES) {
        pendingFile.current = f;
        setWarnOpen(true);
        return;
      }
    }
    if (du) {
      const normDu = du.replace('audio/mp3', 'audio/mpeg');
      setDataUrl(normDu);
      const res = checkOnChainIntegrity({ artifactUri: normDu });
      setIntegrity(res);
    }
    if (f && !du) {
      const r = new FileReader();
      r.onload = (e) => {
        const normResult = e.target.result.replace('audio/mp3', 'audio/mpeg');
        setDataUrl(normResult);
        const res = checkOnChainIntegrity({ artifactUri: normResult });
        setIntegrity(res);
      };
      r.readAsDataURL(f);
    }
  }, []);

  /*──────── diff worker ─────────*/
  useEffect(() => {
    if (!dataUrl) {
      setStatus('Upload the original file');
      setStatusError(true);
      return;
    }
    if (!origHex) {
      setStatus('Loading on-chain metadata...');
      setStatusError(false);
      return;
    }
    (async () => {
      setStatus('Computing diff...');
      setStatusError(false);
      const uploadedHex = `0x${dataUriToHex(dataUrl)}`;
      setFullHex(uploadedHex);
      let offset = 0;
      if (resumeInfo?.next > 0) {
        offset = resumeInfo.next;
      }
      const { tail: t, conflict: c, origLonger: ol } = sliceTail(origHex, uploadedHex, sliceSize, offset);
      if (c) {
        setStatusError(true);
        const onChainUri = Buffer.from(origHex.slice(2), 'hex').toString('utf8');
        const onChainMime = mimeFromDataUri(onChainUri);
        const uploadedMime = mimeFromDataUri(dataUrl);
        const mimeMsg = onChainMime !== uploadedMime ? ` (MIME mismatch: on-chain ${onChainMime}, uploaded ${uploadedMime})` : '';

        if (ol) {
          setStatus('On-chain longer than upload — clear or resume');
          setConflictOpen(!force);
          setConflictCode('longer');
          setTail('');
          setConflictMsg(`On-chain data is already longer than the uploaded file${mimeMsg}. ` +
            'Possibly a duplicate slice or garbage appended. Use “Clear URI”, or resume the previous checkpoint.');
        } else {
          setStatus(`File mismatch${mimeMsg} — upload original`);
          setConflictOpen(!force);
          setConflictCode('mismatch');
          setTail('');
          setConflictMsg(`Uploaded file differs before missing tail${mimeMsg}. Choose the exact original file.`);
        }
        return;
      }
      setConflictOpen(false); setConflictMsg(''); setConflictCode('');
      setTail(t);
      setStatus(t ? `Ready (${t.length} slices to append)` : 'No missing bytes detected');
      setStatusError(!t);
    })();
  }, [dataUrl, origHex, force, file, resumeInfo, sliceSize]);

  /*──────── force toggle effect ─────*/
  useEffect(() => {
    if (force && conflictOpen) setConflictOpen(false);
  }, [force, conflictOpen]);

  /*──────── ops builder ────────*/
  const buildOps = useCallback(async () => {
    const latestResume = await loadSliceCheckpoint(...checkpointKeyArgs);
    setResumeInfo(latestResume);
    const offset = latestResume?.next ?? 0;
    const { tail: freshTail } = sliceTail(origHex, fullHex, sliceSize, offset);
    setTail(freshTail);

    if (!freshTail.length) return { ops: [], currentBytesList: [] };

    const c = await toolkit.wallet.at(contractAddress);
    const idNat = +tokenId;
    const label = uriKey.replace(/^extrauri_/i, '');

    let currBytes = (origHex.length - 2) / 2 + offset;
    const currentBytesList = [];
    const ops = freshTail.map((hx) => {
      currentBytesList.push(currBytes);
      const appended = (hx.length - 2) / 2;
      currBytes += appended;
      if (appended > HARD_STORAGE_LIMIT) {
        throw new Error(`Slice too large (${appended} > ${HARD_STORAGE_LIMIT} bytes). Clear URI and re-upload.`);
      }
      const params = uriKey.toLowerCase().startsWith('extrauri_')
        ? c.methods.append_extrauri('', label, '', idNat, hx).toTransferParams()
        : c.methods.append_artifact_uri(idNat, hx).toTransferParams();
      params.gasLimit = HARD_GAS_LIMIT;
      params.storageLimit = HARD_STORAGE_LIMIT;
      return { kind: OpKind.TRANSACTION, ...params };
    });
    return { ops, currentBytesList };
  }, [toolkit, contractAddress, tokenId, uriKey, origHex, fullHex, sliceSize, checkpointKeyArgs]);

  /*──────── batch builder + estimator ─*/
  const buildAndEstimate = async () => {
    if (!toolkit) {
      setStatus('Connect wallet first');
      setStatusError(true);
      return;
    }
    if (!origHex) {
      setStatus('Metadata loading — retry');
      setStatusError(true);
      return;
    }
    if (!tail.length) {
      setStatus('No slices to repair');
      setStatusError(true);
      return;
    }

    setPreparing(true);
    setOverlay({ open: true, status: 'Preparing batches…', current: 0, total: 1, error: false });
    setStatus('Preparing batches...');
    setStatusError(false);

    try {
      const { ops, currentBytesList } = await buildOps();
      if (!ops.length) {
        setStatus('No slices to repair');
        setStatusError(true);
        return;
      }

      const oversizeLarge = fullHex.length / 2 > 100_000;
      const est = await estimateChunked(toolkit, ops, 1, oversizeLarge, currentBytesList);
      if (est.retrySmaller) {
        if (retryCount >= 3 || sliceSize <= SLICE_MIN_BYTES) throw new Error('Node timeout—try later');
        const newSize = Math.max(SLICE_MIN_BYTES, Math.floor(sliceSize / 2));
        setSliceSize(newSize);
        setRetryCount(retryCount + 1);
        setOverlay({ open: true, status: `Timeout—retrying with ${newSize / 1000}KB chunks…` });
        setPreparing(false);
        await new Promise((r) => setTimeout(r, 1000)); // brief pause
        return buildAndEstimate();
      }

      setEstimate({
        feeTez     : (est.fee  / 1e6).toFixed(6),
        storageTez : (est.burn / 1e6).toFixed(6)
      });

      const packs = await splitPacked(toolkit, ops, PACKED_SAFE_BYTES, true);
      setBatches(packs);

      const totalBytes = tail.reduce((sum, hx) => sum + (hx.length - 2) / 2, 0);
      await saveSliceCheckpoint(...checkpointKeyArgs, {
        total: totalBytes,
        next: resumeInfo?.next ?? 0,
        slices: tail,
      });
      setConfirmOpen(true);
      setStatus('Ready — confirm to sign');
      setStatusError(false);
    } catch (e) {
      const errMsg = e?.message || String(e);
      snack(`Error: ${errMsg}`, 'error');
      setStatus(`Failed: ${errMsg}`);
      setStatusError(true);
    } finally {
      setPreparing(false);
      setOverlay({ open: false });
    }
  };

  /*──────── CTA actions ─────────*/
  const handleCompareRepair = () => buildAndEstimate();
  const resumeUpload = () => {
    if (!resumeInfo) {
      snack('No checkpoint', 'info');
      setStatus('No resume checkpoint found');
      setStatusError(true);
      return;
    }
    // Re-diff with offset
    if (!dataUrl) {
      snack('Re-upload file to resume', 'warning');
      setStatus('Upload original file for resume');
      setStatusError(true);
      return;
    }
    const uploadedHex = `0x${dataUriToHex(dataUrl)}`;
    const { tail: newTail } = sliceTail(origHex, uploadedHex, sliceSize, resumeInfo.next);
    if (newTail.length === 0) {
      snack('Checkpoint complete', 'success');
      return;
    }
    setTail(newTail);
    buildAndEstimate();
  };
  const resetConflict = () => {
    setFile(null); setDataUrl(''); setTail('');
    setConflictOpen(false); setConflictCode(''); setConflictMsg('');
    setStatus('Upload the original file');
    setStatusError(true);
  };

  const downloadPartial = () => {
    if (!meta || !uriKey) return;
    const val = meta[uriKey];
    if (!val || typeof val !== 'string') return;
    const mime = mimeFromDataUri(val);
    const ext = preferredExt(mime);
    const a = document.createElement('a');
    a.href = val;
    a.download = `partial_${tokenId}_${uriKey}.${ext}`;
    a.click();
  };

  /*──────── slice runner ────────*/
  const sendBatches = useCallback(async () => {
    try {
      const { ops } = await buildOps();
      if (!ops.length) {
        snack('Nothing to send', 'info');
        return;
      }
      const packs = await splitPacked(toolkit, ops, PACKED_SAFE_BYTES, true);
      setBatches(packs);

      let lastOpHash = '';
      let currentByte = resumeInfo?.next ?? 0;
      for (let idx = 0; idx < packs.length; idx++) {
        const params = packs[idx];
        let sentOp = null;
        try {
          setOverlay({ open: true, status: 'Waiting for signature…', current: idx + 1, total: packs.length, error: false });
          sentOp = await toolkit.wallet.batch(params).send();
          lastOpHash = sentOp.opHash;
          setOverlay({ open: true, status: 'Broadcasting…', current: idx + 1, total: packs.length, error: false });
          await confirmOrTimeout(sentOp);
          const batchBytes = params.reduce((sum, p) => {
            // Extract appended bytes length from the last argument's bytes field.
            try {
              const args = p.parameter?.value?.args;
              if (Array.isArray(args)) {
                const last = args[args.length - 1];
                const b = last?.bytes;
                if (typeof b === 'string') return sum + (b.length / 2);
              }
            } catch {}
            return sum;
          }, 0);
          currentByte += batchBytes;
          await saveSliceCheckpoint(...checkpointKeyArgs, { ...resumeInfo, next: currentByte });
          setResumeInfo((prev) => ({ ...prev, next: currentByte }));
        } catch (e) {
          let errMsg = e?.message || (e?.name ? `${e.name}: ${e.description || e.message || ''}` : String(e));
          if (errMsg.includes('timeout') && sentOp?.opHash) {
            setOverlay({ open: true, status: 'Polling for inclusion…', current: idx + 1, total: packs.length, error: false });
            const landed = await pollOpStatus(sentOp.opHash, TZKT_API);
            if (landed) {
              const batchBytes = params.reduce((sum, p) => {
                try {
                  const args = p.parameter?.value?.args;
                  if (Array.isArray(args)) {
                    const last = args[args.length - 1];
                    const b = last?.bytes;
                    if (typeof b === 'string') return sum + (b.length / 2);
                  }
                } catch {}
                return sum;
              }, 0);
              currentByte += batchBytes;
              await saveSliceCheckpoint(...checkpointKeyArgs, { ...resumeInfo, next: currentByte });
              setResumeInfo((prev) => ({ ...prev, next: currentByte }));
              continue;
            }
          }
          if (isSimTimeout(e) && retryCount < 3) {
            const newSize = Math.max(SLICE_MIN_BYTES, Math.floor(sliceSize / 2));
            setRetryCount(retryCount + 1);
            setSliceSize(newSize);
            setOverlay({ open: true, status: `Simulation timeout—retrying with ${newSize / 1000}KB slices…`, current: idx + 1, total: packs.length, error: false });
            return sendBatches(); // recursive retry with rebuild
          }
          setOverlay({ open: true, error: true, status: errMsg, current: idx + 1, total: packs.length });
          setStatus(`Batch failed: ${errMsg}`);
          setStatusError(true);
          return;
        }
      }
      snack('Repair complete', 'success');
      await clearSliceCheckpoint(...checkpointKeyArgs);
      setResumeInfo(null);
      setOverlay({ open: true, opHash: lastOpHash, current: packs.length, total: packs.length });
      onMutate();
      setBatches(null);
      setStatus('Repair successful — reload to verify');
      setStatusError(false);
    } catch (e) {
      snack(`Error: ${e.message}`, 'error');
    }
  }, [buildOps, splitPacked, toolkit, resumeInfo, checkpointKeyArgs, TZKT_API, retryCount, sliceSize, onMutate]);

  /*──────── guards & status text ─────────────*/
  const canResume     = resumeInfo && (resumeInfo.next ?? 0) < (resumeInfo.total ?? 0);
  const disabledCompare = preparing
    || !file || (conflictOpen && !force) || !origHex || !tail || !tokenId;

  useEffect(() => {
    if (!tokenId) {
      setStatus('Select a token-ID');
      setStatusError(true);
    } else if (!file && !canResume) {
      setStatus('Upload the original file');
      setStatusError(true);
    }
  }, [tokenId, file, canResume]);

  const mime = file ? mimeFromFilename(file.name) : '';
  const numSlices = batches?.length || 0; // since single-op

  /*──────── JSX ────────────────*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3} style={{ gridColumn: '1 / -1' }}>
        Repair URI
      </PixelHeading>

      {/* token picker row */}
      <FormRow>
        <PixelInput
          placeholder="Token-ID"
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value.replace(/\D/g, ''))}
        />
        <SelectBox>
          <select
            style={{ width: '100%', height: 32 }}
            disabled={loadingTok}
            value={tokenId || ''}
            onChange={(e) => setTokenId(e.target.value)}
          >
            <option value="">
              {loadingTok ? 'Loading…'
                          : tokOpts.length ? 'Select token' : '— none —'}
            </option>
            {tokOpts.map(({ id, name }) => <option key={id} value={id}>{name ? `${id} — ${name}` : id}</option>)}
          </select>
          {loadingTok && <Spinner />}
        </SelectBox>

        <SelectBox style={{ gridColumn: '1 / -1' }}>
          <select
            style={{ width: '100%', height: 32 }}
            value={uriKey}
            onChange={(e) => setUriKey(e.target.value)}
            disabled={!uriKeys.length}
          >
            {uriKeys.length
              ? uriKeys.map((k) => <option key={k} value={k}>{k}</option>)
              : <option value="artifactUri">artifactUri</option>}
          </select>
        </SelectBox>
      </FormRow>

      <HelpBox>
        ① Pick token → ② choose URI key → ③ upload the <em>exact</em> original
        file (or click RESUME when a checkpoint exists).<br/>
        ⚠ If on-chain data is <strong>longer</strong> than your upload
        (duplicate slice), use <code>Clear URI</code> then re-upload, or simply
        resume the previous checkpoint.<br/>
        ⛓ For large files ({'>'}100KB), we skip RPC estimation and use heuristics — costs are approximate.
      </HelpBox>

      {warnMany && <p style={{gridColumn: '1 / -1', color: 'var(--zu-warn)'}}>Warning: Large repair requires ~{tail.length} signatures due to node limits.</p>}

      {/* resume banner */}
      {canResume && (
        <p style={{
          fontSize: '.8rem',
          color: 'var(--zu-accent)',
          margin: '4px 0',
          gridColumn: '1 / -1',
        }}>
          Resume detected ({(resumeInfo.next / resumeInfo.total * 100).toFixed(0)}% complete).
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
          {file && <p>{file.name} ({mime})</p>}
          {dataUrl && (
            <RenderMedia
              uri={dataUrl}
              alt={file?.name}
              style={{ width: '100%', maxHeight: 200, margin: '6px auto', objectFit: 'contain' }}
            />
          )}
        </div>
        {isLoadingMeta ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <LoadingSpinner size={48} />
            <p style={{ marginTop: '1rem', fontSize: '.8rem' }}>Loading large metadata – this may take a few minutes...</p>
          </div>
        ) : (
          <TokenMetaPanel
            meta={meta}
            tokenId={tokenId}
            contractAddress={contractAddress}
            contractVersion="v4"
          />
        )}
      </PreviewGrid>

      {/* CTA row */}
      <div style={{
        gridColumn: '1 / -1',
        display: 'flex',
        gap: '.6rem',
        alignItems: 'center',
        marginTop: '.9rem',
        flexWrap: 'wrap',
      }}>
        <PixelButton
          disabled={disabledCompare}
          onClick={handleCompareRepair}
        >
          {preparing ? 'Calculating…' : 'Compare & Repair'}
        </PixelButton>
        {integrity.status !== 'unknown' && <IntegrityBadge status={integrity.status} />}
        <PixelButton size="sm" onClick={() => setFile(null)}>Clear File</PixelButton>
        {conflictCode === 'mismatch' && (
          <PixelButton size="sm" onClick={downloadPartial}>Download partial</PixelButton>
        )}
        {isDebug && (
          <label>
            Force: <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
          </label>
        )}
        {canResume && (
          <PixelButton onClick={resumeUpload}>
            RESUME CHECKPOINT
          </PixelButton>
        )}
        <StatusSpan error={statusError}>{status}</StatusSpan>
        {preparing && (
          <>
            <LoadingSpinner style={{ position: 'static' }}/>
            <span style={{ fontSize: '.7rem' }}>Calculating…</span>
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

      {/* large-file warning dialog */}
      {warnOpen && (
        <PixelConfirmDialog
          title="Large File Warning"
          message={WARN_TEXT}
          confirmLabel="Proceed Anyway"
          onConfirm={() => {
            setWarnOpen(false);
            onUpload(pendingFile.current, true);
            pendingFile.current = null;
          }}
          onCancel={() => {
            setWarnOpen(false);
            pendingFile.current = null;
          }}
        />
      )}

      {/* overlay */}
      {overlay.open && (
        <OperationOverlay
          {...overlay}
          onRetry={() => sendBatches()}
          onCancel={() => { setOverlay({ open: false }); setBatches(null); }}
        />
      )}

      {/* confirm dialog */}
      {confirmOpen && (
        <OperationConfirmDialog
          open
          estimate={estimate}
          slices={numSlices}
          disclaimer={'These are approximate costs. Actual costs may vary due to gas fluctuations and network conditions.'}
          onOk={() => { setConfirmOpen(false); sendBatches(); }}
          onCancel={() => { setConfirmOpen(false); setBatches(null); }}
        />
      )}
    </Wrap>
  );
}
/* What changed & why: Refined currentBytesList calc for precision; rev-bump r936; Compile-Guard passed.
 */
/* EOF */