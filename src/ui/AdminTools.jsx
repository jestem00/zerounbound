/*Developed by @jams2blues with love for the Tezos community
  File: src/ui/AdminTools.jsx
  Summary: restores missing FormModal constant and keeps header-offset
           overlay fix – prevents “FormModal is not defined” runtime. */

import React, {
  Fragment, useCallback, useEffect, useMemo, useState,
}                               from 'react';
import styledPkg                from 'styled-components';
import PixelHeading             from './PixelHeading.jsx';
import PixelButton              from './PixelButton.jsx';
import * as EP                  from './Entrypoints/index.js';
import registry                 from '../data/entrypointRegistry.json' assert { type: 'json' };
import RenderMedia              from '../utils/RenderMedia.jsx';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── modal shells ────────────────────────────────────────────*/
const Overlay = styled.div`
  position: fixed;
  inset-inline: 0;
  top: var(--hdr, 0px);
  height: calc(100vh - var(--hdr, 0px));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding-block: 1.2rem;
  background: rgba(0,0,0,0.85);
  z-index: 1300;
  overflow-y: auto;
`;

const Modal = styled.div`
  width: clamp(300px, 95vw, 1180px);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background: var(--zu-bg);
  border: 3px solid var(--zu-fg);
  padding: 1rem;
  box-shadow: 0 0 10px var(--zu-fg);
  position: relative;
  overflow-y: auto;
`;

const CloseBtn = styled(PixelButton)`
  position: absolute;
  top: .4rem;
  right: .4rem;
  padding: 0 .55rem;
`;

/* Preview + information */
const Preview = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
  justify-content: center;
  text-align: center;
  img, video, model-viewer { max-width: 140px; max-height: 140px; }
  p { font-size: .7rem; margin: .25rem 0 0; }
`;

/* content area – overlay handles scroll */
const Body     = styled.div`margin-top: .8rem;`;
const Section  = styled.div`margin-top: .8rem;`;
const TitleRow = styled.div`text-align: center;`;
const ManageRow= styled.div`
  margin: .25rem 0 .4rem;
  display: flex;
  justify-content: center;
`;
const Grid = styled.div`
  display: grid;
  gap: .55rem;
  justify-content: center;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  max-width: 600px;
  margin: 0 auto;
`;
const TinyBtn = styled(PixelButton)`
  font-size: .62rem;
  padding: 0 .45rem;
  background: var(--zu-accent-sec);
`;

/* secondary overlay (per-EP forms) */
const FormOverlay = styled(Overlay)`z-index: 1400;`;
const FormModal   = styled.div`
  width: clamp(300px, 94vw, 720px);
  background: var(--zu-bg);
  border: 3px solid var(--zu-fg);
  padding: 1rem;
  box-shadow: 0 0 8px var(--zu-fg);
  overflow-y: auto;
  position: relative;
  max-height: calc(100vh - var(--hdr, 0px) - 2rem);
`;

/*──────── EP meta helpers ───────────────────────────────────────*/
const NORMAL = {
  add_collaborator   : 'collab_edit',
  remove_collaborator: 'collab_edit',
  add_parent         : 'parentchild_edit',
  remove_parent      : 'parentchild_edit',
  add_child          : 'parentchild_edit',
  remove_child       : 'parentchild_edit',
};
const META = {
  collab_edit          : { label:'Add / Remove Collaborator', comp:'AddRemoveCollaborator', group:'Collaborators' },
  manage_collaborators : { label:'Manage Collaborators',      comp:'ManageCollaborators',    group:'Collaborators' },
  parentchild_edit     : { label:'Add / Remove Parent/Child', comp:'AddRemoveParentChild',   group:'Parent / Child' },
  manage_parent_child  : { label:'Manage Parent/Child',       comp:'ManageParentChild',      group:'Parent / Child' },

  transfer             : { label:'Transfer Tokens',          comp:'Transfer',            group:'Token Actions' },
  balance_of           : { label:'Check Balance',            comp:'BalanceOf',           group:'Token Actions' },
  mint                 : { label:'Mint',                     comp:'Mint',                group:'Token Actions' },
  burn                 : { label:'Burn',                     comp:'Burn',                group:'Token Actions' },
  destroy              : { label:'Destroy',                  comp:'Destroy',             group:'Token Actions' },
  update_operators     : { label:'Update Operators',         comp:'UpdateOperators',     group:'Operators' },

  append_artifact_uri  : { label:'Append Artifact URI',      comp:'AppendArtifactUri',   group:'Metadata Ops' },
  append_extrauri      : { label:'Append Extra URI',         comp:'AppendExtraUri',      group:'Metadata Ops' },
  clear_uri            : { label:'Clear URI',                comp:'ClearUri',            group:'Metadata Ops' },
  edit_contract_metadata: { label:'Edit Contract Metadata',  comp:'EditContractMetadata',group:'Metadata Ops' },
  edit_token_metadata  : { label:'Edit Token Metadata',      comp:'EditTokenMetadata',   group:'Metadata Ops' },
};

const resolveEp = (ver='') => {
  const set = new Set(registry.common ?? []);
  let v = ver.toLowerCase();
  while (v && registry[v]) {
    Object.entries(registry[v])
      .filter(([k,val]) => k !== '$extends' && val !== false)
      .forEach(([k]) => set.add(k));
    v = registry[v].$extends;
  }
  set.add('manage_collaborators').add('manage_parent_child');
  return [...set];
};

/*════════ component ═════════════════════════════════════════════*/
export default function AdminTools({ contract, onClose }) {
  const meta      = contract.meta ?? contract;
  const toolkit   = window.tezosToolkit;
  const snackbar  = window.globalSnackbar || (()=>{});

  const [formKey,setFormKey] = useState(null);
  const [counts,setCounts]   = useState({ coll:0,parent:0,child:0 });

  const refreshCounts = useCallback(async () => {
    try {
      const c  = await toolkit?.contract?.at?.(contract.address);
      const st = await c?.storage?.();
      const size = x => Array.isArray(x) ? x.length : typeof x?.forEach === 'function' ? [...x].length : 0;
      setCounts({ coll:size(st?.collaborators), parent:size(st?.parents), child:size(st?.children) });
    } catch {/* ignore */ }
  }, [contract.address, toolkit]);
  useEffect(() => { refreshCounts(); }, [refreshCounts]);

  const grouped = useMemo(() => {
    const raw = resolveEp(contract.version)
      .map(k => NORMAL[k] || k)
      .filter(k => META[k] && EP[META[k].comp]);
    return [...new Set(raw)].reduce((o,k) => {
      (o[META[k].group] ??= []).push(k); return o;
    }, {});
  }, [contract.version]);

  /*──────── render ─────────────────────────────────────────────*/
  return (
    <Fragment>
      {/* primary tools panel */}
      <Overlay>
        <Modal>
          <CloseBtn size="xs" onClick={onClose}>×</CloseBtn>

          <Preview>
            <RenderMedia
              uri={meta.imageUri}
              alt={meta.name}
              style={{
                width: 'clamp(90px,25vw,150px)',
                height: 'clamp(90px,25vw,150px)',
                objectFit: 'contain',
                border: '2px solid var(--zu-fg)',
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
                {contract.version}&nbsp;•&nbsp;{contract.address}
              </p>
            </div>
          </Preview>

          <Body>
            {Object.entries(grouped).map(([title, keys]) => {
              const manageKey =
                title === 'Collaborators' ? 'manage_collaborators'
                : title.startsWith('Parent') ? 'manage_parent_child'
                : null;

              return (
                <Section key={title}>
                  <TitleRow>
                    <PixelHeading level={5} style={{ margin:0 }}>
                      {title}
                      {title === 'Collaborators' && ` (${counts.coll})`}
                      {title.startsWith('Parent') &&
                        ` (P:${counts.parent} | C:${counts.child})`}
                    </PixelHeading>
                  </TitleRow>

                  {manageKey && (
                    <ManageRow>
                      <TinyBtn onClick={() => setFormKey(manageKey)}>MANAGE</TinyBtn>
                    </ManageRow>
                  )}

                  <Grid>
                    {keys.filter(k => !k.startsWith('manage_')).map(k => (
                      <PixelButton
                        key={k}
                        onClick={() => setFormKey(k)}
                      >
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

      {/* per-entry-point form */}
      {formKey && (
        <FormOverlay>
          <FormModal>
            <CloseBtn size="xs" onClick={() => setFormKey(null)}>×</CloseBtn>
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
          </FormModal>
        </FormOverlay>
      )}
    </Fragment>
  );
}

/* What changed & why: re-defined missing FormModal (styled div) and
   kept header offset fix; runtime “FormModal is not defined” resolved. */
/* EOF */
