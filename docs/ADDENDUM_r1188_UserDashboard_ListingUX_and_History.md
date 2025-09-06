/*─────────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    docs/ADDENDUM_r1188_UserDashboard_ListingUX_and_History.md
  Rev :    r1188    2025‑09‑05 UTC
  Summary: Addendum to Master_Overview_And_Manifest_zerounbound_contractmanagement.md
           documenting the new user dashboard tabs, listing‑card cancel
           affordance, responsive layout updates, token‑details history
           improvements, OBJKT fallback fix, and SVG download filename
           correction. This addendum is append‑only and intended to be
           merged into the Master document on the next docs maintenance pass.
──────────────────────────────────────────────────────────────────*/

This addendum records the exact changes introduced in r1188. Preserve it
verbatim; when merging into the Master document, update the Rev header,
Invariants list, Source‑Tree Map entries, and Change Log accordingly.

Sections

1) User Dashboard (`src/pages/u/[address].jsx`)
   - Tabs: Collections, Tokens, Listings
   - Collections: uses `discoverCreated()` then `countTokens()` to keep only
     non‑empty contracts (totalSupply>0). Passes `initialTokensCount` into
     `CollectionCard`.
   - Tokens: parity with Explore → Tokens admin filter. Pulls from
     `creator`, `firstMinter`, `metadata.creators.contains`, and
     `metadata.authors.contains`. Gates by ZeroContract `typeHash`, requires
     `hasRenderablePreview`, excludes hazards, filters fully burned tokens via
     `listLiveTokenIds`, sorts newest‑first.
   - Listings: seller‑scoped grid using `fetchOnchainListingsForSeller` +
     `filterStaleListings` then batched token metadata/name prefetch from TzKT.
   - Layout: full‑width container with responsive grid
     `repeat(auto-fill, minmax(clamp(160px, 18vw, 220px), 1fr))` so the grid
     fills any monitor width.

2) Listing Card Cancel Affordance (`src/ui/TokenListingCard.jsx`)
   - Shows a micro “Cancel” button next to “Share” when:
     • the lowest listing seller is the connected wallet, OR
     • any listing for the token belongs to the connected wallet (checked via
       `fetchListings`), OR
     • the card renders on `/my/listings` with a connected wallet.
   - Clicking opens `src/ui/Entrypoints/CancelListing.jsx` for that token.

3) Explore Navigation & Listings
   - Admin search respects context:
     • Listings → `/explore/listings?admin=<tz>`
     • Tokens   → `/explore?cmd=tokens&admin=<tz>`
   - Explore Listings now renders the search bar (removed `hideSearch`).

4) Token Details — History & Downloads
   - History burn resolution is token‑strict and hash‑aware:
     • Derive missing hashes via `xferId → transactionId → hash`.
     • Resolve `to.address` by querying token‑filtered transfers by hash.
     • If an op is a burn for this tokenId, mark `kind='Burn'`, set `to` to the
       canonical burn address, and set `amount` from parameters; synthesize
       rows if needed so burn events always appear.
   - OBJKT fallback queries use `hash.in` (fixes 400 Bad Request) and correlate
     sales by hash.
   - SVG download filenames now end with `.svg` (strip MIME params like `+xml`).

5) Invariants Added (to be merged into the Master list)
   - I21 [F] Responsive grids: use `repeat(auto-fill, minmax(<min>, 1fr))` and
     full‑width containers to fill any monitor without dead margins.
   - I57 [F] Seller‑only Cancel: render the cancel affordance only when the
     connected wallet has a listing for that token (lowest seller or any
     listing) or when on `/my/listings`.
   - I58 [F] History burn detection is token‑aware and hash‑aware; never guess
     cross‑token; use token‑filtered transfer queries by `hash`.

6) Files Touched (summary)
   - `src/pages/u/[address].jsx` – new dashboard logic (tabs + responsive grid).
   - `src/ui/TokenListingCard.jsx` – micro Cancel button conditions + dialog.
   - `src/ui/TokenCard.jsx` – robust preview selection; snapshot fallback.
   - `src/ui/ExploreNav.jsx` – context‑aware admin routing.
   - `src/pages/explore/listings/index.jsx` – search bar visible.
   - `src/utils/historyEvents.js` – burn resolver + OBJKT `hash.in` fix.
   - `src/constants/mimeTypes.js` – `preferredExt()` trims params; SVG → `.svg`.

7) Progress Ledger (r1188)
   - Implemented dashboard tabs & parity filters.
   - Added cancel affordance on listing cards with robust detection.
   - Fixed OBJKT fallback 400s; hardened burn resolution; improved downloads.
   - Ensured Explore Listings search visibility and admin routing fidelity.

/* EOF */
