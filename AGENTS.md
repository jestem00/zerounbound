/*Developed by @jams2blues – ZeroContract Studio
  File: AGENTS.md
  Rev : r5 2025‑07‑20 UTC
  Summary: contributor guide – dual‑stage origination using remote forge
service; remove USE_BACKEND flag and document remote forging. */

/───────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File: AGENTS.md (repo root)
Rev : r5 2025‑07‑20 UTC
Summary: contributor guide – dual‑stage origination using remote forge
service; remove USE_BACKEND flag and document remote forging.
──────────────────────────────────────────────────────────────/

Zero Unbound v4 — Contributor & Codex Guide
This guide aligns human and AI contributors working on the ZeroUnbound
project. Always reload the Manifest and TZIP invariants before you
write code or documentation.

1 · Repo at a Glance
Layer Tech Root entry
Frontend React 18 / Next 15 src/pages/_app.js
Engine Node 22 + Taquito 21 src/core/*
Contracts Michelson v4/v4a/v4b contracts/Zero_Contract_V4.tz
Manifest Single‑source‑of‑truth docs/Master_Overview_And_Manifest_zerounbound_contractmanagement.md

Always reload the Manifest & Invariants (I00–I118) before you code.

2 · Local / Codex Dev Bootstrap
Use the following commands to set up your environment:

pgsql
Copy
corepack enable && corepack prepare yarn@4.9.1 --activate
yarn install --immutable

pick network before dev / build
yarn set:ghostnet # or yarn set:mainnet
yarn dev # http://localhost:3000
In Codex tasks the above runs automatically via scripts/codex-setup.sh.

2.1 Environment Flags
The v4 deployment flow uses dual‑stage origination by default when
FAST_ORIGIN=true. The first transaction originates the contract
with minimal metadata. After confirmation, the UI automatically calls
edit_contract_metadata with the full JSON. Resume support via
localStorage is mandatory.

Origination always offloads forging and injection to the external
forge service configured via FORGE_SERVICE_URL in
src/config/deployTarget.js. The UI sends only the contract code,
storage and source address to the backend, receives forged bytes,
signs them in the wallet, and injects via the backend. This mirrors
SmartPy’s deployment and avoids browser payload limits. When the remote
service is unreachable the client falls back to local forging and
injection via src/core/net.js using manual gas/storage/fee defaults.

Do not set .env.local for origination. All configuration (network
selection and FAST_ORIGIN) resides in src/config/deployTarget.js. The
backend forge service is the preferred deployment path.

3 · Validating Changes
All code changes must pass the following gates:

Step Command
ESLint & Prettier yarn lint
Unit tests (Jest) yarn test
Production build yarn build
Bundle refresh yarn bundle && git add summarized_files/*

A commit must pass all four gates before merge.

4 · Style & Architecture Rules
No horizontal scroll ≤ 320 px (Invariant I06).

Pinned Yarn 4.9.1 — never update without Manifest bump (I21).

All media = data‑URIs; no IPFS/HTTP (I24).

One jFetch source — avoid stray fetch/axios (I40).

Hex‑field repair via utils/decodeHexFields.js (I107).

Respect environment flags before any network call (I118).

5 · Commit & PR Convention
Use Conventional Commits, e.g.:

scss
Copy
feat(core): add backend forging API endpoint
The body must describe motive, change list, and Manifest refs. End
the footer with Closes #XX or Ref I85, I118. Allowed types:
feat, fix, refactor, chore, docs, ci.

Add a Progress‑Ledger table row at the end of the PR body to track
revision, success state, impacted files, and outcomes (see the AI
Collaboration contract §8).

6 · Working With Codex
Ask mode → gather architecture context; Codex reads but does
not modify files.

Code mode → modify a small, well‑scoped surface (≤6 files) and
provide verification steps. If the task spans more, split it.

Back‑end tasks → instruct Codex to run yarn bundle and commit
outputs only when views.json changed.

7 · Directory Pointers
Critical entry‑points → see Manifest §1·5.

Infra scripts → scripts/*.js (CI, target switch, Codex setup).

Global styles → src/styles/globalStyles.js (Invariant I23).

/* What changed & why: Removed the USE_BACKEND flag; documented that
origination always uses the external forge service via FORGE_SERVICE_URL
with local fallback. Updated revision, summary and environment flags
section accordingly. */