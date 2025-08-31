/* Developed by @jams2blues – ZeroContract Studio
   File: src/utils/formatTez.js
   Rev : r1   2025-08-31
   Summary: Consistent, no-rounding XTZ formatters. Convert mutez (integer)
            into a human string with up to 6 fractional digits, trimming
            trailing zeros and adding thousands separators to the integer
            part. Intended for UI display of listing and offer prices. */

function groupInt(s) {
  return String(s).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatMutez(mutez, { trimZeros = true } = {}) {
  if (mutez == null || mutez === '') return '';
  let n;
  try { n = BigInt(String(mutez)); }
  catch { const num = Number(mutez); if (!Number.isFinite(num)) return ''; n = BigInt(Math.trunc(num)); }
  let sign = '';
  if (n < 0n) { sign = '-'; n = -n; }
  const denom = 1_000_000n;
  const int  = n / denom;
  const frac = n % denom;
  let fracStr = frac.toString().padStart(6, '0');
  if (trimZeros) fracStr = fracStr.replace(/0+$/, '');
  const intStr = groupInt(int.toString());
  return sign + (fracStr ? `${intStr}.${fracStr}` : intStr);
}

export function formatTez(tez, { trimZeros = true } = {}) {
  if (tez == null || tez === '') return '';
  // Convert to mutez exactly if possible, then reuse formatMutez
  const s = String(tez).trim();
  if (!/^[-+]?\d*(?:\.\d+)?$/.test(s)) return String(tez);
  const neg = s.startsWith('-');
  const [i = '0', f = ''] = s.replace(/^[-+]/, '').split('.');
  const frac6 = (f + '000000').slice(0, 6); // truncate beyond 6 digits (no rounding)
  try {
    let mu = BigInt(i) * 1_000_000n + BigInt(frac6);
    if (neg) mu = -mu;
    return formatMutez(mu, { trimZeros });
  } catch {
    return String(tez);
  }
}

export default { formatMutez, formatTez };

