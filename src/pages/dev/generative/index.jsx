/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/dev/generative/index.jsx
  Rev :    r1   2025-09-07
  Summary: Hub page listing generative dev tools.
──────────────────────────────────────────────────────────────*/
import React from 'react';
import Link from 'next/link';

export default function GenerativeDevIndex() {
  return (
    <div style={{ padding: 16 }}>
      <h2>Generative Dev Tools</h2>
      <ul>
        <li><Link href="/dev/generative/p5-lab">P5 Preview Lab</Link></li>
        <li><Link href="/dev/generative/p5-wizard">P5 Generator Wizard</Link></li>
      </ul>
    </div>
  );
}

/* What changed & why: add landing page for dev routes. */
