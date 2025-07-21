/*─────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File: docs/AI_CUSTOM_INSTRUCTIONS.md
Rev : r6 2025‑07‑20 UTC
Summary: adapt environment flags; use adaptive origination.
Remove dual‑stage/FAST_ORIGIN; remote forging only for Temple.
*/

AI Custom Instructions — Zero Unbound
Purpose — These guidelines unify the collaboration rules for all
assistant models (Codex and ChatGPT) working on the Zero Unbound
project. They complement the AI Collaboration Contract and apply
across the entire codebase — frontend, engine, contracts and infra.
Follow them to produce reliable, reproducible and on‑chain‑ready
artefacts.

0 · Core Principles
Unchanged from previous revision. Obey the latest explicit user
message, default to full output, maintain Impacted‑Files lists and
progress ledgers, perform Path & Casing Checkpoints™, refresh
context regularly, bump revision numbers consistently and respect
security/privacy rules.

1 · Output & Fencing Rules
Unchanged. Continue using FULL mode by default and ANNOTATED mode
only when requested.

2 · Workflow
Unchanged. Use context refresh, import graph, Missing‑File Guard,
draft solution, Compile‑Guard, emit solution, ledger updates and
review steps as described previously.

3 · Context, Memory & Tokens
Unchanged. Maintain self‑watch ticks, persistent memory, token
efficiency and numbered tasks.

4 · Quality, Security & Compliance
Unchanged. Adhere to invariants for media handling, security, base64,
styled‑components, and keep outputs deterministic.

5 · UX & Performance
Unchanged. Continue to design mobile‑first, ensure LCP ≤2 s, abide
by offline caching and royalty rules.

6 · Self‑Correction
Unchanged. Apologise, provide corrected output, note the breach and
log a new self‑watch tick when rules are violated.

7 · Tools & Environment
• Browsing & data tools — unchanged. Use the textual browser for
documentation and API lookups; use the visual browser for dynamic
UI interactions; cite sources appropriately.

• Network & flags — the project targets Ghostnet by default
(TARGET in src/config/deployTarget.js). Run yarn set:mainnet to
switch networks. Adaptive origination: The deployment flow uses
a single‑stage operation for all wallets. When Temple is detected
via Beacon, forging and injection are routed through the remote
forge service (FORGE_SERVICE_URL). Other wallets use
TezosToolkit.wallet.originate() to originate the contract. The
FAST_ORIGIN and USE_BACKEND flags have been removed. Local
fallback to client‑side forging and injection is applied if remote
injection fails.

• Authentication — unchanged. For sites requiring login (e.g. Temple
extension), navigate to the login page and ask the user to enter
credentials; never request or type passwords yourself.

• File sync — unchanged. Use computer.sync_file to deliver
downloadable artefacts and embed images or code files via the
returned file IDs.

Other sections remain unchanged from the previous revision.

/* What changed & why: Updated to r6. Updated Tools & Environment
section to reflect adaptive single‑stage origination. Remote forging
and injection are used only for Temple wallets; other wallets use
wallet.originate(). Dual‑stage origination and FAST_ORIGIN/USE_BACKEND
flags have been removed. */