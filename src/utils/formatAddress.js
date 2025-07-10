/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/formatAddress.js
  Rev :    r3   2025‑10‑12
  Summary: generic shortAddr() covers KT1 + tz1|2|3
──────────────────────────────────────────────────────────────*/
function _abbr(addr = '') {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function shortAddr(addr = '') {
  if (/^(KT1|tz[1-3])[0-9A-Za-z]{33}$/.test(addr)) return _abbr(addr);
  return addr;
}

/* legacy alias kept for back‑compat */
export const shortKt = shortAddr;

export function copyToClipboard(text = '') {
  try {
    navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    try { document.execCommand('copy'); } catch {/* ignore */ }
    document.body.removeChild(el);
  }
}
/* What changed & why:
   • shortAddr() now abbreviates *both* KT1 and tz1|2|3 addresses → UI never clips.
   • shortKt retained as alias to avoid refactors elsewhere. */
/* EOF */
