/*
  Developed by @jams2blues “ ZeroContract Studio
  File:    docs/Master_Overview_And_Manifest_zerounbound_contractmanagement.md
  Rev :    r1205    2025 09 06 UTC
  Summary: Consolidated master (r1188r1203) + expansion. Merges prior addenda into
           this single manifest: Marketplace BUY hardening, seller listings
           coverage parity, TokenListingCard seeding, OperationOverlay cancel
           semantics, MAIN meta panel creators, Explore feed/auto load/burn
           hygiene, Share feature (dialog + snapshot + global bus), and
           r1203 deterministic slicing + IndexedDB slice cache + estimator.
           This file is exhaustive and append only; invariants restored and
           extended; source tree map expanded and alphabetised.
*/


ZERO UNBOUND v4e MASTER OVERVIEW & SOURCE FILE MANIFEST



WHAT IS THIS FILE? (unabridged)

This is the single source of truth for Zero Unbound. With a fresh clone
and this manifest, an engineer (human or AI) can rebuild the platform
from scratch. History is append only. When facts change, update/append;
do not delete.

Key themes (r1188 r1203):
- Explore feed + auto load with live balance hygiene and stable ordering.
- Marketplace BUY non blocking enablement and resilient lowest listing
  discovery via TzKT.
- Seller dashboard listings parity with Explore; multi source merge + stale guard.
- TokenListingCard seeding and OperationOverlay cancel semantics.
- MAIN token meta panel Creator(s) with Tezos Domains.
- Share feature: global bus, snapshot API, per token social cards.
- Deterministic slicing and IndexedDB slice checkpoints.


TABLE OF CONTENTS

0 · Global Rules & Meta Docs
1 · High Level Architecture
1·5 · Critical Entry Index
2 · Invariants (I00-I251)
3 · Reserved
4 · Source Tree Map (per file duties + imports/exports)
5 · Bundle Index
6 · Quick Start & CI Pipeline
7 · Appendices (Merged Addenda r1188r1203)
8 · Change Log (Progress Ledger)


0 · GLOBAL RULES & META DOCS

- Append only history; never delete. Normalize encoding to UTF 8.
- All HTTP uses `core/net.js` (`jFetch`) with concurrency limiter & back off.
- Single network divergence point: `src/config/deployTarget.js`.
- Docs set: keep only
   docs/AI_CUSTOM_INSTRUCTIONS.md
   docs/Master_Overview_And_Manifest_zerounbound_contractmanagement.md (this file)
   docs/TZIP_Compliance_Invariants_ZeroContract_V4.md


1 · HIGH LEVEL ARCHITECTURE & DATA FLOW

React 18 + styled components 6  WalletContext (Taquito + Beacon) 
DeployTarget (network/env)  Core (marketplace, slicing, fee estimator,
net, discovery)  UI (pages/components)  TzKT + RPC.

Recent addenda integration (r1188r1203):
- Explore feed & auto load: static + live aggregator + single constrained
  TzKT burst; burn hygiene via `listLiveTokenIds`; stable ordering.
- Marketplace BUY: TzKT fallback for token detail lowest listing; non blocking
  freshness probe; partial stock safe seller balance check.
- Seller dashboard listings: view + seller_listings + direct big map filter by
  seller + per collection scan; de dupe and stale guard; seed cards.
- OperationOverlay: progress uses `onCancel`; success Close clears caches + reload;
  legacy `label` alias.
- TokenListingCard: `initialListing` (seller, nonce, amount, priceMutez) + 15s polling;
  creator links to `/u/<tz>`.
- MAINTokenMetaPanel: Creator(s) with Tezos Domains; tz  `/u`; KT1  `/contracts`.
- Share feature: ShareDialog + global `zu:openShare` + `/api/snapshot` + social meta.
- Slicing r1203: deterministic slicer (I55 headroom) + IndexedDB slice cache
  and estimator signature prediction.


1·5 · CRITICAL ENTRY INDEX (by feature)

- Marketplace (core): `src/core/marketplace.js`, `src/core/marketplaceHelper.js`
- Marketplace (utils): `src/utils/marketplaceListings.js`
- Detail Buy UI: `src/ui/MarketplaceBar.jsx`, `src/ui/BuyDialog.jsx`
- Listing Cards: `src/ui/TokenListingCard.jsx`
- Dashboard (seller): `src/pages/u/[address].jsx`
- Explore Listings: `src/pages/explore/listings/index.jsx`
- Share: `src/ui/ShareDialog.jsx`, `/api/snapshot/[addr]/[tokenId]`, `/api/handle/[address]`
- Slicing/Estimator: `src/core/slicing.js`, `src/core/feeEstimator.js`,
  `src/utils/sliceCache.js`, `src/utils/sliceCacheV4a.js`


2 · INVARIANTS (I00 “ I250)

General/UI/Net (legacy)
I00 [F] 8 bit retro theme everywhere; fully responsive from ‰¤320px to ‰¥8K.
I01 [C] One canonical on chain record per contract instance.
I02 [E] Engine †” Chain parity within two blocks.
I03 [F,C] Role based ACL (admin/owner/collaborator).
I04 [C] Contract terms immutable once locked.
I05 [E] All mutating ops emit an audit row and chain event.
I06 [F] Mobile first; no sideways scroll ‰¤320px.
I07 [F] LCP ‰¤2s (P95 mid range Android).
I08 [F] Consent & theme persist per wallet via IndexedDB.
I09 [F] PWA offline shell (‰¤5MiB cache; Workbox 7).
I10 [E] `deployTarget.js` is the single divergence point.
I11 [I] Case sensitive path guard in CI.
I12 [C] `hashMatrix.json` = SHA 1  version (append only).
I13 [C] `entrypointRegistry.json` is append only.
I14 [I] `bundle.config.json` globs mirror Manifest §5.
I15 [E] Engine pods are stateless.
I16 [E] Jest coverage ‰¥90%.
I17 [E] (retired) Legacy 3M block back scan.
I18 [E] RPC fail over after 5 errors.
I19 [F] SSR safe: hooks never touch `window` during render.
I20 [F] Exactly one `document.js`.
I21 [I] Corepack pins Yarn 4.9.1.
I22 [F] ESLint bans em dash.
I23 [F] styled components factory import invariant.
I24 [F] Media are `data:` URIs; no IPFS.
I25 [F] SVG canvas square & centered.
I26 [F] JS chunk ‰¤32,768B; total ‰¤2MiB.
I27 [I] Monotonic Rev ID ledger.
I28 [I] No path case duplicates.
I29 [I] CI tests Node 20 + 22.
I30 [F] `useWallet` alias until v5.
I31 [E] Off chain templates carry MD 5 checksum.
I32 [I] No `.env` secrets committed.
I33 [C] Registries immutable (append only).
I34 [F] All colours via CSS vars.
I35 [F] Transient styled components props filtered.
I36 [F] ESLint no multi spaces passes.
I37 [C] TZIP 04/12/16 compliance (see companion doc).
I38 [C] Metadata stored in `tezos storage:content`.
I39 [C] Interfaces array de duplicated pre storage.
I40 [E,F] Single HTTP source ” all fetch via `core/net.js` (`jFetch`).
I41 [F] Central `RenderMedia` pipeline enforced.
I42 [F] Per EP Overlay UX ” one modal per AdminTools action.
I43 [E] `jFetch` concurrency limit = 4; exponential 429 back off.
I44 [F] Header publishes real height via `--hdr`; layout obeys.
I45 [F] Single global scroll region; inner comps never spawn scrollbars.
I46 [F] DOM mutating effects use iso layout effect when SSR possible.
I47 [F] Backgrounds ‰¤4% CPU @60fps (low end devices).
I48 [F] Animated backgrounds idle ‰¤4% CPU on low end mobiles.
I49 [F,C] Token metadata arrays/objects JSON encode exactly once then hex wrap.
I50 [F] Royalty UI cap ‰¤25% (basis points stored).
I51 [F,C] `authoraddress` omitted when blank.
I52 [F] Tezos validators accept tz1“tz4 and KT1.
I53 [F,C] (dup of I49) JSON encode once  hex wrap.
I54 [F] Mint must query `next_token_id` dynamically.
I55 [F] Slice size headroom ‰¥1,024B.
I56 [F] Oversize mint prompts upfront Snackbar warning.
I57 [F] WalletContext delays BeaconWallet construction.
I58 [F] Reveal action uses explicit 1 mutez transfer.
I59 [F] Silent session restore on mount.
I60 [F,E] Resumable slice uploads (Mint/Append/Repair).
I61 [F] Slice cache hygiene & expiry (purge rules).
I62 [F] Busy select spinner.
I63 [I] Single repo target switch (`scripts/setTarget.js`).
I64 [F] Wheel tunnel modals.
I65 [F] Immediate busy indicators (superseded by I76).
I66 [F] Empty collection grace.
I67 [F,E] Filter destroyed/burn balances.
I68 [E] `listLiveTokenIds` TTL 30s (legacy; superseded by I226).
I69 [F] Carousels auto refresh on `zu_cache_flush`.
I70 [I] Destroy/Burn dispatches `zu_cache_flush`.
I71 [F] Copy address UX via PixelButton.
I72 [F] RenderMedia download fallback.
I73 [F] Relationship micro stats on TokenMetaPanel.
I74 [F,E] Chunk safe estimator batches ‰¤8 ops.
I75 [F] v4a entrypoint guards.
I76 [F] Inline busy overrides.
I77 [F] Relationship aware disable for destructive EPs.
I78 [F] SVG pixel integrity via sandbox.
I79 [F] Header copy clipboard reachable ‰¤320px & ‰¥8K.
I80 [F] Carousel arrows live inside container.
I81 [F] Mint tag input auto chips.
I82 [F] Form values persist across navigation.
I83 [F] Modal Close button remains within modal bounds.
I84 [F] Unicode & emoji accepted (full UTF 8 except C0/C1).
I85 [F] Single `feeEstimator.js` source of truth”no duplicates.
I86 [F] HelpBox Standard across entry points.
I87 [F] Live JSON validation; CTAs disabled until valid.
I88 [I] ESLint `no local estimator` rule enforced.
I89 [F,E] v4a slice batch storageLimit computed per payload.
I90 [F] All sleeps via `sleepV4a.js`.
I91 [F,E] Shared ledger wait logic in v4a flows.
I92 [F] MintV4a waits only after first slice.
I93 [F] OperationOverlay fun lines scroll spec.
I94 [F] AdminTools header count rules.
I95 [F] v4a collections warn banner.
I96 [F] OperationOverlay fun lines colour via `--zu accent`.
I97 [F] OperationOverlay Close triggers page reload.
I98 [F] Origination CloseBtn top right escape obeys I83.
I99 [F] Every upload runs through `onChainValidator.js`.
I100 [F] `SAFE_REMOTE_RE` allow list ” C0 only / C1 allowed.
I101 [F] Mature/Flashing flags irreversible once set.
I102 [F] Responsive EP & Meta panel blueprint (grid spec).
I103 [F] Read only legacy alias `artists`  `authors`.
I104 [F,C] Contract metadata must include `symbol` (3“5 A Z/0 9).
I105 [F] Explore grid uniform (auto fill col clamp).
I106 [F] Script hazard consent sandboxing model.
I107 [F] Hex field UTF 8 repair via `decodeHexFields.js`.
I108 [F] Token ID filter UX on contract pages.
I109 [F,E] Live on chain stats via `countTokens/countOwners`.
I110 [F] Integrity badge standardisation.
I111 [F,C,E,I] Avoid the word œglobal in comments/summaries.
I112 [F,E] Marketplace dialogs must use `feeEstimator.js` + OperationOverlay.
I113 [F] Unified consent management via `useConsent` hook.
I114 [F] Portal based draggable preview windows (SSR safe).
I115 [F] Hazard detection & content protection (nsfw/flashing/scripts).
I116 [F] Debounced form state pattern; id/index pattern.
I117 [F] Script security model”consent & address scoped toggles.
I118 [retired] Dual Stage origination (removed).
I119 [F] Remote domain patterns are case sensitive; allow list only (see I100).
I120 [F] Dev scripts propagate selected network into runtime/build.
I121 [F] TzKT API bases must include `/v1` (normalized once).
I122 [F] Token meta panels must decode collection metadata fully.
I123 [F,E] Marketplace actions wire to ZeroSum helpers & dialogs.
I124 [E,F] Concurrent Ghostnet/Mainnet via `yarn set:<network>` + `dev:current`.
I125 [F] /explore/listings shows live ZeroSum listings using helper fns.
I126 [F,C] Factory parameter contains only ordered metadata bytes.
I127 [F] Deploy pages inject full views array on origination.
I128 [F] Listings/my pages derive TzKT bases via `deployTarget.js`.
I129 [F,E] MyTokens minted/metadata discovery & live balance filter.
I130 [F] MyTokens guard ” typeHash set & burn only exclusion.
I131 [F] Domain resolution env ” skip KT1; import DOMAIN_CONTRACTS/FALLBACK_RPCS.
I132 [I] TARGET default is mainnet.
I133 [C,F,E] Canonical contract version v4e; back compat via `hashMatrix`.
I134 [F,E] Listings aggregation uses `marketplaceListings.js`.
I135 [F] IndexedDB cache is sole persistence for discovery/carousels.
I136 [F,E] Unified contract discovery in `utils/contractDiscovery.js`.
I137 [F,C] Allowed type hash set exported from `utils/allowedHashes.js`.
I138 [F] Parity: carousels and /my/collections show same contract set.
I139 [F] tzktBase returns `/v1`; do not append twice.
I140 [F] ExploreNav is mandatory on explore/* and my/*.
I141 [F] CollectionCard accepts string KT1 or object {address,¦}.
I142 [F] Batch resilience ” per batch validation; failures skipped.
I143 [F,E] `jFetch` budget ‰¤6 concurrent; limiter default = 4.
I144 [F] Network awareness ” derive net from toolkit or TARGET; never hard code.
I145 [F] No stray sentinels (e.g., œEOF) inside JS/JSX.
I146 [F] Admin only visibility ” /my/collections may show WIP/empty.
I147 [F] Sort order default lastActivityTime desc; tie break address asc.
I148 [E,F] Stale listing guard via TzKT `/v1/tokens/balances`; throw `STALE_LISTING_NO_BALANCE` when insufficient.
I149 [E] TzKT query shape: use `account` (or `account.address` tolerated); `select=balance`.
I150 [F] Listings grid hygiene: valid preview, non zero totalSupply, dedupe by `contract|tokenId`.
I151 [F] Transient props must use `$prop` or be filtered.
I152 [F,E] tzktBase returns `/v1`; never append again.

New invariants (r1188r1203), appended contiguously
Explore feed & auto load
I153 [F] Sort newest by `firstTime` desc; tie break (contract asc, tokenId desc).
I154 [F] After each burst, prune tokens for validated contracts absent from live id set.
I155 [E] Aggregator accepts `tezos storage:` and prefers `contract.in` with a 2 minute cache.
I156 [E] Generator derives `contract.in` via `/v1/contracts?typeHash.in=<hashMatrix>`.
I157 [I] CI cadence 5 min; `FEED_PAGE_SIZE=120`; mainnet 200 pages; ghostnet 100 pages.
I158 [F] Coverage strategy: one live burst; if empty, one constrained TzKT burst; then end.
I159 [F] /explore/tokens auto paginates until end=true (generic mode); manual Load More remains fallback.
I160 [F] Keep next batch tokens only if present in the live id set for their contract.
I161 [F] After validation, prune previously rendered tokens for validated contracts not in the live set.
I162 [F] Dedupe key `${contract}:${tokenId}` uses trimmed contract and numeric tokenId.
I163 [E] `listLiveTokenIds` caches results for 60s per (network, contract).
I164 [F] Auto pagination burst targets: 24 initial, 24 subsequent; respect budgets.

Marketplace BUY & listings
I165 [F] BUY enablement is non blocking; only a confirmed zero seller balance disables it.
I166 [E] Seller stock guard uses TzKT `/v1/tokens/balances` with `select=account,balance` and compares `balance ‰¥ 1` unless an op requires more.
I167 [F] Token detail lowest listing falls back to TzKT collection listings when views are absent; choose the lowest price.
I168 [F] TokenListingCard supports `initialListing` and remains functional without it; polling cadence 15s.
I169 [F] Creator links: tz  `/u/<tz>`; KT1  `/contracts/<KT1>`; non addresses are plain text.
I170 [F] OperationOverlay progress uses `onCancel`; success Close clears caches + reload; `label` alias is accepted.
I171 [F] Seller dashboard listings merge sources: on chain view + seller_listings + direct big map seller filter + per collection scan; de dupe by `(contract|tokenId|seller|nonce)`.
I172 [F] Seller dashboard stale filter is partial stock safe (‰¥1), matching Explore.
I173 [F] Fallback collection discovery must not depend on `/contracts/<KT1>/metadata`; tolerate heterogeneous key/value shapes.
I174 [F] Preview gating accepts `data:` and `tezos storage:` and requires non zero totalSupply + hazard pass.

Share feature
I175 [F] Global share bus `zu:openShare` opens ShareDialog; payload `{ contract, tokenId, variant, url?, previewUri? }`.
I176 [E] Per token Open Graph/Twitter meta tags refer to canonical token URL and `/api/snapshot/...` image.
I177 [E] Snapshot API normalises URIs (ipfshttps), converts to PNG, sets `s maxage=86400; stale while revalidate=43200`.
I178 [F] ShareDialog contains no scripts; only images; pixelated scaling; keyboard accessible.
I179 [E] Handle API caches ‰¥10 min and falls back gracefully to shortened tz.

Slicing + IndexedDB cache
I180 [E] Slice checkpoints persist in IndexedDB; legacy LocalStorage migrated once then disabled.
I181 [E] Slicer enforces ‰¥1,024B headroom and deterministic parts; estimator predicts signature count accurately.
I182 [F] Entrypoints display predicted slices/signatures and resume from IDB checkpoints without data loss.

Gap consolidation (I183“I245) ” platform rules made explicit
I183 [F] Admin filter deep link: `/explore/listings?admin=<tz>` must filter by seller (case insensitive compare on address).
I184 [F] Explore & listings grids accept `tezos-storage:` metadata pointers in addition to `data:` URIs for previews (post decode when hex wrapped).
I185 [F] Preview selection skips obvious HTML for list/grid previews; HTML is allowed only for fullscreen/FS artifact viewing, gated by scripts consent.
I186 [F] Listing œCancel affordance renders only when (a) the connected wallet is the lowest listing seller, (b) the wallet has any listing for the token, or (c) the context is `/my/listings`.
I187 [F] BUY button on listing cards requires a connected wallet; dialog handles preflight and errors; disabled when wallet is not connected or wallet is the seller.
I188 [F] Token details MarketplaceBar displays price label next to BUY when a lowest listing exists; label hides when no listing is available.
I189 [E] tzktBase helpers always return a `/v1` base and must be reused; callers must not append `/v1` a second time.
I190 [F] Tezos Domain resolution is best effort and non blocking; always fall back to `shortAddr` when unavailable; must not block rendering.
I191 [F] Creator/Author fields accept arrays, objects, or JSON encoded strings and are normalised to arrays for display/links.
I192 [F] Post purchase, BuyDialog dispatches `zu:openShare` with variant `purchase` after confirmation; handler opens ShareDialog prefilled.
I193 [E] Snapshot API uses long cache headers (`s maxage=86400`, `stale while revalidate=43200`) and falls back to `public/sprites/Banner.png` when it cannot render a snapshot.
I194 [E] History burn detection is token strict and hash aware; resolve burn events only by scanning token filtered transfers by `hash`.
I195 [E] OBJKT fallback queries use `hash.in` when correlating sales to avoid HTTP 400; never exceed the upstream limit for `hash.in` lists.
I196 [F] OperationOverlay locks mouse wheel within panel (useWheelTunnel) while open.
I197 [F] OperationOverlay exposes a Copy button on success (copies KT1/opHash).
I198 [F] OperationOverlay success Close clears service workers and HTTP caches before reloading to avoid stale UI.
I199 [E] Slice checkpoints and resume data reside only in IndexedDB; TTL/GC policies must be enforced and documented in the cache helper.
I200 [F] Navigation overlay on cards activates only for embedded HTML/SVG when scripts are allowed; clicks on media controls must never trigger navigation.
I201 [F] Media control detection uses a bottom band heuristic and prevents navigation when click targets control areas for `<video>`/`<audio>`.
I202 [F] Prices render via `formatMutez` using six fractional digits minimum (no rounding that hides precision); thousands separators localised.
I203 [F] Listing grids seed `initialListing` to enable BUY immediately; BuyDialog validates with preflight; listing pages must not block on network errors.
I204 [E] Lowest listing/query helpers accept both signatures: object params `{ toolkit, nftContract, tokenId }` and positional `(toolkit, { ... })` for back compat.
I205 [E] `listActiveCollections` tolerates both `collection_listings` and `listings` index names and resolves pointers dynamically via TzKT.
I206 [E] Big map readers must tolerate nested shapes: maps of nonces, arrays, and nested `token` structures; use a walker to extract listing objects.
I207 [E] Minted date and counts derive from TzKT (`firstTime`, totals) and helper counters (`countTokens`, `countOwners`, `countAmount`) only”never compute ad hoc in components.
I208 [E] ListTokenDialog ensures operator rights (update_operators) within the listing batch when required and performs early validations; errors must surface via Snackbar.
I209 [C] TZIP metadata compliance: `symbol` is enforced (3“5 A Z/0 9); hex encoded JSON is decoded before storage; interfaces array de duplicated.
I210 [E] `idbCache.js` is the only generic cache utility alongside slice caches; TTL defaults ‰¥ 60 s; callers must pass explicit TTL when stricter timing is required.
I211 [F] Dedupe keys in listings/tokens grids are always `${contract}|${tokenId}` (string contract, numeric tokenId); key reuse across pages is intentional.
I212 [E] `fetchSellerListingsViaTzkt` groups by `(kt,id)` and aggregates nonces; requests to listing maps are minimised per group.
I213 [F] When multiple seller rows exist per tokenId, choose the lowest price; admin filtered views keep per seller pricing without mixing sellers.
I214 [E] Balance checks chunk `account.in` up to 50 sellers per request on `/v1/tokens/balances` and read `account,balance` for cross shape compatibility.
I215 [E] Network detection derives from `toolkit._network.type` (mainnet test) or `NETWORK_KEY`; avoid hard coding network strings.
I216 [F] Listings grids page by increments of 24; œLoad More adds 24 items per activation by default.
I217 [F] Creator links route to `/u/<tz>` (not the legacy explore admin filter); KT1 values route to `/contracts/<KT1>`.
I218 [F] Enabling scripts requires explicit acknowledgement via a checkbox in the confirm dialog; the decision is remembered per token via consent keys.
I219 [F] All overlays that present progress must pass `onCancel` (not `onClose`); Cancel always closes the overlay immediately and returns control to the dialog.
I220 [F] CancelListing dialog uses `onCancel` for overlays; cancel actions never leave a zombie overlay.
I221 [F] MakeOffer flow uses `onCancel` for overlays and preserves entered values when cancelled.
I222 [F] /explore/tokens auto pagination continues until end=true (generic explore mode); manual control remains available.
I223 [F] Next batch tokens are kept only if present in the live id set (per contract validation using `listLiveTokenIds`).
I224 [F] After validation, previously rendered tokens are pruned for validated contracts when not present in their live id set.
I225 [F] Dedupe key is `${contract}:${tokenId}` with contract normalised (trimmed) and `tokenId` coerced to number.
I226 [E] `listLiveTokenIds` caches results for 60 seconds per (network, contract) to reduce redundant scans when auto loading.
I227 [F] Auto pagination burst sizes target 24 items initially and for subsequent bursts; budgets and gating rules are honoured.
I228 [F] BUY enablement is non blocking; only confirmed zero balance disables it.
I229 [E] Seller stock guard uses `/v1/tokens/balances` (select `account,balance`) and compares `balance ‰¥ 1` unless op requires more.
I230 [F] Token detail fallback uses collection listings via TzKT big maps to compute the lowest price when views are absent.
I231 [F] TokenListingCard supports `initialListing` and remains functional without it; polling cadence 15 s.
I232 [F] Creator links: tz  `/u/<tz>`; KT1  `/contracts/<KT1>`; non addresses render as text.
I233 [F] OperationOverlay progress uses `onCancel`; success Close clears caches and reloads; `label` accepted as alias for `status`.
I234 [F] Seller dashboard listings merge view + seller index + direct big map filter by seller + per collection scan; de dupe `(contract|tokenId|seller|nonce)`.
I235 [F] Seller dashboard stale filter is partial stock safe (‰¥1), matching Explore.
I236 [F] Fallback collection discovery must not depend on `/contracts/<KT1>/metadata`; tolerate heterogeneous keys/values.
I237 [F] Preview gating accepts `data:` and `tezos storage:`; require non zero `totalSupply` and hazard pass.
I238 [F] Global share bus `zu:openShare` opens ShareDialog; payload `{ contract, tokenId, variant, url?, previewUri? }`.
I239 [E] Per token OG/Twitter meta tags refer to canonical token URL and `/api/snapshot/...` image.
I240 [E] Snapshot API normalises URIs (ipfshttps), converts to PNG, and sets `s maxage=86400; stale while revalidate=43200`.
I241 [F] ShareDialog contains no scripts; images only; pixelated scaling; keyboard accessible.
I242 [E] Handle API caches ‰¥10 min; missing alias falls back to `shortAddr`.
I243 [E] Slice checkpoints persist in IndexedDB; legacy LocalStorage migrated once then disabled.
I244 [E] Slicer enforces ‰¥1,024 B headroom and deterministic parts; estimator predicts signature count.
I245 [F] Entrypoints display predicted slices/signatures and resume from IDB checkpoints without data loss.

Documentation & Manifest discipline
I246 [I] docs/ contains only three markdowns: AI_CUSTOM_INSTRUCTIONS.md, Master_Overview_And_Manifest_zerounbound_contractmanagement.md, TZIP_Compliance_Invariants_ZeroContract_V4.md. Any addendum is merged into the master and then removed.
I247 [I] Source Tree Map entries are alphabetised and follow the format: "path ” description; Imports; Exports" (exports at least the top level symbol names or "default component").
I248 [I] All paths documented are case sensitive and must match the repository exactly.
I249 [I] Manifest remains UTF 8 and append only; each revision updates Rev/id/date/summary and appends a Change Log entry.
I250 [I] Each revision maintains a progress ledger (files touched, features fixed/added, invariants appended, removed files, etc.).


3 · RESERVED



4 · SOURCE TREE MAP (FILES & RESPONSIBILITIES)

root/
- .github/workflows/explore-feed.yml ” Explore static feed generator (cron).
- .github/ci.yml ” CI (lint/tests/build/encoding guards).
- AGENTS.md ” AI collaboration protocols.
- bundle.config.json ” Bundle grouping (kept in sync with §5).
- config.toml ” Site build/runtime toggles.
- jest.config.cjs, jest.setup.js ” Test harness.
- next.config.js ” Next.js build config (images/headers/etc.).

contracts/
- Zero_Contract_v4e.tz ” Canonical contract source (v4e).
- LegacyZeroContractVersions/** ” Archived Michelson sources (v1“v4b).
- EntrypointsReference/** ” Human readable entrypoint call shapes per version.
- StorageReference/** ” Storage schemas per version and marketplace.
- Marketplace/** ” ZeroSum marketplace contract + views JSON.

public/
- fonts/Pixeloid*.ttf ” Pixel fonts (theme).  sprites/*.png|svg ” UI sprites & banners.
- embla-left.svg, embla-right.svg ” Carousel arrows.

scripts/
- exploreFeed.mjs ” Static feed generator; respects FEED_PAGE_SIZE.
- generateBundles.js ” Uses bundle.config.json to emit bundles.
- ensureDevManifest.js, setTarget.js, startDev.js ” Dev bootstrapping.
- tzkt_tokens_diag.mjs ” Diagnostics for TzKT token queries.

styles/
- globalStyles.js ” Theme + CSS variables.
- palettes.json ” Theme palettes.
- preview-1x1.css ” Media preview sizing.

workers/
- originate.worker.js ” Off main thread origination helper (when used).

ui/
- AdminTools.jsx ” Admin actions panel (dangerous ops; guarded).
- BuyDialog.jsx ” Buy flow; OperationOverlay; preflight.
- CollectionCard.jsx ” Collection tile; counts & link.
- ContractCarousels.jsx ” Contract carousels with live refresh.
- ContractMetaPanel.jsx / ContractMetaPanelContracts.jsx ” Contract details.
- EnableScripts.jsx ” Consent toggle component.
- ExploreNav.jsx ” Explore toolbar with admin filter; routing helpers.
- FiltersPanel.jsx ” Filter controls for explore.
- FullscreenModal.jsx ” Artifact viewer with hazards gating.
- GlobalSnackbar.jsx ” App level snack/toast bus.
- Header.jsx ” Top bar; network indicator; dashboard link.
- IntegrityBadge.jsx ” On chain integrity indicator.
- Layout.jsx ” Page chrome; header height CSS var.
- ListTokenDialog.jsx ” Listing flow (dialog entrypoint).
- LoadingSpinner.jsx ” Spinner.
- MAINTokenMetaPanel.jsx ” Token meta; Creator(s); marketplace bar.
- MakeOfferBtn.jsx / MakeOfferDialog.jsx ” Offer flow.
- MarketplaceBar.jsx ” Buy/List/Offer/Cancel; TzKT fallback; non blocking freshness.
- MarketplaceBuyBar.jsx ” Legacy/aux marketplace bar.
- OperationConfirmDialog.jsx ” Pre op confirm with slices/fees.
- OperationOverlay.jsx ” Progress (onCancel) + Success (cache clear + reload).
- Pixel* components ” Buttons, inputs, headings; theme consistent.
- ProfileLink.jsx ” Link to /u/<address>.
- ShareDialog.jsx ” Global share modal (zu:openShare).
- ThemeToggle.jsx ” Theme switch.
- TokenCard.jsx ” Explore token card (non listing).
- TokenDetailsTabs.jsx ” Tabs on token page.
- TokenIdSelect.jsx ” Contract token picker.
- TokenListingCard.jsx ” Listing card; `initialListing` seed; cancel affordance.
- WalletNotice.jsx ” Wallet connection requirements.
- ZerosBackground.jsx ” Animated background with performance guards.

pages/
- _app.js, _document.js ” App shell; global providers; meta.
- index.js ” Landing.
- terms.js ” Terms.
- manage.js ” Manage collections dashboard.
- deploy.js ” Deploy collection; OperationOverlay.
- contracts/[addr].jsx ” Contract details (tokens, stats, filters).
- tokens/[addr]/[tokenId].jsx ” Token details page.
- explore/[[...filter]].jsx ” Explore tokens (feed + live merge + auto load).
- explore/collections.jsx ” Explore collections.
- explore/secondary.jsx ” Secondary views (offers/trades as applicable).
- explore/listings/index.jsx ” Active listings grid; admin filter; data/tezos storage previews.
- my/collections.jsx ” Wallet collections.
- my/listings.jsx ” Wallet listings grid; seeded cards.
- my/offers.jsx ” Offers by wallet.
- my/tokens.jsx ” Wallet tokens grid.
- u/[address].jsx ” Seller dashboard (tabs: Collections, Tokens, Listings).
- api/explore/feed.js ” Live aggregator API for explore feed.
- api/explore/static/[net]/meta.js ” Static meta endpoint.
- api/explore/static/[net]/[page].js ” Static page endpoint.
- api/handle/[address].js ” Artist handle/alias resolver (Objkt GraphQL).
- api/objkt/trades.js ” Objkt trade history proxy.
- api/snapshot/[addr]/[tokenId].js ” Social snapshot PNG.

core/
- batch.js / batchV4a.js ” Batch helpers (by version).
- feeEstimator.js ” Gas/fee + slice/signature prediction.
- marketplace.js ” Unified marketplace API; views + fallbacks + guards.
- marketplaceHelper.js ” Seller/collection helpers via TzKT.
- net.js ” `jFetch` with limiter/back off; global settings.
- slicing.js ” Deterministic slicer with headroom (I55).
- validator.js ” On chain metadata validation utilities.
- zeroSumViews.js ” On chain view wrappers (param shape tolerance).

utils/
- allowedHashes.js ” Allowed type hash set & helpers; Exports: getAllowedTypeHashSet, getAllowedTypeHashList, typeHashToVersion, ALLOWED_HASHES.
- cache.js ” Simple in memory caches for runtime.
- chooseFastestRpc.js ” RPC race util.
- computeTokenTotal.js ” Sum helpers for counts.
- contractDiscovery.js ” Unified ZeroContract discovery.
- contractMeta.js ” Contract level TZIP 16 metadata helpers.
- countAmount.js / countOwners.js / countTokens.js ” Counters.
- decodeHexFields.js ” Hex field UTF 8 repair.
- extraUris.js ” Extra URI parsing helpers.
- formatAddress.js ” shortAddr/shortKt, etc.
- formatTez.js ” formatMutez/tez helpers.
- getLedgerBalanceV2a.cjs ” Legacy balance util.
- hazards.js ” NSFW/flashing/scripts detection.
- historyEvents.js ” Token history normalization & burn detection.
- idbCache.js ” IndexedDB cache wrapper (general; distinct from slice caches).
- listLiveTokenIds.js ” Contract live ids with TTL.
- marketplaceListings.js ” Big map walkers; listActiveCollections + per collection listings.
- navigationRecovery.js ” Restore navigation state after reloads.
- onChainValidator.js ” TZIP 16 field validation for uploads.
- pixelUpscale.js ” Utility for pixelated rendering.
- rarity.js ” Rarity computation helpers.
- RenderMedia.jsx ” Media renderer with hazards model.
- resolveTezosDomain.js ” Tezos Domains resolve/use hook.
- sliceCache.js / sliceCacheV4a.js ” IDB slice checkpoint stores.
- toNat.js ” Natural number converter.
- tzkt.js ” TzKT base & contract batches.
- uriHelpers.js ” URI normalization.
- useIsoLayoutEffect.js ” SSR safe layout effect.
- useWheelTunnel.js ” Wheel lock hook for modals.


5 · BUNDLE INDEX

Entrypoints, marketplace, slicing, share, and discovery utilities are bundled
per Next.js pages with tree shaken imports. No binary artefacts are embedded.


6 · QUICK START & CI PIPELINE

- `yarn` then `yarn dev` with TARGET env (mainnet/ghostnet). Corepack pins Yarn.
- CI validates Node 20 & 22, ESLint, and minimal smoke tests; Explore feed
  cron every 5 minutes generates/serves static slices.


7 · APPENDICES (MERGED ADDENDA r1188r1203)

- Explore Feed r1188 / Auto Load r1189 / Final Explore Hardening r1190 ”
  generator + aggregator; live balance hygiene; ordering; auto load; TTL 60s.
- Marketplace BUY & Listings Hardening r1191“r1193 ” token detail fallback,
  non blocking BUY, seller dashboard parity, initialListing seeding, overlay
  cancel, MAIN creators.
- Patch r1203 ” Deterministic Slicing & IDB Cache ” IDB checkpoints; slicer
  with headroom; estimator signatures; UI displays slices/signatures.
- Share Feature ” Dialog + Snapshot + Global Bus ” share bus event;
  snapshot API; per token social meta; accessibility rules.


8 · CHANGE LOG (PROGRESS LEDGER)

- r1188 ” User Dashboard & Listing UX
- r1189 ” Auto Load (Explore)
- r1190 ” Final Explore Hardening
- r1191 ” Marketplace BUY & Listings Hardening
- r1192 ” Seller Dashboard Coverage Parity
- r1193 ” MAIN Token Meta Panel Creator(s)
- r1203 ” Deterministic Slicing + IDB Slice Cache + Estimator
- r1204 ” Consolidated manifest; merged addenda; legacy docs removed
- r1205 ” Expanded invariants (restored I86“I152); filled I183“I245; extended source tree map (repo/scripts/assets/workers/pages/utils); confirmed docs set limited to three markdowns

/* EOF */

## Addendum r1206 - 2025-09-07 UTC

Summary: Dashboard BUY parity with Explore; resilient listing nonce resolution when opening BuyDialog from profile listings. Fixed malformed import/newline artifacts in BuyDialog. Added Explore-parity fallback via collection_listings. Share dialog now falls back to site banner image when snapshot preview fails (e.g., animated SVG without raster).

### New Invariants (I246–I251)
- I246 [F]: BuyDialog must resolve a canonical (seller, nonce, price) before preflight. Resolution order: robust seller scan via collection_listings holder -> direct holder scan -> on-chain view via TzKT -> seller_index -> collection_listings (Explore parity) -> global active listing (any seller).
- I247 [F]: Dashboard listings must use the same nonce source as Explore (collection_listings) when needed, preventing nonce=0 on BUY.
- I248 [F]: ShareDialog preview must display a fallback image when snapshot generation fails; use /sprites/Banner.png.
- I249 [I]: Source files must not contain literal "\n" escape sequences in code; use real newlines. Build must be UTF-8 clean.
- I250 [I]: Imports for market helpers must be explicit and ordered; BuyDialog imports listListingsForCollectionViaBigmap from src/utils/marketplaceListings.js.
 - I251 [I]: Encoding/ASCII discipline for code and docs. Do not introduce non‑ASCII punctuation or odd glyphs (e.g., smart quotes, em/en dashes, CP1252 artifacts, box‑drawing characters) into source files or the manifest. Use plain ASCII equivalents (', ", -, ->) and ensure files are UTF‑8 encoded with real newlines (no literal "\n"). PRs that add such glyphs must be rejected or normalized before merge. Exceptions: binary assets and SVG/media content.

### Source-Tree Map (deltas)
- src/ui/BuyDialog.jsx - Buy dialog; imports marketplace helpers and collection_listings fallback; logs debug lines; builds params; (Imports: marketplace.js, marketplaceHelper.js, marketplaceListings.js, deployTarget.js, formatTez.js; Exports: default component).
- src/ui/ShareDialog.jsx - Share modal; adds <img onError> fallback to Banner.png (Imports: deployTarget.js; Exports: default component).
- src/ui/TokenListingCard.jsx - Listing tile; preserves r1245 behavior; JIT canonicalization before opening BUY may consult robust seller resolver when expectedSeller is present (Imports unchanged; Exports: default component).

### Change Log (r1206)
- Fixed dashboard BUY failing with “could not resolve a valid listing nonce” by adding Explore-parity fallback (collection_listings via TzKT) to BuyDialog and preserving robust seller-first resolution.
- Corrected malformed import/newline artifact in BuyDialog that previously caused a parse error.
- Hardened ShareDialog preview to display fallback when snapshot rendering fails.

### Progress Ledger (r1206)
- Files touched: src/ui/BuyDialog.jsx, src/ui/ShareDialog.jsx (safe edits); src/ui/TokenListingCard.jsx (imports/logic parity retained as per r1245).
- Added invariants I246-I250; no removals of prior history.
- Verified UTF-8 integrity and removed stray literal "\n" artifacts.
- Added I251 (ASCII/UTF‑8 discipline) and aligned AGENTS.md with a concrete agent rule to prevent odd glyphs.
- No API surface changes; Explore behavior unchanged; Dashboard BUY now mirrors Explore.



