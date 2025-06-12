/*Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/AppendExtraUri.jsx
  Rev :    r581   2025-06-14
  Summary: same stray-brace fix in both token-meta & token-list URLs. */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

import { splitPacked, sliceHex, PACKED_SAFE_BYTES } from '../../core/batch.js';
import {
  strHash, loadSliceCache, saveSliceCache,
  clearSliceCache, purgeExpiredSliceCache,
} from '../../utils/sliceCache.js';
import { jFetch }           from '../../core/net.js';
import { mimeFromFilename } from '../../constants/mimeTypes.js';
import { useWalletContext } from '../../contexts/WalletContext.js';
import { TZKT_API }         from '../../config/deployTarget.js';
import { listUriKeys }      from '../../utils/uriHelpers.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap        = styled.section`margin-top:1.5rem;`;
const SelectWrap  = styled.div`position:relative;flex:1;`;
const SpinnerIcon = styled.img.attrs({ src:'/sprites/loading16x16.gif', alt:'' })`
  position:absolute;top:8px;right:8px;width:16px;height:16px;
  image-rendering:pixelated;
`;

const API     = `${TZKT_API}/v1`;
const hex2str = (h)=>Buffer.from(h.replace(/^0x/,''),'hex').toString('utf8');

const LABEL_RX = /^[a-z0-9_\-]{1,32}$/;
const NAME_RX  = /^.{1,64}$/;
const DESC_RX  = /^.{1,160}$/;

export default function AppendExtraUri({
  contractAddress,
  setSnackbar = () => {},
  onMutate = () => {},
  $level,
}) {
  const { toolkit } = useWalletContext() || {};
  const snack = (m, s = 'info') => setSnackbar({ open: true, message: m, severity: s });

  const [tokOpts, setTokOpts] = useState([]);
  const [loadingTok, setLoadingTok] = useState(false);

  /*──── token list fetch – brace fixed ───*/
const fetchTokens = useCallback(async () => {
  if (!contractAddress) return;
  setLoadingTok(true);
  const seen = new Set();
  const push = a => a.forEach(n => Number.isFinite(n) && seen.add(n));

  try {
    const rows = await jFetch(
      `${API}/tokens?contract=${contractAddress}&select=tokenId&limit=10000`,
    );                               // ← brace removed
    push(rows.map(r => +r.tokenId));
  } catch {}
    if (!seen.size) {
      try {
        const rows = await jFetch(`${API}/contracts/${contractAddress}/bigmaps/token_metadata/keys?limit=10000`);
        push(rows.map(r => +r.key));
      } catch {}
    }
    if (!seen.size) {
      try {
        const st = await jFetch(`${API}/contracts/${contractAddress}/storage`);
        if (Array.isArray(st?.active_tokens)) push(st.active_tokens.map(n => +n));
      } catch {}
    }
    setTokOpts([...seen].sort((a, b) => a - b));
    setLoadingTok(false);
  }, [contractAddress]);

  useEffect(() => { void fetchTokens(); }, [fetchTokens]);

  const [tokenId, setTokenId] = useState('');
  const [file, setFile] = useState(null);
  const [dataUrl, setDataUrl] = useState('');
  const [desc, setDesc] = useState('');
  const [label, setLabel] = useState('');
  const [name, setName] = useState('');
  const [meta, setMeta] = useState(null);
  const [existing, setExisting] = useState([]);
  const [isEstim, setIsEstim] = useState(false);
  const [delKey, setDelKey] = useState('');
  const [resumeInfo, setResumeInfo] = useState(null);

/*──── meta loader – brace fixed ───*/
const loadMeta = useCallback(async id => {
  if (!contractAddress || id === '') { setMeta(null); setExisting([]); return; }

  let rows = [];
  try {
    rows = await jFetch(
      `${API}/tokens?contract=${contractAddress}&tokenId=${id}&limit=1`,
    );                               // ← brace removed
  } catch {}

  if (!rows.length) {
    try {
      const one = await jFetch(
        `${API}/contracts/${contractAddress}/bigmaps/token_metadata/keys/${id}`,
      );
      if (one?.value) rows = [{ metadata: JSON.parse(hex2str(one.value)) }];
    } catch {}
  }

  const m = rows[0]?.metadata || {};
  setMeta(m);
  setExisting(
    listUriKeys(m).filter(k => k.startsWith('extrauri_'))
      .map(k => ({ key: k, uri: m[k] })),
  );
}, [contractAddress]);

  useEffect(() => { loadMeta(tokenId); }, [tokenId, loadMeta]);

  useEffect(() => {
    if (!file) return;
    const ext = (mimeFromFilename?.(file.name) || file.type || '')
      .split('/').pop().split('+').shift().toLowerCase() || 'bin';
    setDesc(`Extra asset (${ext.toUpperCase()})`);
    setLabel(ext);
    setName(file.name.replace(/\.[^.]+$/, ''));
  }, [file]);

  const finalLabel = useMemo(() => {
    const raw = label.toLowerCase().replace(/^extrauri_/, '');
    const taken = existing.map(e => e.key.replace(/^extrauri_/, ''));
    if (!raw) return '';
    if (!taken.includes(raw)) return raw;
    let i = 1;
    while (taken.includes(`${raw}_${i}`)) i += 1;
    return `${raw}_${i}`;
  }, [label, existing]);

  useEffect(() => { if (label && label !== finalLabel) setLabel(finalLabel); }, [finalLabel]);

  /* purge old caches on mount */
  useEffect(() => { purgeExpiredSliceCache(1); }, []);

  useEffect(() => {
    if (!tokenId || !finalLabel) return;
    const c = loadSliceCache(contractAddress, tokenId, finalLabel);
    if (c) setResumeInfo(c);
  }, [contractAddress, tokenId, finalLabel]);

  const [batches, setBatches] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [slicesTotal, setSlicesTotal] = useState(1);
  const [estimate, setEstimate] = useState(null);
  const [ov, setOv] = useState({ open: false });

  const reset = () => {
    setFile(null);
    setDataUrl('');
    setDesc('');
    setLabel('');
    setName('');
    setMeta(null);
    setExisting([]);
    setDelKey('');
    setBatches(null);
    setConfirmOpen(false);
    setEstimate(null);
    setIsEstim(false);
    setSlicesTotal(1);
    setResumeInfo(null);
    clearSliceCache(contractAddress, tokenId, finalLabel);
  };

  const buildFlatParams = useCallback(async (hexSlices, startIdx) => {
    const idNat = +tokenId;
    const c = await toolkit.wallet.at(contractAddress);
    return hexSlices.slice(startIdx).map(hx => ({
      kind: OpKind.TRANSACTION,
      ...c.methods.append_extrauri(desc, finalLabel, name, idNat, hx).toTransferParams(),
    }));
  }, [toolkit, contractAddress, tokenId, desc, finalLabel, name]);

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

      saveSliceCache(contractAddress, tokenId, finalLabel, {
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
    if (!file) return;
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
    beginUpload(resumeInfo.slices, resumeInfo.nextIdx, resumeInfo.hash);
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
        saveSliceCache(contractAddress, tokenId, finalLabel, upd);
        setResumeInfo(upd);
        requestAnimationFrame(() => runSlice(batchIdx + 1));
      } else {
        clearSliceCache(contractAddress, tokenId, finalLabel);
        setOv({ open: true, opHash: op.opHash });
        onMutate();
        reset();
      }
    } catch (e) {
      setOv({ open: true, error: e.message || String(e), current: nextGlobalIdx + 1, total: slicesTotal });
    }
  }, [batches, resumeInfo, slicesTotal, toolkit, contractAddress, tokenId, finalLabel, onMutate]);

  const execClear = async key => {
    if (!toolkit) return snack('Connect wallet', 'error');
    try {
      setOv({ open: true, status: 'Waiting for signature…' });
      const c = await toolkit.wallet.at(contractAddress);
      const op = await c.methods.clear_uri(+tokenId, key).send();
      setOv({ open: true, status: 'Broadcasting…' });
      await op.confirmation();
      setExisting(e => e.filter(x => x.key !== key));
      setOv({ open: false });
      snack('Removed', 'success');
      onMutate();
      loadMeta(tokenId);
    } catch (e) {
      setOv({ open: false });
      snack(e.message, 'error');
    }
  };

  const disabled = (!file && !resumeInfo) || tokenId === '' || isEstim || !!batches;
  const oversize = (dataUrl || '').length > 45_000;

  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Append Extra URI</PixelHeading>

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
              {loadingTok ? 'Loading…' : tokOpts.length ? 'Select token' : '— none —'}
            </option>
            {tokOpts.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
          {loadingTok && <SpinnerIcon />}
        </SelectWrap>
      </div>

      {resumeInfo && !file && (
        <div style={{ margin: '8px 0', fontSize: '.8rem', color: 'var(--zu-accent)' }}>
          In-progress upload ({resumeInfo.nextIdx}/{resumeInfo.total} slices).
          <PixelButton size="xs" style={{ marginLeft: 6 }} onClick={resumeUpload}>
            Repair Upload
          </PixelButton>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '.5rem', justifyContent: 'space-between' }}>
        <div style={{ flex: '0 1 48%', minWidth: 220 }}>
          <MintUpload onFileChange={setFile} />
          {dataUrl && (
            <RenderMedia
              uri={dataUrl}
              alt={file?.name}
              style={{ width: '100%', maxHeight: 220, margin: '6px auto', objectFit: 'contain' }}
            />
          )}
        </div>
        <div style={{ flex: '0 1 48%', minWidth: 240 }}>
          <TokenMetaPanel meta={meta} tokenId={tokenId} />
        </div>
      </div>

      <label style={{ display: 'block', marginTop: '.5rem', fontSize: '.7rem' }}>
        Description*
        <PixelInput value={desc} onChange={e => setDesc(e.target.value)} />
      </label>
      <label style={{ display: 'block', fontSize: '.7rem' }}>
        Label* (a-z0-9_-)
        <PixelInput
          placeholder="key"
          value={label}
          onChange={e => setLabel(e.target.value.toLowerCase().replace(/\s+/g, ''))}
        />
      </label>
      <label style={{ display: 'block', fontSize: '.7rem' }}>
        Name*
        <PixelInput value={name} onChange={e => setName(e.target.value)} />
      </label>

      <div style={{ margin: '.6rem 0' }}>
        <strong>Existing extra URIs:</strong>
        {existing.length === 0 && <p style={{ fontSize: '.7rem', margin: '.25rem 0 .5rem' }}>none yet…</p>}
        {existing.length > 0 && (
          <ul style={{ paddingLeft: 16, margin: '.25rem 0' }}>
            {existing.map(ex => (
              <li key={ex.key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                {/data:image/i.test(ex.uri)
                  ? <RenderMedia uri={ex.uri} alt="" style={{ width: 48, height: 48, objectFit: 'contain' }} />
                  : <span style={{ fontSize: '.7rem' }}>[blob]</span>}
                <span style={{ whiteSpace: 'nowrap' }}>{ex.key}</span>
                <PixelButton size="xs" warning style={{ marginLeft: 'auto' }} onClick={() => setDelKey(ex.key)}>
                  Remove
                </PixelButton>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', marginTop: '.8rem' }}>
        <PixelButton onClick={() => setConfirmOpen(true)} disabled={disabled}>
          {resumeInfo && !file ? 'RESUME' : isEstim ? 'Estimating…' : 'APPEND'}
        </PixelButton>
        {isEstim && <SpinnerIcon />}
        {oversize && !batches && (
          <span style={{ fontSize: '.7rem', opacity: .8 }}>Large upload detected – please wait…</span>
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
        open={!!delKey}
        message={`Remove “${delKey}” from token ${tokenId}?`}
        onOk={() => { execClear(delKey); setDelKey(''); }}
        onCancel={() => setDelKey('')}
      />
    </Wrap>
  );
}
/* EOF */