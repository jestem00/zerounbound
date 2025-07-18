/*───────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File:    AGENTS.md           (repo root)
Rev :    r2    2025-07-18 UTC
Summary: codex & ChatGPT contributor guide – adds local signing/back-end
pipeline, dual-stage origination flow, and clarified coding rules
──────────────────────────────────────────────────────────────*/

# Zero Unbound v4 — Contributor & Codex Guide

## 1 · Repo at a Glance
| Layer      | Tech                          | Root entry                                     |
|------------|------------------------------|-----------------------------------------------|
| Frontend   | React 18 / Next 15        | `src/pages/_app.js`                          |
| Engine     | Node 22 + Taquito 21         | `src/core/*`                                 |
| Contracts  | Michelson v4 / v4a           | `contracts/Zero_Contract_V4.tz`                |
| Manifest   | Single-source-of-truth       | `docs/Master_Overview_And_Manifest_zerounbound_contractmanagement.md` |

> **Always reload the Manifest & Invariants (I00–I117) before you code.**

---

## 2 · Local / Codex Dev Bootstrap
```bash
corepack enable && corepack prepare yarn@4.9.1 --activate
yarn install --immutable
# pick network before dev / build
yarn set:ghostnet   # or yarn set:mainnet
yarn dev            # http://localhost:3000
In Codex tasks the above runs automatically via scripts/codex-setup.sh.
```

2.1 Environment Flags
The deployment pipeline now supports dual signing & injection modes:

USE_BACKEND=true — route forge and inject calls through
src/pages/api/forge.js and src/pages/api/inject.js, enabling
serverless (Vercel) forging and injection. This bypasses browser
payload limits and is essential for large V4 contracts. When unset,
Taquito RPC endpoints are called directly.

FAST_ORIGIN=true — enable the two‑stage “slim origination” flow. The
origination op stores a minimal views pointer ("views": "0x00")
and, upon confirmation, auto‑calls update_contract_metadata with
the real views hex. This requires two wallet signatures and is
guarded by invariant I118.

To run with back‑end assistance locally:

```bash
# .env.local
USE_BACKEND=true
FAST_ORIGIN=false
```

3 · Validating Changes
Step	Command
ESLint & Prettier	yarn lint
Unit tests (Jest)	yarn test
Production build	yarn build
Bundle refresh	yarn bundle && git add summarized_files/*

A commit must pass all four gates before merge.

4 · Style & Architecture Rules
No horizontal scroll ≤ 320 px (Invariant I06).

Pinned Yarn 4.9.1 — never update without Manifest bump (I21).

All media = data‑URIs — no IPFS/HTTP (I24).

One jFetch source — avoid stray fetch/axios (I40).

Hex‑field repair via utils/decodeHexFields.js (I107).

Environment flags must be checked before any fetch
(I118; dual‑op origination must call update_contract_metadata after
first confirmation if FAST_ORIGIN is enabled).

5 · Commit & PR Convention
Use Conventional Commits, e.g.:

feat(core): add backend forging API endpoint
The body must describe motive, change list, and Manifest refs. End the
footer with “Closes #XX” or “Ref I85, I118”. Allowed types: feat,
fix, refactor, chore, docs, ci.

Add a Progress‑Ledger table row at the end of the PR body to track
revision, success state, impacted files, and outcomes (see
AI Collaboration contract §8).

6 · Working With Codex
Ask mode → gather architecture context; codex reads but does
not modify files.

Code mode → modify a small, well‑scoped surface (≤6 files) and
provide verification steps. If the task spans more, split it.

Back‑end tasks → instruct codex to run yarn bundle and commit
outputs only when views.json changed.

7 · Directory Pointers
Critical entry‑points → see Manifest §1·5.

Infra scripts → scripts/*.js (CI, target switch, codex setup).

Global styles → src/styles/globalStyles.js (I23).

Michelson views → contracts/metadata/views/*.

API endpoints → src/pages/api/forge.js, src/pages/api/inject.js (backend forging/injection).

8 · FAQ
Q	A
“TzKT count shows 0”	Run utils/listLiveTokenIds.js with TTL 30 s.
“Slice upload stalls”	Check localStorage.zuSliceCache.*, act via utils/sliceCache.js.
“Need a new network”	Extend src/config/networkConfig.js and deployTarget.js, bump Manifest.
“Why two signatures when creating a collection?”	FAST_ORIGIN=true triggers a two‑phase flow: the first signature originates the contract with a dummy views pointer; the second signature patches the metadata. This reduces Temple/Beacon payloads to <100 KB.

/* What changed & why: added environment flags, backend forging/injection guidance,
dual‑op origination notes and clarified commit/PR process for codex */