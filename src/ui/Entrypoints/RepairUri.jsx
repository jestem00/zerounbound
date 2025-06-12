/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/RepairUri.jsx
  Rev :    r613   2025-06-16
  Summary: • Switched to *manual* fee estimator (parity with
             AppendArtifactUri) – fixes 0 ꜩ bug.
           • `estimate` kept in local state, no useTxEstimate hook.
           • preparing→false moved into finally{} block — spinner UX.
──────────────────────────────────────────────────────────────*/
import React, {
  useCallback, useEffect, useMemo, useState,
}                         from 'react';
import { Buffer }         from 'buffer';
import styledPkg          from 'styled-components';
import { OpKind }         from '@taquito/taquito';
import { char2Bytes }     from '@taquito/utils';

import PixelHeading       from '../PixelHeading.jsx';
import PixelInput         from '../PixelInput.jsx';
import PixelButton        from '../PixelButton.jsx';
import MintUpload         from './MintUpload.jsx';
import OperationOverlay   from '../OperationOverlay.jsx';
import OperationConfirmDialog from '../OperationConfirmDialog.jsx';
import PixelConfirmDialog from '../PixelConfirmDialog.jsx';
import TokenMetaPanel     from '../TokenMetaPanel.jsx';
import RenderMedia        from '../../utils/RenderMedia.jsx';

import { splitPacked, sliceHex, PACKED_SAFE_BYTES } from '../../core/batch.js';
import {
  loadSliceCache, saveSliceCache,
  clearSliceCache, purgeExpiredSliceCache,
  strHash,
}                         from '../../utils/sliceCache.js';
import { jFetch }         from '../../core/net.js';
import { useWalletContext } from '../../contexts/WalletContext.js';
import { TZKT_API }       from '../../config/deployTarget.js';
import { listUriKeys }    from '../../utils/uriHelpers.js';

const styled   = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap     = styled.section`margin-top:1.5rem;`;
const SelectBox = styled.div`position:relative;flex:1;`;
const Spinner   = styled.img.attrs({ src: '/sprites/loading16x16.gif', alt: '' })`
  position:absolute;top:8px;right:8px;width:16px;height:16px;
  image-rendering:pixelated;
`;
const HelpBox   = styled.p`
  font-size:.7rem;line-height:1.35;margin:.6rem 0 1rem;
  background:rgba(255,255,255,.06);padding:.6rem;border:1px solid #444;
`;

const API     = `${TZKT_API}/v1`;
const hex2str = (h) => Buffer.from(h.replace(/^0x/, ''), 'hex').toString('utf8');

/* prefix-diff – falls back to slice-wise diff when prefix check fails */
const diffSlices = (origHex = '', nextHex = '') => {
  if (!origHex || !nextHex || origHex === nextHex) return [];
  const bodyO = origHex.slice(2);
  const bodyN = nextHex.slice(2);
  if (bodyN.startsWith(bodyO)) {
    const tail = bodyN.slice(bodyO.length);
    return tail ? sliceHex(`0x${tail}`) : [];
  }
  const a = sliceHex(origHex);
  const b = sliceHex(nextHex);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return b.slice(i);
};

/*════════ component ═══════════════════════════════════════*/
export default function RepairUri({
  contractAddress,
  setSnackbar = () => {},
  onMutate    = () => {},
  $level,
}) {
  const { toolkit } = useWalletContext() || {};
  const snack = (m, s = 'info') => setSnackbar({ open: true, message: m, severity: s });

  /*──────── token list ───────────────────────────────────*/
  const [tokOpts, setTokOpts]   = useState([]);
  const [loadingTok, setLoadingTok] = useState(false);

  const fetchTokens = useCallback(async () => {
    if (!contractAddress) return;
    setLoadingTok(true);
    const seen = new Set();
    const push = (arr) => arr.forEach((n) => Number.isFinite(n) && seen.add(n));

    try {
      const rows = await jFetch(`${API}/tokens?contract=${contractAddress}&select=tokenId&limit=10000`);
      push(rows.map((r) => +r.tokenId));
    } catch {}
    if (!seen.size) {
      try {
        const rows = await jFetch(`${API}/contracts/${contractAddress}/bigmaps/token_metadata/keys?limit=10000`);
        push(rows.map((r) => +r.key));
      } catch {}
    }
    setTokOpts([...seen].sort((a, b) => a - b));
    setLoadingTok(false);
  }, [contractAddress]);

  useEffect(() => { void fetchTokens(); }, [fetchTokens]);

  /*──────── local state ─────────────────────────────────*/
  const [tokenId, setTokenId] = useState('');
  const [file, setFile]       = useState(null);
  const [dataUrl, setDataUrl] = useState('');
  const [meta, setMeta]       = useState(null);

  const [origHex, setOrigHex] = useState('');
  const [diff, setDiff]       = useState([]);

  const [preparing, setPreparing] = useState(false);
  const [batches, setBatches]     = useState(null);
  const [estimate, setEstimate]   = useState(null);
  const [armed, setArmed]         = useState(false);
  const [sliceIdx, setSliceIdx]   = useState(0);

  const [overlay, setOverlay]     = useState({ open: false });
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [resume, setResume]       = useState(null);

  /*──────── meta fetch ────────────────────────────────*/
  const loadMeta = useCallback(async (id) => {
    setMeta(null); setOrigHex(''); setDiff([]); setFile(null); setDataUrl('');
    if (!contractAddress || id === '') return;

    const primary = () => jFetch(`${API}/tokens?contract=${contractAddress}&tokenId=${id}&limit=1`);
    const bm      = () => jFetch(`${API}/contracts/${contractAddress}/bigmaps/token_metadata/keys/${id}`);

    let rows = [];
    try { rows = await primary(); } catch {}
    if (!rows.length) {
      try { const one = await bm(); if (one?.value) rows = [{ metadata: JSON.parse(hex2str(one.value)) }]; } catch {}
    }

    const m = rows[0]?.metadata || {};
    setMeta(m);
    const uriKey = listUriKeys(m).find((k) => /artifacturi/i.test(k));
    if (uriKey) setOrigHex(`0x${char2Bytes(m[uriKey])}`);
    else snack('No artifactUri found on-chain', 'error');
  }, [contractAddress]);

  useEffect(() => { void loadMeta(tokenId); }, [tokenId, loadMeta]);

  /*──────── file diff build ───────────────────────────*/
  useEffect(() => {
    if (!file) { setDataUrl(''); setDiff([]); return; }

    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target.result;
      setDataUrl(url);
      const newHex = `0x${char2Bytes(url)}`;
      const tail   = diffSlices(origHex, newHex);
      if (!tail.length) {
        snack('Uploaded file already matches on-chain data', 'success');
        return;
      }
      setDiff(tail);
    };
    reader.readAsDataURL(file);
  }, [file, origHex]);   // eslint-disable-line react-hooks/exhaustive-deps

  /*──────── resume cache ──────────────────────────────*/
  useEffect(() => { purgeExpiredSliceCache(1); }, []);
  useEffect(() => {
    if (!tokenId) return;
    const c = loadSliceCache(contractAddress, tokenId, 'repair');
    if (c) setResume(c);
  }, [contractAddress, tokenId]);

  /*──────── builder & estimator ───────────────────────*/
  const buildAndEstimate = async () => {
    if (!toolkit)     return snack('Wallet not connected', 'error');
    if (!diff.length) return snack('No difference to append', 'error');

    setPreparing(true);
    try {
      const c = await toolkit.wallet.at(contractAddress);
      const idNat = +tokenId;
      const flat = diff.map((hx) => ({
        kind: OpKind.TRANSACTION,
        ...c.methods.append_artifact_uri(idNat, hx).toTransferParams(),
      }));

      /* fee estimator (identical logic to AppendArtifactUri) */
      const estArr = await toolkit.estimate.batch(flat.map((p) => ({
        kind: OpKind.TRANSACTION, ...p,
      })));
      const feeMutez     = estArr.reduce((t, e) => t + e.suggestedFeeMutez, 0);
      const storageMutez = estArr.reduce((t, e) => t + e.burnFeeMutez, 0);
      setEstimate({
        feeTez:     (feeMutez     / 1e6).toFixed(6),
        storageTez: (storageMutez / 1e6).toFixed(6),
      });

      const packs = await splitPacked(toolkit, flat, PACKED_SAFE_BYTES);
      setBatches(packs);
    } catch (e) {
      snack(e.message, 'error');
    } finally {
      setPreparing(false);
    }
  };

  /*──────── TX loop ───────────────────────────────────*/
  const runSlice = useCallback(async () => {
    if (!armed || !batches || sliceIdx >= batches.length) return;
    const params = batches[sliceIdx];
    setOverlay({
      open: true, status: 'Waiting for signature…',
      current: sliceIdx + 1, total: batches.length,
    });
    try {
      const op = await toolkit.wallet.batch(params).send();
      setOverlay({
        open: true, status: 'Broadcasting…',
        current: sliceIdx + 1, total: batches.length,
      });
      await op.confirmation();

      if (sliceIdx + 1 === batches.length) {
        clearSliceCache(contractAddress, tokenId, 'repair');
        setOverlay({
          open: true, opHash: op.opHash,
          current: batches.length, total: batches.length,
        });
        onMutate();
        /* reset */
        setArmed(false); setBatches(null); setSliceIdx(0);
        setDiff([]); setFile(null); setDataUrl(''); setResume(null);
      } else {
        const nextIdx = sliceIdx + 1;
        saveSliceCache(contractAddress, tokenId, 'repair', {
          hash: strHash(origHex + diff.join('')), nextIdx,
        });
        setSliceIdx(nextIdx);
      }
    } catch (e) {
      setOverlay({
        open: true, error: e.message || String(e),
        current: sliceIdx + 1, total: batches.length,
      });
    }
  }, [armed, batches, sliceIdx, toolkit,
      contractAddress, tokenId, origHex, diff, onMutate]);

  useEffect(() => { if (armed) void runSlice(); }, [armed, sliceIdx, runSlice]);

  /*──────── handlers ─────────────────────────────────*/
  const startRepair = () => { void buildAndEstimate(); };
  const resumeRepair = () => {
    if (!resume) return;
    setBatches(null); setArmed(false); setSliceIdx(resume.nextIdx || 0);
    void buildAndEstimate();
  };

  /*──────── UI flags ─────────────────────────────────*/
  const disabled = loadingTok || preparing
    || tokenId === '' || !file || !diff.length;

  /*──────── JSX ─────────────────────────────────────*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Repair URI</PixelHeading>

      <div style={{ display: 'flex', gap: '.6rem' }}>
        <PixelInput
          placeholder="Token-ID"
          style={{ flex: 1 }}
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value.replace(/\D/g, ''))}
        />
        <SelectBox>
          <select
            style={{ width: '100%', height: 32 }}
            disabled={loadingTok}
            value={tokenId || ''}
            onChange={(e) => setTokenId(e.target.value)}
          >
            <option value="">
              {loadingTok ? 'Loading…'
                          : tokOpts.length ? 'Select token' : '— none —'}
            </option>
            {tokOpts.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
          {loadingTok && <Spinner />}
        </SelectBox>
      </div>

      <HelpBox>
        ① Pick the broken token &nbsp;→&nbsp; ② Upload the correct file.<br/>
        We append only the missing tail bytes – oversized blobs will prompt
        several sequential wallet signatures.
      </HelpBox>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between',
      }}>
        <div style={{ flex: '0 1 46%', minWidth: 210 }}>
          <MintUpload onFileChange={setFile} accept="*/*" />
          {dataUrl && (
            <RenderMedia
              uri={dataUrl}
              alt={file?.name}
              style={{ width: '100%', maxHeight: 200, margin: '6px auto',
                       objectFit: 'contain' }}
            />
          )}
        </div>
        <div style={{ flex: '0 1 48%', minWidth: 240 }}>
          <TokenMetaPanel meta={meta} tokenId={tokenId} />
        </div>
      </div>

      {resume && !file && (
        <p style={{ fontSize: '.75rem', color: 'var(--zu-accent)', marginTop: 8 }}>
          In-progress upload ({resume.nextIdx ?? 0} / ?) –
          <PixelButton size="xs" style={{ marginLeft: 6 }} onClick={resumeRepair}>
            Resume
          </PixelButton>
        </p>
      )}

      <div style={{
        display: 'flex', gap: '.6rem', alignItems: 'center', marginTop: '.9rem',
      }}>
        <PixelButton disabled={disabled} onClick={startRepair}>
          Compare & Repair
        </PixelButton>
        {preparing && (
          <>
            <Spinner style={{ position: 'static' }} />
            <span style={{ fontSize: '.7rem' }}>Calculating…</span>
          </>
        )}
      </div>

      {/* confirm */}
      {confirmOpen && (
        <OperationConfirmDialog
          open
          slices={batches?.length || 1}
          estimate={estimate}
          onOk={() => { setConfirmOpen(false); setArmed(true); void runSlice(); }}
          onCancel={() => { setConfirmOpen(false); }}
        />
      )}

      {/* overlay */}
      {overlay.open && (
        <OperationOverlay
          {...overlay}
          onRetry={() => runSlice()}
          onCancel={() => { setOverlay({ open: false }); setArmed(false); }}
        />
      )}

      <PixelConfirmDialog open={false}/>
    </Wrap>
  );
}
/* EOF */
