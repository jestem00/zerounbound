/*Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/AppendTokenMetadatav4a.jsx
  Rev :    r818   2025-07-19
  Summary: diff‑scan, JSON guard, v4a resume, I86‑I87 compliant */
import React, {
  useCallback, useEffect, useMemo, useState,
} from 'react';
import { Buffer }          from 'buffer';
import styledPkg           from 'styled-components';
import { char2Bytes }      from '@taquito/utils';
import { OpKind }          from '@taquito/taquito';

import PixelHeading        from '../PixelHeading.jsx';
import PixelInput          from '../PixelInput.jsx';
import PixelButton         from '../PixelButton.jsx';
import LoadingSpinner      from '../LoadingSpinner.jsx';
import OperationOverlay    from '../OperationOverlay.jsx';
import OperationConfirmDialog from '../OperationConfirmDialog.jsx';

import { useWalletContext } from '../../contexts/WalletContext.js';
import listLiveTokenIds     from '../../utils/listLiveTokenIds.js';
import {
  sliceHex, splitPacked, PACKED_SAFE_BYTES,
} from '../../core/batchV4a.js';
import {
  loadSliceCheckpoint, saveSliceCheckpoint,
  clearSliceCheckpoint, purgeExpiredSliceCache,
} from '../../utils/sliceCacheV4a.js';
import { estimateChunked }  from '../../core/feeEstimator.js';
import { jFetch }           from '../../core/net.js';
import { TZKT_API }         from '../../config/deployTarget.js';

/*──────── styled shells ─────*/
const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Wrap       = styled.section`margin-top:1.5rem;`;
const SelectBox  = styled.div`flex:1;position:relative;`;
const Spinner    = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;
`;
const Note   = styled.p`font-size:.7rem;margin:.35rem 0 .2rem;opacity:.8;`;
const Help   = styled.p`font-size:.75rem;line-height:1.25;margin:.5rem 0 .9rem;`;

/*──────── helpers ─────*/
const API = `${TZKT_API}/v1`;
const hex2str = (h) =>
  Buffer.from(h.replace(/^0x/, ''), 'hex').toString('utf8');
const isJson  = (s) => /^[\[{]/.test(s.trim());

/*════════ component ════════════════════════════════════════*/
export default function AppendTokenMetadatav4a({
  contractAddress,
  setSnackbar = () => {},
  onMutate    = () => {},
  $level,
}) {
  const { toolkit } = useWalletContext() || {};
  const snack = (m, s = 'info') =>
    setSnackbar({ open:true, message:m, severity:s });

  /*──────── token list ─────*/
  const [tokOpts, setTokOpts]       = useState([]);
  const [loadingTok, setLoadingTok] = useState(false);
  const fetchTokens = useCallback(async () => {
    if (!contractAddress) return;
    setLoadingTok(true);
    setTokOpts(await listLiveTokenIds(contractAddress, undefined, true));
    setLoadingTok(false);
  }, [contractAddress]);
  useEffect(() => { void fetchTokens(); }, [fetchTokens]);

  /*──────── local state ─────*/
  const [tokenId, setTokenId] = useState('');
  const [metaKey, setMetaKey] = useState('');
  const [value, setValue]     = useState('');

  /* existing value diff‑scan */
  const [exists, setExists] = useState(null);
  useEffect(() => { setExists(null); }, [tokenId, metaKey]);

  useEffect(() => {
    if (!contractAddress || tokenId === '' || !metaKey.trim()) return;
    (async () => {
      try {
        const rows = await jFetch(
          `${API}/tokens?contract=${contractAddress}&tokenId=${tokenId}&limit=1`,
        ).catch(() => []);
        const meta = rows[0]?.metadata || {};
        setExists(meta[metaKey] ?? null);
      } catch {/* ignore */}
    })();
  }, [contractAddress, tokenId, metaKey]);

  /*──────── slice build ─────*/
  const fullHex = useMemo(() => (value.trim()
    ? `0x${char2Bytes(value)}`
    : ''), [value]);

  const slices = useMemo(() => (
    fullHex && fullHex.length / 2 > 30_000 ? sliceHex(fullHex) : fullHex ? [fullHex] : []
  ), [fullHex]);

  /*──────── slice‑cache housekeeping ─────*/
  const [resume, setResume] = useState(null);
  useEffect(() => { purgeExpiredSliceCache(); }, []);
  useEffect(() => {
    if (!tokenId || !metaKey) { setResume(null); return; }
    setResume(loadSliceCheckpoint(contractAddress, tokenId, `meta_${metaKey}`));
  }, [contractAddress, tokenId, metaKey]);

  /*──────── estimator & batch state ─────*/
  const [estimating, setEstimating] = useState(false);
  const [estimate,   setEstimate]   = useState(null);
  const [batches,    setBatches]    = useState(null);
  const [confirm,    setConfirm]    = useState(false);
  const [ov,         setOv]         = useState({ open:false });

  /*──────── builders ─────*/
  const buildFlat = useCallback(async (startIdx = 0) => {
    const idNat = +tokenId;
    const c     = await toolkit.wallet.at(contractAddress);
    return slices.slice(startIdx).map((hx) => ({
      kind: OpKind.TRANSACTION,
      ...c.methods.append_token_metadata(metaKey, idNat, hx).toTransferParams(),
    }));
  }, [toolkit, contractAddress, metaKey, tokenId, slices]);

  /*──────── JSON guard (I87) ─────*/
  const jsonOk = useMemo(() => {
    if (!isJson(value)) return true;            /* raw string mode */
    try { JSON.parse(value); return true; } catch { return false; }
  }, [value]);

  /*──────── prepare upload ─────*/
  const prep = async (startIdx = 0) => {
    if (!toolkit) return snack('Connect wallet', 'error');
    if (!metaKey.trim()) return snack('Key required', 'error');
    if (!value.trim())   return snack('Value required', 'error');
    if (!jsonOk)         return snack('Invalid JSON', 'error');

    /* duplicate guard */
    if (startIdx === 0 && exists !== null) {
      if (exists === value) return snack('Identical value already on‑chain', 'warning');
    }

    setEstimating(true);
    await new Promise(requestAnimationFrame);
    try {
      const flat = await buildFlat(startIdx);
      const { fee, burn } = await estimateChunked(toolkit, flat, 8);
      setEstimate({
        feeTez:     (fee  / 1e6).toFixed(6),
        storageTez: (burn / 1e6).toFixed(6),
      });
      const packed = await splitPacked(toolkit, flat, PACKED_SAFE_BYTES);
      setBatches(packed.length ? packed : [flat]);

      saveSliceCheckpoint(contractAddress, tokenId, `meta_${metaKey}`, {
        total: slices.length,
        next : startIdx,
      });
      setConfirm(true);
    } catch (e) { snack(e.message, 'error'); }
    finally   { setEstimating(false); }
  };

  /*──────── slice runner ─────*/
  const runSlice = useCallback(async (idx = 0) => {
    if (!batches || idx >= batches.length) return;
    setOv({ open:true, status:'Broadcasting…', current:idx+1, total:batches.length });
    try {
      const op = await toolkit.wallet.batch(batches[idx]).send();
      await op.confirmation();
      if (idx + 1 < batches.length) {
        saveSliceCheckpoint(contractAddress, tokenId, `meta_${metaKey}`, {
          total: slices.length, next: idx + 1,
        });
        requestAnimationFrame(() => runSlice(idx + 1));
      } else {
        clearSliceCheckpoint(contractAddress, tokenId, `meta_${metaKey}`);
        onMutate();
        setOv({ open:true, opHash: op.opHash });
      }
    } catch (e) {
      setOv({ open:true, error:true, status:e.message || String(e) });
    }
  }, [batches, toolkit, contractAddress, tokenId, metaKey, slices.length, onMutate]);

  /*──────── computed ‑ UI guards ─────*/
  const disabled = estimating || !tokenId || !metaKey.trim() || !value.trim() || !jsonOk;

  /*──────── JSX ─────*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Append Token Metadata (v4a)</PixelHeading>

      {/* token picker */}
      <div style={{ display:'flex', gap:'.5rem' }}>
        <PixelInput
          placeholder="Token‑ID"
          style={{ flex:1 }}
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value.replace(/\D/g, ''))}
        />
        <SelectBox>
          <select
            style={{ width:'100%', height:32 }}
            disabled={loadingTok}
            value={tokenId || ''}
            onChange={(e) => setTokenId(e.target.value)}
          >
            <option value="">
              {loadingTok ? 'Loading…'
                : tokOpts.length ? 'Select token' : '— none —'}
            </option>
            {tokOpts.map((t) => {
              const id   = typeof t === 'object' ? t.id   : t;
              const name = typeof t === 'object' ? t.name : '';
              return <option key={id} value={id}>{name ? `${id} — ${name}` : id}</option>;
            })}
          </select>
          {loadingTok && <Spinner />}
        </SelectBox>
      </div>

      <Help>
        Adds or extends a single <code>token_metadata</code> key without overwriting
        the full map. Enter <strong>key</strong> + <strong>value</strong>, select
        token, then <em>APPEND</em>. Large values auto‑slice; interrupted uploads
        show a RESUME banner. JSON validates live (I87).
      </Help>

      {/* key / value */}
      <Note>Metadata key *</Note>
      <PixelInput
        value={metaKey}
        onChange={(e) => setMetaKey(e.target.value.replace(/\s+/g, ''))}
      />

      <Note>Value (raw string {isJson(value)&&'/ JSON'} *)</Note>
      <PixelInput
        as="textarea"
        rows={4}
        style={{ fontFamily:'monospace' }}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {!jsonOk && <p style={{ color:'var(--zu-accent-sec)', fontSize:'.7rem' }}>
        Invalid&nbsp;JSON
      </p>}

      <Note>
        Payload slices:&nbsp;{slices.length || 0}&nbsp;•&nbsp;Total&nbsp;
        {slices.reduce((t, s) => t + (s.length - 2) / 2, 0).toLocaleString()}&nbsp;bytes
      </Note>

      {resume && (
        <p style={{ fontSize:'.75rem', color:'var(--zu-accent)', margin:'6px 0' }}>
          Resume detected&nbsp;({resume.next}/{resume.total}).
          <PixelButton size="xs" style={{ marginLeft:6 }}
            onClick={() => prep(resume.next)}>
            RESUME
          </PixelButton>
        </p>
      )}

      <PixelButton disabled={disabled} onClick={() => prep(0)}>
        {estimating ? 'Estimating…' : 'APPEND'}
      </PixelButton>

      {/* dialogs */}
      {confirm && (
        <OperationConfirmDialog
          open
          slices={batches?.length || 1}
          estimate={estimate}
          onOk={() => { setConfirm(false); runSlice(0); }}
          onCancel={() => { setConfirm(false); setBatches(null); }}
        />
      )}
      {ov.open && (
        <OperationOverlay
          {...ov}
          onRetry={() => runSlice((ov.current ?? 1) - 1)}
          onCancel={() => { setOv({ open:false }); setBatches(null); }}
        />
      )}
    </Wrap>
  );
}
/* What changed & why:
   • Diff‑scan: fetches on‑chain meta & warns on identical value.
   • Live JSON validation gate (I87) disables CTA on parse error.
   • Slice resume & cache comply with I60‑I61.
   • Full estimator via feeEstimator.js (I85), no local math.
   • HelpBox per I86, wording aligned with other EPs. */
/* EOF */
