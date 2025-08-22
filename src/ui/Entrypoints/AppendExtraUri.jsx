/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/AppendExtraUri.jsx
  Rev :    r822   2025-07-15
  Summary: widened modal to 96vw for full-screen stretch
──────────────────────────────────────────────────────────────*/
import React, {
  useCallback, useEffect, useMemo, useState,
} from 'react';
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

import {
  splitPacked, planSlices, sliceTail, PACKED_SAFE_BYTES, SLICE_MAX_BYTES, SLICE_MIN_BYTES,
} from '../../core/batch.js';
import {
  loadSliceCheckpoint, saveSliceCheckpoint,
  clearSliceCheckpoint, purgeExpiredSliceCache,
} from '../../utils/sliceCache.js';
import { jFetch }           from '../../core/net.js';
import { mimeFromFilename } from '../../constants/mimeTypes.js';
import { useWalletContext } from '../../contexts/WalletContext.js';
import { TZKT_API }         from '../../config/deployTarget.js';
import { listUriKeys }      from '../../utils/uriHelpers.js';
import listLiveTokenIds     from '../../utils/listLiveTokenIds.js';
import {
  estimateChunked, calcStorageMutez,
} from '../../core/feeEstimator.js';

/*──────── styled shells ─────*/
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap = styled.section.attrs({ 'data-modal': 'append-extra' })`
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
const SelectWrap  = styled.div`position:relative;flex:1;`;
const Hint        = styled.p`grid-column:1 / -1;font-size:.7rem;margin:.4rem 0 .3rem;opacity:.8;`;
const Spinner     = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;
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
export default function AppendExtraUri({
  contractAddress,
  setSnackbar = () => {},
  onMutate    = () => {},
  $level,
}) {
  const { toolkit, network = 'ghostnet' } = useWalletContext() || {};
  const snack = (m, s = 'info') =>
    setSnackbar({ open: true, message: m, severity: s });

  /*──────── token list ───────*/
  const [tokOpts, setTokOpts] = useState([]);
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
  const [dataUrl, setDataUrl] = useState('');
  const [desc, setDesc] = useState('');
  const [label, setLabel] = useState('');
  const [name, setName] = useState('');
  const [meta, setMeta] = useState(null);
  const [existing, setExisting] = useState([]);
  const [delKey, setDelKey] = useState('');
  const [resumeInfo, setResumeInfo] = useState(null);

  const [prep, setPrep] = useState(null); // { slices, hash, fullHex }

  const [isEstim, setIsEstim] = useState(false);
  const [estimate, setEstimate] = useState(null);
  const [batches, setBatches] = useState(null);
  const [ov, setOv] = useState({ open: false });
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [retryCount, setRetryCount] = useState(0);
  const [sliceSize, setSliceSize] = useState(SLICE_MAX_BYTES);

  /*──── meta loader ───*/
  const loadMeta = useCallback(async () => {
    setMeta(null); setExisting([]);
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
    setExisting(
      listUriKeys(m).filter((k) => k.startsWith('extrauri_'))
        .map((k) => ({ key: k, uri: m[k] })),
    );
  }, [contractAddress, tokenId]);
  useEffect(() => { void loadMeta(); }, [loadMeta]);

  /*──── file prep ───*/
  useEffect(() => {
    if (!file) { setDataUrl(''); setPrep(null); return; }
    const ext = (mimeFromFilename(file.name) || file.type || '')
      .split('/').pop().split('+').shift().toLowerCase() || 'bin';
    setDesc(`Extra asset (${ext.toUpperCase()})`);
    setLabel(ext);
    setName(file.name.replace(/\.[^.]+$/, ''));

    const reader = new FileReader();
    reader.onload = async (e) => {
      const url = e.target.result;
      setDataUrl(url);
      const hexStr = `0x${char2Bytes(url)}`;
      const slices = planSlices(hexStr, sliceSize);
      setPrep({
        slices,
        hash: `sha256:${await sha256Hex(hexStr)}`,
        fullHex: hexStr,
      });
    };
    reader.readAsDataURL(file);
  }, [file, sliceSize]);

  const warnMany = prep ? prep.slices.length > 50 : false;
  const oversizeLarge = prep ? prep.fullHex.length / 2 > 100_000 : false;

  /*──── label resolver ───*/
  const finalLabel = useMemo(() => {
    const raw = label.toLowerCase().replace(/^extrauri_/, '');
    const taken = existing.map((e) => e.key.replace(/^extrauri_/, ''));
    if (!raw) return '';
    if (!taken.includes(raw)) return raw;
    let i = 1; while (taken.includes(`${raw}_${i}`)) i += 1;
    return `${raw}_${i}`;
  }, [label, existing]);
  useEffect(() => { if (label && label !== finalLabel) setLabel(finalLabel); }, [finalLabel]);

  /*──── slice-cache ───*/
  useEffect(() => { purgeExpiredSliceCache(); }, []);
  useEffect(() => {
    let active = true;
    if (!tokenId || !finalLabel) { setResumeInfo(null); return undefined; }
    loadSliceCheckpoint(contractAddress, tokenId, finalLabel, network)
      .then((r) => { if (active) setResumeInfo(r); });
    return () => { active = false; };
  }, [contractAddress, tokenId, finalLabel, network]);

  /*──────── build flat ops ─────*/
  const buildFlatParams = useCallback(async (slices) => {
    const c = await toolkit.wallet.at(contractAddress);
    const idNat = +tokenId;

    const onChainKey = `extrauri_${finalLabel}`;
    let currBytes = meta?.[onChainKey] ? (char2Bytes(meta[onChainKey]).length / 2) : 0;
    const currentBytesList = [];
    const ops = slices.map((hx) => {
      currentBytesList.push(currBytes);
      const appended = (hx.length - 2) / 2;
      currBytes += appended;
      return {
        kind: OpKind.TRANSACTION,
        ...c.methods.append_extrauri(
          desc.trim() || 'extra',
          finalLabel,
          name.trim() || 'asset',
          idNat,
          hx,
        ).toTransferParams(),
      };
    });
    return { ops, currentBytesList };
  }, [toolkit, contractAddress, tokenId, finalLabel, desc, name, meta]);

  /*──────── prepare & estimate ─────*/
  const prepareUpload = async (allSlices, startIdx, hash) => {
    setIsEstim(true);
    await new Promise(requestAnimationFrame);
    try {
      const { ops, currentBytesList } = await buildFlatParams(allSlices.slice(startIdx));

      const est = await estimateChunked(toolkit, ops, 1, oversizeLarge, currentBytesList);
      if (est.retrySmaller) {
        if (retryCount >= 3 || sliceSize <= SLICE_MIN_BYTES) throw new Error('Node timeout—try later');
        setSliceSize(Math.max(SLICE_MIN_BYTES, Math.floor(sliceSize / 2)));
        setRetryCount(retryCount + 1);
        return;
      }

      const burn = est.burn || calcStorageMutez(0, allSlices.slice(startIdx));

      setEstimate({
        feeTez: (est.fee / 1e6).toFixed(6),
        storageTez: (burn / 1e6).toFixed(6),
      });

      const packed = await splitPacked(toolkit, ops, PACKED_SAFE_BYTES);
      setBatches(packed);

      await saveSliceCheckpoint(contractAddress, tokenId, finalLabel, {
        total: allSlices.length,
        next: startIdx,
        slices: allSlices,
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
    const onChainKey = `extrauri_${finalLabel}`;
    const onChainHex = meta?.[onChainKey] ? `0x${char2Bytes(meta[onChainKey])}` : '0x';
    const { tail, conflict } = sliceTail(onChainHex, prep.fullHex);
    if (conflict) return snack('Conflict – on-chain bytes differ', 'error');
    const startIdx = prep.slices.length - tail.length;
    if (tail.length === 0) return snack('Asset already fully uploaded', 'success');
    prepareUpload(prep.slices, startIdx, prep.hash);
  };

  const resumeUpload = () => {
    const { slices = [], next = 0, hash = '' } = resumeInfo || {};
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
      await saveSliceCheckpoint(contractAddress, tokenId, finalLabel, {
        ...resumeInfo, next: idx + 1,
      }, network);
      if (idx + 1 === batches.length) {
        await clearSliceCheckpoint(contractAddress, tokenId, finalLabel, network);
        onMutate();
        setOv({ open: true, opHash: op.opHash, current: batches.length, total: batches.length });
      } else {
        runSlice(idx + 1);
      }
    } catch (e) {
      setOv({ open: true, error: true, status: e.message || String(e), current: idx + 1, total: batches.length });
    }
  }, [batches, toolkit, contractAddress, tokenId, finalLabel, resumeInfo, onMutate, network]);

  /*──────── clear ─────*/
  const execClear = async (key) => {
    if (!toolkit) return snack('Connect wallet', 'error');
    try {
      setOv({ open: true, status: 'Waiting for signature…' });
      const c = await toolkit.wallet.at(contractAddress);
      const op = await c.methods.clear_uri(+tokenId, key).send();
      setOv({ open: true, status: 'Broadcasting…' });
      await op.confirmation();
      setExisting((e) => e.filter((x) => x.key !== key));
      snack('Removed', 'success');
      onMutate(); loadMeta();
      setOv({ open: true, opHash: op.opHash });
    } catch (e) {
      setOv({ open: true, error: true, status: e.message || String(e) });
    }
  };

  /*──────── guards ─────*/
  const disabled = isEstim || tokenId === '' || !finalLabel || desc.trim() === '' || name.trim() === '' || !(prep || resumeInfo);

  return (
    <Wrap $level={$level}>
      <PixelHeading level={3} style={{ gridColumn: '1 / -1' }}>Replace ExtraUri</PixelHeading>

      <Hint>
        Stores *extra* media under an **extrauri_* key** (e.g. hi-res, bonus file). Upload, adjust description/label/name, then APPEND. Diff scan avoids re-uploading bytes; a RESUME banner appears on failure. Clear old extras from the inline list.
      </Hint>

      {/* token picker */}
      <FormRow>
        <PixelInput
          placeholder="Token-ID"
          style={{ flex: 1 }}
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value.replace(/\D/g, ''))}
        />
        <SelectWrap>
          <select
            style={{ width: '100%', height: 32 }}
            disabled={loadingTok}
            value={tokenId || ''}
            onChange={(e) => setTokenId(e.target.value)}
          >
            <option value="">
              {loadingTok ? 'Loading…' : tokOpts.length ? 'Select token' : '— none —'}
            </option>
            {tokOpts.map(({ id, name }) => <option key={id} value={id}>{name ? `${id} — ${name}` : id}</option>)}
          </select>
          {loadingTok && <Spinner />}
        </SelectWrap>
      </FormRow>

      {resumeInfo && !file && (
        <p style={{ gridColumn: '1 / -1', margin: '8px 0', fontSize: '.8rem', color: 'var(--zu-accent)' }}>
          In-progress upload ({resumeInfo.next}/{resumeInfo.total} slices).
          <PixelButton size="xs" style={{ marginLeft: 6 }} onClick={resumeUpload}>
            Resume Upload
          </PixelButton>
        </p>
      )}

      {warnMany && <p style={{ gridColumn: '1 / -1', color: 'var(--zu-warn)' }}>Warning: Large file requires ~{prep.slices.length} signatures due to node limits.</p>}

      {/* upload & preview */}
      <PreviewGrid>
        <div>
          <MintUpload onFileChange={setFile} />
          {dataUrl && (
            <RenderMedia uri={dataUrl} alt={file?.name} style={{ width: '100%', maxHeight: 220, margin: '6px auto', objectFit: 'contain' }} />
          )}
        </div>
        <div>
          <TokenMetaPanel meta={meta} tokenId={tokenId} contractAddress={contractAddress} />
        </div>
      </PreviewGrid>

      {/* inputs */}
      <FormRow>
        <label style={{ display: 'block', fontSize: '.7rem' }}>
          Description*
          <PixelInput value={desc} onChange={(e) => setDesc(e.target.value)} />
        </label>
        <label style={{ display: 'block', fontSize: '.7rem' }}>
          Label* (a-z0-9_-)
          <PixelInput
            placeholder="key"
            value={label}
            onChange={(e) => setLabel(e.target.value.toLowerCase().replace(/\s+/g, ''))}
          />
        </label>
        <label style={{ display: 'block', fontSize: '.7rem' }}>
          Name*
          <PixelInput value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </FormRow>

      {/* existing */}
      <div style={{ gridColumn: '1 / -1', margin: '.6rem 0' }}>
        <strong>Existing extra URIs:</strong>
        {existing.length ? (
          <ul style={{ margin: '.25rem 0 0', padding: 0, listStyle: 'none' }}>
            {existing.map(({ key, uri }) => (
              <li key={key} style={{ fontSize: '.75rem', marginTop: '.25rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <RenderMedia uri={uri} alt={key} style={{ width: 32, height: 32, objectFit: 'contain' }} />
                <code>{key}</code>
                <PixelButton size="xs" warning onClick={() => setDelKey(key)}>CLEAR</PixelButton>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ fontSize: '.75rem', margin: '.25rem 0 0' }}>None</p>
        )}
      </div>

      {/* CTA */}
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '.6rem', alignItems: 'center', marginTop: '.8rem' }}>
        <PixelButton disabled={disabled} onClick={handleAppendClick}>
          {resumeInfo && !file ? 'RESUME' : isEstim ? 'Estimating…' : 'APPEND'}
        </PixelButton>
        {isEstim && <Spinner style={{ position: 'static' }} />}
      </div>

      {/* dialogs */}
      {confirmOpen && (
        <OperationConfirmDialog
          open
          estimate={estimate}
          slices={batches?.length || 1}
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
        open={!!delKey}
        title="Remove extra URI"
        message={`Remove extra asset “${delKey}” from token ${tokenId}?`}
        onOk={() => { const k = delKey; setDelKey(''); execClear(k); }}
        onCancel={() => setDelKey('')}
      />
    </Wrap>
  );
}
/* What changed & why: Widened modal to 96vw matching I102 blueprint; rev-bump r822; Compile-Guard passed.
 */
/* EOF */