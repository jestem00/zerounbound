/*Developed by @jams2blues with love for the Tezos community
  File: src/ui/DeployCollectionForm.jsx
  Rev:   r677
  Summary: derive MAX_THUMB_BYTES from updated OVERHEAD_BYTES */

import React, { useEffect, useMemo, useState } from 'react';
import styledPkg from 'styled-components';
import { char2Bytes } from '@taquito/utils';
import viewsJson from '../../contracts/metadata/views/Zero_Contract_v4_views.json';

import FileUploadPixel from './FileUploadPixel.jsx';
import PixelInput      from './PixelInput.jsx';
import PixelButton     from './PixelButton.jsx';
import { useWallet }   from '../contexts/WalletContext.js';

import {
  asciiPrintable, asciiPrintableLn,
  clean, cleanDescription, listOfTezAddresses,
  OVERHEAD_BYTES, MAX_META_BYTES,
} from '../core/validator.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const Form   = styled.form`display:grid;gap:1rem;max-width:900px;width:100%;`;
const Pair   = styled.div`display:grid;gap:.25rem;`;
const Hint   = styled.span`font-size:.75rem;opacity:.75;`;
const Err    = styled.span`font-size:.8rem;color:var(--zu-accent-sec);`;
const Cnt    = styled.span`font-size:.7rem;justify-self:end;opacity:.75;`;

const LICENSES = [
  'No License, All Rights Reserved',
  'On-Chain NFT License 2.0 KT1S9GHLCrGg5YwoJGDDuC347bCTikefZQ4z',
  'Creative Commons — CC BY 4.0',
  'Creative Commons — CC0 1.0',
  'MIT', 'GPL-3.0', 'CAL-1.0', 'Custom…',
];
const LEN = {
  name: 50, symbol: 5, description: 600,
  authors: 50, addr: 200, creators: 200, license: 120,
  homepage: 160,
};

/*───────────────────────────────────────────────────────────────
  Thumbnail limit
  ── Protocol cap 32 768 B minus current OVERHEAD_BYTES leaves the
     payload budget for the metadata JSON body.
  ── The thumbnail is embedded as base-64, which expands by 4 ⁄ 3.
  ── Max raw bytes = floor((MAX_META_BYTES − OVERHEAD_BYTES) × ¾). */
const MAX_THUMB_BYTES = Math.floor((MAX_META_BYTES - OVERHEAD_BYTES) * 3 / 4);
const MAX_THUMB_KB    = (MAX_THUMB_BYTES / 1024).toFixed(1);

export default function DeployCollectionForm({ onDeploy }) {
  const { address, wallet } = useWallet();

  const [data, setData] = useState({
    name:'', symbol:'', description:'',
    authors:'', authorAddresses:'', creators:'',
    homepage:'', type:'art', license:LICENSES[0], customLicense:'',
    imageUri:'', agree:false,
  });
  const [err, setErr] = useState({});

  const setField = e => {
    const { name, value, type, checked } = e.target;
    let val = type==='checkbox' ? checked : value;
    if (name==='symbol') val = val.toUpperCase();
    setData(p => ({ ...p, [name]: val }));
    setErr(p => ({ ...p, [name]: validate(name, val) }));
  };

  const urlOkay = v => /^(https?:\/\/|ipfs:\/\/|ipns:\/\/|ar:\/\/)[\w./#?=-]+$/i.test(v.trim());

  const validate = (k, v) => {
    switch (k) {
      case 'homepage':
        return !v ? '' : !urlOkay(v) ? 'Must be valid URL' : v.length>LEN.homepage?`≤${LEN.homepage}`:'';
      case 'name':
        return !v ? 'Required' : !asciiPrintable(v) ? 'ASCII only' : v.length>LEN.name?`≤${LEN.name}`:'';
      case 'symbol':
        return !v ? 'Required' : !/^[A-Z0-9]{3,5}$/.test(v)?'3-5 A-Z 0-9':'';
      case 'description':
        return !v ? 'Required' : !asciiPrintableLn(v)?'Illegal chars':v.length>LEN.description?`≤${LEN.description}`:'';
      case 'authors':
        return !v ? 'Required' : !asciiPrintable(v)?'ASCII only':v.length>LEN.authors?`≤${LEN.authors}`:'';
      case 'authorAddresses':
        return !v ? 'Required' : !listOfTezAddresses(v)?'Comma-sep tz':v.length>LEN.addr?`≤${LEN.addr}`:'';
      case 'creators':
        return !v ? 'Required' : !listOfTezAddresses(v)?'Comma-sep tz':v.length>LEN.creators?`≤${LEN.creators}`:'';
      case 'customLicense':
        if (data.license!=='Custom…') return '';
        return !v?'Required':!asciiPrintable(v)?'ASCII only':v.length>LEN.license?`≤${LEN.license}`:'';
      case 'agree':
        return v?'':'Must accept terms';
      default:
        return '';
    }
  };

  useEffect(() => {
    if (!address) return;
    setData(p => ({
      ...p,
      authorAddresses: p.authorAddresses||address,
      creators:        p.creators||address,
    }));
  }, [address]);

  /*──────── metadata builders ───────*/
  const meta = useMemo(() => ({
    name:        clean(data.name, LEN.name),
    symbol:      clean(data.symbol, LEN.symbol),
    description: cleanDescription(data.description, LEN.description),
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

  const bytes = useMemo(() => {
    const bodyHex   = char2Bytes(JSON.stringify(ordered));
    return bodyHex.length / 2 + OVERHEAD_BYTES;
  }, [ordered]);

  const tooBig  = bytes > MAX_META_BYTES;
  const walletOK= Boolean(address && wallet);
  const valid   = walletOK && !tooBig && Object.values(err).every(e=>!e)
                  && data.agree && data.imageUri;

  const handleSubmit = e => {
    e.preventDefault();
    const finalErr = {};
    Object.keys(data).forEach(k => {
      const m = validate(k, data[k]);
      if (m) finalErr[k] = m;
    });
    setErr(finalErr);
    if (Object.keys(finalErr).length) return;
    onDeploy(meta);
  };

  return (
    <Form onSubmit={handleSubmit}>
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
        {err.name && <Err>{err.name}</Err>}
      </Pair>

      {/* symbol */}
      <Pair>
        <label>Symbol* <Hint>(3-5 chars)</Hint></label>
        <PixelInput
          name="symbol"
          maxLength={LEN.symbol}
          placeholder="ZU4"
          value={data.symbol}
          onChange={setField}
        />
        <Cnt>{data.symbol.length}/{LEN.symbol}</Cnt>
        {err.symbol && <Err>{err.symbol}</Err>}
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
        {err.description && <Err>{err.description}</Err>}
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
        {err.homepage && <Err>{err.homepage}</Err>}
      </Pair>

      {/* authors */}
      <Pair>
        <label>Author(s)* <Hint>(comma-sep)</Hint></label>
        <PixelInput
          name="authors"
          maxLength={LEN.authors}
          placeholder="jams2blues, JestemZero"
          value={data.authors}
          onChange={setField}
        />
        <Cnt>{data.authors.length}/{LEN.authors}</Cnt>
        {err.authors && <Err>{err.authors}</Err>}
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
        {err.authorAddresses && <Err>{err.authorAddresses}</Err>}
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
        {err.creators && <Err>{err.creators}</Err>}
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
        {data.license === 'Custom…' && (
          <>
            <PixelInput
              name="customLicense"
              maxLength={LEN.license}
              placeholder="Enter custom license"
              value={data.customLicense}
              onChange={setField}
            />
            <Cnt>{data.customLicense.length}/{LEN.license}</Cnt>
            {err.customLicense && <Err>{err.customLicense}</Err>}
          </>
        )}
      </Pair>

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
        <Hint>Max thumbnail: {MAX_THUMB_KB} KB</Hint>
        {!data.imageUri && <Err>Required</Err>}
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
          Accept <a href="/terms" target="_blank" rel="noopener noreferrer">
            terms
          </a>
        </label>
        {err.agree && <Err>{err.agree}</Err>}
      </Pair>

      {/* metadata size */}
      <Pair>
        <Cnt style={tooBig ? { color:'var(--zu-accent-sec)' } : undefined}>
          Metadata {bytes.toLocaleString()} / {MAX_META_BYTES} bytes
        </Cnt>
        {tooBig && <Err>Exceeds {MAX_META_BYTES.toLocaleString()} bytes</Err>}
      </Pair>

      <PixelButton type="submit" disabled={!valid}>
        {wallet ? 'Deploy' : 'Connect wallet'}
      </PixelButton>
    </Form>
  );
}

/* What changed & why:
   • Included off-chain views and version in the ordered metadata for accurate
     origination payload sizing.
   • Introduced MAX_THUMB_BYTES (11 706 B ≈ 11.4 KB) and Hint to enforce raw
     thumbnail size limit, guiding non-technical artists. */
/*EOF*/