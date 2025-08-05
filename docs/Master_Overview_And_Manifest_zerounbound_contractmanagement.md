
/*─────────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    docs/Master_Overview_And_Manifest_zerounbound_contractmanagement.txt
  Rev :    r1161    2025‑08‑01 UTC
  Summary: update network configuration exports (DOMAIN_CONTRACTS and FALLBACK_RPCS) in deployTarget.js; improve resolveTezosDomain.js to skip KT1 addresses, import network constants and avoid 400 errors; add Invariant I131 to formalize Tezos domain resolution rules.  This revision amends the source‑tree map entries for deployTarget.js and resolveTezosDomain.js, extends the invariants list to I131, and appends a changelog entry.  All other sections are preserved verbatim to maintain a complete history.
──────────────────────────────────────────────────────────────────*/

════════════════════════════════════════════════════════════════
ZERO UNBOUND v4 — MASTER OVERVIEW & SOURCE‑FILE MANIFEST
════════════════════════════════════════════════════════════════

───────────────────────────────────────────────────────────────
WHAT IS THIS FILE? (unabridged)
───────────────────────────────────────────────────────────────
This document is the single‑source‑of‑truth for the Zero Unbound
platform. A fresh git clone plus this manifest and the bundle
outputs yield a reproducible build on any host. It outlines the
architecture, invariants, source‑tree map and CI pipeline. History
is append‑only; revisions are never overwritten.

The project now uses a unified single‑stage origination pipeline
even when a factory contract is configured. When a factory
address exists for the target network, the UI assembles the full
metadata JSON (keys ordered per TZIP‑16) and encodes it as a
bytes parameter. This bytes payload contains only the metadata
and off‑chain views; storage pairs are not included. The
factory constructs the storage internally and originates a new v4
contract via CREATE_CONTRACT. On networks without a factory,
the UI falls back to toolkit.wallet.originate() with the full
metadata big‑map. This design ensures compatibility across
wallets while eliminating payload size limits. Marketplace
integration has been expanded to include listings, offers and
tokens pages under /explore and /my. See sections below for
details.

════════════════════════════════════════════════════════════════
TABLE OF CONTENTS
════════════════════════════════════════════════════════════════
0 · Global Rules & Meta Docs
1 · High‑Level Architecture
1·5 Critical‑Entry Index
2 · Invariants (I00 – I131)
3 · Reserved
4 · Source‑Tree Map (per‑file description + imports/exports)
5 · Bundle Index
6 · Quick‑Start & CI Pipeline
7 · Appendices
8 · Change Log

───────────────────────────────────────────────────────────────
0 · GLOBAL RULES & META DOCS
───────────────────────────────────────────────────────────────
• History is append‑only; patch instead of overwrite.
• Binary artefacts stay out of bundles.
• docs/ mirrors this master—update both when changes occur.
• The TZIP compliance invariants live in
docs/TZIP_Compliance_Invariants_ZeroContract_V4.md and extend
this manifest’s rules.

───────────────────────────────────────────────────────────────
1 · HIGH‑LEVEL ARCHITECTURE & DATA‑FLOW
───────────────────────────────────────────────────────────────
Browser (React 18 + styled‑components 6) → ZeroFrontend SPA
(Next.js 15.x) → ZeroEngine API (Node 22 + Taquito) → ZeroContracts
v4/v4a + ZeroSum Marketplace (Tezos L1). 100 % on‑chain media via
data URIs. All remote HTTP traffic uses core/net.js with
multi‑RPC fallback and exponential back‑off.

Single‑Stage Origination — The UI collects user metadata via
DeployCollectionForm, constructs a deterministic metadata object
with ordered keys (name, symbol, description, version, license,
authors, homepage, authoraddress, creators, type, interfaces,
imageUri, views), encodes it to bytes and calls the factory’s
deploy entrypoint. The factory ignores the bytes payload when
constructing storage but stores the metadata on chain via
tezos‑storage:content. On networks without a factory, the
frontend still builds a metadata big‑map and uses
wallet.originate().

Marketplace Integration — The explore section now includes a
/explore/listings page listing tokens with active marketplace
listings, and the my section includes my/offers and my/tokens pages
showing offers and tokens tied to the connected wallet. The
ZeroSum marketplace contract and its views are imported from
contracts/Marketplace. Listing and offer actions use
src/core/marketplace.js and display progress via OperationOverlay.

───────────────────────────────────────────────────────────────
1·5 · CRITICAL‑ENTRY INDEX 🗝️
───────────────────────────────────────────────────────────────
• src/pages/deploy.js – updated to send only metadata bytes to
the factory and to fall back to wallet.originate() when no
factory is configured. Implements ordered metadata keys and
dynamic entrypoint resolution.
• src/pages/explore/listings/index.jsx – displays all tokens with
active marketplace listings, loads lowest listing prices and
uses MarketplaceBar for buy/list/offer actions.
• src/pages/my/collections.jsx – lists collections created or
owned by the wallet.
• src/pages/my/offers.jsx – lists marketplace offers to accept or
offers made by the wallet.
• src/pages/my/tokens.jsx – lists tokens minted or purchased by
the wallet, merges creator and firstMinter queries, parses
JSON‑encoded creators arrays and filters by live balances.
• src/core/marketplace.js – ZeroSum marketplace helpers for
constructing buy, list and offer parameters.
• src/ui/MarketplaceBar.jsx – token‑detail action bar for
marketplace interactions.
• src/ui/Entrypoints/CancelListing.jsx,
AcceptOffer.jsx – marketplace entrypoint components.
• src/utils/resolveTezosDomain.js – reverse resolver used
throughout the UI to display .tez domains for addresses; now
imports network‑specific constants from deployTarget.js and
skips contract addresses (see I131).
• src/utils/decodeHexFields.js – deep UTF‑8 repair for
on‑chain metadata.
• src/utils/hazards.js – MIME‑level hazard detection.

───────────────────────────────────────────────────────────────
2 · INVARIANTS 🔒 (scope tags: [F]rontend | [C]ontract | [E]ngine | [I]nfra)
───────────────────────────────────────────────────────────────
I00 [F, C, E, I] All UI elements—styling, fonts, buttons, overlays, popups,
containers, and more—must follow our 8‑bit retro arcade theme, including
pixel fonts, sprites, palettes, layouts, and theme context. Every component and
page should be resolution‑ and aspect‑ratio‑agnostic: interfaces must adapt
fluidly so text, images, and containers render and resize correctly on any
device or viewport.
I01 [C] One canonical on‑chain record per contract instance.
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
I49 [F,C] Token metadata arrays/objects JSON‑encode exactly once then
hex‑wrap.
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
I60 [F,E] Resumable Slice Uploads — Mint, Append & Repair
• Oversize writes are chunked (32 768 B – 1 024 head‑room); first slice
inside the mint, the rest via append* in strict order.
• Each chunk persists a checkpoint in
localStorage.zuSliceCache.<network>[<contract>:<tokenId>:<label>]:
{ tokenId:nat, label:"artifactUri"|…, total:nat, next:nat,
chunkSize:32768, hash:"sha256:<hex>", updated:<unix-ms> }
• Upload resumes at next, clears cache once confirmed next===total,
and is idempotent — repeating slices can’t corrupt bytes.
• RepairUri rebuilds on-chain dataURI, byte-diffs against re-upload, aborts
on mismatch (“Conflict detected — choose correct file” toast).
• UI rejects out-of-order, oversize or duplicate slices with toast feedback.
I61 [F] Slice-Cache Hygiene & Expiry
• purgeExpiredSliceCache() runs on app boot + mount of slice UIs.
• Cache entry auto-deletes when:
– stale ≥ 24 h • total === 0 • hash mismatch • global > 5 MB.
• Purge is non-blocking; all IO sits in try {} catch {} so quota /
private‑mode issues never break the UI.
I62 [F] Busy‑Select Spinner.
I63 [I] Single‑Repo Target Switch (scripts/setTarget.js).
I64 [F] Wheel‑Tunnel Modals.
I65 [F] Immediate Busy Indicators — superseded by I76.
I66 [F] Empty‑Collection Grace.
I67 [F,E] Filter destroyed / burn balances.
I68 [E] listLiveTokenIds.js 30 s TTL.
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
I86 [F] HelpBox Standard — every entry‑point component exposes a
concise .75 rem HelpBox covering Purpose, When and
How-To; rendered immediately below the PixelHeading.
I87 [F] Live JSON Validation — metadata editors must disable CTA
until supplied text parses as valid UTF-8 JSON.
I88 [I] ESLint no-local-estimator Rule — any inline fee/burn
calculation outside feeEstimator.js is a CI error.
I89 [F,E] v4a slice batch operations must compute storageLimit dynamically based on actual payload size (+128-byte padding), preventing Michelson stack overflow.
I90 [F] All async wait/sleep logic standardised on sleepV4a.js.
I91 [F,E] All ledger sync helpers (waitForLedger) share the same Michelson key-building logic, ensuring consistency and preventing FA2 balance errors.
I92 [F,E] Mint operations (MintV4a.jsx) utilize a single, centralized ledger-wait implementation, invoked only after the first batch slice in oversize uploads.
I93 [F] OperationOverlay “fun lines” scroll every ≈ 3 000 ms with a brief 250 ms pause per line, Solari‑board style animation.
I94 [F] AdminTools “Token Actions” header no longer shows dynamic count; only contextual counts (Collaborators, Parent/Child) remain.
I95 [F] v4a collections display an inline experimental banner inside AdminTools (“⚠ ZeroTerminal contracts under construction …”).
I96 [F] OperationOverlay fun-lines text colour must use var(--zu-accent) so the Solari board adapts to active palette, uses CSS-steps Solari board to stay live during hangs.
I97 [F] OperationOverlay “Close” button triggers window.location.reload() after overlay unmount to guarantee fresh state across routes.
I98 [F] contract origination forms include a fixed top-right CloseBtn (×) that navigates to “/” (home) for rapid escape; button obeys I83 bounds.
I99 [F] Every UI that accepts a file (mint, deploy, meta panels, etc.) runs the upload through onChainValidator.js; the result shows ⭐ (fully on‑chain), ⛓️‍💥 (partial, reason shown) or ❔ (undetermined) via integrityBadges.js. Upload flows present a confirmation dialog with the badge before users proceed.
I100 [F] In conjunction with I99, keep certain false-positives such as "URLs that are safe to embed as plain‑text references inside on‑chain SVG/RDF metadata. These are not dereferenced by the renderer and therefore do not break the FOC invariant. Add patterns conservatively." such as "const SAFE_REMOTE_RE = /\bhttps?:\/\/(?:creativecommons.org|schema.org|purl.org|www.w3.org)[^\s"'<>]/i;". C0 only – C1 allowed.
I101 [F] Contract v4 forbids removing the “mature” content‑rating or “flashing” accessibility flags once they are stored on‑chain. Front‑end components must:
• warn at mint (Mint.jsx HelpBox) and at edit (EditTokenMetadata.jsx HelpBox);
• hard‑disable attempts to unset these keys;
• surface a checklist error when a user tries to downgrade either flag.
Back‑end validation refuses any edit_token_metadata map that omits a flag previously present in storage.
I102 [F] Responsive Entry‑Point & Meta‑Panel Blueprint – Every new entry‑point module, admin panel or optioned metadata editor must inherit the layout strategy pioneered in src/ui/Entrypoints/EditTokenMetadata.jsx:
• A GridWrap with grid-template-columns:repeat(12,1fr) and breakpoint collapse to single column at ≤ 1100 px.
• An inner FormGrid using auto‑fit minmax(240px,1fr) (220 px on ultra‑wide ≥ 1800 px).
• GlobalStyle Break700 patch that lifts any hard‑coded 700 px max‑width constraints inside third‑party components.
• All <PixelInput/PixelButton> elements arranged so the form remains fully usable on a 320 px viewport and scales gracefully on ≥ 4 K monitors (columns tighten gap from 1.6 → 1.2 rem at ≥ 1800 px).
• CTA row stacks vertically with .flex-direction:column on mobile and surfaces a <ul> error list whenever validation fails.
• No media query may introduce horizontal scrolling; use intrinsic grid re‑flow only.
• Any future module diverging from these specs must add its own “Break” GlobalStyle helper and document exceptions inline.
Rationale: guarantees identical ergonomics across the admin suite, eliminates copy‑paste drift, and codifies the proven pattern that already passed WCAG AA + LCP audits.
I103 [F] Token‑metadata legacy alias artists is accepted read‑only; UI maps it to authors, never writes this key.
I104 [F,C] Contract‑level metadata must include a symbol key (3‑5 upper‑case A‑Z/0‑9) positioned directly after name. Deploy & edit UIs enforce /^[A-Z0-9]{3,5}$/; loader refuses contracts missing the key; guaranteed on‑chain order: name → symbol → description. (TZIP v4 §2.1 compliance, see meta file).
I105 [F] Explore Grid Uniformity — the collection grid on every /explore/* route must use grid-template-columns:repeat(auto-fill,var(--col)) where --col = clamp(160px,18vw,220px) and width:100%; rows re‑flow without dead‑space from 320 px up to ≥ 8 K viewports, guaranteeing ≥ 1 column on smallest devices and edge‑to‑edge fill on ultra‑wide monitors.
I106 [F] Script‑Hazard Consent — any media or collection thumbnail flagged by utils/hazards.js as scripts:true must remain hidden inside a sandboxed <iframe> (no allow‑scripts) until the user explicitly clicks “Allow scripts — I trust the author”. Consent persists per wallet via useConsent('scripts'); disabling clears the flag in localStorage and re‑hides the media.
I107 [F] Hex‑field UTF‑8 repair — any hex‑encoded string returned from on‑chain metadata must be passed through decodeHexFields.js before it is rendered, searched or cached. Components failing to do so are a CI error.
I108 [F] Token‑ID filter UX — collection detail pages expose a <TokenIdSelect/> dropdown listing live token‑ids; selecting an id filters the grid instantly on the client without refetching. Clearing the filter restores the previous search/sort state.
I109 [F,E] Live on‑chain stats — token & owner counts shown in any UI derive from countTokens.js / countOwners.js and must not rely on static total_supply; until the async fetch resolves, the UI displays an ellipsis “…” placeholder.
I110 [F] Integrity badge standardisation — every component that presents token or collection media must render an <IntegrityBadge status=…/>; the adjacent tooltip / title conveys the long‑form label from constants/integrityBadges.js.
I111 [F,C,E,I] Don't use "global" in any comments or line summaries, it messes with yarn lint and throws false warnings.
I112 [F,E] Marketplace dialogs (buy/list/offer/cancel listing/accept offer) must call feeEstimator.js and display <OperationOverlay/> before dispatching any transaction using ZeroSum helpers.
I113 [F] Unified Consent Management — all consent decisions use useConsent hook with standardized keys: 'nsfw' (for content), 'flash' (for flashing), 'scripts:{contractAddress}' (per‑contract script execution). Consent state syncs across components via CustomEvent broadcasting and always requires explicit user acknowledgment through PixelConfirmDialog with checkbox agreement to terms.
I114 [F] Portal‑Based Draggable Windows — draggable preview windows use createPortal(component, document.body) for z‑index isolation. Draggable state managed through useRef pattern with randomized start positions (60 + Math.random()*30) to prevent stacking. SSR compatibility: typeof document === 'undefined' ? body : createPortal(body, document.body).
I115 [F] Hazard Detection & Content Protection — all media rendering components must call detectHazards(metadata) before display. Hazard types: { nsfw, flashing, scripts }. Script hazards detect HTML MIME types, JavaScript URIs, SVG with <script> tags. Obfuscation overlays block content until explicit user consent with age verification (18+) for NSFW.
I116 [F] Debounced Form State Pattern — form components maintain local state mirroring parent props with upward change propagation via useEffect. Input sanitization applied at component level. Unique id attributes use index pattern: id={\tid-${index}}.
I117 [F] Script Security Model — script execution requires both hazard detection AND user consent. Script consent persists per contract address. EnableScriptsOverlay provides inline consent, EnableScriptsToggle provides permanent toggle. Terms agreement checkbox required for all script consent flows.
I118 [retired] Dual‑Stage Origination — FAST_ORIGIN and dual‑stage origination were used in earlier revisions to reduce payload sizes for Temple wallet users. In r1021, dual‑stage origination and the remote forging backend were removed. All wallets now perform single‑stage origination with the full metadata payload via Taquito.
I119 [F] On‑chain integrity scanning must treat remote domain patterns case‑sensitively: the onChainValidator’s REMOTE_BARE_RE must not match uppercase‑coded identifiers (e.g. Math.PI/…) as remote references. Only safe domains enumerated in SAFE_REMOTE_RE are allowed (see I100).
I120 [F] Development scripts must propagate the selected network into both build‑time and runtime via environment variables (process.env.NETWORK and NEXT_PUBLIC_NETWORK), using the DEV_PORT exported from deployTarget.js; scripts/startDev.js must spawn Next.js via shell mode on the correct port and set these variables before execution.
I121 [F] Explore grids and collection/token pages must derive their TzKT API base URL (TZKT_API) and other network parameters from src/config/deployTarget.js rather than hard‑coding Ghostnet or Mainnet domains (extends I10 and I105).
I122 [F] Token metadata panels must decode contract metadata fully via decodeHexFields/decodeHexJson, fallback through imageUri, logo, artifactUri and thumbnailUri, and display the human‑readable collection name (name → symbol → title → collectionName → short address). Tags must appear with a “Tags:” label and wrap neatly in a single row; meta fields align responsively across breakpoints.
I123 [F] Marketplace actions (BUY/LIST/OFFER/CANCEL LISTING/ACCEPT OFFER) must integrate with the ZeroSum marketplace via src/core/marketplace.js and call the respective entrypoint UI components (BuyDialog, ListTokenDialog, MakeOfferDialog, CancelListing.jsx, AcceptOffer.jsx). MarketplaceBar.jsx must display the lowest active listing price, open the appropriate dialog, and rely on feeEstimator.js and OperationOverlay for transaction feedback. The legacy stub overlay directing users off‑site has been removed.
I124 [E,F] Local development must support concurrent Ghostnet and Mainnet instances by using yarn set:<network> && yarn dev:current; the dev:current script must honour the selected network and port (3000 for ghostnet, 4000 for mainnet) without resetting TARGET (build script remains unchanged). Clearing local storage may be necessary after network switches to prevent stale data.
I125 [F] Listings page – the /explore/listings route must display all tokens with active ZeroSum marketplace listings. It loads contract addresses from hashMatrix.json, fetches live token IDs and lowest listing prices via listLiveTokenIds() and fetchLowestListing(), and renders each token in a responsive grid. Each card must include MarketplaceBar controls. Placeholder messages are not permitted.
I126 [F,C] When originating via the factory, the parameter must
contain only the ordered metadata JSON encoded as bytes; no
storage pairs or extraneous fields are allowed. The order of
keys must follow TZIP‑16 §2.1: name, symbol, description,
version, license, authors, homepage, authoraddress, creators,
type, interfaces, imageUri, views.
I127 [F] Deploy pages must inject the full views array from
contracts/metadata/views/Zero_Contract_v4_views.json into
metadata at origination. Views must not be truncated or
referenced via placeholder; the entire array is stored on chain.
I128 [F] Explore/listings, my/offers and my/tokens pages must
derive TzKT API bases from deployTarget.js and respect
network selection (extends I121). They must not hard‑code
Ghostnet or Mainnet domains.
I129 [F] Marketplace action components (CancelListing.jsx,
AcceptOffer.jsx) must call feeEstimator.js and display
OperationOverlay before dispatching any transaction.
I130 [F,E] MyTokens unified mint & metadata filtering — the
    my/tokens page must fetch tokens minted by the connected wallet
    via both the creator and firstMinter TzKT queries, and it must
    also fetch tokens where the wallet appears in metadata.creators or
    metadata.authors arrays.  Results from these queries are merged
    and deduplicated using a Map keyed by contract:tokenId.  When
    ingesting each token, the UI must decode metadata using
    decodeHexFields and, when the metadata.creators field is a
    JSON‑encoded string, parse it into an array.  Tokens with zero
    totalSupply are skipped up front.  A type‑hash guard must exclude
    contracts whose typeHash is not present in hashMatrix.json.  A
    second‑stage live‑balance filter must include only tokens that
    have at least one non‑burn holder according to
    /v1/tokens/balances?token.contract=…&token.tokenId=…&balance.ne=0.  If
    the balance query fails, the token is included by default.  Heavy
    contract‑wide scans (e.g., scanning all tokens in a contract to
    find metadata matches) are prohibited; responsiveness must be
    maintained.  See src/pages/my/tokens.jsx for reference.  This
    invariant ensures the My Tokens page consistently discovers all
    tokens minted or authored by the wallet across FA2 versions and
    accurately filters out burn‑only tokens.

    I131 [F] Domain resolution environment — .tez domain lookups must be performed only for Tezos tz addresses (tz1, tz2, tz3) and skipped for KT1 contract addresses.  The resolver (src/utils/resolveTezosDomain.js) must import DOMAIN_CONTRACTS and FALLBACK_RPCS constants from src/config/deployTarget.js (Invariant I10) instead of hard‑coding them, use network‑aware GET‑based GraphQL queries to https://api.tezos.domains/graphql, cache results, suppress errors, and avoid 400 responses.  On‑chain fallback remains disabled by default.  This ensures reliable domain resolution across networks without spamming the console.


───────────────────────────────────────────────────────────────
3 · reserved for future research notes
───────────────────────────────────────────────────────────────/

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
zerounbound/AGENTS.md – contributor & Codex guide; Imports:· Exports:·
zerounbound/docs/AI_CUSTOM_INSTRUCTIONS.md – AI custom instructions for collaboration; Imports:· Exports:·
zerounbound/docs/TZIP_Compliance_Invariants_ZeroContract_V4.md – detailed TZIP compliance invariants for ZeroContract v4; Imports:· Exports:·
zerounbound/docs/AI_SYSTEM_INSTRUCTIONS.txt – system-level AI instructions for Zero Unbound; Imports:· Exports:·
zerounbound/next.config.js – Next.js config; Imports: next-mdx,@next/font; Exports: module.exports
zerounbound/jest.config.cjs – Jest config; Imports:· Exports: module.exports
zerounbound/package.json – NPM manifest; Imports:· Exports: scripts,dependencies
zerounbound/tsconfig.json – TS path hints for IDE; Imports:· Exports: compilerOptions
zerounbound/yarn.lock – Yarn lockfile; Imports:· Exports:·

╭── development environment ───────────────────────────────────────────────────────────────╮
zerounbound/.vscode/settings.json – VSCode TypeScript configuration; Imports:· Exports:·
zerounbound/.vscode/tasks.json – VSCode build task configuration; Imports:· Exports:·

╭── tests (new) ───────────────────────────────────────────────────────────╮
zerounbound/tests/dummy.test.js – placeholder Jest test; Imports:· Exports:·

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
zerounbound/src/utils/chooseFastestRpc.js – RPC race chooser; delegates to selectFastestRpc() in deployTarget.js to pick the fastest reachable RPC for the current network; Imports: selectFastestRpc; Exports: chooseFastestRpc

╭── contracts (michelson) ───────────────────────────────────────────────────╮
zerounbound/contracts/Zero_Contract_V3.tz – legacy contract v3 (read‑only); Imports:· Exports:·
zerounbound/contracts/Zero_Contract_V4.tz – legacy ZeroContract v4; Imports:· Exports:·
zerounbound/contracts/Zero_Contract_v4e.tz - cononical ZeroContract v4e with fixed update_operator params, identical fork downloaded from BCD based on KT1QkxXSBTCLhPWWU2uekJsTovLcAzWBUQJP (mainnet) and KT1R1PzLhBXEd98ei72mFuz4FrUYEcuV7t1p (ghostnet) typeHash for both verified: "2058538150":  "v4e"
zerounbound/contracts/ZeroSum.tz – ZeroSum marketplace; Imports:· Exports:·
zerounbound/contracts/ZeroSum - Copy.txt – backup copy of ZeroSum marketplace contract; Imports:· Exports:·
zerounbound/contracts/Zero_Contract_V4_views.json – off‑chain views (legacy); Imports:· Exports:·
zerounbound/contracts/metadata/views/Zero_Contract_v4_views.json – off‑chain views; Imports:· Exports:·
zerounbound/contracts/Zero_Contract_V3 – includes compiled code (views) for v3 (legacy).
zerounbound/contracts/Marketplace/MarketplaceViews/ZeroSum.views.json – compiled off‑chain views for ZeroSum marketplace; Imports:· Exports:·
zerounbound/contracts/Marketplace/KT1R1PzLhBXEd98ei72mFuz4FrUYEcuV7t1p.tz – compiled marketplace contract for ghostnet (and mainnet, they are identical, mainnet: KT19kipdLiWyBZvP7KWCPdRbDXuEiu3gfjBR); Imports:· Exports:·
zerounbound/contracts/Marketplace_Entrypoints-ZeroSum.tz.txt – textual listing of ZeroSum marketplace entrypoints; Imports:· Exports:·
zerounbound/contracts/marketplace_views_entrypoints.txt – aggregated summary of marketplace views and entrypoints; Imports:· Exports:·
zerounbound/contracts/ZeroSum.views.json – off‑chain views JSON for the ZeroSum marketplace (root‑level backup); Imports:· Exports:·
zerounbound/contracts/ContractFactory/KT1H8myPr7EmVPFLmBcnSxgiYigdMKZu3ayw.tz – "ZeroWorks", typeHash "491591007" compiled parametric factory contract with network‑specific deployment addresses; embeds the full v4e code and accepts the full initial storage for ZeroContract v4e, originating a new contract via CREATE_CONTRACT; the ghostnet factory address is KT1VbzbUiswEqCsE9ugTFsG1nwh3XwwEq6D2 and the mainnet factory address is KT1VbzbUiswEqCsE9ugTFsG1nwh3XwwEq6D2; imported by the repository for reference and verification; Imports:· Exports:·

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
zerounbound/src/config/deployTarget.js – network configuration and single
    divergence point; defines TARGET, DEFAULT_NETWORK, NET, NETWORK_KEY, RPC lists,
    TzKT API domains, theme and site values for Ghostnet and Mainnet; exposes
    FACTORY_ADDRESSES and FACTORY_ADDRESS for contract factory selection; provides
    selectFastestRpc() helper for RPC failover; now exports DOMAIN_CONTRACTS and
    FALLBACK_RPCS for Tezos Domains reverse lookups.
zerounbound/src/config/networkConfig.js – RPC endpoints map; Imports:· Exports: NETWORKS

╭── src/constants ───────────────────────────────────────────────────────────╮
zerounbound/src/constants/funLines.js – rotating overlay quotes; Imports:· Exports: FUN_LINES
zerounbound/src/constants/integrityBadges.js – on‑chain badge map; corrected emoji glyphs for the partial badge (⛓️‍💥) and reverted star and question mark to literal emojis for safer display; provides INTEGRITY_* helpers for badges, labels and blurbs; Imports:· Exports: INTEGRITY_* helpers
zerounbound/src/constants/mimeTypes.js – recognised MIME map; includes audio/mp3 alias and preferredExt helper for .mp3 extension; Imports:· Exports: MIME_TYPES,preferredExt
zerounbound/src/constants/views.hex.js – hex‑encoded contract views; Imports:· Exports: default viewsHex

╭── src/contexts ────────────────────────────────────────────────────────────╮
zerounbound/src/contexts/ThemeContext.js – dark/light palette ctx; Imports: react,styled-components; Exports: ThemeProvider,useTheme
zerounbound/src/contexts/WalletContext.js – Beacon wallet context; manages TezosToolkit and BeaconWallet instances, performs silent session restore, disables P2P transports via matrixNodes:[], syncs balances and reveal status, exposes refresh helper and connect/disconnect/reveal helpers; imports: React,@taquito/beacon-wallet,TezosToolkit,DEFAULT_NETWORK from deployTarget.js and chooseFastestRpc.js; Exports: WalletProvider,useWallet

╭── src/core ────────────────────────────────────────────────────────────────╮
zerounbound/src/core/batch.js – batch ops (v1‑v4); Imports: @taquito/utils,net.js; Exports: forgeBatch,sendBatch,buildAppendTokenMetaCalls,sliceHex,splitPacked
zerounbound/src/core/batchV4a.js – v4a‑specific batch ops; Imports: @taquito/taquito; Exports: SLICE_SAFE_BYTES,sliceHex,buildAppendTokenMetaCalls
zerounbound/src/core/feeEstimator.js – chunk‑safe fee/burn estimator; Imports: @taquito/taquito; Exports: estimateChunked,calcStorageMutez,toTez
zerounbound/src/core/marketplace.js – ZeroSum helpers; Imports: net.js,@taquito/taquito; Exports: getMarketContract,fetchListings,fetchLowestListing,buildBuyParams,buildListParams,buildOfferParams
zerounbound/src/core/net.js – network helpers (jFetch, forgeOrigination, injectSigned). This module now always uses local forging and injection via Taquito's LocalForger/TezosToolkit; remote forging support has been removed. Imports: Parser,@taquito/michelson-encoder,deployTarget; Exports: jFetch,forgeOrigination,injectSigned
zerounbound/src/core/validator.js – JSON‑schema and form validators; defines constants for byte budgets, attribute and tag limits (tag cap raised to 30), royalty caps and edition counts; exposes helper functions such as asciiPrintable(), asciiPrintableLn(), isTezosAddress(), validJSONHex(), validAttributes(), fitsByteBudget(), urlOkay() and others; includes comprehensive validateMintFields() and validateDeployFields() functions used by mint/deploy UIs; Imports: Buffer; Exports: validateContract,validateToken,validateMintFields,validateDeployFields

╭── src/data ────────────────────────────────────────────────────────────────╮
zerounbound/src/data/entrypointRegistry.json – EP button matrix (I75); Imports:· Exports:·
zerounbound/src/data/hashMatrix.json – SHA‑1 → version map (I12); Imports:· Exports:·

╭── src/hooks ────────────────────────────────────────────────────────────────╮
zerounbound/src/hooks/useConsent.js – persistent consent flags; Imports: react; Exports: useConsent
zerounbound/src/hooks/useHeaderHeight.js – sets --hdr var; Imports: react; Exports: useHeaderHeight
zerounbound/src/hooks/useViewportUnit.js – sets --vh var; Imports: react; Exports: useViewportUnit
zerounbound/src/hooks/useTxEstimate.js – chunk‑safe gas/fee estimator with dynamic chunking and RPC fallback; Imports: @taquito/taquito; Exports: useTxEstimate

╭── src/pages (Next.js) ─────────────────────────────────────────────────────╮
zerounbound/src/pages/contracts/[addr].jsx – collection detail page; Imports: ContractMetaPanelContracts,TokenCard,hazards.js; Exports: ContractPage
zerounbound/src/pages/explore/[[...filter]].jsx – dynamic explore grid; Imports: CollectionCard,useConsent; Exports: Explore
zerounbound/src/pages/explore/listings/index.jsx – marketplace listings page; Imports: React,hashMatrix.json,listLiveTokenIds.js,fetchLowestListing,TokenCard,MarketplaceBar,ExploreNav,LoadingSpinner; Exports: ListingsPage
zerounbound/src/pages/my/collections.jsx – lists collections created, managed or owned by the connected wallet; Imports: TzKT API,useWalletContext,ExploreNav,PixelHeading,PixelButton,CollectionCard; Exports: MyCollections
zerounbound/src/pages/my/offers.jsx – lists marketplace offers to accept and offers made by the connected wallet; Imports: React,styled-components,useWalletContext,TZKT_API,NETWORK_KEY,ExploreNav,PixelHeading,PixelButton,OperationOverlay,getMarketContract,Tzip16Module,decodeHexFields; Exports: MyOffers
zerounbound/src/pages/my/tokens.jsx – lists tokens minted or purchased by the connected wallet; fetches tokens minted via both creator and firstMinter parameters, merges and deduplicates results, also fetches tokens referencing the wallet in metadata.creators and metadata.authors arrays, decodes metadata including hex fields, parses JSON‑encoded creators arrays, filters out zero‑supply tokens and those lacking live holders beyond the burn address, and renders them in a responsive grid; Imports: React,styled-components,useWalletContext,TZKT_API,ExploreNav,PixelHeading,PixelButton,TokenCard; Exports: MyTokens
zerounbound/src/ui/MarketplaceBar.jsx – token action bar for marketplace actions; Imports: React,PixelButton,BuyDialog,ListTokenDialog,MakeOfferDialog; Exports: MarketplaceBar
zerounbound/src/core/marketplace.js – ZeroSum contract helpers; Imports: net.js,@taquito/taquito; Exports: getMarketContract,fetchListings,fetchLowestListing,buildBuyParams,buildListParams,buildOfferParams
zerounbound/src/pages/_app.js – root providers; Imports: ThemeContext,WalletContext,GlobalStyles; Exports: MyApp
zerounbound/src/pages/_document.js – custom document (I20); Imports: next/document; Exports: default class
zerounbound/src/pages/deploy.js – orchestrates collection deployment; builds the full metadata and storage via DeployCollectionForm; chooses between calling the network‑specific contract factory (when FACTORY_ADDRESS is defined) and the original wallet.originate() flow to originate a new v4 contract; displays progress and errors via OperationOverlay; Imports: DeployCollectionForm,OperationOverlay,styled-components,MichelsonMap,char2Bytes,contractCode,FACTORY_ADDRESS,views.json,net.js; Exports: default (DeployPage)
zerounbound/src/pages/index.js – landing page; Imports: Layout,CRTFrame; Exports: Home
zerounbound/src/pages/manage.js – manage page; Imports: Layout,AdminTools; Exports: ManagePage
zerounbound/src/pages/terms.js – ToS page; Imports: Layout; Exports: TermsPage

╭── src/styles ──────────────────────────────────────────────────────────────╮
zerounbound/src/styles/globalStyles.js – root CSS + scrollbar; Imports: styled-components,palettes.json; Exports: GlobalStyles
zerounbound/src/styles/palettes.json – theme palettes; Imports:· Exports:·

╭── src/ui (shell) ──────────────────────────────────────────────────────────╮
zerounbound/src/ui/CollectionCard.jsx – responsive 8‑bit contract card; Imports: React,hazards,useConsent,RenderMedia; Exports: CollectionCard
zerounbound/src/ui/CRTFrame.jsx – CRT screen border; Imports: react; Exports: CRTFrame
zerounbound/src/ui/ExploreNav.jsx – sticky explore nav bar with search and hazard toggles; includes hideSearch prop to omit the search bar; shows NSFW and flashing consent prompts; Imports: PixelButton,PixelInput,PixelConfirmDialog,useConsent,useRouter; Exports: ExploreNav
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
zerounbound/src/ui/MakeOfferBtn.jsx – XS size, make-offer button from marketplace contract ZeroSum.tz; Imports: PropTypes,PixelButton; Exports: MakeOfferBtn
zerounbound/src/ui/MAINTokenMetaPanel.jsx – responsive token metadata panel with hazard detection, consent handling, token‑level script toggle and fullscreen controls; decodes collection metadata and tags; resolves .tez domains via resolveTezosDomain() for authors, creators and collection addresses, abbreviating raw addresses when no domain exists; wraps tags and aligns meta fields; re‑renders preview on script permission changes; Imports: React,PropTypes,date-fns,styled-components,PixelHeading,PixelButton,RenderMedia,IntegrityBadge,MarketplaceBar,detectHazards,useConsent,shortKt,copyToClipboard,EnableScriptsToggle,PixelConfirmDialog,countAmount,hashMatrix,decodeHexFields,resolveTezosDomain,deployTarget; Exports: MAINTokenMetaPanel

╭── src/ui/operation & misc ─────────────────────────────────────────────────╮
zerounbound/src/ui/AdminTools.jsx – dynamic entry‑point modal; Imports: react,WalletContext; Exports: AdminTools
zerounbound/src/ui/OperationConfirmDialog.jsx – tx summary dialog; Imports: react,PixelConfirmDialog; Exports: OperationConfirmDialog
zerounbound/src/ui/OperationOverlay.jsx – progress overlay with status updates and optional token link; supports tokenUrl prop for “View Token” button; Imports: react,useWheelTunnel,LoadingSpinner,CanvasFireworks,PixelButton; Exports: OperationOverlay
zerounbound/src/ui/ContractCarousels.jsx – live contract cards; Imports: react,jFetch,countTokens; Exports: ContractCarousels
zerounbound/src/ui/ContractMetaPanel.jsx – contract stats card; Imports: react,styled-components; Exports: ContractMetaPanel
zerounbound/src/ui/ContractMetaPanelContracts.jsx – banner panel on /contracts; Imports: React,RenderMedia; Exports: ContractMetaPanelContracts
zerounbound/src/ui/DeployCollectionForm.jsx – collection deploy UI; Imports: react,validator,OperationOverlay; Exports: DeployCollectionForm
zerounbound/src/ui/BuyDialog.jsx – buy confirmation dialog; Imports: React,OperationConfirmDialog,feeEstimator.js; Exports: BuyDialog
zerounbound/src/ui/ListTokenDialog.jsx – listing dialog; Imports: React,OperationOverlay,PixelInput; Exports: ListTokenDialog
zerounbound/src/ui/MarketplaceBar.jsx – token action bar; Imports: React,PixelButton,BuyDialog,ListTokenDialog,MakeOfferDialog; Exports: MarketplaceBar; shows lowest listing price and opens buy/list/offer dialogs via ZeroSum
zerounbound/src/ui/GlobalSnackbar.jsx – global toast host; Imports: React; Exports: GlobalSnackbar
zerounbound/src/ui/MakeOfferDialog.jsx – add amount and make your bid; Imports: React,styledPkg,PixelInput,PixelButton,useWalletContext; Exports: MakeOfferDialog
zerounbound/src/ui/TokenCard.jsx – token preview card; Imports: React,hazards,useConsent; Exports: TokenCard
zerounbound/src/ui/TokenIdSelect.jsx – live id dropdown; Imports: styled-components; Exports: TokenIdSelect
zerounbound/src/ui/TokenMetaPanel.jsx – detailed token panel; Imports: React,RenderMedia; Exports: TokenMetaPanel
zerounbound/src/ui/canvasFireworks.jsx – confetti canvas; Imports: react; Exports: FireworksCanvas
zerounbound/src/ui/EnableScripts.jsx – common enable scripts prompt components; Imports: React,PropTypes,PixelButton; Exports: EnableScriptsOverlay,EnableScriptsToggle
zerounbound/src/ui/FullscreenModal.jsx – reusable fullscreen viewer + pixel-upscale control; Imports: React,PropTypes,styledPkg,RenderMedia,PixelButton,pixelUpscaleStyle; Exports: FullscreenModal

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
zerounbound/src/ui/Entrypoints/Mint.jsx – main mint flow (mint NFTs); collects token metadata and optional authors with hints; constructs tokenUrl for OperationOverlay and passes it; imports: batch,useTxEstimate,sliceCache; Exports: Mint
zerounbound/src/ui/Entrypoints/MintV4a.jsx – v4a mint UI; Imports: batchV4a.js,sliceCacheV4a.js,feeEstimator.js,sleepV4a.js; Exports: MintV4a
zerounbound/src/ui/Entrypoints/MintPreview.jsx – pre‑mint gallery; Imports: react,RenderMedia; Exports: MintPreview
zerounbound/src/ui/Entrypoints/MintUpload.jsx – drag/upload step; Imports: react,PixelButton,mimeTypes.js,PixelConfirmDialog.jsx,onChainValidator.js; Exports: MintUpload
zerounbound/src/ui/Entrypoints/CancelListing.jsx – cancel marketplace listing entrypoint; Imports: react,OperationOverlay,feeEstimator.js; Exports: CancelListing
zerounbound/src/ui/Entrypoints/AcceptOffer.jsx – accept marketplace offer entrypoint; Imports: react,OperationOverlay,feeEstimator.js; Exports: AcceptOffer
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

╭── src/utils ────────────────────────────────────────────────────────────────╮
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
zerounbound/src/utils/resolveTezosDomain.js – reverse resolver with
    network‑aware GraphQL and on‑chain fallback; imports DOMAIN_CONTRACTS,
    FALLBACK_RPCS and RPC_URLS from deployTarget.js, skips KT1 addresses, uses
    GET-based GraphQL queries, caches results and suppresses errors; Exports:
    resolveTezosDomain
zerounbound/src/pages/tokens/[addr]/[tokenId].jsx – responsive token-detail page that fetches collection and token metadata, displays media preview with hazard overlays, and moves script enable/disable and fullscreen controls into the metadata panel; integrates ExploreNav without search for global hazard toggles; re‑renders preview on script permission changes; clamps sidebar width and media height; Imports: React,useRouter,styled-components,ExploreNav,PixelButton,RenderMedia,FullscreenModal,MAINTokenMetaPanel,detectHazards,useConsent,useWalletContext,jFetch,TZKT_API,decodeHexFields,decodeHexJson; Exports: TokenDetailPage

╭── src/workers ─────────────────────────────────────────────────────────────╮
zerounbound/src/workers/originate.worker.js – web‑worker contract origination; Imports: @taquito/taquito,net.js; Exports: onmessage

╭── summarized_files (bundle drops) ────────────────────────────────────────╮
zerounbound/summarized_files/contracts_bundle.txt – Michelson sources + views; Imports:· Exports:·
zerounbound/summarized_files/assets_bundle.txt – fonts, sprites, sw.js; Imports:· Exports:·
zerounbound/summarized_files/engine_bundle.txt – Node/core dump; Imports:· Exports:·
zerounbound/summarized_files/frontend_bundle.txt – UI dump; Imports:· Exports:·
zerounbound/summarized_files/infra_bundle.txt – infra dump; Imports:· Exports:·
zerounbound/summarized_files/master_bundle.txt – contains everything in all the above bundles.
zerounbound/summarized_files/render_media_bundle.txt – additional UI and media components including updated integrity badges, MIME types, validators, pixel upscaling and token panels; Imports:· Exports:·
zerounbound/summarized_files/explore_bundle.txt – additional explore pages and config modules including Tezos domain resolver and network-aware utilities; Imports:· Exports:·

───────────────────────────────────────────────────────────────
5 · BUNDLE INDEX (How to read) — each text-dump lives in summarized_files/
───────────────────────────────────────────────────────────────
contracts_bundle.txt → Michelson sources + views
assets_bundle.txt  → fonts, sprites, sw.js
engine_bundle.txt  → scripts/, core/, data/, config/, constants/, utils/
frontend_bundle.txt → contexts/, hooks/, ui/, pages/, styles/
infra_bundle.txt   → root configs, next.config.js, package.json, CI helpers
master_bundle.txt → contains everything in all the above bundles.

───────────────────────────────────────────────────────────────
6 · QUICK‑START & CI PIPELINE — updated commands
───────────────────────────────────────────────────────────────
corepack enable && corepack prepare yarn@4.9.1 --activate
yarn install

### OpenAI Codex setup script
Codex pulls scripts/codex-setup.sh automatically:

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

Ghostnet (default) on port 3000
yarn set:ghostnet
yarn dev:current

Mainnet on port 4000
yarn set:mainnet
yarn dev:current
The canonical yarn dev script always resets TARGET to ghostnet
before building. Use dev:current when you want to run the server
without switching targets. Clearing local storage may be necessary
between switches to avoid stale data.

───────────────────────────────────────────────────────────────
7 · APPENDICES (How to read) — machine‑readables live in code
───────────────────────────────────────────────────────────────
A. hashMatrix.json, contains all the typeHashes' generated by tzkt used in
filtering and labeling contract versions and more (unchanged).
v1: original zerocontract
v2 series: lots of homebrews from the community, v2b is the original without lock adding parent/child
v3 is the 1st collaborator contract
v4 is the now legacy append contract
v4a is zeroterminal's main contract
v4b is sifrzero
v4c is ZT default
v4d is new updated ZT contract with add collaborators
v4e is the latest grail.

B. entrypointRegistry.json, contains all Entrypoints used across our
supported v1-v4d contracts (unchanged).

───────────────────────────────────────────────────────────────
CHANGELOG
───────────────────────────────────────────────────────────────
…
    r1161 – 2025‑08‑01 UTC – added DOMAIN_CONTRACTS and FALLBACK_RPCS exports in deployTarget.js; updated resolveTezosDomain.js to import these constants, skip KT1 contract addresses and avoid 400 errors; added Invariant I131 to formalize domain resolution rules; updated source‑tree map entries.
    r1160 – 2025‑08‑01 UTC – unified mint and metadata filtering for My Tokens page, parsing JSON‑encoded creators and live‑balance filtering; added Invariant I130 to codify these requirements; updated src/pages/my/tokens.jsx description in the source‑tree map. This revision ensures all tokens minted or
    authored by the connected wallet are discovered across FA2 versions while
    excluding burn‑only tokens and removing heavy contract‑wide scans.
    r1159 – 2025‑07‑31 UTC – incorporate the latest contract deployments and UI
…
