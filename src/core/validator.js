/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/core/validator.js
  Rev :    r714   2025-07-05
  Summary: allow full-Unicode, still block control chars
──────────────────────────────────────────────────────────────*/

const RE_CTRL_C0 = /[\u0000-\u001F\u007F]/;    // C0 + DEL
const RE_CTRL_C1 = /[\u0080-\u009F]/;          // C1 set (often hidden)

/**
 * Michelson map + JSON wrapper overhead.
 *  • Static Michelson map framing:            12 499 B
 *  • “tezos-storage:content” key header:          23 B
 */
export const OVERHEAD_BYTES = 12_499 + 23;      // 12 522 B total
export const MAX_META_BYTES = 32_768;           // protocol hard-cap (bytes)

/*──────── helpers ───────*/
/** True ⇢ string contains no C0/C1 control chars (emoji OK) */
export const asciiPrintable = (s = '') =>
  !(RE_CTRL_C0.test(s) || RE_CTRL_C1.test(s));

/** Same as ↑ but allows CR/LF new-lines */
export const asciiPrintableLn = (s = '') =>
  !(RE_CTRL_C0.test(s.replace(/\r|\n/g, '')) || RE_CTRL_C1.test(s));

export const isTezAddress = (a = '') =>
  /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);

export const listOfTezAddresses = (s = '') =>
  s.split(',').map((t) => t.trim()).every(isTezAddress);

/*──────── cleaners ───────*/
export function clean(s = '', max = 100) {
  const out = s.normalize('NFC').trim();
  if (!asciiPrintable(out)) throw new Error('Control characters');
  if (out.length > max) throw new Error(`≤ ${max} characters`);
  return out;
}

export function cleanDescription(s = '', max = 5000) {
  let out = s
    .replace(/\t/g, ' ')
    .replace(/[ \t]+\r?\n/g, '\n')
    .normalize('NFC')
    .replace(/\r?\n/g, '\r\n');

  if (!asciiPrintableLn(out)) throw new Error('Control characters');
  if (out.length > max) throw new Error(`≤ ${max} characters`);
  return out;
}

/* What changed & why:
   • asciiPrintable / asciiPrintableLn now accept all UTF-8
     (emoji, accented chars) while still rejecting C0/C1 set. */
/* EOF */
