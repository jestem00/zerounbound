/*Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/AppendArtifactUri.jsx
  Rev :    r720   2025-06-28 T04:33 UTC
  Summary: solid retry flow + chunked estimator */

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

import { splitPacked, sliceHex, PACKED_SAFE_BYTES } from '../../core/batch.js';
import {
  loadSliceCheckpoint, saveSliceCheckpoint,
  clearSliceCheckpoint, purgeExpiredSliceCache,
} from '../../utils/sliceCache.js';
import { jFetch }           from '../../core/net.js';
import { mimeFromFilename } from '../../constants/mimeTypes.js';
import { useWalletContext } from '../../contexts/WalletContext.js';
import { TZKT_API }         from '../../config/deployTarget.js';
import listLiveTokenIds     from '../../utils/listLiveTokenIds.js';

/*──────── styled shells ─────*/
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap        = styled.section`margin-top:1.5rem;`;
const SelectWrap  = styled.div`position:relative;flex:1;`;
const Spinner     = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;
`;

/*──────── helpers ─────*/
const API     = `${TZKT_API}/v1`;
const hex2str = (h) => Buffer.from(h.replace(/^0x/, ''), 'hex').toString('utf8');

async function sha256Hex (txt = '') {
  const buf  = new TextEncoder().encode(txt);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* RPC sim caps at 10 tx – chunk estimator */
async function estimateChunked (toolkit, ops, chunk = 8) {
  let fee = 0; let burn = 0;
  for (let i = 0; i < ops.length; i += chunk) {
    const est = await toolkit.estimate.batch(ops.slice(i, i + chunk));
    fee  += est.reduce((t, e) => t + e.suggestedFeeMutez, 0);
    burn += est.reduce((t, e) => t + e.burnFeeMutez, 0);
  }
  return { fee, burn };
}

/*════════ component ════════════════════════════════════════*/
export default function AppendArtifactUri({
  contractAddress,
  setSnackbar = () => {},
  onMutate    = () => {},
  $level,
}) {
  const { toolkit } = useWalletContext() || {};
  const snack = (m, s='info') => setSnackbar({ open:true, message:m, severity:s });

  /* token list */
  const [tokOpts, setTokOpts]       = useState([]);
  const [loadingTok, setLoadingTok] = useState(false);

  const fetchTokens = useCallback(async () => {
    if (!contractAddress) return;
    setLoadingTok(true);
    setTokOpts(await listLiveTokenIds(contractAddress, undefined, true));
    setLoadingTok(false);
  }, [contractAddress]);

  useEffect(() => { void fetchTokens(); }, [fetchTokens]);

  /* local state */
  const [tokenId, setTokenId]    = useState('');
  const [file,    setFile]       = useState(null);
  const [dataUrl, setDataUrl]    = useState('');
  const [meta,    setMeta]       = useState(null);
  const [hasArtUri, setHasArtUri]= useState(false);

  const [isEstim, setIsEstim]    = useState(false);
  const [delOpen, setDelOpen]    = useState(false);

  const [resumeInfo, setResumeInfo] = useState(null);
  const mime = mimeFromFilename?.(file?.name) || file?.type || '';

  /*──── meta loader ───*/
  const loadMeta = useCallback(async (id) => {
    setMeta(null); setHasArtUri(false);
    if (!contractAddress || id==='') return;

    let rows = [];
    try {
      rows = await jFetch(`${API}/tokens?contract=${contractAddress}&tokenId=${id}&limit=1`);
    } catch {}

    if (!rows.length) {
      try {
        const bm = await jFetch(`${API}/contracts/${contractAddress}/bigmaps/token_metadata/keys/${id}`);
        if (bm?.value) rows = [{ metadata: JSON.parse(hex2str(bm.value)) }];
      } catch {}
    }

    const m = rows[0]?.metadata || {};
    setMeta(m);
    setHasArtUri(!!m.artifactUri);
  }, [contractAddress]);

  useEffect(() => { void loadMeta(tokenId); }, [tokenId, loadMeta]);

  /* batch & overlay state */
  const [batches,      setBatches]      = useState(null);
  const [confirmOpen,  setConfirmOpen]  = useState(false);
  const [slicesTotal,  setSlicesTotal]  = useState(1);
  const [estimate,     setEstimate]     = useState(null);
  const [ov,           setOv]           = useState({ open:false });

  /* helpers */
  const reset = () => {
    setFile(null); setDataUrl('');
    setResumeInfo(null); setMeta(null); setHasArtUri(false);
    setBatches(null); setConfirmOpen(false); setEstimate(null);
    setIsEstim(false); setSlicesTotal(1); setDelOpen(false);
    clearSliceCheckpoint(contractAddress, tokenId, 'artifactUri');
  };

  useEffect(() => { purgeExpiredSliceCache(); }, []);

  useEffect(() => {
    if (!tokenId) return;
    const c = loadSliceCheckpoint(contractAddress, tokenId, 'artifactUri');
    if (c) setResumeInfo(c);
  }, [contractAddress, tokenId]);

  /* estimate helper */
  const buildFlatParams = useCallback(async (hexSlices, startIdx) => {
    const idNat = +tokenId;
    const c = await toolkit.wallet.at(contractAddress);
    return hexSlices.slice(startIdx).map((hx) => ({
      kind: OpKind.TRANSACTION,
      ...c.methods.append_artifact_uri(idNat, hx).toTransferParams(),
    }));
  }, [toolkit, contractAddress, tokenId]);

  const beginUpload = async (hexSlices, startIdx=0, hash) => {
    setIsEstim(true);
    await new Promise(requestAnimationFrame);
    try {
      const flat   = await buildFlatParams(hexSlices, startIdx);

      const { fee, burn } = await estimateChunked(toolkit, flat);
      setEstimate({
        feeTez:(fee /1e6).toFixed(6),
        storageTez:(burn/1e6).toFixed(6),
      });

      const packed = await splitPacked(toolkit, flat, PACKED_SAFE_BYTES);
      setBatches(packed.length ? packed : [flat]);
      setSlicesTotal(hexSlices.length);

      saveSliceCheckpoint(contractAddress, tokenId, 'artifactUri', {
        hash, total:hexSlices.length, next:startIdx, slices:hexSlices,
      });
      setResumeInfo({ hash, total:hexSlices.length, next:startIdx, slices:hexSlices });
      setConfirmOpen(true);
    } catch (e) { snack(e.message, 'error'); }
    finally { setIsEstim(false); }
  };

  useEffect(() => {
    if (!file) { setDataUrl(''); return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const url   = e.target.result;
      setDataUrl(url);
      const hexStr = `0x${char2Bytes(url)}`;
      const slices = sliceHex(hexStr);
      const digest = await sha256Hex(hexStr);
      beginUpload(slices, 0, `sha256:${digest}`);
    };
    reader.readAsDataURL(file);
  }, [file]);                               // eslint-disable-line react-hooks/exhaustive-deps

  const resumeUpload = () => {
    const { slices, next, hash } = resumeInfo;
    beginUpload(slices, next, hash);
  };

  /*──────── retry-safe slice runner ─────*/
  const runSlice = useCallback(async (idx) => {
    if (!batches || idx >= batches.length) return;
    setOv({ open:true, status:'Preparing transaction…', current:idx+1, total:batches.length });
    try {
      const op = await toolkit.wallet.batch(batches[idx]).send();
      setOv({ open:true, status:'Waiting for confirmation…', current:idx+1, total:batches.length });
      await op.confirmation();

      if (idx + 1 < batches.length) {
        requestAnimationFrame(() => runSlice(idx + 1));
      } else {
        clearSliceCheckpoint(contractAddress, tokenId, 'artifactUri');
        setOv({ open:true, opHash:op.opHash });
        onMutate(); reset();
      }
    } catch (e) {
      setOv({ open:true, error:true, status:e.message || String(e),
              current:idx+1, total:batches.length });
    }
  }, [batches, toolkit, contractAddress, tokenId, onMutate]);

  const execClear = async () => {
    if (!toolkit) return snack('Connect wallet', 'error');
    try {
      setOv({ open:true, status:'Waiting for signature…' });
      const c = await toolkit.wallet.at(contractAddress);
      const op = await c.methods.clear_uri(+tokenId, 'artifactUri').send();
      setOv({ open:true, status:'Broadcasting…' });
      await op.confirmation();
      snack('Cleared ✓','success');
      onMutate(); loadMeta(tokenId); reset(); setOv({ open:false });
    } catch (e) { setOv({ open:false }); snack(e.message, 'error'); }
  };

  const disabled = (!file && !resumeInfo) || tokenId==='' ||
                   isEstim || !!batches || hasArtUri;

  const oversize = (dataUrl || '').length > 45_000;

  /*──────── JSX ───*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Append Artifact URI</PixelHeading>

      {/* token picker */}
      <div style={{ display:'flex', gap:'.5rem' }}>
        <PixelInput
          placeholder="Token-ID"
          style={{ flex:1 }}
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value.replace(/\D/g, ''))}
        />
        <SelectWrap>
          <select
            style={{ width:'100%', height:32 }}
            disabled={loadingTok}
            value={tokenId || ''}
            onChange={(e) => setTokenId(e.target.value)}
          >
            <option value="">
              {loadingTok
                ? 'Loading…'
                : tokOpts.length ? 'Select token' : '— none —'}
            </option>
            {tokOpts.map((t) => {
              const id   = typeof t === 'object' ? t.id   : t;
              const name = typeof t === 'object' ? t.name : '';
              return (
                <option key={id} value={id}>
                  {name ? `${id} — ${name}` : id}
                </option>
              );
            })}
          </select>
          {loadingTok && <Spinner />}
        </SelectWrap>
      </div>

      {resumeInfo && !file && (
        <p style={{ margin:'8px 0', fontSize:'.8rem', color:'var(--zu-accent)' }}>
          In-progress upload ({resumeInfo.next}/{resumeInfo.total} slices).
          <PixelButton size="xs" style={{ marginLeft:6 }} onClick={resumeUpload}>
            Resume Upload
          </PixelButton>
        </p>
      )}

      {hasArtUri && (
        <p style={{ fontSize:'.75rem', color:'var(--zu-accent-sec)', margin:'6px 0 8px' }}>
          Token already has <code>artifactUri</code>. Clear first&nbsp;–
          <PixelButton size="xs" warning style={{ marginLeft:6 }} onClick={()=>setDelOpen(true)}>
            Clear URI
          </PixelButton>
        </p>
      )}

      {/* upload & preview */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'1rem', marginTop:'.5rem',
                    justifyContent:'space-between' }}>
        <div style={{ flex:'0 1 48%', minWidth:220 }}>
          <MintUpload onFileChange={setFile} accept="*/*"/>
          {dataUrl && (
            <RenderMedia
              uri={dataUrl} alt={file?.name}
              style={{ width:'100%', maxHeight:220, margin:'6px auto',
                       objectFit:'contain' }}
            />
          )}
          {mime && (
            <p style={{ fontSize:'.7rem', textAlign:'center', marginTop:4 }}>
              Detected MIME: {mime}
            </p>
          )}
        </div>
        <div style={{ flex:'0 1 48%', minWidth:240 }}>
          <TokenMetaPanel meta={meta} tokenId={tokenId} contractAddress={contractAddress}/>
        </div>
      </div>

       {/* CTA row */}
      <div style={{ display:'flex', gap:'.6rem', alignItems:'center', marginTop:'.8rem' }}>
        <PixelButton disabled={disabled} onClick={()=>setConfirmOpen(true)}>
          {resumeInfo && !file ? 'RESUME'
                               : isEstim    ? 'Estimating…'
                                            : 'APPEND'}
        </PixelButton>
        {isEstim && <Spinner style={{ position:'static' }} />}
        {oversize && !batches && (
          <span style={{ fontSize:'.7rem', opacity:.8 }}>
            Large file – estimation may take ≈10&nbsp;s
          </span>
        )}
      </div>

      {/* overlay + dialogs */}
      {ov.open && (
        <OperationOverlay
          {...ov}
          onRetry={() => runSlice((ov.current ?? 1) - 1)}
          onCancel={() => { setOv({ open:false }); reset(); }}
        />
      )}
      {confirmOpen && (
        <OperationConfirmDialog
          open
          estimate={estimate}
          slices={batches?.length || 1}
          onOk   ={()=>{ setConfirmOpen(false); runSlice(0); }}
          onCancel={()=>{ setConfirmOpen(false); reset(); }}
        />
      )}
      <PixelConfirmDialog
        open={delOpen}
        message={`Remove existing artifactUri from token ${tokenId}?`}
        onOk   ={()=>{ setDelOpen(false); execClear(); }}
        onCancel={()=> setDelOpen(false)}
      />
    </Wrap>
  );
}
/* EOF */