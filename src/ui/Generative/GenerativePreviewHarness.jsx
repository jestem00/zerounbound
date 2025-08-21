/*─────────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File: src/ui/Generative/GenerativePreviewHarness.jsx
Rev:  r2   2025‑08‑20 UTC
Summary: Dev harness to preview p5 HTML data URIs and capture posters.
──────────────────────────────────────────────────────────────────*/

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { deriveSeedHex } from '../../utils/generativeSeed.js';
import { buildP5Html, toDataHtmlBase64, buildPosterPng } from '../../modules/generative/p5/buildP5Html.js';

export default function GenerativePreviewHarness() {
  const [sketch, setSketch] = useState(
    `function setup(){createCanvas(800,800);randomSeed(42);noiseSeed(42);noLoop()}
     function draw(){background(0);stroke(255);for(let i=0;i<2000;i++){point(random(width),random(height))}}`
  );
  const [contract, setContract] = useState('KT1GENP5DEMO...');
  const [tokenId, setTokenId] = useState(0);
  const [recipient, setRecipient] = useState('tz1...');
  const [projectSalt, setSalt] = useState('SALT0');
  const [htmlUri, setHtmlUri] = useState('');
  const iframeRef = useRef(null);

  const seedHex = useMemo(
    () => deriveSeedHex(contract, tokenId, recipient, projectSalt),
    [contract, tokenId, recipient, projectSalt],
  );

  const html = useMemo(() => buildP5Html({
    sketchSource: sketch,
    seedHex,
    tokenId,
    contract,
    projectName: 'DevPreview',
  }), [sketch, seedHex, tokenId, contract]);

  useEffect(() => { setHtmlUri(toDataHtmlBase64(html)); }, [html]);

  return (
    <div style={{ padding: 16 }}>
      <h2>Generative P5 — Dev Preview (data:text/html)</h2>
      <p style={{ fontSize: '0.9em' }}>
        Paste your sketch on the left, tweak seed inputs on the right and the sandboxed canvas below updates. Use
        <b>Capture Poster</b> to grab a PNG for previews.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <textarea value={sketch} onChange={(e) => setSketch(e.target.value)} rows={20} spellCheck={false} style={{ width: '100%' }} />
        <div>
          <label>contract</label><input value={contract} onChange={(e) => setContract(e.target.value)} style={{ width: '100%' }} />
          <label>tokenId</label><input type="number" value={tokenId} onChange={(e) => setTokenId(+e.target.value)} style={{ width: '100%' }} />
          <label>recipient</label><input value={recipient} onChange={(e) => setRecipient(e.target.value)} style={{ width: '100%' }} />
          <label>projectSalt</label><input value={projectSalt} onChange={(e) => setSalt(e.target.value)} style={{ width: '100%' }} />
          <p><b>seedHex:</b> {seedHex}</p>
          <button onClick={async () => {
            const png = await buildPosterPng(html, 90);
            const w = window.open();
            w.document.write(`<img src="${png}" style="image-rendering:pixelated;max-width:100%"/>`);
          }}>Capture Poster</button>
        </div>
      </div>
      <h3>Sandboxed Playback (consent assumed in dev)</h3>
      <iframe ref={iframeRef} title="p5-preview" src={htmlUri} sandbox="allow-scripts" style={{ width: 512, height: 512, border: '1px solid #555' }} />
    </div>
  );
}

/* What changed & why: dev viewer for data HTML + poster capture; no runtime wiring required. */
