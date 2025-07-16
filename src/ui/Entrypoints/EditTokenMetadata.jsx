/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/EditTokenMetadata.jsx
  Rev :    r936   2025‑09‑05
  Summary: warn on >30 tags; tooltip on disabled CTA
──────────────────────────────────────────────────────────────*/
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import styledPkg, { createGlobalStyle }           from 'styled-components';
import { MichelsonMap }                           from '@taquito/michelson-encoder';
import { char2Bytes }                             from '@taquito/utils';
import { OpKind }                                 from '@taquito/taquito';
import { Buffer }                                 from 'buffer';

import PixelHeading           from '../PixelHeading.jsx';
import PixelInput             from '../PixelInput.jsx';
import PixelButton            from '../PixelButton.jsx';
import LoadingSpinner         from '../LoadingSpinner.jsx';
import TokenMetaPanel         from '../TokenMetaPanel.jsx';
import OperationConfirmDialog from '../OperationConfirmDialog.jsx';
import OperationOverlay       from '../OperationOverlay.jsx';

import listLiveTokenIds       from '../../utils/listLiveTokenIds.js';
import useTxEstimate          from '../../hooks/useTxEstimate.js';
import { useWalletContext }   from '../../contexts/WalletContext.js';
import { jFetch }             from '../../core/net.js';

import {
  validateEditTokenFields,
  validAttributes,
  MAX_ATTR, MAX_ATTR_N, MAX_ATTR_V, MAX_TAGS,
} from '../../core/validator.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── GLOBAL FIX ─────────────────────────────────────────*/
const Break700 = createGlobalStyle`
  [data-zu-entry="edit-token"] div[style*="max-width: 700px"]{
    max-width:100%!important;width:100%!important;
  }
`;

/*──────── layout shells ─────────────────────────────────────*/
const GridWrap  = styled.div`
  display:grid;grid-template-columns:repeat(12,1fr);
  gap:1.6rem;width:100%;overflow-x:hidden;
  @media(min-width:1800px){gap:1.2rem;}
  @media(max-width:1100px){grid-template-columns:1fr;}
`;
const FormGrid  = styled.div`
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
const PickerWrap = styled.div`display:flex;gap:.6rem;`;
const Box        = styled.div`position:relative;flex:1;`;
const Spin       = styled(LoadingSpinner).attrs({ size:16 })`
  position:absolute;top:8px;right:8px;
`;
const Err       = styled.span`font-size:.8rem;color:var(--zu-accent-sec);`;
const HelpBox   = styled.p`font-size:.75rem;line-height:1.25;margin:.5rem 0 .9rem;`;
const Row       = styled.div`
  display:grid;grid-template-columns:1fr 1fr auto;
  gap:.6rem;align-items:center;
`;
const RoyalRow  = styled(Row)`margin-bottom:.4rem;`;
const RoyHeading = styled(PixelHeading).attrs({ level:5 })`
  white-space:normal;line-height:1.25;font-size:1rem;
  @media(max-width:500px){font-size:.9rem;}
`;

/*──────── constants & helpers ───────────────────────────────*/
const CUSTOM_LABEL = 'Custom…';
const LICENSES = [
  'No License, All Rights Reserved',
  'On-Chain NFT License 2.0 KT1S9GHLCrGg5YwoJGDDuC347bCTikefZQ4z',
  'Creative Commons — CC BY 4.0',
  'Creative Commons — CC0 1.0',
  'MIT', 'GPL-3.0', 'CAL-1.0', CUSTOM_LABEL,
];
const ALIAS_RX        = /\ball\s+rights\s+reserved\b/i;
const MAX_ROY_PCT     = 25;
const MAX_ROY_ENTRIES = 8;
const isCustom        = (v='') => v === CUSTOM_LABEL || v === 'Custom…';
const enc             = (v) => (typeof v === 'object' ? JSON.stringify(v) : String(v));
const fromHex         = (h='')=>/^0x[0-9a-f]+$/i.test(h)?Buffer.from(h.slice(2),'hex').toString('utf8'):h;
const isTezosAddress  = (a='')=>/^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);
const matchLicence    = (raw='')=>{
  const s = raw.trim().toLowerCase();
  const direct = LICENSES.find((l)=>l.toLowerCase()===s);
  if (direct) return direct;
  return ALIAS_RX.test(s) ? 'No License, All Rights Reserved' : null;
};

/*════════ component ════════════════════════════════════════*/
export default function EditTokenMetadata({
  contractAddress = '',
  setSnackbar     = () => {},
  onMutate        = () => {},
}) {
  const { toolkit, address: wallet, network = 'ghostnet' } = useWalletContext() || {};
  const snack = useCallback(
    (m, s='info') => setSnackbar({ open:true, message:m, severity:s }),
    [setSnackbar],
  );

  /* route marker for Break700 */
  useEffect(() => {
    document.body.setAttribute('data-zu-entry', 'edit-token');
    return () => document.body.removeAttribute('data-zu-entry');
  }, []);

  const BASE = network === 'mainnet'
    ? 'https://api.tzkt.io/v1'
    : 'https://api.ghostnet.tzkt.io/v1';

  /*──────── token list (unchanged) ──────────────────────────*/
  const [tokOpts, setTokOpts] = useState([]);
  const [loadingTok, setLTok] = useState(false);
  const [tokenId, setTokenId] = useState('');
  useEffect(() => {
    if (!contractAddress) return;
    (async () => {
      setLTok(true);
      setTokOpts(await listLiveTokenIds(contractAddress, network, true));
      setLTok(false);
    })();
  }, [contractAddress, network]);

  /*──────── remote meta & flags ────────────────────────────*/
  const [meta, setMeta]             = useState(null);
  const [loading, setLoad]          = useState(false); /* ← restored */
  const [hasArtists, setHasArtists] = useState(false); /* legacy key */

  useEffect(() => { if (!tokenId) return;
    (async () => {
      setLoad(true);
      try {
        const [row] = await jFetch(
          `${BASE}/tokens?contract=${contractAddress}&tokenId=${tokenId}&limit=1`,
        ).catch(() => []);
        const m = row?.metadata ? { ...row.metadata } : {};

        /* licence alias fix */
        if (m.rights && !m.license) m.license = m.rights;
        if (typeof m.license === 'string') m.license = fromHex(m.license);

        /* I103: artists ↔ authors */
        if (!m.authors && m.artists) m.authors = m.artists;
        setHasArtists(!!m.artists && !m.authors);

        ['authors', 'creators'].forEach((k)=>
          Array.isArray(m[k]) && (m[k]=m[k].join(', ')));

        /* tags / attributes normalisation */
        m.tagsArr = Array.isArray(m.tags)
          ? m.tags
          : typeof m.tags === 'string'
            ? m.tags.split(/[,;\n]/).map((s)=>s.trim()).filter(Boolean)
            : [];

        m.attrsArr = Array.isArray(m.attributes)
          ? m.attributes
          : m.attributes && typeof m.attributes === 'object'
            ? Object.entries(m.attributes).map(([name,value])=>({name,value}))
            : [];

        setMeta(m);
      } finally { setLoad(false); }
    })();
  }, [tokenId, contractAddress, BASE]);

  /*──────── local form state ─────────────────────*/
  const [form, setForm] = useState({
    name:'', description:'', authors:'', creators:'',
    license:CUSTOM_LABEL, customLicense:'',
    contentRating:'none', flashing:false,
  });
  const [tags,  setTags ]  = useState([]);
  const [attrs, setAttrs]  = useState([{ name:'', value:'' }]);
  const [roys,  setRoys ]  = useState([{ address:'', sharePct:'' }]);

  useEffect(() => { if (!meta) return;
    const licMatch = matchLicence(meta.license);
    const shares   = meta.royalties?.shares || {};
    setRoys(Object.keys(shares).length
      ? Object.entries(shares).map(([a, v]) => ({ address:a, sharePct:(+v / 100).toString() }))
      : [{ address:'', sharePct:'' }]);

    setForm({
      name:meta.name??'', description:meta.description??'',
      authors:meta.authors??'', creators:meta.creators??'',
      license:licMatch || CUSTOM_LABEL,
      customLicense:licMatch ? '' : (meta.license ?? ''),
      contentRating:meta.contentRating || 'none',
      flashing:!!(meta.accessibility?.hazards || []).includes('flashing'),
    });
    setTags(meta.tagsArr);
    setAttrs(meta.attrsArr.length ? meta.attrsArr : [{ name:'', value:'' }]);
  }, [meta]);

  /*──────── royalties helpers ───────────────────*/
  const setRoy = (i, k, v) => setRoys((p) => { const n=[...p]; n[i][k]=v; return n; });
  const addRoy = () => roys.length < MAX_ROY_ENTRIES &&
    setRoys((p) => [...p, { address:'', sharePct:'' }]);
  const delRoy = (i) => setRoys((p) => p.filter((_, idx) => idx !== i));
  const shares = useMemo(() => {
    const o = {};
    roys.forEach(({ address, sharePct }) => {
      const pct = parseFloat(sharePct);
      if (isTezosAddress(address) && pct > 0) o[address.trim()] = Math.round(pct * 100);
    });
    return o;
  }, [roys]);
  const totalPct = useMemo(() => Object.values(shares).reduce((t, v) => t + v, 0) / 100, [shares]);


  /*──────── attribute helpers ───────────────────*/
  const setAttr = (i, k, v) => {
    if ((k === 'name' && v.length > MAX_ATTR_N) || (k === 'value' && v.length > MAX_ATTR_V)) return;
    setAttrs((p) => { const n=[...p]; n[i][k]=v; return n; });
  };
  const addAttr = () => attrs.length < MAX_ATTR &&
    setAttrs((p) => [...p, { name:'', value:'' }]);
  const delAttr = (i) => setAttrs((p) => p.filter((_, idx) => idx !== i));

   /*──────── metaBlob & validation ──────────────────────────*/
  const cleanAttrs = useMemo(() => attrs.filter((a)=>a.name&&a.value), [attrs]);
  const AUTHORS_KEY = useMemo(
    () => (hasArtists ? 'artists' : 'authors'),
    [hasArtists],
  );

  const computedLicense = isCustom(form.license)
    ? (form.customLicense.trim() || meta?.license || '')
    : form.license;

  const metaBlob = {
    ...(form.name.trim()           && { name:form.name }),
    ...(form.description.trim()    && { description:form.description }),
    ...(form.authors.trim()        && { [AUTHORS_KEY]:form.authors }),
    ...(form.creators.trim()       && { creators:form.creators }),
    ...(computedLicense            && { license:computedLicense, rights:computedLicense }),
    ...(Object.keys(shares).length && { royalties:{ decimals:4, shares } }),
    ...(form.contentRating === 'mature' && { contentRating:'mature' }),
    ...(form.flashing && { accessibility:{ hazards:['flashing'] } }),
    ...(tags.length                && { tags }),
    ...(cleanAttrs.length          && { attributes:cleanAttrs }),
  };

  /* additional validation (immutable flags) */
  const cannotUnset =
    (meta?.contentRating === 'mature' && form.contentRating !== 'mature') ||
    ((meta?.accessibility?.hazards || []).includes('flashing') && !form.flashing);

  const metaBytes = Buffer.byteLength(JSON.stringify(metaBlob), 'utf8');
  const { errors } = useMemo(() => validateEditTokenFields({
    form:{ ...form, tags, attributes:cleanAttrs }, metaBytes, walletOK:!!wallet,
  }), [form, tags, cleanAttrs, metaBytes, wallet]);
  const tagErr = tags.length > MAX_TAGS;
  if (totalPct > MAX_ROY_PCT) errors.push('Royalties exceed limit');
  if (cannotUnset)            errors.push('Contract v4 forbids removing “mature” or “flashing” flags');
  if (tagErr)                 errors.push(`> ${MAX_TAGS} tags`);

  /*──────── contract handle (wallet‑bound) ──────*/
  const [contractHandle, setHandle] = useState(null);
  useEffect(() => { let dead=false;
    if (!toolkit || !contractAddress){ setHandle(null); return; }
    (async () => {
      try {
        const c = await toolkit.wallet.at(contractAddress);
        if (!dead) setHandle(c);
      } catch (e) { console.error(e); }
    })();
    return () => { dead = true; };
  }, [toolkit, contractAddress]);

  /*── diffMap: ensure current snapshot uses same key (authors|artists) ──*/
  const diffMap = useMemo(() => {
    if (!meta) return new MichelsonMap();
    const cur = {
      name:meta.name, description:meta.description,
      [AUTHORS_KEY]:meta[AUTHORS_KEY],
      creators:meta.creators, license:meta.license, royalties:meta.royalties,
      contentRating:meta.contentRating, accessibility:meta.accessibility,
      tags:meta.tagsArr, attributes:meta.attrsArr,
    };
    const m = new MichelsonMap();
    Object.entries(metaBlob).forEach(([k,v])=>{
      if (enc(v)!==enc(cur[k])) m.set(k,'0x'+char2Bytes(enc(v)));
    });
    return m;
  }, [meta, metaBlob, AUTHORS_KEY]);

  /*── memoised params: identity changes only when diff content does ──*/
  const paramsRef    = useRef([]);
  const paramsKeyRef = useRef('');
  const diffKey      = useMemo(() =>
    [...diffMap.entries()].map(([k, v]) => `${k}:${v}`).sort().join('|'),
  [diffMap]);

  const params = useMemo(() => {
    if (!contractHandle || diffMap.size === 0) return [];
    if (paramsKeyRef.current === diffKey) return paramsRef.current;
    const p = [{
      kind:OpKind.TRANSACTION,
      ...contractHandle.methods.edit_token_metadata(diffMap, +tokenId).toTransferParams(),
    }];
    paramsRef.current    = p;
    paramsKeyRef.current = diffKey;
    return p;
  }, [contractHandle, diffKey, tokenId, diffMap]);

  /*──────── UI/submit guards ─────────────────────*/
  const disabled    = !tokenId || errors.length > 0 || !toolkit || !contractHandle;
  const [confirmOpen, setConfirm] = useState(false);
  const est = useTxEstimate(toolkit, (confirmOpen && contractHandle) ? params : []);

  const [ov, setOv] = useState({ open:false });
  const submit = async () => {
    try {
      if (diffMap.size === 0) return snack('No changes', 'warning');
      if (!contractHandle)    return snack('Contract not ready', 'error');
      setOv({ open:true, status:'Waiting for signature…', total:1, current:1 });
      const op = await contractHandle.methods.edit_token_metadata(diffMap, +tokenId).send();
      setOv({ open:true, status:'Broadcasting…', total:1, current:1 });
      await op.confirmation();
      setOv({ open:true, opHash:op.opHash, total:1, current:1 });
      snack('Token metadata updated', 'success'); onMutate();
    } catch (e) {
      snack(e.message, 'error'); setOv({ open:false });
    }
  };

  /*──────── render ───────────────────────────────*/
  return (
    <section data-zu-entry="edit-token">
      <Break700/>
      <PixelHeading level={3}>Edit Token Metadata</PixelHeading>
      <HelpBox>
        Contract v4 can <b>only add or overwrite</b> keys — it cannot remove them.
        Edit fields then <b>UPDATE</b>. For custom licence choose “Custom…” and
        paste text. Royalties rows auto‑convert (≤ {MAX_ROY_PCT}%).
      </HelpBox>

      {/* picker */}
      <PickerWrap>
        <FieldWrap style={{ flex:1 }}>
          <label htmlFor="tokenId">Token ID *</label>
          <PixelInput
            id="tokenId"
            placeholder="e.g. 42"
            value={tokenId}
            onChange={(e) => setTokenId(e.target.value.replace(/\D/g, ''))}
            aria-required="true"
            aria-invalid={tokenId === ''}
          />
        </FieldWrap>

        <Box>
          <label htmlFor="tokenSelect" style={{ display:'none' }}>Select token</label>
          <select
            id="tokenSelect"
            style={{ width:'100%', height:32 }}
            disabled={loadingTok}
            value={tokenId || ''}
            onChange={(e) => setTokenId(e.target.value)}
          >
            <option value="">
              {loadingTok ? 'Loading…' : tokOpts.length ? 'Select token' : '— none —'}
            </option>
            {tokOpts.map(({ id, name }) => (
              <option key={id} value={id}>{name ? `${id} — ${name}` : id}</option>
            ))}
          </select>
          {loadingTok && <Spin/>}
        </Box>
      </PickerWrap>

      {loading && <LoadingSpinner size={32} style={{ margin:'1rem auto' }}/>}

      {meta && (
        <GridWrap>
          {/* form */}
          <FormGrid style={{ gridColumn:'1 / span 8' }}>
            {[{ k:'name', label:'Name', mandatory:true },
              { k:'description', label:'Description', tag:'textarea', rows:4 },
              { k:'authors', label:'Author(s)', tag:'textarea', rows:2 },
              { k:'creators', label:'Creator wallet(s)', tag:'textarea', rows:2, mandatory:true }]
              .map(({ k, label, tag, rows, mandatory }) => (
              <FieldWrap
                key={k}
                style={k === 'description' ? { gridColumn:'1 / -1' } : undefined}
              >
                <label htmlFor={k}>{label}{mandatory ? ' *' : ''}</label>
                <PixelInput
                  as={tag}
                  id={k}
                  rows={rows}
                  value={form[k]}
                  onChange={(e) => setForm((f) => ({ ...f, [k]:e.target.value }))}
                />
              </FieldWrap>
            ))}

            {/* licence */}
            <FieldWrap>
              <label>License *</label>
              <PixelInput
                as="select"
                value={form.license}
                onChange={(e) => setForm((f) => ({ ...f, license:e.target.value }))}
              >
                {LICENSES.map((l) => <option key={l}>{l}</option>)}
              </PixelInput>
            </FieldWrap>
            {isCustom(form.license) && (
              <FieldWrap style={{ gridColumn:'1 / -1' }}>
                <label>Custom license *</label>
                <PixelInput
                  as="textarea"
                  rows={2}
                  value={form.customLicense}
                  onChange={(e) => setForm((f) => ({ ...f, customLicense:e.target.value }))}
                />
              </FieldWrap>
            )}

            {/* royalties */}
            <FieldWrap style={{ gridColumn:'1 / -1' }}>
              <RoyHeading>
                Royalties (≤ {MAX_ROY_PCT}% total – current {totalPct}%)
              </RoyHeading>
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
                    onChange={(e) => setRoy(i, 'sharePct', e.target.value.replace(/[^0-9.]/g, ''))}
                  />
                  {i === 0 ? (
                    <PixelButton size="xs" onClick={addRoy} disabled={roys.length >= MAX_ROY_ENTRIES}>＋</PixelButton>
                  ) : (
                    <PixelButton size="xs" onClick={() => delRoy(i)}>－</PixelButton>
                  )}
                </RoyalRow>
              ))}
              {totalPct > MAX_ROY_PCT && <Err>Royalties exceed {MAX_ROY_PCT}%</Err>}
            </FieldWrap>

            {/* rating / flashing */}
            <FieldWrap>
              <label>Content rating</label>
              <PixelInput
                as="select"
                value={form.contentRating}
                onChange={(e) => setForm((f) => ({ ...f, contentRating:e.target.value }))}
              >
                <option value="none">Unrated / safe</option>
                <option value="mature">mature</option>
              </PixelInput>
            </FieldWrap>
            <FieldWrap>
              <label>Flashing hazard</label>
              <PixelInput
                as="select"
                value={form.flashing ? 'yes' : 'no'}
                onChange={(e) => setForm((f) => ({ ...f, flashing:e.target.value === 'yes' }))}
              >
                <option value="no">No flashing</option>
                <option value="yes">Contains flashing</option>
              </PixelInput>
            </FieldWrap>

            {/* attributes */}
            <FieldWrap style={{ gridColumn:'1 / -1' }}>
              <label>Attributes</label>
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
                    <PixelButton size="xs" onClick={addAttr} disabled={attrs.length >= MAX_ATTR}>＋</PixelButton>
                  ) : (
                    <PixelButton size="xs" onClick={() => delAttr(i)}>－</PixelButton>
                  )}
                </Row>
              ))}
              {!validAttributes(cleanAttrs) && <Err>Attributes invalid</Err>}
            </FieldWrap>

            {/* CTA + error list */}
            <div
              style={{
                gridColumn:'1 / -1',
                display:'flex',
                flexDirection:'column',
                gap:'.6rem',
                marginTop:'1rem',
              }}
            >
              <PixelButton
                disabled={disabled}
                onClick={() => setConfirm(true)}
                title={tagErr ? `> ${MAX_TAGS} tags` : undefined}
              >
                {contractHandle ? 'UPDATE' : 'Connecting…'}
              </PixelButton>

              {errors.length > 0 && (
                <ul style={{margin:0,paddingInlineStart:'1rem'}}>
                  {errors.map((e, i) => (
                    <li key={i} style={{fontSize:'.75rem',color:'var(--zu-accent-sec)'}}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          </FormGrid>

          {/* preview */}
          <div style={{ gridColumn:'span 4', minWidth:0 }}>
            <TokenMetaPanel
              meta={{ ...(meta || {}), ...metaBlob }}
              tokenId={tokenId}
              contractAddress={contractAddress}
            />
          </div>
        </GridWrap>
      )}

      {confirmOpen && (
        <OperationConfirmDialog
          open
          slices={1}
          estimate={{ feeTez:est.feeTez, storageTez:est.storageTez }}
          onOk={() => { setConfirm(false); submit(); }}
          onCancel={() => setConfirm(false)}
        />
      )}
      {ov.open && <OperationOverlay {...ov} onCancel={() => setOv({ open:false })}/>}
    </section>
  );
}
/* What changed & why:
   • Re‑introduced `const [loading, setLoad] = useState(false);`
     that was dropped in r934, fixing ReferenceError.
   • No behavioural changes beyond restoring state.
   • Rev bumped to r935. */
/* EOF */