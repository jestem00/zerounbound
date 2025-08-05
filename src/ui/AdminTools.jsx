/*─────────────────────────────────────────────────────────────
      Developed by @jams2blues – ZeroContract Studio
      File:    src/ui/AdminTools.jsx
      Rev :    r833-a4   2025‑08‑04
      Summary: fix counts for v4e by counting object sets in TzKT
──────────────────────────────────────────────────────────────*/

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styledPkg from 'styled-components';
import PixelHeading from './PixelHeading.jsx';
import PixelButton from './PixelButton.jsx';
import * as EP from './Entrypoints/index.js';
import registry from '../data/entrypointRegistry.json' assert { type: 'json' };
import RenderMedia from '../utils/RenderMedia.jsx';
import countTokens from '../utils/countTokens.js';
import { useWalletContext } from '../contexts/WalletContext.js';
import { NETWORK_KEY } from '../config/deployTarget.js';
import { jFetch } from '../core/net.js';
import decodeHexFields from '../utils/decodeHexFields.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── helper utils ───────────────────────────*/
const COUNTS_CACHE_KEY = 'zu_counts_cache_v1';
const COUNTS_TTL = 5 * 60 * 1000;

const getCachedCounts = (addr, net) => {
  try {
    const all = JSON.parse(localStorage.getItem(COUNTS_CACHE_KEY) || '{}');
    const key = `${net}_${addr}`;
    const hit = all[key];
    if (hit && Date.now() - hit.ts < COUNTS_TTL) return hit.counts;
  } catch {}
  return null;
};

const cacheCounts = (addr, net, counts) => {
  try {
    const all = JSON.parse(localStorage.getItem(COUNTS_CACHE_KEY) || '{}');
    const key = `${net}_${addr}`;
    all[key] = { counts, ts: Date.now() };
    localStorage.setItem(COUNTS_CACHE_KEY, JSON.stringify(all));
  } catch {}
};

async function tzktCounts(addr, net = 'ghostnet') {
  const base = net === 'mainnet' ? 'https://api.tzkt.io/v1' : 'https://api.ghostnet.tzkt.io/v1';
  const raw = await jFetch(
    `${base}/contracts/${addr}/storage?select=collaborators,parents,children,active_tokens,next_token_id`,
  ).catch(() => null);
  if (!raw) return { coll: 0, parent: 0, child: 0, total: 0 };
  const countEntries = async (field) => {
    // Array-based set
    if (Array.isArray(field)) return field.length;
    // Object-based set (map of indices to addresses)
    if (field && typeof field === 'object') return Object.keys(field).length;
    // Bigmap id
    if (Number.isInteger(field)) {
      const bm = await jFetch(`${base}/bigmaps/${field}?select=totalKeys`).catch(() => null);
      return bm?.totalKeys ?? 0;
    }
    return 0;
  };
  const [coll, parent, child, active] = await Promise.all([
    countEntries(raw.collaborators),
    countEntries(raw.parents),
    countEntries(raw.children),
    countEntries(raw.active_tokens),
  ]);
  return { coll, parent, child, total: active || Number(raw.next_token_id || 0) };
}

function resolveMeta(raw = {}) {
  const decoded = decodeHexFields(
    typeof raw === 'string'
      ? (() => {
          try { return JSON.parse(raw); } catch { return {}; }
        })()
      : raw,
  );
  return decoded && typeof decoded === 'object' ? decoded : {};
}

/*──────── styled shells ─────────────────────────────────────*/
const Overlay = styled.div`
  position: fixed; inset-inline: 0; top: var(--hdr, 0);
  height: calc(var(--vh) - var(--hdr, 0));
  padding: .6rem;
  display: flex; justify-content: center; align-items: flex-start;
  background: rgba(0 0 0 / .85);
  overflow-y: auto; z-index: 1500;
`;
const Modal = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: .5rem;
  background: var(--zu-bg);
  border: 3px solid var(--zu-fg);
  box-shadow: 0 0 10px var(--zu-fg);
  padding: .6rem;
  overflow-y: auto;
  width: clamp(300px, 92vw, 880px);
  max-height: calc(100% - 1.2rem);
  font-size: .72rem;
`;
const CloseBtn = styled(PixelButton)`
  position: absolute;
  top: .2rem;
  right: .2rem;
  font-size: .6rem;
  padding: 0 .34rem;
`;
const Preview = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: .2rem;
  justify-content: center;
  img, video, model-viewer { max-width: 75px; max-height: 75px; }
  @media (min-width: 2560px) {
    img, video, model-viewer { max-width: 190px; max-height: 190px; }
  }
`;
const Body = styled.div``;
const Section = styled.div`margin-top: .35rem;`;
const TitleRow = styled.div`text-align: center;`;
const ManageRow = styled.div`
  display: flex;
  justify-content: center;
  margin: .08rem 0 .22rem;
`;
const Grid = styled.div`
  display: grid;
  gap: .22rem;
  justify-content: center;
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  max-width: 480px;
  margin: 0 auto;
`;
const ActionBtn = styled(PixelButton)`
  font-size: .6rem;
  padding: .13rem .3rem;
`;
const TinyBtn = styled(PixelButton)`
  font-size: .5rem;
  padding: 0 .32rem;
  background: var(--zu-accent-sec);
`;

/*──────── aliases and meta ─────────────────────────────*/
const ALIASES = {
  add_collaborator     : 'collab_edit',
  remove_collaborator  : 'collab_edit',
  add_collaborators    : 'collab_edit_v4a',
  remove_collaborators : 'collab_edit_v4a',
  add_parent           : 'parentchild_edit',
  remove_parent        : 'parentchild_edit',
  add_child            : 'parentchild_edit',
  remove_child         : 'parentchild_edit',
  append_extra_uri     : 'append_extrauri',
};

const META = {
  collab_edit              : { label: 'Add / Remove Collaborator',    comp: 'AddRemoveCollaborator',     group: 'Collaborators' },
  collab_edit_v4a          : { label: 'Add / Remove Collaborators',   comp: 'AddRemoveCollaboratorsv4a', group: 'Collaborators' },
  manage_collaborators     : { label: 'Manage Collaborators',         comp: 'ManageCollaborators',       group: 'Collaborators' },
  manage_collaborators_v4a : { label: 'Manage Collaborators',         comp: 'ManageCollaboratorsv4a',    group: 'Collaborators' },
  parentchild_edit         : { label: 'Add / Remove Parent/Child',    comp: 'AddRemoveParentChild',      group: 'Parent / Child' },
  manage_parent_child      : { label: 'Manage Parent/Child',          comp: 'ManageParentChild',         group: 'Parent / Child' },
  transfer   : { label: 'Transfer Tokens', comp: 'Transfer',   group: 'Token Actions' },
  balance_of : { label: 'Check Balance',   comp: 'BalanceOf',  group: 'Token Actions' },
  mint       : { label: 'Mint',            comp: 'Mint',       group: 'Token Actions' },
  mint_v4a   : { label: 'Mint',            comp: 'MintV4a',    group: 'Token Actions' },
  burn       : { label: 'Burn',            comp: 'Burn',       group: 'Token Actions' },
  burn_v4    : { label: 'Burn',            comp: 'BurnV4',     group: 'Token Actions' },
  destroy    : { label: 'Destroy',         comp: 'Destroy',    group: 'Token Actions' },
  update_operators         : { label: 'Update Operators',             comp: 'UpdateOperators',           group: 'Operators' },
  append_artifact_uri      : { label: 'Append Artifact URI',          comp: 'AppendArtifactUri',         group: 'Metadata Ops' },
  append_extrauri          : { label: 'Append Extra URI',             comp: 'AppendExtraUri',            group: 'Metadata Ops' },
  clear_uri                : { label: 'Clear URI',                    comp: 'ClearUri',                  group: 'Metadata Ops' },
  edit_contract_metadata   : { label: 'Edit Contract Metadata',       comp: 'EditContractMetadata',      group: 'Metadata Ops' },
  edit_token_metadata      : { label: 'Edit Token Metadata',          comp: 'EditTokenMetadata',         group: 'Metadata Ops' },
  update_token_metadata    : { label: 'Update Token Metadata',        comp: 'UpdateTokenMetadatav4a',    group: 'Metadata Ops' },
  update_contract_metadata : { label: 'Update Contract Metadata',     comp: 'UpdateContractMetadatav4a', group: 'Metadata Ops' },
  repair_uri               : { label: 'Repair URI',                   comp: 'RepairUri',                 group: 'Metadata Ops' },
  repair_uri_v4a           : { label: 'Repair URI',                   comp: 'RepairUriV4a',              group: 'Metadata Ops' },
};

const uniq = (arr) => [...new Set(arr)];
const TOKEN_ORDER = { mint: 0, mint_v4a: 0, transfer: 1, balance_of: 2, burn: 3, burn_v4: 3, destroy: 4 };
const sortTokens = (arr = []) => arr.slice().sort((a, b) => (TOKEN_ORDER[a] ?? 99) - (TOKEN_ORDER[b] ?? 99));

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
  const hasCollabEp = enabled.has('add_collaborator') || enabled.has('add_collaborators');
  if (hasCollabEp) {
    if (enabled.has('add_collaborators')) {
      enabled.add('manage_collaborators_v4a');
    } else {
      enabled.add('manage_collaborators');
    }
  }
  if (enabled.has('parentchild_edit')) enabled.add('manage_parent_child');
  return uniq([...enabled]);
}

/*════════ component ═══════════════════════════════════════*/
export default function AdminTools({ contract, onClose }) {
  const { network: walletNet, toolkit: ctxToolkit } = useWalletContext() || {};
  const network = walletNet || NETWORK_KEY;
  const kit = ctxToolkit || (typeof window !== 'undefined' ? window.tezosToolkit : null);
  const meta = useMemo(() => resolveMeta(contract.meta ?? contract), [contract.meta, contract]);
  const snackbar = window.globalSnackbar ?? (() => {});
  const [formKey, setFormKey] = useState(null);
  const [counts, setCounts] = useState({ coll: 0, parent: 0, child: 0, total: 0 });
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => { html.style.overflow = prev; };
  }, []);
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
  const refreshCounts = useCallback(async () => {
    const cached = getCachedCounts(contract.address, network);
    if (cached) { setCounts(cached); return; }
    let next = { coll: 0, parent: 0, child: 0, total: 0 };
    try { next = await tzktCounts(contract.address, network); } catch {}
    if (next.coll === 0 && next.parent === 0 && next.child === 0 && kit) {
      try {
        const c = await kit.contract.at(contract.address);
        const st = await c.storage();
        const countLen = async (src) => {
          if (Array.isArray(src)) return src.length;
          if (src && typeof src.forEach === 'function') {
            let n = 0; src.forEach(() => { n++; }); return n;
          }
          if (src != null) {
            const id = typeof src === 'number'
              ? src
              : (typeof src === 'object' && Number.isInteger(src.id) ? src.id : null);
            if (id != null) {
              const base = network === 'mainnet' ? 'https://api.tzkt.io/v1' : 'https://api.ghostnet.tzkt.io/v1';
              const bm = await jFetch(`${base}/bigmaps/${id}?select=totalKeys`).catch(() => null);
              return bm?.totalKeys ?? 0;
            }
          }
          return 0;
        };
        const coll   = await countLen(st.collaborators);
        const parent = await countLen(st.parents);
        const child  = await countLen(st.children);
        next = { ...next, coll, parent, child };
      } catch {}
    }
    if (!next.total) next.total = await countTokens(contract.address, network);
    setCounts(next);
    cacheCounts(contract.address, network, next);
  }, [contract.address, network, kit]);
  useEffect(() => { void refreshCounts(); }, [refreshCounts]);
  useEffect(() => { if (!formKey) void refreshCounts(); }, [formKey, refreshCounts]);
  const grouped = useMemo(() => {
    let rawSet = resolveEp(contract.version).map((k) => ALIASES[k] || k);
    const vLow = (contract.version || '').toLowerCase();
    if (vLow.startsWith('v4a')) {
      rawSet = rawSet.map((k) => (k === 'mint' ? 'mint_v4a' : k)).filter((k) => k !== 'burn').concat('repair_uri_v4a');
    } else if (vLow.startsWith('v4c')) {
      rawSet = rawSet.map((k) => (k === 'mint' ? 'mint_v4a' : k)).concat('repair_uri_v4a');
    } else if (vLow.startsWith('v4')) {
      rawSet = rawSet.filter((k) => k !== 'burn').concat('burn_v4', 'repair_uri');
    }
    const raw = uniq(rawSet).filter((k) => META[k] && EP[META[k].comp]);
    return raw.reduce((o, k) => { (o[META[k].group] ??= []).push(k); return o; }, {});
  }, [contract.version]);
  const previewUri = meta.imageUri || meta.logo || meta.artifactUri || meta.thumbnailUri;
  const displayName = meta.name || meta.symbol || contract.address;
  const modalStyleFor = (key) => {
    if (key === 'edit_contract_metadata') {
      return { width: 'clamp(640px,90vw,1400px)', maxWidth: '1400px' };
    }
    if (key === 'repair_uri' || key === 'repair_uri_v4a' || key === 'append_artifact_uri' || key === 'append_extrauri' || key === 'burn' || key === 'burn_v4') {
      return { width: '96vw', maxWidth: '96vw' };
    }
    return { maxWidth: 700 };
  };
  return (
    <>
      <Overlay>
        <Modal>
          <CloseBtn size="xs" onClick={onClose}>×</CloseBtn>
          <Preview>
            {previewUri && (
              <RenderMedia
                uri={previewUri}
                alt={displayName}
                style={{
                  width: 'clamp(55px,12vw,75px)',
                  height: 'clamp(55px,12vw,75px)',
                  objectFit: 'contain',
                  border: '2px solid var(--zu-fg)',
                }}
              />
            )}
            <div style={{ maxWidth: 'min(84vw,640px)', textAlign: 'center' }}>
              <PixelHeading level={3} style={{ margin: '.22rem 0', fontSize: 'clamp(.8rem,2.4vw,1rem)' }}>
                {displayName}
              </PixelHeading>
              <p>{meta.description || '—'}</p>
              <p>{contract.version} • {contract.address}</p>
            </div>
          </Preview>
          {(contract.version?.toLowerCase().startsWith('v4a') || contract.version?.toLowerCase().startsWith('v4c')) && (
            <p
              style={{
                margin: '.15rem auto 0',
                maxWidth: '600px',
                fontSize: '.72rem',
                textAlign: 'center',
                fontWeight: 700,
                color: 'var(--zu-accent-sec)',
              }}
            >
              ⚠️ Warning: ZeroTerminal progressive contracts are experimental.
              Test on ghostnet first or contact @jams2blues for assistance.
            </p>
          )}
          <Body>
            {Object.entries(grouped).map(([title, keys]) => {
              const manageKey = title === 'Collaborators'
                ? (contract.version?.toLowerCase().startsWith('v4a')
                  ? 'manage_collaborators_v4a'
                  : 'manage_collaborators')
                : title.startsWith('Parent')
                ? 'manage_parent_child'
                : null;
              const list = title === 'Token Actions' ? sortTokens(keys) : keys;
              return (
                <Section key={title}>
                  <TitleRow>
                    <PixelHeading level={5} style={{ fontSize: 'clamp(.9rem,1.4vw,.5rem)' }}>
                      {title}
                      {title === 'Collaborators' && ` (${counts.coll})`}
                      {title.startsWith('Parent') && ` (P:${counts.parent} • C:${counts.child})`}
                    </PixelHeading>
                    {manageKey && META[manageKey] && (
                      <ManageRow>
                        <TinyBtn onClick={() => setFormKey(manageKey)}>MANAGE</TinyBtn>
                      </ManageRow>
                    )}
                  </TitleRow>
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
          <Modal style={modalStyleFor(formKey)}>
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

/* What changed & why: Added object-key counting to tzktCounts for v4e */