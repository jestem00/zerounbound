/*Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/AdminTools.jsx
  Rev :    r595   2025-06-15
  Summary: “Repair URI” tile now shown only on v4 / v4a
           contracts; no other logic touched. */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styledPkg         from 'styled-components';
import PixelHeading      from './PixelHeading.jsx';
import PixelButton       from './PixelButton.jsx';
import * as EP           from './Entrypoints/index.js';
import registry          from '../data/entrypointRegistry.json' assert {type:'json'};
import RenderMedia       from '../utils/RenderMedia.jsx';
import countTokens       from '../utils/countTokens.js';
import { useWalletContext } from '../contexts/WalletContext.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── shells ───────────────────────────────────────────*/
const Overlay = styled.div`
  position: fixed; inset-inline: 0; top: var(--hdr,0);
  height: calc(100vh - var(--hdr,0));
  background: rgba(0,0,0,.85); overflow-y: auto; z-index: 1300;
  display: flex; flex-direction: column; align-items: center;
  padding-block: 1.2rem;
`;
const Modal = styled.div`
  width: clamp(300px,95vw,1180px); background: var(--zu-bg);
  border: 3px solid var(--zu-fg); padding: 1rem; position: relative;
  display: flex; flex-direction: column; gap: 1rem; overflow-y: auto;
  box-shadow: 0 0 10px var(--zu-fg);
`;
const CloseBtn = styled(PixelButton)`
  position: absolute; top: .4rem; right: .4rem;
  font-size: .8rem; padding: 0 .55rem;
`;
const Preview = styled.div`
  display: flex; flex-wrap: wrap; gap: 1rem; justify-content: center;
  img,video,model-viewer{ max-width:140px; max-height:140px; }
  p{ font-size:.7rem; margin:.25rem 0 0; text-align:center; }
`;
const Body      = styled.div`margin-top:.8rem;`;
const Section   = styled.div`margin-top:.8rem;`;
const TitleRow  = styled.div`text-align:center;`;
const ManageRow = styled.div`display:flex;justify-content:center;margin:.25rem 0 .4rem;`;
const Grid      = styled.div`
  display:grid;gap:.55rem;justify-content:center;
  grid-template-columns:repeat(auto-fit,minmax(110px,1fr));
  max-width:600px;margin:0 auto;
`;
const TinyBtn = styled(PixelButton)`
  font-size:.62rem;padding:0 .45rem;background:var(--zu-accent-sec);
`;

/*──────── EP meta ───────────────────────────────────────────*/
const ALIASES = {
  add_collaborator:'collab_edit', remove_collaborator:'collab_edit',
  add_parent:'parentchild_edit',  remove_parent:'parentchild_edit',
  add_child:'parentchild_edit',   remove_child:'parentchild_edit',
};
const META = {
  collab_edit:{ label:'Add / Remove Collaborator', comp:'AddRemoveCollaborator', group:'Collaborators' },
  manage_collaborators:{ label:'Manage Collaborators', comp:'ManageCollaborators', group:'Collaborators' },
  parentchild_edit:{ label:'Add / Remove Parent/Child', comp:'AddRemoveParentChild', group:'Parent / Child' },
  manage_parent_child:{ label:'Manage Parent/Child', comp:'ManageParentChild', group:'Parent / Child' },

  transfer:{ label:'Transfer Tokens', comp:'Transfer', group:'Token Actions' },
  balance_of:{ label:'Check Balance', comp:'BalanceOf', group:'Token Actions' },
  mint:{ label:'Mint', comp:'Mint', group:'Token Actions' },
  burn:{ label:'Burn', comp:'Burn', group:'Token Actions' },
  destroy:{ label:'Destroy', comp:'Destroy', group:'Token Actions' },
  update_operators:{ label:'Update Operators', comp:'UpdateOperators', group:'Operators' },

  append_artifact_uri:{ label:'Append Artifact URI', comp:'AppendArtifactUri', group:'Metadata Ops' },
  append_extrauri:{ label:'Append Extra URI', comp:'AppendExtraUri', group:'Metadata Ops' },
  clear_uri:{ label:'Clear URI', comp:'ClearUri', group:'Metadata Ops' },
  edit_contract_metadata:{ label:'Edit Contract Metadata', comp:'EditContractMetadata', group:'Metadata Ops' },
  edit_token_metadata:{ label:'Edit Token Metadata', comp:'EditTokenMetadata', group:'Metadata Ops' },

  /* new manual tool (not a real on-chain EP) */
  repair_uri:{ label:'Repair URI', comp:'RepairUri', group:'Metadata Ops' },
};

const resolveEp = (ver='')=>{
  const set=new Set(registry.common ?? []);
  let v=ver.toLowerCase();
  while(v && registry[v]){
    Object.entries(registry[v])
      .filter(([k,val])=>k!=='$extends' && val!==false)
      .forEach(([k])=>set.add(k));
    v = registry[v].$extends;
  }
  set.add('manage_collaborators').add('manage_parent_child');
  return [...set];
};

/*════════ component ════════════════════════════════════════*/
export default function AdminTools({ contract, onClose }) {
  const { network='ghostnet' } = useWalletContext() || {};
  const meta     = contract.meta ?? contract;
  const toolkit  = window.tezosToolkit;
  const snackbar = window.globalSnackbar ?? (()=>{});

  const [formKey,setFormKey] = useState(null);
  const [counts,setCounts]   = useState({ coll:0,parent:0,child:0,total:0 });

  /*── storage + REST probe ──*/
  const refreshCounts = useCallback(async () => {
    try{
      const c  = await toolkit?.contract?.at?.(contract.address);
      const st = await c?.storage?.();
      const sz = (v)=>
        Array.isArray(v)?v.length
          : typeof v?.forEach==='function'?[...v].length
          : typeof v==='number'?v
          : typeof v?.int==='string'?parseInt(v.int,10)
          : 0;
      setCounts({
        coll  : sz(st?.collaborators),
        parent: sz(st?.parents),
        child : sz(st?.children),
        total : sz(st?.active_tokens)||sz(st?.total_supply)||sz(st?.next_token_id)||0,
      });
      if(counts.total) return;
    }catch{}
    const total = await countTokens(contract.address, network);
    setCounts(p=>({...p,total}));
  },[contract.address, toolkit, network]);

  useEffect(()=>{ void refreshCounts(); },[refreshCounts]);

  /* group EPs + synthetic repair_uri if v4/v4a */
  const grouped = useMemo(()=>{
    const raw = resolveEp(contract.version)
      .map(k=>ALIASES[k]||k)
      .filter(k=>META[k] && EP[META[k].comp]);

    if (/^v4/.test(contract.version)) raw.push('repair_uri');

    return [...new Set(raw)].reduce((o,k)=>{
      (o[META[k].group]??=[]).push(k); return o;
    },{});
  },[contract.version]);

/*──────── render ───────────────────────────────────────────*/
  return (
    <>
      <Overlay>
        <Modal>
          <CloseBtn size="xs" onClick={onClose}>×</CloseBtn>

          <Preview>
            <RenderMedia
              uri={meta.imageUri}
              alt={meta.name}
              style={{
                width:'clamp(90px,25vw,150px)',
                height:'clamp(90px,25vw,150px)',
                objectFit:'contain',
                border:'2px solid var(--zu-fg)',
              }}
            />
            <div style={{ maxWidth:'min(85vw,440px)', textAlign:'center' }}>
              <PixelHeading
                level={3}
                style={{
                  margin:'.25rem 0 0',
                  fontSize:'clamp(.9rem,4vw,1.3rem)',
                  whiteSpace:'nowrap',
                  overflow:'hidden',
                  textOverflow:'ellipsis',
                }}
              >
                {meta.name}
              </PixelHeading>
              <p style={{ fontSize:'.72rem', margin:0, wordBreak:'break-word' }}>
                {meta.description || '—'}
              </p>
              <p style={{ fontSize:'.72rem', margin:0 }}>
                {contract.version} • {contract.address}
              </p>
            </div>
          </Preview>

          <Body>
            {Object.entries(grouped).map(([title,keys])=>{
              const manageKey =
                title==='Collaborators' ? 'manage_collaborators'
                  : title.startsWith('Parent') ? 'manage_parent_child'
                  : null;

              return (
                <Section key={title}>
                  <TitleRow>
                    <PixelHeading level={5} style={{margin:0}}>
                      {title}
                      {title==='Collaborators' && ` (${counts.coll})`}
                      {title.startsWith('Parent') &&
                        ` (P:${counts.parent} • C:${counts.child})`}
                    </PixelHeading>
                  </TitleRow>

                  {manageKey && (
                    <ManageRow>
                      <TinyBtn onClick={()=>setFormKey(manageKey)}>MANAGE</TinyBtn>
                    </ManageRow>
                  )}

                  <Grid>
                    {keys.filter(k=>!k.startsWith('manage_')).map(k=>(
                      <PixelButton key={k} onClick={()=>setFormKey(k)}>
                        {META[k].label}
                      </PixelButton>
                    ))}
                  </Grid>
                </Section>
              );
            })}
          </Body>
        </Modal>
      </Overlay>

      {formKey && META[formKey] && (
        <Overlay>
          <Modal style={{maxWidth:720}}>
            <CloseBtn size="xs" onClick={()=>setFormKey(null)}>×</CloseBtn>
            {(() => {
              const C = EP[META[formKey].comp];
              return (
                <C
                  contractAddress={contract.address}
                  contractVersion={contract.version}
                  setSnackbar={snackbar}
                  onMutate={refreshCounts}
                  $level={1}
                />
              );
            })()}
          </Modal>
        </Overlay>
      )}
    </>
  );
}

/* What changed & why:
   • Repair URI button is now rendered only for v4 / v4a contracts,
     preventing confusion on legacy versions.
   • No functional changes elsewhere. */
/* EOF */
