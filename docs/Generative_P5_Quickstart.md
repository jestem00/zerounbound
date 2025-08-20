/*─────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File: docs/Generative_P5_Quickstart.md
Rev : r1 2025-09-07
Summary: Step-by-step guide for minting p5.js generators.
──────────────────────────────────────────────────────────────*/

# Generative P5 Quickstart

1. **Install & run dev server**
   ```bash
   yarn set:ghostnet
   yarn dev
   ```
   Open <http://localhost:3000>.
2. **Access dev tools**
   Visit <http://localhost:3000/dev/generative> for links to:
   - **P5 Preview Lab** – paste a sketch and test seeded output.
   - **P5 Generator Wizard** – package the sketch into a self‑contained HTML artifact and poster.
3. **Prepare your sketch**
   - From your zip, open the `sketch.js` (or similar) file.
   - Remove any external `<script>` tags; the wizard already inlines `p5.min.js`.
   - Paste the sketch into the Wizard and set project name, salt and poster frame.
4. **Build token metadata**
   - Click **Build token metadata**.
   - The wizard displays:
     - `artifactUri` (HTML `data:text/html`) 
     - `displayUri` / `thumbnailUri` (PNG data URIs)
     - seed information and attributes.
   - Copy the artifact and poster URIs for minting.
5. **Mint on ghostnet**
   - On your contract page, click **Mint**.
   - Fill out standard fields and paste the URIs and attributes from the wizard.
   - Submit the mint; the artifact and posters are stored on‑chain as data URIs.
6. **Verify**
   - After confirmation, the token appears in your marketplace. Cards use the poster PNG; the HTML artifact runs only after the viewer grants script consent.

/* What changed & why: provide first-time creator instructions. */
