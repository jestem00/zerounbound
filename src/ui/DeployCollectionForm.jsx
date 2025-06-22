/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/DeployCollectionForm.jsx
  Rev :    r679   2025‑07‑23
  Summary: unified central validation + live checklist
──────────────────────────────────────────────────────────────*/
import React, { useEffect, useMemo, useState } from 'react';
import styledPkg from 'styled-components';
import { char2Bytes } from '@taquito/utils';
import viewsJson from '../../contracts/metadata/views/Zero_Contract_v4_views.json';

import FileUploadPixel   from './FileUploadPixel.jsx';
import PixelInput        from './PixelInput.jsx';
import PixelButton       from './PixelButton.jsx';
import PixelHeading      from './PixelHeading.jsx';
import { useWallet }     from '../contexts/WalletContext.js';

import {
  OVERHEAD_BYTES, MAX_META_BYTES, MAX_THUMB_BYTES,
  calcRawBytesFromB64, validateDeployFields,
} from '../core/validator.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styles ───────────────────────────────────────────*/
const Form   = styled.form`
  display: grid;
  gap: clamp(.6rem, 1.5vh, .9rem);
  max-width: 900px;
  width: 100%;
`;
const Pair   = styled.div`display: grid; gap: .25rem;`;
const Hint   = styled.span`font-size: .75rem; opacity: .75;`;
const Cnt    = styled.span`font-size: .7rem; justify-self: end; opacity: .75;`;
const ChecklistBox = styled.ul`
  list-style:none;padding:0;margin:.35rem 0 0;font-size:.68rem;
  li { display:flex;gap:.3rem;align-items:center; }
  li.ok::before  { content:"✓";color:var(--zu-accent); }
  li.bad::before { content:"✗";color:var(--zu-accent-sec); }
`;

/*──────── field caps (visual hints only) ───────────────────*/
const LEN = {
  name: 50, symbol: 5, description: 600,
  authors: 50, addr: 200, creators: 200, license: 120,
  homepage: 160,
};

const LICENSES = [
  'No License, All Rights Reserved',
  'On-Chain NFT License 2.0 KT1S9GHLCrGg5YwoJGDDuC347bCTikefZQ4z',
  'Creative Commons — CC BY 4.0',
  'Creative Commons — CC0 1.0',
  'MIT', 'GPL-3.0', 'CAL-1.0', 'Custom…',
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

  const setField = e => {
    const { name, value, type, checked } = e.target;
    let val = type==='checkbox' ? checked : value;
    if (name==='symbol') val = val.toUpperCase();
    setData(p => ({ ...p, [name]: val }));
  };

  /* autofill from wallet */
  useEffect(() => {
    if (!address) return;
    setData(p => ({
      ...p,
      authorAddresses: p.authorAddresses || address,
      creators:        p.creators        || address,
    }));
  }, [address]);

  /*──────── metadata builders ───────────────────────────────*/
  const meta = useMemo(() => ({
    name:        data.name.trim(),
    symbol:      data.symbol.trim(),
    description: data.description.trim(),
    license:     data.license==='Custom…' ? data.customLicense.trim() : data.license,
    authors:     data.authors.split(',').map(s=>s.trim()),
    authoraddress:data.authorAddresses.split(',').map(s=>s.trim()),
    creators:    data.creators.split(',').map(s=>s.trim()),
    homepage:    data.homepage.trim()||undefined,
    type:        data.type,
    interfaces:  ['TZIP-012','TZIP-016'],
    imageUri:    data.imageUri,
  }), [data]);

  const ordered = useMemo(() => ({
    ...meta,
    version: 'ZeroContractV4',
    views:   viewsJson.views,
  }), [meta]);

  /* size calculations */
  const metaBodyBytes = useMemo(() => char2Bytes(JSON.stringify(ordered)).length / 2, [ordered]);
  const thumbnailBytes = useMemo(() => {
    const b64 = data.imageUri.split(',')[1] || '';
    return calcRawBytesFromB64(b64);
  }, [data.imageUri]);

  /*──────── central validation ──────────────────────────────*/
  const { errors, checklist } = validateDeployFields({
    data, walletOK: Boolean(address && wallet),
    thumbBytes: thumbnailBytes,
    metaBodyBytes,
  });

  const handleSubmit = e => {
    e.preventDefault();
    if (errors.length) return;
    onDeploy(meta);
  };

  /*──────── render ─────────────────────────────────────────*/
  return (
    <Form onSubmit={handleSubmit}>
      <PixelHeading level={3}>Deploy ZeroContract v4 Collection</PixelHeading>

      {/* name */}
      <Pair>
        <label>Name*</label>
        <PixelInput
          name="name"
          maxLength={LEN.name}
          placeholder="Collection title"
          value={data.name}
          onChange={setField}
        />
        <Cnt>{data.name.length}/{LEN.name}</Cnt>
      </Pair>

      {/* symbol */}
      <Pair>
        <label>Symbol* <Hint>(3‑5 chars)</Hint></label>
        <PixelInput
          name="symbol"
          maxLength={LEN.symbol}
          placeholder="ZU4"
          value={data.symbol}
          onChange={setField}
        />
        <Cnt>{data.symbol.length}/{LEN.symbol}</Cnt>
      </Pair>

      {/* description */}
      <Pair>
        <label>Description*</label>
        <PixelInput
          as="textarea"
          rows="4"
          maxLength={LEN.description}
          name="description"
          placeholder="What is this collection?"
          value={data.description}
          onChange={setField}
        />
        <Cnt>{data.description.length}/{LEN.description}</Cnt>
      </Pair>

      {/* homepage */}
      <Pair>
        <label>Homepage <Hint>(optional)</Hint></label>
        <PixelInput
          name="homepage"
          maxLength={LEN.homepage}
          placeholder="https://example.com"
          value={data.homepage}
          onChange={setField}
        />
        <Cnt>{data.homepage.length}/{LEN.homepage}</Cnt>
      </Pair>

      {/* authors */}
      <Pair>
        <label>Author(s)* <Hint>(comma‑sep)</Hint></label>
        <PixelInput
          name="authors"
          maxLength={LEN.authors}
          placeholder="jams2blues, JestemZero"
          value={data.authors}
          onChange={setField}
        />
        <Cnt>{data.authors.length}/{LEN.authors}</Cnt>
      </Pair>

      {/* author addresses */}
      <Pair>
        <label>Author Address(es)*</label>
        <PixelInput
          name="authorAddresses"
          maxLength={LEN.addr}
          placeholder={address || 'tz1…'}
          value={data.authorAddresses}
          onChange={setField}
        />
      </Pair>

      {/* creators */}
      <Pair>
        <label>Creator wallet(s)*</label>
        <PixelInput
          name="creators"
          maxLength={LEN.creators}
          placeholder={address || 'tz1…'}
          value={data.creators}
          onChange={setField}
        />
      </Pair>

      {/* license */}
      <Pair>
        <label>License*</label>
        <PixelInput
          as="select"
          name="license"
          value={data.license}
          onChange={setField}
        >
          {LICENSES.map(l => <option key={l} value={l}>{l}</option>)}
        </PixelInput>
      </Pair>
      {data.license === 'Custom…' && (
        <Pair>
          <PixelInput
            name="customLicense"
            maxLength={LEN.license}
            placeholder="Enter custom license"
            value={data.customLicense}
            onChange={setField}
          />
          <Cnt>{data.customLicense.length}/{LEN.license}</Cnt>
        </Pair>
      )}

      {/* type */}
      <Pair>
        <label>Type*</label>
        <PixelInput
          as="select"
          name="type"
          value={data.type}
          onChange={setField}
        >
          <option value="art">Art</option>
          <option value="music">Music</option>
          <option value="collectible">Collectible</option>
          <option value="other">Other</option>
        </PixelInput>
      </Pair>

      {/* thumbnail */}
      <Pair>
        <label style={{ textAlign:'center' }}>
          Collection Thumbnail (1:1 recommended)
        </label>
        <FileUploadPixel
          value={data.imageUri}
          onSelect={uri => setData(p => ({ ...p, imageUri: uri }))}
          maxFileSize={MAX_THUMB_BYTES}
        />
        <Hint>Max thumbnail: {(MAX_THUMB_BYTES/1024).toFixed(1)} KB</Hint>
      </Pair>

      {/* terms */}
      <Pair>
        <label style={{ display:'flex', alignItems:'center', gap:6 }}>
          <input
            type="checkbox"
            name="agree"
            checked={data.agree}
            onChange={setField}
          />
          Accept&nbsp;
          <a href="/terms" target="_blank" rel="noopener noreferrer">terms</a>
        </label>
      </Pair>

      {/* metadata size + checklist */}
      <Pair>
        <Cnt style={metaBodyBytes + OVERHEAD_BYTES > MAX_META_BYTES
          ? { color:'var(--zu-accent-sec)' } : undefined}>
          Meta&nbsp;{(metaBodyBytes+OVERHEAD_BYTES).toLocaleString()} / {MAX_META_BYTES} B
        </Cnt>
      </Pair>

      <ChecklistBox>
        {checklist.map((c, i) => (
          <li key={i} className={c.ok ? 'ok' : 'bad'}>{c.msg}</li>
        ))}
      </ChecklistBox>

      <PixelButton type="submit" disabled={errors.length}>
        {wallet ? 'Deploy' : 'Connect wallet'}
      </PixelButton>
    </Form>
  );
}

/* What changed & why:
   • Re‑wired validation to central validator.validateDeployFields().
   • Added live checklist identical to Mint UX.
   • Thumbnail size + meta size calculated against shared caps.
   • Rev bumped, inline field‑by‑field errors removed (now checklist). */
/* EOF */
