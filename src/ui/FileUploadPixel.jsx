/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/FileUploadPixel.jsx
  Rev :    r538   2025‑07‑25
  Summary: div wrapper (no nested <button>); hover cursor
──────────────────────────────────────────────────────────────*/
import React, { useCallback, useEffect, useRef, useState } from 'react';
import styledPkg      from 'styled-components';
import PixelButton    from './PixelButton.jsx';
import RenderMedia    from '../utils/RenderMedia.jsx';
import PixelConfirmDialog from './PixelConfirmDialog.jsx';
import {
  MIME_TYPES, isMimeWhitelisted, mimeFromFilename,
} from '../constants/mimeTypes.js';
import { checkOnChainIntegrity } from '../utils/onChainValidator.js';
import { getIntegrityInfo }      from '../constants/integrityBadges.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;
const ACCEPT = MIME_TYPES.join(',');

/* visual drop‑zone box (DIV to avoid nested‑button warning) */
const Box = styled.div.withConfig({
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
  cursor: pointer;
  user-select: none;

  img, video, model-viewer, iframe, audio {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`;

const Hint = styled.span`
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
  const inpRef = useRef(null);
  const [drag, setDrag]   = useState(false);
  const [dialog, setDialog] = useState({ open:false, msg:'', next:null });

  const pick = useCallback(() => inpRef.current?.click(), []);

  const scanIntegrity = useCallback((uri) => {
    try {
      const [, b64 = ''] = uri.split(',');
      const raw = atob(b64);
      return checkOnChainIntegrity({ artifactUri: uri, body: raw });
    } catch {
      return { status: 'unknown', reasons: ['decode error'] };
    }
  }, []);

  const handle = useCallback((files) => {
    const f = files?.[0];
    if (!f) return;

    if (maxFileSize && f.size > maxFileSize) {
      setDialog({ open:true, msg:`File > ${(maxFileSize/1024).toFixed(1)} KB`, next:null });
      return;
    }
    const mime = f.type || mimeFromFilename(f.name);
    if (!isMimeWhitelisted(mime)) {
      setDialog({ open:true, msg:'Unsupported file type', next:null });
      return;
    }

    const r = new FileReader();
    r.onload = (e) => {
      const uri  = e.target?.result;
      const res  = scanIntegrity(uri);
      const { badge, label } = getIntegrityInfo(res.status);

      setDialog({
        open:true,
        msg : `${badge}  ${label}\n${res.reasons.length ? res.reasons.join('; ') : 'No issues detected'}`,
        next: () => onSelect(uri),
      });
    };
    r.readAsDataURL(f);
  }, [maxFileSize, onSelect, scanIntegrity]);

  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  const drop = (e) => { stop(e); setDrag(false); handle(e.dataTransfer.files); };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const leave = () => setDrag(false);
    window.addEventListener('dragend', leave);
    window.addEventListener('dragleave', leave);
    return () => {
      window.removeEventListener('dragend', leave);
      window.removeEventListener('dragleave', leave);
    };
  }, []);

  return (
    <>
      <Box
        role="button"
        aria-label="Upload media"
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
            <ReplaceBtn
              size="xs"
              title="Replace"
              onClick={(e) => { e.stopPropagation(); pick(); }}
            >
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
          style={{ display:'none' }}
          onChange={(e) => handle(e.target.files)}
        />
      </Box>

      <PixelConfirmDialog
        open={dialog.open}
        message={dialog.msg}
        onOk={() => { dialog.next?.(); setDialog({ open:false,msg:'',next:null }); }}
        onCancel={() => setDialog({ open:false,msg:'',next:null })}
      />
    </>
  );
}
/* What changed & why:
   • Replaced PixelButton wrapper with DIV to avoid nested button error.
   • Added pointer cursor + role attr.
   • Relies on revised validator r6 (binary‑safe).
   • Rev bumped to r538.
*/
/* EOF */
