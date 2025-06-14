/*Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/AppendExtraUri.jsx
  Rev :    r732   2025-06-28 T04:45 UTC
  Summary: restore oversize guard + robust retry */

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
import { listUriKeys }      from '../../utils/uriHelpers.js';
import listLiveTokenIds     from '../../utils/listLiveTokenIds.js';

/*──────── styled shells ─────*/
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap        = styled.section`margin-top:1.5rem;`;
const SelectWrap  = styled.div`position:relative;flex:1;`;
const Hint        = styled.p`font-size:.7rem;margin:.4rem 0 .3rem;opacity:.8;`;
const Spinner     = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;
`;

/*──────── helpers ─────*/
const API     = `${TZKT_API}/v1`;
const hex2str = (h) => Buffer.from(h.replace(/^0x/, ''), 'hex').toString('utf8');

/* chunked estimator – rpc limit = 10 ops / sim */
async function estimateChunked (toolkit, ops, chunk=8){
  let fee=0, burn=0;
  for(let i=0;i<ops.length;i+=chunk){
    const est=await toolkit.estimate.batch(ops.slice(i,i+chunk));
    fee += est.reduce((t,e)=>t+e.suggestedFeeMutez,0);
    burn+= est.reduce((t,e)=>t+e.burnFeeMutez     ,0);
  }
  return { fee, burn };
}

async function sha256Hex (txt='') {
  const buf = new TextEncoder().encode(txt);
  const hash= await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b=>b.toString(16).padStart(2,'0')).join('');
}

/*════════ component ════════════════════════════════════════*/
export default function AppendExtraUri({ contractAddress,
  setSnackbar=()=>{}, onMutate=()=>{}, $level }) {

  const { toolkit } = useWalletContext() || {};
  const snack = (m,s='info') => setSnackbar({ open:true,message:m,severity:s });

  /* token list */
  const [tokOpts,setTokOpts]       = useState([]);
  const [loadingTok,setLoadingTok] = useState(false);

  const fetchTokens = useCallback(async () => {
    if (!contractAddress) return;
    setLoadingTok(true);
    setTokOpts(await listLiveTokenIds(contractAddress, undefined, true));
    setLoadingTok(false);
  }, [contractAddress]);

  useEffect(()=>{ void fetchTokens(); },[fetchTokens]);

  /* local state */
  const [tokenId,setTokenId]   = useState('');
  const [file,setFile]         = useState(null);
  const [dataUrl,setDataUrl]   = useState('');
  const [desc,setDesc]         = useState('');
  const [label,setLabel]       = useState('');
  const [name,setName]         = useState('');
  const [meta,setMeta]         = useState(null);
  const [existing,setExisting] = useState([]);
  const [isEstim,setIsEstim]   = useState(false);
  const [delKey,setDelKey]     = useState('');
  const [resumeInfo,setResumeInfo] = useState(null);
  const [slicesTotal, setSlicesTotal] = useState(1);

  /* pre-sliced payload */
  const [prep,setPrep]         = useState(null);      // { slices, hash }

  /*──── meta loader ───*/
  const loadMeta = useCallback(async id=>{
    setMeta(null); setExisting([]);
    if(!contractAddress || id==='') return;

    let rows=[];
    try{
      rows = await jFetch(`${API}/tokens?contract=${contractAddress}&tokenId=${id}&limit=1`);
    }catch{}

    if(!rows.length){
      try{
        const bm = await jFetch(`${API}/contracts/${contractAddress}/bigmaps/token_metadata/keys/${id}`);
        if(bm?.value) rows=[{metadata:JSON.parse(hex2str(bm.value))}];
      }catch{}
    }

    const m = rows[0]?.metadata || {};
    setMeta(m);
    setExisting(
      listUriKeys(m).filter(k=>k.startsWith('extrauri_'))
        .map(k=>({ key:k, uri:m[k] })),
    );
  },[contractAddress]);

  useEffect(()=>{ loadMeta(tokenId); },[tokenId,loadMeta]);

  /* detect file-type → pre-fill & slice */
  useEffect(()=>{
    if(!file) return;
    const ext = (mimeFromFilename?.(file.name)||file.type||'')
      .split('/').pop().split('+').shift().toLowerCase() || 'bin';
    setDesc(`Extra asset (${ext.toUpperCase()})`);
    setLabel(ext);
    setName(file.name.replace(/\.[^.]+$/, ''));

    const reader = new FileReader();
    reader.onload = async e=>{
      const url=e.target.result;
      setDataUrl(url);
      const hexStr=`0x${char2Bytes(url)}`;
      setPrep({
        slices: sliceHex(hexStr),
        hash  : `sha256:${await sha256Hex(hexStr)}`,
      });
    };
    reader.readAsDataURL(file);
  },[file]);

  /* label resolver */
  const finalLabel = useMemo(()=>{
    const raw = label.toLowerCase().replace(/^extrauri_/, '');
    const taken = existing.map(e=>e.key.replace(/^extrauri_/, ''));
    if(!raw) return '';
    if(!taken.includes(raw)) return raw;
    let i=1; while(taken.includes(`${raw}_${i}`)) i+=1;
    return `${raw}_${i}`;
  },[label,existing]);

  useEffect(()=>{ if(label && label!==finalLabel) setLabel(finalLabel); },[finalLabel]);

  /* slice-cache housekeeping */
  useEffect(()=>{ purgeExpiredSliceCache(); },[]);
  useEffect(()=>{
    if(!tokenId||!finalLabel) return;
    const c = loadSliceCheckpoint(contractAddress,tokenId,finalLabel);
    if(c) setResumeInfo(c);
  },[contractAddress, tokenId, finalLabel]);

  /*── build params ─*/
  const buildFlatParams = useCallback(async (hexSlices, startIdx) => {
    const idNat  = +tokenId;
    const c      = await toolkit.wallet.at(contractAddress);
    return hexSlices.slice(startIdx).map((hx) => ({
      kind: OpKind.TRANSACTION,
      ...c.methods.append_extrauri(
        desc.trim()  || 'extra',
        finalLabel,
        name.trim()  || 'asset',
        idNat,
        hx,
      ).toTransferParams(),
    }));
  }, [toolkit, contractAddress, tokenId, finalLabel, desc, name]);

  /* batch / overlay state */
  const [batches,      setBatches]      = useState(null);
  const [estimate,     setEstimate]     = useState(null);
  const [ov,           setOv]           = useState({ open:false });
  const [confirmOpen,  setConfirmOpen]  = useState(false);

  const beginUpload = async (slices, startIdx = 0, hash) => {
    setIsEstim(true);
    await new Promise(requestAnimationFrame);
    try {
      const flat = await buildFlatParams(slices, startIdx);

      /* ⇣ chunked estimator – handles >10 ops */
      const { fee, burn } = await estimateChunked(toolkit, flat);

      setEstimate({
        feeTez    : (fee / 1e6).toFixed(6),
        storageTez: (burn / 1e6).toFixed(6),
      });

      const packed = await splitPacked(toolkit, flat, PACKED_SAFE_BYTES);
      setBatches(packed.length ? packed : [flat]);
      setSlicesTotal(slices.length);

      const resume = { total:slices.length, next:startIdx, hash, slices };
      saveSliceCheckpoint(contractAddress, tokenId, finalLabel, resume);
      setResumeInfo(resume);
      setConfirmOpen(true);
    } catch (e) { snack(e.message,'error'); }
    finally   { setIsEstim(false); }
  };

  const resumeUpload = () => {
    const { slices = [], next = 0, hash = '' } = resumeInfo || {};
    beginUpload(slices, next, hash);
  };

  const handleAppendClick = () => { if (prep) beginUpload(prep.slices,0,prep.hash); };

  const reset = () => {
    setFile(null); setDataUrl('');
    setPrep(null);
    setResumeInfo(null); setEstimate(null);
    setBatches(null); setConfirmOpen(false); setSlicesTotal(1);
    clearSliceCheckpoint(contractAddress, tokenId, finalLabel);
  };

  /* retry-safe runner – same pattern as Repair/Artifact */
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
        clearSliceCheckpoint(contractAddress, tokenId, finalLabel);
        setOv({ open:true, opHash:op.opHash });
        onMutate(); reset();
      }
    } catch (e) {
      setOv({ open:true, error:true, status:e.message || String(e),
              current:idx+1, total:batches.length });
    }
  }, [batches, toolkit, contractAddress, tokenId, finalLabel, onMutate]);

  const execClear = async key=>{
    if(!toolkit) return snack('Connect wallet','error');
    try{
      setOv({ open:true,status:'Waiting for signature…' });
      const c=await toolkit.wallet.at(contractAddress);
      const op=await c.methods.clear_uri(+tokenId,key).send();
      setOv({ open:true,status:'Broadcasting…' });
      await op.confirmation();
      setExisting(e=>e.filter(x=>x.key!==key));
      snack('Removed','success');
      onMutate(); loadMeta(tokenId); setOv({ open:false });
    }catch(e){ setOv({ open:false }); snack(e.message,'error'); }
  };

  /* guards */
  /* oversize helper refreshed every render */
  const oversize = useMemo(
    () => (dataUrl || '').length > 45_000,
    [dataUrl],
  );
  const disabled = (
    isEstim || tokenId==='' || !(prep||resumeInfo) ||
    !finalLabel || desc.trim()==='' || name.trim()===''
  );

  /*──────── JSX ───*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Append&nbsp;Extra&nbsp;URI</PixelHeading>

      {/* token picker */}
      <div style={{ display:'flex',gap:'.5rem' }}>
        <PixelInput
          placeholder="Token-ID"
          style={{ flex:1 }}
          value={tokenId}
          onChange={e=>setTokenId(e.target.value.replace(/\D/g,''))}
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
        <p style={{ margin:'8px 0',fontSize:'.8rem',color:'var(--zu-accent)' }}>
          In-progress upload ({resumeInfo.next}/{resumeInfo.total} slices).
          <PixelButton size="xs" style={{ marginLeft:6 }} onClick={resumeUpload}>
            Resume Upload
          </PixelButton>
        </p>
      )}

      {/* instructions */}
      <Hint>
        1&nbsp;Upload a new asset → 2&nbsp;check/adjust fields →
        3&nbsp;click <strong>APPEND</strong>. The asset will be stored on-chain
        under an <code>extrauri_*</code> key.
      </Hint>

      {/* upload & preview panes */}
      <div style={{ display:'flex',flexWrap:'wrap',gap:'1rem',marginTop:'.25rem',
                    justifyContent:'space-between' }}>
        <div style={{ flex:'0 1 48%',minWidth:220 }}>
          <MintUpload onFileChange={setFile}/>
          {dataUrl && (
            <RenderMedia uri={dataUrl} alt={file?.name}
              style={{ width:'100%',maxHeight:220,margin:'6px auto',objectFit:'contain' }}/>
          )}
        </div>
        <div style={{ flex:'0 1 48%',minWidth:240 }}>
          <TokenMetaPanel meta={meta} tokenId={tokenId} contractAddress={contractAddress}/>
        </div>
      </div>

      {/* meta inputs */}
      <label style={{ display:'block',marginTop:'.5rem',fontSize:'.7rem' }}>
        Description*
        <PixelInput value={desc} onChange={e=>setDesc(e.target.value)}/>
      </label>
      <label style={{ display:'block',fontSize:'.7rem' }}>
        Label* (a-z0-9_-)
        <PixelInput
          placeholder="key"
          value={label}
          onChange={e=>setLabel(e.target.value.toLowerCase().replace(/\s+/g,''))}
        />
      </label>
      <label style={{ display:'block',fontSize:'.7rem' }}>
        Name*
        <PixelInput value={name} onChange={e=>setName(e.target.value)}/>
      </label>

      {/* existing list */}
      <div style={{ margin:'.6rem 0' }}>
        <strong>Existing extra URIs:</strong>
        {existing.length ? (
          <ul style={{ margin:'.25rem 0 0', padding:0, listStyle:'none' }}>
            {existing.map(({ key, uri }) => (
              <li key={key} style={{ fontSize:'.75rem', marginTop:'.25rem', display:'flex',alignItems:'center',gap:6 }}>
                <RenderMedia
                  uri={uri}
                  alt={key}
                  style={{ width:32,height:32,objectFit:'contain' }}
                />
                <code>{key}</code>
                <PixelButton size="xs" warning onClick={()=>setDelKey(key)}>
                  CLEAR
                </PixelButton>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ fontSize:'.75rem', margin:'.25rem 0 0' }}>None</p>
        )}
      </div>

       {/* CTA */}
      <div style={{ display:'flex', gap:'.6rem', alignItems:'center', marginTop:'.8rem' }}>
        <PixelButton
          disabled={disabled}
          onClick={handleAppendClick}
        >
          {resumeInfo && !file ? 'RESUME'
                               : isEstim    ? 'Estimating…'
                                            : 'APPEND'}
        </PixelButton>
        {isEstim && <Spinner style={{ position:'static' }}/>}
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
        open={!!delKey}
        title="Remove extra URI"
        message={`Remove extra asset “${delKey}” from token ${tokenId}?`}
        onOk   ={()=>{ const k=delKey; setDelKey(''); execClear(k); }}
        onCancel={()=> setDelKey('')}
      />
    </Wrap>
  );
}
/* What changed & why:
• Restored `oversize` length check (was undefined → crash).
• runSlice & onRetry mirror Repair/Artifact – seamless retry.
• onRetry now maps overlay `current` to zero-based index.
*/
