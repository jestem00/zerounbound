import React, { useEffect, useMemo, useState } from 'react';
import styledPkg from 'styled-components';
import { char2Bytes } from '@taquito/utils';
import viewsJson from '../../contracts/metadata/views/Zero_Contract_v4_views.json';

import MintUpload    from './Entrypoints/MintUpload.jsx';
import MintPreview   from './Entrypoints/MintPreview.jsx';
import PixelInput    from './PixelInput.jsx';
import PixelButton   from './PixelButton.jsx';
import PixelHeading  from './PixelHeading.jsx';
import { useWallet } from '../contexts/WalletContext.js';

import {
  OVERHEAD_BYTES, MAX_META_BYTES, calcRawBytesFromB64,
  calcMaxThumbBytes, validateDeployFields,
} from '../core/validator.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styles ───────────────────────────────────────────*/
const Wrap   = styled.div`position:relative;max-width:900px;width:100%;`;
const Form   = styled.form`
  display:grid;
  gap:clamp(.6rem,1.5vh,.9rem);
  width:100%;
`;
const CloseBtn = styled(PixelButton)`
  position:absolute;
  top:-.2rem;
  right:-.2rem;
  padding:.2rem .5rem;
  line-height:1;
  font-size:.7rem;
`;
const Pair   = styled.div`display:grid;gap:.25rem;`;
const Hint   = styled.span`font-size:.75rem;opacity:.75;`;
const Cnt    = styled.span`font-size:.7rem;justify-self:end;opacity:.75;`;
const ChecklistBox = styled.ul`
  list-style:none;padding:0;margin:.35rem 0 0;font-size:.68rem;
  li{display:flex;gap:.3rem;align-items:center;}
  li.ok::before {content:"✓";color:var(--zu-accent);}
  li.bad::before{content:"✗";color:var(--zu-accent-sec);}
`;

/*──────── field caps ──────────────────────────────────────*/
const LEN = {
  name:50, symbol:5, description:600,
  authors:50, addr:200, creators:200, license:120,
  homepage:160,
};

const LICENSES = [
  'No License, All Rights Reserved',
  'On-Chain NFT License 2.0 KT1S9GHLCrGg5YwoJGDDuC347bCTikefZQ4z',
  'Creative Commons — CC BY 4.0',
  'Creative Commons — CC0 1.0',
  'MIT','GPL-3.0','CAL-1.0','Custom…',
];

/*════════════════ component ════════════════════════════════*/
export default function DeployCollectionForm({ onDeploy }) {
  const { address, wallet } = useWallet();
  const [data, setData] = useState({
    name:'', symbol:'', description:'', homepage:'',
    authors:'', authorAddresses:'', creators:'',
    type:'art', license:LICENSES[0], customLicense:'',
    imageUri:'', agree:false,
  });
  const [secretKey, setSecretKey] = useState('');

  const setField = e => {
    const { name, value, type, checked } = e.target;
    let val = type === 'checkbox' ? checked : value;
    if (name === 'symbol') val = val.toUpperCase();
    setData(p => ({ ...p, [name]: val }));
  };

  /* autofill */
  useEffect(() => {
    if (!address) return;
    setData(p => ({
      ...p,
      authorAddresses: p.authorAddresses || address,
      creators: p.creators || address,
    }));
  }, [address]);

  /*──────── metadata builders ──────────────────────────────*/
  const metaBase = useMemo(() => ({
    name: data.name.trim(),
    symbol: data.symbol.trim(),
    description: data.description.trim(),
    license: data.license === 'Custom…' ? data.customLicense.trim() : data.license,
    authors: data.authors.split(',').map(s => s.trim()),
    authoraddress: data.authorAddresses.split(',').map(s => s.trim()),
    creators: data.creators.split(',').map(s => s.trim()),
    homepage: data.homepage.trim() || undefined,
    type: data.type,
    interfaces: ['TZIP-012','TZIP-016'],
    views: viewsJson.views,
  }), [data]);

  /* baseline meta (no thumbnail) */
  const baseBytes = useMemo(() => (
    char2Bytes(JSON.stringify({ ...metaBase, imageUri: '' })).length / 2
  ), [metaBase]);

  /* per‑form thumbnail limit */
  const thumbLimit = useMemo(() => calcMaxThumbBytes(baseBytes), [baseBytes]);

  /* thumbnail size detection */
  const thumbBytes = useMemo(() => {
    const b64 = data.imageUri.split(',')[1] || '';
    return calcRawBytesFromB64(b64);
  }, [data.imageUri]);

  /* full meta including thumbnail */
  const metaBodyBytes = useMemo(() => (
    baseBytes + (data.imageUri ? Math.ceil(thumbBytes * 4/3) : 0)
  ), [baseBytes, thumbBytes, data.imageUri]);

  /* validation */
  const { errors, checklist } = validateDeployFields({
    data,
    walletOK: Boolean((address && wallet) || secretKey),
    thumbBytes,
    metaBodyBytes,
    thumbLimitBytes: thumbLimit,
  });

  const handleSubmit = e => {
    e.preventDefault();
    if (errors.length) return;
    onDeploy({
      ...metaBase,
      imageUri: data.imageUri,
      ...(secretKey ? { secretKey: secretKey.trim() } : {}),
    });
  };

  /*──────── render ─────────────────────────────────────────*/
  return (
    <Wrap>
      <CloseBtn $sec type="button" aria-label="Close"
        onClick={() => { if (typeof window !== 'undefined') { window.location.href = '/'; } }}>
        ✕
      </CloseBtn>

      <Form onSubmit={handleSubmit}>
        <PixelHeading level={3}>Deploy ZeroContract v4 Collection</PixelHeading>

        {/* name */}
        <Pair>
          <label>Name*</label>
          <PixelInput name="name" maxLength={LEN.name} placeholder="Collection title"
            value={data.name} onChange={setField} />
          <Cnt>{data.name.length}/{LEN.name}</Cnt>
        </Pair>

        {/* symbol */}
        <Pair>
          <label>Symbol* <Hint>(3‑5 chars)</Hint></label>
          <PixelInput name="symbol" maxLength={LEN.symbol} placeholder="ZU4"
            value={data.symbol} onChange={setField} />
          <Cnt>{data.symbol.length}/{LEN.symbol}</Cnt>
        </Pair>

        {/* description */}
        <Pair>
          <label>Description*</label>
          <PixelInput as="textarea" rows="4" maxLength={LEN.description}
            name="description" placeholder="What is this collection?"
            value={data.description} onChange={setField} />
          <Cnt>{data.description.length}/{LEN.description}</Cnt>
        </Pair>

        {/* homepage */}
        <Pair>
          <label>Homepage <Hint>(optional)</Hint></label>
          <PixelInput name="homepage" maxLength={LEN.homepage}
            placeholder="https://example.com"
            value={data.homepage} onChange={setField} />
          <Cnt>{data.homepage.length}/{LEN.homepage}</Cnt>
        </Pair>

        {/* authors */}
        <Pair>
          <label>Author(s)* <Hint>(comma‑sep)</Hint></label>
          <PixelInput name="authors" maxLength={LEN.authors}
            placeholder="jams2blues, JestemZero"
            value={data.authors} onChange={setField} />
          <Cnt>{data.authors.length}/{LEN.authors}</Cnt>
        </Pair>

        {/* author addresses */}
        <Pair>
          <label>Author Address(es)*</label>
          <PixelInput name="authorAddresses" maxLength={LEN.addr}
            placeholder={address || 'tz1…'} value={data.authorAddresses}
            onChange={setField} />
        </Pair>

        {/* creators */}
        <Pair>
          <label>Creator wallet(s)*</label>
          <PixelInput name="creators" maxLength={LEN.creators}
            placeholder={address || 'tz1…'} value={data.creators}
            onChange={setField} />
        </Pair>

        {/* license */}
        <Pair>
          <label>License*</label>
          <PixelInput as="select" name="license" value={data.license} onChange={setField}>
            {LICENSES.map(l => <option key={l}>{l}</option>)}
          </PixelInput>
        </Pair>
        {data.license === 'Custom…' && (
          <Pair>
            <PixelInput name="customLicense" maxLength={LEN.license}
              placeholder="Enter custom license"
              value={data.customLicense} onChange={setField} />
            <Cnt>{data.customLicense.length}/{LEN.license}</Cnt>
          </Pair>
        )}

        {/* type */}
        <Pair>
          <label>Type*</label>
          <PixelInput as="select" name="type" value={data.type} onChange={setField}>
            <option value="art">Art</option>
            <option value="music">Music</option>
            <option value="collectible">Collectible</option>
            <option value="other">Other</option>
          </PixelInput>
        </Pair>

        {/* thumbnail */}
        <Pair>
          <label style={{ textAlign: 'center' }}>
            Collection Thumbnail&nbsp;<Hint>(1:1 recommended)</Hint>
          </label>

          <MintUpload
            accept="image/*"
            maxFileSize={thumbLimit}
            btnText="Select Thumbnail"
            onFileDataUrlChange={uri => setData(p => ({ ...p, imageUri: uri }))}
          />

          {data.imageUri && (
            <MintPreview
              dataUrl={data.imageUri}
              fileName="thumbnail"
              $level={1}
            />
          )}
          <Hint>Max thumbnail: {(thumbLimit / 1024).toFixed(1)} KB</Hint>
        </Pair>

        {/* terms */}
        <Pair>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" name="agree"
              checked={data.agree} onChange={setField} />
            Accept&nbsp;
            <a href="/terms" target="_blank" rel="noopener noreferrer">terms</a>
          </label>
        </Pair>

        {/* override secret key */}
        <Pair>
          <label>Private key override <Hint>(advanced)</Hint></label>
          <PixelInput name="secretKey" maxLength={200}
            placeholder="edsk…" value={secretKey}
            onChange={e => setSecretKey(e.target.value)} />
        </Pair>

        {/* meta size + checklist */}
        <Pair>
          <Cnt style={metaBodyBytes + OVERHEAD_BYTES > MAX_META_BYTES
            ? { color: 'var(--zu-accent-sec)' }
            : undefined}>
            Meta&nbsp;{(metaBodyBytes + OVERHEAD_BYTES).toLocaleString()} / {MAX_META_BYTES} B
          </Cnt>
          {(metaBodyBytes + OVERHEAD_BYTES > MAX_META_BYTES) && (
            <Hint style={{ color: 'var(--zu-accent-sec)' }}>
              Exceeds contract metadata hard‑limit. Trim fields or thumbnail.
            </Hint>
          )}
        </Pair>

        <ChecklistBox>
          {checklist.map((c, i) => (
            <li key={i} className={c.ok ? 'ok' : 'bad'}>{c.msg}</li>
          ))}
        </ChecklistBox>

        <PixelButton type="submit" disabled={errors.length}>
          {(wallet || secretKey) ? 'Deploy' : 'Connect wallet'}
        </PixelButton>
      </Form>
    </Wrap>
  );
}