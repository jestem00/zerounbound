/*─────────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    docs/Master_Overview_And_Manifest_zerounbound_contractmanagement.md
  Rev :    r1187    2025‑09‑03 UTC
  Summary: canonical slicer, IDB‑only slice cache, data‑URI tests, RPC‑backed
           extrauri view, consolidated Share appendix, and live‑supply semantics
           across collections/tokens (non‑empty = any token with totalSupply>0).
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

The project uses a unified single‑stage origination pipeline
even when a factory contract is configured. When a factory
address exists for the target network, the UI assembles the full
metadata JSON (keys ordered per TZIP‑16) and encodes it as a
bytes parameter. This bytes payload contains only the metadata
and off‑chain views; storage pairs are not included. The
factory constructs the storage internally and originates a new **v4e**
contract via CREATE_CONTRACT. On networks without a factory,
the UI falls back to toolkit.wallet.originate() with the full
metadata big‑map. Marketplace integration includes listings,
offers and tokens pages under /explore and /my.

**New in this revision** — Canonical slicing & IDB checkpoints:
• Introduced `src/core/slicing.js` used by Mint/Append/Repair and the fee
  estimator, ensuring deterministic head/tail splits and matching signature
  counts.
• Slice checkpoints now persist in IndexedDB only with automatic migration;
  legacy localStorage paths were removed.
• Added Jest coverage for resume logic and SVG data‑URI validation.

See the TZIP invariants companion for standard compliance rules.

════════════════════════════════════════════════════════════════
TABLE OF CONTENTS
════════════════════════════════════════════════════════════════
0 · Global Rules & Meta Docs  
1 · High‑Level Architecture  
1·5 Critical‑Entry Index  
2 · Invariants (I00 – I156)  
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
  `docs/TZIP_Compliance_Invariants_ZeroContract_V4.md` and extend
  this manifest’s rules.

───────────────────────────────────────────────────────────────
1 · HIGH‑LEVEL ARCHITECTURE & DATA‑FLOW
───────────────────────────────────────────────────────────────
Browser (React 18 + styled‑components 6) → ZeroFrontend SPA
(Next.js 15.x) → ZeroEngine API (Node 22 + Taquito) → ZeroContracts
**v4e** + ZeroSum Marketplace (Tezos L1). 100 % on‑chain media via
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

Marketplace Integration — The explore section includes
/explore/listings (grid of tokens with active marketplace listings)
and the my section includes /my/offers and /my/tokens
(offers made/received and owned/minted tokens). Listing and
offer actions use `src/core/marketplace.js` helpers and dialogs
(ListTokenDialog, BuyDialog, MakeOfferDialog, AcceptOffer,
CancelListing, CancelOffer) with progress handled by
OperationOverlay.

Discovery, Caching & Parity — A unified discovery utility collects
candidate contract addresses from TzKT by initiator, creator, manager,
minted‑by and owned‑by. Results are validated against an allow‑list of
ZeroContract type hashes and then enriched with lightweight contract rows.
All heavy reads are cached in IndexedDB with short TTLs. The Manage‑page
carousels and /my/collections now consume the same data‑plane and are
expected to show the same set of contracts for a wallet (ordering can
differ by page purpose).

───────────────────────────────────────────────────────────────
1·5 · CRITICAL‑ENTRY INDEX 🗝️
───────────────────────────────────────────────────────────────
• `src/pages/deploy.js` — single‑stage origination; factory bytes param;
  ordered metadata; factory fallback to originate on UI when needed.
• `src/pages/explore/[[...filter]].jsx` — dynamic explore grid; admin/contract
  filters; shared discovery + idbCache for consistency.
• `src/pages/explore/listings/index.jsx` — lists tokens with active
  ZeroSum marketplace listings; responsive grid; uses
  TokenListingCard and marketplace helpers; **tzktBase already `/v1`**; do not
  append again.
• **`src/pages/explore/tokens.jsx` — ZeroContract tokens grid** with:
  **scan‑ahead min‑yield pagination** (avoids dead clicks), **accurate totals**
  via fallback + end‑of‑paging reconciliation, **admin filter** parity,
  **preview & non‑zero‑supply guard**, and **`/v1` base normalization**.
• `src/pages/explore/secondary.jsx` — alternate explore route auxiliary
  page (network‑aware).
• `src/pages/my/collections.jsx` — **parity with ContractCarousels**; uses
  shared discovery + idbCache; includes v1→v4e; tolerates empty collections.
• `src/pages/my/offers.jsx` — lists marketplace offers (accept/made),
  uses TZIP‑16 views and marketplace helpers.
• `src/pages/my/tokens.jsx` — unified minted/owned discovery and
  filtering (live balances, valid typeHash); decodes hex metadata;
  skips burn‑only tokens.
• `src/ui/ContractCarousels.jsx` — creator/admin carousels on Manage page;
  backed by shared discovery + idbCache; click‑to‑load contract.
• `src/ui/TokenListingCard.jsx` — listing card used on /explore/listings
  grid (imports MarketplaceBuyBar/MarketplaceBar).
• `src/ui/MarketplaceBuyBar.jsx` — compact buy‑action bar variant for
  listings cards.
• `src/ui/BuyDialog.jsx` — buy modal with TzKT preflight and tagged stale
  listings errors.
• `src/core/marketplace.js` — **ZeroSum helpers + stale‑listing guard**:
  `getMarketContract`, `fetchLowestListing`, on‑chain/off‑chain view readers,
  **`getFa2BalanceViaTzkt()`**, **`preflightBuy()`** (seller FA2 balance via
  TzKT `/v1/tokens/balances`), and param‑builders for `buy/list/offer/cancel/
  accept` with method‑name/positional fallbacks.

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
I03 [F,C] Role‑based ACL (admin/owner/collaborator).
I04 [C] Contract terms immutable once locked.
I05 [E] All mutating ops emit audit row + chain event.
I06 [F] Mobile‑first UI; no sideways scroll ≤ 320 px.
I07 [F] LCP ≤ 2 s (P95 mid‑range Android).
I08 [F] WCAG 2.2 AA; theme & consent persist **per wallet via IndexedDB**.
I09 [F] PWA offline shell (Workbox 7, ≤ 5 MiB cache).
I10 [E] deployTarget.js is single network divergence point.
I11 [I] Case‑sensitive path guard in CI.
I12 [C] hashMatrix.json = SHA‑1 → version (append‑only).
I13 [C] entrypointRegistry.json append‑only.
I14 [I] bundle.config.json globs mirror Manifest §5.
I15 [E] Engine pods stateless.
I16 [E] Jest coverage ≥ 90 %.
I17 [E] (retired) legacy 3 M‑block back‑scan.
I18 [E] RPC fail‑over after 5 errors.
I19 [F] SSR‑safe: hooks never touch window during render.
I20 [F] Exactly one document.js.
I21 [I] Corepack pins Yarn 4.9.1.
I22 [F] ESLint bans em‑dash.
I23 [F] Styled‑components factory import invariant.
I24 [F] Media =data URIs; no IPFS.
I25 [F] SVG canvas square & centred.
I26 [F] JS chunk ≤ 32 768 B; total ≤ 2 MiB.
I27 [I] Monotonic Rev id ledger.
I28 [I] No path‑case duplicates.
I29 [I] CI tests Node 20 LTS + 22.
I30 [F] useWallet alias until v5.
I31 [E] Off‑chain templates carry MD‑5 checksum.
I32 [I] No .env secrets in code.
I33 [C] Registries immutable (append‑only).
I34 [F] All colours via CSS vars.
I35 [F] Transient SC props filtered.
I36 [F] ESLint no‑multi‑spaces passes.
I37 [C] TZIP‑04/12/16 compliance (see meta file).
I38 [C] Metadata stored in tezos‑storage:content.
I39 [C] Interfaces array deduped pre‑storage.
I40 [E,F] Single jFetch Source — all HTTP via core/net.js.
I41 [F] Central RenderMedia Pipeline enforced.
I42 [F] Per‑EP Overlay UX — one modal per AdminTools action.
I43 [E] jFetch global concurrency LIMIT = 4 & exponential 429 back‑off.
I44 [F] Header publishes real height via CSS var --hdr; Layout obeys.
I45 [F] Single global scroll‑region; inner comps never spawn scrollbars.
I46 [F] All DOM‑mutating effects use useIsoLayoutEffect when SSR possible.
I47 [F] ZerosBackground obeys perf guard (≤ 4 % CPU @ 60 fps).
I48 [F] Animated backgrounds idle ≤ 4 % CPU on low‑end mobiles.
I49 [F,C] Token metadata arrays/objects JSON‑encode exactly once then hex‑wrap.
I50 [F] Royalty UI % cap ≤ 25 %; stored as basis‑points.
I51 [F,C] authoraddress key omitted when blank.
I52 [F] Tezos address validators accept tz1|tz2|tz3|KT1.
I53 [F,C] (dup of I49) JSON‑encode once → hex‑wrap.
I54 [F] Dynamic token‑id fetch — Mint.jsx must query next_token_id.
I55 [F] Operation size guard — sliceHex uses 1 024 B head‑room.
I56 [F] Oversize mint triggers upfront Snackbar warning.
I57 [F] WalletContext delayed BeaconWallet instantiation.
I58 [F] Reveal action uses explicit 1 mutez transfer.
I59 [F] Silent session restore on mount.
I60 [F,E] Resumable Slice Uploads — Mint, Append & Repair.
I61 [F] Slice‑Cache Hygiene & Expiry (purge rules).
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
I74 [F,E] Chunk‑Safe Estimator batches ≤ 8 ops.
I75 [F] v4a Entrypoint Guards.
I76 [F] Inline Busy Overrides.
I77 [F] Relationship‑Aware Disable for destructive EPs.
I78 [F] SVG Pixel‑Integrity via sandbox.
I79 [F] Header copy‑clipboard reachable ≤ 320 px & ≥ 8 K.
I80 [F] Carousel arrows live inside container.
I81 [F] Mint tag‑input auto‑chips.
I82 [F] Form values persist across navigation.
I83 [F] Modal CloseBtn anchor stays inside modal bounds.
I84 [F] Unicode & Emoji acceptance — full UTF‑8 except C0/C1.
I85 [F] Single feeEstimator.js source of truth — duplicates banned.
I86 [F] HelpBox Standard — standardized HelpBox across entry‑points.
I87 [F] Live JSON Validation — disable CTA until valid JSON.
I88 [I] ESLint no‑local‑estimator Rule.
I89 [F,E] v4a slice batch storageLimit computed per payload.
I90 [F] All wait/sleep via sleepV4a.js.
I91 [F,E] Shared ledger wait logic in v4a flows.
I92 [F] MintV4a.jsx invokes shared ledger‑wait only after first slice.
I93 [F] OperationOverlay fun‑lines scroll spec.
I94 [F] AdminTools header count rules.
I95 [F] v4a collections warn banner.
I96 [F] OperationOverlay fun‑lines color via var(--zu‑accent).
I97 [F] OperationOverlay Close triggers window.location.reload().
I98 [F] Origination CloseBtn top‑right escape obeys I83.
I99 [F] Every upload runs through onChainValidator.js.
I100 [F] SAFE_REMOTE_RE allow‑list — C0 only / C1 allowed.
I101 [F] Mature/flashing flags irreversible once set.
I102 [F] Responsive Entry‑Point & Meta‑Panel Blueprint (grid spec).
I103 [F] Read‑only legacy alias artists → authors.
I104 [F,C] Contract metadata must include symbol key (3‑5 A‑Z/0‑9).
I105 [F] Explore grid uniformity (auto‑fill col clamp).
I106 [F] Script‑Hazard Consent sandboxing model.
I107 [F] Hex‑field UTF‑8 repair via decodeHexFields.js.
I108 [F] Token‑ID filter UX on contract pages.
I109 [F,E] Live on‑chain stats from countTokens/countOwners.
I110 [F] Integrity badge standardisation.
I111 [F,C,E,I] Avoid word “global” in comments/summaries.
I112 [F,E] Marketplace dialogs must use feeEstimator.js + OperationOverlay.
I113 [F] Unified Consent Management via useConsent hook.
I114 [F] Portal‑based draggable preview windows (SSR‑safe).
I115 [F] Hazard detection & content protection (nsfw/flashing/scripts).
I116 [F] Debounced Form State Pattern; id/index pattern.
I117 [F] Script Security Model — consent & address‑scoped toggles.
I118 [retired] Dual‑Stage Origination (removed).
I119 [F] Remote domain patterns case‑sensitive; allow‑list only (I100).
I120 [F] Dev scripts propagate selected network into runtime/build.
I121 [F] **TzKT API bases must include /v1**; derived or normalized in code.
I122 [F] Token meta panels decode collection metadata fully.
I123 [F,E] Marketplace actions wired to ZeroSum helpers & dialogs.
I124 [E,F] Concurrent Ghostnet/Mainnet via yarn set:<network> && dev:current.
I125 [F] /explore/listings shows live ZeroSum listings with helper fns.
I126 [F,C] Factory parameter contains only ordered metadata bytes.
I127 [F] Deploy pages must inject full views array on origination.
I128 [F] Listings/my pages derive TzKT bases via deployTarget.js.
I129 [F,E] MyTokens minted/metadata discovery & live‑balance filter.
I130 [F] MyTokens guard — typeHash set and burn‑only exclusion.
I131 [F] Domain resolution env — skip KT1; import DOMAIN_CONTRACTS/FALLBACK_RPCS.
I132 [I] Target default/mainnet — TARGET='mainnet' is the default.
I133 [C,F,E] Canonical contract version — v4e; full back‑compat via hashMatrix.
I134 [F,E] Listings aggregation uses marketplaceListings.js.
I135 [F] **IndexedDB cache is the only persistence layer** for discovery/carousels; localStorage forbidden for these flows.
I136 [F,E] **Unified contract discovery** lives in src/utils/contractDiscovery.js; Manage carousels and /my/collections must call it.
I137 [F,C] **Allowed type‑hash set** exported via src/utils/allowedHashes.js; derived from src/data/hashMatrix.json; append‑only.
I138 [F] **Parity** — ContractCarousels and /my/collections must show the same contract set for a wallet; empty collections are allowed.
I139 [F] **/v1 guard** — TzKT base must be normalised to end with “/v1”.
I140 [F] **ExploreNav is mandatory** on explore/* and my/* pages unless explicitly hidden via prop for modals.
I141 [F] **CollectionCard prop‑shape** accepts string KT1 or object {address,…}; component must resolve gracefully without extra calls.
I142 [F] **Batch resilience** — discovery validation proceeds per‑batch; failed groups are logged and skipped, not fatal.
I143 [F,E] **jFetch budget** — ≤ 6 concurrent total; internal limiter default = 4 for browser tabs.
I144 [F] **Network awareness** — derive network from toolkit._network or TARGET; never hard‑code.
I145 [F] **No stray sentinels** — “EOF” or similar markers are banned inside JS/JSX.
I146 [F] **Admin‑only visibility** — /my/collections may show empty or WIP contracts since the page is wallet‑scoped.
I147 [F] **Sort order** — default sort by lastActivityTime desc; stable tiebreaker = address asc.
I148 [E,F] **Stale‑listing guard** — verify seller’s FA2 balance via TzKT `/v1/tokens/balances`; suppress listing and throw `STALE_LISTING_NO_BALANCE` when insufficient.
I149 [E] **TzKT query shape** — use `account`, not `account.address`, in `/tokens/balances`; `select` = `balance`.
I150 [F] **Listings grid hygiene** — require valid preview & non‑zero `totalSupply`; dedupe by `contract|tokenId`.
I151 [F] **Transient props** — Non‑standard DOM props must use transient form (`$prop`) or be filtered before reaching the DOM.
I152 [F,E] **tzktBase `/v1` guard** — `tzktBase(net)` returns a base already including `/v1`; callers must not append it again.
I153 [F] **ExploreNav mandatory** — reaffirmed for all `explore/*` and `my/*` routes unless intentionally hidden for modals.
I154 [F,E] **Tagged errors** — marketplace helpers surface actionable tags (`MISSING_LISTING_DETAILS`, `STALE_LISTING_NO_BALANCE`).
I155 [I] **No sentinels in JS/JSX** — comment footers end with `*/` only.
I156 [E] **Preflight budget & TTL** — balance checks observe jFetch limits; cache per `(seller,KT1,tokenId)` for ≤60 s (network‑scoped).
I157 [C,E,F] **EP_MINT_SIGNATURES** — v1,v2b → mint(map,address); v2a,v3–v4e → mint(nat,map,address); v4a → mint(address,nat,map). Unit test asserts UI builds these shapes.
I158 [F,E] Canonical slicer shared by estimator and batch; signature counts must align.
I159 [F] Slice checkpoints persist in IndexedDB only; migrate legacy localStorage then purge.
I160 [F,E] Append/Repair recompute on-chain prefix after each confirmation; duplicate bytes dropped; mismatch aborts.
I161 [F] OperationOverlay surfaces “Resume” when wallet prompts stall.
I162 [F] Data URIs validated via `isValidDataUri`/`isLikelySvg` before slicing.

Invariants Addendum (Consolidated Share System) — I200–I213
- I200: `zu:openShare` event contract is stable. Unknown fields ignored; missing optional fields trigger best‑effort fetches.
- I201: ShareDialog never executes scripts; previews are images only. HTML/SVG with script capabilities are not mounted inside the dialog.
- I202: `@` is prefixed only for real X handles. Addresses (full or abbreviated) never receive `@`.
- I203: Handle resolution uses the first tz in `creators` for `/api/handle/[address]`. Failure does not block dialog open.
- I204: Fallback titles — token from token metadata; collection from big‑map `content` or contract `metadata|alias`.
- I205: URL normalization — relative → absolute using `window.location.origin`; token URLs prefer `SITE_URL`.
- I206: IPFS normalization — any `ipfs://` preview URI is converted to `https://ipfs.io/ipfs/`.
- I207: Listing card SHARE resides below BUY in `ActionsRow` and MUST not affect price alignment.
- I208: Collection card SHARE MUST include `scope:'collection'` and SHOULD pass `name` and `creators` when known.
- I209: API `/api/handle/[address]` returns `{ handle, alias }`; clients use `handle` for `@`, otherwise full tz.
- I210: Variant 'purchase' changes only the verb; alias and preview rules unchanged.
- I211: ShareDialog download links sanitize filenames; extension derives from MIME (if given).
- I212: No shortening of addresses in share messages; full tz addresses appear verbatim.
- I213: All network‑aware share behavior depends on `deployTarget.js` (`SITE_URL`, `TZKT_API`, `NETWORK_KEY`).

Invariants Addendum (Live‑Supply & Non‑Empty Semantics) — I214–I221
- I214: Non‑empty collection = existence of any token row with `totalSupply>0` (verified via `/v1/tokens`). Do not rely solely on `/tokens/count`.
- I215: `countTokens(KT1, net)` validates server counts by reading `/tokens` rows; it returns 0 if no row has `totalSupply>0`.
- I216: Explore · Collections prefilters contracts by reading token rows (chunked) and caches non‑empty per KT1.
- I217: `CollectionCard` hides when live token count is 0 and only fetches owner counts when live>0.
- I218: Explore · Tokens requires `totalSupply.gt=0` server‑side and client‑side guards drop any row with `totalSupply===0`.
- I219: Contract page token grid uses `listLiveTokenIds()` for the allow‑set and overlays meta/preview guards; header token count uses `countTokens()`.
- I220: My · Tokens “Owned” builds from balances `balance.ne=0` (no dependency on a burn address). “Creations” hides destroyed by default (toggleable).
- I221: Liveness/burn semantics are address‑agnostic; destroy/burn entrypoints and direct burns are all unified under `totalSupply>0` rules.

───────────────────────────────────────────────────────────────
3 · RESERVED
───────────────────────────────────────────────────────────────
Reserved for future research notes and protocol upgrades.

───────────────────────────────────────────────────────────────
4 · COMPREHENSIVE SOURCE‑TREE MAP (per‑file description • imports • exports)
───────────────────────────────────────────────────────────────
/* Legend — one line per path, keep case‑exact  
<relative‑path> — <purpose>; Imports: <comma‑list>; Exports: <comma‑list>  
“·” = none.  Where helpful, inline citations point to bundle dumps. */

zerounbound — repo root; Imports: ·; Exports: ·
zerounbound/.eslintrc.cjs — ESLint ruleset; Imports: eslint‑config‑next; Exports: module.exports
zerounbound/.gitignore — git ignore list; Imports: ·; Exports: ·
zerounbound/.prettierrc — Prettier config; Imports: ·; Exports: module.exports
zerounbound/.yarnrc.yml — Yarn 4 settings; Imports: ·; Exports: ·
zerounbound/.yarn/ — Yarn data; Imports: ·; Exports: ·
zerounbound/.github/CODEOWNERS — repo ownership map; Imports: ·; Exports: ·
zerounbound/.github/PULL_REQUEST_TEMPLATE.md — PR template; Imports: ·; Exports: ·
zerounbound/.github/ci.yml — CI workflow; Imports: ·; Exports: ·
zerounbound/.next/ — Next build output (ephemeral); Imports: ·; Exports: ·
zerounbound/next-env.d.ts — Next.js TS globals; Imports: ·; Exports: ·
zerounbound/bundle.config.json — bundle glob map (I14); Imports: ·; Exports: ·
zerounbound/LICENSE — MIT licence text; Imports: ·; Exports: ·
zerounbound/AGENTS.md — contributor & Codex guide; Imports: ·; Exports: ·
zerounbound/README_contract_management.md (retired 512c275) — former overview; Imports: ·; Exports: ·
zerounbound/docs/AI_CUSTOM_INSTRUCTIONS.md — collaboration instructions; Imports: ·; Exports: ·
zerounbound/docs/TZIP_Compliance_Invariants_ZeroContract_V4.md — TZIP invariants (companion). Imports: ·; Exports: ·
zerounbound/docs/AI_SYSTEM_INSTRUCTIONS.txt — assistant system rules; Imports: ·; Exports: ·
zerounbound/docs/Master_Overview_And_Manifest_zerounbound_contractmanagement.md — **this file**; Imports: ·; Exports: ·
zerounbound/next.config.js — Next.js config; Imports: next‑mdx,@next/font; Exports: module.exports
zerounbound/jest.config.cjs — Jest config; Imports: ·; Exports: module.exports
zerounbound/jest.setup.js — Jest setup (polyfills, env); Imports: ·; Exports: ·
zerounbound/package.json — NPM manifest; Imports: ·; Exports: scripts,dependencies
zerounbound/tsconfig.json — TS path hints; Imports: ·; Exports: compilerOptions
zerounbound/yarn.lock — Yarn lockfile; Imports: ·; Exports: ·

╭── __tests__ ───────────────────────────────────────────────────────────────╮
zerounbound/__tests__/dummy.test.js — placeholder test; Imports: ·; Exports: ·
zerounbound/__tests__/sliceResume.test.js — resume-safe slicer tests; Imports: planHead,cutTail; Exports: ·
zerounbound/__tests__/svgDataUri.test.js — data-URI validation tests; Imports: isValidDataUri; Exports: ·
zerounbound/__tests__/v2aLedger.test.js — tests v2a ledger fallback; Imports: getLedgerBalanceV2a; Exports: ·

╭── build / infra ───────────────────────────────────────────────────────────╮
zerounbound/scripts/ensureDevManifest.js — CI guard for dev manifest; Imports: fs,path; Exports: main
zerounbound/scripts/generateBundles.js — dumps bundles → summarized_files; Imports: globby,fs; Exports: main
zerounbound/scripts/generateManifest.js — rebuilds this manifest; Imports: fs,globby; Exports: main
zerounbound/scripts/setTarget.js — switches TARGET (I63/I132); Imports: fs; Exports: setTarget
zerounbound/scripts/startDev.js — custom dev wrapper; Imports: child_process; Exports: main
zerounbound/scripts/updatePkgName.js — rewrites package.json name; Imports: fs; Exports: main
zerounbound/scripts/codex-setup.sh — Codex CI bootstrap; Imports: ·; Exports: ·

╭── contracts (michelson & refs) ────────────────────────────────────────────╮
zerounbound/contracts/Zero_Contract_V3.tz — legacy v3 contract; Imports: ·; Exports: ·
zerounbound/contracts/Zero_Contract_V4.tz — legacy v4 (read‑only); Imports: ·; Exports: ·
zerounbound/contracts/Zero_Contract_v4e.tz — **canonical v4e**; Imports: ·; Exports: ·
zerounbound/contracts/ZeroSum.tz — ZeroSum marketplace; Imports: ·; Exports: ·
zerounbound/contracts/ZeroSum - Copy.txt — backup of ZeroSum; Imports: ·; Exports: ·
zerounbound/contracts/metadata/views/Zero_Contract_v4_views.json — off‑chain views; Imports: ·; Exports: ·
zerounbound/contracts/Marketplace/MarketplaceViews/ZeroSum.views.json — compiled views for ZeroSum marketplace.
zerounbound/contracts/Marketplace/ZeroSumMarketplace-KT19kipdLiWyBZvP7KWCPdRbDXuEiu3gfjBR.tz — deployed marketplace (mainnet); Imports: ·; Exports: ·
zerounbound/contracts/Marketplace/NewZeroSumMarketplace-KT19yn9fWP6zTSLPntGyrPwc7JuMHnYxAn1z.tz — deployed marketplace (alt); Imports: ·; Exports: ·
zerounbound/contracts/EntrypointsReference/Zero_Contract_1 entrypoints.txt — v1 entrypoints; Imports: ·; Exports: ·
zerounbound/contracts/EntrypointsReference/Zero_Contract_3 entrypoints.txt — v3 entrypoints; Imports: ·; Exports: ·
zerounbound/contracts/EntrypointsReference/Zero_Contract_V2a entrypoints.txt — v2a entrypoints; Imports: ·; Exports: ·
zerounbound/contracts/EntrypointsReference/Zero_Contract_V2b entrypoints.txt — v2b entrypoints; Imports: ·; Exports: ·
zerounbound/contracts/EntrypointsReference/Zero_Contract_V4 entrypoints.txt — v4 entrypoints; Imports: ·; Exports: ·
zerounbound/contracts/EntrypointsReference/Zero_Contract_V4a entrypoints.txt — v4a entrypoints; Imports: ·; Exports: ·
zerounbound/contracts/LegacyZeroContractVersions/v1-KT1R3kYYC….tz — legacy v1; Imports: ·; Exports: ·
zerounbound/contracts/LegacyZeroContractVersions/v2a-KT1CdzcH….tz — legacy v2a; Imports: ·; Exports: ·
zerounbound/contracts/LegacyZeroContractVersions/v2b-KT1SQuym….tz — legacy v2b; Imports: ·; Exports: ·
zerounbound/contracts/LegacyZeroContractVersions/v3-KT1VupZWH….tz — legacy v3; Imports: ·; Exports: ·
zerounbound/contracts/LegacyZeroContractVersions/v4a-KT1RnPq7….tz — legacy v4a; Imports: ·; Exports: ·
zerounbound/contracts/LegacyZeroContractVersions/Zero_Contract_V4.tz — legacy v4 code; Imports: ·; Exports: ·
zerounbound/contracts/ContractFactory/KT1H8myPr7EmVPFLmBcnSxgiYigdMKZu3ayw.tz — ZeroWorks factory (compiled).
zerounbound/contracts/ContractFactory/CF deployed contract/v4e-KT1SadkkZeeLdzxh3NTGngEzkg6evvSbJn2F.tz — reference of deployed v4e via factory.

╭── public assets ───────────────────────────────────────────────────────────╮
zerounbound/public/embla-left.svg — carousel arrow ⬅; Imports: ·; Exports: ·
zerounbound/public/embla-right.svg — carousel arrow ➡; Imports: ·; Exports: ·
zerounbound/public/favicon.ico — site favicon; Imports: ·; Exports: ·
zerounbound/public/manifest.base.json — PWA base manifest; Imports: ·; Exports: ·
zerounbound/public/manifest.json — PWA build manifest; Imports: manifest.base.json; Exports: ·
zerounbound/public/sw.js — Workbox 7 service‑worker; Imports: workbox‑sw; Exports: self.addEventListener
zerounbound/public/fonts/PixeloidMono-d94EV.ttf — mono pixel font; Imports: ·; Exports: ·
zerounbound/public/fonts/PixeloidSans-mLxMm.ttf — sans pixel font; Imports: ·; Exports: ·
zerounbound/public/fonts/PixeloidSansBold-PKnYd.ttf — bold pixel font; Imports: ·; Exports: ·
zerounbound/public/sprites/Banner.png — hero banner; Imports: ·; Exports: ·
zerounbound/public/sprites/Banner.psd — banner PSD; Imports: ·; Exports: ·
zerounbound/public/sprites/Burst.svg — celebration burst; Imports: ·; Exports: ·
zerounbound/public/sprites/cover_default.svg — fallback NFT cover; Imports: ·; Exports: ·
zerounbound/public/sprites/ghostnet_logo.png — Ghostnet logo; Imports: ·; Exports: ·
zerounbound/public/sprites/ghostnet_logo.svg — Ghostnet logo; Imports: ·; Exports: ·
zerounbound/public/sprites/ghostnetBanner.png — Ghostnet banner; Imports: ·; Exports: ·
zerounbound/public/sprites/loading.svg — large loading spinner; Imports: ·; Exports: ·
zerounbound/public/sprites/loading16x16.gif — 16 px loading GIF; Imports: ·; Exports: ·
zerounbound/public/sprites/loading48x48.gif — 48 px loading GIF; Imports: ·; Exports: ·
zerounbound/public/sprites/logo.png — logo raster; Imports: ·; Exports: ·
zerounbound/public/sprites/logo.psd — logo PSD; Imports: ·; Exports: ·
zerounbound/public/sprites/logo.svg — Zero logo; Imports: ·; Exports: ·

╭── src/config ──────────────────────────────────────────────────────────────╮
zerounbound/src/config/deployTarget.js — network config & single divergence
  point (I10/I132); defines TARGET (**mainnet** default), NET, RPC lists,
  **TzKT API base** (host without `/v1`; callers normalize or use `tzktBase()`),
  theme/site values, FACTORY_ADDRESS/ES, selectFastestRpc(),
  DOMAIN_CONTRACTS/FALLBACK_RPCS for .tez reverse lookups.

╭── src/constants ───────────────────────────────────────────────────────────╮
zerounbound/src/constants/funLines.js — rotating overlay quotes; Exports: FUN_LINES
zerounbound/src/constants/integrityBadges.js — on‑chain badge map; Exports: INTEGRITY_* helpers
zerounbound/src/constants/mimeTypes.js — MIME map + preferredExt('.mp3'); Exports: MIME_TYPES,preferredExt
zerounbound/src/constants/views.hex.js — hex‑encoded contract views; Exports: default viewsHex

╭── src/contexts ────────────────────────────────────────────────────────────╮
zerounbound/src/contexts/ThemeContext.js — dark/light palette ctx; Imports: react,styled‑components; Exports: ThemeProvider,useTheme
zerounbound/src/contexts/WalletContext.js — Beacon wallet context; silent session restore; toolkit init; Imports: React,@taquito/beacon-wallet,TezosToolkit,DEFAULT_NETWORK,chooseFastestRpc; Exports: WalletProvider,useWallet

╭── src/core ────────────────────────────────────────────────────────────────╮
zerounbound/src/core/batch.js — batch ops (v1‑v4); Imports: @taquito/utils,net.js; Exports: forgeBatch,sendBatch,buildAppendTokenMetaCalls,sliceHex,splitPacked
zerounbound/src/core/batchV4a.js — v4a‑specific batch ops; Imports: @taquito/taquito; Exports: SLICE_SAFE_BYTES,sliceHex,buildAppendTokenMetaCalls
zerounbound/src/core/feeEstimator.js — chunk‑safe fee/burn estimator; Imports: @taquito/taquito; Exports: estimateChunked,calcStorageMutez,toTez
zerounbound/src/core/marketplace.js — ZeroSum helpers; Imports: net.js,@taquito/taquito,@taquito/tzip16;  
  **Exports**:  
  • `getMarketContract`, `fetchListings`, `fetchLowestListing`, `fetchOffers`, `fetchListingDetails`,  
  • on‑chain view readers: `fetchOnchainListings`, `fetchOnchainOffers`, `fetchOnchainListingDetails`, `fetchOnchainListingsForSeller`, `fetchOnchainOffersForBuyer`, `fetchOnchainListingsForCollection`, `fetchOnchainOffersForCollection`,  
  • param builders: `buildBuyParams`, `buildListParams`, `buildCancelParams`, `buildAcceptOfferParams`, `buildOfferParams`,  
  • **preflight**: `getFa2BalanceViaTzkt(account, nftContract, tokenId)`, **`preflightBuy()`** (throws `STALE_LISTING_NO_BALANCE`).
zerounbound/src/core/marketplaceHelper.js — collection‑level listing helpers (TzKT view + big‑map fallback); Imports: net.js,deployTarget,tzkt.js;  
  **Exports**: `getCollectionListings(nftContract, net)`, `countActiveListingsForCollection(nftContract, tokenIds?, net)` (dedupes per tokenId; view‑preferred).
zerounbound/src/core/net.js — network helpers (jFetch limiter/back‑off, safe fetch), forging; Imports: Parser,@taquito/michelson-encoder,deployTarget; Exports: jFetch,forgeOrigination,injectSigned
zerounbound/src/core/slicing.js — canonical head/tail slicer; Imports: @taquito/utils; Exports: planHead,computeOnChainPrefix,cutTail,buildAppendCalls,SLICE_MAX_BYTES,SLICE_MIN_BYTES,PACKED_SAFE_BYTES,HEADROOM_BYTES
zerounbound/src/core/validator.js — schema & form validators; Exports: validateContract,validateToken,validateMintFields,validateDeployFields

╭── src/data ────────────────────────────────────────────────────────────────╮
zerounbound/src/data/entrypointRegistry.json — EP button matrix (v1→v4e).
zerounbound/src/data/hashMatrix.json — SHA‑1 → version map incl. v4e 2058538150.
zerounbound/src/utils/allowedHashes.js — **programmatic allow‑list** accessor built from hashMatrix; Imports: hashMatrix.json; Exports: isAllowed,set,keys

╭── src/hooks ───────────────────────────────────────────────────────────────╮
zerounbound/src/hooks/useConsent.js — persistent consent flags + broadcast; Exports: useConsent.
zerounbound/src/hooks/useHeaderHeight.js — sets --hdr var; Exports: useHeaderHeight
zerounbound/src/hooks/useViewportUnit.js — sets --vh var; Exports: useViewportUnit
zerounbound/src/hooks/useTxEstimate.js — gas/fee estimator hook; Exports: useTxEstimate

╭── src/pages (Next.js) ─────────────────────────────────────────────────────╮
zerounbound/src/pages/_app.js — root providers; Imports: ThemeContext,WalletContext,GlobalStyles; Exports: MyApp
zerounbound/src/pages/_document.js — custom document (I20); Imports: next/document; Exports: default
zerounbound/src/pages/index.js — landing page; Imports: Layout,CRTFrame; Exports: Home
zerounbound/src/pages/deploy.js — collection deployment UI; factory bytes param; full views injection; Exports: default (DeployPage)
zerounbound/src/pages/manage.js — manage page; Imports: Layout,AdminTools; Exports: ManagePage
zerounbound/src/pages/terms.js — ToS page; Imports: Layout; Exports: TermsPage

— explore —
zerounbound/src/pages/explore/[[...filter]].jsx — dynamic explore grid (admin/contract search, filters); **shared discovery + idbCache**; Exports: Explore
zerounbound/src/pages/explore/secondary.jsx — secondary explore route; Imports: React; Exports: SecondaryExplore.
zerounbound/src/pages/explore/listings/index.jsx — marketplace listings grid; shows live ZeroSum listings; metadata prefetch; **tzktBase already `/v1`**; never double‑append (r7).
zerounbound/src/pages/explore/tokens.jsx — **ZeroContract tokens grid** with scan‑ahead min‑yield, accurate totals reconciliation, preview/supply guard, admin filter parity; Exports: ExploreTokens

— my —
zerounbound/src/pages/my/collections.jsx — wallet‑scoped grid of all ZeroContracts the user created/admins (v1→v4e). Uses discovery + idbCache; allows empty collections; Exports: MyCollections
zerounbound/src/pages/my/listings.jsx — user listings view; Imports: React,marketplace helpers; Exports: MyListings
zerounbound/src/pages/my/offers.jsx — offers to accept / made; Imports: Tzip16Module,decodeHexFields,marketplace helpers; Exports: MyOffers.
zerounbound/src/pages/my/tokens.jsx — minted/owned discovery; live‑balance filter; decodeHexFields; Exports: MyTokens.

— contracts/tokens —
zerounbound/src/pages/contracts/[addr].jsx — collection detail; Imports: ContractMetaPanelContracts,TokenCard,hazards; Exports: ContractPage
zerounbound/src/pages/tokens/[addr]/[tokenId].jsx — token detail; integrates MAINTokenMetaPanel, extrauri viewer with prev/next navigation & hazard overlays; fetches get_extrauris via RPC (tzip16) with TzKT fallback; Exports: TokenDetailPage

╭── src/styles ──────────────────────────────────────────────────────────────╮
zerounbound/src/styles/globalStyles.js — root CSS + scrollbar; Imports: styled‑components,palettes.json; Exports: GlobalStyles
zerounbound/src/styles/palettes.json — theme palettes; Imports: ·; Exports: ·

╭── src/ui (shell & components) ─────────────────────────────────────────────╮
zerounbound/src/ui/CollectionCard.jsx — responsive contract card; accepts string KT1 or object; loads via contractMeta; Imports: hazards,useConsent,RenderMedia; Exports: CollectionCard
zerounbound/src/ui/CRTFrame.jsx — CRT screen border; Imports: react; Exports: CRTFrame
zerounbound/src/ui/ExploreNav.jsx — sticky explore nav (search + consent toggles); **mandatory on explore/* and my/***; Exports: ExploreNav
zerounbound/src/ui/FiltersPanel.jsx — explore filters sidebar; Exports: FiltersPanel
zerounbound/src/ui/Header.jsx — top nav + network switch; Exports: Header
zerounbound/src/ui/Layout.jsx — app shell & scroll‑lock; Exports: Layout
zerounbound/src/ui/LoadingSpinner.jsx — 8‑bit spinner; Exports: LoadingSpinner
zerounbound/src/ui/PixelButton.jsx — pixel art <button>; **adopt transient props for non‑DOM attrs**; Exports: PixelButton
zerounbound/src/ui/PixelConfirmDialog.jsx — confirm modal; Exports: PixelConfirmDialog
zerounbound/src/ui/PixelHeading.jsx — pixel art headings; Exports: PixelHeading
zerounbound/src/ui/PixelInput.jsx — pixel art inputs; Exports: PixelInput
zerounbound/src/ui/ThemeToggle.jsx — palette switch button; Exports: ThemeToggle
zerounbound/src/ui/WalletNotice.jsx — wallet status banner; Exports: WalletNotice
zerounbound/src/ui/ZerosBackground.jsx — animated zeros field; Exports: ZerosBackground
zerounbound/src/ui/IntegrityBadge.jsx — on‑chain integrity badge; Exports: IntegrityBadge
zerounbound/src/ui/MAINTokenMetaPanel.jsx — token detail meta panel with extrauri navigation & downloadable MIME links; Imports: RenderMedia, hazards; Exports: MAINTokenMetaPanel

— marketplace bars & dialogs —
zerounbound/src/ui/BuyDialog.jsx — buy modal; Imports: buildBuyParams,preflightBuy; Exports: BuyDialog
zerounbound/src/ui/ListTokenDialog.jsx — single‑sig listing wizard; Imports: marketplace helpers; Exports: ListTokenDialog
zerounbound/src/ui/MakeOfferDialog.jsx — offer modal with dynamic method resolution; Exports: MakeOfferDialog
zerounbound/src/ui/MarketplaceBar.jsx — token action bar (buy/list/offer); Imports: BuyDialog,ListTokenDialog,MakeOfferDialog; Exports: MarketplaceBar
zerounbound/src/ui/MarketplaceBuyBar.jsx — compact buy/list UI for listing cards; Imports: BuyDialog; Exports: MarketplaceBuyBar
zerounbound/src/ui/TokenListingCard.jsx — listing grid card; Imports: RenderMedia, MarketplaceBuyBar/MarketplaceBar; Exports: TokenListingCard

— discovery & carousels —
zerounbound/src/ui/ContractCarousels.jsx — creator/admin carousels on Manage page; **uses contractDiscovery + idbCache**; Exports: ContractCarousels

— entrypoints & admin —
zerounbound/src/ui/AdminTools.jsx — dynamic entry‑point modal; Exports: AdminTools
zerounbound/src/ui/OperationConfirmDialog.jsx — tx summary dialog; Exports: OperationConfirmDialog
zerounbound/src/ui/OperationOverlay.jsx — progress overlay; Exports: OperationOverlay
zerounbound/src/ui/ContractMetaPanel.jsx — contract stats; Exports: ContractMetaPanel
zerounbound/src/ui/ContractMetaPanelContracts.jsx — banner panel on /contracts; Exports: ContractMetaPanelContracts
zerounbound/src/ui/DeployCollectionForm.jsx — collection deploy UI; Exports: DeployCollectionForm
zerounbound/src/ui/FullscreenModal.jsx — fullscreen viewer + pixel upscale; Exports: FullscreenModal
zerounbound/src/ui/EnableScripts.jsx — script‑consent components; Exports: EnableScriptsOverlay,EnableScriptsToggle
zerounbound/src/ui/MakeOfferBtn.jsx — XS make‑offer button; Exports: MakeOfferBtn

— Entrypoints (v4 & v4a) —
zerounbound/src/ui/Entrypoints/index.js — lazy EP resolver; Exports: resolveEp
zerounbound/src/ui/Entrypoints/AcceptOffer.jsx — accept marketplace offers; dynamic accept_offer resolution; Exports: AcceptOffer
zerounbound/src/ui/Entrypoints/AddRemoveCollaborator.jsx — collab mutator; Exports: AddRemoveCollaborator
zerounbound/src/ui/Entrypoints/AddRemoveCollaboratorsv4a.jsx — v4a bulk collab; Exports: AddRemoveCollaboratorsv4a
zerounbound/src/ui/Entrypoints/AddRemoveParentChild.jsx — relation manager; Exports: AddRemoveParentChild
zerounbound/src/ui/Entrypoints/AppendArtifactUri.jsx — slice uploader (I60); Exports: AppendArtifactUri
zerounbound/src/ui/Entrypoints/AppendExtraUri.jsx — extra media uploader; Exports: AppendExtraUri
zerounbound/src/ui/Entrypoints/BalanceOf.jsx — balance viewer; Exports: BalanceOf
zerounbound/src/ui/Entrypoints/Burn.jsx — burn token; Exports: Burn
zerounbound/src/ui/Entrypoints/BurnV4.jsx — burn v4a‑safe; Exports: BurnV4
zerounbound/src/ui/Entrypoints/CancelListing.jsx — cancel marketplace listings; paginated table; Exports: CancelListing
zerounbound/src/ui/Entrypoints/CancelOffer.jsx — withdraw offers; Exports: CancelOffer
zerounbound/src/ui/Entrypoints/ClearUri.jsx — clear artifactUri; Exports: ClearUri
zerounbound/src/ui/Entrypoints/Destroy.jsx — destroy contract; Exports: Destroy
zerounbound/src/ui/Entrypoints/EditContractMetadata.jsx — contract meta editor; Exports: EditContractMetadata
zerounbound/src/ui/Entrypoints/EditTokenMetadata.jsx — token meta editor; Exports: EditTokenMetadata
zerounbound/src/ui/Entrypoints/ManageCollaborators.jsx — v3/v4 collab GUI; Exports: ManageCollaborators
zerounbound/src/ui/Entrypoints/ManageCollaboratorsv4a.jsx — v4a collab GUI; Exports: ManageCollaboratorsv4a
zerounbound/src/ui/Entrypoints/ManageParentChild.jsx — parent/child GUI; Exports: ManageParentChild
zerounbound/src/ui/Entrypoints/Mint.jsx — mint NFTs; Exports: Mint
zerounbound/src/ui/Entrypoints/MintPreview.jsx — pre‑mint gallery; Exports: MintPreview
zerounbound/src/ui/Entrypoints/MintUpload.jsx — drag/upload step with onChainValidator; Exports: MintUpload
zerounbound/src/ui/Entrypoints/MintV4a.jsx — v4a mint UI; Exports: MintV4a
zerounbound/src/ui/Entrypoints/RepairUri.jsx — diff repair; Exports: RepairUri
zerounbound/src/ui/Entrypoints/RepairUriV4a.jsx — v4a diff repair; Exports: RepairUriV4a
zerounbound/src/ui/Entrypoints/TokenPreviewWindow.jsx — portal‑based draggable preview; Exports: TokenPreviewWindow
zerounbound/src/ui/Entrypoints/Transfer.jsx — FA2 transfer; Exports: Transfer
zerounbound/src/ui/Entrypoints/TransferRow.jsx — reusable transfer row; Exports: TransferRow
zerounbound/src/ui/Entrypoints/UpdateContractMetadatav4a.jsx — v4a contract meta; Exports: UpdateContractMetadatav4a
zerounbound/src/ui/Entrypoints/UpdateOperators.jsx — operator set; Exports: UpdateOperators
zerounbound/src/ui/Entrypoints/UpdateTokenMetadatav4a.jsx — v4a token meta editor; Exports: UpdateTokenMetadatav4a

╭── src/utils ───────────────────────────────────────────────────────────────╮
zerounbound/src/utils/chooseFastestRpc.js — RPC race chooser (deployTarget selectFastestRpc); Exports: chooseFastestRpc
zerounbound/src/utils/contractDiscovery.js — **wallet‑centric discovery** (initiator/creator/manager/minted/owned → validate → enrich); Exports: discoverContracts
zerounbound/src/utils/contractMeta.js — **contract mini‑fetch** (counts, metadata digest); Exports: fetchContractMeta
zerounbound/src/utils/countAmount.js — count editions excluding burns; Exports: countAmount
zerounbound/src/utils/countOwners.js — distinct owner counter; Imports: net.js; Exports: countOwners
zerounbound/src/utils/countTokens.js — on‑chain token count; Imports: jFetch; Exports: countTokens
zerounbound/src/utils/decodeHexFields.js — hex→UTF‑8 deep repair; Exports: default
zerounbound/src/utils/formatAddress.js — tz/KT1 truncator + copy; Exports: shortKt,copyToClipboard
zerounbound/src/utils/getLedgerBalanceV2a.cjs — v2a ledger fallback; Exports: getLedgerBalanceV2a
zerounbound/src/utils/hazards.js — detect nsfw/flashing/script flags; Exports: detectHazards
zerounbound/src/utils/idbCache.js — **IndexedDB wrapper with TTL & namespacing**; Exports: idbGet,idbSet,idbDel,idbClear,withTtl
zerounbound/src/utils/listLiveTokenIds.js — TzKT id fetcher (TTL 30 s); Exports: listLiveTokenIds
zerounbound/src/utils/marketplaceListings.js — **listings aggregator** (active collections, bigmap fetchers, on‑chain view readers); Exports: listings helpers.  
  (The listings page derives the TzKT base via `tzktBase(net)`; r7 explicitly warns to **not** append `/v1` twice.)
zerounbound/src/utils/onChainValidator.js — fast FOC heuristic (I99); Exports: checkOnChainIntegrity
zerounbound/src/utils/pixelUpscale.js — css helpers for pixel‑art upscaling; Exports: pixelUpscaleStyle
zerounbound/src/utils/RenderMedia.jsx — data‑URI media viewer; Exports: RenderMedia
zerounbound/src/utils/resolveTezosDomain.js — reverse resolver; imports DOMAIN_CONTRACTS/FALLBACK_RPCS; Exports: resolveTezosDomain
zerounbound/src/utils/sliceCache.js — IndexedDB-only slice checkpoint cache (migrates legacy localStorage); Exports: saveSliceCheckpoint,loadSliceCheckpoint,clearSliceCheckpoint,purgeExpiredSliceCache
zerounbound/src/utils/sliceCacheV4a.js — v4a slice cache (IndexedDB); Exports: saveSliceCheckpoint,loadSliceCheckpoint,clearSliceCheckpoint,purgeExpiredSliceCache,strHash
zerounbound/src/utils/toNat.js — address→nat util; Exports: toNat
zerounbound/src/utils/uriHelpers.js — data‑URI helpers; Exports: URI_KEY_REGEX,listUriKeys,mimeFromDataUri,isValidDataUri,isLikelySvg,ensureDataUri
zerounbound/src/utils/useIsoLayoutEffect.js — SSR‑safe layout effect; Exports: useIsoLayoutEffect
zerounbound/src/utils/useWheelTunnel.js — wheel event tunnel (I64); Exports: useWheelTunnel

╭── src/workers ─────────────────────────────────────────────────────────────╮
zerounbound/src/workers/originate.worker.js — web‑worker origination; Imports: @taquito/taquito,net.js; Exports: onmessage

╭── summarized_files (bundle drops) ────────────────────────────────────────╮
zerounbound/summarized_files/contracts_bundle.txt — Michelson sources + views; Imports: ·; Exports: ·
zerounbound/summarized_files/assets_bundle.txt — fonts, sprites, sw.js; Imports: ·; Exports: ·
zerounbound/summarized_files/engine_bundle.txt — Node/core dump; Imports: ·; Exports: ·
zerounbound/summarized_files/frontend_bundle.txt — UI dump; Imports: ·; Exports: ·
zerounbound/summarized_files/infra_bundle.txt — infra dump; Imports: ·; Exports: ·
zerounbound/summarized_files/master_bundle.txt — contains everything in all the above bundles
zerounbound/summarized_files/render_media_bundle.txt — media‑centric UI modules
zerounbound/summarized_files/explore_bundle.txt — explore pages, listings utils, dialogs and helpers + **discovery/idb**  
  (r7: tzktBase includes `/v1`; do not append.)

───────────────────────────────────────────────────────────────
5 · BUNDLE INDEX (How to read) — each text‑dump lives in summarized_files/
───────────────────────────────────────────────────────────────
contracts_bundle.txt → Michelson sources + views  
assets_bundle.txt  → fonts, sprites, sw.js  
engine_bundle.txt  → scripts/, core/, data/, config/, constants/, utils/  
frontend_bundle.txt → contexts/, hooks/, ui/, pages/, styles/  
infra_bundle.txt   → root configs, next.config.js, package.json, CI helpers  
master_bundle.txt  → contains everything in all the above bundles  
render_media_bundle.txt → media‑centric UI modules  
explore_bundle.txt → explore + marketplace listings/dialogs/helpers **and discovery/idb**

───────────────────────────────────────────────────────────────
6 · QUICK‑START & CI PIPELINE
───────────────────────────────────────────────────────────────
corepack enable && corepack prepare yarn@4.9.1 --activate  
yarn install

### OpenAI Codex setup script
Codex pulls scripts/codex-setup.sh automatically:

#!/usr/bin/env bash
corepack enable
corepack prepare yarn@4.9.1 --activate
yarn install --immutable --inline-builds
### Vercel

Project       Build Command                           Domains
ghostnet      yarn set:ghostnet && yarn build       ghostnet.zerounbound.art
mainnet       yarn set:mainnet  && yarn build       zerounbound.art, www.*

Local development
• Default target: mainnet (I132). deployTarget.js must export const TARGET='mainnet'.
• To switch network locally:

yarn set:ghostnet   # writes TARGET='ghostnet'
yarn dev:current    # runs on the selected target/port without resetting TARGET
# To return to mainnet:
yarn set:mainnet && yarn dev:current
• Clearing the IndexedDB discovery cache may be necessary after network
switches to prevent stale data (see src/utils/idbCache.js). Prefer a targeted
cache clear (key‑space: zu:disc:<network>:<address>).

───────────────────────────────────────────────────────────────
7 · APPENDICES (How to read) — machine‑readables live in code
───────────────────────────────────────────────────────────────
A. hashMatrix.json — typeHashes used to label contract versions
and ensure back‑compat across loaders and UIs; includes v4e hash
2058538150 → "v4e".
B. entrypointRegistry.json — canonical entrypoints per version,
including v4e as an $extends of v4 where applicable.
C. allowedHashes.js — programmatic accessor over A; append‑only.
D. ZeroContract Version Map:
v1 — original zerocontract
v2 series — community “homebrews”; v2b = “original without lock adding parent/child”
v3 — first collaborator contract
v4 — legacy append contract (our append_* and edit_* entrypoints)
v4a — zeroterminal main contract (ZT entrypoints, different names/order)
v4b — sifrzero (default collaborative, like HEN collection; no add/remove_collaborator, anyone can mint)
v4c — zeroterminal default collaborative
v4d — zeroterminal updated with add collaborators
v4e — current grail, canonical deployable contract on zerounbound.art (extends v4 where applicable)

Entrypoint differences (canonical, from our registry):
v1/v3/v4 mint(nat, map(string,bytes), address); v2a/v2b mint(map(string,bytes), address); v4a/v4d (ZT) mint(address, nat, map(string,bytes)). v4e extends v4. Using these signatures is required; do not mix ZT’s append_token_metadata/update_token_metadata with our append_artifact_uri/edit_token_metadata.

Who can mint <32,768 bytes vs >32,768 bytes (multisig batching + diff‑aware repairs/retries):

Our v4 / v4e: support chunked appends via append_artifact_uri and edit_token_metadata. These are the contracts we batch and repair automatically (multisig‑safe, retryable).

ZT v4a/v4c/v4d: use different entrypoints (append_token_metadata, update_token_metadata). In our UI, v4a UX opens Zeroterminal—we do not run our append/repair pipeline on ZT contracts to avoid mangling parameters.

Why the delineation matters: AdminTools introspects the typeHash → version to choose the correct UX component and entrypoint names/argument order. We gate discoverability and version badges using hashMatrix.json + allowedHashes.js, and we pick per‑version entrypoints directly from entrypointRegistry.json. This is what prevents calling, e.g., append_artifact_uri on a ZT v4a (which would 100% “codex‑wreck” metadata).
───────────────────────────────────────────────────────────────
CHANGELOG
───────────────────────────────────────────────────────────────
r1187 — Consolidate Share appendix; enforce live‑supply semantics across explore/collections, explore/tokens, contract page, and cards; add invariants I200–I221; ASCII cleanup in CancelListing.
r1186 — Share system overhaul: global share bus; scope‑aware ShareDialog; collection/listing SHARE buttons; handle resolver API; docs updated.
r1185 — Token detail page fetches get_extrauris via RPC (tzip16) with TzKT fallback, removing Better Call Dev dependency.
r1184 — Add extrauri viewer with navigation and downloadable MIME links on token detail page.
r1183 — Introduce canonical slicer, migrate slice checkpoints to IndexedDB only, add data‑URI tests.
r1182 — Document marketplace dialogs (Buy/List/MakeOffer) and
Accept/Cancel entrypoints; extend manifest coverage for completeness.
r1181 — Add Explore/Tokens documentation (scan‑ahead min‑yield pagination,
accurate totals reconciliation, preview/supply gating), clarify TzKT `/v1`
normalization, reaffirm listings stale‑listing guard & transient‑prop rule.

r1180 — Add ZeroSum stale‑listing guard based on TzKT balances,
enforce /v1 base normalization, codify transient‑prop rule, reaffirm no‑sentinel.

/* What changed & why: Token page now calls get_extrauris via RPC (tzip16) with TzKT fallback, removing BCD dependency; appended changelog. */
