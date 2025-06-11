// File: src/ui/Entrypoints/AppendArtifactUri.jsx
/* Developed by @jams2blues – ZeroContract Studio
   Summary: Resumable multi-slice uploads with shared sliceCache */

import React, { useCallback, useEffect, useState } from 'react';
import { Buffer } from 'buffer';
import styledPkg from 'styled-components';
import { OpKind } from '@taquito/taquito';
import { char2Bytes } from '@taquito/utils';

import PixelHeading from '../PixelHeading.jsx';
import PixelInput from '../PixelInput.jsx';
import PixelButton from '../PixelButton.jsx';
import MintUpload from './MintUpload.jsx';
import OperationOverlay from '../OperationOverlay.jsx';
import OperationConfirmDialog from '../OperationConfirmDialog.jsx';
import PixelConfirmDialog from '../PixelConfirmDialog.jsx';
import RenderMedia from '../../utils/RenderMedia.jsx';
import TokenMetaPanel from '../TokenMetaPanel.jsx';

import { splitPacked, sliceHex, PACKED_SAFE_BYTES } from '../../core/batch.js';
import { strHash, loadSliceCache, saveSliceCache, clearSliceCache, purgeExpiredSliceCache } from '../../utils/sliceCache.js';
import { jFetch } from '../../core/net.js';
import { mimeFromFilename } from '../../constants/mimeTypes.js';
import { useWalletContext } from '../../contexts/WalletContext.js';
import { TZKT_API } from '../../config/deployTarget.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap = styled('section')`margin-top:1.5rem;`;
const SelectWrap = styled.div`position:relative;flex:1;`;
const SpinnerIcon = styled.img.attrs({
  src: '/sprites/loading16x16.gif', alt: '',
})`
  position:absolute;top:8px;right:8px;width:16px;height:16px;
  image-rendering:pixelated;
`;

const API = `${TZKT_API}/v1`;
const hex2str = h => Buffer.from(h.replace(/^0x/, ''), 'hex').toString('utf8');

export default function AppendArtifactUri({
  contractAddress,
  setSnackbar = () => {},
  onMutate = () => {},
  $level,
}) {
  const { toolkit } = useWalletContext() || {};
  const snack = (m, s = 'info') => setSnackbar({ open: true, message: m, severity: s });

  const [tokOpts, setTokOpts] = useState([]);
  const [loadingTok, setLoadingTok] = useState(false);

  const fetchTokens = useCallback(async () => {
    if (!contractAddress) return;
    setLoadingTok(true);
    const seen = new Set();
    const push = arr => arr.forEach(n => Number.isFinite(n) && seen.add(n));
    try {
      const rows = await jFetch(`${API}/tokens?contract=${contractAddress}&select=tokenId&limit=10000`);
      push(rows.map(r => +r.tokenId));
    } catch {}
    if (!seen.size) {
      try {
        const rows = await jFetch(`${API}/contracts/${contractAddress}/bigmaps/token_metadata/keys?limit=10000`);
        push(rows.map(r => +r.key));
      } catch {}
    }
    setTokOpts([...seen].sort((a, b) => a - b));
    setLoadingTok(false);
  }, [contractAddress]);

  useEffect(fetchTokens, [fetchTokens]);

  const [tokenId, setTokenId] = useState('');
  const [file, setFile] = useState(null);
  const [dataUrl, setDataUrl] = useState('');
  const [meta, setMeta] = useState(null);
  const [hasArtUri, setHasArtUri] = useState(false);

  const [isEstim, setIsEstim] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  const [resumeInfo, setResumeInfo] = useState(null);
  const mime = mimeFromFilename?.(file?.name) || file?.type || '';

  const loadMeta = useCallback(async id => {
    if (!contractAddress || id === '') {
      setMeta(null);
      setHasArtUri(false);
      return;
    }
    let rows = [];
    try {
      rows = await jFetch(`${API}/tokens?contract=${contractAddress}&tokenId=${id}&limit=1}`);
    } catch {}
    if (!rows.length) {
      try {
        const one = await jFetch(`${API}/contracts/${contractAddress}/bigmaps/token_metadata/keys/${id}`);
        if (one?.value) rows = [{ metadata: JSON.parse(hex2str(one.value)) }];
      } catch {}
    }
    const m = rows[0]?.metadata || {};
    setMeta(m);
    setHasArtUri(!!m.artifactUri);
  }, [contractAddress]);

  useEffect(() => { loadMeta(tokenId); }, [tokenId, loadMeta]);

  const [batches, setBatches] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [slicesTotal, setSlicesTotal] = useState(1);
  const [estimate, setEstimate] = useState(null);
  const [ov, setOv] = useState({ open: false });

  const reset = () => {
    setFile(null);
    setDataUrl('');
    setResumeInfo(null);
    setMeta(null);
    setHasArtUri(false);
    setBatches(null);
    setConfirmOpen(false);
    setEstimate(null);
    setIsEstim(false);
    setSlicesTotal(1);
    setDelOpen(false);
    clearSliceCache(contractAddress, tokenId, 'artifact');
  };

  /* purge old caches on mount */
  useEffect(() => { purgeExpiredSliceCache(1); }, []);

  useEffect(() => {
    if (!tokenId) return;
    const c = loadSliceCache(contractAddress, tokenId, 'artifact');
    if (c) setResumeInfo(c);
  }, [contractAddress, tokenId]);

  const buildFlatParams = useCallback(async (hexSlices, startIdx) => {
    const idNat = +tokenId;
    const c = await toolkit.wallet.at(contractAddress);
    return hexSlices.slice(startIdx).map(hx => ({
      kind: OpKind.TRANSACTION,
      ...c.methods.append_artifact_uri(idNat, hx).toTransferParams(),
    }));
  }, [toolkit, contractAddress, tokenId]);

  const beginUpload = async (hexSlices, startIdx = 0, hash) => {
    setIsEstim(true);
    await new Promise(requestAnimationFrame);
    try {
      const flat = await buildFlatParams(hexSlices, startIdx);
      const estArr = await toolkit.estimate.batch(flat.map(p => ({ kind: OpKind.TRANSACTION, ...p })));
      const feeMutez = estArr.reduce((t, e) => t + e.suggestedFeeMutez, 0);
      const storageMutez = estArr.reduce((t, e) => t + e.burnFeeMutez, 0);
      setEstimate({ feeTez: (feeMutez / 1e6).toFixed(6), storageTez: (storageMutez / 1e6).toFixed(6) });

      setSlicesTotal(hexSlices.length);
      setBatches(await splitPacked(toolkit, flat, PACKED_SAFE_BYTES));

      saveSliceCache(contractAddress, tokenId, 'artifact', {
        hash, total: hexSlices.length, nextIdx: startIdx, slices: hexSlices
      });
      setResumeInfo({ hash, total: hexSlices.length, nextIdx: startIdx, slices: hexSlices });
      setConfirmOpen(true);
    } catch (e) {
      snack(e.message, 'error');
    } finally {
      setIsEstim(false);
    }
  };

  useEffect(() => {
    if (!file) {
      setDataUrl('');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const url = e.target.result;
      setDataUrl(url);
      const hexStr = `0x${char2Bytes(url)}`;
      const slices = sliceHex(hexStr);
      beginUpload(slices, 0, strHash(hexStr));
    };
    reader.readAsDataURL(file);
  }, [file]);

  const resumeUpload = () => {
    const { slices, nextIdx, hash } = resumeInfo;
    beginUpload(slices, nextIdx, hash);
  };

  const runSlice = useCallback(async batchIdx => {
    if (!batches || batchIdx >= batches.length) return;
    const nextGlobalIdx = (resumeInfo?.nextIdx || 0) + batchIdx;
    setOv({ open: true, status: 'Preparing transaction…', current: nextGlobalIdx + 1, total: slicesTotal });
    try {
      const op = await toolkit.wallet.batch(batches[batchIdx]).send();
      setOv({ open: true, status: 'Waiting for signature…', current: nextGlobalIdx + 1, total: slicesTotal });
      await op.confirmation();

      const newNext = nextGlobalIdx + 1;
      if (newNext < slicesTotal) {
        const upd = { ...resumeInfo, nextIdx: newNext };
        saveSliceCache(contractAddress, tokenId, 'artifact', upd);
        setResumeInfo(upd);
        requestAnimationFrame(() => runSlice(batchIdx + 1));
      } else {
        clearSliceCache(contractAddress, tokenId, 'artifact');
        setOv({ open: true, opHash: op.opHash });
        onMutate();
        reset();
      }
    } catch (e) {
      setOv({ open: true, error: e.message || String(e), current: nextGlobalIdx + 1, total: slicesTotal });
    }
  }, [batches, resumeInfo, slicesTotal, toolkit, contractAddress, tokenId, onMutate]);

  const execClear = async () => {
    if (!toolkit) return snack('Connect wallet', 'error');
    try {
      setOv({ open: true, status: 'Waiting for signature…' });
      const c = await toolkit.wallet.at(contractAddress);
      const op = await c.methods.clear_uri(+tokenId, 'artifactUri').send();
      setOv({ open: true, status: 'Broadcasting…' });
      await op.confirmation();
      snack('Cleared ✓', 'success');
      onMutate();
      loadMeta(tokenId);
      reset();
      setOv({ open: false });
    } catch (e) {
      setOv({ open: false });
      snack(e.message, 'error');
    }
  };

  const disabled = (!file && !resumeInfo) || tokenId === '' || isEstim || !!batches || hasArtUri;
  const oversize = (dataUrl || '').length > 45_000;

  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Append Artifact URI</PixelHeading>

      <div style={{ display: 'flex', gap: '.5rem' }}>
        <PixelInput
          placeholder="Token-ID"
          style={{ flex: 1 }}
          value={tokenId}
          onChange={e => setTokenId(e.target.value.replace(/\D/g, ''))}
        />
        <SelectWrap>
          <select
            style={{ width: '100%', height: 32 }}
            disabled={loadingTok}
            value={tokenId || ''}
            onChange={e => setTokenId(e.target.value)}
          >
            <option value="">
              {loadingTok ? 'Loading…' : 'Select token'}
            </option>
            {tokOpts.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
          {loadingTok && <SpinnerIcon />}
        </SelectWrap>
      </div>

      {resumeInfo && !file && (
        <div style={{ margin: '8px 0', fontSize: '.8rem', color: 'var(--zu-accent)' }}>
          In-progress upload detected ({resumeInfo.nextIdx}/{resumeInfo.total} slices).
          <PixelButton size="xs" style={{ marginLeft: 6 }} onClick={resumeUpload}>
            Repair Artifact
          </PixelButton>
        </div>
      )}

      {hasArtUri && (
        <p style={{ fontSize: '.75rem', color: 'var(--zu-accent-sec)', margin: '6px 0 8px' }}>
          Token already has <code>artifactUri</code>. Clear first –
          <PixelButton size="xs" style={{ marginLeft: 6 }} warning onClick={() => setDelOpen(true)}>
            Clear URI
          </PixelButton>
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '.5rem', justifyContent: 'space-between' }}>
        <div style={{ flex: '0 1 48%', minWidth: 220 }}>
          <MintUpload onFileChange={setFile} accept="*/*" />
          {dataUrl && (
            <RenderMedia
              uri={dataUrl}
              alt={file?.name}
              style={{ width: '100%', maxHeight: 220, margin: '6px auto', objectFit: 'contain' }}
            />
          )}
          {mime && (
            <p style={{ fontSize: '.7rem', textAlign: 'center', marginTop: 4 }}>
              Detected MIME: {mime}
            </p>
          )}
        </div>
        <div style={{ flex: '0 1 48%', minWidth: 240 }}>
          <TokenMetaPanel meta={meta} tokenId={tokenId} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', marginTop: '.8rem' }}>
        <PixelButton onClick={() => setConfirmOpen(true)} disabled={disabled}>
          {resumeInfo && !file ? 'RESUME' : isEstim ? 'Estimating…' : 'APPEND'}
        </PixelButton>
        {isEstim && (
          <img
            src="/sprites/loading16x16.gif"
            alt=""
            style={{ width: 16, height: 16, imageRendering: 'pixelated' }}
          />
        )}
        {oversize && !batches && (
          <span style={{ fontSize: '.7rem', opacity: .8 }}>
            Large file – estimation may take ≈10 s
          </span>
        )}
      </div>

      {ov.open && (
        <OperationOverlay
          {...ov}
          onRetry={() => runSlice((ov.current ?? 1) - (resumeInfo?.nextIdx || 0) - 1)}
          onCancel={() => { setOv({ open: false }); reset(); }}
        />
      )}
      {confirmOpen && (
        <OperationConfirmDialog
          open
          estimate={estimate}
          slices={slicesTotal - (resumeInfo?.nextIdx || 0)}
          onOk={() => { setConfirmOpen(false); runSlice(0); }}
          onCancel={() => { setConfirmOpen(false); reset(); }}
        />
      )}
      <PixelConfirmDialog
        open={delOpen}
        message={`Remove existing artifactUri from token ${tokenId}?`}
        onOk={() => { setDelOpen(false); execClear(); }}
        onCancel={() => setDelOpen(false)}
      />
    </Wrap>
  );
}
/* EOF */