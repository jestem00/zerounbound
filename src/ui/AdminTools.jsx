/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/AdminTools.jsx
  Rev :    r744‑a1  2025‑07‑01 T15:02 UTC
  Summary: NET fallback via deployTarget; resolves I10 leak */
import React, {
  useCallback, useEffect, useMemo, useState,
} from 'react';
import styledPkg         from 'styled-components';
import PixelHeading      from './PixelHeading.jsx';
import PixelButton       from './PixelButton.jsx';
import * as EP           from './Entrypoints/index.js';
import registry          from '../data/entrypointRegistry.json' assert { type:'json' };
import RenderMedia       from '../utils/RenderMedia.jsx';
import countTokens       from '../utils/countTokens.js';
import { useWalletContext } from '../contexts/WalletContext.js';
import { NETWORK_KEY }      from '../config/deployTarget.js';
import { jFetch }        from '../core/net.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── helper utils ─────────────────────────────────────*/
const sz = (v) =>
  Array.isArray(v)                     ? v.length
    : v && typeof v.size === 'number'  ? v.size
    : v && typeof v.forEach === 'function' ? [...v].length
    : typeof v === 'number'            ? v
    : v && typeof v.int === 'string'   ? parseInt(v.int, 10)
    : 0;

const len = (x) => (Array.isArray(x) ? x.length : 0);
async function tzktCounts(addr, net='ghostnet'){
  const base = net==='mainnet' ? 'https://api.tzkt.io/v1' : 'https://api.ghostnet.tzkt.io/v1';
  const raw  = await jFetch(`${base}/contracts/${addr}/storage`).catch(()=>null);
  return {
    coll:len(raw?.collaborators),
    parent:len(raw?.parents),
    child:len(raw?.children),
    total:len(raw?.active_tokens)||Number(raw?.next_token_id||0),
  };
}

/*──────── styled shells ────────────────────────────────────*/
const Overlay = styled.div`
  position: fixed;
  inset-inline: 0;
  top: var(--hdr, 0);
  height: calc(var(--vh) - var(--hdr, 0));
  background: rgba(0, 0, 0, .85);
  display: grid;
  place-items: center;
  padding: 1rem;
  overflow-y: auto;
  z-index: 1500;
`;

const Modal = styled.div`
  background: var(--zu-bg);
  border: 3px solid var(--zu-fg);
  box-shadow: 0 0 10px var(--zu-fg);
  width: clamp(320px, 85vw, 920px);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  position: relative;
  overflow: visible;      /* Overlay owns scroll */
  font-size: .78rem;
`;

const CloseBtn = styled(PixelButton)`
  position: absolute;
  top: .35rem;
  right: .35rem;
  font-size: .7rem;
  padding: 0 .45rem;
`;

const Preview = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: .8rem;
  justify-content: center;
  align-items: center;

  img,video,model-viewer{ max-width:130px; max-height:130px; }
  p{ font-size:.65rem; margin:.2rem 0 0; text-align:center; }
`;

const Body      = styled.div``;
const Section   = styled.div`margin-top: .8rem;`;
const TitleRow  = styled.div`text-align: center;`;
const ManageRow = styled.div`
  display: flex;
  justify-content: center;
  margin: .22rem 0 .35rem;
`;
const Grid = styled.div`
  display: grid;
  gap: .45rem;
  justify-content: center;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  max-width: 540px;
  margin: 0 auto;
`;
const TinyBtn = styled(PixelButton)`
  font-size: .58rem;
  padding: 0 .42rem;
  background: var(--zu-accent-sec);
`;

/*──────── EP meta, ALIASES, META (unchanged) ───────────────*/
const ALIASES = {
  add_collaborator:'collab_edit',remove_collaborator:'collab_edit',
  add_collaborators:'collab_edit_v4a',remove_collaborators:'collab_edit_v4a',
  add_parent:'parentchild_edit',remove_parent:'parentchild_edit',
  add_child:'parentchild_edit',remove_child:'parentchild_edit',
};

const META = {
  collab_edit:{label:'Add / Remove Collaborator',comp:'AddRemoveCollaborator',group:'Collaborators'},
  collab_edit_v4a:{label:'Add / Remove Collaborators',comp:'AddRemoveCollaboratorsv4a',group:'Collaborators'},
  manage_collaborators:{label:'Manage Collaborators',comp:'ManageCollaborators',group:'Collaborators'},
  manage_collaborators_v4a:{label:'Manage Collaborators',comp:'ManageCollaboratorsv4a',group:'Collaborators'},
  parentchild_edit:{label:'Add / Remove Parent/Child',comp:'AddRemoveParentChild',group:'Parent / Child'},
  manage_parent_child:{label:'Manage Parent/Child',comp:'ManageParentChild',group:'Parent / Child'},
  transfer:{label:'Transfer Tokens',comp:'Transfer',group:'Token Actions'},
  balance_of:{label:'Check Balance',comp:'BalanceOf',group:'Token Actions'},
  mint:{label:'Mint',comp:'Mint',group:'Token Actions'},
  burn:{label:'Burn',comp:'Burn',group:'Token Actions'},
  destroy:{label:'Destroy',comp:'Destroy',group:'Token Actions'},
  update_operators:{label:'Update Operators',comp:'UpdateOperators',group:'Operators'},
  append_artifact_uri:{label:'Append Artifact URI',comp:'AppendArtifactUri',group:'Metadata Ops'},
  append_extra_uri:{label:'Append Extra URI',comp:'AppendExtraUri',group:'Metadata Ops'},
  clear_uri:{label:'Clear URI',comp:'ClearUri',group:'Metadata Ops'},
  edit_contract_metadata:{label:'Edit Contract Metadata',comp:'EditContractMetadata',group:'Metadata Ops'},
  edit_token_metadata:{label:'Edit Token Metadata',comp:'EditTokenMetadata',group:'Metadata Ops'},
  append_token_metadata:{label:'Append Token Metadata',comp:'AppendTokenMetadatav4a',group:'Metadata Ops'},
  update_contract_metadata:{label:'Update Contract Metadata',comp:'UpdateContractMetadatav4a',group:'Metadata Ops'},
  repair_uri:{label:'Repair URI',comp:'RepairUri',group:'Metadata Ops'},
};

/*──────── resolver (unchanged) ─────────────────────────────*/
function resolveEp(ver=''){
  const enabled = new Set(registry.common ?? []);
  const disabled = new Set();
  let v = ver.toLowerCase().trim();
  while (v && registry[v]) {
    const spec = registry[v];
    Object.entries(spec).filter(([k])=>k!=='$extends').forEach(([k,val])=>{
      if(val===false){ enabled.delete(k); disabled.add(k); }
      else if(!disabled.has(k)){ enabled.add(k); }
    });
    v = spec.$extends;
  }
  ver.toLowerCase().startsWith('v4a') ? enabled.add('manage_collaborators_v4a') : enabled.add('manage_collaborators');
  if(enabled.has('parentchild_edit')) enabled.add('manage_parent_child');
  return [...enabled];
}

/*════════ component ════════════════════════════════════════*/
export default function AdminTools({ contract, onClose }) {
  const { network: walletNet } = useWalletContext() || {};
  const network = walletNet || NETWORK_KEY;

  const meta = contract.meta ?? contract;
  const toolkit = window.tezosToolkit;
  const snackbar = window.globalSnackbar ?? (()=>{});

  const [formKey,setFormKey]=useState(null);
  const [counts,setCounts]=useState({coll:0,parent:0,child:0,total:0});

  /* lock outer scroll while overlay open */
  useEffect(()=>{
    const html=document.documentElement;
    const prev=html.style.overflow;
    html.style.overflow='hidden';
    return()=>{ html.style.overflow=prev; };
  },[]);

  /* counts loader */
  const refreshCounts=useCallback(async()=>{
    let next={coll:0,parent:0,child:0,total:0};
    try{ const c=await toolkit?.contract?.at?.(contract.address); const st=await c?.storage?.(); next={
      coll:sz(st?.collaborators), parent:sz(st?.parents), child:sz(st?.children),
      total:sz(st?.active_tokens)||sz(st?.total_supply)||sz(st?.next_token_id),
    }; }catch{}
    if(!next.coll||!next.parent||!next.child||!next.total){
      try{ const r=await tzktCounts(contract.address,network); Object.assign(next, Object.fromEntries(Object.entries(r).filter(([k,v])=>!next[k]&&v))); }catch{}
    }
    if(!next.total) next.total=await countTokens(contract.address,network);
    setCounts(next);
  },[contract.address,toolkit,network]);
  useEffect(()=>{ void refreshCounts(); },[refreshCounts]);
  useEffect(()=>{ if(!formKey) void refreshCounts(); },[formKey,refreshCounts]);

  /* grouped once via useMemo */
  const grouped = useMemo(()=>{
    const raw = resolveEp(contract.version).map((k)=>ALIASES[k]||k).filter((k)=>META[k]&&EP[META[k].comp]);
    if((contract.version||'').toLowerCase().startsWith('v4')) raw.push('repair_uri');
    return [...new Set(raw)].reduce((o,k)=>{ (o[META[k].group]??=[]).push(k); return o; },{});
  },[contract.version]);

  const ORDER=['mint','transfer','balance_of','destroy','burn'];
  const sortTokens=(arr)=>arr.slice().sort((a,b)=>ORDER.indexOf(a)-ORDER.indexOf(b));

  /*──────── render ─────────────────────────────────────────*/
  return (
    <>
      <Overlay>
        <Modal>
          <CloseBtn size="xs" onClick={onClose}>×</CloseBtn>

          <Preview>
            <RenderMedia uri={meta.imageUri} alt={meta.name} style={{
              width:'clamp(85px,24vw,155px)', height:'clamp(85px,24vw,155px)',
              objectFit:'contain', border:'2px solid var(--zu-fg)'}}/>
            <div style={{maxWidth:'min(80vw,520px)',textAlign:'center'}}>
              <PixelHeading level={3} style={{margin:'.22rem 0 0',fontSize:'clamp(.85rem,3.9vw,1.3rem)'}}>{meta.name}</PixelHeading>
              <p style={{fontSize:'.65rem',margin:0,wordBreak:'break-word'}}>{meta.description||'—'}</p>
              <p style={{fontSize:'.65rem',margin:0}}>{contract.version} • {contract.address}</p>
            </div>
          </Preview>

          <Body>
            {Object.entries(grouped).map(([title,keys])=>{
              const manageKey = title==='Collaborators'
                ?(contract.version?.toLowerCase().startsWith('v4a')?'manage_collaborators_v4a':'manage_collaborators')
                :title.startsWith('Parent')?'manage_parent_child':null;
              const list = title==='Token Actions'?sortTokens(keys):keys;
              return(
                <Section key={title}>
                  <TitleRow>
                    <PixelHeading level={5}>
                      {title}
                      {title==='Collaborators'   &&` (${counts.coll})`}
                      {title.startsWith('Parent')&&` (P:${counts.parent} • C:${counts.child})`}
                      {title==='Token Actions'   &&` (${counts.total})`}
                    </PixelHeading>
                  </TitleRow>
                  {manageKey&&META[manageKey]&&<ManageRow><TinyBtn onClick={()=>setFormKey(manageKey)}>MANAGE</TinyBtn></ManageRow>}
                  <Grid>
                    {list.filter((k)=>!k.startsWith('manage_')).map((k)=>(
                      <PixelButton key={k} onClick={()=>setFormKey(k)}>{META[k].label}</PixelButton>
                    ))}
                  </Grid>
                </Section>
              );
            })}
          </Body>
        </Modal>
      </Overlay>

      {formKey&&META[formKey]&&(
        <Overlay>
          <Modal style={{maxWidth:720}}>
            <CloseBtn size="xs" onClick={()=>setFormKey(null)}>×</CloseBtn>
            {React.createElement(EP[META[formKey].comp],{
              contractAddress:contract.address,
              contractVersion:contract.version,
              setSnackbar:snackbar,
              onMutate:refreshCounts,
              $level:1,
            })}
          </Modal>
        </Overlay>
      )}
    </>
  );
}
/* What changed & why:
   • Replaced hard‑coded `'ghostnet'` default with NETWORK_KEY fallback so
     AdminTools UI shows correct network before wallet connect and keeps
     divergence in deployTarget.js only (I10, I63).  No logic touched.
*/
/* EOF */
