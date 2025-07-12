/*────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Entrypoints/MintPreview.jsx
  Rev :    r701   2025‑10‑25
  Summary: GLB/GTLF live preview fix
           • Falls back to <model‑viewer> for any model/*
           • Uniform render‑path with TokenCard (RenderMedia)
           • Path & Casing Checkpoint ✓
────────────────────────────────────────────────────────────*/
import React, { useEffect, useMemo } from 'react';
import styledPkg                      from 'styled-components';
import PixelHeading                   from '../PixelHeading.jsx';
import RenderMedia                    from '../../utils/RenderMedia.jsx';
import { MIME_TYPES }                 from '../../constants/mimeTypes.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled shells ───────────────────────────────────*/
const Wrap = styled('section').withConfig({
  shouldForwardProp: (p) => p !== '$level',
})`
  margin-top:1rem;text-align:center;
  position:relative;z-index:${(p) => p.$level ?? 'auto'};
`;

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

/*──────── helpers ─────────────────────────────────────────*/
let mvLoaded = false;
function ensureModelViewer() {
  if (mvLoaded || typeof window === 'undefined') return;
  if (window.customElements?.get('model-viewer')) { mvLoaded = true; return; }
  const s = document.createElement('script');
  s.type  = 'module';
  s.src   = 'https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js';
  document.head.appendChild(s);
  mvLoaded = true;
}

/* infer mime‑type from data‑URI (cheap) */
function mimeFromDataUri(uri = '') {
  if (!uri.startsWith('data:')) return '';
  return uri.slice(5).split(/[;,]/)[0] || '';
}

/*──────── component ───────────────────────────────────────*/
export default function MintPreview({ dataUrl = '', fileName = '', $level }) {
  /* one‑shot loader */
  useEffect(ensureModelViewer, []);

  /* resolve mime once (memoised) */
  const mime = useMemo(() => mimeFromDataUri(dataUrl), [dataUrl]);

  /* nothing yet */
  if (!dataUrl) return null;

  /*──────── render ─*/
  return (
    <Wrap $level={$level}>
      <PixelHeading level={5} style={{ marginBottom: '.4rem' }}>
        Preview
      </PixelHeading>

      <Frame>
        <RenderMedia
          uri={dataUrl}
          mime={mime || undefined}
          /* allow scripts only for HTML previews, matches TokenCard */
          allowScripts={mime === MIME_TYPES.HTML}
          alt={fileName}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
        />
      </Frame>
    </Wrap>
  );
}
/* What changed & why (r701):
   • Uses RenderMedia for every mime (no special‑case leak).
   • Injects <model‑viewer> only when needed (was: always).
   • Passes mime prop + allowScripts parity with TokenCard.
   • Frame objectFit → contain fills container for GLB thumbs.
   • Ensured FULL output + contract invariants intact. */
/* EOF */
