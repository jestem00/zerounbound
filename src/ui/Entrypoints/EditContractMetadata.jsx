/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/EditContractMetadata.jsx
  Rev :    r824   2025‑08‑12
  Summary: live byte counter + 32 KB cap alignment
──────────────────────────────────────────────────────────────*/
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
}                           from 'react';
import styledPkg            from 'styled-components';
import { Buffer }           from 'buffer';
import { char2Bytes }       from '@taquito/utils';
import { OpKind }           from '@taquito/taquito';

import PixelHeading         from '../PixelHeading.jsx';
import PixelInput           from '../PixelInput.jsx';
import PixelButton          from '../PixelButton.jsx';
import ContractMetaPanel    from '../ContractMetaPanel.jsx';
import LoadingSpinner       from '../LoadingSpinner.jsx';
import OperationConfirmDialog from '../OperationConfirmDialog.jsx';
import OperationOverlay     from '../OperationOverlay.jsx';
import MintUpload           from './MintUpload.jsx';

import useTxEstimate        from '../../hooks/useTxEstimate.js';
import { useWalletContext } from '../../contexts/WalletContext.js';
import { jFetch }           from '../../core/net.js';

import {
  validateEditContractFields,
  MAX_META_BYTES,
} from '../../core/validator.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── helpers ───────────────────────────────────────────*/
const extractDataUri = (v = '') => (typeof v === 'string' ? v.trim() : '');

/*──────── constants ─────────────────────────────────────────*/
const CUSTOM_LABEL = 'Custom…';
const IMAGE_CUTOFF = 28_000;
const IMAGE_MAX_B  = 65_000;
const LICENSES = [
  'No License, All Rights Reserved',
  'On-Chain NFT License 2.0 KT1S9GHLCrGg5YwoJGDDuC347bCTikefZQ4z',
  'Creative Commons — CC BY 4.0',
  'Creative Commons — CC0 1.0',
  'MIT', 'GPL-3.0', 'CAL-1.0', CUSTOM_LABEL,
];
const isCustom = (v = '') => v === CUSTOM_LABEL || v === 'Custom...';
const Count = styled.span`
  font-size:.7rem;justify-self:end;opacity:.75;
  color:${props => props.$over ? 'var(--zu-accent-sec)' : 'inherit'};
`;
/*──────── styled shells ─────────────────────────────────────*/
const Wrapper = styled.div`
  display:grid;gap:1.6rem;
  grid-template-columns:minmax(0,1fr) minmax(300px,34%);
  width:100%;overflow-x:hidden;
  @media(min-width:1800px){
    gap:1.2rem;grid-template-columns:minmax(0,1fr) minmax(360px,28%);
  }
  @media(max-width:900px){grid-template-columns:1fr;}
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
const Err    = styled.span`font-size:.8rem;color:var(--zu-accent-sec);`;
const Notice = styled.p`font-size:.8rem;margin:.25rem 0 1rem;text-align:center;
                        color:var(--zu-accent-sec);`;
const HelpBox = styled.p`font-size:.75rem;line-height:1.25;margin:.5rem 0 .9rem;`;

/*──────────────── component ───────────────────────────────*/
export default function EditContractMetadata({
  contractAddress = '',
  setSnackbar     = () => {},
  onMutate        = () => {},
}) {
  const { toolkit, network = 'ghostnet' } = useWalletContext() || {};
  const snack = (m, s = 'info') => setSnackbar({ open: true, message: m, severity: s });

  const BASE = network === 'mainnet'
    ? 'https://api.tzkt.io/v1'
    : 'https://api.ghostnet.tzkt.io/v1';

  /*──────── state ─────────────────────────────────────────*/
  const [meta, setMeta]   = useState(null);
  const [loading, setLoad] = useState(false);
  const [busy, setBusy]   = useState(false);
  const [confirm, setConf] = useState(false);
  const [overlay, setOv]  = useState({ open: false });
  const [params, setParams] = useState([]);

  /*──────── form state ───────────────────────────────────*/
  const [form, _setForm] = useState({
    name:'', symbol:'', description:'', license:CUSTOM_LABEL, customLicense:'',
    authors:'', homepage:'', authoraddress:'', creators:'', type:'',
    imageUri:'',
  });
  const formRef = useRef(form);
  const setForm = (fnOrObj) => {
    _setForm((prev) => {
      const next = typeof fnOrObj === 'function' ? fnOrObj(prev) : { ...prev, ...fnOrObj };
      formRef.current = next;
      return next;
    });
  };

  /*──────── error diff toast ─────────────────────────────*/
  const prevFieldErrs = useRef({});

  /*──────── fetch current metadata ───────────────────────*/
  const fetchMeta = useCallback(async () => {
    if (!contractAddress) return;
    setLoad(true);
    try {
      const row = await jFetch(`${BASE}/contracts/${contractAddress}`).catch(() => null);
      let m = { ...(row?.metadata || {}) };
      if (row?.extras) m = { ...m, ...row.extras };
      if (!Object.keys(m).length) {
        const bm = await jFetch(
          `${BASE}/contracts/${contractAddress}/bigmaps/metadata/keys/contents`,
        ).catch(() => null);
        if (bm?.value)
          m = JSON.parse(Buffer.from(bm.value.replace(/^0x/i, ''), 'hex').toString('utf8'));
      }
      ['authors','authoraddress','creators'].forEach((k) => {
        if (Array.isArray(m[k])) m[k] = m[k].join(', ');
      });
      const licenceInList = LICENSES.includes(m.license);
      setForm({
        name          : m.name ?? '',
        symbol        : m.symbol ?? '',
        description   : m.description ?? '',
        license       : licenceInList ? m.license : CUSTOM_LABEL,
        customLicense : licenceInList ? '' : (m.license ?? ''),
        authors       : m.authors ?? '',
        homepage      : m.homepage ?? '',
        authoraddress : m.authoraddress ?? '',
        creators      : m.creators ?? '',
        type          : m.type ?? '',
        imageUri      : m.imageUri ?? '',
      });
      setMeta(m);
    } finally { setLoad(false); }
  }, [contractAddress, BASE]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  /*──────── ordered builder ──────────────────────────────*/
  const buildOrdered = useCallback((f) => ({
    name        : f.name.trim(),
    symbol      : f.symbol.trim(),
    description : f.description.trim(),
    version     : meta?.version ?? 'ZeroContractV4',
    license     : isCustom(f.license) ? f.customLicense : f.license,
    authors     : f.authors.split(',').map(s => s.trim()).filter(Boolean),
    homepage    : f.homepage.trim() || undefined,
    authoraddress: f.authoraddress.split(',').map(s => s.trim()).filter(Boolean),
    creators    : f.creators.split(',').map(s => s.trim()).filter(Boolean),
    type        : f.type,
    interfaces  : meta?.interfaces || ['TZIP-012', 'TZIP-016'],
    imageUri    : f.imageUri || '',
  }), [meta]);

  const ordered   = useMemo(() => buildOrdered(form), [form, buildOrdered]);
  const minJson   = JSON.stringify(ordered);
  const metaBytes = Buffer.byteLength(minJson, 'utf8');
  const imgBytes  = Buffer.byteLength(form.imageUri || '', 'utf8');

  /*──────── validation & errors ──────────────────────────*/
  const { errors, fieldErrors: rawFE } = useMemo(
    () => validateEditContractFields({
      data: { ...form, imageUri: form.imageUri },
      walletOK: !!toolkit,
      metaBytes,
    }),
    [form, toolkit, metaBytes],
  );

  const fieldErrors = useMemo(() => ({
    ...rawFE,
    ...(imgBytes > IMAGE_MAX_B && { imageUri: `Image exceeds 64 KiB limit (${imgBytes} B)` }),
  }), [rawFE, imgBytes]);

  /* toast new errors */
  useEffect(() => {
    Object.keys(fieldErrors)
      .filter(k => fieldErrors[k] && fieldErrors[k] !== prevFieldErrs.current[k])
      .forEach(k => snack(`${k}: ${fieldErrors[k]}`, 'error'));
    prevFieldErrs.current = fieldErrors;
  }, [fieldErrors]); // eslint-disable-line react-hooks/exhaustive-deps

  const disabled = errors.length > 0 || Object.values(fieldErrors).some(Boolean) || busy || !toolkit;

  /*──────── estimator params ─────────────────────────────*/
  useEffect(() => {
    (async () => {
      if (!toolkit || !contractAddress || disabled) { setParams([]); return; }
      const slim = { ...ordered };
      if (imgBytes >= IMAGE_CUTOFF) delete slim.imageUri;
      try {
        const c  = await toolkit.contract.at(contractAddress);
        const tp = await c.methods.edit_contract_metadata(
          `0x${char2Bytes(JSON.stringify(slim))}`,
        ).toTransferParams();
        setParams([{ kind: OpKind.TRANSACTION, ...tp }]);
      } catch { setParams([]); }
    })();
  }, [toolkit, contractAddress, ordered, disabled, imgBytes]);

  const est = useTxEstimate(toolkit, confirm ? params : []);

  /*──────── submit ──────────────────────────────────────*/
  const submit = async () => {
    const live = formRef.current;               // freshest snapshot
    const finalOrdered = buildOrdered(live);
    const payload = `0x${char2Bytes(JSON.stringify(finalOrdered))}`;

    if (disabled) { snack('Fix highlighted errors first', 'error'); return; }

    try {
      setBusy(true);
      setOv({ open: true, status: 'Waiting for signature…', total: 1, current: 1 });
      const c  = await toolkit.wallet.at(contractAddress);
      const op = await c.methods.edit_contract_metadata(payload).send();
      setOv({ open: true, status: 'Broadcasting…', total: 1, current: 1 });
      await op.confirmation();
      setOv({ open: true, opHash: op.opHash });
      snack('Contract metadata updated', 'success');
      onMutate();
    } catch (e) {
      snack(e.message, 'error');
      setOv({ open: false });
    } finally { setBusy(false); }
  };

  /*──────── render ───────────────────────────────────────*/
  return (
    <section>
      <PixelHeading level={3}>Edit Contract&nbsp;Metadata</PixelHeading>
      <Notice>Must own all editions to use this entry-point</Notice>
      <HelpBox>
        Updates *contract-level* TZIP-16 JSON (name, description, license, etc.). Fields validate live; red text marks issues. When happy, **Update**—one transaction, no slicing.
        <br/>
        <strong>Note:</strong> this does not change the contract owner, it only updates metadata.
        <br/>
        <strong>Tip:</strong> use the <code>type</code> field to categorize your contract (art, music, collectible, etc.).
      </HelpBox>

      {loading && <LoadingSpinner size={48} style={{ margin: '1rem auto', display: 'block' }} />}

      {meta && (
        <Wrapper>
          <FormGrid>
            {/* text / select fields */}
            {[
              { k: 'name',          label: 'Name', mandatory: true },
              { k: 'symbol',        label: 'Symbol', mandatory: true },
              { k: 'description',   label: 'Description', tag: 'textarea', rows: 6, mandatory: true },
              { k: 'license',       label: 'License', tag: 'select', mandatory: true },
              { k: 'authors',       label: 'Author(s)', tag: 'textarea', rows: 2, mandatory: true },
              { k: 'homepage',      label: 'Homepage', tag: 'textarea', rows: 2 },
              { k: 'authoraddress', label: 'Author address(es)', tag: 'textarea', rows: 2, mandatory: true },
              { k: 'creators',      label: 'Creator wallet(s)', tag: 'textarea', rows: 2, mandatory: true },
              { k: 'type',          label: 'Type', tag: 'select', mandatory: true },
            ].map(({ k, label, tag, rows, mandatory }) => (
              <React.Fragment key={k}>
                <FieldWrap style={k === 'description' ? { gridColumn: '1 / -1' } : undefined}>
                  <label htmlFor={k}>{label}{mandatory && ' *'}</label>
                  {tag === 'select' ? (
                    <PixelInput
                      as="select"
                      id={k}
                      value={form[k]}
                      onChange={(e) => setForm(f => ({ ...f, [k]: e.target.value }))}
                    >
                      {k === 'license' && LICENSES.map(l => <option key={l}>{l}</option>)}
                      {k === 'type' && (
                        <>
                          <option value="">— choose —</option>
                          <option value="art">Art</option>
                          <option value="music">Music</option>
                          <option value="collectible">Collectible</option>
                          <option value="other">Other</option>
                        </>
                      )}
                    </PixelInput>
                  ) : (
                    <PixelInput
                      as={tag}
                      id={k}
                      rows={rows}
                      placeholder={label}
                      value={form[k]}
                      onChange={(e) => setForm(f => ({ ...f, [k]: e.target.value }))}
                      aria-invalid={!!fieldErrors[k]}
                      style={fieldErrors[k] ? { borderColor: 'var(--zu-accent-sec)' } : undefined}
                    />
                  )}
                  {fieldErrors[k] && <Err>{fieldErrors[k]}</Err>}
                </FieldWrap>

                {k === 'license' && isCustom(form.license) && (
                  <FieldWrap style={{ gridColumn: '1 / -1' }}>
                    <label htmlFor="customLicense">Custom license *</label>
                    <PixelInput
                      as="textarea"
                      id="customLicense"
                      rows={2}
                      value={form.customLicense}
                      onChange={(e) => setForm(f => ({ ...f, customLicense: e.target.value }))}
                      aria-invalid={!!fieldErrors.customLicense}
                      style={fieldErrors.customLicense ? { borderColor: 'var(--zu-accent-sec)' } : undefined}
                    />
                    {fieldErrors.customLicense && <Err>{fieldErrors.customLicense}</Err>}
                  </FieldWrap>
                )}
              </React.Fragment>
            ))}

            {/* imageUri upload */}
            <FieldWrap style={{ gridColumn:'1 / -1' }}>
              <label>Cover Image * (imageUri)</label>
              <MintUpload
                accept="image/*"
                btnText="Upload imageUri *"
                maxFileSize={IMAGE_MAX_B}
                setSnackbar={setSnackbar}
                onFileDataUrlChange={(uri) => setForm({ imageUri: extractDataUri(uri) })}
              />
              {fieldErrors.imageUri && <Err>{fieldErrors.imageUri}</Err>}
            </FieldWrap>

            {/* meta‑byte counter */}
            <Count
              style={{ gridColumn:'1 / -1', justifySelf:'end' }}
              $over={metaBytes > MAX_META_BYTES}
            >
              Metadata&nbsp;{metaBytes.toLocaleString()} / {MAX_META_BYTES} B
            </Count>

            {/* CTA */}
            <div style={{ gridColumn:'1 / -1', display:'flex', gap:'.8rem', marginTop:'.8rem' }}>
              <PixelButton
                style={{ flexGrow:1 }}
                disabled={disabled}
                onClick={() => setConf(true)}
              >
                {busy ? 'Processing…' : 'Update'}
              </PixelButton>
              {busy && <LoadingSpinner size={16} />}
            </div>
          </FormGrid>

          <ContractMetaPanel
            meta={ordered}
            contractAddress={contractAddress}
            network={network}
          />
        </Wrapper>
      )}

      {confirm && (
        <OperationConfirmDialog
          open
          slices={1}
          estimate={{ feeTez: est.feeTez, storageTez: est.storageTez }}
          onOk={() => { setConf(false); submit(); }}
          onCancel={() => setConf(false)}
        />
      )}
      {overlay.open && <OperationOverlay {...overlay} onCancel={() => setOv({ open: false })} />}
    </section>
  );
}
/* What changed & why:
   • Imported MAX_META_BYTES and added live Metadata byte counter.
   • Counter turns red & disables update via validator once >32 768 B.
   • Disabled logic now governed by revised validator (full 32 KB cap).
   • Rev → r824.
*/
/* EOF */