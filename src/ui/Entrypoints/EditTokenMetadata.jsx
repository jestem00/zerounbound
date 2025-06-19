/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/EditTokenMetadata.jsx
  Rev :    r807   2025-07-06
  Summary: dual picker + named options, burn-filter list
──────────────────────────────────────────────────────────────*/
import React, {
  useCallback, useEffect, useMemo, useState,
} from 'react';
import styledPkg               from 'styled-components';
import { MichelsonMap }        from '@taquito/michelson-encoder';
import { char2Bytes }          from '@taquito/utils';
import { OpKind }              from '@taquito/taquito';

import PixelHeading            from '../PixelHeading.jsx';
import PixelInput              from '../PixelInput.jsx';
import PixelButton             from '../PixelButton.jsx';
import LoadingSpinner          from '../LoadingSpinner.jsx';
import TokenMetaPanel          from '../TokenMetaPanel.jsx';
import OperationConfirmDialog  from '../OperationConfirmDialog.jsx';
import OperationOverlay        from '../OperationOverlay.jsx';

import listLiveTokenIds        from '../../utils/listLiveTokenIds.js';
import useTxEstimate           from '../../hooks/useTxEstimate.js';
import { useWalletContext }    from '../../contexts/WalletContext.js';
import { jFetch }              from '../../core/net.js';

import {
  asciiPrintable, asciiPrintableLn, listOfTezAddresses,
} from '../../core/validator.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled shells ─────*/
const Wrap   = styled.section``;
const Picker = styled.div`display:flex;gap:.5rem;`;
const Box    = styled.div`position:relative;flex:1;`;
const Spin   = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;
`;
const Grid   = styled.div`display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem;`;
const FieldW = styled.div`display:flex;flex-direction:column;gap:.4rem;textarea{min-height:5rem;}`;
const Err    = styled.span`font-size:.8rem;color:var(--zu-accent-sec);`;
const Notice = styled.p`font-size:.8rem;margin:.25rem 0 1rem;text-align:center;color:var(--zu-accent-sec);`;
const HelpBox = styled.p`
  font-size:.75rem;line-height:1.25;margin:.5rem 0 .9rem;
`;
/*──────── constants ─────*/
const CUSTOM_LABEL = 'Custom…';
const LICENSES = [
  'No License, All Rights Reserved',
  'On-Chain NFT License 2.0 KT1S9GHLCrGg5YwoJGDDuC347bCTikefZQ4z',
  'Creative Commons — CC BY 4.0',
  'Creative Commons — CC0 1.0',
  'MIT', 'GPL-3.0', 'CAL-1.0', CUSTOM_LABEL,
];
const isCustom = (v='') => v===CUSTOM_LABEL||v==='Custom...';

const LEN = {
  name:64, description:5000, authors:200, creators:200, license:120, tags:300,
};

/* quick helpers */
const urlOkay = (v='') => /^(https?:\/\/|ipfs:\/\/|ipns:\/\/|ar:\/\/)[\w./#?=-]+$/i.test(v.trim());
const enc = (v) => (typeof v==='object'?JSON.stringify(v):String(v));

function validateField(form,k,v){
  switch(k){
    case 'name':
      if(!v.trim())return'Required';
      if(!asciiPrintable(v))return'Invalid char';
      if(v.length>LEN.name)return`≤ ${LEN.name}`;
      return'';
    case 'description':
      if(!asciiPrintableLn(v))return'Invalid char';
      if(v.length>LEN.description)return`≤ ${LEN.description}`;
      return'';
    case 'authors':
      if(v&&!asciiPrintable(v))return'Invalid char';
      if(v.length>LEN.authors)return`≤ ${LEN.authors}`;
      return'';
    case 'creators':
      if(!v.trim())return'Required';
      if(!listOfTezAddresses(v))return'Comma‑sep tz/KT';
      if(v.length>LEN.creators)return`≤ ${LEN.creators}`;
      return'';
    case 'customLicense':
      if(!isCustom(form.license))return'';
      if(!v.trim())return'Required';
      if(!asciiPrintable(v))return'Invalid char';
      if(v.length>LEN.license)return`≤ ${LEN.license}`;
      return'';
    case 'tags':
      if(v.length>LEN.tags)return`≤ ${LEN.tags}`;
      return'';
    case 'imageUri':
      if(v && !urlOkay(v) && !/^data:/i.test(v))return'Invalid URI';
      return'';
    default:return'';
  }
}

/*──────────────── component ─────*/
export default function EditTokenMetadata({
  contractAddress='', setSnackbar=()=>{}, onMutate=()=>{}, $level,
}){
  const { toolkit, network='ghostnet' } = useWalletContext()||{};
  const snack = (m,s='info')=>setSnackbar({open:true,message:m,severity:s});

  /*──────── token list ─*/
  const [tokOpts,setTokOpts] = useState([]);      // [{id,name}]
  const [tokenId,setTokenId] = useState('');
  const [loadingIds,setLIds] = useState(false);
  useEffect(()=>{ if(!contractAddress)return; (async()=>{
    setLIds(true);
    const list = await listLiveTokenIds(contractAddress,network,true);
    setTokOpts(list); setLIds(false);
  })(); },[contractAddress,network]);

  /*──────── fetch meta ─*/
  const base = network==='mainnet'?'https://api.tzkt.io/v1':'https://api.ghostnet.tzkt.io/v1';
  const [meta,setMeta]   = useState(null);
  const [busyM,setBM]    = useState(false);
  const fetchMeta = useCallback(async()=>{
    if(!tokenId)return;
    setBM(true);
    try{
      const [row] = await jFetch(`${base}/tokens?contract=${contractAddress}&tokenId=${tokenId}&select=metadata&limit=1`).catch(()=>[]);
      const m = row?.metadata||{};
      if(Array.isArray(m.tags)) m.tags = m.tags.join(', ');
      if(Array.isArray(m.authors)) m.authors = m.authors.join(', ');
      if(Array.isArray(m.creators)) m.creators = m.creators.join(', ');
      setMeta(m);
    }finally{ setBM(false);} },[tokenId,contractAddress,base]);
  useEffect(()=>{fetchMeta();},[fetchMeta]);

  /*──────── form ─*/
  const [form,setForm] = useState({});
  useEffect(()=>{ if(meta) setForm(meta); },[meta]);

  const onChange = (k)=>e=> setForm(f=>({...f,[k]:e.target.value}));

  /*──────── validation ─*/
  const errs = useMemo(()=>{
    const e={}; Object.entries(form).forEach(([k,v])=>{const msg=validateField(form,k,String(v??'')); if(msg)e[k]=msg;}); return e;},[form]);
  const disabled = !tokenId || Object.keys(errs).length || !toolkit;

  /*──────── diffMap & params ─*/
  const diffMap = useMemo(()=>{
    const m=new MichelsonMap();
    const flat={...meta};
    Object.entries(form).forEach(([k,v])=>{
      if(k==='tags') v=v.split(',').map(s=>s.trim()).filter(Boolean);
      if(k==='authors'||k==='creators') v=v.split(',').map(s=>s.trim()).filter(Boolean);
      if(k==='license'&&isCustom(form.license)) v=form.customLicense;
      if(enc(v)!==enc(flat?.[k])) m.set(k,`0x${char2Bytes(enc(v??''))}`);
    });
    return m; },[form,meta]);
  const params = useMemo(()=>(!disabled && toolkit?[{
    kind:OpKind.TRANSACTION,
    ...(toolkit.contract.at?toolkit.contract.at(contractAddress).then(c=>c.methods.edit_token_metadata(diffMap,+tokenId).toTransferParams()):{}),
  }]:[]),[toolkit,disabled,contractAddress,diffMap,tokenId]);
  const est = useTxEstimate(toolkit,params);

  /*──────── overlay ─*/
  const [confirm,setConf]=useState(false);
  const [overlay,setOv]=useState({open:false});

  /*──────── send ─*/
  const send = async()=>{
    if(disabled){snack('Fix errors first','error');return;}
    try{
      setOv({open:true,status:'Waiting for signature…',total:1,current:1});
      const c=await toolkit.wallet.at(contractAddress);
      const op=await c.methods.edit_token_metadata(diffMap,+tokenId).send();
      setOv({open:true,status:'Broadcasting…',total:1,current:1});
      await op.confirmation();
      setOv({open:true,opHash:op.opHash});
      snack('Token metadata updated','success');
      onMutate(); setMeta(null); setForm({});
    }catch(e){ snack(e.message,'error'); setOv({open:false}); }
  };

  /*──────── fields def ─*/
  const FIELDS=[
    {k:'name',label:'Name',mandatory:true},
    {k:'description',label:'Description',tag:'textarea',rows:4},
    {k:'authors',label:'Author(s)',tag:'textarea',rows:2},
    {k:'creators',label:'Creator wallet(s)',tag:'textarea',rows:2,mandatory:true},
    {k:'license',label:'License',tag:'select',mandatory:true},
    {k:'tags',label:'Tags',tag:'textarea',rows:2},
    {k:'attributes',label:'Attributes (JSON)',tag:'textarea',rows:4},
    {k:'imageUri',label:'Image URI',tag:'textarea',rows:2},
  ];

  /*──────── render ─*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Edit Token Metadata</PixelHeading>
      <Notice>Select a token then edit any fields below</Notice>
      <HelpBox>
        Patches selected token’s JSON without touching unaffected keys. Choose token, edit fields, then **Update**. Diff engine only sends changed bytes → lower fees. Custom license? Pick “Custom…” then fill the box.
        <br/>
        <strong>Note:</strong> this does not change the contract owner, it only updates metadata.
        <br/>
      </HelpBox>
      {/* token picker */}
      <Picker>
        <PixelInput
          placeholder="Token-ID"
          value={tokenId}
          onChange={e=>setTokenId(e.target.value.replace(/\D/g,''))}
          style={{flex:1}}
        />
        <Box>
          <select
            style={{width:'100%',height:32}}
            disabled={loadingIds}
            value={tokenId || ''}
            onChange={e=>setTokenId(e.target.value)}
          >
            <option value="">
              {loadingIds ? 'Loading…' : tokOpts.length ? 'Select token' : '— none —'}
            </option>
            {tokOpts.map((t)=>{
              const id   = typeof t==='object'?t.id:t;
              const name = typeof t==='object'?t.name:'';
              return <option key={id} value={id}>{name?`${id} — ${name}`:id}</option>;
            })}
          </select>
          {loadingIds && <Spin />}
        </Box>
      </Picker>

      {busyM && <LoadingSpinner size={32} style={{margin:'1rem auto'}}/>}

      {meta && (
        <>
          <Grid style={{marginTop:'1rem'}}>
            {FIELDS.map(({k,label,tag,rows,mandatory})=>(
              <React.Fragment key={k}>
                <FieldW style={k==='description'?{gridColumn:'1 / -1'}:undefined}>
                  <label htmlFor={k}>{label}{mandatory?' *':''}</label>
                  {tag==='select'? (
                    <PixelInput as="select" id={k} value={form[k]||''} onChange={onChange(k)}>
                      {k==='license' && LICENSES.map(l=><option key={l}>{l}</option>)}
                    </PixelInput>
                  ) : (
                    <PixelInput
                      as={tag}
                      id={k}
                      rows={rows}
                      value={form[k]||''}
                      onChange={onChange(k)}
                      aria-invalid={!!errs[k]}
                      style={errs[k]?{borderColor:'var(--zu-accent-sec)'}:undefined}
                    />
                  )}
                  {errs[k] && <Err>{errs[k]}</Err>}
                </FieldW>
                {k==='license' && isCustom(form.license) && (
                  <FieldW style={{gridColumn:'1 / -1'}}>
                    <label htmlFor="customLicense">Custom license *</label>
                    <PixelInput as="textarea" id="customLicense" rows={2} value={form.customLicense||''} onChange={onChange('customLicense')} aria-invalid={!!errs.customLicense} style={errs.customLicense?{borderColor:'var(--zu-accent-sec)'}:undefined}/>
                    {errs.customLicense && <Err>{errs.customLicense}</Err>}
                  </FieldW>
                )}
              </React.Fragment>
            ))}
          </Grid>

          {/* preview + button */}
          <TokenMetaPanel meta={{...form, license:isCustom(form.license)?form.customLicense:form.license}} tokenId={tokenId} contractAddress={contractAddress}/>

          <div style={{marginTop:'1.2rem',display:'flex',gap:'.8rem'}}>
            <PixelButton disabled={disabled} onClick={()=>setConf(true)} style={{flexGrow:1}}>
              Update
            </PixelButton>
            {disabled && <small style={{opacity:.7}}>{!toolkit?'Wallet?':Object.keys(errs).length?'Errors':''}</small>}
          </div>
        </>
      )}

      {confirm && (
        <OperationConfirmDialog open slices={1} estimate={{feeTez:est.feeTez,storageTez:est.storageTez}} onOk={()=>{setConf(false);send();}} onCancel={()=>setConf(false)}/>
      )}
      {overlay.open && <OperationOverlay {...overlay} onCancel={()=>setOv({open:false})}/>}
    </Wrap>
  );
}
/* What changed & why:
   • Added dual picker: manual input + named dropdown, matching other EPs.
   • tokOpts retains objects so names appear next to IDs.
   • Spinner & layout align with Burn/Destroy UX.
   • Validation & diff logic untouched.
*/
/* EOF */
