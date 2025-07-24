/*Developed by @jams2blues – ZeroContract Studio
File: AGENTS.md
Rev : r7 2025‑07‑24 UTC
Summary: contributor guide – unified single‑stage origination. Remote forge removed.
*/

Zero Unbound v4 — Contributor & Codex Guide
This guide aligns human and AI contributors working on the ZeroUnbound
project. Always reload the Manifest and TZIP invariants before you
write code or documentation.

1 · Repo at a Glance
The project structure, critical entry points and manifest references remain
unchanged from previous revisions and can be found in the Manifest
documentation. Refer to docs/Master_Overview_And_Manifest_zerounbound_contractmanagement.md
for a detailed source‑tree map and invariant ledger.

2 · Local / Codex Dev Bootstrap
To set up your local environment:

corepack enable && corepack prepare yarn@4.9.1 --activate
yarn install --immutable

choose the network before dev or build
yarn set:ghostnet # or yarn set:mainnet
yarn dev # runs at http://localhost:3000

In Codex tasks the above runs automatically via scripts/codex‑setup.sh.

2.1 Environment Flags
The v4 deployment flow now uses a single‑stage origination by default.
The UI constructs the full on‑chain metadata on the client and then
originates the contract directly via TezosToolkit.wallet.originate()
for all wallets. The remote forge service has been removed and there
is no Temple‑specific forging path. FAST_ORIGIN and USE_BACKEND flags
remain removed. Resume support via localStorage remains available for
patch operations if needed.

Network selection remains in src/config/deployTarget.js.

3 · Validating Changes
Linting, tests and bundling commands remain the same. See previous
revision for details.

4 · Style & Architecture Rules
Unchanged. Refer to earlier revision for specifics on style, media
handling, fetch usage, and invariants.

5 · Commit & PR Convention
Unchanged. Use Conventional Commits and append a progress‑ledger row to
every PR body.

6 · Working With Codex
Unchanged. Follow the guidelines for Ask and Code modes.

7 · Directory Pointers
Unchanged. See the Manifest for a complete map of critical files and
entry‑points.

/* What changed & why: Updated to r7. Removed the remote forge service and Temple-specific forging path. All wallets now originate via TezosToolkit.wallet.originate() with a single‑stage flow. FAST_ORIGIN and USE_BACKEND remain removed. Updated summary and Environment Flags accordingly. */