/*Developed by @jams2blues with love for the Tezos community
  File: src/core/validator.js
  Rev:   r527
  Summary: Adjust metadata overhead to include header size for accurate op-sizing 
*/

const RE_CTRL_C0 = /[\u0000-\u001F\u007F]/;    // C0 + DEL
const RE_CTRL_C1 = /[\u0080-\u009F]/;          // C1 set (often hidden)

/**
 * Michelson map overhead (bytes) plus 23-byte header for
 * 'tezos-storage:content' key (char2Bytes('…').length/2 = 23).
 */
export const OVERHEAD_BYTES = 5_960 + 23;       // 5 983 bytes total
export const MAX_META_BYTES  = 32_768;          // max operation data length (32 768 B)

/*──────── helpers ───────*/
export const asciiPrintable  = (s = '') => /^[\u0020-\u007E]+$/.test(s);
export const asciiPrintableLn= (s = '') => /^[\u0020-\u007E\r\n]+$/.test(s);

export const isTezAddress = (a = '') =>
  /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);

export const listOfTezAddresses = (s = '') =>
  s.split(',').map(t => t.trim()).every(isTezAddress);

/*──────── cleaners ───────*/
export function clean(s = '', max = 100) {
  const out = s.normalize('NFC').trim();
  if (RE_CTRL_C0.test(out) || RE_CTRL_C1.test(out))
    throw new Error('Control characters');
  if (out.length > max) throw new Error(`≤ ${max} characters`);
  return out;
}

export function cleanDescription(s = '', max = 5000) {
  let out = s.replace(/\t/g, ' ')
             .replace(/[ \t]+\r?\n/g, '\n')
             .normalize('NFC')
             .replace(/\r?\n/g, '\r\n');

  if (RE_CTRL_C0.test(out.replace(/\r|\n/g, '')) || RE_CTRL_C1.test(out))
    throw new Error('Control characters');
  if (out.length > max) throw new Error(`≤ ${max} characters`);
  return out;
}

/* What changed & why:
   • Increased OVERHEAD_BYTES by 23 to account for the 23-byte header
     key “tezos-storage:content”, ensuring our metadata-size counter
     now matches on-chain operation sizing. */
