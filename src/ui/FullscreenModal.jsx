/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/FullscreenModal.jsx
  Rev :    r53    2025‑10‑24
  Summary: Polished production viewer
           • ORIGINAL resets to 100% natural size.
           • Fit‑on‑Screen, zoom % navigator, sticky HUD (fully
             hideable), native scrollbars, “which URI?” label,
             and prev/next that don’t close the modal.
           • Space‑drag pan (opt‑in): robust Photoshop‑style pan
             using PointerEvents + global Space tracking, prevents
             native dragstart, cancels UA touch panning while active,
             never toggles controls, resets on blur/visibility change.
           • Locks background page scroll (with scrollbar compensation)
             so the token page doesn’t shift.
──────────────────────────────────────────────────────────────*/

import React, {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import PropTypes from 'prop-types';
import styledPkg from 'styled-components';

import PixelButton from './PixelButton.jsx';
import RenderMedia from '../utils/RenderMedia.jsx';
import { pixelUpscaleStyle } from '../utils/pixelUpscale.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────────────────────── constants ─────────────────────────*/
const TOPMOST_Z          = 2147483000; // above any site header
const PAD                = 16;         // inner padding around art
const ZOOM_STEP          = 10;         // percent step for +/- buttons
const ZOOM_MAX           = 800;        // slider base max (grows with zoom)
const DRAG_THRESHOLD_PX  = 4;          // pixels before a drag is considered active

/*──────────────────────── persisted toggles ─────────────────*/
function usePersistentBool(key, def = false) {
  const [v, setV] = useState(def);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === 'true') setV(true);
      else if (raw === 'false') setV(false);
      else setV(def);
    } catch { setV(def); }
  }, [key, def]);
  const set = useCallback((next) => {
    setV(next);
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(key, next ? 'true' : 'false'); } catch {}
    }
  }, [key]);
  return [v, set];
}

/*──────────────────────── styled shells ─────────────────────*/
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${TOPMOST_Z};
  background: rgba(0,0,0,.92);
  display: ${({ $open }) => ($open ? 'flex' : 'none')};
  flex-direction: column;
  overflow: auto;                 /* Keep scrollbars for touch devices */
  overscroll-behavior: contain;
`;

const TopBar = styled.div`
  position: sticky;
  top: 0; left: 0; right: 0;
  z-index: ${TOPMOST_Z + 2};
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px;
  background: rgba(0,0,0,.55);
  border-bottom: 1px solid rgba(255,255,255,.12);
  font-size: .85rem; line-height: 1.2;
  user-select: none;
`;

const BottomBar = styled.div`
  position: sticky;
  bottom: 0; left: 0; right: 0;
  z-index: ${TOPMOST_Z + 2};
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  background: rgba(0,0,0,.55);
  border-top: 1px solid rgba(255,255,255,.12);
  font-size: .85rem; line-height: 1.2;
  user-select: none;
`;

const Viewport = styled.div`
  flex: 1 1 auto;
  position: relative;
  display: flex; align-items: center; justify-content: center;
  overflow: auto;               /* DO NOT hide – keeps native scrollbars */
  min-height: 0;
  padding: ${PAD}px;

  /* Focusable to capture Space (so checkboxes don't toggle) */
  outline: none;
  &:focus { outline: none; }

  /* Cursor + selection hints during Space‑drag */
  cursor: ${({ $space, $held, $drag }) =>
    $space ? ($held ? ($drag ? 'grabbing' : 'grab') : 'auto') : 'auto'};
  user-select: ${({ $drag }) => ($drag ? 'none' : 'auto')};

  /* Critical for touch/pointer stability: when Space is held (or a drag is active),
     disable UA touch panning/zooming so pointer streams aren't cancelled. */
  touch-action: ${({ $space, $held, $drag }) => ($space && ($held || $drag) ? 'none' : 'pan-x pan-y')};
`;

const MediaWrap = styled.div`
  position: relative;
  max-width: none;
  max-height: none;
  display: inline-flex; align-items: center; justify-content: center;

  /* Prevent the browser from stealing the interaction with native drag & drop */
  -webkit-user-drag: none;
  user-drag: none;

  /* Make sure images/SVGs don't become text-selection targets mid‑drag */
  img, svg, video, canvas, object {
    -webkit-user-drag: none;
    user-drag: none;
  }
`;

/* Close + arrows – hide when HUD hidden to avoid covering art */
const NavBtn = styled(PixelButton)`
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  z-index: ${TOPMOST_Z + 3};
  opacity: .9;
  &:hover { opacity: 1; }
`;
const NavPrev = styled(NavBtn)` left: 8px; `;
const NavNext = styled(NavBtn)` right: 8px; `;

const CloseBtn = styled(PixelButton)`
  position: fixed;
  top: 8px; right: 8px;
  z-index: ${TOPMOST_Z + 4};
`;

const HudNub = styled.button`
  position: fixed;
  bottom: 6px; right: 6px;
  z-index: ${TOPMOST_Z + 1};
  width: 18px; height: 18px;
  border: 1px solid rgba(255,255,255,.3);
  background: rgba(0,0,0,.25);
  color: #fff; font-size: 11px; line-height: 16px;
  border-radius: 3px; cursor: pointer; opacity: .45;
  user-select: none;
  &:hover { opacity: .85; }
`;

const Muted = styled.span` opacity: .85; `;
const VisuallyHidden = styled.span`
  position:absolute !important; height:1px;width:1px; overflow:hidden;
  clip: rect(1px,1px,1px,1px); white-space:nowrap;
`;

const ZoomSlider = styled.input.attrs({ type: 'range' })`
  -webkit-appearance: none; appearance: none;
  width: min(44vw, 420px);
  background: transparent;
  &::-webkit-slider-thumb{
    -webkit-appearance:none; width:14px; height:14px; border-radius:50%;
    background: var(--zu-accent); border: 2px solid var(--zu-fg);
  }
  &::-webkit-slider-runnable-track{
    background: var(--zu-track-bg,var(--zu-fg)); height:2px;
  }
`;

/*──────────────────────── helpers ───────────────────────────*/
function trimDataUri(uri = '') {
  const s = String(uri || '');
  if (!s.startsWith('data:')) return s;
  const [head] = s.split(',', 1);
  return `${head},…`;
}

/* Natural size measurement for images, video, and <object type="image/svg+xml"> */
function svgNaturalDims(objEl) {
  try {
    const root = objEl?.contentDocument?.documentElement;
    if (!root) return { w: 0, h: 0 };
    const vb   = root.viewBox?.baseVal;
    if (vb?.width && vb?.height) return { w: vb.width, h: vb.height };
    const wAtt = parseFloat(root.getAttribute('width'));
    const hAtt = parseFloat(root.getAttribute('height'));
    if (!Number.isNaN(wAtt) && !Number.isNaN(hAtt)) return { w: wAtt, h: hAtt };
  } catch { /* cross‑origin or absent */ }
  return { w: 0, h: 0 };
}
function measureNatural(el) {
  if (!el) return { w: 0, h: 0 };
  const w = el.naturalWidth  || el.videoWidth  || 0;
  const h = el.naturalHeight || el.videoHeight || 0;
  if (w && h) return { w, h };
  if (el.tagName === 'OBJECT') return svgNaturalDims(el);
  const rect = el.getBoundingClientRect();
  return { w: rect.width, h: rect.height };
}

/* Compute the “fit on screen” scale using current viewport + bars. */
function computeFitScale(natW, natH, viewportEl, topBarEl, bottomBarEl) {
  if (!natW || !natH) return 1;
  const vw   = (viewportEl?.clientWidth  ?? window.innerWidth);
  const vh   = (viewportEl?.clientHeight ?? window.innerHeight);
  const topH = topBarEl?.offsetHeight    ?? 0;
  const botH = bottomBarEl?.offsetHeight ?? 0;
  const availW = Math.max(1, vw - PAD * 2);
  const availH = Math.max(1, vh - PAD * 2 - topH - botH);
  return Math.min(availW / natW, availH / natH);
}
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/*──────────────────────── component ─────────────────────────*/
export default function FullscreenModal({
  open,
  onClose,

  /* current media */
  uri,
  mime,

  /* richer labels (optional but recommended) */
  currentKey,
  currentName,
  currentDescription,
  currentIndex,
  total,

  /* navigation */
  hasPrev = false,
  hasNext = false,
  onPrev,
  onNext,

  /* scripts (parent handles consent UX; we just honor it) */
  allowScripts = false,
  scriptHazard = false,

  className,
}) {
  /* HUD visibility — hides ALL chrome (bars, X, arrows). Persisted. */
  const [hudVisible, setHudVisible] = usePersistentBool('zu:fs:hud', true);

  /* Space‑drag pan (opt‑in; persisted). */
  const [spacePanEnabled, setSpacePanEnabled] = usePersistentBool('zu:fs:spacepan', false);
  const [spaceHeld, setSpaceHeld] = useState(false); // visual state for cursor + touch-action
  const spaceDownRef = useRef(false);                // physical Space key state (does not trigger renders)

  const [dragging, setDragging] = useState(false);

  /* Natural size + scaling */
  const mediaRef    = useRef(null);
  const viewportRef = useRef(null);
  const overlayRef  = useRef(null);
  const topRef      = useRef(null);
  const botRef      = useRef(null);

  const [nat, setNat]     = useState({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);      // relative to ORIGINAL size (100% = 1.0)
  const [fitBase, setFitBase] = useState(1);  // absolute scale to fit view

  /* Drag session (pointer events) */
  const dragRef = useRef({
    startX: 0, startY: 0, left: 0, top: 0, active: false, pointerId: null,
  });

  /*──────── body scroll lock (prevents background page from moving/resizing) ────────*/
  useEffect(() => {
    if (!open) return undefined;
    const html = document.documentElement;
    const body = document.body;

    const prevOverflow = body.style.overflow;
    const prevPadRight = body.style.paddingRight;
    const prevHtmlOverflow = html.style.overflow;

    const scrollBarW = window.innerWidth - html.clientWidth;
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    if (scrollBarW > 0) body.style.paddingRight = `${scrollBarW}px`;

    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadRight;
      html.style.overflow = prevHtmlOverflow;
    };
  }, [open]);

  /*──────── reset & measure on open/source change ─────────*/
  useEffect(() => {
    if (!open) return;
    setScale(1);                    // start at 100%
    // focus the viewport so Space won't toggle any checkbox
    setTimeout(() => viewportRef.current?.focus?.(), 0);
    setTimeout(() => {
      if (mediaRef.current) setNat(measureNatural(mediaRef.current));
    }, 0);
  }, [open, uri]);

  const onLoaded = useCallback(() => {
    if (mediaRef.current) {
      const dim = measureNatural(mediaRef.current);
      if (dim.w && dim.h) setNat(dim);
    }
  }, []);

  /* Recompute fit scale on resize or HUD visibility changes (bars occupy space) */
  useLayoutEffect(() => {
    if (!open || !nat.w) return undefined;
    const compute = () => setFitBase(
      computeFitScale(nat.w, nat.h, viewportRef.current, topRef.current, botRef.current),
    );
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [open, nat.w, nat.h, hudVisible]);

  /* Zoom controls: slider and +/- buttons (percent relative to original) */
  const pct = Math.round(scale * 100);
  const sliderMax = Math.max(ZOOM_MAX, Math.ceil(pct * 1.25));  // expands as you zoom in

  const setPct = (nextPercent) => {
    const v = clamp(Number(nextPercent) || 100, 1, 10000);
    setScale(v / 100);
  };
  const zoomIn     = () => setPct(pct + ZOOM_STEP);
  const zoomOut    = () => setPct(pct - ZOOM_STEP);
  const toOriginal = () => setPct(100);          // ← ORIGINAL = 100%
  const toFit      = () => setScale(fitBase || 1);

  /*──────── helper: is active element inside our viewport? ─────────*/
  const activeInsideViewport = useCallback(() => {
    if (!viewportRef.current) return false;
    const active = document.activeElement;
    return !!active && viewportRef.current.contains(active);
  }, []);

  /*──────── keyboard controls (scoped & respectful) ─────────*/
  useEffect(() => {
    if (!open) return undefined;

    const onKey = (e) => {
      const tag = String(e.target?.tagName || '').toLowerCase();
      const isFormEl = tag === 'input' || tag === 'textarea' || tag === 'select';

      const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';

      // Track physical Space key globally (doesn't cause render thrash)
      if (isSpace) {
        if (e.type === 'keydown') spaceDownRef.current = true;
        if (e.type === 'keyup')   spaceDownRef.current = false;
      }

      // Only *consume* Space when our viewport (or its descendants) are active.
      if (spacePanEnabled && isSpace && !isFormEl && activeInsideViewport()) {
        e.preventDefault(); // avoid page scroll / button activation
        if (e.type === 'keydown' && !e.repeat) setSpaceHeld(true);
        if (e.type === 'keyup') { setSpaceHeld(false); setDragging(false); }
      }

      if (e.type !== 'keydown') return;

      // Esc always closes
      if (e.key === 'Escape') { e.preventDefault(); onClose?.(); return; }

      // H toggles HUD
      if (e.key === 'h' || e.key === 'H') { e.preventDefault(); setHudVisible((v) => !v); return; }

      // Fit & Original, zoom shortcuts (no modifiers)
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === 'o' || e.key === 'O') { e.preventDefault(); toOriginal(); return; }
        if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toFit();      return; }
        if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomOut();    return; }
        if (e.key === '=' || e.key === '+' ) { e.preventDefault(); zoomIn();    return; }

        // Left/Right navigation (keeps modal open)
        if (e.key === 'ArrowLeft' && hasPrev && typeof onPrev === 'function') {
          e.preventDefault(); onPrev(); return;
        }
        if (e.key === 'ArrowRight' && hasNext && typeof onNext === 'function') {
          e.preventDefault(); onNext(); return;
        }
      }
    };

    // Capture phase ensures we see Space even if a child stops propagation
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
    };
  }, [open, hasPrev, hasNext, onPrev, onNext, onClose, spacePanEnabled, fitBase, pct, activeInsideViewport]);

  /* Reset Space state if tab loses focus or page becomes hidden */
  useEffect(() => {
    if (!open) return undefined;
    const reset = () => { spaceDownRef.current = false; setSpaceHeld(false); setDragging(false); };
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', reset);
    return () => {
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', reset);
    };
  }, [open]);

  /*──────── space‑drag panning with Pointer Events (mouse/touch/pen) ─────────*/
  const onPointerDown = useCallback((e) => {
    if (!spacePanEnabled) return;
    // Accept both: Space was pressed *before* the click OR we already set spaceHeld
    const spaceActive = spaceDownRef.current || spaceHeld;
    if (!spaceActive) return;

    const scroller = viewportRef.current;
    if (!scroller) return;

    // Focus the viewport so subsequent Space events remain scoped to it
    scroller.focus?.();

    const ct = e.currentTarget; // the Viewport element
    try { ct.setPointerCapture?.(e.pointerId); } catch {}

    // Initialize drag session; don't mark active until threshold crossed
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      left  : scroller.scrollLeft,
      top   : scroller.scrollTop,
      active: false,
      pointerId: e.pointerId,
    };

    // Prevent image selection right away
    e.preventDefault();
    setDragging(true);
  }, [spacePanEnabled, spaceHeld]);

  const onPointerMove = useCallback((e) => {
    if (!dragging || !dragRef.current) return;
    const scroller = viewportRef.current;
    if (!scroller) return;

    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    // Activate once the pointer moved enough (avoids stealing clicks)
    if (!dragRef.current.active) {
      if (Math.abs(dx) >= DRAG_THRESHOLD_PX || Math.abs(dy) >= DRAG_THRESHOLD_PX) {
        dragRef.current.active = true;
      } else {
        return; // still within threshold; don't prevent or scroll yet
      }
    }

    // Once active, we pan and prevent default behavior
    e.preventDefault();
    scroller.scrollLeft = dragRef.current.left - dx;
    scroller.scrollTop  = dragRef.current.top  - dy;
  }, [dragging]);

  const endPointerDrag = useCallback((e) => {
    if (!dragging) return;
    const ct = e?.currentTarget;
    try {
      if (ct && dragRef.current.pointerId != null) {
        ct.releasePointerCapture?.(dragRef.current.pointerId);
      }
    } catch { /* ignore */ }
    setDragging(false);
    dragRef.current.active = false;
    dragRef.current.pointerId = null;
  }, [dragging]);

  /* Cancel click after a real drag so media links aren't accidentally followed */
  const onClickCapture = useCallback((e) => {
    if (dragRef.current?.active) {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current.active = false; // reset the flag
    }
  }, []);

  /* Prevent native drag‑and‑drop from stealing the interaction while panning */
  const onDragStartCapture = useCallback((e) => {
    if (spacePanEnabled && (spaceHeld || spaceDownRef.current)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, [spacePanEnabled, spaceHeld]);

  /* Label for which URI we’re on */
  const label = useMemo(() => {
    const idxPart = Number.isFinite(currentIndex) && Number.isFinite(total)
      ? ` ${currentIndex + 1}/${total}`
      : '';
    const name    = currentName ? ` — ${currentName}` : '';
    if (currentKey) return `Extra: ${currentKey}${name}${idxPart}`;
    return `Artifact${name}${idxPart}`;
  }, [currentKey, currentName, currentIndex, total]);

  const mimeShort = (mime || '').split(';', 1)[0];

  /* Render metrics */
  const mediaStyle = {
    ...pixelUpscaleStyle(scale, mime),
    width : nat.w ? `${Math.max(1, Math.round(nat.w))}px` : undefined,
    height: nat.h ? `${Math.max(1, Math.round(nat.h))}px` : undefined,
    display: 'block',
    maxWidth: 'none',
    maxHeight: 'none',
  };

  return (
    <Overlay
      ref={overlayRef}
      $open={!!open}
      role="dialog"
      aria-modal="true"
      className={className}
    >
      {/* Top bar: which URI + MIME (fully hides with HUD) */}
      {hudVisible && (
        <TopBar ref={topRef}>
          <Muted style={{ fontWeight: 700 }}>{label}</Muted>
          <span style={{ flex: 1 }} />
          <Muted title={trimDataUri(uri)}>{mimeShort || 'unknown/unknown'}</Muted>
        </TopBar>
      )}

      {/* Artwork viewport – clicks do NOT close. Space‑drag is opt‑in. */}
      <Viewport
        ref={viewportRef}
        tabIndex={0}
        $space={spacePanEnabled}
        $held={spaceHeld}
        $drag={dragging}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointerDrag}
        onPointerCancel={endPointerDrag}
        onPointerLeave={endPointerDrag}
        onClickCapture={onClickCapture}
        onDragStartCapture={onDragStartCapture}
        /* Always re‑assert focus on interaction so Space remains scoped here */
        onMouseDown={() => viewportRef.current?.focus?.()}
        onTouchStart={() => viewportRef.current?.focus?.()}
        onMouseUp={() => viewportRef.current?.focus?.()}
        onTouchEnd={() => viewportRef.current?.focus?.()}
      >
        <MediaWrap>
          <RenderMedia
            ref={mediaRef}
            uri={uri}
            mime={mime}
            allowScripts={scriptHazard ? !!allowScripts : false}
            style={mediaStyle}
            onLoad={onLoaded}
            onLoadedMetadata={onLoaded}
            /* No inner fullscreen overlay; we’re already full-screen modal */
            fsOverlay={false}
            onRequestFullscreen={() => {}}
            /* Also block native drag directly on the media if it bubbles here */
            draggable={false}
          />
          {(currentDescription || currentName) && (
            <VisuallyHidden id="fs-desc">
              {currentName ? `${currentName}. ` : ''}{currentDescription || ''}
            </VisuallyHidden>
          )}
        </MediaWrap>
      </Viewport>

      {/* Bottom action bar (fully hides with HUD) */}
      {hudVisible && (
        <BottomBar ref={botRef}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <PixelButton $noActiveFx onClick={toOriginal} title="Original size (O)">ORIGINAL</PixelButton>
            <PixelButton $noActiveFx onClick={toFit} title="Fit on screen (F)">FIT&nbsp;ON&nbsp;SCREEN</PixelButton>
          </div>

          {/* Zoom percent navigator + slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PixelButton size="xs" $noActiveFx onClick={zoomOut} aria-label="Zoom out">–</PixelButton>
            <span
              style={{
                minWidth: 56, textAlign: 'center',
                font: '700 .8rem/1 PixeloidSans,monospace',
                color: 'var(--zu-fg)',
              }}
              aria-live="polite"
            >
              {pct}%
            </span>
            <PixelButton size="xs" $noActiveFx onClick={zoomIn} aria-label="Zoom in">+</PixelButton>
            <ZoomSlider
              min="10"
              max={sliderMax}
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              aria-label="Zoom percent"
              title="Drag to zoom"
            />
          </div>

          {/* Space‑drag toggle + HUD/Close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={!!spacePanEnabled}
                onChange={(e) => setSpacePanEnabled(!!e.target.checked)}
                aria-label="Enable spacebar navigation (hold Space to drag‑pan)"
              />
              Enable&nbsp;spacebar&nbsp;navigation&nbsp;👆
            </label>

            <PixelButton $noActiveFx onClick={() => setHudVisible((v) => !v)} title="Hide HUD (H)">
              {hudVisible ? 'HIDE HUD' : 'SHOW HUD'}
            </PixelButton>
            <PixelButton $noActiveFx onClick={onClose} title="Close (Esc)">CLOSE</PixelButton>
          </div>
        </BottomBar>
      )}

      {/* Close and arrows — hidden when HUD is hidden */}
      {hudVisible && (
        <>
          <CloseBtn $noActiveFx aria-label="Close viewer" onClick={onClose}>✕</CloseBtn>
          {hasPrev && <NavPrev $noActiveFx aria-label="Previous media" onClick={onPrev}>◀</NavPrev>}
          {hasNext && <NavNext $noActiveFx aria-label="Next media" onClick={onNext}>▶</NavNext>}
        </>
      )}

      {/* Always‑available nub to restore HUD */}
      {!hudVisible && (
        <HudNub aria-label="Show controls (H)" onClick={() => setHudVisible(true)} title="Show controls (H)">H</HudNub>
      )}
    </Overlay>
  );
}

FullscreenModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,

  uri : PropTypes.string.isRequired,
  mime: PropTypes.string,

  /* optional richer labeling (enables “which URI?” display) */
  currentKey        : PropTypes.string,
  currentName       : PropTypes.string,
  currentDescription: PropTypes.string,
  currentIndex      : PropTypes.number,
  total             : PropTypes.number,

  hasPrev: PropTypes.bool,
  hasNext: PropTypes.bool,
  onPrev : PropTypes.func,
  onNext : PropTypes.func,

  allowScripts: PropTypes.bool,
  scriptHazard: PropTypes.bool,

  className: PropTypes.string,
};

FullscreenModal.defaultProps = {
  open: false,
  onClose: () => {},
  mime: '',
  currentKey: '',
  currentName: '',
  currentDescription: '',
  currentIndex: undefined,
  total: undefined,
  hasPrev: false,
  hasNext: false,
  onPrev: undefined,
  onNext: undefined,
  allowScripts: false,
  scriptHazard: false,
  className: '',
};

/* What changed & why (r53):
   • FIX: Space‑pan “stops after a moment” — caused by native dragstart or UA
     touch panning cancelling pointer events. We now:
       – prevent dragstart while panning (capture phase) and add -webkit-user-drag:none;
       – set touch-action:none while Space is held or a drag is active;
       – capture/release the pointer properly; handle pointerleave as safety.
   • UX: Global Space tracking via ref so pressing Space *before* clicking in
     the art works; preventDefault only when viewport is active so UI controls
     never toggle or scroll.
   • Kept: ORIGINAL=100%, FIT, zoom slider/±, sticky HUD that hides all
     chrome (+nub), preserved scrollbars, background scroll‑lock with
     scrollbar compensation, and which‑URI labeling + prev/next. */
/* EOF */
