/*Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/RepairUri.jsx
  Rev :    r725   2025-06-28 T04:12 UTC
  Summary: token dropdown reinstated + sliceTail import fixed */


import React, { useCallback, useEffect, useState } from 'react';
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
import { sliceTail, PACKED_SAFE_BYTES, splitPacked } from '../../core/batch.js';
import {
  loadSliceCheckpoint, saveSliceCheckpoint,
  clearSliceCheckpoint, purgeExpiredSliceCache,
  sha256Hex,
} from '../../utils/sliceCache.js';
import listLiveTokenIds from '../../utils/listLiveTokenIds.js';

/*──────── styled shells ─────*/
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Wrap = styled('div').withConfig({ shouldForwardProp: (p) => p !== '$level' })`
  display:flex;flex-direction:column;gap:1.1rem;
  position:relative;z-index:${(p) => p.$level ?? 'auto'};
`;

const SelectBox = styled.div`position:relative;flex:1;`;
const Spinner   = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;
`;
const HelpBox   = styled.p`
  font-size:.75rem;line-height:1.25;margin:.5rem 0 .9rem;
`;

/* chunk-safe estimator */
async function estimateChunked (toolkit, ops, chunk=8){
  let fee=0, burn=0;
  for(let i=0;i<ops.length;i+=chunk){
    const est=await toolkit.estimate.batch(ops.slice(i,i+chunk));
    fee += est.reduce((t,e)=>t+e.suggestedFeeMutez,0);
    burn+= est.reduce((t,e)=>t+e.burnFeeMutez     ,0);
  }
  return { fee, burn };
}

/*════════ component ════════════════════════════════════════*/
export default function RepairUri({ contractAddress,
  setSnackbar=()=>{}, onMutate=()=>{}, $level }) {

  const { toolkit, network='ghostnet' } = useWalletContext() || {};
  const snack = (m,s='info') => setSnackbar({ open:true,message:m,severity:s });

  /* token list */
  const [tokOpts,setTokOpts]       = useState([]);
  const [loadingTok,setLoadingTok] = useState(false);

  const fetchTokens = useCallback(async () => {
    if (!contractAddress) return;
    setLoadingTok(true);
    setTokOpts(await listLiveTokenIds(contractAddress, network, true));
    setLoadingTok(false);
  }, [contractAddress, network]);

  useEffect(()=>{ void fetchTokens(); },[fetchTokens]);

  /* local state */
  const [tokenId,setTokenId] = useState('');
  const [uriKey,setUriKey]   = useState('');          /* NEW */
  const [uriKeys,setUriKeys] = useState([]);          /* list */

  const [file,setFile]       = useState(null);
  const [dataUrl,setDataUrl] = useState('');
  const [meta,setMeta]       = useState(null);
  const [origHex,setOrigHex] = useState('');
  const [diff,setDiff]       = useState([]);

  const [preparing,setPreparing] = useState(false);
  const [batches,setBatches]     = useState(null);
  const [estimate,setEstimate]   = useState(null);
  const [sliceIdx,setSliceIdx]   = useState(0);

  const [overlay,setOverlay]     = useState({ open:false });
  const [conflictOpen,setConflictOpen]=useState(false);
  const [confirmOpen,setConfirmOpen] = useState(false);

  const reset = () => {
    setFile(null); setDataUrl(''); setDiff([]);
    setBatches(null); setEstimate(null); setSliceIdx(0);
    clearSliceCheckpoint(contractAddress, tokenId, uriKey || 'artifactUri', network);
  };

  /* meta fetch */
  const loadMeta = useCallback(async id=>{
    setMeta(null); setOrigHex(''); setDiff([]); setFile(null); setDataUrl('');
    setUriKeys([]); setUriKey('');
    if(!contractAddress || id==='') return;

    let rows=[];
    try{
      rows = await jFetch(`${TZKT_API}/v1/tokens?contract=${contractAddress}&tokenId=${id}&limit=1`);
    }catch{}

    if(!rows.length){
      try{
        const one = await jFetch(`${TZKT_API}/v1/contracts/${contractAddress}/bigmaps/token_metadata/keys/${id}`);
        if(one?.value) rows=[{metadata:JSON.parse(Buffer.from(one.value.replace(/^0x/,''),
          'hex').toString('utf8'))}];
      }catch{}
    }
    const m = rows[0]?.metadata || {};
    setMeta(m);

    const keys = listUriKeys(m);
    setUriKeys(keys);
    const first = keys.find(k=>/artifacturi/i.test(k)) || keys[0] || '';
    setUriKey(first);
  },[contractAddress]);

  useEffect(()=>{ loadMeta(tokenId); },[tokenId,loadMeta]);

  /* when uriKey changes → load origHex */
  useEffect(()=>{
    if(!uriKey || !meta) return;
    const val = meta[uriKey] || '';
    setOrigHex(`0x${char2Bytes(val)}`);
  },[uriKey,meta]);

  /* slice-cache housekeeping */
  useEffect(()=>{ purgeExpiredSliceCache(); },[]);

  /* diff build */
  useEffect(()=>{
    if(!file){ setDataUrl(''); setDiff([]); return; }
    const reader=new FileReader();
    reader.onload = async e=>{
      const url=e.target.result;
      setDataUrl(url);
      const fullHex=`0x${char2Bytes(url)}`;
      const { tail, conflict } = sliceTail(origHex, fullHex);
      if(conflict){ setConflictOpen(true); setDiff([]); return; }
      if(!tail.length) return snack('File matches on-chain','success');
      setDiff(tail);
    };
    reader.readAsDataURL(file);
  },[file,origHex]);

  /* builder & estimator */
  const buildAndEstimate = async ()=>{
    if(!toolkit) return snack('Connect wallet','error');
    if(!diff.length) return snack('No difference','error');

    setPreparing(true);
    try{
      const c      = await toolkit.wallet.at(contractAddress);
      const idNat  = +tokenId;
      const label  = uriKey.replace(/^extrauri_/i,'');
      const ops    = diff.map(hx=>{
        return uriKey.toLowerCase().startsWith('extrauri_')
          ? {
              kind: OpKind.TRANSACTION,
              ...c.methods.append_extrauri('',label,'',idNat,hx).toTransferParams(),
            }
          : {
              kind: OpKind.TRANSACTION,
              ...c.methods.append_artifact_uri(idNat,hx).toTransferParams(),
            };
      });

      const { fee, burn } = await estimateChunked(toolkit, ops);
      setEstimate({ feeTez:(fee/1e6).toFixed(6), storageTez:(burn/1e6).toFixed(6) });
      setBatches(await splitPacked(toolkit, ops, PACKED_SAFE_BYTES));
      setConfirmOpen(true);
    }catch(e){ snack(e.message,'error'); }
    finally  { setPreparing(false); }
  };

  /* slice executor */
  const runSlice = async ()=>{
    if(!batches || sliceIdx>=batches.length) return;
    try{
      setOverlay({ open:true,status:'Preparing transaction…',current:sliceIdx+1,total:batches.length });
      const op = await toolkit.wallet.batch(batches[sliceIdx]).send();
      await op.confirmation();
      if(sliceIdx+1===batches.length){
        snack('Repair complete','success');
        setOverlay({ open:false });
        reset(); onMutate();
      }else{
        setSliceIdx(sliceIdx+1);
        runSlice();
      }
    }catch(e){ setOverlay({ open:true,error:true,status:e.message||String(e) }); }
  };

  /*──────── JSX ───*/
  const disabled = preparing || !file || !diff.length || !tokenId || !uriKey || conflictOpen;

  /* rendering */
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
              : <option value="">— no URIs —</option>}
          </select>
        </SelectBox>
      </div>

      <HelpBox>
        ① Pick token&nbsp;→ ② choose URI key&nbsp;→ ③ upload original file.<br/>
        Only the missing tail bytes are appended.
      </HelpBox>

      {/* preview panes */}
      <div style={{
        display:'flex', flexWrap:'wrap', gap:'1rem', justifyContent:'space-between',
      }}
      >
        <div style={{ flex:'0 1 46%', minWidth:210 }}>
          <MintUpload onFileChange={setFile} accept="*/*" />
          {dataUrl && (
            <RenderMedia
              uri={dataUrl}
              alt={file?.name}
              style={{
                width:'100%',
                maxHeight:200,
                margin:'6px auto',
                objectFit:'contain',
              }}
            />
          )}
        </div>
        <div style={{ flex:'0 1 48%', minWidth:240 }}>
          <TokenMetaPanel
            meta={meta}
            tokenId={tokenId}
            contractAddress={contractAddress}
          />
        </div>
      </div>

      {/* compare / repair CTA */}
      <div style={{
        display:'flex', gap:'.6rem', alignItems:'center', marginTop:'.9rem',
      }}
      >
        <PixelButton disabled={disabled} onClick={buildAndEstimate}>
          {preparing ? 'Calculating…' : 'Compare & Repair'}
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
          message="Uploaded file differs from on‑chain bytes before the missing tail. Pick the exact original file."
          confirmLabel="OK"
          onConfirm={() => {
            setConflictOpen(false);
            reset();
          }}
        />
      )}

      {/* overlay */}
      {overlay.open && (
        <OperationOverlay
          {...overlay}
          onRetry={runSlice}
          onCancel={() => { setOverlay({ open:false }); reset(); }}
        />
      )}

      {/* confirm dialog */}
      {confirmOpen && (
        <OperationConfirmDialog
          open
          estimate={estimate}
          slices={batches?.length || 1}
          onOk={() => {
            setConfirmOpen(false);
            runSlice();
          }}
          onCancel={() => {
            setConfirmOpen(false);
            reset();
          }}
        />
      )}
    </Wrap>
  );
}
/* What changed & why:
• New dropdown lists all uriKeys (artifactUri + extrauri_*).
• origHex pulled from selected key.
• Builder dynamically chooses correct entrypoint.
• Fee estimation now chunk-safe (large repairs).
• Clean retry via overlay preserved. */
