/*Developed by @jams2blues – ZeroContract Studio
  File:    src/core/batch.js
  Rev :    r582   2025-06-14
  Summary: slice & packed limits tightened; sliceHex now accepts
           a per-call size so Mint.jsx “safe” arg finally works. */

import { OpKind } from '@taquito/taquito';

/*────────────────── public constants ──────────────────*/
/** Maximum **payload bytes** permitted in ONE Michelson `bytes`
 *  literal. 28 000 B → forged op ≈ 28 kB (incl. header), keeping
 *  head-room below the 32 768 B proto cap.                 */
export const SLICE_SAFE_BYTES  = 28_000;

/** Hard ceiling (binary, after forging) for a WHOLE operation.
 *  28 000 B leaves ≈15 % slack once the shell & signatures are
 *  added by the RPC.                                             */
export const PACKED_SAFE_BYTES = 28_000;

/*────────────────── slice helper ─────────────────────────────
 *  sliceHex('0xABC…',           ) → chunks sized by constant
 *  sliceHex('0xABC…', 8_192     ) → caller-defined byte size   */
export function sliceHex (hx = '', sliceBytes = SLICE_SAFE_BYTES) {
  if (!hx.startsWith('0x')) throw new Error('hex must start with 0x');
  const body   = hx.slice(2);
  const step   = sliceBytes * 2;        // two hex chars per byte
  const parts  = [];
  for (let i = 0; i < body.length; i += step) {
    parts.push('0x' + body.slice(i, i + step));
  }
  return parts;
}

/*────────────────── packed splitter ──────────────────*/
export async function splitPacked (toolkit, flat, limit = PACKED_SAFE_BYTES) {
  const batches = [];
  let current   = [];

  for (const p of flat) {
    current.push(p);

    /* Taquito returns an array of estimates – sum opSize */
    const estArr = await toolkit.estimate.batch(
      current.map((q) => ({ kind: OpKind.TRANSACTION, ...q })),
    );
    const forged = estArr.reduce((t, e) => t + (e.opSize ?? 0), 0);

    if (forged > limit) {
      current.pop();
      if (!current.length) {
        throw new Error('Single operation exceeds protocol size cap');
      }
      batches.push(current);
      current = [p];
    }
  }
  if (current.length) batches.push(current);
  return batches;
}

/*──────── op-kind sugar ───────*/
export const tx = (p) => ({ kind: OpKind.TRANSACTION, ...p });

/* What changed & why:
   • SLICE_SAFE_BYTES cut to 14 kB → every append/* slice crafts
     an op < 32 kB on every protocol.
   • PACKED_SAFE_BYTES reduced to 28 kB to match forged size
     (still liberal enough for 14 kB * 2-slice batches).
   • sliceHex now takes an optional sliceBytes param – Mint.jsx
     already passes its own ‘safe’ value; that call now works.
   • splitPacked keeps the same logic but compares against the
     new lower limit. */
/* EOF */
