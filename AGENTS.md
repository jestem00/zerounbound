/*───────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File:    AGENTS.md           (repo root)
Rev :    r1    2025‑09‑05
Summary: first Codex‑aware contributor guide
───────────────────────────────────────────────────────────────*/

# Zero Unbound v4 — Contributor & Codex Guide

## 1 · Repo at a Glance
| Layer      | Tech                          | Root entry                         |
|------------|------------------------------|------------------------------------|
| Frontend   | React 18 / Next 15.3.4       | `src/pages/_app.js`                |
| Engine     | Node 22 + Taquito 21         | `src/core/*`                       |
| Contracts  | Michelson v4 / v4a           | `contracts/Zero_Contract_V4.tz`    |
| Manifest   | Single‑source‑of‑truth       | `docs/Master_Overview_And_Manifest_zerounbound_contractmanagement.md` |

> **Always reload the Manifest & Invariants (`I00–I110`) before you code.**

---

## 2 · Local / Codex Dev Bootstrap
```bash
corepack enable && corepack prepare yarn@4.9.1 --activate
yarn install --immutable
# pick network before dev / build
yarn set:ghostnet   # or yarn set:mainnet
yarn dev            # http://localhost:3000
In Codex tasks the above runs automatically via scripts/codex-setup.sh.

3 · Validating Changes
Step	Command
ESLint & Prettier	yarn lint
Unit tests (Jest)	yarn test
Production build	yarn build
Bundle refresh	yarn bundle && git add summarized_files/*

A commit must pass all three gates.

4 · Style & Architecture Rules (excerpt)
No horizontal scroll ≤ 320 px (Invariant I06)

Pinned Yarn 4.9.1 — never update without Manifest bump (I21)

All media = data‑URIs — IPFS/HTTP banned (I24)

One jFetch source — no stray fetch/axios (I40)

Hex‑field repair via utils/decodeHexFields.js (I107)

5 · Commit & PR Convention
less
Copy
type(scope): title ≤ 72 chars

Body: motive → change list → Manifest refs.
Footer: “Closes #XX” or “Ref I85, I90”.
Allowed type: feat, fix, refactor, chore, docs, ci.

6 · Working With Codex
Ask mode → architecture Q&A, no writes.

Code mode → supply a small diff‑size target & verification steps.

Codex pushes a PR branch — review, squash‑merge, then yarn bundle.

If Codex must regenerate bundles, instruct explicitly:
“Run yarn bundle and commit the outputs.”

7 · Directory Pointers
Critical entry‑points → see Manifest §1·5.

Infra scripts → scripts/*.js (CI, target switch, codex setup)

Global styles → src/styles/globalStyles.js (Invariant I23)

Michelson views → contracts/metadata/views/*

8 · FAQ
Q	A
“TzKT count shows 0”	Run utils/listLiveTokenIds.js TTL 30 s.
“Slice upload stalls”	Check localStorage.zuSliceCache.*, act via utils/sliceCache.js.
“Need a new network”	Extend src/config/networkConfig.js and deployTarget.js, bump Manifest.
“How do I deploy a collection?” Use `wallet.originate`; forge/inject APIs are deprecated.

/* What changed & why: added wallet.originate FAQ; rev r2 */