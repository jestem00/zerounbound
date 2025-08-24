# Patch r1203 — IndexedDB slice-cache, deterministic slicing, signature prediction

**Date:** 2025-08-21 20:57 UTC

This patch delivers:
- IndexedDB-backed slice checkpoints (`src/utils/sliceCache.js`, `sliceCacheV4a.js`), including
  transparent LocalStorage→IDB migration and TTL/GC.
- Centralized deterministic slicer (`src/core/slicing.js`) with I55 headroom and helpers.
- Fee estimator now predicts signature count and exposes slice parts (`src/core/feeEstimator.js`).
- Entrypoint UIs (`AppendArtifactUri.jsx`, `RepairUri.jsx`) now display exact estimated
  slices/signatures and use IDB checkpoints to resume safely.
- Jest tests for keys/slicing/signature counts.

All files include headers/footers per collaboration contract.
