/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/validator.js
  Rev :    r916  2025‑09‑05 UTC
  Summary: Restore complete validator surface (r913 baseline) and
           keep enhancements: custom‑rows validation, soft media
           guidance, and diff‑bytes check for edit‑flows.
──────────────────────────────────────────────────────────────*/
import { Buffer } from 'buffer';

/*──────── regex guards ─────*/
const RE_CTRL_C0 = /[\u0000-\u001F\u007F]/;      // C0 + DEL
const RE_CTRL_C1 = /[\u0080-\u009F]/;            // C1 block

/*──────── protocol limits ──*/
export const OVERHEAD_BYTES = 12_522 + 51;       // 12 573 B fudge
export const MAX_META_BYTES = 32_768;            // Tezos hard‑cap
export const LOCK_SELF_BYTES = 30_000;           // guard‑rail threshold

/* For edit‑flows: keep soft guard to nudge Append when users try to
   push large data: URIs through edit_token_metadata. */
const MAX_DATA_URI_EDIT_BYTES = 49_152;          // ~48 KiB soft cap (edit flow)

/*──────── shared length caps ──*/
export const MAX_ATTR        = 10;
export const MAX_ATTR_N      = 32;
export const MAX_ATTR_V      = 32;
export const MAX_TAGS        = 30;
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

/** Strict Michelson param budget for origination‑style payloads. */
export const fitsByteBudget = (metaBytes = 0, pad = 0) =>
  metaBytes + OVERHEAD_BYTES + pad <= MAX_META_BYTES;

/*──────── misc helpers ──────────────────────────────────────*/
export const urlOkay = (v = '') =>
  !v ? true : /^(https?:\/\/|ipf[sn]s?:\/\/|ar:\/\/)[\w./#?=%:&-]+$/i.test(v.trim());

export const calcRawBytesFromB64 = (b64 = '') =>
  Math.floor(b64.length * 3 / 4) - (b64.endsWith('==') ? 2
      : b64.endsWith('=') ? 1 : 0);

/** Quick check for fully on‑chain media. */
export const isDataUri = (s = '') => /^data:/i.test(String(s).trim());

/** Soft, UI‑side sanity check for tags (not a hard block). */
export const tagLooksSane = (t = '') =>
  !!t && t.length <= MAX_TAG_LEN && asciiPrintable(t);

/*──────── custom‑rows validation (used by Edit‑Token) ───────*/
/**
 * Accepts rows: { key, type, value }
 * Types: "string" | "number" | "boolean" | "array" | "json" | "data-uri" | "url"
 * Returns a normalised object ready to merge, plus errors & warnings.
 */
export function validateCustomRows(rows = []) {
  const normalized = {};
  const seen = new Set();
  const errors = [];
  const warnings = [];

  const pushErr = (m) => errors.push(m);

  for (const [idx, raw] of rows.entries()) {
    const key  = (raw?.key ?? '').trim();
    const type = (raw?.type ?? 'string').trim();
    const val  = (raw?.value ?? '').toString();

    // Allow single “seed” blank row
    if (!key && !val.trim()) continue;

    if (!key)               { pushErr(`Row ${idx + 1}: key is required`); continue; }
    if (key === 'decimals') { pushErr('Key "decimals" is reserved'); continue; }
    if (seen.has(key))      { pushErr(`Duplicate key "${key}"`); continue; }
    seen.add(key);

    let typed;
    try {
      switch (type) {
        case 'number': {
          const n = Number(val);
          if (!Number.isFinite(n)) throw new Error();
          typed = n; break;
        }
        case 'boolean': {
          const s = val.trim().toLowerCase();
          if (!['true','false','yes','no','1','0'].includes(s)) throw new Error();
          typed = ['true','yes','1'].includes(s); break;
        }
        case 'array': {
          const txt = val.trim();
          typed = txt
            ? (txt.startsWith('[') ? JSON.parse(txt)
               : txt.split(/[,\n;]/).map(x => x.trim()).filter(Boolean))
            : [];
          if (!Array.isArray(typed)) throw new Error();
          break;
        }
        case 'json': {
          const txt = val.trim();
          typed = txt ? JSON.parse(txt) : {};
          if (!typed || typeof typed !== 'object' || Array.isArray(typed)) throw new Error();
          break;
        }
        case 'data-uri': {
          const s = val.trim();
          if (!s) { typed = ''; break; }
          if (!isDataUri(s)) warnings.push(`Key "${key}" is not a data: URI (still allowed).`);
          const bytes = Buffer.byteLength(s, 'utf8');
          if (bytes > MAX_DATA_URI_EDIT_BYTES) pushErr(`Key "${key}" too large for edit flow (> ${MAX_DATA_URI_EDIT_BYTES} B).`);
          typed = s; break;
        }
        case 'url': {
          const s = val.trim();
          if (s && !urlOkay(s)) warnings.push(`Key "${key}" URL looks suspicious.`);
          typed = s; break;
        }
        default: {
          // "string" – control characters are not allowed
          if (!asciiPrintable(val)) pushErr(`Key "${key}" contains control characters`);
          typed = String(val ?? '');
        }
      }
    } catch {
      pushErr(`Key "${key}" has invalid ${type} value`);
      continue;
    }

    normalized[key] = typed;
  }

  return { errors, warnings, normalized };
}

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
  const forceSelf = oversize || metaBytes > LOCK_SELF_BYTES;

  const checklist = [];
  const add = (test, okMsg, errMsg) => {
    checklist.push({ ok: !!test, msg: test ? okMsg : errMsg });
    return test;
  };

  /* prerequisite – wallet always needed when forceSelf */
  add(!!wallet,               'Wallet connected',                'Wallet not connected');

  add(f.name && asciiPrintable(f.name),
                               'Name valid',                     'Name required / invalid');

  add(!f.description || asciiPrintableLn(f.description),
                               'Description valid',              'Description control chars');

  add(fileSelected && fileUrl, 'Artifact uploaded',              'Artifact required');

  add(
    forceSelf ? (f.toAddress === wallet && !!wallet) : isTezosAddress(f.toAddress),
    forceSelf ? 'Recipient = wallet' : 'Recipient address ok',
    forceSelf ? 'Recipient must equal wallet' : 'Recipient invalid',
  );

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

  /* Terms checkbox (present in earlier setup) — restore explicitly */
  add(!!f.agree,               'Terms accepted',                  'Agree to terms');

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
                               'Name valid',                      'Name required / ASCII only');
  add(data.symbol && /^[A-Z0-9]{3,5}$/.test(data.symbol),
                               'Symbol valid',                    'Symbol 3‑5 A‑Z/0‑9');
  add(data.description && asciiPrintableLn(data.description),
                               'Description valid',               'Description invalid');
  add(urlOkay(data.homepage),
                               'Homepage URL ok',                 'Homepage URL invalid');
  add(data.authors && asciiPrintable(data.authors),
                               'Authors ok',                      'Authors required');
  add(listOfTezAddresses(data.authorAddresses),
                               'Author addresses ok',             'Author addresses invalid');
  add(listOfTezAddresses(data.creators),
                               'Creators ok',                     'Creator list invalid');
  add(data.license &&
      (data.license !== 'Custom…' || (data.customLicense && asciiPrintable(data.customLicense))),
                               'License set',                     'License required');
  add(Boolean(data.imageUri),  'Thumbnail set',                   'Thumbnail required');
  add(thumbBytes <= thumbLimitBytes,
                               'Thumbnail size ok',               `Thumbnail > ${thumbLimitBytes} B`);
  add(fitsByteBudget(metaBodyBytes), 'Metadata size ok',
                               `Metadata > ${MAX_META_BYTES} B`);
  add(data.agree,              'Terms accepted',                  'Agree to terms');

  return { errors: checklist.filter(c => !c.ok).map(c => c.msg), checklist };
}

/*──────── edit‑token‑metadata validator (extended) ──────────*/
/**
 * validateEditTokenFields()
 * Back‑compat: if `customRows` omitted, custom checks are skipped.
 * @param {object} cfg {
 *   form: { name?, creators, authors?, license, customLicense?, tags?, attributes? },
 *   metaBytes: number,                 // full/meta bytes if diff unknown
 *   walletOK: boolean,
 *   customRows?: Array<Row>,           // optional [{key,type,value}]
 *   bytesForCheck?: number             // optional: DIFF bytes (preferred)
 * }
 * @returns {{ errors:string[], checklist:{ok,msg}[] }}
 */
export function validateEditTokenFields ({
  form = {},
  metaBytes = 0,
  walletOK = false,
  customRows = [],
  bytesForCheck = null,
}) {
  const checklist = [];
  const add = (test, okMsg, errMsg) => {
    checklist.push({ ok: !!test, msg: test ? okMsg : errMsg });
    return test;
  };

  add(walletOK, 'Wallet connected', 'Wallet not connected');
  add(form.name ? asciiPrintable(form.name) : true,
                      'Name printable',      'Name control chars');
  add(form.creators
        ? listOfTezAddresses(form.creators)
        : false,
                      'Creators valid',      'Creators invalid');
  add(!form.authors || asciiPrintable(form.authors),
                      'Authors printable',   'Authors control chars');

  add(form.license &&
      (form.license !== 'Custom…' || (form.customLicense && asciiPrintable(form.customLicense))),
                      'License set',         'License required');

  add(!form.tags || form.tags.length <= MAX_TAGS,
                      'Tag count ok',        `> ${MAX_TAGS} tags`);
  add(!form.attributes || validAttributes(form.attributes),
                      'Attributes valid',    'Attributes invalid');

  // **Gate on DIFF‑bytes when provided** to avoid false positives on edits
  const sizeToCheck = (typeof bytesForCheck === 'number') ? bytesForCheck : metaBytes;
  add(fitsByteBudget(sizeToCheck), 'Metadata size ok', `Metadata > ${MAX_META_BYTES} B, try Replace Artifact or Replace ExtraUri`);

  // Optional: attach custom‑row errors when supplied
  if (customRows && Array.isArray(customRows)) {
    const cr = validateCustomRows(customRows);
    cr.errors.forEach(e => checklist.push({ ok:false, msg:e }));
  }

  const errors = checklist.filter(c => !c.ok).map(c => c.msg);
  return { errors, checklist };
}

/*──────── edit‑contract‑metadata validator (restored) ───────*/
/**
 * validateEditContractFields()
 * Mirrors deploy‑validator but omits thumbnail rules & symbol regex
 *
 * @param {object} cfg {
 *   data: raw form object,
 *   walletOK: boolean,
 *   metaBytes: number
 * }
 * @returns {{ errors:string[], fieldErrors:Object<string,string>, checklist:{ok,msg}[] }}
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

  /* homepage (optional) — preserve r913 160‑char cap */
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
    else                             push(true, 'Custom licence ok', '');
  }

  /* type */
  if (!['art','music','collectible','other'].includes(data.type))
                                     fail('type', 'Required');
  else                                push(true, 'Type ok', '');

  /* byte budget – JSON body only (no origination overhead) */
  push(
    metaBytes <= MAX_META_BYTES,
    'Size ok',
    `Metadata > ${MAX_META_BYTES} B`,
  );

  return { errors, fieldErrors, checklist };
}

/* What changed & why:
   • Restored full r913 surface (incl. validateEditContractFields, agree‑check).
   • Kept enhancements: validateCustomRows(), isDataUri(), tagLooksSane().
   • Added diff‑bytes option (bytesForCheck) in edit‑token validator to avoid
     false "Metadata > 32 768 B" when only a small subset of keys change. */
