/*Developed by @jams2blues with love for the Tezos community
  File: src/ui/Entrypoints/MintPreview.jsx
  Summary: lightweight preview using existing RenderMedia util; auto‑loads
           <model-viewer> for 3D content. */

import React, { useEffect } from 'react';
import styledPkg from 'styled-components';
import PixelHeading from '../PixelHeading.jsx';
import RenderMedia from '../../utils/RenderMedia.jsx';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Wrap = styled.section`
  margin-top: 1rem;
  text-align: center;
`;

/* inject model‑viewer if not present */
const ensureMV = () => {
  if (typeof window === 'undefined') return;
  if (window.customElements?.get('model-viewer')) return;
  const s = document.createElement('script');
  s.type = 'module';
  s.src = 'https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js';
  document.head.appendChild(s);
};

export default function MintPreview({ dataUrl, fileName = '' }) {
  useEffect(ensureMV, []);
  if (!dataUrl) return null;

  return (
    <Wrap>
      <PixelHeading level={5} style={{ marginBottom: '.4rem' }}>
        Preview
      </PixelHeading>
      <RenderMedia
        uri={dataUrl}
        alt={fileName}
        style={{
          maxWidth: '100%',
          maxHeight: 300,
          objectFit: 'contain',
          border: '1px solid var(--zu-fg)',
        }}
      />
    </Wrap>
  );
}

/* What changed & why: avoids duplicating media‑render logic, relies on
   RenderMedia util; respects performance invariant I06. */
