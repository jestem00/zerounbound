/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/AppendTokenMetadatav4a.jsx
  Rev :    r735   2025-07-07
  Summary: v4a meta-append UI (chunk-safe, shared estimator)
──────────────────────────────────────────────────────────────*/
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styledPkg           from 'styled-components';
import { Buffer }          from 'buffer';
import { char2Bytes }      from '@taquito/utils';
import { OpKind }          from '@taquito/taquito';

import PixelHeading        from '../PixelHeading.jsx';
import PixelInput          from '../PixelInput.jsx';
import PixelButton         from '../PixelButton.jsx';
import OperationOverlay    from '../OperationOverlay.jsx';
import OperationConfirmDialog from '../OperationConfirmDialog.jsx';
import LoadingSpinner      from '../LoadingSpinner.jsx';

import { useWalletContext } from '../../contexts/WalletContext.js';
import { TZKT_API }         from '../../config/deployTarget.js';

import { splitPacked, sliceHex, PACKED_SAFE_BYTES } from '../../core/batch.js';
import listLiveTokenIds     from '../../utils/listLiveTokenIds.js';
import {
  purgeExpiredSliceCache, loadSliceCheckpoint,
  saveSliceCheckpoint, clearSliceCheckpoint,
} from '../../utils/sliceCache.js';
import { estimateChunked }  from '../../core/feeEstimator.js';

/*──────── styled shells ─────*/
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap        = styled.section`margin-top:1.5rem;`;
const SelectWrap  = styled.div`position:relative;flex:1;`;
const Spinner     = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;
`;
const Note        = styled.p`
  font-size:.7rem;margin:.35rem 0 .2rem;opacity:.8;
`;

/*──────── helpers ─────*/
const hex2str = (h) => Buffer.from(h.replace(/^0x/, ''), 'hex').toString('utf8');

/*════════ component ════════════════════════════════════════*/
export default function AppendTokenMetadatav4a({
  contractAddress,
  setSnackbar = () => {},
  onMutate    = () => {},
  $level,
}) {
  const { toolkit } = useWalletContext() || {};
  const snack = (m,s='info')=>setSnackbar({open:true,message:m,severity:s});

  /* token list */
  const [tokOpts,setTokOpts]       = useState([]);
  const [loadingTok,setLoadingTok] = useState(false);

  const fetchTokens = useCallback(async ()=>{
    if(!contractAddress) return;
    setLoadingTok(true);
    setTokOpts(await listLiveTokenIds(contractAddress, undefined, true));
    setLoadingTok(false);
  },[contractAddress]);

  useEffect(()=>{ void fetchTokens(); },[fetchTokens]);

  /* local state */
  const [tokenId,setTokenId]   = useState('');
  const [metaKey,setMetaKey]   = useState('');
  const [value,setValue]       = useState('');
  const [hexSlices,setHexSlices]=useState([]);
  const [resumeInfo,setResumeInfo]=useState(null);

  /* slice-cache housekeeping */
  useEffect(()=>{ purgeExpiredSliceCache(); },[]);
  useEffect(()=>{
    if(!tokenId||!metaKey) return;
    const c = loadSliceCheckpoint(contractAddress,tokenId,`meta_${metaKey}`);
    if(c) setResumeInfo(c);
  },[contractAddress, tokenId, metaKey]);

  /* auto-slice on value change */
  useEffect(()=>{
    if(!value.trim()){ setHexSlices([]); return; }
    const hx=`0x${char2Bytes(value)}`;
    const slices=hx.length/2>30_000 ? sliceHex(hx) : [hx];
    setHexSlices(slices);
  },[value]);

  /* estimator / batch state */
  const [isEstim,setIsEstim]       = useState(false);
  const [batches,setBatches]       = useState(null);
  const [estimate,setEstimate]     = useState(null);
  const [confirmOpen,setConfirmOpen]=useState(false);
  const [ov,setOv]                 = useState({open:false});

  /* build params helper */
  const buildFlat = useCallback(async (startIdx=0)=>{
    const idNat=+tokenId;
    const c=await toolkit.wallet.at(contractAddress);
    return hexSlices.slice(startIdx).map((hx)=>({
      kind:OpKind.TRANSACTION,
      ...c.methods.append_token_metadata(metaKey,idNat,hx).toTransferParams(),
    }));
  },[toolkit,contractAddress,metaKey,tokenId,hexSlices]);

  /* prepare */
  const prepare = async ()=>{
    if(!toolkit) return snack('Connect wallet','error');
    if(!metaKey.trim()) return snack('Key required','error');
    if(!value.trim())   return snack('Value required','error');
    setIsEstim(true);
    await new Promise(requestAnimationFrame);
    try{
      const flat     = await buildFlat();
      const { fee,burn } = await estimateChunked(toolkit,flat,8);
      setEstimate({ feeTez:(fee/1e6).toFixed(6), storageTez:(burn/1e6).toFixed(6) });
      const packed   = await splitPacked(toolkit,flat,PACKED_SAFE_BYTES);
      setBatches(packed.length ? packed : [flat]);
      /* cache resume info */
      saveSliceCheckpoint(contractAddress,tokenId,`meta_${metaKey}`,{
        total:hexSlices.length,next:0,
      });
      setResumeInfo({ total:hexSlices.length,next:0 });
      setConfirmOpen(true);
    }catch(e){ snack(e.message,'error'); }
    finally{ setIsEstim(false); }
  };

  /* slice-resume */
  const resumeUpload = async ()=>{
    const { next=0 }=resumeInfo||{};
    const flat=await buildFlat(next);
    const { fee,burn }=await estimateChunked(toolkit,flat,8);
    setEstimate({ feeTez:(fee/1e6).toFixed(6), storageTez:(burn/1e6).toFixed(6) });
    const packed=await splitPacked(toolkit,flat,PACKED_SAFE_BYTES);
    setBatches(packed.length?packed:[flat]);
    setConfirmOpen(true);
  };

  /* runner */
  const runSlice = useCallback(async (idx)=>{
    if(!batches||idx>=batches.length) return;
    setOv({open:true,status:'Waiting for signature…',current:idx+1,total:batches.length});
    try{
      const op=await toolkit.wallet.batch(batches[idx]).send();
      setOv({open:true,status:'Broadcasting…',current:idx+1,total:batches.length});
      await op.confirmation();

      if(idx+1<batches.length){
        saveSliceCheckpoint(contractAddress,tokenId,`meta_${metaKey}`,{
          total:hexSlices.length,next:idx+1,
        });
        requestAnimationFrame(()=>runSlice(idx+1));
      }else{
        clearSliceCheckpoint(contractAddress,tokenId,`meta_${metaKey}`);
        onMutate(); setOv({open:true,opHash:op.opHash});
      }
    }catch(e){
      setOv({open:true,error:true,status:e.message||String(e)});
    }
  },[batches,toolkit,contractAddress,tokenId,metaKey,hexSlices.length,onMutate]);

  /* disabled guard */
  const disabled = isEstim ||
                   !tokenId || !metaKey.trim() || !value.trim();

  /*──────── JSX ───*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Append Token Metadata (v4a)</PixelHeading>

      {/* token picker */}
      <div style={{display:'flex',gap:'.5rem'}}>
        <PixelInput
          placeholder="Token-ID"
          style={{flex:1}}
          value={tokenId}
          onChange={(e)=>setTokenId(e.target.value.replace(/\D/g,''))}
        />
        <SelectWrap>
          <select
            style={{width:'100%',height:32}}
            disabled={loadingTok}
            value={tokenId||''}
            onChange={(e)=>setTokenId(e.target.value)}
          >
            <option value="">
              {loadingTok ? 'Loading…'
                          : tokOpts.length ? 'Select token' : '— none —'}
            </option>
            {tokOpts.map((t)=>(
              <option key={typeof t==='object'?t.id:t}
                value={typeof t==='object'?t.id:t}>
                {typeof t==='object' ? `${t.id} — ${t.name}` : t}
              </option>
            ))}
          </select>
          {loadingTok && <Spinner/>}
        </SelectWrap>
      </div>

      {/* key / value */}
      <Note>Metadata key *</Note>
      <PixelInput value={metaKey}
        onChange={(e)=>setMetaKey(e.target.value.replace(/\s+/g,''))}
      />

      <Note>Value (raw string / JSON) *</Note>
      <PixelInput
        as="textarea"
        rows={4}
        value={value}
        onChange={(e)=>setValue(e.target.value)}
      />

      <Note>
        Payload slices: {hexSlices.length} • Total&nbsp;
        {(hexSlices.reduce((t,h)=>t+(h.length-2)/2,0)).toLocaleString()} bytes
      </Note>

      {resumeInfo && (
        <p style={{fontSize:'.75rem',color:'var(--zu-accent)',margin:'6px 0'}}>
          Resume detected ({resumeInfo.next}/{resumeInfo.total}).
          <PixelButton size="xs" style={{marginLeft:6}} onClick={resumeUpload}>
            Resume
          </PixelButton>
        </p>
      )}

      <PixelButton disabled={disabled} onClick={prepare}>
        {isEstim ? 'Estimating…' : 'APPEND'}
      </PixelButton>

      {/* dialogs */}
      {confirmOpen && (
        <OperationConfirmDialog
          open
          slices={batches?.length||1}
          estimate={estimate}
          onOk={()=>{ setConfirmOpen(false); runSlice(0); }}
          onCancel={()=>{ setConfirmOpen(false); setBatches(null); }}
        />
      )}
      {ov.open && (
        <OperationOverlay
          {...ov}
          onRetry={()=>runSlice((ov.current??1)-1)}
          onCancel={()=>{ setOv({open:false}); setBatches(null); }}
        />
      )}
    </Wrap>
  );
}
/* What changed & why:
   • New full-flow UI for v4a `append_token_metadata`.
   • Uses shared feeEstimator with chunk = 8 (I85) & slice-resume cache.
   • Mirrors AppendArtifactUri UX for familiarity.
*/
/* EOF */
