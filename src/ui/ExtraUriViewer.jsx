/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/ExtraUriViewer.jsx
  Rev :    r2     2025‑10‑24
  Summary: Lightweight overlay modal to browse between artifactUri
           and extra URIs with infinite‑wrap navigation and an
           unobtrusive UI that never covers the art. Includes a
           download action and optional jump to FullscreenModal.

           r2: Supports both controlled and uncontrolled modes:
               • Controlled:   index + onPrev/onNext (parent manages)
               • Uncontrolled: initialIndex (viewer manages). Also adds
                 ←/→ keyboard nav, stricter prop types, script‑hazard
                 gating compatibility, and polished close‑on‑outside‑click.
──────────────────────────────────────────────────────────────*/

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import PropTypes from 'prop-types';
import styledPkg from 'styled-components';

import PixelButton from './PixelButton.jsx';
import RenderMedia from '../utils/RenderMedia.jsx';
import detectHazards from '../utils/hazards.js';
import { preferredExt } from '../constants/mimeTypes.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────────────────────── styled ─────────────────────────*/
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0,0,0,.2); /* subtle; art remains fully visible */
  display: ${({ $open }) => ($open ? 'flex' : 'none')};
  align-items: center;
  justify-content: center;
  padding: clamp(8px, 2vw, 16px);
  pointer-events: ${({ $open }) => ($open ? 'auto' : 'none')};
`;

const Frame = styled.div`
  position: relative;
  width: min(96vw, 1600px);
  height: min(88vh, 980px);
  display: flex;
  align-items: center;
  justify-content: center;
  /* No background to avoid obscuring art; only a faint border */
  border: 1px solid rgba(255,255,255,.15);
  border-radius: 6px;
  pointer-events: auto;
`;

const Arrow = styled(PixelButton)`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  opacity: .9;
  background: rgba(0,0,0,.15);
  &:hover { opacity: 1; }
`;

const LeftArrow  = styled(Arrow)` left:  -12px; `;
const RightArrow = styled(Arrow)` right: -12px; `;

const CloseBtn = styled(PixelButton)`
  position: absolute;
  top: -12px;
  right: -12px;
`;

const BottomBar = styled.div`
  position: absolute;
  bottom: -44px;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  pointer-events: auto;
`;

const HiddenNotice = styled.div`
  position: absolute;
  inset: 0;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size: .95rem;
  opacity:.9;
`;

/*──────────────────────── utils ─────────────────────────*/
function cleanFilename(s = '') {
  return String(s).replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 96) || 'file';
}

function clampIndex(len, idx) {
  if (!len) return 0;
  const n = Number(idx) || 0;
  return ((n % len) + len) % len;
}

/*──────────────────────── component ─────────────────────────*/
export default function ExtraUriViewer({
  /* visibility */
  open,
  onClose = () => {},

  /* media list */
  uris = [],              // [{ value, mime, name, key }]
  index,                  // controlled index (optional)
  initialIndex = 0,       // uncontrolled starting point (optional)

  /* nav handlers for controlled mode */
  onPrev,                 // () => void
  onNext,                 // () => void

  /* action handlers */
  onFullscreen = () => {},

  /* meta */
  tokenName = '',
  tokenId = undefined,

  /* script hazard gating compatibility:
     Option A (boolean): allowScripts
     Option B (fine‑grained): tokenScripts + tokenAllowJs
  */
  allowScripts = false,
  tokenScripts = false,       // is the current media flagged as scripts?
  tokenAllowJs = false,       // has the user granted permission?

  /* hazard hiding from parent (e.g., NSFW/flash gate) */
  hideForHazard = false,

  /* optional callbacks (not surfaced in r2 UI, kept for parity) */
  onRequestScriptReveal,      // (type) => void (e.g., 'scripts')
  onToggleScript,             // (val:boolean) => void
}) {
  const len = Array.isArray(uris) ? uris.length : 0;

  // Mode detection: controlled vs uncontrolled.
  const isControlled = Number.isFinite(index);
  const [localIdx, setLocalIdx] = useState(clampIndex(len, initialIndex));

  // Reset local index when the viewer opens or list changes.
  useEffect(() => {
    if (!open) return;
    setLocalIdx(clampIndex(len, initialIndex));
  }, [open, len, initialIndex]);

  const effectiveIndex = isControlled
    ? clampIndex(len, index)
    : clampIndex(len, localIdx);

  const active = uris[effectiveIndex] || { value: '', mime: '' };

  // Hazards for current asset (only relevant for Real render).
  const hazards = useMemo(
    () => detectHazards({ artifactUri: active.value, mimeType: active.mime }),
    [active.value, active.mime],
  );

  // Scripts allowed?
  const canRunScripts = hazards.scripts
    ? (tokenScripts ? !!tokenAllowJs : !!allowScripts)
    : false;

  // Local nav (wrap) for uncontrolled mode.
  const goPrevLocal = useCallback(() => {
    if (!len) return;
    setLocalIdx((i) => (i - 1 + len) % len);
  }, [len]);
  const goNextLocal = useCallback(() => {
    if (!len) return;
    setLocalIdx((i) => (i + 1) % len);
  }, [len]);

  // Dispatch to parent when controlled; otherwise use local.
  const goPrev = useCallback(() => {
    if (isControlled && typeof onPrev === 'function') onPrev();
    else goPrevLocal();
  }, [isControlled, onPrev, goPrevLocal]);

  const goNext = useCallback(() => {
    if (isControlled && typeof onNext === 'function') onNext();
    else goNextLocal();
  }, [isControlled, onNext, goNextLocal]);

  // Close on Escape + ←/→ keyboard nav.
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      const tag = String((e.target && e.target.tagName) || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goPrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, goPrev, goNext]);

  // Click outside frame closes viewer.
  const frameRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e) => {
      if (!frameRef.current) return;
      if (!frameRef.current.contains(e.target)) onClose();
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [open, onClose]);

  // Download current asset (data: or inline URL).
  const download = useCallback(() => {
    const mime = active.mime || 'application/octet-stream';
    const base = tokenName || active.name || (tokenId != null ? `token-${tokenId}` : 'token');
    const ext  = preferredExt(mime);
    const file = cleanFilename(`${base}_${String(effectiveIndex).padStart(2, '0')}.${ext}`);
    const a = document.createElement('a');
    a.href = active.value;
    a.download = file;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    requestAnimationFrame(() => a.remove());
  }, [active.mime, active.name, active.value, tokenName, tokenId, effectiveIndex]);

  return (
    <Overlay $open={!!open} role="dialog" aria-modal="true" aria-label="Extra media viewer">
      <Frame ref={frameRef}>
        {len > 1 && (
          <>
            <LeftArrow  $noActiveFx aria-label="Previous" onClick={goPrev}>◀</LeftArrow>
            <RightArrow $noActiveFx aria-label="Next"     onClick={goNext}>▶</RightArrow>
          </>
        )}
        <CloseBtn $noActiveFx aria-label="Close" onClick={onClose}>✕</CloseBtn>

        {!hideForHazard && (
          <RenderMedia
            uri={active.value}
            mime={active.mime}
            allowScripts={canRunScripts}
            /* ensure it never covers the art area; it fits within Frame */
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        )}

        {hideForHazard && (
          <HiddenNotice>
            <span>Hidden due to NSFW/Flashing hazard.</span>
          </HiddenNotice>
        )}

        <BottomBar>
          <PixelButton $noActiveFx onClick={download} aria-label="Download this file">
            DOWNLOAD
          </PixelButton>
          <PixelButton $noActiveFx onClick={onFullscreen} aria-label="Open fullscreen">
            FULLSCREEN
          </PixelButton>
          {len > 1 && (
            <span style={{ fontSize: '.85rem', opacity: .9 }}>
              {effectiveIndex + 1} / {len}
            </span>
          )}
        </BottomBar>
      </Frame>
    </Overlay>
  );
}

ExtraUriViewer.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,

  uris: PropTypes.arrayOf(PropTypes.shape({
    key        : PropTypes.string,
    name       : PropTypes.string,
    description: PropTypes.string,
    value      : PropTypes.string,
    mime       : PropTypes.string,
  })),

  // Controlled mode
  index    : PropTypes.number,
  onPrev   : PropTypes.func,
  onNext   : PropTypes.func,

  // Uncontrolled mode
  initialIndex: PropTypes.number,

  // Actions
  onFullscreen: PropTypes.func,

  // Meta
  tokenName: PropTypes.string,
  tokenId  : PropTypes.oneOfType([PropTypes.string, PropTypes.number]),

  // Script hazard gating
  allowScripts   : PropTypes.bool,
  tokenScripts   : PropTypes.bool,
  tokenAllowJs   : PropTypes.bool,
  onToggleScript : PropTypes.func,
  onRequestScriptReveal: PropTypes.func,

  // Hazard hide
  hideForHazard: PropTypes.bool,
};

ExtraUriViewer.defaultProps = {
  open: false,
  onClose: () => {},
  uris: [],
  index: undefined,
  onPrev: undefined,
  onNext: undefined,
  initialIndex: 0,
  onFullscreen: () => {},
  tokenName: '',
  tokenId: undefined,
  allowScripts: false,
  tokenScripts: false,
  tokenAllowJs: false,
  onToggleScript: undefined,
  onRequestScriptReveal: undefined,
  hideForHazard: false,
};
/* EOF */
