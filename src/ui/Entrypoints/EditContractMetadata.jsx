/*Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/EditContractMetadata.jsx
  Rev :    r805   2025-07-05
  Summary: inline error <Err> + toast hook uses new validator
────────────────────────────────────────────────────────────────*/
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

import useTxEstimate        from '../../hooks/useTxEstimate.js';
import { useWalletContext } from '../../contexts/WalletContext.js';
import { jFetch }           from '../../core/net.js';

import {
  asciiPrintable, asciiPrintableLn, listOfTezAddresses,
} from '../../core/validator.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── layout shells ─────────────────────────────────────*/
const Wrapper = styled.div`
  display: grid;
  gap: 1.6rem;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 34%);
  width: 100%;
  overflow-x: hidden;

  @media (min-width: 1800px){
    gap: 1.2rem;
    grid-template-columns: minmax(0, 1fr) minmax(360px, 28%);
  }
  @media (max-width: 900px){
    grid-template-columns: 1fr;
  }
`;
const FormGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.1rem;

  @media (min-width: 1800px){
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
  }
`;
const FieldWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: .45rem;
  textarea { min-height: 6rem; }
`;
const Err = styled.span`
  font-size: .8rem;
  color: var(--zu-accent-sec);
`;
const Notice = styled.p`
  font-size: .8rem;
  margin: .25rem 0 1rem;
  text-align: center;
  color: var(--zu-accent-sec);
`;

/*──────── constants & helpers ───────────────────────────────*/
const CUSTOM_LABEL = 'Custom…';
const IMAGE_CUTOFF = 28_000;
const LICENSES = [
  'No License, All Rights Reserved',
  'On-Chain NFT License 2.0 KT1S9GHLCrGg5YwoJGDDuC347bCTikefZQ4z',
  'Creative Commons — CC BY 4.0',
  'Creative Commons — CC0 1.0',
  'MIT', 'GPL-3.0', 'CAL-1.0', CUSTOM_LABEL,
];
const isCustom = (v = '') => v === CUSTOM_LABEL || v === 'Custom...';

const LEN = {
  name: 50, symbol: 10, description: 5000,
  authors: 200, addr: 200, creators: 200,
  license: 120, homepage: 160,
};
const urlOkay = (v = '') =>
  /^(https?:\/\/|ipfs:\/\/|ipns:\/\/|ar:\/\/)[\w./#?=-]+$/i.test(v.trim());

function validateField(form, k, v) {
  switch (k) {
    case 'name':
      if (!v.trim()) return 'Required';
      if (!asciiPrintable(v)) return 'Invalid control char';
      if (v.length > LEN.name) return `≤ ${LEN.name}`;
      return '';
    case 'symbol':
      if (!v.trim()) return 'Required';
      if (!asciiPrintable(v)) return 'Invalid control char';
      if (v.length > LEN.symbol) return `≤ ${LEN.symbol}`;
      return '';
    case 'description':
      if (!v.trim()) return 'Required';
      if (!asciiPrintableLn(v)) return 'Invalid control char';
      if (v.length > LEN.description) return `≤ ${LEN.description}`;
      return '';
    case 'homepage':
      if (!v.trim()) return '';
      if (!urlOkay(v)) return 'Invalid URL';
      if (v.length > LEN.homepage) return `≤ ${LEN.homepage}`;
      return '';
    case 'authors':
      if (!v.trim()) return 'Required';
      if (!asciiPrintable(v)) return 'Invalid control char';
      if (v.length > LEN.authors) return `≤ ${LEN.authors}`;
      return '';
    case 'authoraddress':
      if (!v.trim()) return 'Required';
      if (!listOfTezAddresses(v)) return 'Comma-sep tz/KT';
      if (v.length > LEN.addr) return `≤ ${LEN.addr}`;
      return '';
    case 'creators':
      if (!v.trim()) return 'Required';
      if (!listOfTezAddresses(v)) return 'Comma-sep tz/KT';
      if (v.length > LEN.creators) return `≤ ${LEN.creators}`;
      return '';
    case 'customLicense':
      if (!isCustom(form.license)) return '';
      if (!v.trim()) return 'Required';
      if (!asciiPrintable(v)) return 'Invalid control char';
      if (v.length > LEN.license) return `≤ ${LEN.license}`;
      return '';
    default:
      return '';
  }
}


/*──────────────── component ───────────────────────────────*/
export default function EditContractMetadata({
  contractAddress = '',
  setSnackbar     = () => {},
  onMutate        = () => {},
  $level,
}) {
  const { toolkit, network = 'ghostnet' } = useWalletContext() || {};
  const snack = (msg, sev = 'info') =>
    setSnackbar({ open: true, message: msg, severity: sev });

  const BASE = network === 'mainnet'
    ? 'https://api.tzkt.io/v1'
    : 'https://api.ghostnet.tzkt.io/v1';

  /*──────── state ─────────────────────────────────────────*/
  const [meta, setMeta]    = useState(null);
  const [loading, setLoad] = useState(false);
  const [busy, setBusy]    = useState(false);
  const [confirm, setConf] = useState(false);
  const [overlay,setOv]    = useState({ open: false });
  const [params, setParams]= useState([]);

  /*──────── form state ───────────────────────────────────*/
  const [form, setForm] = useState({
    name:'', symbol:'', description:'', license:CUSTOM_LABEL, customLicense:'',
    authors:'', homepage:'', authoraddress:'', creators:'', type:'',
  });

  /*──────── live error tracking for toast diff ───────────*/
  const prevErrs = useRef({});
  const labelMap = useRef({});

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
          `${BASE}/contracts/${contractAddress}/bigmaps/metadata/keys/content`, 1,
        ).catch(() => null);
        if (bm?.value)
          m = JSON.parse(Buffer.from(bm.value.replace(/^0x/i,''),'hex').toString('utf8'));
      }
      ['authors','authoraddress','creators'].forEach((k) => {
        if (Array.isArray(m[k])) m[k] = m[k].join(', ');
      });

      const licenceInList = LICENSES.includes(m.license);
      setForm({
        name          : m.name    ?? '',
        symbol        : m.symbol  ?? '',
        description   : m.description ?? '',
        license       : licenceInList ? m.license : CUSTOM_LABEL,
        customLicense : licenceInList ? '' : (m.license ?? ''),
        authors       : m.authors ?? '',
        homepage      : m.homepage ?? '',
        authoraddress : m.authoraddress ?? '',
        creators      : m.creators ?? '',
        type          : m.type ?? '',
      });
      setMeta(m);
    } finally { setLoad(false); }
  }, [contractAddress, BASE]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  /*──────── field defs ───────────────────────────────────*/
  const FIELDS = [
    { k:'name',          label:'Name', mandatory:true },
    { k:'symbol',        label:'Symbol', mandatory:true },
    { k:'description',   label:'Description', tag:'textarea', rows:6, mandatory:true },
    { k:'license',       label:'License', tag:'select', mandatory:true },
    { k:'authors',       label:'Author(s)', tag:'textarea', rows:2, mandatory:true },
    { k:'homepage',      label:'Homepage', tag:'textarea', rows:2 },
    { k:'authoraddress', label:'Author address(es)', tag:'textarea', rows:2, mandatory:true },
    { k:'creators',      label:'Creator wallet(s)', tag:'textarea', rows:2, mandatory:true },
    { k:'type',          label:'Type', tag:'select', mandatory:true },
  ];
  if (!Object.keys(labelMap.current).length) {
    FIELDS.forEach(({k,label}) => { labelMap.current[k] = label; });
  }

  const onChange = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  /*──────── validation ───────────────────────────────────*/
  const errs = useMemo(() => {
    const e = {};
    Object.keys(form).forEach((k) => {
      const msg = validateField(form, k, form[k]);
      if (msg) e[k] = msg;
    });
    return e;
  }, [form]);

  /*──────── toast newly-added errors ─────────────────────*/
  useEffect(() => {
    const newErrKeys = Object.keys(errs)
      .filter((k) => errs[k] && !prevErrs.current[k]);
    newErrKeys.forEach((k) =>
      snack(`${labelMap.current[k] || k}: ${errs[k]}`, 'error'),
    );
    prevErrs.current = errs;
  }, [errs]);              // eslint-disable-line react-hooks/exhaustive-deps

  const disabled = !!Object.keys(errs).length || busy || !toolkit;

  /*──────── ordered payload ──────────────────────────────*/
  const licence = isCustom(form.license) ? form.customLicense : form.license;
  const ordered = useMemo(() => ({
    name       : form.name.trim(),
    symbol     : form.symbol.trim(),
    description: form.description.trim(),
    version    : meta?.version ?? 'ZeroContractV4',
    license    : licence,
    authors    : form.authors.split(',').map((s)=>s.trim()).filter(Boolean),
    homepage   : form.homepage.trim() || undefined,
    authoraddress: form.authoraddress.split(',').map((s)=>s.trim()).filter(Boolean),
    creators   : form.creators.split(',').map((s)=>s.trim()).filter(Boolean),
    type       : form.type,
    interfaces : meta?.interfaces || ['TZIP-012', 'TZIP-016'],
    imageUri   : meta?.imageUri || '',
  }), [form, licence, meta]);

  /*──────── estimator params (oversize-safe) ─────────────*/
  useEffect(() => {
    (async () => {
      if (!toolkit || !contractAddress || disabled) { setParams([]); return; }

      const slim = { ...ordered };
      const imageBytes = Buffer.byteLength(ordered.imageUri || '', 'utf8');
      if (imageBytes >= IMAGE_CUTOFF) delete slim.imageUri;

      try {
        const c  = await toolkit.contract.at(contractAddress);
        const tp = await c.methods.edit_contract_metadata(
          `0x${char2Bytes(JSON.stringify(slim, null, 2))}`,
        ).toTransferParams();
        setParams([{ kind: OpKind.TRANSACTION, ...tp }]);
      } catch { setParams([]); }
    })();
  }, [toolkit, contractAddress, ordered, disabled]);

  /*──────── estimator ────────────────────────────────────*/
  const est = useTxEstimate(toolkit, confirm ? params : []);

  /*──────── submit ──────────────────────────────────────*/
  const submit = async () => {
    if (disabled) {
      snack('Fix highlighted errors first', 'error');
      return;
    }
    try {
      setBusy(true);
      setOv({ open:true, status:'Waiting for signature…', total:1, current:1 });
      const c = await toolkit.wallet.at(contractAddress);
      const op = await c.methods.edit_contract_metadata(
        `0x${char2Bytes(JSON.stringify(ordered, null, 2))}`,
      ).send();
      setOv({ open:true, status:'Broadcasting…', total:1, current:1 });
      await op.confirmation();
      setOv({ open:true, opHash:op.opHash });
      snack('Contract metadata updated', 'success');
      onMutate();
    } catch (e) {
      snack(e.message, 'error');
      setOv({ open:false });
    } finally { setBusy(false); }
  };

  /*──────── render ───────────────────────────────────────*/
  return (
    <section $level={$level}>
      <PixelHeading level={3}>Edit Contract&nbsp;Metadata</PixelHeading>
      <Notice>Must own all editions to use this entry-point</Notice>

      {loading && (
        <LoadingSpinner
          size={48}
          style={{ margin:'1rem auto', display:'block' }}
        />
      )}

      {meta && (
        <Wrapper>
           <FormGrid>
            {FIELDS.map(({ k,label,tag,rows,mandatory }) => (
              <React.Fragment key={k}>
                <FieldWrap style={k==='description'?{gridColumn:'1 / -1'}:undefined}>
                  <label htmlFor={k}>{label}{mandatory && ' *'}</label>
                  {tag==='select' ? (
                    <PixelInput as="select" id={k} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}>
                      {k==='license' && LICENSES.map((l)=><option key={l}>{l}</option>)}
                      {k==='type' && (
                        <>
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
                      placeholder={label}
                      rows={rows}
                      value={form[k]}
                      onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                      aria-invalid={!!errs[k]}
                      style={errs[k] ? { borderColor:'var(--zu-accent-sec)' } : undefined}
                    />
                  )}
                  {errs[k] && <Err>{errs[k]}</Err>}
                </FieldWrap>

                {k==='license' && isCustom(form.license) && (
                  <FieldWrap style={{ gridColumn:'1 / -1' }}>
                    <label htmlFor="customLicense">Custom license *</label>
                    <PixelInput
                      as="textarea"
                      id="customLicense"
                      rows={2}
                      placeholder="Enter custom license text or URI"
                      value={form.customLicense}
                      onChange={e=>setForm(f=>({...f,customLicense:e.target.value}))}
                      aria-invalid={!!errs.customLicense}
                      style={errs.customLicense ? { borderColor:'var(--zu-accent-sec)' } : undefined}
                    />
                    {errs.customLicense && <Err>{errs.customLicense}</Err>}
                  </FieldWrap>
                )}
              </React.Fragment>
            ))}

            <div style={{
              gridColumn:'1 / -1',
              display:'flex',
              gap:'.8rem',
              marginTop:'1rem',
            }}>
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
      {overlay.open && (
        <OperationOverlay {...overlay} onCancel={() => setOv({ open:false })} />
      )}
    </section>
  );
}
/* What changed & why:
   • Added inline <Err> feedback under each field for clarity.
   • asciiPrintable now Unicode-safe; emojis & accents accepted.
   • Validation messages updated, control-char wording clearer. */
/* EOF */