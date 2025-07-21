/──────── AGENTS.md ────────/
/*Developed by @jams2blues – ZeroContract Studio
File: AGENTS.md
Rev : r6 2025‑07‑20 UTC
Summary: contributor guide – adaptive origination. The deployment
pipeline now uses single‑stage origination for all wallets.
Temple wallet users leverage the remote forge service to
minimise payload size, while other wallets originate
directly via wallet.originate(). Dual‑stage origination
and FAST_ORIGIN are deprecated.
*/

───────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File: AGENTS.md (repo root)
Rev : r6 2025‑07‑20 UTC
Summary: contributor guide – adaptive origination. See above.

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

sh
Copy
corepack enable && corepack prepare yarn@4.9.1 --activate
yarn install --immutable

# choose the network before dev or build
yarn set:ghostnet   # or yarn set:mainnet
yarn dev            # runs at http://localhost:3000
In Codex tasks the above runs automatically via scripts/codex‑setup.sh.

2.1 Environment Flags
The v4 deployment flow now uses single‑stage origination by default.
The UI constructs the full on‑chain metadata on the client and then
selects the forging/injection pathway based on the connected wallet:

• Temple – Temple wallet cannot sign large payloads. When Temple is
detected via Beacon (walletInfo.name includes “temple”), the UI
offloads forging to the remote forge service defined by
FORGE_SERVICE_URL. The backend encodes the script and storage,
inserts a reveal operation if the manager key is unrevealed, and
returns forged bytes. The UI signs these bytes in the wallet and
injects them via the backend. If backend injection fails,
the UI falls back to local forging and injection using Taquito’s
forgeOrigination and injectSigned helpers.

• Other wallets (Kukai, Umami, etc.) – Wallets that handle large
payloads originate the contract via TezosToolkit.wallet.originate()
with the full metadata. This ensures the wallet handles encoding and
injection and avoids Beacon payload limits.

There is no longer a FAST_ORIGIN or USE_BACKEND flag. Dual‑stage
origination (originate + edit_contract_metadata) has been removed. Resume
support via localStorage remains available for patch operations.

Network selection remains in src/config/deployTarget.js.
The remote forge service is used only for Temple; all other
wallets use local forging/injection by default. Do not set .env files
for origination.

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

/* What changed & why: Updated to r6. Replaced dual‑stage origination
with adaptive single‑stage origination. Remote forge service is used
only for Temple wallets; other wallets use wallet.originate().
FAST_ORIGIN and USE_BACKEND flags removed. Updated summary and
environment flag guidance accordingly. */