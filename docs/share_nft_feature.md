Developed by @jams2blues — ZeroContract Studio
File: docs/share_nft_feature.md
Rev : r3 2025-08-27
Summary: Share feature shipped on token detail page with two
variants (view and purchase), per-token Open Graph/Twitter
meta tags, artist handle resolution, and a Download Original
action. Docs updated to reflect the shipped behavior and APIs.

NFT Sharing — Design and Implementation

- Scope: Token detail page share modal; purchase share variant supported
  (hook available from buy flow). Listing/collection card buttons land in
  the next increment.
- Reliability: Per-token social cards via <Head> ensure proper previews on
  X/Twitter and Discord. PNG snapshots are generated on demand by a
  serverless endpoint.

User Experience

- Share Button: Appears in the right meta panel under Fullscreen on the
  token detail page.
- ShareDialog content:
  - Preview: Displays the current media with pixelated scaling.
  - Prewritten text: Includes the token name, optional “by @handle” and the
    canonical token URL.
  - Buttons:
    - Share (system share sheet via navigator.share)
    - X (twitter.com/intent/tweet with the prewritten text)
    - Copy Link
    - Download (downloads the decoded original file; filename uses the
      correct extension derived from MIME)

Message Variants

- View (default): “I am sharing "<Name>" by @<handle> on @ZeroUnboundArt <URL>”
- Purchase (variant="purchase"): “I have just collected "<Name>" by @<handle>
  on @ZeroUnboundArt <URL>”

Artist Handle Resolution

- On opening ShareDialog, when the token metadata includes a tz address in
  creators/authors, the client fetches /api/handle/<tz> and uses the returned
  alias (e.g., “@artist” or a shortened tz) in the prewritten message.
- API: src/pages/api/handle/[address].js
  - Queries Objkt GraphQL for the address and returns `{ handle, alias }`.
  - 10-minute in-memory cache, resilient to upstream errors.

Per‑Token Social Cards

- The token detail page injects per-token <Head> tags:
  - og:title / twitter:title — token name or “Token #ID”
  - og:description / twitter:description — token description or fallback
  - og:url — canonical token URL (SITE_URL/tokens/<addr>/<tokenId>)
  - og:image / twitter:image — SITE_URL/api/snapshot/<addr>/<tokenId>
  - twitter:card — summary_large_image
- This overrides the site-wide defaults from _document.js so previews show
  the token snapshot rather than the generic banner.

Snapshot API

- Endpoint: /api/snapshot/[addr]/[tokenId]
- Behavior:
  - Selects best URI from metadata (display/image/thumbnail/artifact).
  - Normalizes ipfs:// to https://ipfs.io/ipfs/.
  - Decodes data: URIs or fetches remote bytes; converts to PNG via sharp.
  - Cache headers: s-maxage=86400, stale-while-revalidate=43200.
  - Fallback: public/sprites/Banner.png when errors occur.

Network Awareness

- SITE_URL, OG_IMAGE, TZKT_API and RPC ordering are network-specific via
  src/config/deployTarget.js. Mainnet prefers the Tezos Commons
  node-switcher; Ghostnet uses ecadinfra + teztnets. Share/meta logic uses
  SITE_URL so links and snapshots always target the active network.

Next Steps (optional)

- Add share buttons to listing cards and collection cards.
- Open ShareDialog with variant="purchase" automatically after a successful
  BUY (BuyDialog) using the token’s snapshot URL as preview.
- Additional networks (Mastodon, Bluesky) and custom templates.

