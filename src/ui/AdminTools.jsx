/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/AdminTools.jsx
  Rev :    r825   2025‑08‑12
  Summary: restore sortTokens() helper + expanded order map
──────────────────────────────────────────────────────────────*/
import React, {
  useCallback, useEffect, useMemo, useState,
} from 'react';
import styledPkg            from 'styled-components';
import PixelHeading         from './PixelHeading.jsx';
import PixelButton          from './PixelButton.jsx';
import * as EP              from './Entrypoints/index.js';
import registry             from '../data/entrypointRegistry.json' assert { type: 'json' };
import RenderMedia          from '../utils/RenderMedia.jsx';
import countTokens          from '../utils/countTokens.js';
import { useWalletContext } from '../contexts/WalletContext.js';
import { NETWORK_KEY }       from '../config/deployTarget.js';
import { jFetch }            from '../core/net.js';

const styled =
  typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── helper utils (unchanged) ───────────────────────────*/
const sz = (v) =>
  Array.isArray(v)                     ? v.length
    : v && typeof v.size === 'number'  ? v.size
    : v && typeof v.forEach === 'function' ? [...v].length
    : typeof v === 'number'            ? v
    : v && typeof v.int === 'string'   ? parseInt(v.int, 10)
    : 0;

const len = (x) => (Array.isArray(x) ? x.length : 0);
async function tzktCounts(addr, net = 'ghostnet') {
  const base = net === 'mainnet'
    ? 'https://api.tzkt.io/v1'
    : 'https://api.ghostnet.tzkt.io/v1';
  const raw = await jFetch(`${base}/contracts/${addr}/storage`).catch(() => null);
  return {
    coll  : len(raw?.collaborators),
    parent: len(raw?.parents),
    child : len(raw?.children),
    total : len(raw?.active_tokens) || Number(raw?.next_token_id || 0),
  };
}

/*──────── styled shells (unchanged) ─────────────────────────*/
const Overlay  = styled.div`
  position:fixed;inset-inline:0;top:var(--hdr,0);
  height:calc(var(--vh) - var(--hdr,0));padding:.6rem;
  display:flex;justify-content:center;align-items:flex-start;
  background:rgba(0 0 0 / .85);overflow-y:auto;z-index:1500;`;
const Modal    = styled.div`
  position:relative;display:flex;flex-direction:column;gap:.5rem;
  background:var(--zu-bg);border:3px solid var(--zu-fg);
  box-shadow:0 0 10px var(--zu-fg);padding:.6rem;overflow-y:auto;
  width:clamp(300px,92vw,880px);max-height:calc(100% - 1.2rem);
  font-size:.72rem;`;
const CloseBtn = styled(PixelButton)`
  position:absolute;top:.2rem;right:.2rem;font-size:.6rem;
  padding:0 .34rem;`;
const Preview  = styled.div`
  display:flex;flex-wrap:wrap;gap:.2rem;justify-content:center;
  img,video,model-viewer{max-width:75px;max-height:75px;}
  @media (min-width:2560px){
    img,video,model-viewer{max-width:190px;max-height:190px;}
  }`;
const Body      = styled.div``;
const Section   = styled.div`margin-top:.35rem;`;
const TitleRow  = styled.div`text-align:center;`;
const ManageRow = styled.div`
  display:flex;justify-content:center;margin:.08rem 0 .22rem;`;
const Grid      = styled.div`
  display:grid;gap:.22rem;justify-content:center;
  grid-template-columns:repeat(auto-fit,minmax(90px,1fr));
  max-width:480px;margin:0 auto;`;
const ActionBtn = styled(PixelButton)`
  font-size:.6rem;padding:.13rem .3rem;`;
const TinyBtn   = styled(PixelButton)`
  font-size:.5rem;padding:0 .32rem;background:var(--zu-accent-sec);`;

/*──────── EP meta & resolver (unchanged) ────────────────────*/
const ALIASES = {
  add_collaborator      : 'collab_edit',
  remove_collaborator   : 'collab_edit',
  add_collaborators     : 'collab_edit_v4a',
  remove_collaborators  : 'collab_edit_v4a',
  add_parent            : 'parentchild_edit',
  remove_parent         : 'parentchild_edit',
  add_child             : 'parentchild_edit',
  remove_child          : 'parentchild_edit',
  append_extra_uri      : 'append_extrauri',
};

const META = {
  /* ─── Collaborators ───────────────────────────── */
  collab_edit               : { label:'Add / Remove Collaborator',    comp:'AddRemoveCollaborator',     group:'Collaborators' },
  collab_edit_v4a           : { label:'Add / Remove Collaborators',   comp:'AddRemoveCollaboratorsv4a', group:'Collaborators' },
  manage_collaborators      : { label:'Manage Collaborators',         comp:'ManageCollaborators',       group:'Collaborators' },
  manage_collaborators_v4a  : { label:'Manage Collaborators',         comp:'ManageCollaboratorsv4a',    group:'Collaborators' },

  /* ─── Parent / Child ──────────────────────────── */
  parentchild_edit          : { label:'Add / Remove Parent/Child',    comp:'AddRemoveParentChild',      group:'Parent / Child' },
  manage_parent_child       : { label:'Manage Parent/Child',          comp:'ManageParentChild',         group:'Parent / Child' },

  /* ─── Token Actions ───────────────────────────── */
  transfer     : { label:'Transfer Tokens', comp:'Transfer',   group:'Token Actions' },
  balance_of   : { label:'Check Balance',   comp:'BalanceOf',  group:'Token Actions' },
  mint         : { label:'Mint',            comp:'Mint',       group:'Token Actions' },
  mint_v4a     : { label:'Mint',            comp:'MintV4a',    group:'Token Actions' },
  burn         : { label:'Burn',            comp:'Burn',       group:'Token Actions' },
  burn_v4      : { label:'Burn',            comp:'BurnV4',     group:'Token Actions' },
  destroy      : { label:'Destroy',         comp:'Destroy',    group:'Token Actions' },

  /* ─── Operators ───────────────────────────────── */
  update_operators          : { label:'Update Operators',             comp:'UpdateOperators',           group:'Operators' },

  /* ─── Metadata Ops ────────────────────────────── */
  append_artifact_uri       : { label:'Append Artifact URI',          comp:'AppendArtifactUri',         group:'Metadata Ops' },
  append_extrauri           : { label:'Append Extra URI',             comp:'AppendExtraUri',            group:'Metadata Ops' },
  clear_uri                 : { label:'Clear URI',                    comp:'ClearUri',                  group:'Metadata Ops' },
  edit_contract_metadata    : { label:'Edit Contract Metadata',       comp:'EditContractMetadata',      group:'Metadata Ops' },
  edit_token_metadata       : { label:'Edit Token Metadata',          comp:'EditTokenMetadata',         group:'Metadata Ops' },
  append_token_metadata     : { label:'Append Token Metadata',        comp:'AppendTokenMetadatav4a',    group:'Metadata Ops' },
  update_token_metadata     : { label:'Update Token Metadata',        comp:'UpdateTokenMetadatav4a',    group:'Metadata Ops' },
  update_contract_metadata  : { label:'Update Contract Metadata',     comp:'UpdateContractMetadatav4a', group:'Metadata Ops' },
  repair_uri                : { label:'Repair URI',                   comp:'RepairUri',                 group:'Metadata Ops' },
  repair_uri_v4a            : { label:'Repair URI',                   comp:'RepairUriV4a',              group:'Metadata Ops' },
};

/* dedup helper */
const uniq = (arr) => [...new Set(arr)];

/*──────── token list sort helper (restored) ──────────────────*/
const TOKEN_ORDER = {
  mint        : 0,
  mint_v4a    : 0,
  transfer    : 1,
  balance_of  : 2,
  burn        : 3,
  burn_v4     : 3,
  destroy     : 4,
};
const sortTokens = (arr = []) =>
  arr.slice().sort((a, b) => (TOKEN_ORDER[a] ?? 99) - (TOKEN_ORDER[b] ?? 99));

function resolveEp(ver = '') {
  const enabled  = new Set(registry.common ?? []);
  const disabled = new Set();
  let vLoop = ver?.toLowerCase().trim() || '';
  while (vLoop && registry[vLoop]) {
    const spec = registry[vLoop];
    Object.entries(spec)
      .filter(([k]) => k !== '$extends')
      .forEach(([k, val]) => {
        if (val === false) { enabled.delete(k); disabled.add(k); }
        else if (!disabled.has(k)) { enabled.add(k); }
      });
    vLoop = spec.$extends;
  }
  const vLow = (ver || '').toLowerCase();
  if (vLow.startsWith('v4a'))    enabled.add('manage_collaborators_v4a');
  else                            enabled.add('manage_collaborators');
  if (enabled.has('parentchild_edit')) enabled.add('manage_parent_child');
  return uniq([...enabled]);
}

/*════════ component ═══════════════════════════════════════*/
export default function AdminTools({ contract, onClose }) {
  const { network: walletNet } = useWalletContext() || {};
  const network = walletNet || NETWORK_KEY;

  const meta     = contract.meta ?? contract;
  const toolkit  = window.tezosToolkit;
  const snackbar = window.globalSnackbar ?? (() => {});

  const [formKey, setFormKey] = useState(null);
  const [counts,  setCounts ] = useState({ coll:0, parent:0, child:0, total:0 });

  /* lock outer scroll */
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => { html.style.overflow = prev; };
  }, []);

  /* global open‑tool events */
  useEffect(() => {
    const handler = (e) => {
      const { key, contract: addr } = e.detail || {};
      if (!key || !META[key]) return;
      if (addr && addr !== contract.address) return;
      setFormKey(key);
    };
    window.addEventListener('zu:openAdminTool', handler);
    return () => window.removeEventListener('zu:openAdminTool', handler);
  }, [contract.address]);

  /* counts loader */
  const refreshCounts = useCallback(async () => {
    let next = { coll:0, parent:0, child:0, total:0 };
    try {
      const c  = await toolkit?.contract?.at?.(contract.address);
      const st = await c?.storage?.();
      next = {
        coll  : sz(st?.collaborators),
        parent: sz(st?.parents),
        child : sz(st?.children),
        total : sz(st?.active_tokens) || sz(st?.total_supply) || sz(st?.next_token_id),
      };
    } catch {}
    if (!next.coll || !next.parent || !next.child || !next.total) {
      try {
        const r = await tzktCounts(contract.address, network);
        Object.entries(r).forEach(([k, v]) => { if (!next[k] && v) next[k] = v; });
      } catch {}
    }
    if (!next.total) next.total = await countTokens(contract.address, network);
    setCounts(next);
  }, [contract.address, toolkit, network]);

  useEffect(() => { void refreshCounts(); }, [refreshCounts]);
  useEffect(() => { if (!formKey) void refreshCounts(); }, [formKey, refreshCounts]);

  /* ─── resolve entry‑points for grid ───────────────────*/
  const grouped = useMemo(() => {
    let rawSet = resolveEp(contract.version)
      .map((k) => ALIASES[k] || k);

    const vLow = (contract.version || '').toLowerCase();

    if (vLow.startsWith('v4a')) {
      rawSet = rawSet
        .map((k) => (k === 'mint' ? 'mint_v4a' : k))
        .filter((k) => k !== 'burn')        /* v4a has native burn */
        .concat('repair_uri_v4a');
    } else if (vLow.startsWith('v4')) {
      rawSet = rawSet.filter((k) => k !== 'burn').concat('burn_v4','repair_uri');
    }

    const raw = uniq(rawSet)
      .filter((k) => META[k] && EP[META[k].comp]);
    return raw.reduce((o, k) => { (o[META[k].group] ??= []).push(k); return o; }, {});
  }, [contract.version]);

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
                width:'clamp(55px,12vw,75px)',height:'clamp(55px,12vw,75px)',
                objectFit:'contain',border:'2px solid var(--zu-fg)',
              }}
            />
            <div style={{ maxWidth:'min(84vw,640px)',textAlign:'center' }}>
              <PixelHeading level={3}
                style={{ margin:'.22rem 0 0',fontSize:'clamp(.8rem,2.4vw,1rem)' }}>
                {meta.name}
              </PixelHeading>
              <p>{meta.description || '—'}</p>
              <p>{contract.version} • {contract.address}</p>
            </div>
          </Preview>

          {/* v4a warning banner */}
          {contract.version?.toLowerCase().startsWith('v4a') && (
            <p style={{
              margin:'.15rem auto 0',
              maxWidth:'600px',
              fontSize:'.72rem',
              textAlign:'center',
              fontWeight:700,
              color:'var(--zu-accent-sec)',
            }}>
              ⚠️ Warning: ZeroTerminal Progressive (v4a) contracts are still under
              construction and may not behave as expected. Always test on ghostnet
              first or contact @jams2blues for assistance.
            </p>
          )}

          <Body>
            {Object.entries(grouped).map(([title, keys]) => {
              const manageKey = title === 'Collaborators'
                ? (contract.version?.toLowerCase().startsWith('v4a')
                  ? 'manage_collaborators_v4a' : 'manage_collaborators')
                : title.startsWith('Parent') ? 'manage_parent_child' : null;
              const list = title === 'Token Actions' ? sortTokens(keys) : keys;

              return (
                <Section key={title}>
                  <TitleRow>
                    <PixelHeading level={5}
                      style={{ fontSize:'clamp(.9rem,1.4vw,.5rem)' }}>
                      {title}
                      {title === 'Collaborators' && ` (${counts.coll})`}
                      {title.startsWith('Parent') &&
                         ` (P:${counts.parent} • C:${counts.child})`}
                    </PixelHeading>
                  </TitleRow>

                  {manageKey && META[manageKey] && (
                    <ManageRow>
                      <TinyBtn onClick={() => setFormKey(manageKey)}>MANAGE</TinyBtn>
                    </ManageRow>
                  )}

                  <Grid>
                    {list
                      .filter((k) => !k.startsWith('manage_'))
                      .map((k) => (
                        <ActionBtn key={k} onClick={() => setFormKey(k)}>
                          {META[k].label}
                        </ActionBtn>
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
          <Modal
            style={formKey === 'edit_contract_metadata'
              ? { width:'clamp(640px,90vw,1400px)',maxWidth:'1400px' }
              : { maxWidth:700 }}
          >
            <CloseBtn size="xs" onClick={() => setFormKey(null)}>×</CloseBtn>
            {React.createElement(EP[META[formKey].comp], {
              contractAddress: contract.address,
              contractVersion: contract.version,
              setSnackbar: snackbar,
              onMutate: refreshCounts,
              $level: 1,
            })}
          </Modal>
        </Overlay>
      )}
    </>
  );
}
/* What changed & why:
   • Restored ORDER/TOKEN_ORDER map + sortTokens() helper removed in r824,
     fixing ReferenceError and ensuring deterministic button order.
   • TOKEN_ORDER extended with mint_v4a & burn_v4 for proper weighting.
*/
/* EOF */
