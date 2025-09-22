/*
  Developed by @jams2blues - ZeroContract Studio
  File:    src/ui/Entrypoints/MintPreview.jsx
  Rev :    r709   2025-09-19 UTC
  Summary: Keeps the branded frame, moves consent to a compact footer hint, and leaves fallback art unobstructed.
*/
import React, { useEffect, useMemo, useState } from 'react';
import styledPkg from 'styled-components';
import PixelHeading from '../PixelHeading.jsx';
import RenderMedia from '../../utils/RenderMedia.jsx';
import { EnableScriptsToggle } from '../EnableScripts.jsx';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*-------- styled shells -----------------------------------*/
const Wrap = styled('section').withConfig({
  shouldForwardProp: (p) => p !== '$level',
})`
  margin-top: 1rem;
  text-align: center;
  position: relative;
  z-index: ${(p) => p.$level ?? 'auto'};
`;

const Frame = styled.div`
  width: clamp(180px, min(80vw, 420px), 420px);
  aspect-ratio: 1 / 1;
  margin: 0 auto;
  position: relative;
  border: 1px solid rgba(12, 255, 255, 0.28);
  border-radius: 16px;
  overflow: hidden;
  background:
    radial-gradient(circle at 30% 25%, rgba(255, 255, 255, 0.08), transparent 55%),
    radial-gradient(circle at 68% 78%, rgba(12, 255, 255, 0.12), transparent 60%),
    rgba(3, 8, 22, 0.92);
  box-shadow:
    0 18px 40px rgba(0, 0, 0, 0.45),
    inset 0 0 0 1px rgba(12, 255, 255, 0.18);
`;

const GateHint = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.45rem;
  margin-top: 0.4rem;
  color: rgba(255, 255, 255, 0.65);
  font-size: 0.72rem;
`;

/*-------- helpers -----------------------------------------*/
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

function mimeFromDataUri(uri = '') {
  if (!uri.startsWith('data:')) return '';
  return uri.slice(5).split(/[;,]/)[0] || '';
}

const HTML_MIME = 'text/html';
const ZIP_MIMES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/x-directory',
]);

/*-------- component ---------------------------------------*/
export default function MintPreview({ dataUrl = '', fileName = '', $level }) {
  const [allowScripts, setAllowScripts] = useState(false);
  useEffect(ensureModelViewer, []);

  const mime = useMemo(() => mimeFromDataUri(dataUrl), [dataUrl]);
  const normalizedMime = useMemo(() => (mime || '').toLowerCase(), [mime]);
  const scriptHazard = normalizedMime === HTML_MIME || ZIP_MIMES.has(normalizedMime);

  useEffect(() => { setAllowScripts(false); }, [dataUrl]);

  if (!dataUrl) return null;

  return (
    <Wrap $level={$level}>
      <PixelHeading level={5} style={{ marginBottom: '.6rem', letterSpacing: '.04em' }}>
        Preview
      </PixelHeading>

      <Frame>
        <RenderMedia
          uri={dataUrl}
          mime={mime || undefined}
          allowScripts={scriptHazard && allowScripts}
          alt={fileName}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            background: scriptHazard && !allowScripts ? 'rgba(0, 0, 0, 0.65)' : 'transparent',
          }}
        />
      </Frame>

      {scriptHazard && !allowScripts && (
        <GateHint>
          <span aria-live='polite'>Scripts disabled</span>
          <EnableScriptsToggle onToggle={() => setAllowScripts(true)}>
            {String.fromCharCode(0x26A1)} enable scripts
          </EnableScriptsToggle>
        </GateHint>
      )}
    </Wrap>
  );
}
/* What changed & why (r709):
   - Replaced the blocking overlay with a footer hint so fallbacks stay fully visible.
   - Added a compact enable-scripts button that mirrors marketplace cards.
   - Left the render pipeline intact so enabling scripts still refreshes the sandboxed iframe.
*/

