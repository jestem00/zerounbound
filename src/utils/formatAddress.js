/*
  Developed by @jams2blues — ZeroContract Studio
  File:    src/utils/formatAddress.js
  Rev :    r4   2025-08-29
  Summary: generic shortAddr() covers KT1 + tz1|2|3; legacy alias retained.
*/

function _abbr(addr = '') {
  const s = String(addr);
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

export function shortAddr(addr = '') {
  const s = String(addr || '');
  return /^(KT1|tz[1-3])[0-9A-Za-z]{33}$/.test(s) ? _abbr(s) : s;
}

// legacy alias kept for back-compat
export const shortKt = shortAddr;

export function copyToClipboard(text = '') {
  try {
    navigator.clipboard.writeText(text);
  } catch {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    } catch {
      // ignore
    }
  }
}

/* What changed & why:
   - shortAddr() abbreviates both KT1 and tz1|2|3 addresses using ASCII ellipsis.
   - shortKt retained as alias to avoid refactors elsewhere.
*/
