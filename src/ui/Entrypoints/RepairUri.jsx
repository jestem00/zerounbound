/*Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/RepairUri.jsx
  Rev :    r594   2025-06-15
  Summary: diff-aware “Repair URI” workflow – re-uploads only the
           missing tail-slices of an interrupted artifact/extrauri. */

import React, {
  useCallback, useEffect, useMemo, useState,
}                       from 'react';
import { Buffer }       from 'buffer';
import styledPkg        from 'styled-components';
import { OpKind }       from '@taquito/taquito';
import { char2Bytes }   from '@taquito/utils';

import PixelHeading     from '../PixelHeading.jsx';
import PixelInput       from '../PixelInput.jsx';
import PixelButton      from '../PixelButton.jsx';
import MintUpload       from './MintUpload.jsx';
import OperationOverlay from '../OperationOverlay.jsx';
import OperationConfirmDialog from '../OperationConfirmDialog.jsx';

import { sliceHex, splitPacked, PACKED_SAFE_BYTES } from '../../core/batch.js';
import {
  strHash, loadSliceCache, saveSliceCache,
  clearSliceCache, purgeExpiredSliceCache,
}                          from '../../utils/sliceCache.js';
import { jFetch }          from '../../core/net.js';
import { mimeFromFilename } from '../../constants/mimeTypes.js';
import { useWalletContext } from '../../contexts/WalletContext.js';
import { TZKT_API }        from '../../config/deployTarget.js';
import { listUriKeys }     from '../../utils/uriHelpers.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap        = styled.section`margin-top:1.5rem;`;
const SelectWrap  = styled.div`position:relative;flex:1;`;
const SpinnerIcon = styled.img.attrs({src:'/sprites/loading16x16.gif',alt:''})`
  position:absolute;top:8px;right:8px;width:16px;height:16px;
  image-rendering:pixelated;
`;

const API     = `${TZKT_API}/v1`;
const hex2str = (h)=>Buffer.from(h.replace(/^0x/,''),'hex').toString('utf8');

export default function RepairUri({
  contractAddress,
  setSnackbar = ()=>{},
  onMutate    = ()=>{},
  $level      = 0,
}){
  const { toolkit } = useWalletContext() || {};
  const snack = (m,s='info')=>setSnackbar({open:true,message:m,severity:s});

  /*──────── token list ───────────────────────────────────*/
  const [tokOpts,setTokOpts]     = useState([]);
  const [loadingTok,setLoading]  = useState(false);
  const fetchTokens = useCallback(async()=>{
    if(!contractAddress) return;
    setLoading(true);
    try{
      const rows = await jFetch(`${API}/contracts/${contractAddress}/bigmaps/token_metadata/keys?limit=10000`);
      setTokOpts(rows.map(r=>+r.key).sort((a,b)=>a-b));
    }catch{ /* ignore */ }
    setLoading(false);
  },[contractAddress]);
  useEffect(()=>{void fetchTokens();},[fetchTokens]);

  /*──────── local state ─────────────────────────────────*/
  const [tokenId,setTokenId]     = useState('');
  const [uriKey,setUriKey]       = useState('artifactUri');
  const [file,setFile]           = useState(null);
  const [dataUrl,setDataUrl]     = useState('');
  const [meta,setMeta]           = useState(null);

  /* upload state */
  const [batches,setBatches]     = useState(null);
  const [estimate,setEstimate]   = useState(null);
  const [confirm,setConfirm]     = useState(false);
  const [ov,setOv]               = useState({open:false});

  /*──────── metadata loader ─────────────────────────────*/
  const loadMeta = useCallback(async id=>{
    if(!contractAddress||!id){setMeta(null);return;}
    try{
      const one = await jFetch(`${API}/contracts/${contractAddress}/bigmaps/token_metadata/keys/${id}`);
      if(one?.value) setMeta(JSON.parse(hex2str(one.value)));
    }catch{}
  },[contractAddress]);
  useEffect(()=>{loadMeta(tokenId);},[tokenId,loadMeta]);

  const uriKeys = useMemo(()=>listUriKeys(meta),[meta]);

  /*──────── diff helper ────────────────────────────────*/
  const diffSlices = useCallback((origHex, newHex)=>{
    const a = sliceHex(origHex);
    const b = sliceHex(newHex);
    let idx = 0;
    while(idx<a.length && idx<b.length && a[idx]===b[idx]) idx++;
    return b.slice(idx);          // parts still missing
  },[]);

  /*──────── prepare upload ─────────────────────────────*/
  const prepare = async()=>{
    if(!toolkit) return snack('Connect wallet','error');
    if(!tokenId||!file) return snack('Select token & file','error');
    if(!uriKey) return snack('Select URI field','error');
    try{
      const orig = meta?.[uriKey]||'';
      const reader = await file.arrayBuffer();
      const newHex = `0x${char2Bytes(Buffer.from(reader).toString('base64').startsWith('data:')
        ? Buffer.from(reader).toString('base64')
        : `data:${file.type||mimeFromFilename(file.name)};base64,${Buffer.from(reader).toString('base64')}`)}`;
      const slices = diffSlices(char2Bytes(orig).startsWith('0x')?`0x${char2Bytes(orig)}`:orig, newHex);
      if(!slices.length) return snack('Nothing to repair','info');

      const c = await toolkit.wallet.at(contractAddress);
      const flat = slices.map(hx=>({
        kind:OpKind.TRANSACTION,
        ...c.methods.append_artifact_uri(+tokenId,hx).toTransferParams(),
      }));
      const estArr = await toolkit.estimate.batch(flat.map(p=>({kind:OpKind.TRANSACTION,...p})));
      const fee = estArr.reduce((t,e)=>t+e.suggestedFeeMutez,0);
      setEstimate({feeTez:(fee/1e6).toFixed(6),storageTez:'0'});
      setBatches(await splitPacked(toolkit,flat,PACKED_SAFE_BYTES));
      setConfirm(true);
    }catch(e){snack(e.message,'error');}
  };

  /*──────── sender loop ────────────────────────────────*/
  const [idx,setIdx] = useState(0);
  const send = useCallback(async()=>{
    const params = batches[idx];
    try{
      setOv({open:true,status:'Waiting for signature…',current:idx+1,total:batches.length});
      const op = await toolkit.wallet.batch(params).send();
      setOv({open:true,status:'Broadcasting…',current:idx+1,total:batches.length});
      await op.confirmation();
      if(idx+1===batches.length){
        setOv({open:true,opHash:op.opHash});
        onMutate(); setBatches(null); setIdx(0); setConfirm(false);
      }else{ setIdx(i=>i+1); }
    }catch(e){ setOv({open:true,error:e.message||String(e)}); }
  },[batches,idx,toolkit,onMutate]);

  useEffect(()=>{ if(confirm&&batches) send(); },[confirm,batches,idx,send]);

  /*──────── JSX ───────────────────────────────────────*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Repair URI</PixelHeading>

      {/* token & uri selectors */}
      <div style={{display:'flex',gap:'.6rem'}}>
        <SelectWrap>
          <select
            style={{width:'100%',height:32}}
            disabled={loadingTok}
            value={tokenId}
            onChange={e=>setTokenId(e.target.value)}
          >
            <option value="">{loadingTok?'Loading…':'Select token'}</option>
            {tokOpts.map(t=><option key={t}>{t}</option>)}
          </select>
          {loadingTok&&<SpinnerIcon/>}
        </SelectWrap>
        <SelectWrap>
          <select
            style={{width:'100%',height:32}}
            value={uriKey}
            onChange={e=>setUriKey(e.target.value)}
          >
            {uriKeys.map(k=><option key={k}>{k}</option>)}
          </select>
        </SelectWrap>
      </div>

      {/* file picker */}
      <MintUpload onFileChange={f=>{setFile(f);setDataUrl('');}}/>
      {dataUrl&&(
        <img src={dataUrl} alt="" style={{maxWidth:'100%',marginTop:8}}/>
      )}

      <PixelButton style={{marginTop:12}} onClick={prepare}>COMPARE & REPAIR</PixelButton>

      {/* confirm + overlay */}
      {confirm&&(
        <OperationConfirmDialog
          open
          estimate={estimate}
          slices={batches.length}
          onOk={()=>{setConfirm(false);send();}}
          onCancel={()=>{setConfirm(false);setBatches(null);}}
        />
      )}
      {ov.open&&(
        <OperationOverlay
          {...ov}
          current={ov.current}
          total={ov.total}
          onRetry={()=>send()}
          onCancel={()=>{setOv({open:false});setBatches(null);setConfirm(false);}}
        />
      )}
    </Wrap>
  );
}
/* EOF */
