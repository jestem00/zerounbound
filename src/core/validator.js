/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/validator.js
  Rev :    r910   2025‑08‑12
  Summary: +validateEditContractFields() centralises contract‑edit
           form checks, returns field‑level messages
──────────────────────────────────────────────────────────────*/
import { Buffer } from 'buffer';

/*──────── regex guards ─────*/
const RE_CTRL_C0 = /[\u0000-\u001F\u007F]/;      // C0 + DEL
const RE_CTRL_C1 = /[\u0080-\u009F]/;            // C1 block

/*──────── protocol limits ──*/
export const OVERHEAD_BYTES = 12_522 + 51;        // 12 573 B fudge
export const MAX_META_BYTES = 32_768;             // Tezos hard‑cap

/*──────── shared length caps ──*/
export const MAX_ATTR        = 10;
export const MAX_ATTR_N      = 32;
export const MAX_ATTR_V      = 32;
export const MAX_TAGS        = 10;
export const MAX_TAG_LEN     = 20;
export const MAX_ROY_PCT     = 25;
export const MAX_EDITIONS    = 10_000;

/*──────── thumbnail helpers ──────────────────────────────────*/
export function calcMaxThumbBytes (baseMetaBytes = 0) {
  const remain = Math.max(0, MAX_META_BYTES - OVERHEAD_BYTES - baseMetaBytes);
  return Math.floor(remain * 3 / 4);
}

/*════════ util helpers ═════*/
export const asciiPrintable   = (s = '') => !(RE_CTRL_C0.test(s) || RE_CTRL_C1.test(s));
export const asciiPrintableLn = (s = '') =>
  !(RE_CTRL_C0.test(s.replace(/\r|\n/g, '')) || RE_CTRL_C1.test(s));
export const isTezosAddress   = (a = '') =>
  /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);
export const listOfTezAddresses = (s = '') =>
  s.split(',').map(t => t.trim()).filter(Boolean).every(isTezosAddress);
export const isPositiveNat      = (n) =>
  /^\d+$/.test(String(n).trim()) && BigInt(n) > 0n;
export const royaltyUnder25     = (shares = {}) =>
  Object.values(shares).reduce((t, bp) => t + bp, 0) / 100 <= MAX_ROY_PCT;
export function validJSONHex(hx = '') {
  try {
    const h = hx.startsWith('0x') ? hx.slice(2) : hx;
    if (!/^[0-9a-f]*$/i.test(h) || (h.length & 1)) return false;
    JSON.parse(Buffer.from(h, 'hex').toString('utf8'));
    return true;
  } catch { return false; }
}
export function validAttributes(arr = []) {
  if (!Array.isArray(arr) || arr.length > MAX_ATTR) return false;
  return arr.every(({ name, value }) =>
    typeof name === 'string'  && typeof value === 'string' &&
    name.length  && value.length &&
    name.length  <= MAX_ATTR_N &&
    value.length <= MAX_ATTR_V &&
    asciiPrintable(name) && asciiPrintable(value)
  );
}
export const fitsByteBudget = (metaBytes = 0, pad = 0) =>
  metaBytes + OVERHEAD_BYTES + pad <= MAX_META_BYTES;

/*──────── misc helpers ──────────────────────────────────────*/
export const urlOkay = (v = '') =>
  !v ? true : /^(https?:\/\/|ipf[sn]s?:\/\/|ar:\/\/)[\w./#?=-]+$/i.test(v.trim());

export const calcRawBytesFromB64 = (b64 = '') =>
  Math.floor(b64.length * 3 / 4) - (b64.endsWith('==') ? 2
      : b64.endsWith('=') ? 1 : 0);

/*──────── central mint‑form validator ──────────────────────*/
/**
 * validateMintFields()
 * @param {object} cfg aggregated form state
 * @returns {{ errors: string[], checklist: {ok,msg}[] }}
 */
export function validateMintFields ({
  f             = {},
  wallet        = '',
  fileSelected  = false,
  fileUrl       = '',
  attrs         = [],
  tags          = [],
  shares        = {},
  contractVer   = 'v4',
  metaBytes     = 0,
  oversize      = false,
}) {
  const checklist = [];
  const add = (test, okMsg, errMsg) => {
    checklist.push({ ok: !!test, msg: test ? okMsg : errMsg });
    return test;
  };

  add(!!wallet,               'Wallet connected',                'Wallet not connected');
  add(f.name && asciiPrintable(f.name),
                               'Name valid',                     'Name required / invalid');
  add(!f.description || asciiPrintableLn(f.description),
                               'Description valid',              'Description control chars');
  add(fileSelected && fileUrl, 'Artifact uploaded',               'Artifact required');
  add(isTezosAddress(f.toAddress),
                               'Recipient address ok',            'Recipient invalid');
  const creatorArr = f.creators.split(',').map(x=>x.trim()).filter(Boolean);
  add(creatorArr.length && creatorArr.every(isTezosAddress),
                               'Creators ok',                     'Creator list invalid');
  add(royaltyUnder25(shares),  'Royalties within cap',            `Royalties > ${MAX_ROY_PCT}%`);
  const amt = parseInt(f.amount || '', 10);
  const editionOk = contractVer === 'v1' ||
    (Number.isInteger(amt) && amt >= 1 && amt <= MAX_EDITIONS);
  add(editionOk,               'Editions in range',               `Editions 1–${MAX_EDITIONS}`);
  add(validAttributes(attrs.filter(a => a.name && a.value)),
                               'Attributes valid',                'Attributes invalid');
  add(f.license && (f.license !== 'Custom' || f.customLicense.trim()),
                               'License set',                     'License required');
  add(f.agree,                 'Terms accepted',                  'Agree to terms');
  add(oversize || metaBytes <= MAX_META_BYTES,
                               'Metadata size ok',                `Metadata > ${MAX_META_BYTES} B`);
  add(tags.length <= MAX_TAGS,
                               'Tag count ok',                    `> ${MAX_TAGS} tags`);

  return { errors: checklist.filter(c => !c.ok).map(c => c.msg), checklist };
}

/*──────── central deploy‑form validator ──────────────────────*/
/**
 * validateDeployFields()
 * @param {object} cfg aggregated form + computed sizes
 * @returns {{ errors: string[], checklist: {ok,msg}[] }}
 */
export function validateDeployFields ({
  data              = {},     /* raw form state                   */
  walletOK          = false,  /* wallet connected & revealed      */
  thumbBytes        = 0,      /* raw thumbnail byte length        */
  metaBodyBytes     = 0,      /* JSON body bytes WITH imageUri    */
  thumbLimitBytes   = 0,      /* derived raw‑byte cap             */
}) {
  const checklist = [];
  const add = (test, okMsg, errMsg) => {
    checklist.push({ ok: !!test, msg: test ? okMsg : errMsg });
    return test;
  };

  add(walletOK,                'Wallet connected',                'Wallet not connected');
  add(data.name && asciiPrintable(data.name),
                               'Name valid',                       'Name required / ASCII only');
  add(data.symbol && /^[A-Z0-9]{3,5}$/.test(data.symbol),
                               'Symbol valid',                     'Symbol 3‑5 A‑Z/0‑9');
  add(data.description && asciiPrintableLn(data.description),
                               'Description valid',                'Description invalid');
  add(urlOkay(data.homepage),
                               'Homepage URL ok',                  'Homepage URL invalid');
  add(data.authors && asciiPrintable(data.authors),
                               'Authors ok',                       'Authors required');
  add(listOfTezAddresses(data.authorAddresses),
                               'Author addresses ok',              'Author addresses invalid');
  add(listOfTezAddresses(data.creators),
                               'Creators ok',                      'Creator list invalid');
  add(data.license &&
      (data.license !== 'Custom…' || (data.customLicense && asciiPrintable(data.customLicense))),
                               'License set',                      'License required');
  add(Boolean(data.imageUri),  'Thumbnail set',                    'Thumbnail required');
  add(thumbBytes <= thumbLimitBytes,
                               'Thumbnail size ok',                `Thumbnail > ${thumbLimitBytes} B`);
  add(fitsByteBudget(metaBodyBytes), 'Metadata size ok',
                               `Metadata > ${MAX_META_BYTES} B`);
  add(data.agree,              'Terms accepted',                   'Agree to terms');

  return { errors: checklist.filter(c => !c.ok).map(c => c.msg), checklist };
}

/*──────── new: edit‑token‑metadata validator ───────────────*/
/**
 * validateEditTokenFields()
 * @param {object} cfg { form:{}, metaBytes:number }
 * @returns {{ errors:string[], checklist:{ok,msg}[] }}
 */
export function validateEditTokenFields ({
  form        = {},
  metaBytes   = 0,
  walletOK    = false,
}) {
  const checklist = [];
  const add = (test, okMsg, errMsg) => {
    checklist.push({ ok: !!test, msg: test ? okMsg : errMsg });
    return test;
  };

  add(walletOK,                'Wallet connected',         'Wallet not connected');
  add(form.name ? asciiPrintable(form.name) : true,
                               'Name printable',           'Name control chars');
  add(form.creators
        ? listOfTezAddresses(form.creators)
        : false,
                               'Creators valid',           'Creators invalid');
  add(!form.authors || asciiPrintable(form.authors),
                               'Authors printable',        'Authors control chars');
  add(form.license &&
      (form.license !== 'Custom…'
        || (form.customLicense && asciiPrintable(form.customLicense))),
                               'License set',              'License required');
  add(!form.tags || form.tags.length <= MAX_TAGS,
                               'Tag count ok',             `> ${MAX_TAGS} tags`);
  add(!form.attributes || validAttributes(form.attributes),
                               'Attributes valid',         'Attributes invalid');
  add(fitsByteBudget(metaBytes),
                               'Metadata size ok',         `Metadata > ${MAX_META_BYTES} B`);

  return { errors: checklist.filter(c => !c.ok).map(c => c.msg), checklist };
}

/*──────── new: edit‑contract‑metadata validator ───────────*/
/**
 * validateEditContractFields()
 * Mirrors deploy‑validator but omits thumbnail rules & symbol regex
 *
 * @param {object} cfg {
 *   data: raw form object,
 *   walletOK: boolean,
 *   metaBytes: number
 * }
 * @returns {{ errors:string[], fieldErrors:Object<string,string>,
 *             checklist:{ok,msg}[] }}
 */
export function validateEditContractFields ({
  data        = {},
  walletOK    = false,
  metaBytes   = 0,
}) {
  const errors      = [];
  const fieldErrors = {};
  const checklist   = [];

  const push = (ok, okMsg, errMsg) => {
    checklist.push({ ok, msg: ok ? okMsg : errMsg });
    if (!ok) errors.push(errMsg);
    return ok;
  };
  const fail = (k, msg) => { fieldErrors[k] = msg; push(false, '', msg); };

  /* wallet */
  push(walletOK, 'Wallet connected', 'Wallet not connected');

  /* name */
  if (!data.name?.trim())            fail('name', 'Required');
  else if (!asciiPrintable(data.name)) fail('name', 'Control char');
  else if (data.name.length > 50)    fail('name', '≤ 50');
  else                                push(true, 'Name ok', '');

  /* symbol 3‑5 upper/num */
  if (!data.symbol?.trim())          fail('symbol', 'Required');
  else if (!/^[A-Z0-9]{3,5}$/.test(data.symbol))
                                    fail('symbol', '3‑5 A‑Z/0‑9');
  else                                push(true, 'Symbol ok', '');

  /* description */
  if (!data.description?.trim())     fail('description', 'Required');
  else if (!asciiPrintableLn(data.description))
                                    fail('description', 'Control char');
  else if (data.description.length > 5000)
                                    fail('description', '≤ 5000');
  else                                push(true, 'Description ok', '');

  /* homepage (optional) */
  if (data.homepage?.trim() &&
      (!urlOkay(data.homepage) || data.homepage.length > 160))
                                    fail('homepage', 'Invalid URL');
  else                                push(true, 'Homepage ok', '');

  /* authors */
  if (!data.authors?.trim())         fail('authors', 'Required');
  else if (!asciiPrintable(data.authors))
                                    fail('authors', 'Control char');
  else if (data.authors.length > 200)
                                    fail('authors', '≤ 200');
  else                                push(true, 'Authors ok', '');

  /* author addresses */
  if (!data.authoraddress?.trim())   fail('authoraddress', 'Required');
  else if (!listOfTezAddresses(data.authoraddress))
                                    fail('authoraddress', 'Comma tz/KT');
  else if (data.authoraddress.length > 200)
                                    fail('authoraddress', '≤ 200');
  else                                push(true, 'Author addr ok', '');

  /* creators */
  if (!data.creators?.trim())        fail('creators', 'Required');
  else if (!listOfTezAddresses(data.creators))
                                    fail('creators', 'Comma tz/KT');
  else if (data.creators.length > 200)
                                    fail('creators', '≤ 200');
  else                                push(true, 'Creators ok', '');

  /* license */
  if (!data.license ||
      (data.license === 'Custom…' && !data.customLicense?.trim()))
                                    fail('license', 'Required');
  else                                push(true, 'License ok', '');

  if (data.license === 'Custom…') {
    if (!asciiPrintable(data.customLicense || ''))
                                    fail('customLicense', 'Control char');
    else if ((data.customLicense || '').length > 120)
                                    fail('customLicense', '≤ 120');
    else                            push(true, 'Custom licence ok', '');
  }

  /* type */
  if (!['art','music','collectible','other'].includes(data.type))
                                    fail('type', 'Required');
  else                                push(true, 'Type ok', '');

  /* byte budget – JSON body only (thumbnail never changes here) */
  push(fitsByteBudget(metaBytes), 'Size ok', `> ${MAX_META_BYTES} B`);

  return { errors, fieldErrors, checklist };
}

/* What changed & why:
   • Added urlOkay export earlier; new validateEditContractFields()
     performs full per‑field & size checks, exposes fieldErrors map.
   • No existing exports altered – deploy & mint validators untouched.
*/
/* EOF */
