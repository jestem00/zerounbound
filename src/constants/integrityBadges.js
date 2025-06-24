/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/constants/integrityBadges.js
  Rev :    r3      2025‑07‑29
  Summary: richer labels + longForm helper
──────────────────────────────────────────────────────────────*/
export const INTEGRITY_BADGES = {
  full    : '⭐',        // 100 % fully‑on‑chain
  partial : '⛓️‍💥',     // mixes on/off‑chain
  unknown : '❔',        // can’t determine / missing
};

export const INTEGRITY_LABELS = {
  full    : 'Fully on‑chain',
  partial : 'Partially on‑chain',
  unknown : 'Unknown',
};

export const INTEGRITY_LONG = {
  full    : 'Every byte that composes this asset lives permanently on Tezos.',
  partial : 'Some component sits off‑chain or contains unprintable control characters.',
  unknown : 'Validator could not determine the storage strategy for this asset.',
};

/** Convenience accessor */
export function getIntegrityInfo(status = 'unknown') {
  return {
    badge : INTEGRITY_BADGES[status] || INTEGRITY_BADGES.unknown,
    label : INTEGRITY_LABELS[status] || INTEGRITY_LABELS.unknown,
    blurb : INTEGRITY_LONG  [status] || INTEGRITY_LONG.unknown,
  };
}
/* What changed & why: added long‑form descriptions for pop‑up dialog. */
/* EOF */
