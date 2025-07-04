/*──────── src/ui/Entrypoints/MintPreview.jsx ────────*/
/* Developed by @jams2blues – ZeroContract Studio
   File:    src/ui/Entrypoints/MintPreview.jsx
   Rev :    r700   2025-09-14
   Summary: Square preview frame + intrinsic sizing
            • New <Frame> with aspect-ratio 1/1
            • RenderMedia now width:auto height:auto – no distortion
            • No runtime behaviour changes elsewhere                */
import React, { useEffect } from 'react';
import styledPkg            from 'styled-components';
import PixelHeading         from '../PixelHeading.jsx';
import RenderMedia          from '../../utils/RenderMedia.jsx';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Wrap = styled('section').withConfig({ shouldForwardProp: (p) => p !== '$level' })`
  margin-top:1rem;text-align:center;
  position:relative;z-index:${(p) => p.$level ?? 'auto'};
`;

/* square container – ensures SVGs rendered via <object>
   keep their native aspect-ratio regardless of parent width */
const Frame = styled.div`
  width:clamp(120px,100%,320px);
  max-width:100%;
  max-height:320px;
  aspect-ratio:1/1;
  margin:0 auto;
  display:flex;
  align-items:center;
  justify-content:center;
  border:1px solid var(--zu-fg);
`;

/* inject <model-viewer> script only once */
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

      <Frame>
        <RenderMedia
          uri={dataUrl}
          alt={fileName}
          style={{
            width: 'auto',
            height: 'auto',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
          }}
        />
      </Frame>
    </Wrap>
  );
}
/* EOF */
