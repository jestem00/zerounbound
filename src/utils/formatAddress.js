/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/formatAddress.js
  Rev :    r2     2025‑08‑20
  Summary: smarter KT abbrev (4‑4) + graceful clipboard fallback
──────────────────────────────────────────────────────────────*/
export function shortKt(addr = '') {
  if (!/^KT1[0-9A-Za-z]{33}$/.test(addr)) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function copyToClipboard(text = '') {
  try {
    navigator.clipboard.writeText(text);
  } catch {
    /* fallback ‑ hidden textarea */
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
/* What changed & why (r2):
   • Abbreviation now 4‑prefix/4‑suffix → clearer identity.
   • Clipboard fallback for Safari/iOS private‑mode. */
/* EOF */
