<!--Developed by @jams2blues with love for the Tezos community
  File: docs/README_contract_management.md
  Summary: Dev primer for ZeroUnbound v4 contract-management module -->

# ZeroUnbound v4 — Contract-Management Suite

| Key file | Purpose |
|----------|---------|
| `src/pages/manage.js` | Dashboard page — carousels + admin actions |
| `src/hooks/useContracts.js` | RPC-only discovery, cache, metadata |
| `src/data/hashMatrix.json` | FNV-1a hash ↔ version lookup |
| `src/data/entrypointsRegistry.json` | Canonical admin entrypoints |
| `src/components/…` | Pixel-UI components (Card, Carousel, Toolbar) |

## Local setup

```bash
# 1 · install deps
yarn

# 2 · generate bundles (summaries)
yarn bundle

# 3 · dev server (ghostnet by default)
yarn dev

# Note: Compute FNV-1a hash of the script via:
node scripts/hash.js <path/to/contract.tz>
