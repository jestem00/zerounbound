/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/EditTokenMetadata.jsx
  Rev :    r946  2025‑08‑21 UTC
  Summary: Diff‑aware edit: size‑check on deltas only; media
           keys optional (soft). Per‑row “unchanged” hints.
──────────────────────────────────────────────────────────────*/
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import styledPkg, { createGlobalStyle } from 'styled-components';
import { MichelsonMap } from '@taquito/michelson-encoder';
import { char2Bytes } from '@taquito/utils';
import { OpKind } from '@taquito/taquito';
import { Buffer } from 'buffer';

import PixelHeading from '../PixelHeading.jsx';
import PixelInput from '../PixelInput.jsx';
import PixelButton from '../PixelButton.jsx';
import LoadingSpinner from '../LoadingSpinner.jsx';
import TokenMetaPanel from '../TokenMetaPanel.jsx';
import OperationConfirmDialog from '../OperationConfirmDialog.jsx';
import OperationOverlay from '../OperationOverlay.jsx';
import MintUpload from './MintUpload.jsx';

import listLiveTokenIds from '../../utils/listLiveTokenIds.js';
import useTxEstimate from '../../hooks/useTxEstimate.js';
import { useWalletContext } from '../../contexts/WalletContext.js';
import { jFetch } from '../../core/net.js';

import {
  validateEditTokenFields,
  validAttributes,
  MAX_ATTR, MAX_ATTR_N, MAX_ATTR_V, MAX_TAGS,
} from '../../core/validator.js';

/* styled-components factory import invariant (I23) */
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── Global layout nudge (keep route-scoped) ───────────*/
const Break700 = createGlobalStyle`
  [data-zu-entry="edit-token"] div[style*="max-width: 700px"]{
    max-width:100%!important;width:100%!important;
  }
`;

/*──────── Layout shells ─────────────────────────────────────*/
const GridWrap = styled.div`
  display:grid;grid-template-columns:repeat(12,1fr);
  gap:1.6rem;width:100%;overflow-x:hidden;
  @media(min-width:1800px){gap:1.2rem;}
  @media(max-width:1100px){grid-template-columns:1fr;}
`;
const FormGrid = styled.div`
  display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));
  gap:1.1rem;
  @media(min-width:1800px){
    grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;
  }
`;
const FieldWrap = styled.div`
  display:flex;flex-direction:column;gap:.45rem;
  textarea{min-height:6rem;}
`;
const PickerWrap = styled.div`display:flex;gap:.6rem;`;
const Box = styled.div`position:relative;flex:1;`;
const Spin = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;
`;
const Err = styled.span`font-size:.8rem;color:var(--zu-accent-sec);`;
const Warn = styled.span`font-size:.78rem;color:var(--zu-accent);`;
const HelpBox = styled.p`font-size:.75rem;line-height:1.25;margin:.5rem 0 .9rem;`;
const Row = styled.div`
  display:grid;grid-template-columns:1fr 1fr auto;
  gap:.6rem;align-items:center;
`;
const RoyalRow = styled(Row)`margin-bottom:.4rem;`;
const RoyHeading = styled(PixelHeading).attrs({ level:5 })`
  white-space:normal;line-height:1.25;font-size:1rem;
  @media(max-width:500px){font-size:.9rem;}
`;

/*──────── Tags UI ───────────────────────────────────────────*/
const TagsWrap = styled.div`display:flex;flex-direction:column;gap:.6rem;`;
const TagsRow = styled.div`display:flex;gap:.6rem;flex-wrap:wrap;align-items:center;`;
const TagChip = styled.span`
  display:inline-flex;align-items:center;gap:.35rem;
  border:1px solid var(--zu-fg-2);padding:.2rem .45rem;border-radius:4px;
  font-size:.8rem;line-height:1;
  button{font-size:.8rem;line-height:1;height:22px;padding:0 .35rem;}
`;

/*──────── Custom metadata UI ────────────────────────────────*/
/* 5 columns: key | type | value | tiny preview | actions */
const CRow = styled.div`
  display:grid;
  grid-template-columns: minmax(120px,1fr) 140px minmax(220px,2fr) 56px auto;
  gap:.6rem;align-items:flex-start;
  @media(max-width:980px){
    grid-template-columns: 1fr 1fr;
    grid-auto-rows:auto;
    & > *:nth-child(3){grid-column:1 / -1;}
    & > *:nth-child(4){grid-column:auto;}
  }
`;
const TinyPreview = styled.div`
  width:56px;height:56px;border:1px solid var(--zu-fg-2);
  display:flex;align-items:center;justify-content:center;overflow:hidden;
  border-radius:3px;
  img,video,canvas,iframe{max-width:100%;max-height:100%;object-fit:contain;}
`;
const ActionBar = styled.div`
  display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;
`;
const CHelp = styled.p`
  font-size:.72rem;line-height:1.25;margin:.25rem 0 0;color:var(--zu-fg-3);
`;

/*──────── Checklist UI (right column) ──────────────────────*/
const CheckCard = styled.div`
  border:1px solid var(--zu-fg-2);border-radius:6px;padding:.8rem;
  display:flex;flex-direction:column;gap:.35rem;margin-bottom:1rem;
`;
const CheckRow = styled.div`
  display:flex;align-items:center;justify-content:space-between;
  gap:.6rem;font-size:.88rem;
  b{font-weight:600;}
  em{opacity:.75;font-style:normal;}
`;

/*──────── constants & helpers ───────────────────────────────*/
const CUSTOM_LABEL = 'Custom…';
const LICENSES = [
  'No License, All Rights Reserved',
  'On-Chain NFT License 2.0 KT1S9GHLCrGg5YwoJGDDuC347bCTikefZQ4z',
  'Creative Commons — CC BY 4.0',
  'Creative Commons — CC0 1.0',
  'MIT', 'GPL-3.0', 'CAL-1.0', CUSTOM_LABEL,
];
const ALIAS_RX = /\ball\s+rights\s+reserved\b/i;
const MAX_ROY_PCT = 25;
const MAX_ROY_ENTRIES = 8;
const isCustom = (v = '') => v === CUSTOM_LABEL || v === 'Custom…';
const enc = (v) => (typeof v === 'object' ? JSON.stringify(v) : String(v));
const fromHex = (h = '') => /^0x[0-9a-f]+$/i.test(h) ? Buffer.from(h.slice(2), 'hex').toString('utf8') : h;
const isTezosAddress = (a = '') => /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);
const matchLicence = (raw = '') => {
  const s = raw.trim().toLowerCase();
  const direct = LICENSES.find((l) => l.toLowerCase() === s);
  if (direct) return direct;
  return ALIAS_RX.test(s) ? 'No License, All Rights Reserved' : null;
};
const sanitizeTag = (t = '') =>
  t.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim(); // strip C0/C1 (I84)

const MEDIA_URI_KEYS = new Set(['artifactUri', 'displayUri', 'thumbnailUri']);
const BUILTIN_KEYS = new Set([
  'name', 'description', 'authors', 'artists', 'creators',
  'license', 'rights', 'royalties', 'contentRating', 'accessibility',
  'tags', 'attributes',
]);
const RESERVED_KEYS = new Set(['decimals']); // view‑only

const COMMON_PRESETS = [
  { key: 'artifactUri', type: 'data-uri', value: '' },
  { key: 'displayUri', type: 'data-uri', value: '' },
  { key: 'thumbnailUri', type: 'data-uri', value: '' },
  { key: 'mimeType', type: 'string', value: '' },
  { key: 'mintingTool', type: 'string', value: '' },
];

const looksLikeDataUri = (v = '') => /^data:/i.test(String(v).trim());
const looksLikeUrl = (v = '') => /^(https?:|ipfs:)/i.test(String(v).trim());
const initValueForType = (t) => {
  switch (t) {
    case 'json': return '{"key":"value"}';
    case 'array': return '["a","b"]';
    case 'boolean': return 'true';
    case 'number': return '0';
    case 'data-uri': return 'data:…';
    case 'url': return 'https://… or ipfs:/…';
    default: return '';
  }
};

/*──────── Component ─────────────────────────────────────────*/
export default function EditTokenMetadata({
  contractAddress = '',
  setSnackbar = () => {},
  onMutate = () => {},
}) {
  const { toolkit, address: wallet, network = 'ghostnet' } = useWalletContext() || {};
  const snack = useCallback(
    (m, s = 'info') => setSnackbar({ open: true, message: m, severity: s }),
    [setSnackbar],
  );

  /* Route marker for Break700 */
  useEffect(() => {
    document.body.setAttribute('data-zu-entry', 'edit-token');
    return () => document.body.removeAttribute('data-zu-entry');
  }, []);

  /* TzKT base normalization (includes /v1) per manifest */
  const BASE = network === 'mainnet'
    ? 'https://api.tzkt.io/v1'
    : 'https://api.ghostnet.tzkt.io/v1';

  /*──────── Token list ──────────────────────────────────────*/
  const [tokOpts, setTokOpts] = useState([]);
  const [loadingTok, setLTok] = useState(false);
  const [tokenId, setTokenId] = useState('');
  useEffect(() => {
    if (!contractAddress) return;
    (async () => {
      setLTok(true);
      setTokOpts(await listLiveTokenIds(contractAddress, network, true));
      setLTok(false);
    })();
  }, [contractAddress, network]);

  /*──────── Remote meta & flags ─────────────────────────────*/
  const [meta, setMeta] = useState(null);
  const [loading, setLoad] = useState(false);
  const [hasArtists, setHasArtists] = useState(false); // legacy key

  useEffect(() => {
    if (!tokenId) return;
    (async () => {
      setLoad(true);
      try {
        const [row] = await jFetch(
          `${BASE}/tokens?contract=${contractAddress}&tokenId=${tokenId}&limit=1`,
        ).catch(() => []);
        const m = row?.metadata ? { ...row.metadata } : {};

        /* license alias fix */
        if (m.rights && !m.license) m.license = m.rights;
        if (typeof m.license === 'string') m.license = fromHex(m.license);

        /* artists -> authors read-only alias (I103) */
        if (!m.authors && m.artists) m.authors = m.artists;
        setHasArtists(!!m.artists && !m.authors);

        ['authors', 'creators'].forEach((k) =>
          Array.isArray(m[k]) && (m[k] = m[k].join(', ')));

        /* tags normalization */
        m.tagsArr = Array.isArray(m.tags)
          ? m.tags
          : typeof m.tags === 'string'
            ? m.tags.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
            : [];

        /* attributes normalization */
        m.attrsArr = Array.isArray(m.attributes)
          ? m.attributes
          : m.attributes && typeof m.attributes === 'object'
            ? Object.entries(m.attributes).map(([name, value]) => ({ name, value }))
            : [];

        setMeta(m);
      } finally { setLoad(false); }
    })();
  }, [tokenId, contractAddress, BASE]);

  /*──────── Local form state ────────────────────────────────*/
  const [form, setForm] = useState({
    name: '', description: '', authors: '', creators: '',
    license: CUSTOM_LABEL, customLicense: '',
    contentRating: 'none', flashing: false,
  });
  const [tags, setTags] = useState([]);
  const [attrs, setAttrs] = useState([{ name: '', value: '' }]);
  const [roys, setRoys] = useState([{ address: '', sharePct: '' }]);

  /* Custom metadata rows: [{key, type, value}] */
  const [customRows, setCustomRows] = useState([{ key: '', type: 'string', value: '' }]);

  useEffect(() => {
    if (!meta) return;
    const licMatch = matchLicence(meta.license);
    const shares = meta.royalties?.shares || {};
    setRoys(Object.keys(shares).length
      ? Object.entries(shares).map(([a, v]) => ({ address: a, sharePct: (+(v) / 100).toString() }))
      : [{ address: '', sharePct: '' }]);

    setForm({
      name: meta.name ?? '', description: meta.description ?? '',
      authors: meta.authors ?? '', creators: meta.creators ?? '',
      license: licMatch || CUSTOM_LABEL,
      customLicense: licMatch ? '' : (meta.license ?? ''),
      contentRating: meta.contentRating || 'none',
      flashing: !!(meta.accessibility?.hazards || []).includes('flashing'),
    });
    setTags(meta.tagsArr);
    setAttrs(meta.attrsArr.length ? meta.attrsArr : [{ name: '', value: '' }]);

    // Seed custom rows from non-builtin, non-reserved keys (EXCLUDE helper-normalized tagsArr/attrsArr)
    const seeded = Object.entries(meta)
      .filter(([k]) =>
        !BUILTIN_KEYS.has(k) && !RESERVED_KEYS.has(k) && k !== 'tagsArr' && k !== 'attrsArr')
      .map(([k, v]) => {
        if (Array.isArray(v)) return { key: k, type: 'array', value: JSON.stringify(v) };
        if (v && typeof v === 'object') return { key: k, type: 'json', value: JSON.stringify(v, null, 0) };
        if (typeof v === 'boolean') return { key: k, type: 'boolean', value: String(v) };
        if (typeof v === 'number') return { key: k, type: 'number', value: String(v) };
        return {
          key: k,
          type: looksLikeDataUri(v) || MEDIA_URI_KEYS.has(k) ? 'data-uri' : 'string',
          value: String(v ?? ''),
        };
      });

    setCustomRows(seeded.length ? seeded : [{ key: '', type: 'string', value: '' }]);
  }, [meta]);

  /*──────── Royalties helpers ───────────────────────────────*/
  const setRoy = (i, k, v) => setRoys((p) => { const n = [...p]; n[i][k] = v; return n; });
  const addRoy = () => roys.length < MAX_ROY_ENTRIES &&
    setRoys((p) => [...p, { address: '', sharePct: '' }]);
  const delRoy = (i) => setRoys((p) => p.filter((_, idx) => idx !== i));
  const shares = useMemo(() => {
    const o = {};
    roys.forEach(({ address, sharePct }) => {
      const pct = parseFloat(sharePct);
      if (isTezosAddress(address) && pct > 0) o[address.trim()] = Math.round(pct * 100);
    });
    return o;
  }, [roys]);
  const totalPct = useMemo(
    () => Object.values(shares).reduce((t, v) => t + v, 0) / 100,
    [shares],
  );

  /*──────── Attribute helpers (Mint‑style) ──────────────────*/
  const setAttr = (i, k, v) => {
    if ((k === 'name' && v.length > MAX_ATTR_N) || (k === 'value' && v.length > MAX_ATTR_V)) return;
    setAttrs((p) => { const n = [...p]; n[i][k] = v; return n; });
  };
  const addAttr = () => attrs.length < MAX_ATTR &&
    setAttrs((p) => [...p, { name: '', value: '' }]);
  const delAttr = (i) => setAttrs((p) => p.filter((_, idx) => idx !== i));

  /*──────── Tags helpers ────────────────────────────────────*/
  const [tagInput, setTagInput] = useState('');
  const addTag = useCallback((t) => {
    const clean = sanitizeTag(t);
    if (!clean) return;
    setTags((prev) => {
      const next = Array.from(new Set([...prev, clean]));
      return next.slice(0, MAX_TAGS + 5); // soft cap; hard cap in validator
    });
    setTagInput('');
  }, []);
  const delTag = (i) => setTags((p) => p.filter((_, idx) => idx !== i));
  const onTagKey = (e) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
      e.preventDefault(); addTag(tagInput);
    }
  };

  /*──────── Custom rows helpers ─────────────────────────────*/
  const addPreset = (preset) => {
    setCustomRows((rows) => {
      const exists = rows.some((r) => r.key === preset.key);
      if (exists) return rows;
      if (rows.length === 1 && !rows[0].key && !rows[0].value) {
        return [{ ...preset, value: initValueForType(preset.type) }];
      }
      return [{ ...preset, value: initValueForType(preset.type) }, ...rows];
    });
  };

  const addEmptyRow = () => setCustomRows((rows) => [...rows, { key: '', type: 'string', value: '' }]);
  const removeRow = (i) => {
    setCustomRows((rows) => {
      if (rows.length === 1) return [{ key: '', type: 'string', value: '' }]; // never zero rows
      return rows.filter((_, idx) => idx !== i);
    });
  };
  const updateRow = (i, patch) => setCustomRows((rows) => rows.map((row, idx) => {
    if (idx !== i) return row;
    const next = { ...row, ...patch };
    if (patch.type && !row.value) next.value = initValueForType(patch.type);
    return next;
  }));
  const onRowValue = (i, v) => {
    setCustomRows((rows) => rows.map((row, idx) => {
      if (idx !== i) return row;
      const next = { ...row, value: v };
      if (looksLikeDataUri(v) && row.type !== 'data-uri') next.type = 'data-uri';
      return next;
    }));
  };

  /*──────── Custom metadata builders ───────────────────────*/
  const customWarnings = [];
  const customErrors = [];
  const customBlob = useMemo(() => {
    const out = {};
    const seen = new Set();
    for (const row of customRows) {
      const key = (row.key || '').trim();
      const raw = (row.value ?? '').toString();

      if (!key && raw.trim() === '') continue;

      if (!key) { customErrors.push('Custom row: key is required'); continue; }
      if (RESERVED_KEYS.has(key)) { customErrors.push(`Key "${key}" is reserved`); continue; }
      if (BUILTIN_KEYS.has(key)) { customErrors.push(`Key "${key}" is managed above`); continue; }
      if (seen.has(key)) { customErrors.push(`Duplicate custom key "${key}"`); continue; }
      seen.add(key);

      let typed;
      try {
        switch (row.type) {
          case 'number': {
            const n = Number(raw);
            if (!Number.isFinite(n)) throw new Error('number parse');
            typed = n; break;
          }
          case 'boolean': {
            const s = raw.trim().toLowerCase();
            if (!['true','false','yes','no','1','0'].includes(s)) throw new Error('boolean parse');
            typed = ['true','yes','1'].includes(s); break;
          }
          case 'array': {
            const txt = raw.trim();
            typed = txt
              ? (txt.startsWith('[') ? JSON.parse(txt) : txt.split(/[,\n;]/).map((x) => x.trim()).filter(Boolean))
              : [];
            if (!Array.isArray(typed)) throw new Error('array expected');
            break;
          }
          case 'json': {
            const txt = raw.trim();
            typed = txt ? JSON.parse(txt) : {};
            if (!typed || typeof typed !== 'object' || Array.isArray(typed)) throw new Error('object expected');
            break;
          }
          case 'data-uri': {
            const val = raw.trim();
            if (!val) { typed = ''; break; }
            if (!looksLikeDataUri(val)) customWarnings.push(`Key "${key}" is not a data: URI (allowed but discouraged).`);
            const bytes = Buffer.byteLength(val, 'utf8');
            // Only block the edit if the value CHANGED and is too large for the edit flow
            const changed = !meta || enc(meta[key]) !== enc(val);
            if (changed && bytes > 49152) customErrors.push(`Key "${key}" too large for edit; use Append flow.`);
            typed = val; break;
          }
          case 'url': {
            const val = raw.trim();
            typed = val; break;
          }
          default:
            typed = String(raw ?? '');
        }
      } catch {
        customErrors.push(`Key "${key}" has invalid ${row.type} value`);
        continue;
      }

      if (MEDIA_URI_KEYS.has(key) && typeof typed === 'string' && !looksLikeDataUri(typed) && typed) {
        customWarnings.push(`Key "${key}" should be data: URI for on‑chain media; non‑data will show a soft integrity icon.`);
      }

      out[key] = typed;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customRows, meta]); // custom warnings/errors recompute with meta

  /*──────── metaBlob & validation ───────────────────────────*/
  const cleanAttrs = useMemo(() => attrs.filter((a) => a.name && a.value), [attrs]);
  const AUTHORS_KEY = useMemo(() => (hasArtists ? 'artists' : 'authors'), [hasArtists]);

  const computedLicense = isCustom(form.license)
    ? (form.customLicense.trim() || meta?.license || '')
    : form.license;

  const metaBlob = {
    ...(form.name.trim() && { name: form.name }),
    ...(form.description.trim() && { description: form.description }),
    ...(form.authors.trim() && { [AUTHORS_KEY]: form.authors }),
    ...(form.creators.trim() && { creators: form.creators }),
    ...(computedLicense && { license: computedLicense, rights: computedLicense }),
    ...(Object.keys(shares).length && { royalties: { decimals: 4, shares } }),
    ...(form.contentRating === 'mature' && { contentRating: 'mature' }),
    ...(form.flashing && { accessibility: { hazards: ['flashing'] } }),
    ...(tags.length && { tags }),
    ...(cleanAttrs.length && { attributes: cleanAttrs }),
    ...customBlob,
  };

  // Immutable flags cannot be unset
  const cannotUnset =
    (meta?.contentRating === 'mature' && form.contentRating !== 'mature') ||
    ((meta?.accessibility?.hazards || []).includes('flashing') && !form.flashing);

  // Current on-chain snapshot for diffing (include non-builtin)
  const currentSnapshot = useMemo(() => {
    if (!meta) return {};
    return {
      name: meta.name, description: meta.description,
      [AUTHORS_KEY]: meta[AUTHORS_KEY],
      creators: meta.creators, license: meta.license, royalties: meta.royalties,
      contentRating: meta.contentRating, accessibility: meta.accessibility,
      tags: meta.tagsArr, attributes: meta.attrsArr,
      ...Object.fromEntries(
        Object.entries(meta).filter(([k]) =>
          !BUILTIN_KEYS.has(k) && !RESERVED_KEYS.has(k) && k !== 'tagsArr' && k !== 'attrsArr')),
    };
  }, [meta, AUTHORS_KEY]);

  // Build diff-only blob for precise byte check (avoid false “>32768 B”)
  const diffOnlyBlob = useMemo(() => {
    const out = {};
    Object.entries(metaBlob).forEach(([k, v]) => {
      if (enc(v) !== enc(currentSnapshot[k])) out[k] = v;
    });
    return out;
  }, [metaBlob, currentSnapshot]);

  const metaBytesTotal = Buffer.byteLength(JSON.stringify(metaBlob), 'utf8');
  const metaBytesDiff  = Buffer.byteLength(JSON.stringify(diffOnlyBlob), 'utf8');

  const { errors: baseErrors } = useMemo(() => validateEditTokenFields({
    form: { ...form, tags, attributes: cleanAttrs },
    metaBytes: metaBytesTotal,            // for transparency/UI, not gating
    bytesForCheck: metaBytesDiff,         // **gating check uses DIFF BYTES**
    walletOK: !!wallet,
  }), [form, tags, cleanAttrs, metaBytesTotal, metaBytesDiff, wallet]);

  const tagErr = tags.length > MAX_TAGS;
  const errors = [
    ...baseErrors,
    ...(totalPct > MAX_ROY_PCT ? ['Royalties exceed limit'] : []),
    ...(cannotUnset ? ['Contract v4 forbids removing “mature” or “flashing” flags'] : []),
    ...(tagErr ? [`> ${MAX_TAGS} tags`] : []),
    ...customErrors,
  ];

  /*──────── Contract handle (wallet-bound) ──────────────────*/
  const [contractHandle, setHandle] = useState(null);
  useEffect(() => { let dead = false;
    if (!toolkit || !contractAddress) { setHandle(null); return; }
    (async () => {
      try {
        const c = await toolkit.wallet.at(contractAddress);
        if (!dead) setHandle(c);
      } catch (e) { console.error(e); }
    })();
    return () => { dead = true; };
  }, [toolkit, contractAddress]);

  /*── diffMap for edit_token_metadata (uses same snapshot key as AUTHORS_KEY) ──*/
  const diffMap = useMemo(() => {
    const m = new MichelsonMap();
    Object.entries(diffOnlyBlob).forEach(([k, v]) => {
      m.set(k, '0x' + char2Bytes(enc(v)));
    });
    return m;
  }, [diffOnlyBlob]);

  /*── memoized params ──*/
  const paramsRef = useRef([]);
  const paramsKeyRef = useRef('');
  const diffKey = useMemo(
    () => [...diffMap.entries()].map(([k, v]) => `${k}:${v}`).sort().join('|'),
    [diffMap],
  );
  const params = useMemo(() => {
    if (!contractHandle || diffMap.size === 0) return [];
    if (paramsKeyRef.current === diffKey) return paramsRef.current;
    const p = [{
      kind: OpKind.TRANSACTION,
      ...contractHandle.methods.edit_token_metadata(diffMap, +tokenId).toTransferParams(),
    }];
    paramsRef.current = p;
    paramsKeyRef.current = diffKey;
    return p;
  }, [contractHandle, diffKey, tokenId, diffMap]);

  /*──────── TZIP compliance checklist (soft for display/thumbnail) ───────────*/
  const effective = { ...(meta || {}), ...metaBlob };
  const has = (k) => typeof effective[k] !== 'undefined' && effective[k] !== null && String(effective[k]).trim() !== '';
  const hasArray = (k) => Array.isArray(effective[k]) && effective[k].length > 0;

  const checklist = [
    { key: 'name',            label: 'name',          mandatory: true,  ok: has('name') },
    { key: 'mimeType',        label: 'mimeType',      mandatory: true,  ok: has('mimeType') },
    { key: 'artifactUri',     label: 'artifactUri',   mandatory: true,  ok: has('artifactUri'), media: true },
    // Soft OPTIONALS per ZeroUnbound fully on-chain policy:
    { key: 'displayUri',      label: 'displayUri',    mandatory: false, ok: has('displayUri'), media: true, soft: true },
    { key: 'thumbnailUri',    label: 'thumbnailUri',  mandatory: false, ok: has('thumbnailUri'), media: true, soft: true },
    { key: 'creators',        label: 'creators',      mandatory: true,  ok: has('creators') },
    { key: 'license',         label: 'license',       mandatory: true,  ok: has('license') },
    { key: 'royalties',       label: 'royalties',     mandatory: true,  ok: !!effective.royalties && Object.values(effective.royalties.shares || {}).length > 0 && totalPct <= MAX_ROY_PCT },
    { key: 'decimals',        label: 'decimals',      mandatory: true,  ok: typeof meta?.decimals !== 'undefined' }, // reserved: view-only
    { key: 'tags',            label: 'tags (optional)',       mandatory: false, ok: hasArray('tags'), soft: true },
    { key: 'attributes',      label: 'attributes (optional)', mandatory: false, ok: hasArray('attributes'), soft: true },
  ];

  /*──────── UI/submit guards ────────────────────────────────*/
  const disabled = !tokenId || errors.length > 0 || !toolkit || !contractHandle;
  const [confirmOpen, setConfirm] = useState(false);
  const est = useTxEstimate(toolkit, (confirmOpen && contractHandle) ? params : []);

  const [ov, setOv] = useState({ open: false });
  const submit = async () => {
    try {
      if (diffMap.size === 0) return snack('No changes', 'warning');
      if (!contractHandle) return snack('Contract not ready', 'error');
      setOv({ open: true, status: 'Waiting for signature…', total: 1, current: 1 });
      const op = await contractHandle.methods.edit_token_metadata(diffMap, +tokenId).send();
      setOv({ open: true, status: 'Broadcasting…', total: 1, current: 1 });
      await op.confirmation();
      setOv({ open: true, opHash: op.opHash, total: 1, current: 1 });
      snack('Token metadata updated', 'success'); onMutate();
    } catch (e) {
      snack(e.message, 'error'); setOv({ open: false });
    }
  };

  /*──────── Render ──────────────────────────────────────────*/
  return (
    <section data-zu-entry="edit-token">
      <Break700 />
      <PixelHeading level={3}>Edit Token Metadata</PixelHeading>
      <HelpBox>
        v4/v4e can <b>only add or overwrite</b> keys; it cannot remove them.
        This editor computes a <b>diff</b> and only sends changed keys. Large
        existing media (e.g. a huge <code>artifactUri</code>) will not be re‑sent unless you change it.
        <b> displayUri</b> and <b>thumbnailUri</b> are <i>optional</i> here (soft guidance only).
      </HelpBox>

      {/* picker */}
      <PickerWrap>
        <FieldWrap style={{ flex: 1 }}>
          <label htmlFor="tokenId">Token ID *</label>
          <PixelInput
            id="tokenId"
            placeholder="e.g. 42"
            value={tokenId}
            onChange={(e) => setTokenId(e.target.value.replace(/\D/g, ''))}
            aria-required="true"
            aria-invalid={tokenId === ''}
          />
        </FieldWrap>

        <Box>
          <label htmlFor="tokenSelect" style={{ display: 'none' }}>Select token</label>
          <select
            id="tokenSelect"
            style={{ width: '100%', height: 32 }}
            disabled={loadingTok}
            value={tokenId || ''}
            onChange={(e) => setTokenId(e.target.value)}
          >
            <option value="">
              {loadingTok ? 'Loading…' : tokOpts.length ? 'Select token' : '— none —'}
            </option>
            {tokOpts.map(({ id, name }) => (
              <option key={id} value={id}>{name ? `${id} — ${name}` : id}</option>
            ))}
          </select>
          {loadingTok && <Spin />}
        </Box>
      </PickerWrap>

      {loading && <LoadingSpinner size={32} style={{ margin: '1rem auto' }} />}

      {meta && (
        <GridWrap>
          {/* form */}
          <FormGrid style={{ gridColumn: '1 / span 8' }}>
            {[{ k: 'name', label: 'Name', mandatory: true },
              { k: 'description', label: 'Description', tag: 'textarea', rows: 4 },
              { k: 'authors', label: hasArtists ? 'Artist(s)' : 'Author(s)', tag: 'textarea', rows: 2 },
              { k: 'creators', label: 'Creator wallet(s)', tag: 'textarea', rows: 2, mandatory: true }].map(
              ({ k, label, tag, rows, mandatory }) => (
                <FieldWrap
                  key={k}
                  style={k === 'description' ? { gridColumn: '1 / -1' } : undefined}
                >
                  <label htmlFor={k}>{label}{mandatory ? ' *' : ''}</label>
                  <PixelInput
                    as={tag}
                    id={k}
                    rows={rows}
                    value={form[k]}
                    onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  />
                </FieldWrap>
              )
            )}

            {/* license */}
            <FieldWrap>
              <label>License *</label>
              <PixelInput
                as="select"
                value={form.license}
                onChange={(e) => setForm((f) => ({ ...f, license: e.target.value }))}
              >
                {LICENSES.map((l) => <option key={l}>{l}</option>)}
              </PixelInput>
            </FieldWrap>
            {isCustom(form.license) && (
              <FieldWrap style={{ gridColumn: '1 / -1' }}>
                <label>Custom license *</label>
                <PixelInput
                  as="textarea"
                  rows={2}
                  value={form.customLicense}
                  onChange={(e) => setForm((f) => ({ ...f, customLicense: e.target.value }))}
                />
              </FieldWrap>
            )}

            {/* royalties */}
            <FieldWrap style={{ gridColumn: '1 / -1' }}>
              <RoyHeading>
                Royalties (≤ {MAX_ROY_PCT}% total · current {totalPct}%)
              </RoyHeading>
              {roys.map((r, i) => (
                <RoyalRow key={i}>
                  <PixelInput
                    placeholder="tz1…"
                    value={r.address}
                    onChange={(e) => setRoy(i, 'address', e.target.value)}
                  />
                  <PixelInput
                    placeholder="%"
                    value={r.sharePct}
                    onChange={(e) => setRoy(i, 'sharePct', e.target.value.replace(/[^0-9.]/g, ''))}
                  />
                  <PixelButton
                    size="xs"
                    onClick={i === 0 ? addRoy : () => delRoy(i)}
                    disabled={i === 0 && roys.length >= MAX_ROY_ENTRIES}
                  >
                    {i === 0 ? '＋' : '－'}
                  </PixelButton>
                </RoyalRow>
              ))}
              {totalPct > MAX_ROY_PCT && <Err>Royalties exceed {MAX_ROY_PCT}%</Err>}
            </FieldWrap>

            {/* rating / flashing */}
            <FieldWrap>
              <label>Content rating</label>
              <PixelInput
                as="select"
                value={form.contentRating}
                onChange={(e) => setForm((f) => ({ ...f, contentRating: e.target.value }))}
              >
                <option value="none">Unrated / safe</option>
                <option value="mature">mature</option>
              </PixelInput>
            </FieldWrap>
            <FieldWrap>
              <label>Flashing hazard</label>
              <PixelInput
                as="select"
                value={form.flashing ? 'yes' : 'no'}
                onChange={(e) => setForm((f) => ({ ...f, flashing: e.target.value === 'yes' }))}
              >
                <option value="no">No flashing</option>
                <option value="yes">Contains flashing</option>
              </PixelInput>
            </FieldWrap>

            {/* Tags */}
            <FieldWrap style={{ gridColumn: '1 / -1' }}>
              <label>Tags</label>
              <div style={{ display:'flex', flexDirection:'column', gap:'.6rem' }}>
                <TagsRow>
                  <PixelInput
                    placeholder="Type a tag then Enter (or , ;)"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={onTagKey}
                  />
                  <PixelButton size="xs" onClick={() => addTag(tagInput)} disabled={!tagInput.trim()}>Add</PixelButton>
                  <CHelp>Suggested max: {MAX_TAGS}. We’ll warn if you exceed.</CHelp>
                </TagsRow>
                <TagsRow>
                  {tags.map((t, i) => (
                    <TagChip key={`${t}-${i}`}>
                      <span>{t}</span>
                      <PixelButton size="xs" onClick={() => delTag(i)}>x</PixelButton>
                    </TagChip>
                  ))}
                </TagsRow>
                {tagErr && <Err>Too many tags. Please trim to ≤ {MAX_TAGS}.</Err>}
              </div>
            </FieldWrap>

            {/* attributes */}
            <FieldWrap style={{ gridColumn: '1 / -1' }}>
              <label>Attributes</label>
              {attrs.map((a, i) => (
                <Row key={i}>
                  <PixelInput
                    placeholder="Name"
                    value={a.name}
                    onChange={(e) => setAttr(i, 'name', e.target.value)}
                  />
                  <PixelInput
                    placeholder="Value"
                    value={a.value}
                    onChange={(e) => setAttr(i, 'value', e.target.value)}
                  />
                  <PixelButton
                    size="xs"
                    onClick={i === 0 ? addAttr : () => delAttr(i)}
                    disabled={i === 0 && attrs.length >= MAX_ATTR}
                  >
                    {i === 0 ? '＋' : '－'}
                  </PixelButton>
                </Row>
              ))}
              {!validAttributes(cleanAttrs) && <Err>Attributes invalid</Err>}
            </FieldWrap>

            {/* Custom metadata rows */}
            <FieldWrap style={{ gridColumn: '1 / -1' }}>
              <PixelHeading level={5}>Custom Metadata Rows</PixelHeading>
              <CHelp>
                Add arbitrary metadata keys and choose the type. Media keys
                (<code>artifactUri</code>, <code>displayUri</code>, <code>thumbnailUri</code>)
                are best as <code>data:</code> URIs. Use <b>Upload</b> to auto‑fill a data URI and
                see a tiny preview; very large files should use Append flows.
              </CHelp>

              {/* presets */}
              <TagsRow style={{ margin: '.2rem 0 .4rem' }}>
                {COMMON_PRESETS.map((p) => (
                  <PixelButton key={p.key} size="xs" onClick={() => addPreset(p)}>
                    Add {p.key}
                  </PixelButton>
                ))}
                <PixelButton size="xs" onClick={addEmptyRow}>Add Row</PixelButton>
              </TagsRow>

              {/* rows */}
              {customRows.map((r, i) => {
                const unchanged =
                  !!meta && r.key && enc(r.value) === enc(meta[r.key]);
                return (
                  <div key={i} style={{ marginTop: '.5rem' }}>
                    <CRow>
                      <PixelInput
                        placeholder="metadata key (e.g. artifactUri)"
                        value={r.key}
                        onChange={(e) => updateRow(i, { key: e.target.value })}
                      />

                      <PixelInput
                        as="select"
                        value={r.type}
                        onChange={(e) => updateRow(i, { type: e.target.value })}
                      >
                        <option value="string">String</option>
                        <option value="number">Number</option>
                        <option value="boolean">Boolean</option>
                        <option value="array">Array</option>
                        <option value="json">JSON object</option>
                        <option value="data-uri">Data URI</option>
                        <option value="url">URL</option>
                      </PixelInput>

                      <PixelInput
                        as={(r.type === 'json' || r.type === 'array') ? 'textarea' : 'input'}
                        placeholder={r.type === 'data-uri'
                          ? 'data:…'
                          : r.type === 'json'
                            ? '{"key":"value"}'
                            : r.type === 'array'
                              ? '["a","b"] or a, b'
                              : looksLikeUrl(r.value) ? 'http(s)://… or ipfs:/…' : 'value'}
                        rows={r.type === 'json' || r.type === 'array' ? 3 : undefined}
                        value={r.value}
                        onChange={(e) => onRowValue(i, e.target.value)}
                      />

                      {/* tiny preview – only for data: images/videos */}
                      <TinyPreview aria-label="Preview">
                        {looksLikeDataUri(r.value) ? (
                          String(r.value).startsWith('data:image')
                            ? <img src={r.value} alt="" />
                            : String(r.value).startsWith('data:video')
                              ? <video src={r.value} muted loop playsInline />
                              : <span style={{ fontSize: 10, opacity: 0.7 }}>data:</span>
                        ) : (
                          <span style={{ fontSize: 10, opacity: 0.7 }}>—</span>
                        )}
                      </TinyPreview>

                      <ActionBar>
                        {r.type === 'data-uri' && (
                          <MintUpload
                            size="xs"
                            btnText="Upload"
                            onFileChange={() => {}}
                            onFileDataUrlChange={(dataUrl) => updateRow(i, { value: dataUrl })}
                            // keep uploads tiny in this flow; large goes to Append
                            maxFileSize={32000 * 1.5} // ~48KB soft ceiling
                            accept={undefined}
                          />
                        )}
                        <PixelButton size="xs" onClick={() => removeRow(i)}>－</PixelButton>
                        <PixelButton size="xs" onClick={addEmptyRow}>＋</PixelButton>
                      </ActionBar>
                    </CRow>

                    {/* per-row hints/warnings */}
                    {(MEDIA_URI_KEYS.has((r.key || '').trim()) && !looksLikeDataUri(r.value) && r.value) && (
                      <Warn>➖ Soft: media key not using data: URI (allowed; off‑chain links will show an integrity hint).</Warn>
                    )}
                    {unchanged && (
                      <CHelp>Unchanged; this key will <b>not</b> be sent in the update.</CHelp>
                    )}
                  </div>
                );
              })}

              {/* Live “derived” arrays (read‑only mirrors of Tags/Attributes) */}
              <div style={{ marginTop: '1rem' }}>
                <PixelHeading level={6}>Derived (live) arrays</PixelHeading>
                <CHelp>These mirror the editors above and update in real‑time.</CHelp>

                {/* tagsArr */}
                <CRow style={{ opacity: .9 }}>
                  <PixelInput value="tagsArr" disabled />
                  <PixelInput as="select" value="array" disabled>
                    <option>Array</option>
                  </PixelInput>
                  <PixelInput as="textarea" rows={2} value={JSON.stringify(tags)} readOnly />
                  <TinyPreview aria-label="Preview"><span style={{ fontSize: 10, opacity: 0.7 }}>—</span></TinyPreview>
                  <ActionBar><em style={{ fontSize: 12, opacity: .6 }}>read‑only</em></ActionBar>
                </CRow>

                {/* attrsArr */}
                <CRow style={{ marginTop: '.4rem', opacity: .9 }}>
                  <PixelInput value="attrsArr" disabled />
                  <PixelInput as="select" value="array" disabled>
                    <option>Array</option>
                  </PixelInput>
                  <PixelInput as="textarea" rows={2} value={JSON.stringify(cleanAttrs)} readOnly />
                  <TinyPreview aria-label="Preview"><span style={{ fontSize: 10, opacity: 0.7 }}>—</span></TinyPreview>
                  <ActionBar><em style={{ fontSize: 12, opacity: .6 }}>read‑only</em></ActionBar>
                </CRow>
              </div>
            </FieldWrap>

            {/* CTA + messages */}
            <div
              style={{
                gridColumn: '1 / -1',
                display: 'flex',
                flexDirection: 'column',
                gap: '.6rem',
                marginTop: '1rem',
              }}
            >
              <PixelButton
                disabled={disabled}
                onClick={() => setConfirm(true)}
                title={tagErr ? `> ${MAX_TAGS} tags` : (errors[0] || undefined)}
              >
                {contractHandle ? 'UPDATE' : 'Connecting…'}
              </PixelButton>

              {(errors.length > 0 || customWarnings.length > 0) && (
                <ul style={{ margin: 0, paddingInlineStart: '1rem' }}>
                  {errors.map((e, i) => (
                    <li key={`e-${i}`} style={{ fontSize: '.75rem', color: 'var(--zu-accent-sec)' }}>{e}</li>
                  ))}
                  {customWarnings.map((w, i) => (
                    <li key={`w-${i}`} style={{ fontSize: '.74rem', color: 'var(--zu-accent)' }}>{w}</li>
                  ))}
                </ul>
              )}
              {/* Transparent bytes info (not gating): */}
              <CHelp>
                Byte report — assembled:{' '}
                <code>{metaBytesTotal}</code> B; <b>diff‑only</b> to be sent:{' '}
                <code>{metaBytesDiff}</code> B.
              </CHelp>
            </div>
          </FormGrid>

          {/* right column: checklist + preview */}
          <div style={{ gridColumn: 'span 4', minWidth: 0 }}>
            <CheckCard aria-label="TZIP compliance checklist">
              <PixelHeading level={5} style={{ margin: 0 }}>TZIP‑21 / V4 Checklist</PixelHeading>
              {checklist.map((c) => {
                const present = !!c.ok;
                const icon = present ? '✔️'
                  : c.soft ? '➖'
                  : c.mandatory ? '❌' : '➖';
                const color = present ? 'var(--zu-fg)' : (c.mandatory && !c.soft ? 'var(--zu-accent-sec)' : 'var(--zu-fg-3)');
                const hint = (c.media && present && typeof effective[c.key] === 'string' && !looksLikeDataUri(effective[c.key]))
                  ? ' (non‑data URI)'
                  : '';
                return (
                  <CheckRow key={c.key} title={c.soft && !present ? 'Optional here (soft)' : undefined}>
                    <b>{c.label}</b>
                    <span style={{ color, fontSize: '.95rem' }}>{icon}{hint}</span>
                  </CheckRow>
                );
              })}
              <CHelp style={{ marginTop: '.4rem' }}>
                Note: <b>displayUri</b> and <b>thumbnailUri</b> are optional on ZeroUnbound’s fully on‑chain flow (soft “➖” when missing).
                Non‑data links (http/ipfs) are allowed but will show a ⛓️‍💥 integrity hint for not being fully on‑chain.
              </CHelp>
            </CheckCard>

            <TokenMetaPanel
              meta={{ ...(meta || {}), ...metaBlob }}
              tokenId={tokenId}
              contractAddress={contractAddress}
            />
          </div>
        </GridWrap>
      )}

      {confirmOpen && (
        <OperationConfirmDialog
          open
          slices={1}
          estimate={{ feeTez: est.feeTez, storageTez: est.storageTez }}
          onOk={() => { setConfirm(false); submit(); }}
          onCancel={() => setConfirm(false)}
        />
      )}
      {ov.open && <OperationOverlay {...ov} onCancel={() => setOv({ open: false })} />}
    </section>
  );
}

/* What changed & why:
   - Fix false “Metadata > 32768 B” by size‑checking DIFF only.
   - media keys optional (soft ➖); unchanged large URIs don’t block.
   - Per‑row “unchanged; not sent” hint; clearer soft integrity notes.
*/
