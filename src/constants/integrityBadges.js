/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/constants/integrityBadges.js
  Rev :    r2   2025‑07‑24
  Summary: badge ⇆ label map + helper
──────────────────────────────────────────────────────────────*/
export const INTEGRITY_BADGES = {
  full    : '⭐',    // 100 % fully‑on‑chain
  partial : '⛓️‍💥', // mixes on/off‑chain
  unknown : '❔',    // can’t determine / missing
};

/* Mobile‑/a11y‑friendly short text */
export const INTEGRITY_LABELS = {
  full    : 'Fully on‑chain',
  partial : 'Partially on‑chain',
  unknown : 'Unknown integrity',
};

/**
 * Convenience accessor
 * @param {'full'|'partial'|'unknown'} status
 * @returns {{ badge:string, label:string }}
 */
export function getIntegrityInfo(status = 'unknown') {
  return {
    badge : INTEGRITY_BADGES[status] || INTEGRITY_BADGES.unknown,
    label : INTEGRITY_LABELS[status] || INTEGRITY_LABELS.unknown,
  };
}
/* What changed & why:
   • Added explicit label map so UI can surface meaning on mobile.
   • Helper `getIntegrityInfo()` centralises lookup. */
/* EOF */
