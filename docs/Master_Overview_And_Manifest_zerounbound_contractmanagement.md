/*─────────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File: docs/Master_Overview_And_Manifest_zerounbound_contractmanagement.md
Rev : r1018 2025‑07‑22 UTC
Summary: clarify local development setup in Quick Start; refine dynamic
dev scripts guidance; include network propagation and remote
detection invariants. No functional code changes.
──────────────────────────────────────────────────────────────────/

════════════════════════════════════════════════════════════════
ZERO UNBOUND v4 — MASTER OVERVIEW & SOURCE‑FILE MANIFEST
════════════════════════════════════════════════════════════════

───────────────────────────────────────────────────────────────
WHAT IS THIS FILE? (unabridged)
───────────────────────────────────────────────────────────────
This file is the single‑source‑of‑truth for the Zero Unbound v4
platform. A fresh git clone plus this document and the bundle
outputs yield a reproducible build on any host. It outlines the
architecture, invariants, source‑tree map and CI pipeline.

The project now uses a single‑stage origination pipeline for
contract deployment. The full metadata is assembled on the client
and encoded into a Michelson big‑map. When the connected wallet is
Temple, forging and injection are offloaded to the remote forge
service defined in FORGE_SERVICE_URL; the service encodes the
contract and storage, inserts a reveal operation if needed, and
returns forged bytes. For all other wallets, the UI calls
TezosToolkit.wallet.originate() directly. Dual‑stage origination
and the FAST_ORIGIN flag have been removed. Local fallback is
available if remote injection fails.
════════════════════════════════════════════════════════════════
TABLE OF CONTENTS (How to read) — skim → locate → jump
════════════════════════════════════════════════════════════════
0 · Global Rules & Meta Docs
1 · High‑Level Architecture
1·5 Critical‑Entry Index 🗝️
2 · Invariants (I00 – I106)
3 · — reserved for future research notes —
4 · Source‑Tree Map (per‑file description + imports/exports) ← UPDATED
5 · Bundle Index
6 · Quick‑Start & CI Pipeline
7 · Appendices (HashMatrix & Entrypoint registry)

───────────────────────────────────────────────────────────────
0 · GLOBAL RULES & META DOCS
───────────────────────────────────────────────────────────────
• History is append‑only; patch instead of overwrite.
• Binary artefacts stay out of bundles.
• docs/ mirrors this master—update both.

Important Meta‑document that extends this manifest's invariants for TZIP compliance:
• docs/TZIP_Compliance_Invariants_ZeroContract_V4.md (contract‑layer rules)

───────────────────────────────────────────────────────────────
1 · HIGH‑LEVEL ARCHITECTURE & DATA‑FLOW (How to read) — 30 s elevator view
───────────────────────────────────────────────────────────────
Browser (React 18 + styled‑components 6) → ZeroFrontend SPA (Next.js 15.3.4)
↑ props/state                      │ Taquito RPC
└─────────────┐                   ↓
ZeroEngine API (Node 22 + Taquito) → ZeroContracts v4 / v4a + ZeroSum Marketplace (Tezos L1)

100 % on‑chain media (data: URI); utils/RenderMedia.jsx whitelists MIME.

────────── NEW REMOTE FORGE SERVICE
──────────────────────────────────────────────────────────────────
Earlier revisions relied on serverless /api/forge and /api/inject endpoints
living within the Next.js application to offload forging and injection. Those
endpoints required a heavy Python or manual fallback and caused build issues.
With the reintroduction of dual‑stage origination in r1014 and the need to
support Temple wallet users, we now offload forging and injection to a
separate Node.js service. This service uses Taquito’s RPC utilities and
Express to expose /forge, /inject, and /healthz endpoints and is
deployed on Render (see forge_service_node). The front‑end points to this
service via FORGE_SERVICE_URL in deployTarget.js and falls back to
client‑side forging via src/core/net.js when unreachable. No .env or
USE_BACKEND flag is needed—offloading happens automatically when
FORGE_SERVICE_URL is non‑empty.

───────────────────────────────────────────────────────────────
1·5 · CRITICAL‑ENTRY INDEX 🗝️ (How to read) — quickest cognitive entry‑points
───────────────────────────────────────────────────────────────
• src/core/net.js … network helpers (jFetch, forgeOrigination, injectSigned) with back‑off and multi‑RPC fallback
• src/ui/CollectionCard.jsx … canonical contract card (I105 / I106)
• src/pages/explore/[[...filter]].jsx … marketplace grid loader
• src/hooks/useConsent.js … persistent NSFW / flash / script flags
• src/utils/hazards.js … MIME‑level risk detection
• src/utils/decodeHexFields.js … deep hex‑field UTF‑8 repair (I107)
• src/ui/TokenIdSelect.jsx … live token‑id dropdown filter (I108)
• src/ui/MarketplaceBar.jsx … token-detail action bar
• src/core/batch.js … size guards, sliceHex, resumable checkpoint helpers (I60)
• src/core/feeEstimator.js … shared RPC‑safe estimator (I85)
• src/core/marketplace.js … ZeroSum contract utils
• src/contexts/WalletContext.js … silent restore + explicit reveal (I58‑I59)
• src/hooks/useViewportUnit.js … dynamic --vh var for mobile fit
• src/hooks/useHeaderHeight.js … live header height calc
• src/ui/Entrypoints/AppendArtifactUri.jsx … resumable multi‑slice uploader
• src/ui/Entrypoints/RepairUri.jsx … diff‑aware broken‑upload repairer
• scripts/setTarget.js … one‑liner switch TARGET (ghostnet | mainnet)
• src/utils/sliceCache.js … shared resumable‑upload cache logic (I60‑I61)
• src/core/batchV4a.js … v4a dynamic storageLimit (I89)
• src/utils/sleepV4a.js … Promise‑based async delay (I90)

───────────────────────────────────────────────────────────────
2 · INVARIANTS 🔒 (scope tags: [F]rontend | [C]ontract | [E]ngine | [I]nfra)
───────────────────────────────────────────────────────────────
I00 [F, C, E, I] All UI elements—styling, fonts, buttons, overlays, popups, containers, and more—must follow our 8‑bit retro arcade theme, including pixel fonts, sprites, palettes, layouts, and theme context. Every component and page should be resolution‑ and aspect‑ratio‑agnostic: interfaces must adapt fluidly so text, images, and containers render and resize correctly on any device or viewport.
I01 [C] One canonical on-chain record per contract instance.
I02 [E] Engine ↔ Chain parity ≥ 2 blocks.
I03 [F,C] Role-based ACL (admin/owner/collaborator).
I04 [C] Contract terms immutable once locked.
I05 [E] All mutating ops emit audit row + chain event.
I06 [F] Mobile-first UI; no sideways scroll ≤ 320 px.
I07 [F] LCP ≤ 2 s (P95 mid-range Android).
I08 [F] WCAG 2.2 AA; theme persists per wallet (IndexedDB).
I09 [F] PWA offline shell (Workbox 7, ≤ 5 MiB cache).
I10 [E] deployTarget.js is single network divergence point.
I11 [I] Case-sensitive path guard in CI.
I12 [C] hashMatrix.json = SHA‑1 → version (append‑only).
I13 [C] entrypointRegistry.json append‑only.
I14 [I] bundle.config.json globs mirror Manifest §5.
I15 [E] Engine pods stateless.
I16 [E] Jest coverage ≥ 90 %.
I17 [E] (retired) legacy 3 M‑block back‑scan.
I18 [E] RPC fail‑over after 5 errors.
I19 [F] SSR‑safe: hooks never touch window during render.
I20 [F] Exactly one document.js.
I21 [I] Corepack pins Yarn 4.9.1.
I22 [F] ESLint bans em‑dash.
I23 [F] Styled‑components factory import invariant.
I24 [F] Media =data URIs; no IPFS.
I25 [F] SVG canvas square & centred.
I26 [F] JS chunk ≤ 32 768 B; total ≤ 2 MiB.
I27 [I] Monotonic Rev id ledger.
I28 [I] No path‑case duplicates.
I29 [I] CI tests Node 20 LTS + 22.
I30 [F] useWallet alias until v5.
I31 [E] Off‑chain templates carry MD‑5 checksum.
I32 [I] No .env secrets in code.
I33 [C] Registries immutable (append-only).
I34 [F] All colours via CSS vars.
I35 [F] Transient SC props filtered.
I36 [F] ESLint no‑multi‑spaces passes.
I37 [C] TZIP‑04/12/16 compliance (see meta file).
I38 [C] Metadata stored in tezos-storage:content.
I39 [C] Interfaces array deduped pre-storage.
I40 [E,F] Single jFetch Source — all HTTP via core/net.js.
I41 [F] Central RenderMedia Pipeline enforced.
I42 [F] Per‑EP Overlay UX — one modal per AdminTools action.
I43 [E] jFetch global concurrency LIMIT = 4 & exponential 429 back‑off.
I44 [F] Header publishes real height via CSS var --hdr; Layout obeys.
I45 [F] Single global scroll‑region; inner comps never spawn scrollbars.
I46 [F] All DOM‑mutating effects use useIsoLayoutEffect when SSR possible.
I47 [F] ZerosBackground obeys perf guard (≤ 4 % CPU @ 60 fps).
I48 [F] Animated backgrounds idle ≤ 4 % CPU on low‑end mobiles.
I49 [F,C] Token metadata arrays/objects JSON‑encode exactly once then hex‑wrap.
I50 [F] Royalty UI % cap ≤ 25 %; stored as basis‑points.
I51 [F,C] authoraddress key omitted when blank.
I52 [F] Tezos address validators accept tz1|tz2|tz3|KT1.
I53 [F,C] (dup of I49) JSON‑encode once → hex‑wrap.
I54 [F] Dynamic token‑id fetch — Mint.jsx must query next_token_id.
I55 [F] Operation size guard — sliceHex uses 1 024 B head‑room.
I56 [F] Oversize mint triggers upfront Snackbar warning.
I57 [F] WalletContext delayed BeaconWallet instantiation.
I58 [F] Reveal action uses explicit 1 mutez transfer.
I59 [F] Silent session restore on mount.
/──────────────────────────────────────────────────────────────
I60 [F,E] Resumable Slice Uploads — Mint, Append & Repair
───────────────────────────────────────────────────────────────
• Oversize writes are chunked (32 768 B – 1 024 head-room); first slice inside
the mint, the rest via append* in strict order.
• Each chunk persists a checkpoint in
localStorage.zuSliceCache.<network>[<contract>:<tokenId>:<label>]:

python
Copy
{ tokenId:nat, label:"artifactUri"|…, total:nat, next:nat,
chunkSize:32768, hash:"sha256:<hex>", updated:<unix-ms> }
• Upload resumes at next, clears cache once confirmed next===total,
and is idempotent — repeating slices can’t corrupt bytes.
• RepairUri rebuilds on-chain dataURI, byte-diffs against re-upload, aborts
on mismatch (“Conflict detected — choose correct file” toast).
• UI rejects out-of-order, oversize or duplicate slices with toast feedback.
/──────────────────────────────────────────────────────────────
I61 [F] Slice-Cache Hygiene & Expiry
───────────────────────────────────────────────────────────────
• purgeExpiredSliceCache() runs on app boot + mount of slice UIs.
• Cache entry auto-deletes when:
– stale ≥ 24 h • total === 0 • hash mismatch • global > 5 MB.
• Purge is non-blocking; all IO sits in try {} catch {} so quota /
private-mode issues never break the UI.
──────────────────────────────────────────────────────────────/
I62 [F] Busy‑Select Spinner.
I63 [I] Single‑Repo Target Switch (scripts/setTarget.js).
I64 [F] Wheel‑Tunnel Modals.
I65 [F] Immediate Busy Indicators — superseded by I76.
I66 [F] Empty‑Collection Grace.
I67 [F,E] Filter destroyed / burn balances.
I68 [E] listLiveTokenIds.js 30 s TTL.
I69 [F] ContractCarousels auto‑refresh + zu_cache_flush listener.
I70 [I] destroy/burn dispatches zu_cache_flush.
I71 [F] Copy‑Address UX via PixelButton.
I72 [F] RenderMedia download‑fallback.
I73 [F] Relationship Micro‑Stats — TokenMetaPanel.
I74 [F,E] Chunk‑Safe Estimator batches ≤ 8 ops.
I75 [F] v4a Entrypoint Guards.
I76 [F] Inline Busy Overrides.
I77 [F] Relationship‑Aware Disable for destructive EPs.
I78 [F] SVG Pixel‑Integrity via sandbox.
I79 [F] Header copy‑clipboard reachable ≤ 320 px & ≥ 8 K.
I80 [F] Carousel arrows live inside container.
I81 [F] Mint tag‑input auto‑chips.
I82 [F] Form values persist across navigation.
I83 [F] Modal CloseBtn anchor stays inside modal bounds.
I84 [F] Unicode & Emoji acceptance — full UTF‑8 except C0/C1.
I85 [F] Single feeEstimator.js source of truth — duplicates banned.

I86 [F] HelpBox Standard — every entry-point component exposes a
concise .75 rem HelpBox covering Purpose, When and
How-To; rendered immediately below the PixelHeading.
I87 [F] Live JSON Validation — metadata editors must disable CTA
until supplied text parses as valid UTF-8 JSON.
I88 [I] ESLint no-local-estimator Rule — any inline fee/burn
calculation outside feeEstimator.js is a CI error.
I89 [F,E] v4a slice batch operations must compute storageLimit dynamically based on actual payload size (+128-byte padding), preventing Michelson stack overflow.
I90 [F] All async wait/sleep logic standardized on sleepV4a.js.
I91 [F,E] All ledger sync helpers (waitForLedger) share the same Michelson key-building logic, ensuring consistency and preventing FA2 balance errors.
I92 [F,E] Mint operations (MintV4a.jsx) utilize a single, centralized ledger-wait implementation, invoked only after the first batch slice in oversize uploads.
I93 [F] OperationOverlay “fun lines” scroll every ≈ 3 000 ms with a
brief 250 ms pause per line, Solari‑board style animation.
I94 [F] AdminTools “Token Actions” header no longer shows dynamic count;
only contextual counts (Collaborators, Parent/Child) remain.
I95 [F] v4a collections display an inline experimental banner inside
AdminTools (“⚠ ZeroTerminal contracts under construction …”).
Note: I49 and I53 intentionally duplicate JSON-encode/hex-wrap rule
for legacy-lint compatibility.
I96 [F] OperationOverlay fun-lines text colour must use
var(--zu-accent) so the Solari board adapts to active palette, uses CSS-steps Solari board to stay live during hangs.
I97 [F] OperationOverlay “Close” button triggers window.location.reload()
after overlay unmount to guarantee fresh state across routes.
I98 [F] contract origination forms include a fixed top-right CloseBtn (×) that
navigates to “/” (home) for rapid escape; button obeys I83 bounds.
I99 [F] Every UI that accepts a file (mint, deploy, meta panels, etc.) runs the upload through onChainValidator.js; the result shows ⭐ (fully on‑chain), ⛓️‍💥 (partial, reason shown) or ❔ (undetermined) via integrityBadges.js. Upload flows present a confirmation dialog with the badge before users proceed.
I100 [F] In conjunction with I99, keep certain false-positives such as "URLs that are safe to embed as plain‑text references inside on‑chain SVG/RDF metadata. These are not dereferenced by the renderer and therefore do not break the FOC invariant. Add patterns conservatively." such as "const SAFE_REMOTE_RE = /\bhttps?://(?:creativecommons.org|schema.org|purl.org|www.w3.org)[^\s"'<>]*/i;". C0 only – C1 allowed.
/*immutability guard for v4 flags */
I101 [F] Contract v4 forbids removing the “mature” content‑rating
or “flashing” accessibility flags once they are stored on‑chain.
Front‑end components must:
• warn at mint (Mint.jsx HelpBox) and at edit (EditTokenMetadata.jsx HelpBox);
• hard‑disable attempts to unset these keys;
• surface a checklist error when a user tries to downgrade either flag.
Back‑end validation refuses any edit_token_metadata map that omits a
flag previously present in storage.
I102 [F] Responsive Entry‑Point & Meta‑Panel Blueprint – Every new
entry‑point module, admin panel or optioned metadata editor must
inherit the layout strategy pioneered in src/ui/Entrypoints/ EditTokenMetadata.jsx:

pgsql
Copy
• A GridWrap with grid-template-columns:repeat(12,1fr) and
breakpoint collapse to single column at ≤ 1100 px.
• An inner FormGrid using auto‑fit minmax(240px,1fr) (220 px on
ultra‑wide ≥ 1800 px).
• GlobalStyle Break700 patch that lifts any hard‑coded 700 px
max‑width constraints inside third‑party components.
• All <PixelInput/PixelButton> elements arranged so the form remains
fully usable on a 320 px viewport and scales gracefully on
≥ 4 K monitors (columns tighten gap from 1.6 → 1.2 rem at ≥ 1800 px).
• CTA row stacks vertically with .flex-direction:column on mobile
and surfaces a <ul> error list whenever validation fails.
• No media query may introduce horizontal scrolling; use intrinsic
grid re‑flow only.
• Any future module diverging from these specs must add its own
“Break*” GlobalStyle helper and document exceptions inline.

Rationale: guarantees identical ergonomics across the admin suite,
eliminates copy‑paste drift, and codifies the proven pattern that
already passed WCAG AA + LCP audits.
I103 [F] Token‑metadata legacy alias artists is accepted read‑only;
        UI maps it to authors, never writes this key.
I104 [F,C] Contract‑level metadata must include a symbol key
        (3‑5 upper‑case A‑Z/0‑9) positioned directly after name.
        Deploy & edit UIs enforce /^[A-Z0-9]{3,5}$/, loader refuses
        contracts missing the key; guaranteed on‑chain order:
        name → symbol → description.
        (TZIP v4 §2.1 compliance, see commit r745).
I105 [F] Explore Grid Uniformity — the collection grid on every
/explore/* route must use
grid-template-columns:repeat(auto-fill,var(--col))
where --col = clamp(160px,18vw,220px) and width:100%; rows
re‑flow without dead‑space from 320 px up to ≥ 8 K viewports,
guaranteeing ≥ 1 column on smallest devices and edge‑to‑edge fill
on ultra‑wide monitors.
I106 [F] Script‑Hazard Consent — any media or collection thumbnail
flagged by utils/hazards.js as scripts:true must remain
hidden inside a sandboxed <iframe> (no allow‑scripts) until
the user explicitly clicks “Allow scripts — I trust the author”.
Consent persists per wallet via useConsent('scripts'); disabling
clears the flag in localStorage and re‑hides the media.
I107 [F] Hex‑field UTF‑8 repair — any hex‑encoded string returned
from on‑chain metadata must be passed through
decodeHexFields.js before it is rendered, searched or cached.
Components failing to do so are a CI error.

I108 [F] Token‑ID filter UX — collection detail pages expose a
<TokenIdSelect/> dropdown listing live token‑ids; selecting an
id filters the grid instantly on the client without refetching.
Clearing the filter restores the previous search/sort state.

I109 [F,E] Live on‑chain stats — token & owner counts shown in
any UI derive from countTokens.js / countOwners.js and must
not rely on static total_supply; until the async fetch
resolves, the UI displays an ellipsis “…” placeholder.

I110 [F] Integrity badge standardisation — every component that
presents token or collection media must render an
<IntegrityBadge status=…/>; the adjacent tooltip / title
conveys the long‑form label from constants/integrityBadges.js.
I111 [F,C,E,I] Don't use "global" in any comments or line summaries, it messes with yarn lint and throws false warnings
I112 [F,E] Marketplace dialogs (buy/list/offer) must call feeEstimator.js and display <OperationOverlay/> before dispatching any transaction.
I113 [F] Unified Consent Management — all consent decisions use useConsent hook with standardized keys: 'nsfw' (for content), 'flash' (for flashing), 'scripts:{contractAddress}' (per‑contract script execution). Consent state syncs across components via CustomEvent broadcasting and always requires explicit user acknowledgment through PixelConfirmDialog with checkbox agreement to terms.
I114 [F] Portal‑Based Draggable Windows — draggable preview windows use createPortal(component, document.body) for z‑index isolation. Draggable state managed through useRef pattern with randomized start positions (60 + Math.random()*30) to prevent stacking. SSR compatibility: typeof document === 'undefined' ? body : createPortal(body, document.body).
I115 [F] Hazard Detection & Content Protection — all media rendering components must call detectHazards(metadata) before display. Hazard types: { nsfw, flashing, scripts }. Script hazards detect HTML MIME types, JavaScript URIs, SVG with <script> tags. Obfuscation overlays block content until explicit user consent with age verification (18+) for NSFW.
I116 [F] Debounced Form State Pattern — form components maintain local state mirroring parent props with upward change propagation via useEffect. Input sanitization applied at component level. Unique id attributes use index pattern: id={\tid-${index}}. I117 [F] Script Security Model — script execution requires both hazard detection AND user consent. Script consent persists per contract address. EnableScriptsOverlayprovides inline consent,EnableScriptsToggle provides permanent toggle. Terms agreement checkbox required for all script consent flows.

I118 [E] Dual‑Stage Origination — when FAST_ORIGIN=true the origination flow must store a placeholder views pointer and then automatically call edit_contract_metadata (v4) within the same UI session to patch the real metadata; failure to patch is critical and must trigger resume logic.
I119 [F] On‑chain integrity scanning must treat remote domain patterns case‑sensitively: the onChainValidator’s REMOTE_BARE_RE must not match uppercase‑coded identifiers (e.g. Math.PI/…) as remote references. Only safe domains enumerated in SAFE_REMOTE_RE are allowed (see I100).
I120 [F] Development scripts must propagate the selected network into both build‑time and runtime via environment variables (process.env.NETWORK and NEXT_PUBLIC_NETWORK), using the DEV_PORT exported from deployTarget.js; scripts/startDev.js must spawn Next.js via shell mode on the correct port and set these variables before execution.
I121 [F] Explore grids and collection/token pages must derive their TzKT API base URL (TZKT_API) and other network parameters from src/config/deployTarget.js rather than hard‑coding Ghostnet or Mainnet domains (extends I10 and I105).
I122 [F] Token metadata panels must decode contract metadata fully via decodeHexFields/decodeHexJson, fallback through imageUri, logo, artifactUri and thumbnailUri, and display the human‑readable collection name (name → symbol → title → collectionName → short address). Tags must appear with a “Tags:” label and wrap neatly in a single row; meta fields align responsively across breakpoints.
I123 [F] Marketplace actions (BUY/LIST/OFFER) must use a unified MarketplaceBar.jsx overlay stub that informs users that ZeroSum functionality is still under development and directs them to objkt.com. Direct marketplace operations are disabled until the native marketplace contract is ready.
I124 [E,F] Local development must support concurrent Ghostnet and Mainnet instances by using yarn set:<network> && yarn dev:current; the dev:current script must honour the selected network and port (3000 for ghostnet, 4000 for mainnet) without resetting TARGET (build script remains unchanged). Clearing local storage may be necessary after network switches to prevent stale data.
/*
Note: Invariant I118 is newly reintroduced in this revision. Previous releases
adopted a single‑stage origination via wallet.originate, but this proved
incompatible with Temple wallet and other browser extensions due to
payload size limits. Dual‑stage origination reduces the initial
operation payload by omitting heavy fields such as off‑chain view
definitions and high‑resolution images. After the contract is
originated with minimal metadata, a subsequent transaction updates the
%metadata big‑map with the full JSON (views array and real imageUri) via
edit_contract_metadata or update_contract_metadata. The UI tracks
progress across both operations and provides resume support via
localStorage. See src/pages/deploy.js for implementation details.
/
/ New in this revision: Backend forging/injection. The flags
FAST_ORIGIN and USE_BACKEND reside in src/config/deployTarget.js.
When USE_BACKEND=true (default), the front‑end sends only the
contract code, storage and source address to the serverless
endpoints /api/forge and /api/inject. These functions run
Taquito on the server to estimate limits (falling back to safe
defaults), forge the operation and inject it. The wallet signs
a small payload (the forged bytes) rather than the full
operation. When USE_BACKEND=false, client‑side forging via
src/core/net.js is used with a manual gas/storage/fee fallback.
*/

───────────────────────────────────────────────────────────────
3 · reserved for future research notes
────────────────────────────────────────────────────────────────/

───────────────────────────────────────────────────────────────
4 · COMPREHENSIVE SOURCE‑TREE MAP (per‑file description • imports • exports)
───────────────────────────────────────────────────────────────/
/* Legend – one line per path, keep case‑exact
   <relative‑path> – <purpose>; Imports: <comma‑list>; Exports: <comma‑list>
   “·” = none.  */

zerounbound – repo root; Imports:· Exports:·
zerounbound/.eslintrc.cjs – ESLint ruleset; Imports: eslint-config-next; Exports: module.exports
zerounbound/.gitignore – git ignore list; Imports:· Exports:·
zerounbound/.prettierrc – Prettier config; Imports:· Exports: module.exports
zerounbound/.yarnrc.yml – Yarn 4 settings; Imports:· Exports:·
zerounbound/.yarn/install-state.gz – Yarn install marker; Imports:· Exports:·
zerounbound/.github/CODEOWNERS – repo ownership map; Imports:· Exports:·
zerounbound/.github/PULL_REQUEST_TEMPLATE.md – PR template; Imports:· Exports:·
zerounbound/.github/ci.yml – CI workflow; Imports:· Exports:·
zerounbound/next-env.d.ts – Next.js TS globals; Imports:· Exports:·
zerounbound/bundle.config.json – bundle glob map (I14); Imports:· Exports:·
zerounbound/LICENSE – MIT licence text; Imports:· Exports:·
zerounbound/README_contract_management.md (retired 512c275) – former overview; Imports:· Exports:·
zerounbound/next.config.js – Next.js config; Imports: next-mdx,@next/font; Exports: module.exports
zerounbound/jest.config.cjs – Jest config; Imports:· Exports: module.exports
zerounbound/package.json – NPM manifest; Imports:· Exports: scripts,dependencies
zerounbound/tsconfig.json – TS path hints for IDE; Imports:· Exports: compilerOptions
zerounbound/yarn.lock – Yarn lockfile; Imports:· Exports:·

╭── development environment ───────────────────────────────────────────────────────────────╮
zerounbound/.vscode/settings.json – VSCode TypeScript configuration; Imports:· Exports:·
zerounbound/.vscode/tasks.json – VSCode build task configuration; Imports:· Exports:·

╭── build / infra ───────────────────────────────────────────────────────────╮
zerounbound/scripts/ensureDevManifest.js – CI guard for dev manifest; Imports: fs,path; Exports: main
zerounbound/scripts/generateBundles.js – dumps bundles → summarized_files; Imports: globby,fs; Exports: main
zerounbound/scripts/generateManifest.js – rebuilds this manifest; Imports: fs,globby; Exports: main
zerounbound/scripts/setTarget.js – switches TARGET (I63); Imports: fs; Exports: setTarget
zerounbound/scripts/startDev.js – custom dev wrapper; Imports: child_process; Exports: main
zerounbound/scripts/updatePkgName.js – rewrites package.json name; Imports: fs; Exports: main
zerounbound/scripts/codex-setup.sh – Codex CI bootstrap; Imports:· Exports:·

zerounbound/src/pages/api/forge.js – removed (r1015) obsolete serverless forge endpoint
zerounbound/src/pages/api/inject.js – removed (r1015) obsolete serverless inject endpoint
zerounbound/src/utils/chooseFastestRpc.js – RPC race chooser; Imports: RPC_URLS; Exports: chooseFastestRpc

╭── contracts (michelson) ───────────────────────────────────────────────────╮
zerounbound/contracts/Zero_Contract_V3.tz – legacy contract v3 (read‑only); Imports:· Exports:·
zerounbound/contracts/Zero_Contract_V4.tz – canonical ZeroContract v4; Imports:· Exports:·
zerounbound/contracts/ZeroSum.tz – ZeroSum marketplace; Imports:· Exports:·
zerounbound/contracts/ZeroSum - Copy.txt – backup copy of ZeroSum marketplace contract; Imports:· Exports:·
zerounbound/contracts/metadata/views/Zero_Contract_v4_views.json – off‑chain views; Imports:· Exports:·

╭── forge_service_node – new remote forging service ───────────────────────────────╮
forge_service_node/Dockerfile – builds Node service on Render; Imports: node:18-slim; Exports: container image
forge_service_node/index.js – Express server exposing /forge, /inject and /healthz endpoints; Imports: express,cors,@taquito/rpc,@taquito/michel-codec; Exports: Express app
forge_service_node/README.md – service documentation explaining endpoints, environment variables (PORT,RPC_URL), local development and Render deployment; Imports:· Exports:·

╭── public assets ───────────────────────────────────────────────────────────╮
zerounbound/public/embla-left.svg – carousel arrow ⬅; Imports:· Exports:·
zerounbound/public/embla-right.svg – carousel arrow ➡; Imports:· Exports:·
zerounbound/public/favicon.ico – site favicon; Imports:· Exports:·
zerounbound/public/manifest.base.json – PWA base manifest; Imports:· Exports:·
zerounbound/public/manifest.json – PWA build manifest; Imports: manifest.base.json; Exports:·
zerounbound/public/sw.js – Workbox 7 service‑worker; Imports: workbox-sw; Exports: self.addEventListener
zerounbound/public/fonts/PixeloidMono-d94EV.ttf – mono pixel font; Imports:· Exports:·
zerounbound/public/fonts/PixeloidSans-mLxMm.ttf – sans pixel font; Imports:· Exports:·
zerounbound/public/fonts/PixeloidSansBold-PKnYd.ttf – bold pixel font; Imports:· Exports:·
zerounbound/public/sprites/Banner.png – hero banner PNG; Imports:· Exports:·
zerounbound/public/sprites/Banner.psd – banner source PSD; Imports:· Exports:·
zerounbound/public/sprites/Burst.svg – celebration burst; Imports:· Exports:·
zerounbound/public/sprites/cover_default.svg – fallback NFT cover; Imports:· Exports:·
zerounbound/public/sprites/ghostnet_logo.png – Ghostnet logo PNG; Imports:· Exports:·
zerounbound/public/sprites/ghostnet_logo.svg – Ghostnet logo SVG; Imports:· Exports:·
zerounbound/public/sprites/ghostnetBanner.png – Ghostnet banner; Imports:· Exports:·
zerounbound/public/sprites/loading.svg – large loading spinner; Imports:· Exports:·
zerounbound/public/sprites/loading16x16.gif – 16 px loading GIF; Imports:· Exports:·
zerounbound/public/sprites/loading48x48.gif – 48 px loading GIF; Imports:· Exports:·
zerounbound/public/sprites/logo.png – logo raster; Imports:· Exports:·
zerounbound/public/sprites/logo.psd – logo source PSD; Imports:· Exports:·
zerounbound/public/sprites/logo.svg – Zero logo; Imports:· Exports:·

╭── src/config ──────────────────────────────────────────────────────────────╮
zerounbound/src/config/deployTarget.js – TARGET constant (I10) and network configuration (rpc urls, site urls, etc.), now always enabling FAST_ORIGIN by default and defining FORGE_SERVICE_URL per network; Imports:· Exports: TARGET
zerounbound/src/config/networkConfig.js – RPC endpoints map; Imports:· Exports: NETWORKS

╭── src/constants ───────────────────────────────────────────────────────────╮
zerounbound/src/constants/funLines.js – rotating overlay quotes; Imports:· Exports: FUN_LINES
zerounbound/src/constants/integrityBadges.js – on‑chain badge map; Imports:· Exports: INTEGRITY_* helpers
zerounbound/src/constants/mimeTypes.js – recognised MIME map; Imports:· Exports: MIME_TYPES

╭── src/contexts ────────────────────────────────────────────────────────────╮
zerounbound/src/contexts/ThemeContext.js – dark/light palette ctx; Imports: react,styled-components; Exports: ThemeProvider,useTheme
zerounbound/src/contexts/WalletContext.js – Beacon wallet ctx; Imports: react,@taquito/beacon-wallet; Exports: WalletProvider,useWallet

╭── src/core ────────────────────────────────────────────────────────────────╮
zerounbound/src/core/batch.js – batch ops (v1‑v4); Imports: @taquito/utils,net.js; Exports: forgeBatch,sendBatch,buildAppendTokenMetaCalls,sliceHex,splitPacked
zerounbound/src/core/batchV4a.js – v4a‑specific batch ops; Imports: @taquito/taquito; Exports: SLICE_SAFE_BYTES,sliceHex,buildAppendTokenMetaCalls
zerounbound/src/core/feeEstimator.js – chunk‑safe fee/burn estimator; Imports: @taquito/taquito; Exports: estimateChunked,calcStorageMutez,toTez
zerounbound/src/core/marketplace.js – ZeroSum helpers; Imports: net.js,@taquito/taquito; Exports: buildBuyParams,buildListParams,buildOfferParams
zerounbound/src/core/net.js – network helpers (jFetch, forgeOrigination, injectSigned). This module now always attempts remote forging/injecting via FORGE_SERVICE_URL before falling back to local forging using Taquito’s LocalForger/TezosToolkit. Imports: Parser,@taquito/michelson-encoder,deployTarget; Exports: jFetch,forgeOrigination,injectSigned
zerounbound/src/core/validator.js – JSON‑schema helpers; Imports: ajv; Exports: validateContract,validateToken

╭── src/data ────────────────────────────────────────────────────────────────╮
zerounbound/src/data/entrypointRegistry.json – EP button matrix (I75); Imports:· Exports:·
zerounbound/src/data/hashMatrix.json – SHA‑1 → version map (I12); Imports:· Exports:·

╭── src/hooks ───────────────────────────────────────────────────────────────╮
zerounbound/src/hooks/useConsent.js – persistent consent flags; Imports: react; Exports: useConsent
zerounbound/src/hooks/useHeaderHeight.js – sets --hdr var; Imports: react; Exports: useHeaderHeight
zerounbound/src/hooks/useViewportUnit.js – sets --vh var; Imports: react; Exports: useViewportUnit
zerounbound/src/hooks/useTxEstimate.js – dry‑run gas/fee; Imports: @taquito/taquito; Exports: useTxEstimate

╭── src/pages (Next.js) ─────────────────────────────────────────────────────╮
zerounbound/src/pages/contracts/[addr].jsx – collection detail page; Imports: ContractMetaPanelContracts,TokenCard,hazards.js; Exports: ContractPage
zerounbound/src/pages/explore/[[...filter]].jsx – dynamic explore grid; Imports: CollectionCard,useConsent; Exports: Explore
zerounbound/src/pages/explore/search.jsx (retired 10d92ac) – former advanced token search; Imports:· Exports:·
zerounbound/src/pages/tokens/[addr]/[tokenId].jsx – token-detail page; Imports: RenderMedia,hazards,useConsent; Exports: TokenDetailPage
zerounbound/src/pages/_app.js – root providers; Imports: ThemeContext,WalletContext,GlobalStyles; Exports: MyApp
zerounbound/src/pages/_document.js – custom document (I20); Imports: next/document; Exports: default class
zerounbound/src/pages/deploy.js – create collection UI; Imports: DeployCollectionForm,Layout; Exports: DeployPage
zerounbound/src/pages/index.js – landing page; Imports: Layout,CRTFrame; Exports: Home
zerounbound/src/pages/manage.js – manage page; Imports: Layout,AdminTools; Exports: ManagePage
zerounbound/src/pages/terms.js – ToS page; Imports: Layout; Exports: TermsPage

╭── src/styles ──────────────────────────────────────────────────────────────╮
zerounbound/src/styles/globalStyles.js – root CSS + scrollbar; Imports: styled-components,palettes.json; Exports: GlobalStyles
zerounbound/src/styles/palettes.json – theme palettes; Imports:· Exports:·

╭── src/ui (shell) ──────────────────────────────────────────────────────────╮
zerounbound/src/ui/CollectionCard.jsx – responsive 8‑bit contract card; Imports: React,hazards,useConsent,RenderMedia; Exports: CollectionCard
zerounbound/src/ui/CRTFrame.jsx – CRT screen border; Imports: react; Exports: CRTFrame
zerounbound/src/ui/ExploreNav.jsx – sticky explore nav bar; Imports: PixelButton; Exports: ExploreNav
zerounbound/src/ui/FiltersPanel.jsx – explore filters sidebar; Imports: React; Exports: FiltersPanel
zerounbound/src/ui/Header.jsx – top nav + network switch; Imports: react,useWallet,useTheme; Exports: Header
zerounbound/src/ui/Layout.jsx – app shell & scroll‑lock; Imports: Header,useViewportUnit,useHeaderHeight; Exports: Layout
zerounbound/src/ui/LoadingSpinner.jsx – 8‑bit spinner; Imports: react; Exports: LoadingSpinner
zerounbound/src/ui/PixelButton.jsx – pixel art <button>; Imports: styled-components; Exports: PixelButton
zerounbound/src/ui/PixelConfirmDialog.jsx – confirm modal; Imports: react,PixelButton; Exports: PixelConfirmDialog
zerounbound/src/ui/PixelHeading.jsx – pixel art <h*>; Imports: styled-components; Exports: PixelHeading
zerounbound/src/ui/PixelInput.jsx – pixel art <input>; Imports: styled-components; Exports: PixelInput
zerounbound/src/ui/ThemeToggle.jsx – palette switch button; Imports: ThemeContext; Exports: ThemeToggle
zerounbound/src/ui/WalletNotice.jsx – wallet status banner; Imports: useWallet; Exports: WalletNotice
zerounbound/src/ui/ZerosBackground.jsx – animated zeros field; Imports: react; Exports: ZerosBackground
zerounbound/src/ui/IntegrityBadge.jsx – on‑chain integrity badge; Imports: react,integrityBadges.js,PixelButton.jsx; Exports: IntegrityBadge
zerounbound/src/ui/MakeOfferBtn.jsx - XS size, make-offer button from marketplace contract ZeroSum.tz Import:PropTypes,PixelButton Export:MakeOfferBtn
zerounbound/src/ui/MAINTokenMetaPanel.jsx – enhanced token metadata panel with hazard detection and consent handling; Imports: React,PropTypes,date-fns,styled-components,detectHazards,useConsent,IntegrityBadge,onChainValidator,hashMatrix; Exports: MAINTokenMetaPanel

╭── src/ui/operation & misc ─────────────────────────────────────────────────╮
zerounbound/src/ui/AdminTools.jsx – dynamic entry‑point modal; Imports: react,WalletContext; Exports: AdminTools
zerounbound/src/ui/OperationConfirmDialog.jsx – tx summary dialog; Imports: react,PixelConfirmDialog; Exports: OperationConfirmDialog
zerounbound/src/ui/OperationOverlay.jsx – progress overlay with status updates and Temple prompts; Imports: react,useWheelTunnel,LoadingSpinner,CanvasFireworks,PixelButton; Exports: OperationOverlay
zerounbound/src/ui/ContractCarousels.jsx – live contract cards; Imports: react,jFetch,countTokens; Exports: ContractCarousels
zerounbound/src/ui/ContractMetaPanel.jsx – contract stats card; Imports: react,styled-components; Exports: ContractMetaPanel
zerounbound/src/ui/ContractMetaPanelContracts.jsx – banner panel on /contracts; Imports: React,RenderMedia; Exports: ContractMetaPanelContracts
zerounbound/src/ui/DeployCollectionForm.jsx – collection deploy UI; Imports: react,validator,OperationOverlay; Exports: DeployCollectionForm
zerounbound/src/ui/BuyDialog.jsx – buy confirmation dialog; Imports: React,OperationConfirmDialog,feeEstimator.js; Exports: BuyDialog
zerounbound/src/ui/ListTokenDialog.jsx – listing dialog; Imports: React,OperationOverlay,PixelInput; Exports: ListTokenDialog
zerounbound/src/ui/MarketplaceBar.jsx – token action bar; Imports: React,PixelButton; Exports: MarketplaceBar
zerounbound/src/ui/GlobalSnackbar.jsx – global toast host; Imports: React; Exports: GlobalSnackbar
zerounbound/src/ui/MakeOfferDialog.jsx - add amount and make your bid; Imports:React,styledPkg,PixelInput,PixelButton,useWalletContext Export:MakeOfferDialog
zerounbound/src/ui/TokenCard.jsx – token preview card; Imports: React,hazards,useConsent; Exports: TokenCard
zerounbound/src/ui/TokenIdSelect.jsx – live id dropdown; Imports: styled-components; Exports: TokenIdSelect
zerounbound/src/ui/TokenMetaPanel.jsx – detailed token panel; Imports: React,RenderMedia; Exports: TokenMetaPanel
zerounbound/src/ui/canvasFireworks.jsx – confetti canvas; Imports: react; Exports: FireworksCanvas
zerounbound/src/ui/EnableScripts.jsx – common enable scripts prompt components; Imports: React,PropTypes,PixelButton Exports: EnableScriptsOverlay,EnableScriptsToggle
zerounbound/src/ui/FullscreenModal.jsx - reusable fullscreen viewer + pixel-upscale control; Imports: React,PropTypes,styledPkg,RenderMedia,PixelButton,pixelUpscaleStyle Exports: FullscreenModal

╭── src/ui/Entrypoints (v4 & v4a) ───────────────────────────────────────────╮
zerounbound/src/ui/Entrypoints/index.js – lazy EP resolver; Imports: dynamic import; Exports: resolveEp
zerounbound/src/ui/Entrypoints/AddRemoveCollaborator.jsx – v3/v4 collab mutator; Imports: react,OperationOverlay; Exports: AddRemoveCollaborator
zerounbound/src/ui/Entrypoints/AddRemoveParentChild.jsx – relation manager; Imports: react; Exports: AddRemoveParentChild
zerounbound/src/ui/Entrypoints/AppendArtifactUri.jsx – slice uploader (I60); Imports: batch,sliceCache,useTxEstimate; Exports: AppendArtifactUri
zerounbound/src/ui/Entrypoints/AppendExtraUri.jsx – extra media uploader; Imports: batch,sliceCache,useTxEstimate; Exports: AppendExtraUri
zerounbound/src/ui/Entrypoints/BalanceOf.jsx – balance viewer; Imports: react; Exports: BalanceOf
zerounbound/src/ui/Entrypoints/Burn.jsx – burn token; Imports: react,OperationConfirmDialog; Exports: Burn
zerounbound/src/ui/Entrypoints/BurnV4.jsx – burn token v4a-safe; Imports: react,OperationConfirmDialog; Exports: BurnV4
zerounbound/src/ui/Entrypoints/ClearUri.jsx – clear artifactUri; Imports: react; Exports: ClearUri
zerounbound/src/ui/Entrypoints/Destroy.jsx – destroy contract; Imports: react; Exports: Destroy
zerounbound/src/ui/Entrypoints/EditContractMetadata.jsx – contract meta editor (stub); Imports: react,TokenMetaPanel; Exports: EditContractMetadata
zerounbound/src/ui/Entrypoints/EditTokenMetadata.jsx – token meta editor (stub); Imports: react,TokenMetaPanel; Exports: EditTokenMetadata
zerounbound/src/ui/Entrypoints/ManageCollaborators.jsx – v3/v4 collab GUI; Imports: react; Exports: ManageCollaborators
zerounbound/src/ui/Entrypoints/ManageParentChild.jsx – parent/child GUI; Imports: react; Exports: ManageParentChild
zerounbound/src/ui/Entrypoints/Mint.jsx – main mint flow; Imports: batch,useTxEstimate,sliceCache; Exports: Mint
zerounbound/src/ui/Entrypoints/MintV4a.jsx – v4a mint UI; Imports: batchV4a.js,sliceCacheV4a.js,feeEstimator.js,sleepV4a.js; Exports: MintV4a
zerounbound/src/ui/Entrypoints/MintPreview.jsx – pre‑mint gallery; Imports: react,RenderMedia; Exports: MintPreview
zerounbound/src/ui/Entrypoints/MintUpload.jsx – drag/upload step; Imports: react,PixelButton,mimeTypes.js,PixelConfirmDialog.jsx,onChainValidator.js; Exports: MintUpload
zerounbound/src/ui/Entrypoints/RepairUri.jsx – diff repair (I60); Imports: batch,sliceCache,useTxEstimate; Exports: RepairUri
zerounbound/src/ui/Entrypoints/RepairUriV4a.jsx – v4a diff repair; Imports: batchV4a.js,sliceCacheV4a.js,useTxEstimate; Exports: RepairUriV4a
zerounbound/src/ui/Entrypoints/Transfer.jsx – FA2 transfer; Imports: react; Exports: Transfer
zerounbound/src/ui/Entrypoints/UpdateOperators.jsx – operator set; Imports: react; Exports: UpdateOperators
zerounbound/src/ui/Entrypoints/AddRemoveCollaboratorsv4a.jsx – v4a bulk collab; Imports: react; Exports: AddRemoveCollaboratorsv4a
zerounbound/src/ui/Entrypoints/ManageCollaboratorsv4a.jsx – v4a collab GUI; Imports: react; Exports: ManageCollaboratorsv4a
zerounbound/src/ui/Entrypoints/UpdateContractMetadatav4a.jsx – v4a contract meta editor; Imports: react; Exports: UpdateContractMetadatav4a
zerounbound/src/ui/Entrypoints/AppendTokenMetadatav4a.jsx – v4a token meta slices; Imports: batchV4a.js,sliceCacheV4a.js,feeEstimator.js; Exports: AppendTokenMetadatav4a
zerounbound/src/ui/Entrypoints/UpdateTokenMetadatav4a.jsx – v4a token meta editor; Imports: react; Exports: UpdateTokenMetadatav4a
zerounbound/src/ui/Entrypoints/TokenPreviewWindow.jsx – draggable token preview window component using portal pattern; Imports: React,createPortal,styled-components,PixelButton,TokenMetaPanel,jFetch,TZKT_API; Exports: TokenPreviewWindow
zerounbound/src/ui/Entrypoints/TransferRow.jsx – reusable row component for batch transfer UI with metadata preview; Imports: React,styled-components,PixelInput,PixelButton,TokenMetaPanel,TZKT_API,jFetch; Exports: TransferRow

╭── src/utils ───────────────────────────────────────────────────────────────╮
zerounbound/src/utils/countAmount.js – count editions in tokens (exclude burned tokens); Imports:· Exports: countAmount
zerounbound/src/utils/countOwners.js – distinct owner counter; Imports: net.js; Exports: countOwners
zerounbound/src/utils/countTokens.js – on‑chain count via tokens/count; Imports: jFetch; Exports: countTokens
zerounbound/src/utils/decodeHexFields.js – hex → UTF‑8 deep repair; Imports:· Exports: default
zerounbound/src/utils/formatAddress.js – tz/KT1 truncator + copy; Imports:· Exports: shortKt,copyToClipboard
zerounbound/src/utils/hazards.js – detect nsfw/flashing/script flags; Imports: mimeTypes; Exports: detectHazards
zerounbound/src/utils/listLiveTokenIds.js – TzKT id fetcher (TTL 30 s); Imports: net.js; Exports: listLiveTokenIds
zerounbound/src/utils/onChainValidator.js – fast FOC heuristic (I99); Imports: validator.js; Exports: checkOnChainIntegrity
zerounbound/src/utils/pixelUpscale.js – reusable css helpers for pixel‑art upscaling; Imports:· Exports: pixelUpscaleStyle
zerounbound/src/utils/RenderMedia.jsx – data‑URI media viewer; Imports: React,mimeTypes.js; Exports: RenderMedia
zerounbound/src/utils/sliceCache.js – localStorage cache (I60); Imports: sha.js; Exports: saveSlice,loadSlice,purgeExpired
zerounbound/src/utils/sliceCacheV4a.js – v4a slice cache (I61); Imports: crypto; Exports: saveSliceCheckpoint,loadSliceCheckpoint,clearSliceCheckpoint,purgeExpiredSliceCache,strHash
zerounbound/src/utils/toNat.js – address → nat util; Imports:· Exports: toNat
zerounbound/src/utils/uriHelpers.js – base64/data‑URI helpers; Imports:· Exports: ensureDataUri,getMime
zerounbound/src/utils/useIsoLayoutEffect.js – SSR‑safe layout effect; Imports: react; Exports: useIsoLayoutEffect
zerounbound/src/utils/useWheelTunnel.js – wheel event tunnel (I64); Imports: react; Exports: useWheelTunnel

╭── src/workers ─────────────────────────────────────────────────────────────╮
zerounbound/src/workers/originate.worker.js – web‑worker contract origination; Imports: @taquito/taquito,net.js; Exports: onmessage

╭── summarized_files (bundle drops) ────────────────────────────────────────╮
zerounbound/summarized_files/contracts_bundle.txt – Michelson dump; Imports:· Exports:·
zerounbound/summarized_files/engine_bundle.txt – Node/core dump; Imports:· Exports:·
zerounbound/summarized_files/frontend_bundle.txt – UI dump; Imports:· Exports:·
zerounbound/summarized_files/assets_bundle.txt – public dump; Imports:· Exports:·
zerounbound/summarized_files/infra_bundle.txt – infra dump; Imports:· Exports:·

───────────────────────────────────────────────────────────────
5 · BUNDLE INDEX (How to read) — each text-dump lives in summarized_files/
───────────────────────────────────────────────────────────────/
contracts_bundle.txt → Michelson sources + views
assets_bundle.txt  → fonts, sprites, sw.js
engine_bundle.txt  → scripts/, core/, data/, config/, constants/, utils/
(now includes utils/decodeHexFields.js)
frontend_bundle.txt → contexts/, hooks/, ui/, pages/, styles/
(now includes ui/TokenIdSelect.jsx)
infra_bundle.txt   → root configs, next.config.js, package.json, CI helpers
master_bundle.txt → contains everything in all the above bundles.

───────────────────────────────────────────────────────────────
6 · QUICK‑START & CI PIPELINE — updated commands
───────────────────────────────────────────────────────────────/
corepack enable && corepack prepare yarn@4.9.1 --activate
yarn install

### OpenAI Codex setup script
Codex pulls scripts/codex-setup.sh automatically:

bash
Copy
#!/usr/bin/env bash
corepack enable
corepack prepare yarn@4.9.1 --activate
yarn install --immutable --inline-builds
The same script creates a .yarn_state marker so subsequent
yarn lint / build / test stages find the workspace ready.

### Vercel

Project       Build Command                           Domains
ghostnet      yarn set:ghostnet && yarn build       ghostnet.zerounbound.art
mainnet       yarn set:mainnet  && yarn build       zerounbound.art, www.*

No environment variables; scripts/setTarget.js rewrites deployTarget.js.

Local development
To run the development server against a specific network you must set
the TARGET via yarn set:<network> and use the dev:current script
which honours the selected network and port without resetting the
target. For example:

bash
Copy
# Ghostnet (default) on port 3000
yarn set:ghostnet
yarn dev:current

# Mainnet on port 4000
yarn set:mainnet
yarn dev:current
The canonical yarn dev script always resets TARGET to ghostnet
before building. Use dev:current when you want to run the server
without switching targets. Clearing local storage may be necessary
between switches to avoid stale data.

───────────────────────────────────────────────────────────────
7 · APPENDICES (How to read) — machine‑readables live in code
───────────────────────────────────────────────────────────────/
A. hashMatrix.json, contains all the typeHashes' generated by tzkt used in filtering and labeling contract versions and more (unchanged).

B. entrypointRegistry.json, contains all Entrypoints used across our supported v1-v4c contracts (unchanged).

──────────────────────────────────────────────────────────────
CHANGELOG
──────────────────────────────────────────────────────────────/
• r1017 2025‑07‑22 UTC — added invariants I119–I124 covering case‑sensitive remote detection, dynamic dev scripts, TzKT API derivation, improved metadata panels and tags, unified marketplace overlay, and dual‑network development; updated revision and summary; removed application domain whitelisting; refined onChainValidator remote detection.
• r1015 2025‑07‑20 UTC — migrated to Node‑based remote forging service; removed serverless forge/inject endpoints (src/pages/api/forge.js and src/pages/api/inject.js) and USE_BACKEND flag; updated environment guidance to always use FAST_ORIGIN with local fallback; added forge_service_node entries and deployment instructions; updated Source‑tree map and high‑level architecture accordingly.
• r1014 2025‑07‑19 UTC — restored dual‑stage origination and manual forging fallback; updated invariants and environment flag guidance accordingly.
• r1014 2025‑07‑19 UTC — restored dual‑stage origination, manual forging fallback and serverless forging/inject endpoints; updated invariants and environment flag guidance accordingly.
• r1013 2025‑07‑19 UTC — removed dual‑stage origination and backend forging; deprecated USE_BACKEND and FAST_ORIGIN flags; updated manifest and invariants to reflect single‑stage origination via wallet.originate.
• r1012 2025‑07‑18 UTC — added dual‑stage origination environment flags, serverless forge/inject endpoints and invariant I118; updated manifest accordingly.
• r865 2025‑07‑16 UTC — countTokens.js now fetches /tokens/count for reliable totals; manifest entry updated accordingly.
...
/* EOF */