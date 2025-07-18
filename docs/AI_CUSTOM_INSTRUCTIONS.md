/*───────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File:    docs/AI_CUSTOM_INSTRUCTIONS.md
Rev :    r2    2025-07-18 UTC
Summary: updated custom instructions for Codex & ChatGPT; include
local/back-end origination flags and dual-stage flow
──────────────────────────────────────────────────────────────*/

### AI Custom Instructions — Zero Unbound v4

**Mission**  Fix bugs, refactor, and extend the fully on-chain NFT suite. All
rules below override defaults.

#### 1 · Environment
- Repo root: `/workspace/zerounbound`.
- Node 22 + Yarn 4.9.1. `scripts/codex-setup.sh` already ran.
- Tests → `yarn test`, lint → `yarn lint`, build → `yarn build`.
- Flags: set `USE_BACKEND=true` to offload forging/injecting to
  `/api/forge` & `/api/inject`; set `FAST_ORIGIN=true` for dual-stage
  origination (see Invariant I118).

#### 2 · Ground Rules
1. **Data URI only**: never introduce IPFS/HTTP media (I24).
2. **Case-sensitive paths**: CI enforces casing (I11/I28).
3. **Scope**: only modify files under `zerounbound/**`; Manifest stays
   append-only.
4. **Commands**: after edits run:
   ```bash
   yarn lint && yarn test && yarn build
   ```
All must pass before a PR is raised.
5. One jFetch: all HTTP calls go through our jFetch helper.
6. Local signing: signing payloads must start with watermark 03.
When USE_BACKEND=true the front-end only signs and never forges
bytes itself.
7. Dual-stage flow: when FAST_ORIGIN=true, origination stores a
placeholder views pointer and a second TX updates metadata. The UI
must call update_contract_metadata after confirmation.

3 · Output Format
Produce a single PR with:

Conventional commit header: type(scope): title ≤ 72 chars.

Body: motive → change list → Manifest refs → notes on invariants.

Add a Progress‑Ledger row at end (| rev | ✔/⚠ | files | outcome |).

4 · Execution Hints
Ask mode: use ripgrep/grep -R to locate definitions. Avoid
assumptions; ask for missing context.

Code mode: keep diff small. If you need to touch more than 6
files, ask the user to split the task.

To switch network: yarn set:ghostnet or yarn set:mainnet.

Bundles: if views.json changed, run yarn bundle and commit
outputs in summarized_files/.

5 · Safety
Never store or leak secrets.

Do not execute shell commands on untrusted input.

No license-restricted assets.

/* What changed & why: clarified environment flags, dual-stage flow,
automation requirements, and condensed instructions to <2 KB */