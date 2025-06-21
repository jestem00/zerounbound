/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/utils/sleepV4a.js
  Rev :    r845   2025-07-12 T07:20 UTC
  Summary: tiny promise-based delay helper
─────────────────────────────────────────────────────────────*/
export default function sleep (ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
/* EOF */
