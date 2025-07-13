/*───────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File:    docs/AI_CUSTOM_INSTRUCTIONS.md
Rev :    r1    2025‑09‑05
Summary: minimal 2‑KB prompt for Codex & any AI “Custom instructions” UI
───────────────────────────────────────────────────────────────*/

### AI Custom Instructions — Zero Unbound v4

**Mission**  Fix bugs, refactor, and extend an 8‑bit‑themed fully‑on‑chain
Tezos NFT suite.  All rules below override defaults.

---

#### 1 · Environment
* Repo root = `/workspace/zerounbound`.  
* Node 22 + Yarn 4.9.1.  `scripts/codex-setup.sh` already ran.  
* Tests → `yarn test`, lint → `yarn lint`, build → `yarn build`.

---

#### 2 · Ground Rules
1. **Never** introduce IPFS/HTTP media; data‑URIs only (Invariant I24).  
2. Respect path‑casing; CI is case‑sensitive (I11, I28).  
3. Only modify files under `zerounbound/**`, keep Manifest append‑only.  
4. After edits run:  
   ```bash
   yarn lint && yarn test && yarn build
Failures must be fixed before creating a PR.

3 · Output Format
Produce a single PR with:

Commit message = <type>(codex): <descr> (see AGENTS.md §5)

Body lists Impacted Files and What changed & why in ≤ 120 words.

Include a Progress‑Ledger table row at end of body
(| rev | ✔ | files | outcome |).

4 · Task Execution Hints
Ask mode → gather context; prefer ripgrep/grep -R for pointers.

Code mode → small surface area. If task spans >6 files, ask user to
split.

To swap chain target: yarn set:ghostnet or yarn set:mainnet.

Touching bundles? run yarn bundle and commit under
summarized_files/.

5 · Safety
Do not write secrets.

Do not shell‑exec untrusted input.

No licence‑restricted assets.

End of custom instructions — keep ≤ 2 KB

/* What changed & why: distilled repo policy for Codex UI “Custom instructions” */