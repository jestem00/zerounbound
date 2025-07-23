/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/AdminTools.jsx
  Rev :    r833-a1   2025‑07‑23 UTC
  Summary: restore collaborator and parent/child counts fallback.
           Reintroduced on‑chain storage lookup via TezosToolkit
           when TzKT returns zero counts; minor cleanup and
           optimisations; lint‑clean.
─────────────────────────────────────────────────────────────*/

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
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

// styled-components factory helper; styledPkg.default on latest
const styled =
  typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── helper utils ───────────────────────────*/

// cache key for collaborator/parent/child counts
const COUNTS_CACHE_KEY = 'zu_counts_cache_v1';
// TTL in milliseconds (5 minutes)
const COUNTS_TTL = 5 * 60 * 1000;

/**
 * Retrieve cached counts from localStorage.
 * Returns null if not found or expired.
 *
 * @param {string} addr   Contract address
 * @param {string} net    Network key (mainnet|ghostnet)
 */
const getCachedCounts = (addr, net) => {
  try {
    const all = JSON.parse(localStorage.getItem(COUNTS_CACHE_KEY) || '{}');
    const key = `${net}_${addr}`;
    const hit = all[key];
    if (hit && Date.now() - hit.ts < COUNTS_TTL) return hit.counts;
  } catch {
    // ignore JSON parse errors or missing storage
  }
  return null;
};

/**
 * Persist counts to localStorage with timestamp.
 *
 * @param {string} addr   Contract address
 * @param {string} net    Network key
 * @param {object} counts Counts object { coll,parent,child,total }
 */
const cacheCounts = (addr, net, counts) => {
  try {
    const all = JSON.parse(localStorage.getItem(COUNTS_CACHE_KEY) || '{}');
    const key = `${net}_${addr}`;
    all[key] = { counts, ts: Date.now() };
    localStorage.setItem(COUNTS_CACHE_KEY, JSON.stringify(all));
  } catch {
    // ignore storage quota and JSON errors
  }
};

/**
 * Fetch collaborator, parent, child and total token counts via TzKT.
 * Falls back to zero counts on network errors. Note that TzKT caches
 * results; counts may lag behind chain state but are inexpensive.
 *
 * @param {string} addr   Contract address
 * @param {string} net    Network key
 * @returns {Promise<{coll:number,parent:number,child:number,total:number}>}
 */
async function tzktCounts(addr, net = 'ghostnet') {
  const base = net === 'mainnet'
    ? 'https://api.tzkt.io/v1'
    : 'https://api.ghostnet.tzkt.io/v1';
  // fetch selected storage fields
  const raw = await jFetch(
    `${base}/contracts/${addr}/storage?select=collaborators,parents,children,active_tokens,next_token_id`,
  ).catch(() => null);
  if (!raw) return { coll: 0, parent: 0, child: 0, total: 0 };
  // helper to fetch bigmap key counts
  const fetchCount = async (bmId) => {
    if (!Number.isInteger(bmId)) return 0;
    const bm = await jFetch(
      `${base}/bigmaps/${bmId}?select=totalKeys`,
    ).catch(() => null);
    return bm?.totalKeys ?? 0;
  };
  const [coll, parent, child, active] = await Promise.all([
    fetchCount(raw.collaborators),
    fetchCount(raw.parents),
    fetchCount(raw.children),
    fetchCount(raw.active_tokens),
  ]);
  return {
    coll,
    parent,
    child,
    total: active || Number(raw.next_token_id || 0),
  };
}

/**
 * Deeply decode hex‑encoded JSON from contract meta storage.
 * Accepts string or object; returns a plain object or empty object.
 *
 * @param {any} raw Raw metadata (string or object)
 */
function resolveMeta(raw = {}) {
  const decoded = decodeHexFields(typeof raw === 'string'
    ? (() => {
        try { return JSON.parse(raw); } catch { return {}; }
      })()
    : raw);
  return decoded && typeof decoded === 'object' ? decoded : {};
}

/*──────── styled shells ─────────────────────────────────────*/
// Outer overlay covering the viewport below the header
const Overlay = styled.div`
  position: fixed; inset-inline: 0; top: var(--hdr, 0);
  height: calc(var(--vh) - var(--hdr, 0));
  padding: .6rem;
  display: flex; justify-content: center; align-items: flex-start;
  background: rgba(0 0 0 / .85);
  overflow-y: auto; z-index: 1500;
`;
// Modal container for each tool
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
// Close button for modals
const CloseBtn = styled(PixelButton)`
  position: absolute;
  top: .2rem;
  right: .2rem;
  font-size: .6rem;
  padding: 0 .34rem;
`;
// Preview container for contract preview (image/video)
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
// Body wrapper for lists and actions
const Body = styled.div``;
// Section wrapper per entry‑point group
const Section = styled.div`margin-top: .35rem;`;
// Title row for group header and manage button
const TitleRow = styled.div`text-align: center;`;
// Manage button row for groups
const ManageRow = styled.div`
  display: flex;
  justify-content: center;
  margin: .08rem 0 .22rem;
`;
// Grid for entry‑point buttons
const Grid = styled.div`
  display: grid;
  gap: .22rem;
  justify-content: center;
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  max-width: 480px;
  margin: 0 auto;
`;
// Primary action button
const ActionBtn = styled(PixelButton)`
  font-size: .6rem;
  padding: .13rem .3rem;
`;
// Tiny manage button (secondary)
const TinyBtn = styled(PixelButton)`
  font-size: .5rem;
  padding: 0 .32rem;
  background: var(--zu-accent-sec);
`;

/*──────── ALIASES ──────────────────────────────────────────*/
// Map contract entrypoint names to internal action keys
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

/*──────── META ─────────────────────────────────────────────*/
// Defines label, component and group for each admin action
const META = {
  /* Collaborators */
  collab_edit              : { label: 'Add / Remove Collaborator',    comp: 'AddRemoveCollaborator',     group: 'Collaborators' },
  collab_edit_v4a          : { label: 'Add / Remove Collaborators',   comp: 'AddRemoveCollaboratorsv4a', group: 'Collaborators' },
  manage_collaborators     : { label: 'Manage Collaborators',         comp: 'ManageCollaborators',       group: 'Collaborators' },
  manage_collaborators_v4a : { label: 'Manage Collaborators',         comp: 'ManageCollaboratorsv4a',    group: 'Collaborators' },

  /* Parent / Child */
  parentchild_edit         : { label: 'Add / Remove Parent/Child',    comp: 'AddRemoveParentChild',      group: 'Parent / Child' },
  manage_parent_child      : { label: 'Manage Parent/Child',          comp: 'ManageParentChild',         group: 'Parent / Child' },

  /* Token Actions */
  transfer   : { label: 'Transfer Tokens', comp: 'Transfer',   group: 'Token Actions' },
  balance_of : { label: 'Check Balance',   comp: 'BalanceOf',  group: 'Token Actions' },
  mint       : { label: 'Mint',            comp: 'Mint',       group: 'Token Actions' },
  mint_v4a   : { label: 'Mint',            comp: 'MintV4a',    group: 'Token Actions' },
  burn       : { label: 'Burn',            comp: 'Burn',       group: 'Token Actions' },
  burn_v4    : { label: 'Burn',            comp: 'BurnV4',     group: 'Token Actions' },
  destroy    : { label: 'Destroy',         comp: 'Destroy',    group: 'Token Actions' },

  /* Operators */
  update_operators         : { label: 'Update Operators',             comp: 'UpdateOperators',           group: 'Operators' },

  /* Metadata Ops */
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

/*──── util helpers ────*/
// return unique items from array
const uniq = (arr) => [...new Set(arr)];

/*──────── token list sort helper ─────────*/
const TOKEN_ORDER = {
  mint      : 0,
  mint_v4a  : 0,
  transfer  : 1,
  balance_of: 2,
  burn      : 3,
  burn_v4   : 3,
  destroy   : 4,
};
const sortTokens = (arr = []) =>
  arr.slice().sort((a, b) => (TOKEN_ORDER[a] ?? 99) - (TOKEN_ORDER[b] ?? 99));

/**
 * Resolve the list of enabled entry‑points for a given contract version.
 * Walks the version registry (including extends) and applies disables.
 * Injects collaborator/parent-child manager actions based on version.
 *
 * @param {string} ver Contract version (e.g. v4a, v4c, etc.)
 * @returns {string[]} List of entry‑point keys
 */
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
  // explicit injection: always show collaborators manager
  if (vLow.startsWith('v4a')) {
    enabled.add('manage_collaborators_v4a');
  } else if (!vLow.startsWith('v4c')) {
    enabled.add('manage_collaborators');
  }
  // parent-child manage only if parentchild_edit exists
  if (enabled.has('parentchild_edit')) enabled.add('manage_parent_child');
  return uniq([...enabled]);
}

/*════════ component ═══════════════════════════════════════*/
export default function AdminTools({ contract, onClose }) {
  // destructure network and toolkit from wallet context
  const { network: walletNet, toolkit: ctxToolkit } = useWalletContext() || {};
  const network = walletNet || NETWORK_KEY;
  // fallback to global tezosToolkit if provided
  const kit = ctxToolkit || (typeof window !== 'undefined' ? window.tezosToolkit : null);

  // memoise decoded metadata
  const meta = useMemo(() => resolveMeta(contract.meta ?? contract), [contract.meta, contract]);

  // snackbar dispatch (global)
  const snackbar = window.globalSnackbar ?? (() => {});

  // currently open form key (null if none)
  const [formKey, setFormKey] = useState(null);
  // collaborator/parent/child counts
  const [counts, setCounts] = useState({ coll: 0, parent: 0, child: 0, total: 0 });

  /* lock outer scroll */
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => { html.style.overflow = prev; };
  }, []);

  /* open-tool events */
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

  /* counts loader – caches TzKT and falls back to on‑chain storage */
  const refreshCounts = useCallback(async () => {
    // check cache first
    const cached = getCachedCounts(contract.address, network);
    if (cached) {
      setCounts(cached);
      return;
    }
    // default counts
    let next = { coll: 0, parent: 0, child: 0, total: 0 };
    try {
      next = await tzktCounts(contract.address, network);
    } catch {
      // ignore errors; keep zeros
    }
    // if TzKT returned zeros for coll/parent/child and toolkit is available,
    // compute counts directly from on‑chain storage. This handles brand new
    // contracts that TzKT hasn't indexed yet.
    if (next.coll === 0 && next.parent === 0 && next.child === 0 && kit) {
      try {
        const c = await kit.contract.at(contract.address);
        const st = await c.storage();
        // helper counts length of bigmap or array or map
        const countLen = async (src) => {
          if (Array.isArray(src)) return src.length;
          if (src && typeof src.forEach === 'function') {
            let n = 0;
            src.forEach(() => { n++; });
            return n;
          }
          if (src != null) {
            const id = typeof src === 'number'
              ? src
              : (typeof src === 'object' && Number.isInteger(src.id) ? src.id : null);
            if (id != null) {
              const base = network === 'mainnet'
                ? 'https://api.tzkt.io/v1'
                : 'https://api.ghostnet.tzkt.io/v1';
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
      } catch {
        // ignore on‑chain errors; fallback remains zeros
      }
    }
    // fallback total via countTokens if necessary
    if (!next.total) next.total = await countTokens(contract.address, network);
    // update state and cache
    setCounts(next);
    cacheCounts(contract.address, network, next);
  }, [contract.address, network, kit]);

  // initial and subsequent refreshes
  useEffect(() => { void refreshCounts(); }, [refreshCounts]);
  useEffect(() => { if (!formKey) void refreshCounts(); }, [formKey, refreshCounts]);

  /* resolve entry‑points for grid */
  const grouped = useMemo(() => {
    let rawSet = resolveEp(contract.version)
      .map((k) => ALIASES[k] || k);
    const vLow = (contract.version || '').toLowerCase();
    // adjust v4a/v4c/v4 logic: replace mint with mint_v4a and manage burn calls
    if (vLow.startsWith('v4a')) {
      rawSet = rawSet
        .map((k) => (k === 'mint' ? 'mint_v4a' : k))
        .filter((k) => k !== 'burn')
        .concat('repair_uri_v4a');
    } else if (vLow.startsWith('v4c')) {
      rawSet = rawSet
        .map((k) => (k === 'mint' ? 'mint_v4a' : k))
        .concat('repair_uri_v4a');
    } else if (vLow.startsWith('v4')) {
      rawSet = rawSet.filter((k) => k !== 'burn').concat('burn_v4', 'repair_uri');
    }
    const raw = uniq(rawSet)
      .filter((k) => META[k] && EP[META[k].comp]);
    return raw.reduce((o, k) => { (o[META[k].group] ??= []).push(k); return o; }, {});
  }, [contract.version]);

  // determine preview URI and display name
  const previewUri = meta.imageUri || meta.logo || meta.artifactUri || meta.thumbnailUri;
  const displayName = meta.name || meta.symbol || contract.address;

  /*──────── modal width helper ────────*/
  const modalStyleFor = (key) => {
    if (key === 'edit_contract_metadata') {
      return { width: 'clamp(640px,90vw,1400px)', maxWidth: '1400px' };
    }
    if (
      key === 'repair_uri'     || key === 'repair_uri_v4a' ||
      key === 'append_artifact_uri' || key === 'append_extrauri' ||
      key === 'burn'           || key === 'burn_v4'
    ) {
      // 96 vw un‑capped – honours I102 + future‑proof 8 K
      return { width: '96vw', maxWidth: '96vw' };
    }
    return { maxWidth: 700 };
  };

  /*──────── render ─────────────────────────────────────────*/
  return (
    <>
      <Overlay>
        <Modal>
          {/* top‑level close for overlay */}
          <CloseBtn size="xs" onClick={onClose}>×</CloseBtn>
          {/* preview of contract */}
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
          {/* progressive contract warning for v4a/v4c */}
          {(contract.version?.toLowerCase().startsWith('v4a') ||
            contract.version?.toLowerCase().startsWith('v4c')) && (
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
          {/* groups of actions */}
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
      {/* dynamic overlay for entry‑point forms */}
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

/* What changed & why:
   • Reintroduced on‑chain storage fallback for collaborator,
     parent and child counts using TezosToolkit when TzKT
     provides zero counts. This resolves counts display
     issues in AdminTools on new contracts or when TzKT is
     stale.
   • Destructured toolkit from WalletContext and used
     window.tezosToolkit as fallback for kit.
   • Updated revision and summary lines accordingly.
*/
/* EOF */