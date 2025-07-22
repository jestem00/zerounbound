/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/constants/integrityBadges.js
  Rev :    r4      2025‑07‑22
  Summary: shorten partial blurb and expose uniform accessor
           for status badges, labels and blurbs.
─────────────────────────────────────────────────────────────*/

// Emoji badges representing on‑chain integrity states.  Keep these
// simple strings for use in titles, listings and pop‑ups.  If you
// change these, ensure they remain 1–2 characters so they don’t
// disturb layout.
export const INTEGRITY_BADGES = {
  // Use unicode escape sequences to avoid storing literal emoji.  This
  // bypasses certain build pipelines and file syncing issues while
  // preserving the visual representation at runtime.
  full    : '\u2B50',                 // ⭐ 100 % fully‑on‑chain
  partial : '\u2693\uFE0F\u200D\uD83D\uDD25', // ⛓️‍💥 mixes on/off‑chain
  unknown : '\u2754',                // ❔ can’t determine / missing
};

// Short labels shown alongside the badge in the modal.
export const INTEGRITY_LABELS = {
  full    : 'Fully on‑chain',
  partial : 'Partially on‑chain',
  unknown : 'Unknown',
};

// Longer descriptions displayed in the pop‑up.  These blurbs should
// be concise to avoid overflow on small screens.  Use hyphenation
// (‑) to allow words to wrap and avoid extremely long terms.
export const INTEGRITY_LONG = {
  full    : 'Every byte that composes this asset lives permanently on Tezos.',
  partial : 'Some component is off‑chain or contains control characters.',
  unknown : 'Validator could not determine the storage strategy for this asset.',
};

/**
 * Convenience accessor returning the badge, label and blurb for a
 * given integrity status.  If an unknown status is provided, the
 * unknown defaults will be returned.  Callers can destructure
 * these values to populate UI elements consistently.
 *
 * @param {string} status – one of "full", "partial" or "unknown"
 * @returns {{ badge: string, label: string, blurb: string }}
 */
export function getIntegrityInfo(status = 'unknown') {
  return {
    badge : INTEGRITY_BADGES[status] || INTEGRITY_BADGES.unknown,
    label : INTEGRITY_LABELS[status] || INTEGRITY_LABELS.unknown,
    blurb : INTEGRITY_LONG  [status] || INTEGRITY_LONG.unknown,
  };
}

/* What changed & why:
   • Shortened the partial blurb to avoid overflow on very small
     screens while retaining the meaning (off‑chain or control
     characters).
   • Added documentation and kept accessor function consistent.
*/
/* EOF */