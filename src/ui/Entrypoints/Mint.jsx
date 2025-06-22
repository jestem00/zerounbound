/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/Mint.jsx
  Rev :    r863   2025‑07‑23
  Summary: central‑validator sync, live hover‑checklist, lint‑clean
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
  asciiPrintable, cleanDescription,
  MAX_ATTR, MAX_ATTR_N, MAX_ATTR_V,
  MAX_TAGS, MAX_TAG_LEN,
  MAX_ROY_PCT, MAX_EDITIONS, MAX_META_BYTES,
  isTezosAddress, royaltyUnder25, validAttributes,
} from '../../core/validator.js';
import { ROOT_URL }                from '../../config/deployTarget.js';
import { SLICE_SAFE_BYTES, sliceHex } from '../../core/batch.js';
import {
  saveSliceCheckpoint, purgeExpiredSliceCache,
} from '../../utils/sliceCache.js';

import {
  estimateChunked, calcStorageMutez, μBASE_TX_FEE, toTez,
} from '../../core/feeEstimator.js';

/* polyfill for node envs / SSR */
if (typeof window !== 'undefined' && !window.Buffer) window.Buffer = Buffer;

/*──────────────── helper — RPC detector ─────────*/
const RPC_PATH = '/helpers/scripts/simulate_operation';
const isSim500 = (e) => {
  try {
    const s = typeof e === 'string' ? e : e?.message || JSON.stringify(e);
    return s.includes(RPC_PATH) && s.includes('500');
  } catch { return false; }
};

/*──────── constants ─────────────────────────────────────────*/
const META_PAD_BYTES = 1_000;                  /* estimator head‑room  */
const HEADROOM_BYTES = 1_024;                  /* slice‑0 buffer       */
const SAFE_BYTES_0   = SLICE_SAFE_BYTES - HEADROOM_BYTES;

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
const TagChip   = styled.span`
  background:var(--zu-accent-sec);padding:.12rem .45rem;font-size:.65rem;
  border-radius:.25rem;cursor:pointer;
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
  list-style:none;padding:0;margin:.4rem auto 0;font-size:.68rem;
  max-width:260px;
  li{display:flex;gap:.35rem;align-items:center;}
  li.ok::before {content:"✓";color:var(--zu-accent);}
  li.bad::before{content:"✗";color:var(--zu-accent-sec);}
`;

/*──────── helper fns ───────────────────────────────────────*/
const hex = (s = '') => `0x${Buffer.from(s, 'utf8').toString('hex')}`;

/* build Michelson map */
const buildMeta = ({ f, attrs, tags, dataUrl, mime, shares }) => {
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
    <div role="alert"
      style={{
        position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        background: '#222', color: '#fff', padding: '6px 12px', borderRadius: 4,
        fontSize: '.8rem', zIndex: 2600, cursor: 'pointer',
      }}
      onClick={() => setLocal(null)}
    >{local.message}</div>
  );
  return [api, node];
}

/*════════ component ═══════════════════════════════════════*/
export default function Mint({ contractAddress, contractVersion = 'v4',
  setSnackbar, onMutate, $level }) {
  /* slice‑cache hygiene */
  useEffect(() => { purgeExpiredSliceCache(); }, []);

  /* wallet / toolkit */
  const wc = useWalletContext() || {};
  const {
    address: wallet, toolkit: toolkitExt, mismatch, needsReveal,
  } = wc;
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
  const [tagInput, setTagInput] = useState('');
  const [file, setFile]   = useState(null);
  const [url, setUrl]     = useState('');
  const [roys, setRoys]   = useState([{ address: wallet || '', sharePct: '' }]);

  const [batches, setBatches]       = useState(null);
  const [stepIdx, setStepIdx]       = useState(0);
  const [confirmCount, setConfirmCount] = useState(0);
  const [ov, setOv]                = useState({ open: false });
  const [confirmOpen, setConfirmOpen] = useState(false);

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
    if (tags.length >= MAX_TAGS)        return snack('Max 10 tags', 'error');
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
  const oversize    = artifactHex.length / 2 > SLICE_SAFE_BYTES;

  const allSlices = useMemo(
    () => (oversize ? sliceHex(`0x${artifactHex}`, SAFE_BYTES_0) : []),
    [oversize, artifactHex],
  );

  const slice0DataUri = useMemo(
    () => (oversize ? Buffer.from(allSlices[0].slice(2), 'hex').toString('utf8') : url),
    [oversize, allSlices, url],
  );

  const appendSlices = useMemo(
    () => (oversize ? allSlices.slice(1) : []),
    [oversize, allSlices],
  );

  useEffect(() => {
    if (oversize) snack('Large file detected – multiple transactions & higher fees required', 'warning');
  }, [oversize]);

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
  const metaMap = useMemo(() => {
    const clean = attrs.filter((a) => a.name && a.value);
    return buildMeta({
      f, attrs: clean, tags, dataUrl: slice0DataUri, mime: file?.type, shares,
    });
  }, [f, attrs, tags, slice0DataUri, file, shares]);

  const metaBytes = useMemo(() => mapSize(metaMap), [metaMap]);

  const totalPct = useMemo(
    () => Object.values(shares).reduce((t, n) => t + n, 0) / 100,
    [shares],
  );

  /*──────── validation helpers ─────────────────────*/
  const baseChecks = useMemo(() => ({
    title:         !!f.name.trim(),
    titleAscii:    (() => { try { if (!f.name.trim()) return false; asciiPrintable(f.name); return true; } catch { return false; } })(),
    artifact:      !!url && !!file,
    recipient:     isTezosAddress(f.toAddress),
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
    metadataBytes: oversize || metaBytes <= MAX_META_BYTES,
    agreed:        f.agree,
  }), [f, url, file, shares, contractVersion, metaBytes, oversize, attrs]);

  const checklist = [
    { key: 'title',         label: 'Title set' },
    { key: 'titleAscii',    label: 'Title ASCII‑clean' },
    { key: 'artifact',      label: 'Media uploaded' },
    { key: 'recipient',     label: 'Recipient address valid' },
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

      const { fee, burn } = await estimateChunked(toolkit, packs.flat());

      const manualBurn = calcStorageMutez(
        metaBytes + META_PAD_BYTES,
        appendSlices,
        parseInt(f.amount, 10) || 1,
      );
      const burnFinal = burn > 0 ? burn : manualBurn;

      setEstimate({ feeTez: toTez(fee), storageTez: toTez(burnFinal) });
    } catch (e) {
      snack(isSim500(e) ? 'Node refused simulation – heuristic used' : e.message, 'warning');
      const feeMutez  = (batches?.length || 1) * μBASE_TX_FEE;
      const burnMutez = calcStorageMutez(
        metaBytes + META_PAD_BYTES,
        appendSlices,
        parseInt(f.amount, 10) || 1,
      );
      setEstimate({ feeTez: toTez(feeMutez), storageTez: toTez(burnMutez) });
    } finally { setIsEstim(false); }
  };

  /*──────── batch builder ─────────────────────────*/
  const baseIdRef = useRef(0);
  const buildBatches = useCallback(async () => {
    const c = await toolkit.wallet.at(contractAddress);
    let baseId = 0;
    try {
      const st = await c.storage?.();
      baseId = Number(st?.next_token_id || 0);
    } catch {/* ignore */}
    baseIdRef.current = baseId;

    const mintParams = {
      kind: OpKind.TRANSACTION,
      ...(await buildMintCall(c, contractVersion, f.amount, metaMap, f.toAddress).toTransferParams()),
    };

    const out = [[mintParams]];                     /* batch‑0 = mint */

    const amt = parseInt(f.amount, 10) || 1;
    if (appendSlices.length) {
      for (let i = 0; i < amt; i += 1) {
        const tokenId = baseId + i;
        appendSlices.forEach((hx) => {
          out.push([{
            kind: OpKind.TRANSACTION,
            ...(c.methods.append_artifact_uri(tokenId, hx).toTransferParams()),
          }]);
        });
      }
      /* save slice checkpoints for resumable upload */
      try {
        const fullHex = `0x${artifactHex}`;
        const buf = new TextEncoder().encode(fullHex);
        const hashBuffer = await crypto.subtle.digest('SHA-256', buf);
        const digest = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, '0')).join('');
        for (let i = 0; i < amt; i += 1) {
          const tokenId = baseId + i;
          saveSliceCheckpoint(contractAddress, tokenId, 'artifactUri', {
            total: appendSlices.length + 1,
            next: 1,
            hash: `sha256:${digest}`,
          });
        }
      } catch {/* hashing errors ignored */}
    }
    return out;
  }, [toolkit, contractAddress, contractVersion, f.amount, metaMap, f.toAddress,
      appendSlices, artifactHex]);

  /*──────── confirm‑dialog gate ───────────────────*/
  useEffect(() => {
    if (batches && estimate && confirmCount === 0) setConfirmOpen(true);
  }, [batches, estimate, confirmCount]);

  /*──────── sender loop guarded by confirmCount ──*/
  const sendBatch = useCallback(async () => {
    if (!batches || !batches.length) return;
    if (stepIdx >= batches.length)  return;

    const params = batches[stepIdx];
    try {
      setOv({ open: true, status: 'Waiting for signature…', step: stepIdx + 1, total: batches.length });
      const op = await toolkit.wallet.batch(params).send();
      setOv({ open: true, status: 'Broadcasting…', step: stepIdx + 1, total: batches.length });
      await op.confirmation();

      if (stepIdx + 1 === batches.length) {
        setOv({ open: true, opHash: op.opHash, step: batches.length, total: batches.length });
        onMutate?.();
        /* reset */
        setBatches(null); setStepIdx(0); setConfirmCount(0);
      } else {
        setStepIdx((i) => i + 1);
      }
    } catch (e) {
      setOv({
        open: true, error: true, status: e.message || String(e),
        step: stepIdx + 1, total: batches.length,
      });
    }
  }, [batches, stepIdx, toolkit, onMutate]);

  /* arm loop on confirm */
  useEffect(() => { if (confirmCount === 1 && batches) sendBatch(); }, [confirmCount, batches, sendBatch]);

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

  /*──────────────────── JSX ──────────────────────*/
  return (
    <Wrap $level={$level}>
      {snackNode}
      <PixelHeading level={3}>Mint NFT</PixelHeading>
      <HelpBox>
        Creates new NFT(s). Fill title, upload media, royalties ≤ {MAX_ROY_PCT} %, agree
        to terms, then **Mint NFT**. Large files are chunked automatically; if a slice
        fails you can resume from the banner. Estimated fees appear before signing.
      </HelpBox>

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

      {/* Description */}
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

      {/* Upload */}
      <MintUpload onFileChange={setFile} onFileDataUrlChange={setUrl} />
      <MintPreview dataUrl={url} fileName={file?.name} />

      {/* Addresses */}
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
        onChange={(e) => setF({ ...f, toAddress: e.target.value })}
      />

      {/* Royalties */}
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

      {/* License */}
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

      {/* Safety flags */}
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

      {/* Attributes */}
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

      {/* Tags */}
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
          >
            {t} ✕
          </TagChip>
        ))}
      </TagArea>

      {/* Terms & size */}
      <label style={{ fontSize: '.8rem', marginTop: '.6rem' }}>
        <input
          type="checkbox"
          checked={f.agree}
          onChange={(e) => setF({ ...f, agree: e.target.checked })}
        />
        {' '}
        I agree to the&nbsp;
        <a href="/terms" target="_blank" rel="noopener noreferrer">
          terms & conditions
        </a>
        .
      </label>

      {/* Summary & CTA */}
      <Note>Metadata size:&nbsp;
        {metaBytes.toLocaleString()} / {MAX_META_BYTES.toLocaleString()} bytes
      </Note>

      <PixelButton
        type="button"
        onClick={prepareMint}
        disabled={!!reason || !!batches}
        title={allOk ? 'Ready' : 'Complete the checklist below'}
      >
        {isEstim ? 'Estimating…' : 'Mint NFT'}
      </PixelButton>

      {/* Hover checklist */}
      {!allOk && (
        <ChecklistBox>
          {checklist.map(({ key, label }) => (
            <li key={key} className={baseChecks[key] ? 'ok' : 'bad'}>{label}</li>
          ))}
        </ChecklistBox>
      )}

      {/* confirm dialog */}
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
          mode="mint"
          status={ov.status}
          error={ov.error}
          opHash={ov.opHash}
          contractAddr={contractAddress}
          step={ov.step}
          total={ov.total}
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
   • Centralised all field guards → live checklist; CTA disabled until green.
   • Imports trimmed (removed unused validateMintFields).
   • Hover checklist (<ChecklistBox>) with ok/✗ indicators.
   • Validation thresholds now reference shared MAX_META_BYTES (32 768 B).
   • Minor lint fixes & Rev bump to r863.
*/
/* EOF */
