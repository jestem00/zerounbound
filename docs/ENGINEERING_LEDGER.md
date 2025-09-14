ZeroUnbound v4 - Engineering Progress Ledger
Rev: r11 2025-09-14

Purpose: Track files touched, pending cleanups, and invariant notes as we iteratively harden the codebase following recent edits (ZIP generative, SVGZ, TzKT fallbacks, on/off-chain redundancy) and fix Next.js dev/runtime regressions.

Rollback Note (2025-09-12)
- App rolled back to previously live version. Only these new artifacts remain: 
  - src/utils/interactiveZip.js
  - src/utils/confirmBus.js
  - src/ui/GlobalConfirm.jsx
  - src/ui/Entrypoints/SvgCompressor.jsx
  - docs/TZIP_Compliance_Invariants_ZeroContract_V4+.md
  - docs/ENGINEERING_LEDGER.md
  - __tests__/zipSupport.test.js
- Next work will be staged and verified incrementally; no broad edits outside agreed scope.

This Pass (r10 prep)
- Diagnosis: Ghostnet explore density is low even on the old backup; static feed shows zero pages, so aggregator-only mode is active. Ghostnet TzKT behavior likely changed (lower coverage and/or intermittent `typeHash`).
- Diagnosis: Bootloader/generative collections appear in explore despite ZeroContract gating. Example (mainnet KT1QdvKPG8jv8PpdT67Zfck8yJNXtH4AkPcu) has `typeHash=862045731` which maps to our `v3`. Conclusion: `typeHash` alone is insufficient; we need a stronger fingerprint (some contracts share interface hashes).
- Decision: No manual allowlists. Gating must be automated via TzKT signals only.

- Planned fingerprint (automated, no upkeep):
  - Primary: contract.typeHash ∈ hashMatrix (v1–v4e).
  - Secondary: contract.codeHash ∈ dynamic codeHash set harvested from `contracts?typeHash.in=<matrix>`.
  - Tertiary: Entrypoint superset check via `contracts/{addr}/entrypoints` (ZeroContract versions expose a characteristic set: mint, edit_token_metadata, append_artifact_uri, append_extrauri, clear_uri, destroy, transfer, update_operators, balance_of; exact sets vary by version).
  - Fallback: exclude addresses failing all three.

- Explore acceptance:
  - On-chain preview only in explore grid: `data:` and `tezos-storage:`; exclude HTML payloads and off‑chain schemes. Token detail pages may still render off‑chain URIs; explore grid stays pure on‑chain.
  - Burn/destroy hygiene: keep `totalSupply>0` and drop singles whose only holder is burn. Avoid heavy client scans.

- Diagnostics to run next:
  - Ghostnet/mainnet slices: `/v1/tokens?standard=fa2&sort.desc=firstTime&limit=120&select=contract,tokenId,metadata,holdersCount,totalSupply,contract.typeHash`.
  - Contract meta: `/v1/contracts?address.in=<KT1s>&select=address,typeHash,codeHash`.
  - Entrypoints: `/v1/contracts/<KT1>/entrypoints` to validate the ZeroContract superset.
  - Report counts by contract, by hash, and rejection reasons (gating/preview/burn) on sample pages.

- SVGZ/ZIP scope (upcoming):
  - Add svgz detection: validate gzipped SVG by decompressing the head and checking `<svg` root.
  - application/zip: support constrained interactive ZIP with strict sandboxing; keep explore previews on-chain only.
  - Extend tests in `__tests__/zipSupport.test.js` for svgz and ZIP.

This Pass (r9)
- src/pages/explore/tokens.jsx: fixed regression where unfiltered browse could show an empty grid with "No more tokens to show". Root cause 1: strict post-merge type-hash gating filtered out all rows when `/contracts?address.in=&select=address,typeHash` returned empty (rate-limit/temporary failure). Fix: graceful degradation in both gating helpers — if metadata cannot be retrieved, keep rows as-is.
- src/pages/explore/tokens.jsx: root cause 2: burn-filter step treated an empty/unknown live-id set as "no live tokens" and dropped all tokens per contract. Fix: lenient burn-filtering — only drop tokens when live-id sets are positively known (non-empty). If unknown/empty, keep tokens unfiltered and avoid pruning state for that contract.
- src/pages/explore/tokens.jsx: added dev metrics (opt-in via `?debug=1`) to surface aggregator usage (agg), type-hash gate meta misses (gate-miss), and burn evaluation fallbacks (burn-unknown). Visible only in generic explore mode.
- src/pages/api/explore/feed.js: added final fallback in serverless aggregator — when both `contract.in` and `contract.typeHash.in` paths yield zero, drop the type-hash constraint and fetch a narrow FA2 page, letting the client-side gate + preview/burn hygiene pick valid tokens. Restores density on ghostnet when TzKT typeHash is missing.
- src/pages/explore/tokens.jsx: broadened `hasRenderablePreview` to match TokenCard allowances (data:, ipfs:, https:, ar:, arweave:, tezos-storage:) while explicitly excluding HTML. This enables v1–v4e tokens whose previews are not strictly data:/tezos-storage to appear in the explore grid.
- src/pages/api/explore/feed.js: preview acceptance aligned with client (data/ipfs/https/ar/arweave/tezos-storage; exclude HTML). Prevents aggregator from starving batches on ghostnet where most tokens advertise ipfs/https previews.
- src/pages/explore/tokens.jsx: fixed aggregator branch rawCount to use actual items length (not cursor delta) to avoid premature scan budget exhaustion. If aggregator yields too few rows, top up with a direct TzKT slice and re-gate, restoring density in generic browse.
- src/pages/api/explore/feed.js: reworked listTokens to union three sources — contract.in (known ZeroContract addresses), contract.typeHash.in, and a generic FA2 slice. De-dupes by contract:tokenId and slices to limit. Prevents the ghostnet “only 1 row” case when contract.in returns too few.
- src/pages/api/explore/feed.js: disabled burn-filter during aggregation to restore density on ghostnet; burn hygiene remains a client concern and is currently disabled in explore generic mode for visibility.
- src/pages/explore/tokens.jsx: removed live burn-pruning in both admin and generic modes; we now keep tokens as-is and rely on totalSupply>0 to exclude destroyed supply. Restores parity with pre-overhaul behavior and matches the older platform’s visible density.
- src/pages/api/explore/feed.js: removed server-side preview filter; accept all tokens meeting FA2 + totalSupply>0 and let the client render placeholders when needed.
- src/pages/explore/tokens.jsx: stopped requiring a preview for acceptance; TokenCard already displays a placeholder tile when no preview is present. Added a ghostnet-only bypass for type-hash gating to ensure density while we expand the hash matrix.
- src/pages/explore/tokens.jsx: added emergency density fallback — if initial batch is still sparse, fetch a direct FA2 burst (3×60) and merge, then continue normal paging. Keeps the grid rich even under upstream gaps.
- Integrity badges: switched partial badge to the ZWJ sequence '⛓️‍💥' for a single combined glyph when supported. Updated INTEGRITY_BADGES.partial.
- Explore gating tightened: server aggregator and client both re‑gate rows strictly by contract.typeHash; unknown hashes are excluded to prevent non‑ZeroContract bleed‑through. Client continues to accept rows without previews and burn-pruning remains disabled for visibility.
- Gating automation (no manual allowlist): Removed static allowlist usage. Aggregator now builds allowed addresses dynamically from `typeHash.in` and factory originations only. Client gates by contract.typeHash and, when missing, by codeHash using a dynamic allowlist of codeHashes fetched from `contracts?typeHash.in`. This restores strict ZeroContract-only results without manual upkeep.

Previous Pass (r8)
- src/pages/my/tokens.jsx: ensured clean TzKT base derivation (wallet network first, TZKT_API honored, trailing slashes trimmed, '/v1' enforced). Fixed loading banner text to plain ASCII ellipsis ("Fetching your tokens..."). Removed mojibake from comments.
- src/pages/my/tokens.jsx: restored TzKT array filters to `metadata.creators.contains`/`metadata.authors.contains` (ghostnet-compatible); fixed owned balances parsing when `contract` is a KT1 string; added concurrent metadata backfills for owned tokens; tightened preview guard to accept only valid `data:` URIs (base64 signatures for images; '<' sniff for svg/html) so broken images are filtered; relaxed error handling to avoid a hard error screen while still logging in dev.
- scripts/clean-entrypoints.js: hardened replacers to cover additional cp1252/UTF-8 mojibake clusters; added header sanitizer for noisy/box-drawing comment blocks; normalized arrows, NBSP variants, bullets, and box drawing lines. Re-ran cleaner.
- src/ui/Entrypoints/*: headers sanitized; visible strings normalized (ellipsis, dashes, quotes). Replaced emoji glyphs with Unicode escapes or ASCII equivalents where appropriate. Example: EditTokenMetadata checklist icons now use '\u2714'/'\u2716'/'\u274C'.
- Entrypoints help text fixes (JSX parsing): replaced text arrows with HTML escapes and cleaned cp1252 numerals/icons to ASCII:
  - src/ui/Entrypoints/AppendArtifactUri.jsx: replace '->' with '-&gt;', escape you'll; long help text remains intact.
  - src/ui/Entrypoints/BalanceOf.jsx: normalized steps with '-&gt;'.
  - src/ui/Entrypoints/ClearUri.jsx: normalized arrows and fixed "re-upLoading...r" to "re-uploading or".
  - src/ui/Entrypoints/UpdateOperators.jsx: normalized arrows.
  - src/ui/Entrypoints/RepairUri.jsx: converted numbered bullets to '1)/2)/3)' and arrows to '-&gt;'; removed cp1252 icons.
  - src/ui/Entrypoints/RepairUriV4a.jsx: same as RepairUri.
  - Success toasts: replaced checkmark glyphs with '\u2713' in Burn, BurnV4, ClearUri, Destroy.
- scripts/sanitizeComments.js: ran comment-only sanitizer across src/ and docs/.
- package.json: verified no BOM and valid JSON (starts with 7B 0A 20).
- src/pages/explore/tokens.jsx: added post-merge gating by ZeroContract typeHash for static/hybrid and aggregator results using a batched `/contracts?address.in=&select=address,typeHash` lookup. Prevents non‑ZeroContract bleed‑through on ghostnet without harming mainnet performance. Also made `useTzktV1Base` prefer site network (NETWORK_KEY) to avoid cross‑network queries. If static gating yields zero, we now fall back to the serverless aggregator before declaring end, keeping ghostnet dense. Added a second-layer batch gate in the global scan loop to filter any rows missing contract.typeHash by querying /contracts with address.in; prevents any remaining non‑ZeroContract bleed‑through regardless of origin.

Previous Pass (r7)
- src/ui/OperationOverlay.jsx: restored emoji next to op hash using Unicode escape (link icon) and prevented wrapping via `wordBreak:'normal'` + `whiteSpace:'nowrap'` on the anchor.

Previous Pass (r6)
- src/constants/funLines.js: fixed syntax by escaping ASCII apostrophe in "that's" after normalization; replaced mojibake key hint with ASCII ("Press Start..."); converted section comments to ASCII.
- scripts/normalize-encoding.js: restricted scope to docs/styles (.md/.css/.html) to avoid mutating JS/TS strings going forward.

Previous Pass (r5)
- src/pages/_document.js: reverted to `require('next/document').default` for the base class to fix Next 15 ESM namespace issue; keeps Html/Head/Main/NextScript via ESM import.
- src/ui/OperationOverlay.jsx: removed all mojibake comments (box-drawing, CP1252 artifacts); ASCII-only comments; replaced stray emoji link label with "Open"; restored FUN_LINES import/usage.
- scripts/sanitizeComments.js: new tool that cleans mojibake inside comments only across src/ and docs/ (safe: code/strings untouched).

Previous Pass (r4)
- package.json: removed UTF-8 BOM that broke `yarn dev` (corepack failed to parse). Re-serialized JSON to canonical form; scripts restored (`&&`).
- src/*: stripped BOMs from 27 source files to avoid parser edge cases.
- scripts/normalize-encoding.js: rebuilt to be safe and limited to `src/` only; no self-rewrites.
- scripts/check-encoding.js: reduced scope to `src/` and `docs/`; added BOM checks.

Previous Pass (r2)
- src/pages/_document.js: switch to standard `import Document` (Next 15); keep styled-components SSR; remove non-ASCII punctuation in comments.
- src/pages/_app.js: register service worker at `/_next/static/sw.js` with fallback to `/sw.js`.
- scripts/startDev.js: clear stale `.next` artifacts before `next dev` to avoid ENOENT; replace emoji/log glyphs with ASCII.
- .editorconfig + .gitattributes: enforce UTF-8, LF, and binary handling.
- scripts/check-encoding.js: repository-wide encoding guard; fails on mojibake/unsafe chars.
- scripts/normalize-encoding.js: best-effort fixer for common mojibake patterns.

Quick Validation
- Local: Verified `.next` now rebuilds from a clean slate on `yarn dev`. Document import no longer looks up `.next/server/pages/_document.js` directly.
- Token success link: remains a simple `<a href>` to `/tokens/{addr}/{id}`; no filesystem access.

Invariants Respected
- Anti-glyph discipline (AGENTS.md §10): prefer ASCII (`-`, `...`, straight quotes) in code and logs to prevent mojibake.
- Redundancy: preserved TzKT + on-chain view fallback logic; no functional changes to mint/append/repair.
- SSR/CSS: styled-components ServerStyleSheet retained.
 - Encoding discipline: ASCII-only for code/comments; use Unicode escapes for emojis in UI strings; LF newlines; no BOM in JSON or source. On Windows, write JSON via Node or `Out-File -Encoding utf8NoBOM` (avoid `Set-Content -Encoding UTF8`).

Pending / Next Targets
- Normalize remaining UI copy across entrypoints (quotes, dashes, ellipses); run `yarn fix:encoding` then spot-check deltas.
- Lint cleanup (high-value first):
  - src/ui/ContractCarousels.jsx: remove unused imports/vars; re-enable caching only if used.
  - src/pages/manage.js: add displayName to anonymous component.
  - src/pages/my/*.jsx: address unused vars and `no-inner-declarations` in offers.
  - src/ui/AdminTools.jsx: remove unused `vLow`.
- Smoke tests: Repair URI, Append Artifact/Extra, ZIP/SVGZ viewer, explore tokens pruning.

Changelog
- r2 (2025-09-10): Next dev recovery (.next cleanup), Document import fixed, SW path aligned, encoding guards added.
- r1 (2025-09-10): Initial ledger, syntax fix + targeted cleanup.



- Explore gating reliability: All token queries now include `contract.typeHash` in `select`, so both server and client can gate strictly in-line without extra `/contracts` meta calls. Client batch gating first tries in-line typeHash; only if missing does it fetch contract meta and fall back to codeHash matching (built dynamically from `contracts?typeHash.in`).

This Pass (r11)
- Explore gating fix: removed OBJKT bootloader lookalikes from explore/tokens by fingerprinting ZeroContract entrypoints. Added a tolerant, cached entrypoint check on both server aggregator (src/pages/api/explore/feed.js) and client (src/pages/explore/tokens.jsx). Keeps density while disambiguating contracts that share interface 	ypeHash.
- SVGZ support: added .svgz extension mapping to image/svg+xml; added detection helpers and auto-normalisation in viewer. RenderMedia now auto-decompresses gzipped SVG data URIs to plain UTF-8 for compatibility. Helpers live in src/utils/uriHelpers.js.
- Interactive ZIP: strengthened src/utils/interactiveZip.js by injecting a strict CSP into the rewritten index.html and exposing a sandboxed iframe path in RenderMedia. Remote references are rewritten to blob: where possible and flagged via hazards.remotes; connect-src is set to 
one to constrain network access.
- Tests: extended __tests__/zipSupport.test.js to cover data: ZIP detection and hazard scanning; added __tests__/svgzDetect.test.js to validate gzipped SVG detection/normalisation.
- Hygiene: updated MIME map; no dead imports; kept changes surgical to impacted code paths.

Hotfix (r11-grid)
- Explore grid empty on mainnet due to over-gating + overly strict preview acceptance. Actions:
  - Disabled client/server entrypoint fingerprint gating (kept typeHash-based contract set). Files: src/pages/explore/tokens.jsx, src/pages/api/explore/feed.js.
  - Broadened preview acceptance in both server and client to include ipfs/https/ar/arweave alongside data:/tezos-storage. Files: same as above.
  - Left static feed proxy intact (/api/explore/static); aggregator fallback remains when static feed is missing.

Hotfix (r11-feed-ghostnet)
- Symptom: Ghostnet static Explore feed showed 0 pages (404 on `ghostnet/page-0.json`), while mainnet worked. UI at `/explore/tokens` appeared empty on ghostnet when relying on static pages.
- Root cause: `scripts/exploreFeed.mjs` preferred a `contract.in=<800+ addresses>` tokens query after discovering allowed contracts. On ghostnet, this produced `414 Request-URI Too Large` from TzKT, which our fetch helper swallowed, yielding an empty chunk and zero accepted tokens.
- Fix: Robust dual-path token query with length guard.
  - Prefer `contract.typeHash.in=<matrix>` for broad scans to avoid long URLs.
  - If the discovered address list is small (join length ≤ 7000 chars), attempt precise `contract.in` first; if it returns empty, fall back to the type-hash filter.
  - This preserves strictness when small, and guarantees results at scale.
- Files changed: `scripts/exploreFeed.mjs` (pageTokens: new baseQS, length guard, safe fallback path).
- Validation (local, Node 22):
  - Ghostnet: pages=3 total=111 with `--page-size=50 --max-pages=2` (test run)
  - Mainnet:  pages=4 total=158 with `--page-size=50 --max-pages=2` (test run)
  - Action uses `--page-size=120` matching `FEED_PAGE_SIZE` in `src/config/deployTarget.js`.
- Operational note: The serverless aggregator (`src/pages/api/explore/feed.js`) already had a fallback from `contract.in` to `contract.typeHash.in` when rows are empty; no changes required there.
  - Added dedicated meta proxy route: `src/pages/api/explore/static/[net]/meta.js` so the client can fetch `${FEED_STATIC_BASE}/<net>/meta.json` instead of falling back to aggregator immediately.

Explore Feed Format & Next Improvements
- Current page schema (per item): `{ contract, tokenId, metadata, holdersCount, firstTime, typeHash? }`.
  - Pros: self-contained; on-chain previews render without secondary lookups; works offline from Pages.
  - Cons: base64 data URIs can bloat pages; initial page fetch costs can be high on slow networks.
- Near-term, safe improvements:
  - Add `meta.json` (already emitted) and keep it stable: `{network,pageSize,pages,total,lastUpdated}`.
  - Consider optional `page-*.json.gz` to let clients request compressed pages when supported (keep `.json` for compatibility). GitHub Pages may auto-gzip; measure first.
  - Provide a minimal mirror format for fast-list UIs (name, preview uri, contract, tokenId, firstTime). Keep the rich format as-is and publish under `/full/` if we add the lean variant.
  - Keep `hasRenderablePreview` aligned across client/server so grids never fetch pages that are later rejected.
- Longer-term options (discuss):
  - Precompute per-contract rolling indexes (most-recent token ids) to accelerate admin-filtered views.
  - Introduce a tiny sitemap (latest N page ids per network) to skip `meta.json` fetch in hot paths.
  - If Pages latency becomes a limiter, lean more on the serverless aggregator which already de-duplicates and burn-filters live data with caching.
