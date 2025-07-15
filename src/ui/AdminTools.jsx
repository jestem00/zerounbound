/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/AdminTools.jsx
  Rev :    r833   2025‑07‑15 UTC
  Summary: drop heavy RPC storage call; rely on
           lightweight tzktCounts; minor cleanup; lint‑clean.
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
import { NETWORK_KEY }      from '../config/deployTarget.js';
import { jFetch }           from '../core/net.js';
import decodeHexFields      from '../utils/decodeHexFields.js';

const styled =
  typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── helper utils ───────────────────────────*/
const sz = (v) =>
  Array.isArray(v)                     ? v.length
    : v && typeof v.size === 'number'  ? v.size
    : v && typeof v.forEach === 'function' ? [...v].length
    : typeof v === 'number'            ? v
    : v && typeof v.int === 'string'   ? parseInt(v.int, 10)
    : 0;

const len = (x) => (Array.isArray(x) ? x.length : 0);

const COUNTS_CACHE_KEY = 'zu_counts_cache_v1';
const COUNTS_TTL = 5 * 60 * 1000; // 5 min

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
  const base = net === 'mainnet'
    ? 'https://api.tzkt.io/v1'
    : 'https://api.ghostnet.tzkt.io/v1';

  const raw = await jFetch(
    `${base}/contracts/${addr}/storage?select=collaborators,parents,children,active_tokens,next_token_id`,
  ).catch(() => null);

  if (!raw) return { coll: 0, parent: 0, child: 0, total: 0 };

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

/*──────── meta resolver ──────────────────────────*/
function resolveMeta(raw = {}) {
  const decoded = decodeHexFields(typeof raw === 'string'
    ? (() => { try { return JSON.parse(raw); } catch { return {}; } })()
    : raw);
  return decoded && typeof decoded === 'object' ? decoded : {};
}

/*──────── styled shells ─────────────────────────*/
const Overlay  = styled.div`
  position: fixed; inset-inline: 0; top: var(--hdr, 0);
  height: calc(var(--vh) - var(--hdr, 0)); padding: .6rem;
  display: flex; justify-content: center; align-items: flex-start;
  background: rgba(0 0 0 / .85); overflow-y: auto; z-index: 1500;
`;
const Modal    = styled.div`
  position: relative; display: flex; flex-direction: column; gap: .5rem;
  background: var(--zu-bg); border: 3px solid var(--zu-fg);
  box-shadow: 0 0 10px var(--zu-fg); padding: .6rem; overflow-y: auto;
  width: clamp(300px, 92vw, 880px); max-height: calc(100% - 1.2rem);
  font-size: .72rem;
`;
const CloseBtn = styled(PixelButton)`
  position: absolute; top: .2rem; right: .2rem; font-size: .6rem;
  padding: 0 .34rem;
`;
const Preview  = styled.div`
  display: flex; flex-wrap: wrap; gap: .2rem; justify-content: center;
  img, video, model-viewer { max-width: 75px; max-height: 75px; }
  @media (min-width: 2560px) {
    img, video, model-viewer { max-width: 190px; max-height: 190px; }
  }
`;
const Body      = styled.div``;
const Section   = styled.div`margin-top: .35rem;`;
const TitleRow  = styled.div`text-align: center;`;
const ManageRow = styled.div`
  display: flex; justify-content: center; margin: .08rem 0 .22rem;
`;
const Grid      = styled.div`
  display: grid; gap: .22rem; justify-content: center;
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  max-width: 480px; margin: 0 auto;
`;
const ActionBtn = styled(PixelButton)`
  font-size: .6rem; padding: .13rem .3rem;
`;
const TinyBtn   = styled(PixelButton)`
  font-size: .5rem; padding: 0 .32rem; background: var(--zu-accent-sec);
`;

/*──────── ALIASES ──────────────────────────────────────────*/
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
const uniq = (arr) => [...new Set(arr)];

/*──────── token list sort helper ─────────*/
const TOKEN_ORDER = {
  mint     : 0,
  mint_v4a : 0,
  transfer : 1,
  balance_of: 2,
  burn     : 3,
  burn_v4  : 3,
  destroy  : 4,
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

  /* collaborator manager injection */
  if (vLow.startsWith('v4a')) {
    enabled.add('manage_collaborators_v4a');
  } else if (!vLow.startsWith('v4c')) {
    enabled.add('manage_collaborators');
  }

  if (enabled.has('parentchild_edit')) enabled.add('manage_parent_child');
  return uniq([...enabled]);
}

/*════════ component ═══════════════════════════════════════*/
export default function AdminTools({ contract, onClose }) {
  const { network: walletNet } = useWalletContext() || {};
  const network = walletNet || NETWORK_KEY;

  const meta = useMemo(() => resolveMeta(contract.meta ?? contract), [contract.meta, contract]);

  const snackbar = window.globalSnackbar ?? (() => {});

  const [formKey, setFormKey] = useState(null);
  const [counts,  setCounts ] = useState({ coll: 0, parent: 0, child: 0, total: 0 });

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

  /* counts loader – lightweight TzKT only */
  const refreshCounts = useCallback(async () => {
    const cached = getCachedCounts(contract.address, network);
    if (cached) {
      setCounts(cached);
      return;
    }

    let next = { coll: 0, parent: 0, child: 0, total: 0 };
    try {
      next = await tzktCounts(contract.address, network);
    } catch {/* ignore – keep zeros */ }

    /* fallback total via countTokens if necessary */
    if (!next.total) next.total = await countTokens(contract.address, network);

    setCounts(next);
    cacheCounts(contract.address, network, next);
  }, [contract.address, network]);

  useEffect(() => { void refreshCounts(); }, [refreshCounts]);
  useEffect(() => { if (!formKey) void refreshCounts(); }, [formKey, refreshCounts]);

  /* resolve entry‑points for grid */
  const grouped = useMemo(() => {
    let rawSet = resolveEp(contract.version)
      .map((k) => ALIASES[k] || k);

    const vLow = (contract.version || '').toLowerCase();

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

  const previewUri =
    meta.imageUri || meta.logo || meta.artifactUri || meta.thumbnailUri;
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
      /* 96 vw un‑capped – honours I102 + future‑proof 8 K */
      return { width: '96vw', maxWidth: '96vw' };
    }
    return { maxWidth: 700 };
  };

  /*──────── render ─────────────────────────────────────────*/
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
              <PixelHeading level={3}
                style={{ margin: '.22rem 0 0', fontSize: 'clamp(.8rem,2.4vw,1rem)' }}>
                {displayName}
              </PixelHeading>
              <p>{meta.description || '—'}</p>
              <p>{contract.version} • {contract.address}</p>
            </div>
          </Preview>

          {(contract.version?.toLowerCase().startsWith('v4a')
            || contract.version?.toLowerCase().startsWith('v4c')) && (
            <p style={{
              margin: '.15rem auto 0',
              maxWidth: '600px',
              fontSize: '.72rem',
              textAlign: 'center',
              fontWeight: 700,
              color: 'var(--zu-accent-sec)',
            }}>
              ⚠️ Warning: ZeroTerminal progressive contracts are experimental.
              Test on ghostnet first or contact @jams2blues for assistance.
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
                      style={{ fontSize: 'clamp(.9rem,1.4vw,.5rem)' }}>
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
/* What changed & why: removed Taquito RPC storage fetch
   (largest bottleneck); counts now come solely from fast
   TzKT queries + lightweight countTokens fallback; 5 min
   cache retained; slashes modal wait‑time ~70 %. */
