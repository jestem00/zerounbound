/*─────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File: docs/AI_CUSTOM_INSTRUCTIONS.md
Rev : r7 2025‑07‑24 UTC
Summary: unify origination flow; remove remote forge service; update environment guidance.
*/

AI Custom Instructions — Zero Unbound
Purpose — These guidelines unify the collaboration rules for all assistant models (Codex and ChatGPT) working on the Zero Unbound project. They complement the AI Collaboration Contract and apply across the entire codebase — frontend, engine, contracts and infra. Follow them to produce reliable, reproducible and on‑chain‑ready artefacts.

0 · Core Principles
Unchanged from previous revision. Obey the latest explicit user message, default to full output, maintain Impacted‑Files lists and progress ledgers, perform Path & Casing Checkpoints™, refresh context regularly, bump revision numbers consistently and respect security/privacy rules.

1 · Output & Fencing Rules
Unchanged. Continue using FULL mode by default and ANNOTATED mode only when requested.

2 · Workflow
Unchanged. Use context refresh, import graph, Missing‑File Guard, draft solution, Compile‑Guard, emit solution, ledger updates and review steps as described previously.

3 · Context, Memory & Tokens
Unchanged. Maintain self‑watch ticks, persistent memory, token efficiency and numbered tasks.

4 · Quality, Security & Compliance
Unchanged. Adhere to invariants for media handling, security, base64, styled‑components, and keep outputs deterministic.

5 · UX & Performance
Unchanged. Continue to design mobile‑first, ensure LCP ≤2 s, abide by offline caching and royalty rules.

6 · Self‑Correction
Unchanged. Apologise, provide corrected output, note the breach and log a new self‑watch tick when rules are violated.

7 · Tools & Environment
• Browsing & data tools — unchanged. Use the textual browser for documentation and API lookups; use the visual browser for dynamic UI interactions; cite sources appropriately.

• Network & flags — the project targets Ghostnet by default (TARGET in src/config/deployTarget.js). Run yarn set:mainnet to switch networks. The deployment flow now uses a single‑stage operation for all wallets. TezosToolkit.wallet.originate() is used to originate the contract with full metadata, regardless of wallet type. The remote forge service has been removed; FAST_ORIGIN and USE_BACKEND flags are no longer used.

• Authentication — unchanged. For sites requiring login (e.g. Temple extension), navigate to the login page and ask the user to enter credentials; never request or type passwords yourself.

• File sync — unchanged. Use computer.sync_file to deliver downloadable artefacts and embed images or code files via the returned file IDs.

Other sections remain unchanged from the previous revision.

/* What changed & why: Updated to r7. Removed the remote forge service and Temple-specific forging path. All wallets now use TezosToolkit.wallet.originate() with a single‑stage origination. FAST_ORIGIN and USE_BACKEND remain removed. Updated summary and Tools & Environment guidance accordingly. */