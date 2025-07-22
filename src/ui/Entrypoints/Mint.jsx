/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/Mint.jsx
  Rev :    r882   2025-07-22
  Summary: refine oversize detection; clamp first slice only when needed and
           flag metadata overhead overflow.  Prevents runaway slices on
           Mac/iOS and handles <1KB media.
──────────────────────────────────────────────────────────────*/
import React, {
  useRef, useState, useEffect, useMemo, useCallback,
} from 'react';
import styledPkg                   from 'styled-components';
import { MichelsonMap }            from '@taquito/michelson-encoder';
import { OpKind }                  from '@taquito/taquito';
import { Buffer }                  from 'buffer';
import { char2Bytes }              from '@taquito/utils';

import PixelHeading       from '../PixelHeading.jsx';
import PixelInput         from '../PixelInput.jsx';
import PixelButton        from '../PixelButton.jsx';
import MintUpload         from './MintUpload.jsx';
import MintPreview        from './MintPreview.jsx';
import OperationOverlay   from '../OperationOverlay.jsx';
import OperationConfirmDialog from '../OperationConfirmDialog.jsx';

import { useWalletContext } from '../../contexts/WalletContext.js';
import {
  asciiPrintable,
  MAX_ATTR, MAX_ATTR_N, MAX_ATTR_V,
  MAX_TAGS, MAX_TAG_LEN,
  MAX_ROY_PCT, MAX_EDITIONS, MAX_META_BYTES, LOCK_SELF_BYTES,
  isTezosAddress, royaltyUnder25, validAttributes,
} from '../../core/validator.js';
import { ROOT_URL }                   from '../../config/deployTarget.js';
import { SLICE_MAX_BYTES, SLICE_MIN_BYTES, planSlices } from '../../core/batch.js';
import {
  saveSliceCheckpoint, loadSliceCheckpoint, purgeExpiredSliceCache,
} from '../../utils/sliceCache.js';

import {
  estimateChunked, calcStorageMutez, μBASE_TX_FEE, toTez,
  calcExactOverhead, MAX_OP_DATA_BYTES, isSimTimeout,
} from '../../core/feeEstimator.js';
import { mimeFromFilename } from '../../constants/mimeTypes.js';

/* polyfill for node envs / SSR */
if (typeof window !== 'undefined' && !window.Buffer) window.Buffer = Buffer;

/*──────── constants ─────────────────────────────────────────*/
const META_PAD_BYTES = 1_000;                  /* estimator head‑room  */

/* enforce self‑recipient for these */
const requiresSelfRecipient = (oversize, metaBytes) =>
  oversize || metaBytes > LOCK_SELF_BYTES;

const MAX_ROY_ENTRIES = 10;
const OVERHEAD        = 360;                   /* token‑info frame     */

const LICENSES = [
  'CC0 (Public Domain)', 'All Rights Reserved',
  'On-Chain NFT License 2.0 (KT1S9GHLCrGg5YwoJGDDuC347bCTikefZQ4z)',
  'CC BY 4.0', 'CC BY-SA 4.0', 'CC BY-ND 4.0', 'CC BY-NC 4.0',
  'CC BY-NC-SA 4.0', 'CC BY-NC-ND 4.0', 'MIT', 'GPL', 'Apache 2.0',
  'Unlicense', 'Custom',
];

/*──────── styled shells ─────────────────────────────────────*/
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Wrap = styled('div').withConfig({ shouldForwardProp: (p) => p !== '$level' })`
  display:flex;flex-direction:column;gap:1.1rem;
  position:relative;z-index:${(p) => p.$level ?? 'auto'};
`;
const Grid      = styled.div`
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(190px,1fr));
  gap:.9rem;
`;
const Row       = styled.div`
  display:grid;grid-template-columns:1fr 1fr auto;
  gap:.6rem;align-items:center;
`;
const RoyalRow  = styled(Row)`grid-template-columns:1fr 90px auto;`;
const TagArea   = styled.div`display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.3rem;`;
const TagChip = styled.span.attrs({ role: 'button', tabIndex: 0 })`
  background:var(--zu-accent-sec);
  color:var(--zu-btn-fg);
  padding:.12rem .45rem;
  font-size:.65rem;
  border-radius:.25rem;
  cursor:pointer;
  &:focus{outline:2px solid var(--zu-accent);}
`;

const Note      = styled.p`
  font-size:.68rem;line-height:1.2;margin:.25rem 0 .1rem;text-align:center;
  color:var(--zu-accent-sec);
`;
const Select    = styled.select`
  width:100%;background:var(--zu-bg);color:var(--zu-fg);
  border:1px solid var(--zu-fg);padding:.25rem .4rem;font-family:inherit;
`;
const HelpBox = styled.p`
  font-size:.75rem;line-height:1.25;margin:.5rem 0 .9rem;
`;
const ChecklistBox = styled.ul`
  list-style:none;padding:0;margin:.6rem auto 0;font-size:.68rem;
  max-width:260px;
  li{display:flex;gap:.35rem;align-items:center;}
  li.ok::before   {content:"✓";color:var(--zu-accent);}
  li.bad::before  {content:"✗";color:var(--zu-accent-sec);}
  li.warn::before {content:"❗";color:var(--zu-accent-sec);}
`;

/*──────── helper fns ───────────────────────────────────────*/
const hex = (s = '') => `0x${Buffer.from(s, 'utf8').toString('hex')}`;

/* build Michelson map */
const buildMeta = ({
  f, attrs, tags, dataUrl, mime, shares,
}) => {
  const m = new MichelsonMap();
  m.set('name', hex(f.name));
  m.set('decimals', hex('0'));
  if (f.description) m.set('description', hex(f.description));
  m.set('mimeType', hex(mime || ''));
  if (dataUrl) m.set('artifactUri', hex(dataUrl));

  if (f.authors?.trim()) {
    m.set('authors', hex(JSON.stringify(
      f.authors.split(',').map((x) => x.trim()),
    )));
  }

  m.set('creators', hex(JSON.stringify(
    f.creators.split(',').map((x) => x.trim()).filter(Boolean),
  )));
  m.set('rights', hex(f.license === 'Custom' ? f.customLicense : f.license));
  m.set('mintingTool', hex(ROOT_URL));
  m.set('royalties', hex(JSON.stringify({ decimals: 4, shares })));

  if (f.flashing === 'Does contain Flashing Hazard') {
    m.set('accessibility', hex(JSON.stringify({ hazards: ['flashing'] })));
  }
  if (f.nsfw === 'Does contain NSFW') m.set('contentRating', hex('mature'));

  if (tags.length)  m.set('tags',       hex(JSON.stringify(tags)));
  if (attrs.length) m.set('attributes', hex(JSON.stringify(attrs)));
  return m;
};

const mapSize = (map) => {
  let total = OVERHEAD;
  for (const [k, v] of map.entries()) {
    total += Buffer.byteLength(k, 'utf8');
    total += v.startsWith('0x') ? (v.length - 2) / 2 : Buffer.byteLength(v, 'utf8');
  }
  return total;
};

const buildMintCall = (c, ver, amt, map, to) => {
  const n = parseInt(amt, 10) || 1;
  const v = String(ver).replace(/^v/i, '');
  if (v === '1')  return c.methods.mint(map, to);
  if (v === '2b') return c.methods.mint(map, to, n);
  return c.methods.mint(n, map, to);            // v3+
};

/*──────── snackbar helper ──────────────────────────────────*/
function useSnackbarBridge(cb) {
  const [local, setLocal] = useState(null);
  const api = (msg, sev = 'info') => {
    cb ? cb({ open: true, message: msg, severity: sev })
       : setLocal({ open: true, message: msg, severity: sev });
  };
  const node = local?.open && (
    <button
      type="button"
      style={{
        position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        background: '#222', color: '#fff', padding: '6px 12px', borderRadius: 4,
        fontSize: '.8rem', zIndex: 2600, cursor: 'pointer',
      }}
      onClick={() => setLocal(null)}
    >{local.message}
    </button>
  );
  return [api, node];
}

/*════════ component ═══════════════════════════════════════*/
export default function Mint({
  contractAddress, contractVersion = 'v4',
  setSnackbar, onMutate, $level,
}) {
  /* slice‑cache hygiene */
  useEffect(() => { purgeExpiredSliceCache(); }, []);

  /* wallet / toolkit */
  const wc = useWalletContext() || {};
  const { address: wallet, toolkit: toolkitExt } = wc;
  const toolkit =
    toolkitExt
      || (typeof window !== 'undefined' && window.tezosToolkit);

  /* snackbar */
  const [snack, snackNode] = useSnackbarBridge(setSnackbar);

  /*── form & UI state ─────────────────────────────────────*/
  const init = {
    name: '', description: '', creators: '', authors: '',
    toAddress: '', license: 'All Rights Reserved', customLicense: '',
    amount: '1', nsfw: 'Does not contain NSFW',
    flashing: 'Does not contain Flashing Hazard',
    agree: false,
  };
  const [f, setF]         = useState(init);
  const [attrs, setAttrs] = useState([{ name: '', value: '' }]);
  const [tags, setTags]   = useState([]);
  const [tagInput, setTagInput]     = useState('');
  const [file, setFile]   = useState(null);
  const [url, setUrl]     = useState('');
  const [roys, setRoys]   = useState([{ address: wallet || '', sharePct: '' }]);

  const [batches, setBatches]       = useState(null);
  const [stepIdx, setStepIdx]       = useState(0);
  const [confirmCount, setConfirmCount] = useState(0);
  const [ov, setOv]                = useState({ open: false });
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [retryCount, setRetryCount] = useState(0);
  const [sliceSize, setSliceSize] = useState(SLICE_MAX_BYTES);

  const tagRef = useRef(null);

  /* wallet autofill */
  useEffect(() => {
    setF((p) => ({ ...p, creators: wallet || '', toAddress: wallet || '' }));
    setRoys((p) => {
      const n = [...p];
      if (!n.length) return [{ address: wallet || '', sharePct: '' }];
      n[0] = { ...n[0], address: wallet || '' };
      return n;
    });
  }, [wallet]);

  /* royalties helpers */
  const setRoy = (i, k, v) => setRoys((p) => { const n = [...p]; n[i][k] = v; return n; });
  const addRoy = () => roys.length < MAX_ROY_ENTRIES && setRoys((p) => [...p, { address: '', sharePct: '' }]);
  const delRoy = (i) => setRoys((p) => p.filter((_, idx) => idx !== i));

  /* attr helpers */
  const setAttr = (i, k, v) => {
    if ((k === 'name' && v.length > MAX_ATTR_N) || (k === 'value' && v.length > MAX_ATTR_V)) return;
    setAttrs((p) => { const n = [...p]; n[i][k] = v; return n; });
  };
  const addAttr = () => attrs.length < MAX_ATTR && setAttrs((p) => [...p, { name: '', value: '' }]);
  const delAttr = (i) => setAttrs((p) => p.filter((_, idx) => idx !== i));

  /*──────────────── tag chip helpers ───────────────*/
  const pushTag = (raw = '') => {
    const t = raw.trim().toLowerCase();
    if (!t) return;
    if (!/^[a-z0-9-_]+$/i.test(t))      return snack('Invalid tag', 'error');
    if (t.length > MAX_TAG_LEN)         return snack('Tag too long', 'error');
    if (tags.includes(t))               return;
    if (tags.length >= MAX_TAGS)        return snack(`Max ${MAX_TAGS} tags`, 'error');
    setTags((p) => [...p, t]);
  };

  const handleTagInput = (val) => {
    if (/[,;\n]/.test(val)) {
      const parts = val.split(/[,;\n]/);
      parts.slice(0, -1).forEach(pushTag);
      setTagInput(parts.at(-1) || '');
    } else {
      setTagInput(val);
    }
  };

  /*────────────────── estimator state ───────────────*/
  const [isEstim,  setIsEstim]  = useState(false);
  const [estimate, setEstimate] = useState(null);

  /* oversize slicing logic */
  const artifactHex = useMemo(() => char2Bytes(url), [url]);

  const metaMap = useMemo(() => {
    const clean = attrs.filter((a) => a.name && a.value);
    const mimeNorm = mimeFromFilename(file?.name || '').replace('audio/mp3', 'audio/mpeg');
    return buildMeta({
      f, attrs: clean, tags, dataUrl: '', mime: mimeNorm, shares: {},
    });
  }, [f, attrs, tags, file]);

  const metaOverhead = useMemo(() => calcExactOverhead(metaMap), [metaMap]);

  /*
   * Compute the maximum first-slice size.  The metadata overhead can
   * sometimes exceed MAX_OP_DATA_BYTES when attribute names and values
   * are very large, particularly on some browsers where unicode
   * normalisation differs.  A negative or tiny first slice causes
   * planSlices() to miscalculate, yielding dozens of unnecessary
   * batches (reportedly affecting Mac/iOS users).  Clamp to at least
   * SLICE_MIN_BYTES to ensure slices remain sensible and fees stay
   * predictable across all devices.
   */
  /*
   * Determine whether the media/metadata pair will exceed Tezos’ per‑parameter
   * limit.  The `maxFirstSliceCandidate` reserves 512 bytes of headroom on
   * top of the computed metadata overhead.  When the candidate becomes
   * negative, metadata alone cannot fit into a single call – no amount of
   * slicing will help – so we flag this with `metaOverflow` and later
   * invalidate the form.  Otherwise, we calculate `oversize` based on the
   * remaining budget; if the artifact bytes exceed this threshold we must
   * slice.  The resulting `maxFirstSlice` is clamped to `SLICE_MIN_BYTES` to
   * avoid negative or tiny values which previously caused runaway slice
   * counts on some browsers.
   */
  const oversizeThreshold = MAX_OP_DATA_BYTES - metaOverhead - 512;
  const metaOverflow      = oversizeThreshold <= 0;
  const oversize          = !metaOverflow && (artifactHex.length / 2 > oversizeThreshold);
  const maxFirstSlice     = oversize
    ? Math.max(SLICE_MIN_BYTES, oversizeThreshold)
    : 0;

  const oversizeLarge     = artifactHex.length / 2 > 100_000;

  const allSlices = useMemo(
    () => oversize ? planSlices(`0x${artifactHex}`, sliceSize, maxFirstSlice) : [],
    [oversize, artifactHex, sliceSize, maxFirstSlice],
  );

  const slice0DataUri = useMemo(
    () => oversize ? Buffer.from(allSlices[0].slice(2), 'hex').toString('utf8') : url,
    [oversize, allSlices, url],
  );

  const appendSlices = useMemo(
    () => oversize ? allSlices.slice(1) : [],
    [oversize, allSlices],
  );

  const warnMany = allSlices.length > 50;

  useEffect(() => {
    if (oversize) snack('Large file detected – multiple transactions & higher fees required', 'warning');
  }, [oversize]);

  /* Notify the user when the metadata overhead alone exceeds the
   * parameter budget.  In this situation slicing cannot help – the
   * on‑chain call would exceed the hard limit even before adding any
   * artifact bytes – so we surface an immediate error prompting the
   * creator to reduce names, descriptions, attributes or tags.  This
   * extra guard complements the standard `metadataBytes` check which
   * only measures the final metadata map.  See Validator I64.
   */
  useEffect(() => {
    if (metaOverflow) snack('Metadata overhead too large – reduce metadata length or number of attributes', 'error');
  }, [metaOverflow]);

  /* royalties shares */
  const shares = useMemo(() => {
    const o = {};
    roys.forEach(({ address, sharePct }) => {
      const pct = parseFloat(sharePct);
      if (isTezosAddress(address) && pct > 0) o[address.trim()] = Math.round(pct * 100);
    });
    return o;
  }, [roys]);

  /* metadata & bytes */
  const finalMetaMap = useMemo(() => {
    const clean = attrs.filter((a) => a.name && a.value);
    const mimeNorm = mimeFromFilename(file?.name || '').replace('audio/mp3', 'audio/mpeg');
    return buildMeta({
      f, attrs: clean, tags, dataUrl: slice0DataUri, mime: mimeNorm, shares,
    });
  }, [f, attrs, tags, slice0DataUri, file, shares]);

  const metaBytes = useMemo(() => mapSize(finalMetaMap), [finalMetaMap]);

  const forceSelf = requiresSelfRecipient(oversize, metaBytes);

  /* auto‑lock recipient when required */
  useEffect(() => {
    if (forceSelf && wallet && f.toAddress !== wallet) {
      setF((p) => ({ ...p, toAddress: wallet }));
    }
  }, [forceSelf, wallet]);          /* eslint-disable-line react-hooks/exhaustive-deps */

  const totalPct = useMemo(
    () => Object.values(shares).reduce((t, n) => t + n, 0) / 100,
    [shares],
  );

  /*──────── validation helpers ─────────────────────*/
  const baseChecks = useMemo(() => {
    const recipientOk = forceSelf
      ? wallet && f.toAddress === wallet
      : isTezosAddress(f.toAddress);

    return ({
      title:         !!f.name.trim(),
      titleAscii:    (() => { try { if (!f.name.trim()) return false; asciiPrintable(f.name); return true; } catch { return false; } })(),
      artifact:      !!url && !!file,
      recipient:     recipientOk,
      creators:      (() => {
        const arr = f.creators.split(',').map((x) => x.trim()).filter(Boolean);
        return !!arr.length && arr.every(isTezosAddress);
      })(),
      royalty:       royaltyUnder25(shares),
      editions:      (() => {
        if (contractVersion === 'v1') return true;
        const n = parseInt(f.amount || '', 10);
        return !Number.isNaN(n) && n >= 1 && n <= MAX_EDITIONS;
      })(),
      attrs:         validAttributes(attrs.filter((a) => a.name && a.value)),
      metadataBytes: !metaOverflow && (oversize || metaBytes <= MAX_META_BYTES),
      agreed:        f.agree,
    });
  }, [f, url, file, shares, contractVersion, metaBytes, oversize, attrs, forceSelf, wallet, metaOverflow]);

  /* map checklist item → state (ok | bad | warn) */
  const getState = (key) => {
    if (key === 'royalty') {
      if (!baseChecks.royalty) return 'bad';
      return totalPct === 0 ? 'warn' : 'ok';
    }
    return baseChecks[key] ? 'ok' : 'bad';
  };

  const checklist = [
    { key: 'title',         label: 'Title set' },
    { key: 'titleAscii',    label: 'Title ASCII‑clean' },
    { key: 'artifact',      label: 'Media uploaded' },
    { key: 'recipient',     label: forceSelf ? 'Recipient = wallet' : 'Recipient address valid' },
    { key: 'creators',      label: 'Creators valid' },
    { key: 'royalty',       label: `Royalties ≤ ${MAX_ROY_PCT}%` },
    { key: 'editions',      label: `Editions 1‑${MAX_EDITIONS}` },
    { key: 'attrs',         label: 'Attributes valid' },
    { key: 'metadataBytes', label: `Metadata ≤ ${MAX_META_BYTES.toLocaleString()} B` },
    { key: 'agreed',        label: 'Terms accepted' },
  ];

  const allOk = checklist.every(({ key }) => baseChecks[key]);

  /*──────── prepare & estimate ─────────────────────*/
  const prepareMint = async () => {
    if (!toolkit) return snack('Toolkit unavailable', 'error');
    if (!allOk)   return snack('Complete all required fields', 'error');

    setIsEstim(true);
    await new Promise(requestAnimationFrame);
    try {
      const packs = await buildBatches();
      setBatches(packs);

      const flat = packs.flat();
      const currentBytesList = [];
      let curr = (slice0DataUri ? char2Bytes(slice0DataUri).length / 2 : 0);
      const amt = parseInt(f.amount, 10) || 1;
      for (let i = 0; i < flat.length; i++) {
        if (flat[i].parameter.entrypoint === 'append_artifact_uri') {
          currentBytesList.push(curr);
          const appended = (flat[i].parameter.value.args[1].bytes.length / 2);
          curr += appended;
        } else {
          currentBytesList.push(0); // mint ops
          curr = (slice0DataUri ? char2Bytes(slice0DataUri).length / 2 : 0); // reset per edition
        }
      }

      const est = await estimateChunked(toolkit, flat, 1, oversizeLarge, currentBytesList);
      if (est.retrySmaller) {
        if (retryCount >= 3 || sliceSize <= SLICE_MIN_BYTES) throw new Error('Node timeout—try later');
        const newSize = Math.max(SLICE_MIN_BYTES, Math.floor(sliceSize / 2));
        setSliceSize(newSize);
        setRetryCount(retryCount + 1);
        setIsEstim(false);
        await new Promise((r) => setTimeout(r, 1000)); // brief pause
        return prepareMint(); // auto-retry with smaller slices
      }

      const feeMutez = est.fee;
      const burnMutez = est.burn > 0 ? est.burn : calcStorageMutez(
        metaBytes + META_PAD_BYTES,
        appendSlices,
        amt,
      );
      setEstimate({ feeTez: toTez(feeMutez), storageTez: toTez(burnMutez) });
    } catch (e) {
      snack(isSimTimeout(e) ? 'Node refused simulation – heuristic used' : e.message, 'warning');
      const feeMutez  = (batches?.length || 1) * μBASE_TX_FEE;
      const burnMutez = calcStorageMutez(
        metaBytes + META_PAD_BYTES,
        appendSlices,
        parseInt(f.amount, 10) || 1,
      );
      setEstimate({ feeTez: toTez(feeMutez), storageTez: toTez(burnMutez) });
    } finally { setIsEstim(false); }
  };

  /*──────── batch builder (diff‑aware) ─────────────────────*/
  const baseIdRef = useRef(0);
  const buildBatches = useCallback(async () => {
    const c = await toolkit.wallet.at(contractAddress);
    let baseId = 0;
    try {
      const st = await c.storage?.();
      baseId = Number(st?.next_token_id || 0);
    } catch {/* ignore */ }
    baseIdRef.current = baseId;

    const mintParams = {
      kind: OpKind.TRANSACTION,
      ...(await buildMintCall(
        c, contractVersion, f.amount, finalMetaMap, f.toAddress,
      ).toTransferParams() ),
    };

    const out = [[mintParams]];                     /* batch‑0 = mint */

    const amt = parseInt(f.amount, 10) || 1;
    if (appendSlices.length) {
      /* hash once per run so checkpoints stay stable */
      let digest = '';
      try {
        const buf = new TextEncoder().encode(`0x${artifactHex}`);
        const hashBuffer = await crypto.subtle.digest('SHA-256', buf);
        digest = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch { /* hashing errors ignored */ }

      for (let i = 0; i < amt; i += 1) {
        const tokenId = baseId + i;
        const cp = loadSliceCheckpoint(contractAddress, tokenId, 'artifactUri') || {};
        const startSlice = cp.next ?? 1;                  // 1‑based index
        for (let s = startSlice; s <= appendSlices.length; s += 1) {
          const hx = appendSlices[s - 1];
          out.push([{
            kind: OpKind.TRANSACTION,
            ...(c.methods.append_artifact_uri(tokenId, hx).toTransferParams()),
          }]);
        }

        /* persist / update checkpoint */
        saveSliceCheckpoint(contractAddress, tokenId, 'artifactUri', {
          total: appendSlices.length + 1,
          next: startSlice,
          hash: cp.hash || `sha256:${digest}`,
          updated: Date.now(),
        });
      }
    }
    return out;
  }, [toolkit, contractAddress, contractVersion, f.amount, finalMetaMap, f.toAddress,
      appendSlices, artifactHex]);

  /*──────── confirm‑dialog gate ───────────────────*/
  useEffect(() => {
    if (batches && estimate && confirmCount === 0) setConfirmOpen(true);
  }, [batches, estimate, confirmCount]);

  /*──────── sender loop guarded by confirmCount ──*/
  const sendBatch = useCallback(async () => {
    if (!batches || stepIdx >= batches.length) return;

    let currentIdx = stepIdx;
    /* auto‑skip satisfied append batches */
    while (currentIdx < batches.length) {
      const params = batches[currentIdx];
      const first = params[0]?.parameter;
      if (first?.entrypoint !== 'append_artifact_uri') break;     /* mint or misc */

      try {
        const tokenId = Number(first.value.args[0].int);
        const hx      = `0x${first.value.args[1].bytes}`;
        const cp      = loadSliceCheckpoint(contractAddress, tokenId, 'artifactUri');
        const already = cp && appendSlices.findIndex((s) => s === hx) < (cp.next ?? 1) - 1;
        if (!already) break;     /* needs to send */
      } catch { break; }         /* parse failure → just send */

      currentIdx += 1;           /* skip already applied slice */
    }

    if (currentIdx >= batches.length) return;      /* nothing left */

    if (currentIdx !== stepIdx) {                  /* advance silently */
      setStepIdx(currentIdx);
    }

    const params = batches[currentIdx];
    try {
      setOv({
        open: true,
        status: 'Waiting for signature…',
        step: currentIdx + 1,
        total: batches.length,
      });
      const op = await toolkit.wallet.batch(params).send();
      setOv({
        open: true,
        status: 'Broadcasting…',
        step: currentIdx + 1,
        total: batches.length,
      });
      await op.confirmation();

      /* checkpoint progress if slice append */
      const first = params[0]?.parameter;
      if (first?.entrypoint === 'append_artifact_uri') {
        try {
          const tokenId = Number(first.value.args[0].int);
          const cp = loadSliceCheckpoint(contractAddress, tokenId, 'artifactUri');
          if (cp) {
            const next = Math.min(cp.next + 1, cp.total);
            saveSliceCheckpoint(contractAddress, tokenId, 'artifactUri', { ...cp, next });
          }
        } catch {/* ignore parse errors */}
      }

      if (currentIdx + 1 === batches.length) {
        setOv({
          open: true, opHash: op.opHash,
          step: batches.length, total: batches.length,
        });
        onMutate?.();
        /* reset */
        setBatches(null); setStepIdx(0); setConfirmCount(0);
      } else {
        setStepIdx(currentIdx + 1);
      }
    } catch (e) {
      if (isSimTimeout(e) && retryCount < 3) {
        const newSize = Math.max(SLICE_MIN_BYTES, Math.floor(sliceSize / 2));
        setRetryCount(retryCount + 1);
        setSliceSize(newSize);
        setOv({ open: true, status: `Simulation timeout—retrying with ${newSize / 1000}KB slices…`, step: currentIdx + 1, total: batches.length, error: false });
        const newPacks = await buildBatches(); // rebuild with new size
        setBatches(newPacks);
        return sendBatch(); // restart loop
      }
      setOv({
        open: true, error: true, status: e.message || String(e),
        step: currentIdx + 1, total: batches.length,
      });
    }
  }, [batches, stepIdx, toolkit, onMutate, contractAddress, appendSlices, retryCount, sliceSize]);

  /* arm loop on confirm */
  useEffect(() => { if (confirmCount === 1 && batches) sendBatch(); },
    [confirmCount, batches, sendBatch]);

  /*──────── retry hook ───────────────────────────*/
  const retry = () => {
    if (!batches || !batches.length) return snack('Nothing to retry', 'error');
    sendBatch();
  };

  /* disabled‑reason string */
  const reason = isEstim
    ? 'Estimating…'
    : ov.open && !ov.error && !ov.opHash
      ? 'Please wait…'
      : !allOk ? 'Complete required fields' : '';

  return (
    <Wrap $level={$level}>
      {snackNode}

      {/* SIFR ZERO community‑mint redirect */}
      <PixelButton
        as="a"
        href="https://sifrzero.art"
        target="_blank"
        rel="noopener noreferrer"
        style={{ alignSelf: 'center', padding: '0.35rem 0.8rem', fontSize: '0.8rem' }}
      >
        Looking for the SIFR ZERO community mint?
      </PixelButton>

      <PixelHeading level={3}>Mint NFT</PixelHeading>
      <HelpBox>
        Creates new NFT(s). Fill title, upload media, royalties ≤ 
        {MAX_ROY_PCT}% then<strong> Mint NFT</strong>. Only <strong>one</strong> wallet
        address can receive the newly minted edition(s). Large files or metadata
        {'>'} 30 kB will be <em>locked</em> to your connected wallet to ensure the
        append pipeline can complete safely; you can disperse editions
        afterwards via bulk‑transfer.<br />
        Large files are chunked automatically; interrupted uploads resume
        exactly where they stopped. Estimated fees appear before signing.<br />
        <strong>Contract v4 forbids removing “mature” or “flashing” flags after
        mint</strong> – choose wisely.
      </HelpBox>

      {warnMany && <Note style={{color: 'var(--zu-warn)'}}>Warning: Large file requires ~{allSlices.length} signatures due to node limits. Total cost ~{estimate ? toTez(estimate.feeTez + estimate.storageTez) : 'calculating'} tez.</Note>}

      {/* ‑‑‑ Core fields */}
      <Grid>
        <div>
          <Note>Title *</Note>
          <PixelInput
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
        </div>
        {contractVersion !== 'v1' && (
          <div>
            <Note>Editions *</Note>
            <PixelInput
              type="number"
              min="1"
              max={MAX_EDITIONS}
              value={f.amount}
              onChange={(e) => setF({
                ...f,
                amount: e.target.value.replace(/\D/g, ''),
              })}
            />
          </div>
        )}
      </Grid>

      <div>
        <Note>Description</Note>
        <PixelInput
          as="textarea"
          rows={4}
          style={{ resize: 'vertical' }}
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
        />
      </div>

      <MintUpload onFileChange={setFile} onFileDataUrlChange={setUrl} />
      <MintPreview dataUrl={url} fileName={file?.name} />

      <PixelHeading level={5}>Addresses</PixelHeading>

      <Note>Creators (comma‑sep) *</Note>
      <PixelInput
        value={f.creators}
        onChange={(e) => setF({ ...f, creators: e.target.value })}
      />

      <Note>Authors (comma‑sep names)</Note>
      <PixelInput
        value={f.authors}
        onChange={(e) => setF({ ...f, authors: e.target.value })}
      />

      <Note>Recipient *</Note>
      <PixelInput
        value={f.toAddress}
        disabled={forceSelf}
        readOnly={forceSelf}
        title={forceSelf
          ? 'Locked to your wallet for large uploads'
          : 'Wallet that receives the mint'}
        onChange={(e) => setF({ ...f, toAddress: e.target.value })}
      />

      <PixelHeading level={5} style={{ marginTop: '.9rem' }}>
        Royalties (≤ {MAX_ROY_PCT}% total — current {totalPct}%)
      </PixelHeading>
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
            onChange={(e) => setRoy(
              i,
              'sharePct',
              e.target.value.replace(/[^0-9.]/g, ''),
            )}
          />
          {i === 0 ? (
            <PixelButton
              size="xs"
              onClick={addRoy}
              disabled={roys.length >= MAX_ROY_ENTRIES}
            >
              ＋
            </PixelButton>
          ) : (
            <PixelButton size="xs" onClick={() => delRoy(i)}>
              －
            </PixelButton>
          )}
        </RoyalRow>
      ))}

      <Grid>
        <div>
          <Note>License *</Note>
          <Select
            value={f.license}
            onChange={(e) => setF({ ...f, license: e.target.value })}
          >
            <option value="">Select</option>
            {LICENSES.map((l) => <option key={l}>{l}</option>)}
          </Select>
        </div>
      </Grid>
      {f.license === 'Custom' && (
        <div>
          <Note>Custom licence *</Note>
          <PixelInput
            as="textarea"
            rows={2}
            value={f.customLicense}
            onChange={(e) => setF({ ...f, customLicense: e.target.value })}
          />
        </div>
      )}

      <Grid>
        <div>
          <Note>NSFW *</Note>
          <Select
            value={f.nsfw}
            onChange={(e) => setF({ ...f, nsfw: e.target.value })}
          >
            <option>Does not contain NSFW</option>
            <option>Does contain NSFW</option>
          </Select>
        </div>
        <div>
          <Note>Flashing hazard *</Note>
          <Select
            value={f.flashing}
            onChange={(e) => setF({ ...f, flashing: e.target.value })}
          >
            <option>Does not contain Flashing Hazard</option>
            <option>Does contain Flashing Hazard</option>
          </Select>
        </div>
      </Grid>

      <PixelHeading level={5} style={{ marginTop: '.9rem' }}>
        Attributes
      </PixelHeading>
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
          {i === 0 ? (
            <PixelButton
              size="xs"
              onClick={addAttr}
              disabled={attrs.length >= MAX_ATTR}
            >
              ＋
            </PixelButton>
          ) : (
            <PixelButton size="xs" onClick={() => delAttr(i)}>
              －
            </PixelButton>
          )}
        </Row>
      ))}

      <Note>Tags (Enter / comma / ; / ⏎)</Note>
      <PixelInput
        ref={tagRef}
        value={tagInput}
        onChange={(e) => handleTagInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleTagInput(tagInput + '\n');
          }
        }}
        onBlur={() => handleTagInput(tagInput + '\n')}
      />
      <TagArea>
        {tags.map((t) => (
          <TagChip
            key={t}
            onClick={() => setTags((p) => p.filter((x) => x !== t))}
            onKeyDown={(e)=>{ if(e.key==='Enter'||e.key===' '){
              setTags((p)=>p.filter((x)=>x!==t)); } }}
            aria-label={`Remove tag ${t}`}
          >
            {t} ✕
          </TagChip>
        ))}
      </TagArea>

      <label style={{ fontSize: '.8rem', marginTop: '.6rem' }}>
        <input
          type="checkbox"
          checked={f.agree}
          onChange={(e) => setF({ ...f, agree: e.target.checked })}
        />
        I agree to the 
        <a href="/terms" target="_blank" rel="noopener noreferrer">
          terms & conditions
        </a>
        .
      </label>

      <Note>
        Metadata size: 
        {metaBytes.toLocaleString()}
        {' '}
        /
        {' '}
        {MAX_META_BYTES.toLocaleString()}
        {' '}
        bytes
      </Note>

      <PixelButton
        type="button"
        onClick={prepareMint}
        disabled={!!reason || !!batches}
        title={allOk ? 'Ready' : 'Complete the checklist below'}
      >
        {isEstim ? 'Estimating…' : 'Mint NFT'}
      </PixelButton>

      <ChecklistBox>
        {checklist.map(({ key, label }) => (
          <li key={key} className={getState(key)}>{label}</li>
        ))}
      </ChecklistBox>

      {confirmOpen && (
        <OperationConfirmDialog
          open
          slices={batches?.length || 1}
          estimate={estimate}
          onOk={() => { setConfirmOpen(false); setConfirmCount(1); }}
          onCancel={() => { setConfirmOpen(false); setBatches(null); }}
        />
      )}

      {ov.open && (
        <OperationOverlay
          {...ov}
          onRetry={retry}
          onCancel={() => {
            setOv({ open: false });
            setBatches(null); setStepIdx(0); setConfirmCount(0);
          }}
        />
      )}
    </Wrap>
  );
}
/* What changed & why:
   • Replaced naive oversize detection with a threshold that considers
     metadata overhead + safety headroom.  Only mark oversize when
     artifact bytes exceed the remaining budget; otherwise avoid slicing.
   • Introduced `metaOverflow` to detect when metadata overhead alone
     exceeds the Tezos parameter limit.  Emit an immediate error via
     snackbar and invalidate the form in this case.
   • Compute `maxFirstSlice` only when oversize, clamping to
     SLICE_MIN_BYTES.  Small (<1 KB) files now mint in a single
     operation without triggering spurious slices.
   • Updated baseChecks to respect metaOverflow and adjusted revision and
     summary. */
/* EOF */