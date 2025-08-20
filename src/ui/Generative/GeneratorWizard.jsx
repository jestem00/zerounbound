/*─────────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File: src/ui/Generative/GeneratorWizard.jsx
Rev:  r2   2025‑08‑20 UTC
Summary: Creator wizard to build p5 HTML artifacts + poster PNG + attributes.
──────────────────────────────────────────────────────────────────*/

import React, { useMemo, useState } from 'react';
import { deriveSeedHex } from '../../utils/generativeSeed.js';
import { buildP5Html, toDataHtmlBase64, buildPosterPng, downscalePng } from '../../modules/generative/p5/buildP5Html.js';

export default function GeneratorWizard({ contract, nextTokenId, recipient, onExport }) {
  const [projectName, setProjectName] = useState('MyP5Project');
  const [salt, setSalt] = useState('ZU-PROJ');
  const [frame, setFrame] = useState(90);
  const [sketchSource, setSketchSource] = useState(
`// paste your p5 sketch here
function setup(){createCanvas(800,800);randomSeed(123);noiseSeed(123)}
function draw(){background(0);stroke(255);for(let i=0;i<200;i++){point(random(width),random(height))}}`
  );

  const seedHex = useMemo(() => deriveSeedHex(contract || '', nextTokenId ?? 0, recipient || '', salt || ''), [contract, nextTokenId, recipient, salt]);
  const html = useMemo(() => buildP5Html({ sketchSource, seedHex, tokenId: nextTokenId ?? 0, contract: contract || '', projectName }), [sketchSource, seedHex, nextTokenId, contract, projectName]);

  const doExport = async () => {
    const artifactUri = toDataHtmlBase64(html);
    const displayUri = await buildPosterPng(html, frame);
    const thumbnailUri = await downscalePng(displayUri, 512);
    const tokenMeta = {
      mimeType: 'text/html',
      artifactUri,
      displayUri,
      thumbnailUri,
      accessibility: { hazards: ['scripts'] },
      attributes: [
        { name: 'engine', value: 'p5' },
        { name: 'seed', value: seedHex.slice(0, 16) + '…' },
      ],
    };
    onExport?.({ tokenMeta, html, artifactUri, displayUri, thumbnailUri, seedHex });
  };

  return (
    <div style={{ padding: 12, maxWidth: 960 }}>
      <h3>Generative P5 Wizard</h3>
      <label>Project name</label><input value={projectName} onChange={(e) => setProjectName(e.target.value)} style={{ width: '100%' }} />
      <label>Project salt</label><input value={salt} onChange={(e) => setSalt(e.target.value)} style={{ width: '100%' }} />
      <label>Poster frame (frames ~ 60fps)</label><input type="number" value={frame} onChange={(e) => setFrame(parseInt(e.target.value, 10) || 0)} style={{ width: '100%' }} />
      <label>Sketch source (p5)</label>
      <textarea rows={18} value={sketchSource} onChange={(e) => setSketchSource(e.target.value)} spellCheck={false} style={{ width: '100%' }} />
      <p>seedHex: <code>{seedHex}</code></p>
      <button onClick={doExport}>Build token metadata</button>
    </div>
  );
}

/* What changed & why: wizard builds text/html artifact + PNG posters; no ZIP/formats. */
