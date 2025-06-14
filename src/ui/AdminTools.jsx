/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/AdminTools.jsx
  Rev :    r740   2025-06-28
  Summary: counts via TzKT storage fallback
──────────────────────────────────────────────────────────────*/
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styledPkg         from 'styled-components';
import PixelHeading      from './PixelHeading.jsx';
import PixelButton       from './PixelButton.jsx';
import * as EP           from './Entrypoints/index.js';
import registry          from '../data/entrypointRegistry.json' assert { type:'json' };
import RenderMedia       from '../utils/RenderMedia.jsx';
import countTokens       from '../utils/countTokens.js';
import { useWalletContext } from '../contexts/WalletContext.js';
import { jFetch }        from '../core/net.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── helper utils ─────────────────────────────────────*/
const sz = (v) =>
  Array.isArray(v)                     ? v.length
    : v && typeof v.size === 'number'  ? v.size          /* MichelsonMap ->  Map */
    : v && typeof v.forEach === 'function' ? [...v].length
    : typeof v === 'number'            ? v
    : v && typeof v.int === 'string'   ? parseInt(v.int, 10)
    : 0;

const safeArrLen = (x) => (Array.isArray(x) ? x.length : 0);

/** fetch raw storage from TzKT when toolkit path fails */
async function tzktCounts(addr, net = 'ghostnet') {
  const base =
    net === 'mainnet'
      ? 'https://api.tzkt.io/v1'
      : 'https://api.ghostnet.tzkt.io/v1';
  const raw = await jFetch(`${base}/contracts/${addr}/storage`).catch(() => null);
  return {
    coll  : safeArrLen(raw?.collaborators),
    parent: safeArrLen(raw?.parents),
    child : safeArrLen(raw?.children),
    total : safeArrLen(raw?.active_tokens) || Number(raw?.next_token_id || 0),
  };
}

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

/** REST big-map length fallback (tzkt). */
async function bmLen(addr, path, net = 'ghostnet') {
  const base = net==='mainnet'
    ? 'https://api.tzkt.io/v1'
    : 'https://api.ghostnet.tzkt.io/v1';
  const rows = await jFetch(
    `${base}/contracts/${addr}/bigmaps/${path}/keys?select=key`,
  ).catch(() => []);
  return Array.isArray(rows) ? rows.length : 0;
}

/*──────── EP meta ───────────────────────────────────────────*/
const ALIASES = {
  add_collaborator   :'collab_edit',
  remove_collaborator:'collab_edit',
  /* v4a plural set<> variants */
  add_collaborators  :'collab_edit_v4a',
  remove_collaborators:'collab_edit_v4a',

  add_parent:'parentchild_edit',   remove_parent:'parentchild_edit',
  add_child :'parentchild_edit',   remove_child :'parentchild_edit',
};

const META = {
  /* shared */
  collab_edit:{ label:'Add / Remove Collaborator',        comp:'AddRemoveCollaborator',        group:'Collaborators' },
  collab_edit_v4a:{ label:'Add / Remove Collaborators',   comp:'AddRemoveCollaboratorsv4a',    group:'Collaborators' },

  manage_collaborators:{        label:'Manage Collaborators', comp:'ManageCollaborators',        group:'Collaborators' },
  manage_collaborators_v4a:{    label:'Manage Collaborators', comp:'ManageCollaboratorsv4a',     group:'Collaborators' },

  parentchild_edit:{            label:'Add / Remove Parent/Child', comp:'AddRemoveParentChild', group:'Parent / Child' },
  manage_parent_child:{         label:'Manage Parent/Child',       comp:'ManageParentChild',    group:'Parent / Child' },

  transfer:{ label:'Transfer Tokens',      comp:'Transfer',      group:'Token Actions' },
  balance_of:{ label:'Check Balance',      comp:'BalanceOf',     group:'Token Actions' },
  mint:{ label:'Mint',                     comp:'Mint',          group:'Token Actions' },
  burn:{ label:'Burn',                     comp:'Burn',          group:'Token Actions' },
  destroy:{ label:'Destroy',               comp:'Destroy',       group:'Token Actions' },
  update_operators:{ label:'Update Operators', comp:'UpdateOperators', group:'Operators' },

  append_artifact_uri:{ label:'Append Artifact URI',  comp:'AppendArtifactUri',  group:'Metadata Ops' },
  append_extrauri:{     label:'Append Extra URI',     comp:'AppendExtraUri',     group:'Metadata Ops' },
  clear_uri:{           label:'Clear URI',            comp:'ClearUri',           group:'Metadata Ops' },
  edit_contract_metadata:{ label:'Edit Contract Metadata', comp:'EditContractMetadata', group:'Metadata Ops' },
  edit_token_metadata:{    label:'Edit Token Metadata',   comp:'EditTokenMetadata',   group:'Metadata Ops' },

  /* v4a-specific */
  append_token_metadata:{   label:'Append Token Metadata',   comp:'AppendTokenMetadatav4a',   group:'Metadata Ops' },
  update_contract_metadata:{ label:'Update Contract Metadata', comp:'UpdateContractMetadatav4a', group:'Metadata Ops' },

  /* manual tool */
  repair_uri:{ label:'Repair URI', comp:'RepairUri', group:'Metadata Ops' },
};

/*── descendant-override aware resolver ─────────────────────*/
const resolveEp = (ver = '') => {
  const enabled  = new Set(registry.common ?? []);
  const disabled = new Set();

  let v = ver.toLowerCase().trim();
  while (v && registry[v]) {
    const spec = registry[v];
    Object.entries(spec)
      .filter(([k]) => k !== '$extends')
      .forEach(([k, val]) => {
        if (val === false) {
          enabled.delete(k);
          disabled.add(k);
        } else if (!disabled.has(k)) {
          enabled.add(k);
        }
      });
    v = spec.$extends;
  }

  const vStr = (ver || '').toLowerCase().trim();

  if (vStr.startsWith('v4a')) {
    enabled.add('manage_collaborators_v4a');
  } else {
    enabled.add('manage_collaborators');
    if (enabled.has('parentchild_edit')) enabled.add('manage_parent_child');
  }

  return [...enabled];
};

/*════════ component ════════════════════════════════════════*/
export default function AdminTools({ contract, onClose }) {
  const { network = 'ghostnet' } = useWalletContext() || {};
  const meta     = contract.meta ?? contract;
  const toolkit  = window.tezosToolkit;
  const snackbar = window.globalSnackbar ?? (() => {});

  const [formKey, setFormKey] = useState(null);
  const [counts,  setCounts]  = useState({ coll: 0, parent: 0, child: 0, total: 0 });

  /*── unified counts loader ───────────────────────────────*/
  const refreshCounts = useCallback(async () => {
    let next = { coll: 0, parent: 0, child: 0, total: 0 };

    /* 1️⃣ attempt local Toolkit decode */
    try {
      const c  = await toolkit?.contract?.at?.(contract.address);
      const st = await c?.storage?.();
      next = {
        coll  : sz(st?.collaborators),
        parent: sz(st?.parents),
        child : sz(st?.children),
        total : sz(st?.active_tokens)
                 || sz(st?.total_supply)
                 || sz(st?.next_token_id),
      };
    } catch {/* ignore – fall back */ }

    /* 2️⃣ TzKT raw storage fallback (guaranteed field names) */
    if (!next.coll || !next.parent || !next.child || !next.total) {
      try {
        const remote = await tzktCounts(contract.address, network);
        next = {
          coll  : next.coll  || remote.coll,
          parent: next.parent|| remote.parent,
          child : next.child || remote.child,
          total : next.total || remote.total,
        };
      } catch {/* network issue – ignore */ }
    }

    /* 3️⃣ token-total fallback via countTokens util */
    if (!next.total) next.total = await countTokens(contract.address, network);

    setCounts(next);
  }, [contract.address, toolkit, network]);

  useEffect(() => { void refreshCounts(); }, [refreshCounts]);

  /* group EPs + synthetic repair_uri (v4 / v4a) */
  const grouped = useMemo(()=>{
    const raw = resolveEp(contract.version)
      .map(k=>ALIASES[k]||k)
      .filter(k=>META[k] && EP[META[k].comp]);

    const vStr = (contract.version || '').toString().trim().toLowerCase();
    if (vStr.startsWith('v4')) raw.push('repair_uri');     /* always offer Repair-URI */

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
              /* choose correct manage-key for this contract version */
              const manageKey =
                title==='Collaborators'
                  ? (contract.version?.toLowerCase().startsWith('v4a')
                      ? 'manage_collaborators_v4a'
                      : 'manage_collaborators')
                  : title.startsWith('Parent')
                      ? 'manage_parent_child'
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

                  {manageKey && META[manageKey] && (
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
   • add manage_collaborators_v4a meta + resolver logic.
   • Parent/Child manager only added when supported.
   • manageKey selection now version-aware. */
/* EOF */
