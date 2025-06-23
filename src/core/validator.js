/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/validator.js
  Rev :    r876   2025‑07‑29
  Summary: overhead +51 B fudge (binary map tags)
──────────────────────────────────────────────────────────────*/
import { Buffer } from 'buffer';

/*──────── regex guards ─────*/
const RE_CTRL_C0 = /[\u0000-\u001F\u007F]/;      // C0 + DEL
const RE_CTRL_C1 = /[\u0080-\u009F]/;            // C1 block

/*──────── protocol limits ──
   On‑chain measurement showed our operation was 51 B heavier than
   the JSON+map math predicted (Michelson tags + length headers for
   2 strings & 2 bytes values).  Added exact 51 B fudge so that the
   UI blocks before the node does. */
export const OVERHEAD_BYTES = 12_522 + 51;        // 12 573 B
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
  return Math.floor(remain * 3 / 4);             // inverse b64 inflation
}

/*════════ util helpers (existing) ═════*/
export const asciiPrintable   = (s = '') => !(RE_CTRL_C0.test(s) || RE_CTRL_C1.test(s));
export const asciiPrintableLn = (s = '') =>
  !(RE_CTRL_C0.test(s.replace(/\r|\n/g, '')) || RE_CTRL_C1.test(s));
export const isTezosAddress   = (a = '') =>
  /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);
export const listOfTezAddresses = (s = '') =>
  s.split(',').map(t => t.trim()).every(isTezosAddress);
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

/* What changed & why:
   • Removed static MAX_THUMB_BYTES; added calcMaxThumbBytes().
   • validateDeployFields() now derives per‑form thumb cap.
   • Rev bumped to r875. */
/* EOF */