/*─────────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    docs/Master_Overview_And_Manifest_zerounbound_contractmanagement.md
  Rev :    r1162    2025‑08‑11 UTC
  Summary: Sync file map incl. missing paths; v4e canonical;
           TARGET=mainnet invariant; marketplace utils/pages; tests.
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
factory constructs the storage internally and originates a new **v4e**
contract via CREATE_CONTRACT. On networks without a factory,
the UI falls back to toolkit.wallet.originate() with the full
metadata big‑map. This design ensures compatibility across
wallets while eliminating payload size limits. Marketplace
integration includes listings, offers and tokens pages under
/explore and /my. See sections below for details.
(For marketplace dialogs and listings utilities, see
src/core/marketplace.js, src/ui/… dialogs, and
src/utils/marketplaceListings.js.) 

════════════════════════════════════════════════════════════════
TABLE OF CONTENTS
════════════════════════════════════════════════════════════════
0 · Global Rules & Meta Docs
1 · High‑Level Architecture
1·5 Critical‑Entry Index
2 · Invariants (I00 – I134)
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
offer actions use src/core/marketplace.js helpers and dialogs
(ListTokenDialog, BuyDialog, MakeOfferDialog, AcceptOffer,
CancelListing, **CancelOffer**) with progress handled by
OperationOverlay. See compiled views for the marketplace in
contracts/Marketplace/MarketplaceViews/ZeroSum.views.json.
───────────────────────────────────────────────────────────────
1·5 · CRITICAL‑ENTRY INDEX 🗝️
───────────────────────────────────────────────────────────────
• src/pages/deploy.js – single‑stage origination; factory bytes param;
  ordered metadata; factory fallback to originate on UI when needed.
• src/pages/explore/listings/index.jsx – lists tokens with active
  ZeroSum marketplace listings; renders responsive grid; uses
  TokenListingCard and marketplace helpers.
• src/pages/explore/secondary.jsx – alternate explore route auxiliary
  page (network‑aware).
• src/pages/my/offers.jsx – lists marketplace offers (accept/made),
  uses TZIP‑16 views and marketplace helpers.
• src/pages/my/tokens.jsx – unified minted/owned discovery and
  filtering (live balances, valid typeHash); decodes hex metadata;
  skips burn‑only tokens. 
• src/ui/TokenListingCard.jsx – listing card used on /explore/listings
  grid (imports MarketplaceBuyBar/MarketplaceBar).
• src/ui/MarketplaceBuyBar.jsx – compact buy‑action bar variant for
  listings cards.
• src/ui/Entrypoints/CancelOffer.jsx – cancel pending offer(s)
  dialog; integrates OperationOverlay + feeEstimator + marketplace
  params.
• src/utils/marketplaceListings.js – helpers to aggregate and fetch
  marketplace listings & active collections.
• src/utils/getLedgerBalanceV2a.cjs – v2a ledger fallback used by
  marketplace dialogs (balance checks) and tests.
• __tests__/v2aLedger.test.js – validates v2a ledger fallback logic.

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
I60 [F,E] Resumable Slice Uploads — Mint, Append & Repair (see full cache spec).
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
I86 [F] HelpBox Standard — standardized HelpBox across entry‑points.
I87 [F] Live JSON Validation — disable CTA until valid JSON.
I88 [I] ESLint no-local-estimator Rule.
I89 [F,E] v4a slice batch storageLimit computed per payload.
I90 [F] All wait/sleep via sleepV4a.js.
I91 [F,E] Shared ledger wait logic in v4a flows.
I92 [F] MintV4a.jsx invokes shared ledger‑wait only after first slice.
I93 [F] OperationOverlay fun‑lines scroll spec.
I94 [F] AdminTools header count rules.
I95 [F] v4a collections warn banner.
I96 [F] OperationOverlay fun‑lines color via var(--zu-accent).
I97 [F] OperationOverlay Close triggers window.location.reload().
I98 [F] Origination CloseBtn top‑right escape obeys I83.
I99 [F] Every upload runs through onChainValidator.js.
I100 [F] SAFE_REMOTE_RE allow‑list (see code) — C0 only / C1 allowed.
I101 [F] Mature/flashing flags irreversible once set; UI + back‑end guards.
I102 [F] Responsive Entry‑Point & Meta‑Panel Blueprint (grid spec).
I103 [F] Read‑only legacy alias artists maps → authors.
I104 [F,C] Contract metadata must include symbol key (3‑5 A‑Z/0‑9).
I105 [F] Explore grid uniformity (auto‑fill col clamp).
I106 [F] Script‑Hazard Consent sandboxing model.
I107 [F] Hex‑field UTF‑8 repair via decodeHexFields.js.
I108 [F] Token‑ID filter UX on contract pages.
I109 [F,E] Live on‑chain stats from countTokens/countOwners (no total_supply).
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
I121 [F] TzKT API bases derived from deployTarget.js (no hard‑coding).
I122 [F] Token meta panels decode collection metadata fully.
I123 [F,E] Marketplace actions wired to ZeroSum helpers & dialogs.
I124 [E,F] Concurrent Ghostnet/Mainnet via yarn set:<network> && dev:current.
I125 [F] /explore/listings shows live ZeroSum listings with helper fns.
I126 [F,C] Factory parameter contains only ordered metadata bytes.
I127 [F] Deploy pages must inject full views array on origination.
I128 [F] Listings/my pages derive TzKT bases via deployTarget.js.
I129 [F,E] MyTokens minted/metadata discovery & live‑balance filter.
I130 [F] (expanded) MyTokens guard — typeHash set and burn‑only exclusion.
I131 [F] Domain resolution env — skip KT1; import DOMAIN_CONTRACTS/FALLBACK_RPCS.

— New in this revision —
I132 [I] **Target default/mainnet** — `src/config/deployTarget.js` must export
`const TARGET = 'mainnet'` by default. Network changes are performed only via
`scripts/setTarget.js` and honored by `yarn dev:current`; no other module may
mutate or infer target defaults at runtime. Document any temporary overrides in
the Change Log and revert after testing.

I133 [C,F,E] **Canonical contract version** — v4e is the canonical ZeroContract
for new deployments; loaders, UIs and helpers must maintain full
back‑compatibility with v1→v4d via `hashMatrix.json` and feature detection.
Do not assume v4/v4a entrypoints; prefer caps via typeHash and safe probing.
(See `src/data/hashMatrix.json` where typeHash 2058538150 → v4e.)

I134 [F,E] **Listings aggregation** — /explore/listings and related
components must use `src/utils/marketplaceListings.js` for collection and
listing discovery. Avoid ad‑hoc scans; use the centralized helpers referenced
in the explore bundle.

───────────────────────────────────────────────────────────────
3 · reserved for future research notes
───────────────────────────────────────────────────────────────/

───────────────────────────────────────────────────────────────
4 · COMPREHENSIVE SOURCE‑TREE MAP (per‑file description • imports • exports)
───────────────────────────────────────────────────────────────/
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
zerounbound/docs/TZIP_Compliance_Invariants_ZeroContract_V4.md — TZIP invariants; Imports: ·; Exports: ·
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
zerounbound/contracts/EntrypointsReference/Zero_Contract_V4d entrypoints.txt — v4d entrypoints; Imports: ·; Exports: ·
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
  TzKT API bases, theme/site values, FACTORY_ADDRESS/ES, selectFastestRpc(),
  DOMAIN_CONTRACTS/FALLBACK_RPCS for .tez reverse lookups (I131).
zerounbound/src/config/networkConfig.js — RPC endpoints map; Imports: ·; Exports: NETWORKS

╭── src/constants ───────────────────────────────────────────────────────────╮
zerounbound/src/constants/funLines.js — rotating overlay quotes; Imports: ·; Exports: FUN_LINES
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
zerounbound/src/core/marketplace.js — ZeroSum helpers (getMarketContract, fetchLowestListing, list/buy/offer param builders); Imports: net.js,@taquito/taquito; Exports: getMarketContract,fetchListings,fetchLowestListing,buildBuyParams,buildListParams,buildOfferParams. 

zerounbound/src/core/net.js — network helpers (jFetch, forgeOrigination, injectSigned); uses Taquito local forging; Imports: Parser,@taquito/michelson-encoder,deployTarget; Exports: jFetch,forgeOrigination,injectSigned
zerounbound/src/core/validator.js — schema & form validators; Exports: validateContract,validateToken,validateMintFields,validateDeployFields

╭── src/data ────────────────────────────────────────────────────────────────╮
zerounbound/src/data/entrypointRegistry.json — EP button matrix (v1→v4e).
zerounbound/src/data/hashMatrix.json — SHA‑1 → version map incl. v4e 2058538150. 

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
zerounbound/src/pages/explore/[[...filter]].jsx — dynamic explore grid; Imports: CollectionCard,useConsent; Exports: Explore
zerounbound/src/pages/explore/secondary.jsx — secondary explore route; Imports: React; Exports: SecondaryExplore.
zerounbound/src/pages/explore/listings/index.jsx — marketplace listings grid; Imports: hashMatrix.json,listLiveTokenIds,fetchLowestListing,TokenListingCard,MarketplaceBar/BuyBar,ExploreNav; Exports: ListingsPage.

— my —
zerounbound/src/pages/my/collections.jsx — collections created/owned; Exports: MyCollections
zerounbound/src/pages/my/listings.jsx — user listings view; Imports: React,marketplace helpers; Exports: MyListings
zerounbound/src/pages/my/offers.jsx — offers to accept / made; Imports: Tzip16Module,decodeHexFields,marketplace helpers; Exports: MyOffers.
zerounbound/src/pages/my/tokens.jsx — minted/owned discovery; live‑balance filter; decodeHexFields; Exports: MyTokens.

— contracts/tokens —
zerounbound/src/pages/contracts/[addr].jsx — collection detail; Imports: ContractMetaPanelContracts,TokenCard,hazards; Exports: ContractPage
zerounbound/src/pages/tokens/[addr]/[tokenId].jsx — token detail; integrates MAINTokenMetaPanel & hazard overlays; Exports: TokenDetailPage

╭── src/styles ──────────────────────────────────────────────────────────────╮
zerounbound/src/styles/globalStyles.js — root CSS + scrollbar; Imports: styled‑components,palettes.json; Exports: GlobalStyles
zerounbound/src/styles/palettes.json — theme palettes; Imports: ·; Exports: ·

╭── src/ui (shell & components) ─────────────────────────────────────────────╮
zerounbound/src/ui/CollectionCard.jsx — responsive contract card; Imports: hazards,useConsent,RenderMedia; Exports: CollectionCard
zerounbound/src/ui/CRTFrame.jsx — CRT screen border; Imports: react; Exports: CRTFrame
zerounbound/src/ui/ExploreNav.jsx — sticky explore nav (search + consent toggles); Exports: ExploreNav
zerounbound/src/ui/FiltersPanel.jsx — explore filters sidebar; Exports: FiltersPanel
zerounbound/src/ui/Header.jsx — top nav + network switch; Exports: Header
zerounbound/src/ui/Layout.jsx — app shell & scroll‑lock; Exports: Layout
zerounbound/src/ui/LoadingSpinner.jsx — 8‑bit spinner; Exports: LoadingSpinner
zerounbound/src/ui/PixelButton.jsx — pixel art <button>; Exports: PixelButton
zerounbound/src/ui/PixelConfirmDialog.jsx — confirm modal; Exports: PixelConfirmDialog
zerounbound/src/ui/PixelHeading.jsx — pixel art headings; Exports: PixelHeading
zerounbound/src/ui/PixelInput.jsx — pixel art inputs; Exports: PixelInput
zerounbound/src/ui/ThemeToggle.jsx — palette switch button; Exports: ThemeToggle
zerounbound/src/ui/WalletNotice.jsx — wallet status banner; Exports: WalletNotice
zerounbound/src/ui/ZerosBackground.jsx — animated zeros field; Exports: ZerosBackground
zerounbound/src/ui/IntegrityBadge.jsx — on‑chain integrity badge; Exports: IntegrityBadge

— marketplace bars & dialogs —
zerounbound/src/ui/MarketplaceBar.jsx — token action bar (buy/list/offer); Imports: BuyDialog,ListTokenDialog,MakeOfferDialog; Exports: MarketplaceBar
zerounbound/src/ui/MarketplaceBuyBar.jsx — compact buy/list UI for listing cards; Imports: BuyDialog; Exports: MarketplaceBuyBar
zerounbound/src/ui/TokenListingCard.jsx — listing grid card; Imports: RenderMedia, MarketplaceBuyBar/MarketplaceBar; Exports: TokenListingCard
zerounbound/src/ui/TokenListingCard.jsx usage & listing page wiring appear in explore bundle. 
zerounbound/src/ui/TokenCard.jsx — token preview card; Imports: hazards,useConsent; Exports: TokenCard
zerounbound/src/ui/TokenIdSelect.jsx — live id dropdown; Exports: TokenIdSelect
zerounbound/src/ui/TokenMetaPanel.jsx — detailed token panel; Exports: TokenMetaPanel
zerounbound/src/ui/MAINTokenMetaPanel.jsx — token metadata panel with hazard consent; resolves .tez; Exports: MAINTokenMetaPanel
zerounbound/src/ui/MarketplaceBuyBar.jsx and related buy/listing logic use getLedgerBalanceV2a when views are missing.

— marketplace dialogs —
zerounbound/src/ui/BuyDialog.jsx — buy confirmation; Imports: OperationConfirmDialog,feeEstimator; Exports: BuyDialog
zerounbound/src/ui/ListTokenDialog.jsx — list dialog (decimals cache, ownership checks; v2a fallback & TzKT fallback); Exports: ListTokenDialog. 
zerounbound/src/ui/MakeOfferDialog.jsx — make an offer; Imports: styledPkg,PixelInput,PixelButton; Exports: MakeOfferDialog
zerounbound/src/ui/Entrypoints/AcceptOffer.jsx — accept marketplace offer; Imports: OperationOverlay,feeEstimator; Exports: AcceptOffer
zerounbound/src/ui/Entrypoints/CancelListing.jsx — cancel listing; Imports: OperationOverlay,feeEstimator; Exports: CancelListing
zerounbound/src/ui/Entrypoints/CancelOffer.jsx — cancel pending offer(s); Imports: OperationOverlay,feeEstimator,marketplace; Exports: CancelOffer.
— entrypoints & admin —
zerounbound/src/ui/AdminTools.jsx — dynamic entry‑point modal; Exports: AdminTools
zerounbound/src/ui/OperationConfirmDialog.jsx — tx summary dialog; Exports: OperationConfirmDialog
zerounbound/src/ui/OperationOverlay.jsx — progress overlay; Exports: OperationOverlay
zerounbound/src/ui/ContractCarousels.jsx — live contract cards; Exports: ContractCarousels
zerounbound/src/ui/ContractMetaPanel.jsx — contract stats; Exports: ContractMetaPanel
zerounbound/src/ui/ContractMetaPanelContracts.jsx — banner panel on /contracts; Exports: ContractMetaPanelContracts
zerounbound/src/ui/DeployCollectionForm.jsx — collection deploy UI; Exports: DeployCollectionForm
zerounbound/src/ui/FullscreenModal.jsx — fullscreen viewer + pixel upscale; Exports: FullscreenModal
zerounbound/src/ui/EnableScripts.jsx — script‑consent components; Exports: EnableScriptsOverlay,EnableScriptsToggle
zerounbound/src/ui/MakeOfferBtn.jsx — XS make‑offer button; Exports: MakeOfferBtn

— Entrypoints (v4 & v4a) —
zerounbound/src/ui/Entrypoints/index.js — lazy EP resolver; Exports: resolveEp
zerounbound/src/ui/Entrypoints/AddRemoveCollaborator.jsx — collab mutator; Exports: AddRemoveCollaborator
zerounbound/src/ui/Entrypoints/AddRemoveCollaboratorsv4a.jsx — v4a bulk collab; Exports: AddRemoveCollaboratorsv4a
zerounbound/src/ui/Entrypoints/AddRemoveParentChild.jsx — relation manager; Exports: AddRemoveParentChild
zerounbound/src/ui/Entrypoints/AppendArtifactUri.jsx — slice uploader (I60); Exports: AppendArtifactUri
zerounbound/src/ui/Entrypoints/AppendExtraUri.jsx — extra media uploader; Exports: AppendExtraUri
zerounbound/src/ui/Entrypoints/BalanceOf.jsx — balance viewer; Exports: BalanceOf
zerounbound/src/ui/Entrypoints/Burn.jsx — burn token; Exports: Burn
zerounbound/src/ui/Entrypoints/BurnV4.jsx — burn v4a‑safe; Exports: BurnV4
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

╭── src/utils ────────────────────────────────────────────────────────────────╮
zerounbound/src/utils/chooseFastestRpc.js — RPC race chooser (deployTarget selectFastestRpc); Exports: chooseFastestRpc
zerounbound/src/utils/countAmount.js — count editions excluding burns; Exports: countAmount
zerounbound/src/utils/countOwners.js — distinct owner counter; Imports: net.js; Exports: countOwners
zerounbound/src/utils/countTokens.js — on‑chain token count; Imports: jFetch; Exports: countTokens
zerounbound/src/utils/decodeHexFields.js — hex→UTF‑8 deep repair; Exports: default
zerounbound/src/utils/formatAddress.js — tz/KT1 truncator + copy; Exports: shortKt,copyToClipboard
zerounbound/src/utils/getLedgerBalanceV2a.cjs — **v2a ledger fallback** (returns {balance,tokenId} and tries id±1); Exports: getLedgerBalanceV2a.

zerounbound/src/utils/hazards.js — detect nsfw/flashing/script flags; Exports: detectHazards
zerounbound/src/utils/listLiveTokenIds.js — TzKT id fetcher (TTL 30 s); Exports: listLiveTokenIds
zerounbound/src/utils/marketplaceListings.js — **listings aggregator** (active collections, bigmap fetchers); Exports: listings helpers.
zerounbound/src/utils/onChainValidator.js — fast FOC heuristic (I99); Exports: checkOnChainIntegrity
zerounbound/src/utils/pixelUpscale.js — css helpers for pixel‑art upscaling; Exports: pixelUpscaleStyle
zerounbound/src/utils/RenderMedia.jsx — data‑URI media viewer; Exports: RenderMedia
zerounbound/src/utils/resolveTezosDomain.js — reverse resolver; imports DOMAIN_CONTRACTS/FALLBACK_RPCS (I131); Exports: resolveTezosDomain
zerounbound/src/utils/sliceCache.js — localStorage cache (I60); Exports: saveSlice,loadSlice,purgeExpired
zerounbound/src/utils/sliceCacheV4a.js — v4a slice cache (I61); Exports: saveSliceCheckpoint,loadSliceCheckpoint,clearSliceCheckpoint,purgeExpiredSliceCache,strHash
zerounbound/src/utils/toNat.js — address→nat util; Exports: toNat
zerounbound/src/utils/uriHelpers.js — data‑URI helpers; Exports: ensureDataUri,getMime
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
zerounbound/summarized_files/master_bundle.txt — everything combined; Imports: ·; Exports: ·
zerounbound/summarized_files/render_media_bundle.txt — UI & media bundle; Imports: ·; Exports: ·
zerounbound/summarized_files/explore_bundle.txt — explore pages, listings utils, dialogs and helpers (contains marketplace dialogs, listings utils, MyTokens/Offers logic, and entrypoint wiring). 

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
explore_bundle.txt → explore + marketplace listings/dialogs/helpers

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

**Local development**
• **Default target:** mainnet (I132). deployTarget.js must export `const TARGET='mainnet'`.
• To switch network locally:
  yarn set:ghostnet   # writes TARGET='ghostnet'
  yarn dev:current    # runs on the selected target/port without resetting TARGET
  (Use yarn set:mainnet && yarn dev:current to return to mainnet.)
• Clearing local storage may be necessary after network switches to prevent stale data.

───────────────────────────────────────────────────────────────
7 · APPENDICES (How to read) — machine‑readables live in code
───────────────────────────────────────────────────────────────
A. hashMatrix.json — typeHashes used to label contract versions
and ensure back‑compat across loaders and UIs; includes v4e hash
`2058538150 → "v4e"`.

B. entrypointRegistry.json — canonical entrypoints per version,
including v4e as an `$extends` of v4 where applicable.

───────────────────────────────────────────────────────────────
CHANGELOG
───────────────────────────────────────────────────────────────
r1162 – 2025‑08‑11 UTC – **Sync manifest with full repo**: add missing
paths (MarketplaceBuyBar.jsx, TokenListingCard.jsx, marketplaceListings.js,
CancelOffer.jsx, getLedgerBalanceV2a.cjs, __tests__/v2aLedger.test.js, my/listings.jsx,
contracts/ContractFactory/CF deployed contract/v4e‑KT1Sadkk...); update
architecture to **v4e canonical**; add invariants I132–I134; enforce
**TARGET='mainnet'** default (I132); confirm listings & dialogs via
explore bundle and marketplace views. 

r1161 – 2025‑08‑01 UTC – Added DOMAIN_CONTRACTS & FALLBACK_RPCS exports in
deployTarget.js; updated resolveTezosDomain.js to import these, skip KT1
addresses and avoid 400 errors; added Invariant I131; updated source‑tree
map entries.

r1160 – 2025‑08‑01 UTC – Unified MyTokens minted/metadata filtering,
parsing JSON‑encoded creators and live‑balance filtering; added
Invariant I130; updated src/pages/my/tokens.jsx description.

<!-- End of file -->
/* What changed & why: Added missing files, set v4e canonical, added I132–I134,
   enforced TARGET='mainnet', synced listings/dialogs/utils with bundles. */ EOF
