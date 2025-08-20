/*─────────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File: docs/Generative_P5_Module_Spec.md
Rev:  r2   2025‑08‑20 UTC
Summary: Spec for packaging p5.js generative tokens as data:text/html artifacts with deterministic seeding.
──────────────────────────────────────────────────────────────────*/

# Generative P5 Module — **text/html only**, deterministic & fully on‑chain

## Goals
- Deterministic p5.js generative tokens packaged as a **single HTML page** (`data:text/html;base64,…`).
- **No external** URLs or CDNs; **p5.min.js inlined**.
- Minimal wiring: a self‑contained module + a small guarded hook in `Mint.jsx`.
- Respect existing **script‑consent** UX and **FOC validator**.
- Provide dev‑time **Preview Wizard** and **poster PNG** for non‑script previews.

## Canonical artifact (TZIP‑21)
- **artifactUri**: `data:text/html;charset=utf-8;base64,<HTML>`, **mimeType**: `text/html`
- **displayUri**: `data:image/png;base64,<PNG>` (poster capture; recommended for cards)
- **thumbnailUri**: smaller PNG (≤ 512 px)
- **attributes**: name/value pairs computed from the same **deterministic seed**

> We intentionally **omit** `formats[]` and any ZIP packaging — per your request, this drop uses **only** data URIs.

## Deterministic seed
`deriveSeedHex(contract, tokenId, recipient?, projectSalt?) -> 128‑bit hex`  
We fold to 32‑bit and apply `p5.randomSeed()` and `p5.noiseSeed()` **before** user `setup()` (global or instance). Seed recipes:
- **Pre‑minted editions**: `(contract, tokenId, projectSalt)`
- **Per‑mint uniqueness**: `(contract, tokenId, recipient, projectSalt)` — requires **Mint Now** flow

## Safety & UX (existing code, no changes)
- Playback via **sandboxed iframe** with **Enable Scripts** overlay (per‑token consent). :contentReference[oaicite:20]{index=20}
- FOC policy & validator: **no external refs** in HTML; all media as `data:`. :contentReference[oaicite:21]{index=21}
- Grids prefer **non‑HTML previews**; we supply posters. :contentReference[oaicite:22]{index=22}

## Creator flow (dev/ghostnet)
Use the **Generator Wizard** to paste a sketch, preview seeds, generate:
1) HTML artifact (string) + `artifactUri` (data URI)  
2) `displayUri` PNG poster, `thumbnailUri`  
3) `attributes` (basic defaults; extend as needed)

## Mint flow (v4e)
- `Mint.jsx` already fetches **`next_token_id`** and builds **append_artifact_uri** batches. We inject a small block that builds the HTML, sets `mimeType: 'text/html'`, attaches posters & attributes, and hands the **data URI** to your existing **append** pipeline. :contentReference[oaicite:23]{index=23}

## Objkt/others
This drop keeps **only** `text/html`. Zero Unbound will play it (consent‑gated). Other marketplaces may fall back to the posters. If interactive on others is needed later, a ZIP rail can be added as a separate option.

## Example seed policy
- **Search for Life** port: use `(contract, tokenId, projectSalt)` for deterministic frames; capture poster at frame ~600.
- Expose `posterFrame` for creators; store as an attribute if useful.

## Size & performance
- `p5.min.js` ~0.5–0.8 MiB; base64 adds ~33 %. Your **slice appender** handles oversize payloads (resume & checkpoint). :contentReference[oaicite:24]{index=24}
- For cards/grids, prefer posters; let users opt‑in to scripts on the token page.

/* What changed & why: r2 removes ZIP/formats and clarifies text/html‑only packaging. */
