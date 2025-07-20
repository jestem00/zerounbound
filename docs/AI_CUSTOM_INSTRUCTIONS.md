/*Developed by @jams2blues – ZeroContract Studio
  File: docs/AI_CUSTOM_INSTRUCTIONS.md
  Rev : r5 2025‑07‑20 UTC
  Summary: refine environment flags; remove USE_BACKEND flag; document
remote forge service and dual‑stage origination usage. */

AI Custom Instructions — Zero Unbound
Purpose — These guidelines unify the collaboration rules for all
assistant models (Codex and ChatGPT) working on the Zero Unbound
project. They complement the AI Collaboration Contract and apply
across the entire codebase — frontend, engine, contracts and infra.
Follow them to produce reliable, reproducible and on‑chain‑ready
artefacts.

0 · Core Principles
Obey the latest explicit user message. Never infer hidden
intent; ask targeted questions when uncertain. In case of
conflicting instructions, the most recent user message takes
precedence.

Default to full output. When modifying a file, return the
complete, compile‑ready content (from header to trailing /* What changed… */ EOF). Use computer.sync_file to deliver large files
or multiple files. When the user requests MODE: ANNOTATED, wrap
additions with // BEGIN ADD / // END ADD and deletions with
// BEGIN DEL / // END DEL.

Impacted‑Files List & Progress Ledger. Every assistant reply
must begin with an alphabetical list of all files you will read or
modify. It must end with a Progress‑Ledger row summarising the
revision id, success state, impacted files and outcome. Use the
ledger to track open tasks and mark them complete (✅) as you
progress.

Path & Casing Checkpoint™. Verify the existence and case of
each path before editing. If any file is missing, pause and ask
the user (Missing‑File Guard). Maintain the repo’s case‑exact
structure.

Context refresh. After every three replies or any tree‑wide
change, reload this document, the Manifest, AGENTS.md and the
last ≥10 user turns. Log a “Context refresh” in the ledger and
summarise your own actions when tokens are tight (never summarise
user text).

Revision tracking. Update file headers (Developed by,
File, Rev, Summary) and footers (“What changed & why”) on
every change. Keep summaries ≤80 chars and bump revision numbers
consistently across related files.

Flag awareness. Honour environment flags (e.g. network
selection and FAST_ORIGIN). When a flag changes, update the
relevant docs in the same reply (Manifest, custom instructions,
AGENTS.md) and describe the new behaviour.

Security. Never expose secrets or internal IDs. Follow
security best practices for web3 (no IPFS or off‑chain media
unless explicitly allowed, guard against re‑entrancy, XSS, etc.).

1 · Output & Fencing Rules
• FULL — return the entire file. When editing multiple files,
deliver each as a separate fenced block with its own header and
footer. If a file exceeds 200 lines or you modify more than three
files, use computer.sync_file to provide download links rather
than inline content.

• ANNOTATED — used only when the user writes MODE: ANNOTATED.
Mark additions and deletions with // BEGIN ADD/// END ADD and
// BEGIN DEL/// END DEL. Do not include unchanged text outside
of the edited region.

• Impacted‑Files List — always list touched files before any
code blocks. Do not mention files that remain untouched.

2 · Workflow
Context refresh — as described above, reload docs and user
instructions regularly. Use the ledger to log the refresh.

Import graph — determine which modules or files the task
affects. Build a dependency graph to avoid missing indirect
references. Include this graph in the Impacted‑Files List when
helpful.

Missing‑File Guard — if a path or dependency is unclear,
stop and ask the user for clarification. Do not create files
blindly unless instructed.

Draft solution — mentally lint and plan your edits. Preserve
existing code style and comment structures. Use dummy data
sparingly; prefer deterministic values.

Compile‑Guard — reason about whether the code will build or
run. If unsure, run unit tests or ask the user to run them.

Emit solution — provide your edits in FULL mode, one fenced
block per file. Use computer.sync_file for large files or
multiple files. Do not interleave different files in the same
block.

Ledger & tasks — append a Progress‑Ledger row summarising the
revision, impacted files and outcome. Use numbered Next/Pending
tasks to track follow‑ups and close them (✅ #n) when resolved.

Review — double‑check that file headers and footers are
updated, the Impacted‑Files List is sorted and complete, and all
invariants and flags are respected.

3 · Context, Memory & Tokens
• Self‑Watch Tick — every ≤3 turns, verify contract adherence and
log “🕒 OK” or any issues in the ledger.
• Persistent memory — summarise your own actions and decisions
(not the user’s) in the ledger. Use this to recall previous
tasks, open questions and resolutions.
• Token efficiency — use computer.sync_file for large files to
keep replies concise. Only open the interactive browser when
necessary (forms, dynamic content, real‑time data). Use the
textual browser for documentation and API lookups.
• Numbered tasks — track Next/Pending items numerically (e.g.

Update manifest summary, 2. Run tests). Close them with
✅ #n when done. This helps maintain continuity across long
sessions.

4 · Quality, Security & Compliance
• Zero‑iteration goal — aim to deliver fully functional,
compile‑ready code on the first attempt. When complexity
suggests multiple iterations, inform the user and break the task
into smaller units.
• Deterministic outputs — avoid randomness. Validate
JSON/YAML/ABI and other structured data. Do not produce
placeholder images or data URIs containing uncontrolled content.
• On‑chain media — store all media on‑chain via data: URIs.
Do not introduce IPFS or external HTTP links unless explicitly
permitted by the user. See Manifest invariants I24 and I99 for
details.
• Security — guard against re‑entrancy, XSS and SQL injection.
Escape inputs and avoid eval. Respect security guidelines of
Next.js, Taquito and other frameworks used in the project.
• Styled‑Components — import from styledPkg and create
wrappers like styled('tag'); never pass stray props to DOM nodes
(Invariant I25).
• Base64 blobs — avoid embedding large base64 data in source
unless it is a legitimate data: URI. Large assets should be
stored in /public and imported as needed.

5 · UX & Performance
• Mobile‑first — design components without horizontal scroll at
≤320 px (Invariant I06). Use responsive grids and flexible
layouts.
• Performance — ensure Largest Contentful Paint (LCP) ≤2 s on
mid‑range devices. Animated backgrounds must idle at ≤4 % CPU
(Invariants I47–I48). Use chunk splitting and lazy imports to
keep the JavaScript bundle ≤2 MiB (Invariant I26).
• Accessibility — comply with WCAG 2.2 AA. Persist the theme
per wallet via IndexedDB (Invariant I08). Validate form inputs
and show helpful error messages.
• PWA & Offline — ensure the service worker caches static assets
via Workbox 7. Validate caching strategy for static and dynamic
content (Invariant I09).
• Royalty UI — enforce a maximum 25 % royalty split and
surface royalty totals live (Invariant I50).

6 · Self‑Correction
If you breach a rule or produce incomplete output:

Apologise concisely.

Provide the corrected output in the appropriate mode (FULL or
ANNOTATED).

Add a ledger row noting the breach and the fix applied.

Reaffirm adherence to this contract and log a new Self‑Watch Tick.

7 · Tools & Environment
• Browsing & data tools — use the browser tool to read
documentation, APIs and static sites. Use the visual
computer tool only when interacting with dynamic content (forms,
calendars, etc.) or when needing to view images. Cite sources
using the formats described in the AI Collaboration Contract.
• GitHub connector — when the user asks you to access GitHub
repositories, use the browser tool to search and fetch files via
the API. Use the installed accounts list to find accessible
organisations. Always check for branch and tag names.
• Network & flags — the project targets Ghostnet by default
(TARGET in src/config/deployTarget.js). Use yarn set:mainnet
to switch networks. Deployment flags live in
deployTarget.js and require no .env files. FAST_ORIGIN
controls the dual‑stage origination: when true, the first
transaction stores minimal metadata (views pointer = 0x00) and
a second transaction patches the full metadata with
edit_contract_metadata. Origination always offloads forging
and injection to the external forge service configured via
FORGE_SERVICE_URL. If the service is unreachable the
front‑end falls back to client‑side forging via src/core/net.js
with manual gas/storage/fee defaults.
• Authentication — for sites requiring login (e.g. Temple
wallet), navigate to the login page and ask the user to enter
credentials. Never request or type passwords yourself.
• File sync — always call computer.sync_file after writing a
file that the user should download (e.g. updated source files,
reports, images). Use the returned file_id to embed links or
images in your responses.

8 · Glossary
• Path & Casing Checkpoint™ — verify that a referenced file
exists and that the path is spelled with the correct case. Case
mismatches cause CI failures.
• Compile‑Guard — reason about whether your edits will compile
and run. When uncertain, ask the user to run tests or rely on
prior knowledge of the build system.
• Self‑Watch Tick — periodic check (every ≤3 replies) to ensure
your outputs adhere to these instructions. Log the result in the
Progress‑Ledger.
• FAST_ORIGIN — environment flag enabling dual‑stage
origination; stores minimal metadata on the first operation and
patches full metadata in a second operation. See Invariant I118.
• Progress‑Ledger — a table appended to every assistant reply
summarising revision, impacted files and outcomes. It serves as
a persistent memory and audit trail.

/* What changed & why: Removed the USE_BACKEND flag throughout the
instructions and updated environment flag guidance to state that
forging and injection always use the remote forge service set in
FORGE_SERVICE_URL, with local fallback. Updated revision and summary
accordingly. */