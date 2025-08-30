Developed by @jams2blues — ZeroContract Studio
File: docs/share_nft_feature.md
Rev : r4 2025-08-29
Summary: Share feature with view/purchase variants, per-token social cards,
artist handle resolution, and a download action. Cards integrate a share
button using a global bus.

NFT Sharing — Design and Implementation

- Scope: Token detail page share modal with purchase variant supported
  (hooked from buy flow). Listing/collection card buttons included.
- Reliability: Per-token social cards via <Head> ensure correct previews on
  X/Twitter and Discord. PNG snapshots are generated on demand by a
  serverless endpoint.

User Experience

- Share Button: Appears on token detail meta panel and on cards.
- ShareDialog content:
  - Preview: Displays the artwork with pixelated scaling.
  - Prewritten text: Includes the token name, optional “by @handle” and the
    canonical token URL.
  - Buttons: Share (system share), X (tweet intent), Copy Link, Download.

Message Variants

- View (default): I am sharing "<Name>" by @<handle> on @ZeroUnboundArt <URL>
- Purchase (variant="purchase"): I have just collected "<Name>" by @<handle>
  on @ZeroUnboundArt <URL>

Artist Handle Resolution

- On opening, when metadata includes a tz address in creators/authors, the
  client fetches /api/handle/<tz> and uses the returned alias (e.g., @artist
  or a shortened tz) in the prewritten message.
- API: src/pages/api/handle/[address].js
  - Queries Objkt GraphQL for the address and returns { handle, alias }.
  - 10-minute in-memory cache, resilient to upstream errors.

Per-Token Social Cards

- The token detail page injects per-token <Head> tags:
  - og:title / twitter:title — token name or “Token #ID”
  - og:description / twitter:description — token description or fallback
  - og:url — canonical token URL (SITE_URL/tokens/<addr>/<tokenId>)
  - og:image / twitter:image — SITE_URL/api/snapshot/<addr>/<tokenId>
  - twitter:card — summary_large_image
- This overrides site-wide defaults so previews show the token snapshot.

Snapshot API

- Endpoint: /api/snapshot/[addr]/[tokenId]
- Behavior:
  - Picks best URI from metadata (display/image/thumbnail/artifact).
  - Normalizes ipfs:// to https://ipfs.io/ipfs/.
  - Decodes data: URIs or fetches remote bytes; converts to PNG.
  - Cache headers: s-maxage=86400, stale-while-revalidate=43200.
  - Fallback: public/sprites/Banner.png on errors.

Network Awareness

- SITE_URL, OG_IMAGE, TZKT_API and RPC ordering are network-specific via
  src/config/deployTarget.js. Share/meta logic uses SITE_URL so links and
  snapshots always target the active network.

Global Share Bus

- Dispatch: window.dispatchEvent(new CustomEvent('zu:openShare', { detail: { contract, tokenId, variant, url?, previewUri? } }))
- Handler: lives in src/pages/_app.js; fetches name and primary @handle; falls back gracefully.
- Collections: pass url and optional previewUri (no tokenId).

Post-purchase Overlay

- BuyDialog dispatches zu:openShare with variant="purchase" when the
  operation confirms. The global handler opens ShareDialog with the token
  name and snapshot preview.

Accessibility & UX

- Share buttons are keyboard focusable; the dialog closes via its primary
  action. Preview uses pixelated scaling to keep pixel art crisp.

Release guardrails

- Network-aware SITE_URL and TzKT base via deployTarget.js
- Resilient to missing metadata: names/creators/aliases are optional.
- No script execution in ShareDialog; previews are images only.
