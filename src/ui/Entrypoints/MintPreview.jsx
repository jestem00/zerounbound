/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/MintPreview.jsx
  Rev :    r699   2025-06-25
  Summary: $level aware shell, guard once for model-viewer,
           small responsive tweaks, ESLint clean
──────────────────────────────────────────────────────────────*/
import React, { useEffect } from 'react';
import styledPkg            from 'styled-components';
import PixelHeading         from '../PixelHeading.jsx';
import RenderMedia          from '../../utils/RenderMedia.jsx';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Wrap = styled('section').withConfig({ shouldForwardProp: (p) => p !== '$level' })`
  margin-top:1rem;text-align:center;
  position:relative;z-index:${(p) => p.$level ?? 'auto'};
`;

/* inject <model-viewer> only once per page */
let mvLoaded = false;
function ensureModelViewer() {
  if (mvLoaded || typeof window === 'undefined') return;
  if (window.customElements?.get('model-viewer')) { mvLoaded = true; return; }
  const s = document.createElement('script');
  s.type = 'module';
  s.src = 'https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js';
  document.head.appendChild(s);
  mvLoaded = true;
}

export default function MintPreview({ dataUrl, fileName = '', $level }) {
  useEffect(ensureModelViewer, []);
  if (!dataUrl) return null;

  return (
    <Wrap $level={$level}>
      <PixelHeading level={5} style={{ marginBottom: '.4rem' }}>
        Preview
      </PixelHeading>
      <RenderMedia
        uri={dataUrl}
        alt={fileName}
        style={{
          maxWidth: '100%',
          maxHeight: 320,
          objectFit: 'contain',
          border: '1px solid var(--zu-fg)',
        }}
      />
    </Wrap>
  );
}
/* EOF */
