/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/sleepV4a.js
  Rev :    r847   2025-07-12 T08:06 UTC
  Summary: simple Promise-based sleep helper
─────────────────────────────────────────────────────────────*/
export default function sleep (ms = 0) {
  return new Promise((res) => setTimeout(res, ms));
}
/* EOF */
