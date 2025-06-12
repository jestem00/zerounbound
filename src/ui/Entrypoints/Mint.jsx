/*Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/Mint.jsx
  Rev :    r597   2025-06-15
  Summary: success-overlay null-guard + safe Retry flow;
           sendBatch bail-outs; minor polish; no dup mints */

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
}                             from 'react';
import styledPkg              from 'styled-components';
import { MichelsonMap, OpKind } from '@taquito/taquito';
import { char2Bytes }         from '@taquito/utils';
import { Buffer }             from 'buffer';

import PixelHeading           from '../PixelHeading.jsx';
import PixelInput             from '../PixelInput.jsx';
import PixelButton            from '../PixelButton.jsx';
import MintUpload             from './MintUpload.jsx';
import MintPreview            from './MintPreview.jsx';
import OperationOverlay       from '../OperationOverlay.jsx';
import OperationConfirmDialog from '../OperationConfirmDialog.jsx';

import { useWalletContext }   from '../../contexts/WalletContext.js';
import { asciiPrintable, cleanDescription } from '../../core/validator.js';
import { ROOT_URL }           from '../../config/deployTarget.js';
import {
  SLICE_SAFE_BYTES, sliceHex, splitPacked,
}                             from '../../core/batch.js';
import useTxEstimate          from '../../hooks/useTxEstimate.js';

if (typeof window !== 'undefined' && !window.Buffer) window.Buffer = Buffer;

/*──────── constants ──────────────────────────────────────────*/
const HEADROOM_BYTES    = 256;                          // ≤ 32 kB forged
const SAFE_BYTES_0      = SLICE_SAFE_BYTES - HEADROOM_BYTES;

const MAX_ATTR          = 10;
const MAX_ATTR_N        = 32;
const MAX_ATTR_V        = 32;
const MAX_ROY_ENTRIES   = 10;
const MAX_TAGS          = 10;
const MAX_TAG_LEN       = 20;
const MAX_ROY_TOTAL_PCT = 25;
const MAX_EDITIONS      = 10_000;
const MAX_META          = 32_768;
const OVERHEAD          = 360;                          // map baseline

const LICENSES = [
  'CC0 (Public Domain)', 'All Rights Reserved',
  'On-Chain NFT License 2.0 (KT1S9GHLCrGg5YwoJGDDuC347bCTikefZQ4z)',
  'CC BY 4.0', 'CC BY-SA 4.0', 'CC BY-ND 4.0', 'CC BY-NC 4.0',
  'CC BY-NC-SA 4.0', 'CC BY-NC-ND 4.0', 'MIT', 'GPL', 'Apache 2.0',
  'Unlicense', 'Custom',
];

/*──────── styled shells ─────────────────────────────────────*/
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Wrap = styled.div`display:flex;flex-direction:column;gap:1.1rem;`;
const Grid = styled.div`
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(190px,1fr));
  gap:.9rem;
`;
const Row      = styled.div`
  display:grid;grid-template-columns:1fr 1fr auto;
  gap:.6rem;align-items:center;
`;
const RoyalRow = styled(Row)`grid-template-columns:1fr 90px auto;`;
const TagArea  = styled.div`
  display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.3rem;
`;
const TagChip  = styled.span`
  background:var(--zu-accent-sec);padding:.12rem .45rem;font-size:.65rem;
  border-radius:.25rem;cursor:pointer;
`;
const Note     = styled.p`
  font-size:.68rem;line-height:1.2;margin:.25rem 0 .1rem;text-align:center;
  color:var(--zu-accent-sec);
`;
const Select   = styled.select`
  width:100%;background:var(--zu-bg);color:var(--zu-fg);
  border:1px solid var(--zu-fg);padding:.25rem .4rem;font-family:inherit;
`;

/*──────── helper fns ───────────────────────────────────────*/
const hex = (s='') => `0x${Buffer.from(s,'utf8').toString('hex')}`;

const buildMeta = ({
  f, attrs, tags, dataUrl, mime, shares,
}) => {
  const m = new MichelsonMap();
  m.set('name', hex(f.name));
  m.set('decimals', hex('0'));
  if (f.description) m.set('description', hex(f.description));
  m.set('mimeType', hex(mime || ''));
  if (dataUrl) m.set('artifactUri', hex(dataUrl));

  if (f.authors?.trim()) {
    m.set('authors', hex(JSON.stringify(
      f.authors.split(',').map((x)=>x.trim()),
    )));
  }

  m.set('creators', hex(JSON.stringify(
    f.creators.split(',').map((x)=>x.trim()).filter(Boolean),
  )));
  m.set('rights', hex(f.license==='Custom' ? f.customLicense : f.license));
  m.set('mintingTool', hex(ROOT_URL));
  m.set('royalties', hex(JSON.stringify({ decimals:4, shares })));

  if (f.flashing==='Does contain Flashing Hazard') {
    m.set('accessibility', hex(JSON.stringify({ hazards:['flashing'] })));
  }
  if (f.nsfw==='Does contain NSFW') m.set('contentRating', hex('mature'));

  if (tags.length)  m.set('tags',       hex(JSON.stringify(tags)));
  if (attrs.length) m.set('attributes', hex(JSON.stringify(attrs)));
  return m;
};

const mapSize = (map) => {
  let total = OVERHEAD;
  for (const [k,v] of map.entries()) {
    total += Buffer.byteLength(k,'utf8');
    total += v.startsWith('0x') ? (v.length-2)/2 : Buffer.byteLength(v,'utf8');
  }
  return total;
};

const buildMintCall = (c, ver, amt, map, to) => {
  const n = parseInt(amt,10)||1;
  const v = String(ver).replace(/^v/i,'');
  if (v==='1')  return c.methods.mint(map,to);
  if (v==='2b') return c.methods.mint(map,to,n);
  return c.methods.mint(n,map,to);            // v3+
};

/*──────── snackbar helper ──────────────────────────────────*/
function useSnackbarBridge(cb){
  const [local,setLocal] = useState(null);
  const api = (msg,sev='info')=>{
    cb ? cb({open:true,message:msg,severity:sev})
       : setLocal({open:true,message:msg,severity:sev});
  };
  const node = local?.open && (
    <div role="alert"
      style={{
        position:'fixed',bottom:20,left:'50%',transform:'translateX(-50%)',
        background:'#222',color:'#fff',padding:'6px 12px',borderRadius:4,
        fontSize:'.8rem',zIndex:2600,cursor:'pointer',
      }}
      onClick={()=>setLocal(null)}
    >{local.message}</div>
  );
  return [api,node];
}

/*════════ component ═══════════════════════════════════════*/
export default function Mint({
  contractAddress,
  contractVersion='v4',
  setSnackbar,
  onMutate,
}){
  /*── wallet ───────────────────────────────────────────*/
  const wc = useWalletContext() || {};
  const {
    address: wallet, toolkit: toolkitExt, mismatch, needsReveal,
  } = wc;
  const toolkit = toolkitExt
    || (typeof window!=='undefined' && window.tezosToolkit);

  const [snack,snackNode] = useSnackbarBridge(setSnackbar);

  /*── form state ───────────────────────────────────────*/
  const init = {
    name:'', description:'', creators:'', authors:'',
    toAddress:'', license:'All Rights Reserved', customLicense:'',
    amount:'1', nsfw:'Does not contain NSFW',
    flashing:'Does not contain Flashing Hazard',
    agree:false,
  };
  const [f,setF]          = useState(init);
  const [attrs,setAttrs]  = useState([{name:'',value:''}]);
  const [tags,setTags]    = useState([]);
  const [tagInput,setTagInput] = useState('');
  const [file,setFile]    = useState(null);
  const [url,setUrl]      = useState('');
  const [roys,setRoys]    = useState([{address:wallet||'',sharePct:''}]);

  /* batch & loop state */
  const [batches,setBatches]     = useState(null);   // array< array<params> >
  const [stepIdx,setStepIdx]     = useState(0);
  const [confirmCount,setConfirmCount] = useState(0); // 0=none,1=accepted
  const [ov,setOv]              = useState({open:false});
  const [confirmOpen,setConfirmOpen]=useState(false);

  const tagRef = useRef(null);

  /*── wallet autofill ─────────────────────────────────*/
  useEffect(()=>{
    setF(p=>({...p,creators:wallet||'',toAddress:wallet||''}));
    setRoys(p=>{
      const n=[...p];
      if(!n.length) return [{address:wallet||'',sharePct:''}];
      n[0]={...n[0],address:wallet||''}; return n;
    });
  },[wallet]);

  /* royalties helpers */
  const setRoy = (i,k,v)=>setRoys(p=>{const n=[...p]; n[i][k]=v; return n;});
  const addRoy = ()=> roys.length<MAX_ROY_ENTRIES && setRoys(p=>[...p,{address:'',sharePct:''}]);
  const delRoy = (i)=>setRoys(p=>p.filter((_,idx)=>idx!==i));

  /* attr & tag helpers */
  const setAttr = (i,k,v)=>{
    if((k==='name'&&v.length>MAX_ATTR_N)||(k==='value'&&v.length>MAX_ATTR_V)) return;
    setAttrs(p=>{const n=[...p]; n[i][k]=v; return n;});
  };
  const addAttr = ()=> attrs.length<MAX_ATTR && setAttrs(p=>[...p,{name:'',value:''}]);
  const delAttr = (i)=>setAttrs(p=>p.filter((_,idx)=>idx!==i));

  const pushTag = (raw)=>{
    const t=raw.trim().toLowerCase();
    if(!t) return;
    if(!/^[a-z0-9-_]+$/i.test(t))      return snack('Invalid tag','error');
    if(t.length>MAX_TAG_LEN)           return snack('Tag too long','error');
    if(tags.includes(t))               return;
    if(tags.length>=MAX_TAGS)          return snack('Max 10 tags','error');
    setTags(p=>[...p,t]);
  };

  /* oversize slicing */
  const artifactHex = useMemo(()=>char2Bytes(url),[url]);
  const oversize    = artifactHex.length/2 > SLICE_SAFE_BYTES;

  const allSlices = useMemo(()=>(
    oversize ? sliceHex(`0x${artifactHex}`,SAFE_BYTES_0) : []
  ),[oversize,artifactHex]);

  const slice0DataUri = useMemo(()=>(
    oversize ? Buffer.from(allSlices[0].slice(2),'hex').toString('utf8') : url
  ),[oversize,allSlices,url]);

  const appendSlices = useMemo(
    ()=> oversize ? allSlices.slice(1) : [],
    [oversize,allSlices],
  );

  /* royalties shares object */
  const shares = useMemo(()=>{
    const o={};
    roys.forEach(({address,sharePct})=>{
      const pct=parseFloat(sharePct);
      if(address && /^(tz1|tz2|tz3|KT1)/.test(address) && pct>0){
        o[address.trim()] = Math.round(pct*100);
      }
    });
    return o;
  },[roys]);

  /* metadata & size */
  const metaMap   = useMemo(()=>{
    const clean=attrs.filter(a=>a.name&&a.value);
    return buildMeta({f,attrs:clean,tags,dataUrl:slice0DataUri,mime:file?.type,shares});
  },[f,attrs,tags,slice0DataUri,file,shares]);

  const metaBytes = useMemo(()=>mapSize(metaMap),[metaMap]);

  /* royalties % */
  const totalPct = useMemo(()=>Object.values(shares)
    .reduce((t,n)=>t+n,0)/100,[shares]);

  /*──────── validation ───────────────────────────────*/
  const validate = ()=>{
    try{
      if(!wallet)                  throw new Error('Wallet not connected');
      if(mismatch)                 throw new Error('Wrong wallet network');
      if(needsReveal)              throw new Error('Reveal account first');
      asciiPrintable(f.name,200);
      if(!f.name.trim())           throw new Error('Name required');
      if(f.description)            cleanDescription(f.description);
      if(!file||!url)              throw new Error('Artifact required');

      const R=/^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/;
      const list=s=>s.split(',').map(x=>x.trim()).filter(Boolean);
      if(!R.test(f.toAddress))     throw new Error('Recipient invalid');
      if(list(f.creators).some(a=>!R.test(a))) throw new Error('Creator invalid');
      if(totalPct===0)             throw new Error('Royalties 0 %');
      if(totalPct>MAX_ROY_TOTAL_PCT)throw new Error(`Royalties > ${MAX_ROY_TOTAL_PCT}%`);

      if(contractVersion!=='v1'){
        const n=parseInt(f.amount,10);
        if(Number.isNaN(n)||n<1||n>MAX_EDITIONS) throw new Error(`Editions 1–${MAX_EDITIONS}`);
      }

      if(!f.license)               throw new Error('License required');
      if(f.license==='Custom'&&!f.customLicense.trim())
                                  throw new Error('Custom licence required');
      if(!f.agree)                 throw new Error('Agree to the terms first');
      if(!oversize && metaBytes>MAX_META) throw new Error('Metadata > 32 kB');
      return true;
    }catch(e){ snack(e.message,'error'); return false; }
  };

  /*──────── batch builder ────────────────────────────*/
  const buildBatches = useCallback(async ()=>{
    const c = await toolkit.wallet.at(contractAddress);

    let baseId = 0;
    try{
      const st=await c.storage?.();
      baseId = Number(st?.next_token_id||0);
    }catch{/* ignore */}

    const mintParams = {
      kind:OpKind.TRANSACTION,
      ...(await buildMintCall(
        c,contractVersion,f.amount,metaMap,f.toAddress,
      ).toTransferParams()),
    };

    const out=[[mintParams]];                     // batch-0 mint

    const amt=parseInt(f.amount,10)||1;
    if(appendSlices.length){
      for(let i=0;i<amt;i+=1){
        const tokenId=baseId+i;
        appendSlices.forEach(hx=>{
          out.push([{
            kind:OpKind.TRANSACTION,
            ...(c.methods.append_artifact_uri(tokenId,hx).toTransferParams()),
          }]);
        });
      }
    }
    return out;
  },[toolkit,contractAddress,contractVersion,f.amount,metaMap,f.toAddress,appendSlices]);

  /*──────── fee estimate (+ confirm dialog) ──────────*/
  const flatParams = useMemo(()=>batches?.flat()||[],[batches]);
  const est        = useTxEstimate(toolkit,flatParams);

  useEffect(()=>{
    if(batches && !est.isLoading && confirmCount===0){
      setConfirmOpen(true);
    }
  },[batches,est.isLoading,confirmCount]);

  /*──────── prepare & CTA click ──────────────────────*/
  const prepareMint = async ()=>{
    if(!toolkit) return snack('Toolkit unavailable','error');
    if(!validate()) return;
    try{
      setConfirmCount(0);
      const packs=await buildBatches();
      setBatches(packs);
    }catch(e){ snack(e.message,'error'); }
  };

  /*──────── sender loop guarded by confirmCount ──────*/
  const sendBatch = useCallback(async ()=>{
    if(!batches || stepIdx>=batches.length) return;      // safety bail-out
    const params=batches[stepIdx];
    try{
      setOv({open:true,status:'Waiting for signature…',step:stepIdx+1,total:batches.length});
      const op = await toolkit.wallet.batch(params).send();
      setOv({open:true,status:'Broadcasting…',step:stepIdx+1,total:batches.length});
      await op.confirmation();

      if(stepIdx+1===batches.length){
        setOv({open:true,opHash:op.opHash,step:batches.length,total:batches.length});
        onMutate?.();
        setBatches(null); setStepIdx(0); setConfirmCount(0);
      }else{
        setStepIdx(i=>i+1);
      }
    }catch(e){
      setOv({open:true,error:e.message||String(e)});
    }
  },[batches,stepIdx,toolkit,onMutate]);

  useEffect(()=>{
    if(confirmCount===1 && batches && stepIdx<batches.length){
      sendBatch();
    }
  },[confirmCount,batches,stepIdx,sendBatch]);

  /*──────── retry hook ───────────────────────────────*/
  const retry = ()=>{
    if(!batches || !batches.length){
      snack('Nothing to retry','error');
      return;
    }
    sendBatch();
  };

  /*──────── disabled-reason string ───────────────────*/
  const reason = est.isLoading
    ? 'Estimating…'
    : ov.open && !ov.error && !ov.opHash
      ? 'Please wait…'
      : (!oversize && metaBytes>MAX_META)
        ? 'Metadata size > 32 kB'
        : totalPct>MAX_ROY_TOTAL_PCT
          ? 'Royalties exceed limit'
          : !f.agree ? 'Agree to the terms first' : '';

  /*──────── JSX ─────────────────────────────────────*/
  return (
    <Wrap>
      {snackNode}
      <PixelHeading level={3}>Mint NFT</PixelHeading>

      {/* Core fields */}
      <Grid>
        <div>
          <Note>Title *</Note>
          <PixelInput
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
        </div>
        {contractVersion !== 'v1' && (
          <div>
            <Note>Editions *</Note>
            <PixelInput
              type="number"
              min="1"
              max={MAX_EDITIONS}
              value={f.amount}
              onChange={(e) => setF({
                ...f,
                amount: e.target.value.replace(/\D/g, ''),
              })}
            />
          </div>
        )}
      </Grid>

      {/* Description */}
      <div>
        <Note>Description</Note>
        <PixelInput
          as="textarea"
          rows={4}
          style={{ resize: 'vertical' }}
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
        />
      </div>

      {/* Upload */}
      <MintUpload onFileChange={setFile} onFileDataUrlChange={setUrl} />
      <MintPreview dataUrl={url} fileName={file?.name} />

      {/* Addresses */}
      <PixelHeading level={5}>Addresses</PixelHeading>

      <Note>Creators (comma-sep) *</Note>
      <PixelInput
        value={f.creators}
        onChange={(e) => setF({ ...f, creators: e.target.value })}
      />

      <Note>Authors (comma-sep names)</Note>
      <PixelInput
        value={f.authors}
        onChange={(e) => setF({ ...f, authors: e.target.value })}
      />

      <Note>Recipient *</Note>
      <PixelInput
        value={f.toAddress}
        onChange={(e) => setF({ ...f, toAddress: e.target.value })}
      />

      {/* Royalties */}
      <PixelHeading level={5} style={{ marginTop: '.9rem' }}>
        Royalties (≤ {MAX_ROY_TOTAL_PCT}% total — current {totalPct}%)
      </PixelHeading>
      {roys.map((r, i) => (
        <RoyalRow key={i}>
          <PixelInput
            placeholder="tz1…"
            value={r.address}
            onChange={(e) => setRoy(i, 'address', e.target.value)}
          />
          <PixelInput
            placeholder="%"
            value={r.sharePct}
            onChange={(e) => setRoy(
              i,
              'sharePct',
              e.target.value.replace(/[^0-9.]/g, ''),
            )}
          />
          {i === 0 ? (
            <PixelButton
              size="xs"
              onClick={addRoy}
              disabled={roys.length >= MAX_ROY_ENTRIES}
            >
              ＋
            </PixelButton>
          ) : (
            <PixelButton size="xs" onClick={() => delRoy(i)}>
              －
            </PixelButton>
          )}
        </RoyalRow>
      ))}
      
      {/* License */}
      <Grid>
        <div>
          <Note>License *</Note>
          <Select
            value={f.license}
            onChange={(e) => setF({ ...f, license: e.target.value })}
          >
            <option value="">Select</option>
            {LICENSES.map((l) => <option key={l}>{l}</option>)}
          </Select>
        </div>
      </Grid>
      {f.license === 'Custom' && (
        <div>
          <Note>Custom licence *</Note>
          <PixelInput
            as="textarea"
            rows={2}
            value={f.customLicense}
            onChange={(e) => setF({ ...f, customLicense: e.target.value })}
          />
        </div>
      )}

      {/* Safety flags */}
      <Grid>
        <div>
          <Note>NSFW *</Note>
          <Select
            value={f.nsfw}
            onChange={(e) => setF({ ...f, nsfw: e.target.value })}
          >
            <option>Does not contain NSFW</option>
            <option>Does contain NSFW</option>
          </Select>
        </div>
        <div>
          <Note>Flashing hazard *</Note>
          <Select
            value={f.flashing}
            onChange={(e) => setF({ ...f, flashing: e.target.value })}
          >
            <option>Does not contain Flashing Hazard</option>
            <option>Does contain Flashing Hazard</option>
          </Select>
        </div>
      </Grid>

      {/* Attributes */}
      <PixelHeading level={5} style={{ marginTop: '.9rem' }}>
        Attributes
      </PixelHeading>
      {attrs.map((a, i) => (
        <Row key={i}>
          <PixelInput
            placeholder="Name"
            value={a.name}
            onChange={(e) => setAttr(i, 'name', e.target.value)}
          />
          <PixelInput
            placeholder="Value"
            value={a.value}
            onChange={(e) => setAttr(i, 'value', e.target.value)}
          />
          {i === 0 ? (
            <PixelButton
              size="xs"
              onClick={addAttr}
              disabled={attrs.length >= MAX_ATTR}
            >
              ＋
            </PixelButton>
          ) : (
            <PixelButton size="xs" onClick={() => delAttr(i)}>
              －
            </PixelButton>
          )}
        </Row>
      ))}

      {/* Tags */}
      <Note>Tags (Enter / comma)</Note>
      <PixelInput
        ref={tagRef}
        value={tagInput}
        onChange={(e) => setTagInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            pushTag(tagInput);
            setTagInput('');
          }
        }}
        onBlur={() => {
          pushTag(tagInput);
          setTagInput('');
        }}
      />
      <TagArea>
        {tags.map((t) => (
          <TagChip
            key={t}
            onClick={() => setTags((p) => p.filter((x) => x !== t))}
          >
            {t}
            {' '}
            ✕
          </TagChip>
        ))}
      </TagArea>

      {/* Terms & size */}
      <label style={{ fontSize: '.8rem', marginTop: '.6rem' }}>
        <input
          type="checkbox"
          checked={f.agree}
          onChange={(e) => setF({ ...f, agree: e.target.checked })}
        />
        {' '}
        I agree to the&nbsp;
        <a href="/terms" target="_blank" rel="noopener noreferrer">
          terms & conditions
        </a>
        .
      </label>

      {/* Summary & CTA */}
      <Note>
        Metadata size:&nbsp;{metaBytes.toLocaleString()} / {MAX_META}&nbsp;bytes
      </Note>
      {reason && (
        <p style={{
          color:'var(--zu-accent-sec)',fontSize:'.7rem',
          textAlign:'center',margin:'4px 0',
        }}>{reason}</p>
      )}

      <PixelButton
        type="button"
        onClick={prepareMint}
        disabled={!!reason || !!batches}
      >
        {est.isLoading ? 'Estimating…' : 'Mint NFT'}
      </PixelButton>

      {/* Confirm dialog */}
      {confirmOpen && (
        <OperationConfirmDialog
          open
          slices={batches?.length||1}
          estimate={est}
          onOk={()=>{
            setConfirmOpen(false);
            setConfirmCount(1);          // 🔑 arm sender loop
          }}
          onCancel={()=>{
            setConfirmOpen(false);
            setBatches(null);
            setConfirmCount(0);
          }}
        />
      )}

      {/* Overlay */}
      {ov.open && (
        <OperationOverlay
          mode="mint"
          status={ov.status}
          error={ov.error}
          opHash={ov.opHash}
          contractAddr={contractAddress}
          step={ov.step}
          total={ov.total}
          onRetry={ov.error ? retry : undefined}
          onCancel={()=>{
            setOv({open:false});
            setBatches(null);
            setStepIdx(0);
            setConfirmCount(0);
          }}
        />
      )}
    </Wrap>
  );
}

/* What changed & why:
   • Guarded sendBatch and retry against null/empty `batches`
     preventing “Cannot read properties of null ('0')” after success.
   • Overlay now passes onRetry only when `ov.error` is set so the
     success view never shows a retry button.
   • Added snack feedback for “Nothing to retry”.
   • Early bail-out in sendBatch ensures no out-of-range access.
   • Rev bump r597; no other logic altered. */
/* EOF */
