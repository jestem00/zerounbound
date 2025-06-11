/*Developed by @jams2blues with love for the Tezos community
  File: src/ui/FileUploadPixel.jsx
  Rev:   r534
  Summary: Replace browser alerts with themed overlay warnings per invariant I00 */

import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import styledPkg from 'styled-components';
import PixelButton from './PixelButton.jsx';
import RenderMedia from '../utils/RenderMedia.jsx';
import PixelConfirmDialog from './PixelConfirmDialog.jsx';
import {
  MIME_TYPES, isMimeWhitelisted, mimeFromFilename,
} from '../constants/mimeTypes.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const ACCEPT = MIME_TYPES.join(',');

/* wrapper using our 8-bit theme and pixel font */
const Box = styled(PixelButton).withConfig({
  shouldForwardProp: (p) => !['$drag', '$has'].includes(p),
})`
  position: relative;
  margin: 0 auto;
  width: clamp(160px, 45vw, 280px);
  aspect-ratio: 1/1;
  padding: 0;
  background: var(--zu-bg-alt);
  border: 2px dashed var(--zu-fg);
  ${({ $drag }) => $drag && 'background: var(--zu-accent-sec);'}
  ${({ $has  }) => $has  && 'border-style: solid;'}
  overflow: hidden;

  img, video, model-viewer, iframe, audio {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`;

const Hint       = styled.span`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  font-size: clamp(.55rem, 2vw, .85rem);
  text-align: center;
  opacity: .75;
  color: var(--zu-fg);
`;
const ReplaceBtn = styled(PixelButton)`
  position: absolute;
  top: 4px;
  right: 4px;
  padding: 0 .45rem;
  font-size: .7rem;
  background: var(--zu-accent-sec);
`;
const ICON_RE = '↻';

export default function FileUploadPixel({
  value = '',
  onSelect = () => {},
  maxFileSize,
}) {
  const inpRef   = useRef(null);
  const [drag, setDrag]       = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const pick = useCallback(() => inpRef.current?.click(), []);

  const handleFiles = useCallback((files) => {
    const f = files?.[0];
    if (!f) return;
    if (maxFileSize && f.size > maxFileSize) {
      const receivedKB = (f.size / 1024).toFixed(1);
      const limitKB    = (maxFileSize / 1024).toFixed(1);
      setErrorMsg(`File too large: ${receivedKB} KB (max ${limitKB} KB)`);
      return;
    }
    const mime = f.type || mimeFromFilename(f.name);
    if (!isMimeWhitelisted(mime)) {
      setErrorMsg('Unsupported file type.');
      return;
    }
    const r = new FileReader();
    r.onload = (e) => e.target?.result && onSelect(e.target.result);
    r.readAsDataURL(f);
  }, [onSelect, maxFileSize]);

  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  const drop = (e) => { stop(e); setDrag(false); handleFiles(e.dataTransfer.files); };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const leave = () => setDrag(false);
    window.addEventListener('dragend',   leave);
    window.addEventListener('dragleave', leave);
    return () => {
      window.removeEventListener('dragend',   leave);
      window.removeEventListener('dragleave', leave);
    };
  }, []);

  return (
    <>
      <Box
        type="button"
        $drag={drag}
        $has={!!value}
        onClick={pick}
        onDragEnter={(e) => { stop(e); setDrag(true); }}
        onDragOver={stop}
        onDrop={drop}
      >
        {value ? (
          <>
            <RenderMedia uri={value} alt="preview" />
            <ReplaceBtn size="xs" title="Replace" onClick={(e) => { e.stopPropagation(); pick(); }}>
              {ICON_RE}
            </ReplaceBtn>
          </>
        ) : (
          <Hint>Click or drop file</Hint>
        )}
        <input
          ref={inpRef}
          type="file"
          accept={ACCEPT}
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </Box>

      {/* Themed overlay warning replacing alert() */}
      <PixelConfirmDialog
        open={!!errorMsg}
        message={errorMsg}
        onOk={() => setErrorMsg('')}
        onCancel={() => setErrorMsg('')}
      />
    </>
  );
}

/* What changed & why:
   • Introduced internal `errorMsg` state to capture validation errors.
   • Replaced native alert() calls with PixelConfirmDialog overlay,
     ensuring warnings follow our 8-bit retro theme (invariant I00).
   • Overlay is resolution-agnostic and uses pixel font and palette. */
