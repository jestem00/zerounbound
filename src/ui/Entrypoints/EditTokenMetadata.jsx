/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/EditTokenMetadata.jsx
  Rev :    r758   2025-07-05
  Summary: fix option object rendering & value‑string coercion
──────────────────────────────────────────────────────────────*/
import React, {
  useEffect, useMemo, useState,
} from 'react';
import styledPkg               from 'styled-components';
import { MichelsonMap }        from '@taquito/michelson-encoder';
import { char2Bytes }          from '@taquito/utils';
import { OpKind }              from '@taquito/taquito';

import PixelHeading            from '../PixelHeading.jsx';
import PixelInput              from '../PixelInput.jsx';
import PixelButton             from '../PixelButton.jsx';
import LoadingSpinner          from '../LoadingSpinner.jsx';
import TokenMetaPanel          from '../TokenMetaPanel.jsx';
import OperationConfirmDialog  from '../OperationConfirmDialog.jsx';
import OperationOverlay        from '../OperationOverlay.jsx';

import listLiveTokenIds        from '../../utils/listLiveTokenIds.js';
import useTxEstimate           from '../../hooks/useTxEstimate.js';
import { useWalletContext }    from '../../contexts/WalletContext.js';
import { jFetch }              from '../../core/net.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Wrap = styled.section`margin-top:1rem;`;
const Row  = styled.div`display:flex;gap:.6rem;align-items:center;`;

/* editable whitelist */
const EDITABLE = [
  'name', 'description', 'authors', 'creators',
  'license', 'tags', 'attributes', 'imageUri',
];

/* stringify helper */
const enc = (v) => (typeof v === 'object' ? JSON.stringify(v) : String(v));

export default function EditTokenMetadata({
  contractAddress = '',
  setSnackbar     = () => {},
  onMutate        = () => {},
  $level,
}) {
  const { toolkit, network = 'ghostnet' } = useWalletContext() || {};
  const snack = (m, s = 'info') => setSnackbar({ open: true, message: m, severity: s });

  /*──────── token list ───────*/
  const [tokOpts, setTokOpts] = useState([]);
  const [tokenId, setTokenId] = useState('');
  const [loadingIds, setLIds] = useState(false);

  useEffect(() => {
    if (!contractAddress) return;
    (async () => {
      setLIds(true);
      const raw = await listLiveTokenIds(contractAddress, network, true);
      /* ensure primitives */
      const ids = raw.map((t) =>
        (typeof t === 'object' ? t.id ?? t.tokenId : t)).filter((v) => v !== undefined);
      setTokOpts(ids);
      setLIds(false);
    })();
  }, [contractAddress, network]);

  /*──────── fetch meta ───────*/
  const base = network === 'mainnet'
    ? 'https://api.tzkt.io/v1'
    : 'https://api.ghostnet.tzkt.io/v1';

  const [meta, setMeta]     = useState(null);
  const [busyMeta, setBMet] = useState(false);

  useEffect(() => {
    if (!tokenId) return;
    (async () => {
      setBMet(true);
      try {
        const [row] = await jFetch(
          `${base}/tokens?contract=${contractAddress}&tokenId=${tokenId}&select=metadata&limit=1`,
        ).catch(() => []);
        setMeta(row?.metadata || {});
      } finally { setBMet(false); }
    })();
  }, [tokenId, contractAddress, base]);

  /*──────── form state ───────*/
  const [form, setForm] = useState({});
  useEffect(() => { if (meta) setForm(meta); }, [meta]);

  const onChange = (k) => (e) => {
    const val = e.target.value;
    setForm((f) => {
      if (k === 'tags') {
        return { ...f, tags: val.split(',').map((s) => s.trim()).filter(Boolean) };
      }
      if (k === 'attributes') {
        try { return { ...f, attributes: JSON.parse(val) }; }
        catch { return { ...f, attributes: val }; }     /* keep string until valid */
      }
      return { ...f, [k]: val };
    });
  };

  /*──────── diff map ───────*/
  const diffMap = useMemo(() => {
    const m = new MichelsonMap();
    EDITABLE.forEach((k) => {
      if (enc(form[k]) !== enc(meta?.[k])) m.set(k, `0x${char2Bytes(enc(form[k] ?? ''))}`);
    });
    return m;
  }, [form, meta]);

  const disabled = !tokenId || diffMap.size === 0 || !toolkit;

  /*──────── estimator ───────*/
  const params = useMemo(() => (toolkit && !disabled
    ? [{
        kind: OpKind.TRANSACTION,
        ...(toolkit.contract.at
          ? toolkit.contract.at(contractAddress).then((c) =>
              c.methods.edit_token_metadata(diffMap, +tokenId).toTransferParams())
          : {}),
      }]
    : []), [toolkit, contractAddress, diffMap, tokenId, disabled]);

  const est = useTxEstimate(toolkit, params);

  /*──────── overlay state ─────*/
  const [confirm, setConf] = useState(false);
  const [overlay, setOv]   = useState({ open: false });

  /*──────── send ───────*/
  const send = async () => {
    try {
      setOv({ open: true, status: 'Waiting for signature…', total: 1, current: 1 });
      const c  = await toolkit.wallet.at(contractAddress);
      const op = await c.methods.edit_token_metadata(diffMap, +tokenId).send();
      setOv({ open: true, status: 'Broadcasting…', total: 1, current: 1 });
      await op.confirmation();
      setOv({ open: true, opHash: op.opHash });
      snack('Token metadata updated', 'success');
      onMutate(); setMeta(null); setForm({});
    } catch (e) {
      snack(e.message, 'error');
      setOv({ open: false });
    }
  };

  /*──────── Field helper ───────*/
  const Field = ({ label, value }) => (
    <div style={{ marginTop: '.8rem' }}>
      <label htmlFor={label} style={{ display: 'block', fontSize: '.8rem' }}>
        {label}
      </label>
      <PixelInput
        id={label}
        as={label === 'description' ? 'textarea' : 'input'}
        rows={label === 'description' ? 3 : undefined}
        value={enc(value)}
        onChange={onChange(label)}
      />
    </div>
  );

  /*──────── render ───────*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={3}>Edit Token Metadata</PixelHeading>

      <Row>
        <PixelInput
          as="select"
          value={tokenId}
          disabled={loadingIds}
          onChange={(e) => setTokenId(e.target.value)}
        >
          <option value="">Select Token‑ID</option>
          {tokOpts.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </PixelInput>
        {loadingIds && <LoadingSpinner size={16} />}
      </Row>

      {busyMeta && <LoadingSpinner size={32} style={{ margin: '1rem auto' }} />}

      {meta && (
        <>
          <TokenMetaPanel
            meta={form}
            tokenId={tokenId}
            contractAddress={contractAddress}
          />

          {EDITABLE.map((k) => (
            <Field key={k} label={k} value={form[k] ?? ''} />
          ))}

          <div style={{ marginTop: '1rem', display: 'flex', gap: '.8rem' }}>
            <PixelButton disabled={disabled} onClick={() => setConf(true)}>
              Update
            </PixelButton>
            {disabled && (
              <small style={{ opacity: .7 }}>
                {diffMap.size === 0 ? 'No changes' : ''}
              </small>
            )}
          </div>
        </>
      )}

      {confirm && (
        <OperationConfirmDialog
          open
          slices={1}
          estimate={{ feeTez: est.feeTez, storageTez: est.storageTez }}
          onOk={() => { setConf(false); send(); }}
          onCancel={() => setConf(false)}
        />
      )}

      {overlay.open && (
        <OperationOverlay
          {...overlay}
          onCancel={() => setOv({ open: false })}
        />
      )}
    </Wrap>
  );
}
/* What changed & why:
   • Converted token list to primitive ids (fix object render error)
   • enc helper guarantees string values for inputs & Michelson bytes
   • Tags / attributes parsing logic added */
/* EOF */
