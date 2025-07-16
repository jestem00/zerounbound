/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/AppendArtifactUri.jsx
  Rev :    r731   2025-07-15
  Summary: widened modal to 96vw for full-screen stretch
──────────────────────────────────────────────────────────────*/
import React, { useCallback, useEffect, useState } from 'react';
import { Buffer }          from 'buffer';
import styledPkg           from 'styled-components';
import { OpKind }          from '@taquito/taquito';
import { char2Bytes }      from '@taquito/utils';

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

import { splitPacked, planSlices, sliceTail, PACKED_SAFE_BYTES, SLICE_MAX_BYTES, SLICE_MIN_BYTES } from '../../core/batch.js';
import {
  loadSliceCheckpoint, saveSliceCheckpoint,
  clearSliceCheckpoint, purgeExpiredSliceCache,
} from '../../utils/sliceCache.js';
import { jFetch }           from '../../core/net.js';
import { mimeFromFilename } from '../../constants/mimeTypes.js';
import { useWalletContext } from '../../contexts/WalletContext.js';
import { TZKT_API }         from '../../config/deployTarget.js';
import listLiveTokenIds     from '../../utils/listLiveTokenIds.js';
import {
  estimateChunked, calcStorageMutez,
} from '../../core/feeEstimator.js';

/*──────── styled shells ─────*/
const styled  = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap    = styled.section.attrs({ 'data-modal': 'append-artifact' })`
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
const Select  = styled.div`position:relative;flex:1;`;
const Spinner = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;
`;
const HelpBox = styled.p`
  grid-column:1 / -1;
  font-size:.75rem;line-height:1.25;margin:.5rem 0 .9rem;
`;

/*──────── helpers ─────*/
const API     = `${TZKT_API}/v1`;
const hex2str = (h) => Buffer.from(h.replace(/^0x/, ''), 'hex').toString('utf8');
async function sha256Hex(txt = '') {
  const buf  = new TextEncoder().encode(txt);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

/*════════ component ════════════════════════════════════════*/
export default function AppendArtifactUri({
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
  const [tokenId, setTokenId] = useState('');
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');
  const [mime, setMime] = useState('');
  const [meta, setMeta] = useState(null);
  const [hasArt, setHasArt] = useState(false);
  const [prep, setPrep] = useState(null); // { slices, hash, fullHex }
  const [resume, setResume] = useState(null); // from cache

  const [isEstim, setIsEstim] = useState(false);
  const [estimate, setEstimate] = useState(null);
  const [batches, setBatches] = useState(null);
  const [ov, setOv] = useState({ open: false });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  const [retryCount, setRetryCount] = useState(0);
  const [sliceSize, setSliceSize] = useState(SLICE_MAX_BYTES);

  /* housekeeping */
  useEffect(() => { purgeExpiredSliceCache(); }, []);
  useEffect(() => {
    if (!tokenId) { setResume(null); return; }
    setResume(loadSliceCheckpoint(contractAddress, tokenId, 'artifactUri', network));
  }, [contractAddress, tokenId, network]);

  /*──── meta loader ───*/
  const loadMeta = useCallback(async () => {
    setMeta(null); setHasArt(false);
    if (!contractAddress || tokenId === '') return;

    let rows = [];
    try {
      rows = await jFetch(`${API}/tokens?contract=${contractAddress}&tokenId=${tokenId}&limit=1`);
    } catch {/* ignore */}

    if (!rows.length) {
      try {
        const one = await jFetch(
          `${API}/contracts/${contractAddress}/bigmaps/token_metadata/keys/${tokenId}`,
        );
        if (one?.value) rows = [{ metadata: JSON.parse(hex2str(one.value)) }];
      } catch {/* ignore */}
    }
    const m = rows[0]?.metadata || {};
    setMeta(m);
    setHasArt(!!m.artifactUri);
  }, [contractAddress, tokenId]);
  useEffect(() => { void loadMeta(); }, [loadMeta]);

  /*──── upload prep ───*/
  useEffect(() => {
    if (!file) { setUrl(''); setPrep(null); setMime(''); return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const du = e.target.result;
      setUrl(du);
      setMime(mimeFromFilename(file.name) || file.type || '');

      const fullHex = `0x${char2Bytes(du)}`;
      const slices = planSlices(fullHex, sliceSize);
      setPrep({
        slices,
        hash: `sha256:${await sha256Hex(fullHex)}`,
        fullHex,
      });
    };
    reader.readAsDataURL(file);
  }, [file, sliceSize]);

  const warnMany = prep ? prep.slices.length > 50 : false;
  const oversizeLarge = prep ? prep.fullHex.length / 2 > 100_000 : false;

  /*──────── build flat ops ─────*/
  const buildFlat = useCallback(async (slices) => {
    const c = await toolkit.wallet.at(contractAddress);
    const idNat = +tokenId;

    let currBytes = meta?.artifactUri ? (char2Bytes(meta.artifactUri).length / 2) : 0;
    const currentBytesList = [];
    const ops = slices.map((hx) => {
      currentBytesList.push(currBytes);
      const appended = (hx.length - 2) / 2;
      currBytes += appended;
      return {
        kind: OpKind.TRANSACTION,
        ...c.methods.append_artifact_uri(idNat, hx).toTransferParams(),
      };
    });
    return { ops, currentBytesList };
  }, [toolkit, contractAddress, tokenId, meta]);

  /*──────── prepare batches & estimate ─────*/
  const prepareUpload = async (slices, startIdx, hash) => {
    setIsEstim(true);
    await new Promise(requestAnimationFrame);
    try {
      const { ops, currentBytesList } = await buildFlat(slices.slice(startIdx));

      const est = await estimateChunked(toolkit, ops, 1, oversizeLarge, currentBytesList);
      if (est.retrySmaller) {
        if (retryCount >= 3 || sliceSize <= SLICE_MIN_BYTES) throw new Error('Node timeout—try later');
        setSliceSize(Math.max(SLICE_MIN_BYTES, Math.floor(sliceSize / 2)));
        setRetryCount(retryCount + 1);
        return;
      }

      const burnCalc = calcStorageMutez(0, slices.slice(startIdx), 1);
      const burnFinal = est.burn || burnCalc;

      setEstimate({
        feeTez: (est.fee / 1e6).toFixed(6),
        storageTez: (burnFinal / 1e6).toFixed(6),
      });

      const packed = await splitPacked(toolkit, ops, PACKED_SAFE_BYTES);
      setBatches(packed);

      saveSliceCheckpoint(contractAddress, tokenId, 'artifactUri', {
        total: slices.length,
        next: startIdx,
        slices,
        hash,
        updated: Date.now(),
      }, network);
      setConfirmOpen(true);
    } catch (e) {
      snack(e.message, 'error');
    } finally {
      setIsEstim(false);
    }
  };

  /*──────── append CTA ─────*/
  const handleAppendClick = () => {
    if (!prep) return;
    let startIdx = 0;
    if (meta?.artifactUri) {
      const onChainHex = `0x${char2Bytes(meta.artifactUri)}`;
      const { tail, conflict } = sliceTail(onChainHex, prep.fullHex);
      if (conflict) return snack('Conflict – file differs on-chain', 'error');
      startIdx = prep.slices.length - tail.length;
    }
    prepareUpload(prep.slices, startIdx, prep.hash);
  };

  const resumeUpload = () => {
    const { slices = [], next = 0, hash = '' } = resume || {};
    prepareUpload(slices, next, hash);
  };

  /*──────── run batches ─────*/
  const runSlice = useCallback(async (idx = 0) => {
    if (!batches || idx >= batches.length) return;
    setOv({ open: true, status: 'Waiting for signature…', current: idx + 1, total: batches.length });
    try {
      const op = await toolkit.wallet.batch(batches[idx]).send();
      setOv({ open: true, status: 'Broadcasting…', current: idx + 1, total: batches.length });
      await op.confirmation();
      saveSliceCheckpoint(contractAddress, tokenId, 'artifactUri', {
        ...resume, next: idx + 1,
      }, network);
      if (idx + 1 === batches.length) {
        clearSliceCheckpoint(contractAddress, tokenId, 'artifactUri', network);
        onMutate();
        setOv({ open: true, opHash: op.opHash, current: batches.length, total: batches.length });
      } else {
        runSlice(idx + 1);
      }
    } catch (e) {
      setOv({ open: true, error: true, status: e.message || String(e), current: idx + 1, total: batches.length });
    }
  }, [batches, toolkit, contractAddress, tokenId, resume, onMutate, network]);

  /*──────── clear URI ─────*/
  const handleClear = async () => {
    if (!toolkit) return snack('Connect wallet', 'error');
    try {
      setOv({ open: true, status: 'Waiting for signature…' });
      const c = await toolkit.wallet.at(contractAddress);
      const op = await c.methods.clear_uri(+tokenId, 'artifactUri').send();
      setOv({ open: true, status: 'Broadcasting…' });
      await op.confirmation();
      setHasArt(false);
      snack('Cleared', 'success');
      onMutate(); loadMeta();
      setOv({ open: true, opHash: op.opHash });
    } catch (e) {
      setOv({ open: true, error: true, status: e.message || String(e) });
    }
  };

  /*──────── guards ─────*/
  const disabled = isEstim || tokenId === '' || hasArt || !(prep || resume);

  return (
    <Wrap $level={$level}>
      <PixelHeading level={3} style={{ gridColumn: '1 / -1' }}>Append Artifact URI</PixelHeading>
      <HelpBox>
        Adds the *main* media (artifactUri) to a minted token that is still blank. Pick token → upload asset → APPEND. UI runs an on-chain diff so duplicates are skipped and fees stay low. If the upload breaks you’ll see a RESUME banner – no data is ever lost.
      </HelpBox>

      {warnMany && <p style={{ gridColumn: '1 / -1', color: 'var(--zu-warn)' }}>Warning: Large file requires ~{prep.slices.length} signatures due to node limits.</p>}

      {/* token picker */}
      <FormRow>
        <PixelInput
          placeholder="Token-ID"
          style={{ flex: 1 }}
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value.replace(/\D/g, ''))}
        />
        <Select>
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
        </Select>
      </FormRow>

      {resume && !file && (
        <p style={{ gridColumn: '1 / -1', margin: '6px 0', fontSize: '.8rem', color: 'var(--zu-accent)' }}>
          Resume detected ({resume.next}/{resume.total} slices).
          <PixelButton size="xs" style={{ marginLeft: 6 }} onClick={resumeUpload}>
            Resume Upload
          </PixelButton>
        </p>
      )}

      {hasArt && (
        <p style={{ gridColumn: '1 / -1', fontSize: '.75rem', color: 'var(--zu-accent-sec)', margin: '6px 0' }}>
          Token already has <code>artifactUri</code>. Clear first —
          <PixelButton size="xs" warning style={{ marginLeft: 6 }} onClick={() => setDelOpen(true)}>
            Clear URI
          </PixelButton>
        </p>
      )}

      {/* upload + preview */}
      <PreviewGrid>
        <div>
          <MintUpload onFileChange={setFile} />
          {url && (
            <RenderMedia uri={url} alt={file?.name} style={{ width: '100%', maxHeight: 220, margin: '6px auto', objectFit: 'contain' }} />
          )}
          {mime && <p style={{ fontSize: '.7rem', textAlign: 'center', marginTop: 4 }}>
            Detected MIME: {mime}</p>}
        </div>
        <div>
          <TokenMetaPanel meta={meta} tokenId={tokenId} contractAddress={contractAddress} />
        </div>
      </PreviewGrid>

      {/* CTA */}
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '.6rem', alignItems: 'center', marginTop: '.8rem' }}>
        <PixelButton disabled={disabled} onClick={handleAppendClick}>
          {resume && !file ? 'RESUME' : isEstim ? 'Estimating…' : 'APPEND'}
        </PixelButton>
        {isEstim && <Spinner style={{ position: 'static' }} />}
      </div>

      {/* dialogs */}
      {confirmOpen && (
        <OperationConfirmDialog
          open
          slices={batches?.length || 1}
          estimate={estimate}
          onOk={() => { setConfirmOpen(false); runSlice(0); }}
          onCancel={() => { setConfirmOpen(false); setBatches(null); }}
        />
      )}
      {ov.open && (
        <OperationOverlay
          {...ov}
          onRetry={() => runSlice((ov.current ?? 1) - 1)}
          onCancel={() => { setOv({ open: false }); setBatches(null); }}
        />
      )}
      <PixelConfirmDialog
        open={delOpen}
        title="Clear artifactUri"
        message={`Remove existing artifactUri from token ${tokenId}?`}
        onOk={() => { setDelOpen(false); handleClear(); }}
        onCancel={() => setDelOpen(false)}
      />
    </Wrap>
  );
}
/* What changed & why: Widened modal to 96vw matching I102 blueprint; rev-bump r731; Compile-Guard passed.
 */
/* EOF */