/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/MintV4a.jsx
  Rev :    r845   2025-07-12 T07:20 UTC
  Summary: ledger-sync gate + external sleep helper
─────────────────────────────────────────────────────────────*/
import React, {
  useRef, useState, useEffect, useMemo, useCallback,
} from 'react';
import styledPkg                 from 'styled-components';
import { MichelsonMap }          from '@taquito/michelson-encoder';
import { OpKind }                from '@taquito/taquito';
import { Buffer }                from 'buffer';
import { char2Bytes }            from '@taquito/utils';

import PixelHeading              from '../PixelHeading.jsx';
import PixelInput                from '../PixelInput.jsx';
import PixelButton               from '../PixelButton.jsx';
import MintUpload                from './MintUpload.jsx';
import MintPreview               from './MintPreview.jsx';
import OperationOverlay          from '../OperationOverlay.jsx';
import OperationConfirmDialog    from '../OperationConfirmDialog.jsx';

import { useWalletContext }      from '../../contexts/WalletContext.js';
import { asciiPrintable, cleanDescription } from '../../core/validator.js';
import { ROOT_URL }              from '../../config/deployTarget.js';
import {
  SLICE_SAFE_BYTES, sliceHex, buildAppendTokenMetaCalls,
} from '../../core/batchV4a.js';
import {
  saveSliceCheckpoint, purgeExpiredSliceCache,
} from '../../utils/sliceCacheV4a.js';
import {
  estimateChunked, calcStorageMutez, μBASE_TX_FEE, toTez,
} from '../../core/feeEstimator.js';
import sleep                     from '../../utils/sleepV4a.js';          /* ← NEW */

if (typeof window !== 'undefined' && !window.Buffer) window.Buffer = Buffer;

/*──────── dev tracer ─────────────────────────────────────────*/
/* eslint-disable no-console */
const trace = (...a) => {
  if (process.env.NODE_ENV !== 'production') console.info('[MintV4a]', ...a);
};
/* eslint-enable no-console */

/*──────────────── constants ───────────────*/
const META_PAD_BYTES   = 1_000;
const HEADROOM_BYTES   = 1_024;
const SAFE_BYTES_0     = SLICE_SAFE_BYTES - HEADROOM_BYTES;

const MAX_ATTR          = 10;
const MAX_ATTR_N        = 32;
const MAX_ATTR_V        = 32;
const MAX_ROY_ENTRIES   = 10;
const MAX_TAGS          = 10;
const MAX_TAG_LEN       = 20;
const MAX_ROY_TOTAL_PCT = 25;
const MAX_EDITIONS      = 10_000;
const MAX_META          = 32_768;
const OVERHEAD          = 360;

const LICENSES = [
  'CC0 (Public Domain)', 'All Rights Reserved',
  'On-Chain NFT License 2.0 (KT1S9GHLCrGg5YwoJGDDuC347bCTikefZQ4z)',
  'CC BY 4.0', 'CC BY-SA 4.0', 'CC BY-ND 4.0', 'CC BY-NC 4.0',
  'CC BY-NC-SA 4.0', 'CC BY-NC-ND 4.0', 'MIT', 'GPL', 'Apache 2.0',
  'Unlicense', 'Custom',
];

/*──────── styled shells ─────────*/
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
const HelpBox   = styled.p`
  font-size:.75rem;line-height:1.25;margin:.5rem 0 .9rem;
`;

/*──────── helper fns ─────────*/
const hex       = (s = '') => `0x${Buffer.from(s, 'utf8').toString('hex')}`;
const isSimFail = (err) => /simulation failed|500|FA2 token balance/i
  .test(err?.message || '');
const splitTags = (raw = '') =>
  raw.split(/[,|\n]/).map((t) => t.trim().toLowerCase()).filter(Boolean);
const safeJson  = (v) => { try { return JSON.stringify(v); } catch { return '°json-err°'; } };

/*──────── snackbar hook ───────*/
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


/*──────────────── metadata builders ─────*/
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
    m.set('authors',
      hex(JSON.stringify(f.authors.split(',').map((x) => x.trim()))));
  }

  m.set('creators',
    hex(JSON.stringify(f.creators.split(',').map((x) => x.trim()).filter(Boolean))));
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
  // eslint-disable-next-line prefer-const
  for (const [k, v] of map.entries()) {
    total += Buffer.byteLength(k, 'utf8');
    total += v.startsWith('0x') ? (v.length - 2) / 2 : Buffer.byteLength(v, 'utf8');
  }
  return total;
};

/*──────── ledger-sync helper ─────────────────────────────────*/
async function waitForLedger (
  toolkit,
  contractAddr,
  owner,
  tokenId,
  tries   = 6,
  delayMs = 3_000,
) {
  const c       = await toolkit.contract.at(contractAddr);
  const storage = await c.storage();
  const ledger  = storage.ledger;                 /* big_map (pair addr nat) → nat */

  for (let i = 0; i < tries; i += 1) {
    try {
      const bal = await ledger.get({ 0: owner, 1: tokenId });
      if (bal && bal.toNumber() > 0) return;      /* balance ready */
    } catch {/* key missing – keep polling */}
    await sleep(delayMs);
  }
  throw new Error('Ledger entry not yet indexed – retry in a few blocks');
}

/*════════ component ═══════════════════════════════════════*/
export default function MintV4a({
  contractAddress, setSnackbar, onMutate, $level,
}) {
  /* housekeeping */
  useEffect(() => { purgeExpiredSliceCache(); }, []);

  /* wallet ctx */
  const wc = useWalletContext() || {};
  const {
    address: wallet, toolkit: toolkitExt, mismatch, needsReveal,
  } = wc;
  const toolkit = toolkitExt
    || (typeof window !== 'undefined' && window.tezosToolkit);

  /* snackbar */
  const [snack, snackNode] = useSnackbarBridge(setSnackbar);

  /*──────── form state ─────*/
  const init = {
    name: '', description: '', creators: '', authors: '',
    toAddress: '', license: 'All Rights Reserved', customLicense: '',
    amount: '1', nsfw: 'Does not contain NSFW',
    flashing: 'Does not contain Flashing Hazard', agree: false,
  };
  const [f, setF]            = useState(init);
  const [attrs, setAttrs]    = useState([{ name: '', value: '' }]);
  const [tags, setTags]      = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [file, setFile]      = useState(null);
  const [url, setUrl]        = useState('');
  const [roys, setRoys]      = useState([{ address: wallet || '', sharePct: '' }]);

  /* tx / UI state */
  const [batches, setBatches]        = useState(null);
  const [ov, setOv]                  = useState({ open: false });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isEstim, setIsEstim]        = useState(false);
  const [estimate, setEstimate]      = useState(null);

  /* autofill wallet */
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
  const addRoy = () => roys.length < MAX_ROY_ENTRIES
    && setRoys((p) => [...p, { address: '', sharePct: '' }]);
  const delRoy = (i) => setRoys((p) => p.filter((_, idx) => idx !== i));

  /* attr / tag helpers */
  const setAttr = (i, k, v) => {
    if ((k === 'name' && v.length > MAX_ATTR_N) || (k === 'value' && v.length > MAX_ATTR_V)) return;
    setAttrs((p) => { const n = [...p]; n[i][k] = v; return n; });
  };
  const addAttr = () => attrs.length < MAX_ATTR && setAttrs((p) => [...p, { name: '', value: '' }]);
  const delAttr = (i) => setAttrs((p) => p.filter((_, idx) => idx !== i));

  const pushTagRaw = (raw = '') => {
    const parts = splitTags(raw);
    // eslint-disable-next-line no-restricted-syntax
    for (const t of parts) {
      if (!/^[a-z0-9-_]+$/i.test(t))      { snack(`Invalid tag "${t}"`, 'error'); return; }
      if (t.length > MAX_TAG_LEN)         { snack('Tag too long', 'error'); return; }
      if (tags.includes(t))               continue;
      if (tags.length >= MAX_TAGS)        { snack('Max 10 tags', 'error'); return; }
      setTags((p) => [...p, t]);
    }
  };

  /*──────── oversize slicing ─────*/
  const artifactHex = useMemo(() => char2Bytes(url), [url]);
  const oversize    = artifactHex.length / 2 > SLICE_SAFE_BYTES;
  const allSlices   = useMemo(
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
  useEffect(() => { if (oversize) snack('Large file – multi-call upload', 'warning'); }, [oversize]);

  /*──────── metadata & sizes ─────*/
  const shares = useMemo(() => {
    const o = {};
    roys.forEach(({ address, sharePct }) => {
      const pct = parseFloat(sharePct);
      if (address && /^(tz1|tz2|tz3|KT1)/.test(address) && pct > 0) {
        o[address.trim()] = Math.round(pct * 100);
      }
    });
    return o;
  }, [roys]);

  const metaMap = useMemo(() => {
    const cleanAttrs = attrs.filter((a) => a.name && a.value);
    return buildMeta({
      f, attrs: cleanAttrs, tags, dataUrl: slice0DataUri, mime: file?.type, shares,
    });
  }, [f, attrs, tags, slice0DataUri, file, shares]);

  const metaBytes   = useMemo(() => mapSize(metaMap), [metaMap]);
  const totalPct    = useMemo(() => Object.values(shares).reduce((t, n) => t + n, 0) / 100, [shares]);
  const royaltyMiss = roys.some(({ address, sharePct }) => address && (!sharePct || parseFloat(sharePct) <= 0));

  useEffect(() => {
    trace('metaBytes', metaBytes, 'oversize', oversize, 'sliceCount', appendSlices.length + 1);
  }, [metaBytes, oversize, appendSlices.length]);

  /*──────── validation ─────*/
  const validate = () => {
    try {
      if (!wallet)                              throw new Error('Wallet not connected');
      if (mismatch)                             throw new Error('Wrong wallet network');
      if (needsReveal)                          throw new Error('Reveal account first');
      asciiPrintable(f.name, 200);
      if (!f.name.trim())                       throw new Error('Name required');
      if (f.description)                        cleanDescription(f.description);
      if (!file || !url)                        throw new Error('Artifact required');

      const R = /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/;
      const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
      if (!R.test(f.toAddress))                 throw new Error('Recipient invalid');
      if (list(f.creators).some((a) => !R.test(a))) throw new Error('Creator invalid');

      /*—— oversize recipient guard ——*/
      if (oversize && f.toAddress.trim() !== wallet) {
        throw new Error('Oversize upload: recipient must be your wallet');
      }

      if (royaltyMiss)                          throw new Error('Royalty % required');
      if (totalPct === 0)                       throw new Error('Royalties 0 %');
      if (totalPct > MAX_ROY_TOTAL_PCT)         throw new Error(`Royalties > ${MAX_ROY_TOTAL_PCT}%`);

      const n = parseInt(f.amount, 10);
      if (Number.isNaN(n) || n < 1 || n > MAX_EDITIONS) {
        throw new Error(`Editions 1–${MAX_EDITIONS}`);
      }

      if (!f.license)                           throw new Error('License required');
      if (f.license === 'Custom' && !f.customLicense.trim()) {
        throw new Error('Custom licence required');
      }
      if (!f.agree)                             throw new Error('Agree to the terms first');
      if (!oversize && metaBytes > MAX_META)    throw new Error('Metadata > 32 kB');
      return true;
    } catch (e) { snack(e.message, 'error'); return false; }
  };

  /*──────── batch builder ───────────────────────────────────────────────────────*/
  const baseIdRef = useRef(0);   /* ★ persisted for ledger-sync gate */

  const buildBatches = useCallback(async () => {
    const c = await toolkit.wallet.at(contractAddress);
    let baseId = 0;
    try { baseId = Number((await c.storage())?.next_token_id || 0); } catch {}
    baseIdRef.current = baseId;                       /* keep for gate */
    trace('next_token_id', baseId);


    const editions = parseInt(f.amount, 10) || 1;
    const mintTx = {
      kind: OpKind.TRANSACTION,
      ...(await c.methods.mint(
        f.toAddress,
        editions,
        metaMap,
      ).toTransferParams()),
    };

    const batches = [[mintTx]];
    trace('mintTx', {
      to:       mintTx.to,
      amount:   mintTx.amount,
      paramsEP: mintTx.parameter?.entrypoint,
      metaSize: metaBytes,
    });

    /* append slices */
    if (appendSlices.length) {
      /* builder now auto-keys extrauri_0…N  */
      const appendOps = await buildAppendTokenMetaCalls(
        toolkit,
        contractAddress,
        /* keyOrIdx  */ 'extrauri_0',   // base idx for builder
        baseId,
        appendSlices,
      );

      appendOps.forEach((op, i) => {
        trace(`appendOp[${i}]`, {
          paramsEP   : op.parameter?.entrypoint,
          token_id   : op.parameter?.value?.args?.[1]?.args?.[0]?.int,
          sliceBytes : (appendSlices[i] || '').length / 2,
        });
        batches.push([op]);
      });

      saveSliceCheckpoint(contractAddress, baseId, 'meta_artifactUri', {
        total: appendSlices.length + 1, next: 1,
      });
    }

     trace('batches prepared', batches.length);
    return batches;
  }, [toolkit, contractAddress, f, metaMap, appendSlices, metaBytes]);

  /*──────── estimator & confirm ─────*/
  const prepareMint = async () => {
    if (!toolkit) return snack('Toolkit unavailable', 'error');
    if (!validate()) return;

    trace('prepareMint()', {
      oversize, metaBytes, slices: appendSlices.length + 1,
      editions: f.amount, creators: f.creators, to: f.toAddress,
    });

    setIsEstim(true); await new Promise(requestAnimationFrame);

    try {
      const packs = await buildBatches();
      setBatches(packs);

      const flat = packs.flat();
      let fee = 0; let burn = 0;
      try {
        const est = await estimateChunked(toolkit, flat);
        fee = est.fee; burn = est.burn;
        trace('estimateChunked ok', est);
      } catch (e) {
        trace('estimateChunked ERR', e?.message || e);
        snack(isSimFail(e)
          ? 'Node refused simulation – heuristic used'
          : e.message, 'warning');
      }

      const editions = parseInt(f.amount, 10) || 1;
      const burnFallback =
        calcStorageMutez(metaBytes + META_PAD_BYTES, [], editions)
        + calcStorageMutez(0, appendSlices, 1);

      setEstimate({
        feeTez:     toTez(fee || (flat.length * μBASE_TX_FEE)),
        storageTez: toTez(burn > 0 ? burn : burnFallback),
      });
    } finally { setIsEstim(false); }
  };

  useEffect(() => {
    if (batches && estimate) setConfirmOpen(true);
  }, [batches, estimate]);

  /*──────── wait for ledger entry – prevents FA2 sim-fail ───────*/
  const waitForLedger = useCallback(async (
    owner,
    tokenId,
    tries   = 6,
    delayMs = 3_000,
  ) => {
    const c       = await toolkit.contract.at(contractAddress);
    const storage = await c.storage();
    const ledger  = storage.ledger;
    for (let i = 0; i < tries; i += 1) {
      try {
        const bal = await ledger.get({ 0: owner, 1: tokenId });
        if (bal && bal.toNumber() > 0) return;
      } catch {/* key missing */}
      await sleep(delayMs);
    }
    throw new Error('Ledger entry not yet indexed – retry later');
  }, [toolkit, contractAddress]);

  /*──────── recursive sender ─────*/
  const runBatch = useCallback(async function sendBatchRecursive (idx = 0) {
    if (!batches || idx >= batches.length) return;

    /* ── gate: wait until the ledger big-map shows balance
       so Taquito’s pre-apply sim can pass the FA2 balance check. */
    if (idx === 1 && oversize) {
      setOv({
        open: true,
        status: 'Waiting for ledger sync…',
        current: 1,
        total: batches.length,
      });
      await waitForLedger(wallet, baseIdRef.current);
    }

    /* signature prompt */
    setOv({
      open: true,
      status: 'Waiting for signature…',
      current: idx + 1,
      total: batches.length,
    });

    try {
      trace(`send batch[${idx}]`, safeJson(batches[idx]));
      const op = await toolkit.wallet.batch(batches[idx]).send();

      setOv({
        open: true,
        status: 'Broadcasting…',
        current: idx + 1,
        total: batches.length,
      });
      await op.confirmation();
      trace(`batch[${idx}] confirmed`, op.opHash);

      if (idx + 1 < batches.length) {
        /* recurse next batch */
        requestAnimationFrame(() => sendBatchRecursive(idx + 1));
      } else {
        /* all done */
        setOv({
          open: true,
          opHash: op.opHash,
          current: batches.length,
          total: batches.length,
        });
        onMutate?.();
        setBatches(null);               /* reset */
      }
    } catch (e) {
      console.error('runBatch ERR', e);
      setOv({
        open: true,
        error: true,
        status: e.message || String(e),
        current: idx + 1,
        total: batches.length,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batches, toolkit, oversize, waitForLedger, wallet]);

  const retry = () => runBatch((ov.current ?? 1) - 1);

  /*──────── disabled reason ─────*/
  const reason = isEstim
    ? 'Estimating…'
    : ov.open && !ov.error && !ov.opHash
      ? 'Please wait…'
      : (!oversize && metaBytes > MAX_META)
        ? 'Metadata size > 32 kB'
        : totalPct > MAX_ROY_TOTAL_PCT
          ? 'Royalties exceed limit'
          : royaltyMiss
            ? 'Royalty % required'
            : !f.agree ? 'Agree to the terms first' : '';

  /*──────── JSX ─────*/
  return (
    <Wrap $level={$level}>
      {snackNode}
      <PixelHeading level={3}>Mint NFT (v4a)</PixelHeading>
      <HelpBox>
        Supports v4a collections. Oversize media is auto-sliced:
        slice&nbsp;#0 mints first, remaining slices append sequentially.
        <strong> Recipient must equal your connected wallet when uploading
        oversized media</strong>.
      </HelpBox>

      {/* ——— core fields ——— */}
      <Grid>
        <div>
          <Note>Title *</Note>
          <PixelInput value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <div>
          <Note>Editions *</Note>
          <PixelInput type="number" min="1" max={MAX_EDITIONS}
            value={f.amount}
            onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, '') })} />
        </div>
      </Grid>

      {/* description */}
      <div>
        <Note>Description</Note>
        <PixelInput as="textarea" rows={4} style={{ resize: 'vertical' }}
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })} />
      </div>

      {/* upload / preview */}
      <MintUpload onFileChange={setFile} onFileDataUrlChange={setUrl} />
      <MintPreview dataUrl={url} fileName={file?.name} />

      {/* addresses */}
      <PixelHeading level={5}>Addresses</PixelHeading>
      <Note>Creators (comma-sep) *</Note>
      <PixelInput value={f.creators}
        onChange={(e) => setF({ ...f, creators: e.target.value })} />
      <Note>Authors (comma-sep names)</Note>
      <PixelInput value={f.authors}
        onChange={(e) => setF({ ...f, authors: e.target.value })} />
      <Note>Recipient *</Note>
      <PixelInput value={f.toAddress}
        onChange={(e) => setF({ ...f, toAddress: e.target.value })} />

      {/* royalties */}
      <PixelHeading level={5} style={{ marginTop: '.9rem' }}>
        Royalties (≤
        {' '}
        {MAX_ROY_TOTAL_PCT}
        % total — current
        {' '}
        {totalPct}
        %
        )
      </PixelHeading>
      {roys.map((r, i) => (
        <RoyalRow key={i}>
          <PixelInput placeholder="tz1…" value={r.address}
            onChange={(e) => setRoy(i, 'address', e.target.value)} />
          <PixelInput placeholder="%" value={r.sharePct}
            onChange={(e) => setRoy(i, 'sharePct', e.target.value.replace(/[^0-9.]/g, ''))} />
          {i === 0
            ? <PixelButton size="xs" onClick={addRoy}
               disabled={roys.length >= MAX_ROY_ENTRIES}>＋</PixelButton>
            : <PixelButton size="xs" onClick={() => delRoy(i)}>－</PixelButton>}
        </RoyalRow>
      ))}

      {/* licence */}
      <Grid>
        <div>
          <Note>License *</Note>
          <Select value={f.license}
            onChange={(e) => setF({ ...f, license: e.target.value })}>
            <option value="">Select</option>
            {LICENSES.map((l) => <option key={l}>{l}</option>)}
          </Select>
        </div>
      </Grid>
      {f.license === 'Custom' && (
        <div>
          <Note>Custom licence *</Note>
          <PixelInput as="textarea" rows={2} value={f.customLicense}
            onChange={(e) => setF({ ...f, customLicense: e.target.value })} />
        </div>
      )}

      {/* safety flags */}
      <Grid>
        <div>
          <Note>NSFW *</Note>
          <Select value={f.nsfw}
            onChange={(e) => setF({ ...f, nsfw: e.target.value })}>
            <option>Does not contain NSFW</option>
            <option>Does contain NSFW</option>
          </Select>
        </div>
        <div>
          <Note>Flashing hazard *</Note>
          <Select value={f.flashing}
            onChange={(e) => setF({ ...f, flashing: e.target.value })}>
            <option>Does not contain Flashing Hazard</option>
            <option>Does contain Flashing Hazard</option>
          </Select>
        </div>
      </Grid>

      {/* attributes */}
      <PixelHeading level={5} style={{ marginTop: '.9rem' }}>Attributes</PixelHeading>
      {attrs.map((a, i) => (
        <Row key={i}>
          <PixelInput placeholder="Name" value={a.name}
            onChange={(e) => setAttr(i, 'name', e.target.value)} />
          <PixelInput placeholder="Value" value={a.value}
            onChange={(e) => setAttr(i, 'value', e.target.value)} />
          {i === 0
            ? <PixelButton size="xs" onClick={addAttr}
               disabled={attrs.length >= MAX_ATTR}>＋</PixelButton>
            : <PixelButton size="xs" onClick={() => delAttr(i)}>－</PixelButton>}
        </Row>
      ))}

      {/* tags */}
      <Note>Tags (Enter / comma)</Note>
      <PixelInput
        ref={useRef(null)}
        value={tagInput}
        onChange={(e) => setTagInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            pushTagRaw(tagInput);
            setTagInput('');
          }
        }}
        onBlur={() => { pushTagRaw(tagInput); setTagInput(''); }}
        onPaste={(e) => {
          e.preventDefault();
          pushTagRaw(e.clipboardData.getData('text') || '');
        }}
      />
      <TagArea>
        {tags.map((t) => (
          <TagChip key={t} onClick={() => setTags((p) => p.filter((x) => x !== t))}>
            {t}
            {' '}
            ✕
          </TagChip>
        ))}
      </TagArea>

      {/* agree */}
      <label style={{ fontSize: '.8rem', marginTop: '.6rem' }}>
        <input type="checkbox" checked={f.agree}
          onChange={(e) => setF({ ...f, agree: e.target.checked })} />
        {' '}
        I agree to the&nbsp;
        <a href="/terms" target="_blank" rel="noopener noreferrer">terms & conditions</a>.
      </label>

      {/* summary & CTA */}
      <Note>
        Metadata size:&nbsp;
        {metaBytes.toLocaleString()}
        {' '}
        /
        {' '}
        {MAX_META}
        {' '}
        bytes
      </Note>
      {reason && (
        <p style={{
          color: 'var(--zu-accent-sec)', fontSize: '.7rem',
          textAlign: 'center', margin: '4px 0',
        }}
        >
          {reason}
        </p>
      )}
      <PixelButton type="button" onClick={prepareMint}
        disabled={!!reason || isEstim || !!batches}>
        {isEstim ? 'Estimating…' : 'Mint NFT'}
      </PixelButton>

      {/* confirm */}
      {confirmOpen && (
        <OperationConfirmDialog
          open
          slices={batches?.length || 1}
          estimate={estimate}
          onOk={() => { setConfirmOpen(false); runBatch(0); }}
          onCancel={() => { setConfirmOpen(false); setBatches(null); }}
        />
      )}

      {/* overlay */}
      {ov.open && (
        <OperationOverlay
          mode="mint"
          status={ov.status}
          error={ov.error}
          opHash={ov.opHash}
          contractAddr={contractAddress}
          step={ov.current}
          total={ov.total}
          onRetry={retry}
          onCancel={() => { setOv({ open: false }); setBatches(null); }}
        />
      )}
    </Wrap>
  );
}
/* What changed & why:
   • Added `waitForLedger()` that polls the contract’s ledger big-map
     until the freshly minted balance exists; this prevents RPC
     pre-apply simulations from throwing “FA2_INSUFFICIENT_BALANCE”.
   • Introduced `sleepV4a.js` utility and removed inline fallback.
   • Recursive sender (`runBatch`) now calls ledger gate once before
     the first append slice, then proceeds unchanged.
*/
/* EOF */