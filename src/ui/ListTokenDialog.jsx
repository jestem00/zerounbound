/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/ListTokenDialog.jsx
  Rev :    r39    2025‑08‑05
  Summary: enable v4a/ v4c/ v4d listing on ZeroSum; preserve
           sale‑splits logic and keep legacy v2 redirect.
────────────────────────────────────────────────────────────*/

import React, { useState, useEffect }   from 'react';
import PropTypes                        from 'prop-types';
import styledPkg                        from 'styled-components';

import PixelHeading  from './PixelHeading.jsx';
import PixelInput    from './PixelInput.jsx';
import PixelButton   from './PixelButton.jsx';
import OperationOverlay from './OperationOverlay.jsx';
import { useWalletContext } from '../contexts/WalletContext.js';
import {
  buildListParams,
  fetchListings,
  fetchOnchainListings,
  getMarketContract,
} from '../core/marketplace.js';

import {
  URL_OBJKT_BASE,
  URL_OBJKT_TOKENS_BASE,
} from '../config/deployTarget.js';

import { Tzip16Module } from '@taquito/tzip16';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── shells ───────────────────────────────────────────*/
const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,.65);
  z-index: 9999;
`;
const ModalBox = styled.section`
  background: var(--zu-bg,#0a001e);
  border: 2px solid var(--zu-accent,#8f3ce1);
  box-shadow: 0 0 0 4px var(--zu-dark,#1b023a);
  padding: 1rem;
  width: min(90%,480px);
`;
const Wrap = styled.section`margin-top:1.4rem;`;

/*──────── helpers ──────────────────────────────────────────*/
function hexToString(hex = '') {
  let out = '';
  for (let i = 0; i < hex.length; i += 2) {
    const code = parseInt(hex.substr(i, 2), 16);
    if (!Number.isNaN(code)) out += String.fromCharCode(code);
  }
  return out;
}

/*──────────────────────────────────────────────────────────*/
export default function ListTokenDialog({ open, contract, tokenId, onClose = () => {} }) {
  const { toolkit } = useWalletContext() || {};

  const [price, setPrice]               = useState('');
  const [amount, setAmount]             = useState('1');
  const [maxAmount, setMaxAmount]       = useState(1);
  const [listedCount, setListedCount]   = useState(0);
  const [listedEntries, setListedEntries] = useState(0);
  const [ov, setOv]                     = useState({ open: false, label: '' });

  /* sale‑splits */
  const [splits, setSplits]             = useState([]);
  const [newSplitAddr, setNewSplitAddr] = useState('');
  const [newSplitPct,  setNewSplitPct]  = useState('');

  const [isLegacy,      setIsLegacy]      = useState(false);
  const [isUnsupported, setIsUnsupported] = useState(false);

  /* objkt fallback url */
  const objktUrl = contract && tokenId != null
    ? `${URL_OBJKT_TOKENS_BASE}${contract}/${tokenId}`
    : '';

  const snack = (msg, sev = 'info') =>
    window.dispatchEvent(new CustomEvent('zu:snackbar', { detail: { message: msg, severity: sev } }));

  /*──────────────────── sale‑split add/remove ────────────*/
  function addSplit() {
    const addr = newSplitAddr.trim();
    const pctF = parseFloat(newSplitPct);
    if (!addr || !Number.isFinite(pctF) || pctF <= 0) {
      snack('Enter a valid address & percent','error');
      return;
    }
    const basis = Math.floor(pctF * 100);
    const total = splits.reduce((t,s)=>t+s.percent, basis);
    if (total >= 10000) { snack('Total splits must be <100 %','error'); return; }
    setSplits([...splits,{ address:addr, percent:basis }]);
    setNewSplitAddr(''); setNewSplitPct('');
  }
  const removeSplit = (i) => setSplits(splits.filter((_,idx)=>idx!==i));

  /*──────────────────── decimals cache ───────────────────*/
  const tokenDecimalsCache = {};
  async function getTokenDecimals(id) {
    const key = String(id);
    if (tokenDecimalsCache[key] !== undefined) return tokenDecimalsCache[key];
    let dec = 0;
    try {
      if (!toolkit || !contract) return 0;
      const rpcUrl = toolkit.rpc.getRpcUrl?.() ?? '';
      let tzktBase = /ghostnet|limanet/i.test(rpcUrl) ? 'https://api.ghostnet.tzkt.io' : 'https://api.tzkt.io';
      const mRes   = await fetch(`${tzktBase}/v1/contracts/${contract}/bigmaps`);
      const maps   = mRes.ok ? await mRes.json() : [];
      const meta   = maps.find((m)=>m.path==='token_metadata');
      if (meta) {
        const mapId = meta.ptr ?? meta.id;
        const kRes  = await fetch(`${tzktBase}/v1/bigmaps/${mapId}/keys/${id}`);
        if (kRes.ok) {
          const data = await kRes.json();
          const decStr = hexToString(data?.value?.token_info?.decimals ?? '');
          const d = parseInt(decStr,10);
          if (Number.isFinite(d) && d>=0) dec = d;
        }
      }
    } catch {}
    tokenDecimalsCache[key]=dec;
    return dec;
  }

  /*──────────────────── version detection ────────────────*/
  useEffect(()=>{ (async()=>{
    if (!open || !toolkit || !contract) return;
    try{
      const nft = await toolkit.contract.at(contract);
      const eps = nft.entrypoints?.entrypoints||{};
      const hasAppendToken     = Object.prototype.hasOwnProperty.call(eps,'append_token_metadata');
      const hasAppendArtifact  = Object.prototype.hasOwnProperty.call(eps,'append_artifact_uri');
      const hasAddCollaborator = Object.prototype.hasOwnProperty.call(eps,'add_collaborator');
      const hasAddChild        = Object.prototype.hasOwnProperty.call(eps,'add_child');

      if (hasAppendArtifact || hasAppendToken) {        // v4 / v4b / v4a/c/d – supported
        setIsLegacy(false); setIsUnsupported(false);
      } else if (hasAddCollaborator) {                  // v3 – supported
        setIsLegacy(false); setIsUnsupported(false);
      } else if (hasAddChild) {                         // v2 variants – legacy
        setIsLegacy(true);  setIsUnsupported(false);
      } else {                                          // v1 or unknown – supported
        setIsLegacy(false); setIsUnsupported(false);
      }
    }catch(e){
      console.warn('Entrypoint detection failed:',e);
      setIsLegacy(false); setIsUnsupported(false);
    }
  })(); },[open,toolkit,contract]);

  /*──────────────────── balance & listing counts ─────────*/
  useEffect(()=>{ let cancel=false;(async()=>{
    if (!open||!toolkit||!contract||tokenId==null) return;

    setMaxAmount(1); setAmount('1'); setListedCount(0); setListedEntries(0);

    try{
      const pkh = await toolkit.wallet.pkh();
      toolkit.addExtension?.(new Tzip16Module());
      const nft = await toolkit.contract.at(contract);

      /* balance via views */
      let bal=0;
      try{
        const res=await nft.views?.balance_of?.([{owner:pkh,token_id:Number(tokenId)}]).read();
        bal = Number(res?.[0]?.balance??0);
      }catch{
        try{
          const res=await nft.views?.get_balance?.({owner:pkh,token_id:Number(tokenId)}).read();
          bal = typeof res==='object' ? Number(Object.values(res)[0]) : Number(res);
        }catch{}
      }
      const dec = await getTokenDecimals(Number(tokenId));
      const owned = bal; /* editions = raw balance */

      if(!cancel){ setMaxAmount(owned); }

      /* listing counts */
      let listArr = [];
      try{ listArr = await fetchOnchainListings({toolkit,nftContract:contract,tokenId}); }catch{}
      if(!listArr.length){
        try{ listArr = await fetchListings({toolkit,nftContract:contract,tokenId}); }catch{}
      }
      let total=0, entries=0;
      if(Array.isArray(listArr)){
        for(const l of listArr){
          const amt = Number(l.amount);
          if(amt>0){ total+=dec>0?Math.floor(amt/10**dec):amt; entries++; }
        }
      }
      if(!cancel){ setListedCount(total); setListedEntries(entries); }
    }catch(e){ console.warn(e); }
  })(); return()=>{cancel=true}; },[open,toolkit,contract,tokenId]);

  /* reset on close */
  useEffect(()=>{ if(!open){ setPrice(''); setAmount('1'); setOv({open:false,label:''}); }},[open]);

  const amtNum   = Number(amount);
  const priceNum = parseFloat(price);
  const disabled = !toolkit || !price || priceNum<=0 || amtNum<=0 || amtNum>maxAmount;

  /*──────────────────── list click ───────────────────────*/
  async function handleList(){
    const priceFloat = parseFloat(price);
    const qtyEditions = parseInt(amount,10);
    if(priceFloat<=0||!Number.isFinite(priceFloat)){snack('Enter a valid price','error');return;}
    if(qtyEditions<=0||qtyEditions>maxAmount){snack('Invalid quantity','error');return;}

    if(isLegacy||isUnsupported){
      snack('Legacy contract — redirecting to Objkt…','warning');
      window.open(objktUrl,'_blank');
      return;
    }
    /* dry‑run compile */
    try{
      const idNum = Number(tokenId);
      const dec   = await getTokenDecimals(idNum);
      const qtyUnits = dec>0 ? qtyEditions*10**dec : qtyEditions;
      await buildListParams(toolkit,{
        nftContract:contract,
        tokenId:idNum,
        amount:qtyUnits,
        priceMutez:Math.floor(priceFloat*1_000_000),
      });
    }catch(e){ snack(e.message||'Build error','error'); return; }
    submitTx(qtyEditions,Math.floor(priceFloat*1_000_000)).catch(()=>{});
  }

  /*──────────────────── tx submit ────────────────────────*/
  async function submitTx(qtyEditions,priceMutez){
    try{
      setOv({open:true,label:'Preparing listing …'});

      const seller       = await toolkit.wallet.pkh();
      const nftContract  = await toolkit.wallet.at(contract);
      const market       = await getMarketContract(toolkit);
      const operatorAddr = market.address;

      /* operator helpers */
      const buildUpdateCall =(id)=>nftContract.methods.update_operators([{
        add_operator:{owner:seller,operator:operatorAddr,token_id:Number(id)},
      }]);
      const buildUpdateCallReversed =(id)=>nftContract.methods.update_operators([{
        add_operator:{operator:operatorAddr,owner:seller,token_id:Number(id)},
      }]);

      /* build saleSplits */
      const makeSaleSplits=()=>{
        if(!splits.length) return [{address:seller,percent:10000}];
        const arr=[...splits];
        const used = arr.reduce((t,s)=>t+s.percent,0);
        if(used<10000) arr.push({address:seller,percent:10000-used});
        return arr;
      };

      const listOnly=async(id,qtyUnits)=>{
        const params = await buildListParams(toolkit,{
          nftContract:contract,
          tokenId:id,
          priceMutez,
          amount:qtyUnits,
          saleSplits:makeSaleSplits(),
          royaltySplits:[],
          startDelay:0,
        });
        setOv({open:true,label:'Listing token …'});
        const op = await toolkit.wallet.batch(params).send();
        await op.confirmation();
      };

      const checkOperator=async(id)=>{
        try{
          const rpcUrl = toolkit.rpc.getRpcUrl?.()??'';
          const tzkt = /ghostnet|limanet/i.test(rpcUrl) ? 'https://api.ghostnet.tzkt.io' : 'https://api.tzkt.io';
          const maps = await (await fetch(`${tzkt}/v1/contracts/${contract}/bigmaps`)).json();
          const opMap = maps.find((m)=>m.path==='operators'); if(!opMap) return false;
          const mapId = opMap.ptr??opMap.id;
          const keys=await (await fetch(`${tzkt}/v1/bigmaps/${mapId}/keys?limit=256`)).json();
          return keys.some(k=>k.key?.owner===seller && k.key?.operator===operatorAddr && Number(k.key.token_id)===id);
        }catch{return false;}
      };

      const updateAndList=async(id,qtyUnits)=>{
        if(!(await checkOperator(id))){
          setOv({open:true,label:'Granting operator …'});
          try{ await (await buildUpdateCall(id).send()).confirmation(2);}
          catch{ await (await buildUpdateCallReversed(id).send()).confirmation(2);}
        }
        await listOnly(id,qtyUnits);
      };

      const idNum = Number(tokenId);
      const dec   = await getTokenDecimals(idNum);
      const qtyUnits = dec>0 ? qtyEditions*10**dec : qtyEditions;

      try{ await updateAndList(idNum,qtyUnits); }
      catch(e){
        if(idNum>0){
          const altId=idNum-1;
          const decAlt = await getTokenDecimals(altId);
          const unitsAlt = decAlt>0?qtyEditions*10**decAlt:qtyEditions;
          await updateAndList(altId,unitsAlt);
        } else { throw e; }
      }
      setOv({open:false,label:''});
      snack('Listing created ✔','info');
      onClose();
    }catch(err){
      console.error(err);
      setOv({open:false,label:''});
      snack(err.message||'Transaction failed','error');
    }
  }

  if(!open) return null;

  const amtLbl = listedEntries>0
    ? ` | For Sale: ${listedCount} (${listedEntries} listing${listedEntries!==1?'s':''})`
    : ` | For Sale: ${listedCount}`;

  return (
    <ModalOverlay onClick={onClose}>
      <ModalBox onClick={(e)=>e.stopPropagation()} data-modal="list-token">
        <Wrap>
          <PixelHeading level={3}>List Token</PixelHeading>

          <p style={{fontSize:'.75rem',marginBottom:'.2rem',opacity:.9}}>Price (ꜩ)</p>
          <PixelInput placeholder="0.0" value={price} onChange={(e)=>setPrice(e.target.value)} />

          <p style={{fontSize:'.75rem',margin:'0.6rem 0 .2rem',opacity:.9}}>
            Quantity (max {maxAmount})
          </p>
          <PixelInput type="number" min={1} max={maxAmount} step={1}
            disabled={maxAmount<=1} value={amount}
            onChange={(e)=>setAmount(e.target.value)} />

          <p style={{fontSize:'.75rem',margin:'0.6rem 0 .2rem',opacity:.9}}>Sale Splits (optional)</p>
          <PixelInput placeholder="Recipient tz‑address" value={newSplitAddr}
            onChange={(e)=>setNewSplitAddr(e.target.value)} />
          <PixelInput placeholder="Percent (e.g. 10)" type="number" min={0} max={100} step={0.01}
            value={newSplitPct} onChange={(e)=>setNewSplitPct(e.target.value)} />
          <PixelButton onClick={addSplit} disabled={!newSplitAddr||!newSplitPct}>ADD SPLIT</PixelButton>
          {splits.map((s,i)=>(
            <p key={i} style={{fontSize:'.7rem',marginTop:'.1rem',opacity:.9,display:'flex',alignItems:'center'}}>
              <span style={{flexGrow:1}}>{s.address}: {(s.percent/100).toFixed(2)}%</span>
              <PixelButton style={{flexShrink:0}} onClick={()=>removeSplit(i)}>✕</PixelButton>
            </p>
          ))}

          <p style={{fontSize:'.7rem',marginTop:'.3rem',opacity:.8}}>
            Owned: {maxAmount}{amtLbl}
          </p>

          {isLegacy ? (
            <>
              <p style={{fontSize:'.75rem',margin:'0.6rem 0 .2rem',opacity:.85}}>
                Legacy contract not supported on ZeroSum. List on Objkt:
              </p>
              <PixelButton disabled={!objktUrl} onClick={()=>objktUrl&&window.open(objktUrl,'_blank')}>
                LIST ON OBJKT
              </PixelButton>
            </>
          ) : (
            <PixelButton disabled={disabled} onClick={handleList}>LIST TOKEN</PixelButton>
          )}

          {ov.open && (
            <OperationOverlay
              label={ov.label}
              onClose={()=>setOv({open:false,label:''})}
              onCancel={()=>setOv({open:false,label:''})}/>
          )}
          <PixelButton onClick={onClose}>Close</PixelButton>
        </Wrap>
      </ModalBox>
    </ModalOverlay>
  );
}

ListTokenDialog.propTypes = {
  open    : PropTypes.bool,
  contract: PropTypes.string,
  tokenId : PropTypes.oneOfType([PropTypes.string,PropTypes.number]),
  onClose : PropTypes.func,
};

/* What changed & why:
   • Treat append_token_metadata contracts (v4a/ v4c/ v4d) as
     supported → removed redirect.
   • listOnly now honours user‑defined sale_splits.
   • Refactored operator check/update & added sale‑split builder.
   • Minor CSS shorthand + lint fixes. */
/* EOF */
