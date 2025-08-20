/*─────────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File: src/modules/generative/p5/README.md
Rev:  r2   2025‑08‑20 UTC
Summary: How to package p5 sketches into text/html data URIs deterministically.
──────────────────────────────────────────────────────────────────*/

# Generative P5 Module (text/html only)

## Quick use in code
```js
import { buildP5Html, toDataHtmlBase64, buildPosterPng, downscalePng } from './buildP5Html';
import { deriveSeedHex } from '../../../utils/generativeSeed';

const seedHex = deriveSeedHex(contract, tokenId, recipient, projectSalt);
const html = buildP5Html({ sketchSource, seedHex, tokenId, contract, projectName: 'MyProject' });
const artifactUri = toDataHtmlBase64(html);
const displayUri = await buildPosterPng(html, 90);
const thumbnailUri = await downscalePng(displayUri, 512);
```

### Seeding notes

* Global‑mode sketches are auto‑seeded; instance‑mode sketches receive seeds via a small prototype hook. If needed, call `window.__zuPrelude(p)` inside your `setup(p)` explicitly.

### Safety

* `p5-1.7.0.min.js` must be **unmodified**; imported as a raw string (webpack `asset/source`) and inlined into the artifact.
* **No external URLs**; all payloads are `data:` URIs.

/* What changed & why: reflect text/html‑only scope and new helpers. */
