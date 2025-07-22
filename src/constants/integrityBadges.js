/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/constants/integrityBadges.js
  Rev :    r5      2025‑07‑22
  Summary: corrected emoji glyphs for badges (chain + collision)
           and reverted to literal star/question mark for safer display.
─────────────────────────────────────────────────────────────*/

// Emoji badges representing on‑chain integrity states.  Keep these
// simple strings for use in titles, listings and pop‑ups.  If you
// change these, ensure they remain 1–2 characters so they don’t
// disturb layout.
export const INTEGRITY_BADGES = {
  // Literal emoji values used for status badges.  Using the native
  // characters ensures correct rendering (⛓️‍💥 for partial, ⭐ for full)
  // across all environments.
  full    : '⭐',        // 100 % fully‑on‑chain
  partial : '⛓️‍💥',     // mixes on/off‑chain
  unknown : '❔',        // can’t determine / missing
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
     screens while retaining the meaning.
   • Corrected the emoji glyphs: the partial badge now uses the
     proper chain and collision characters (⛓️‍💥), and star/question
     mark badges revert to literal emojis for accurate display.
   • Added documentation and kept accessor function consistent.
*/
/* EOF */