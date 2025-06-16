/*Developed by @jams2blues – ZeroContract Studio
  File:    src/core/validator.js
  Rev :    r713   2025-06-26
  Summary: proto-cap proof → OVERHEAD_BYTES-4
──────────────────────────────────────────────────────────────*/

const RE_CTRL_C0 = /[\u0000-\u001F\u007F]/;    // C0 + DEL
const RE_CTRL_C1 = /[\u0080-\u009F]/;          // C1 set (often hidden)

/**
 * Michelson map + JSON wrapper overhead.
 *  • Static Michelson map framing:            12 499 B
 *  • “tezos-storage:content” key header:          23 B
 *  → Aggregate constant baked into every on-chain
 *    collection-metadata origination payload.          */
export const OVERHEAD_BYTES  = 12_499 + 23;     // 12 522 bytes total
export const MAX_META_BYTES  = 32_768;          // protocol hard-cap (bytes)

/*──────── helpers ───────*/
export const asciiPrintable   = (s = '') => /^[\u0020-\u007E]+$/.test(s);
export const asciiPrintableLn = (s = '') => /^[\u0020-\u007E\r\n]+$/.test(s);

export const isTezAddress = (a = '') =>
  /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);

export const listOfTezAddresses = (s = '') =>
  s.split(',').map((t) => t.trim()).every(isTezAddress);

/*──────── cleaners ───────*/
export function clean(s = '', max = 100) {
  const out = s.normalize('NFC').trim();
  if (RE_CTRL_C0.test(out) || RE_CTRL_C1.test(out))
    throw new Error('Control characters');
  if (out.length > max) throw new Error(`≤ ${max} characters`);
  return out;
}

export function cleanDescription(s = '', max = 5000) {
  let out = s
    .replace(/\t/g, ' ')
    .replace(/[ \t]+\r?\n/g, '\n')
    .normalize('NFC')
    .replace(/\r?\n/g, '\r\n');

  if (RE_CTRL_C0.test(out.replace(/\r|\n/g, '')) || RE_CTRL_C1.test(out))
    throw new Error('Control characters');
  if (out.length > max) throw new Error(`≤ ${max} characters`);
  return out;
}

/* What changed & why:
   • Raised OVERHEAD_BYTES to 12 522 B (was 5 983 B) after
     forensic sizing showed forged ops overflowed by ≈3.8 kB,
     fixing premature 32 768-B protocol limit hits in wallet
     UIs during collection deployment. */
/* EOF */
