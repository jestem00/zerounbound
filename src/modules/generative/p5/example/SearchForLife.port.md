/*─────────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File: src/modules/generative/p5/example/SearchForLife.port.md
Rev:  r2   2025‑08‑20 UTC
Summary: Porting notes for “Search for Life” → Zero Unbound p5 on‑chain HTML.
──────────────────────────────────────────────────────────────────*/

# Port “Search for Life” (Prohibition) to Zero Unbound (ghostnet)

**Checklist**
1. Remove external `<script src="...p5.js">` and paste your p5 sketch code into the Wizard.
2. Choose a seed policy:
   - `(contract, tokenId, projectSalt)` for pre‑mints, or
   - `(contract, tokenId, recipient, projectSalt)` for per‑mint uniqueness.
3. Poster capture: pick a representative `posterFrame` (e.g., ~600 for deep star‑field) and let the wizard capture it.
4. Attributes: compute any trait booleans or enums based on the same seed; store in `attributes` (name/value).
5. Export token metadata and mint on **ghostnet** using the guarded P5 mint path. The resulting token stores:
   - `mimeType: "text/html"`
   - `artifactUri: data:text/html;base64,…`
   - `displayUri`/`thumbnailUri`: PNGs (data URIs)
   - `attributes` with your features & seed short

**Notes**
- The module auto‑seeds global‐mode sketches. For instance‑mode, the prototype hook applies seeds upon `createCanvas`; if your code uses custom boot, you may also call `window.__zuPrelude(p)` inside `setup(p)`.
- Keep the sketch self‑contained (fonts, sounds, textures must be inline or procedurally generated).
- Avoid heavy infinite animations; rely on `noLoop()` or throttle to keep token pages light; cards/grids use the poster anyway.

/* What changed & why: match text/html‑only path; concrete poster/seed guidance. */
