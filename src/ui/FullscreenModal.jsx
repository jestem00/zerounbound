/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/FullscreenModal.jsx
  Rev :    r16    2025‑08‑10 UTC
  Summary: Adds UI‑hide toggles + safer layout
           • Keyboard: press H to hide/show controls (no modifiers).
           • Mobile: two‑finger tap OR 600 ms long‑press toggles.
           • Close moved to top‑left (avoid hamburger overlap).
           • Extremely high z‑index to beat any global header.
           • Ephemeral key/gesture hint (auto‑fades).
           • Keeps r15 changes (no ⛶ overlay, swallow dbl‑click).
           • Optional props:
               - hideControlsDefault (bool) — start hidden
               - lockControlsHidden  (bool) — force hidden (interactive NFTs)
               - showHint            (bool) — show “Press H” helper (default true)
──────────────────────────────────────────────────────────────*/
import React, {
  useCallback, useEffect, useLayoutEffect, useRef, useState,
} from 'react';
import PropTypes               from 'prop-types';
import styledPkg               from 'styled-components';

import RenderMedia             from '../utils/RenderMedia.jsx';
import PixelButton             from './PixelButton.jsx';
import { pixelUpscaleStyle }   from '../utils/pixelUpscale.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/*──────── styled shells ─────────────────────────────────────*/
/* Make sure our modal is always the topmost layer on the page.
 * 2147483000 < 2^31‑1 so it remains a valid CSS integer. */
const TOPMOST_Z = 2147483000;

const Back = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.92);
  z-index: ${TOPMOST_Z};
`;

const Pane = styled.div`
  position: absolute;
  inset: 0;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
`;

/* control rail – vertical stack, top‑right */
const Rail = styled.div`
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + .75rem);
  right: calc(env(safe-area-inset-right, 0px) + .75rem);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  z-index: ${TOPMOST_Z + 1};
  opacity: .88;
  transition: opacity .15s;
  &:hover { opacity: 1; }
`;

/* dedicated close button – top‑left to avoid hamburger overlap */
const CloseWrap = styled.div`
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + .75rem);
  left: calc(env(safe-area-inset-left, 0px) + .75rem);
  z-index: ${TOPMOST_Z + 2};
`;

const NavBtn = styled(PixelButton)`
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  z-index: ${TOPMOST_Z + 2};
`;

/* ephemeral helper badge */
const Hint = styled.div`
  position: fixed;
  bottom: calc(env(safe-area-inset-bottom, 0px) + .5rem);
  left: 50%;
  transform: translateX(-50%);
  z-index: ${TOPMOST_Z + 1};
  background: rgba(0,0,0,.6);
  color: var(--zu-fg,#eee);
  font: 600 .78rem/1.25 PixeloidSans, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  padding: .45rem .6rem;
  border: 1px solid rgba(255,255,255,.15);
  border-radius: 6px;
  user-select: none;
  pointer-events: none;
  white-space: nowrap;
`;

/* WC‑safe vertical range */
const VRange = styled.input.attrs({ type: 'range' })`
  writing-mode: vertical-lr;
  direction: rtl;
  height: clamp(140px,32vh,420px);
  -webkit-appearance: none;
  background: transparent;
  cursor: pointer;

  &::-webkit-slider-thumb{
    -webkit-appearance:none;
    width:14px;height:14px;border-radius:50%;
    background:var(--zu-accent);
    border:2px solid var(--zu-fg);
  }
  &::-webkit-slider-runnable-track{
    background: var(--zu-track-bg,var(--zu-fg));
    width:2px;
  }
`;

/*──────── helpers ───────────────────────────────────────────*/
const PAD = 32;                                            /* px */
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

  /* image / video */
  const w = el.naturalWidth  || el.videoWidth  || 0;
  const h = el.naturalHeight || el.videoHeight || 0;
  if (w && h) return { w, h };

  /* <object type="image/svg+xml"> */
  if (el.tagName === 'OBJECT') return svgNaturalDims(el);

  /* fallback – bounding rect */
  const rect = el.getBoundingClientRect();
  return { w: rect.width, h: rect.height };
}

const fitScale = (natW, natH) => {
  if (!natW || !natH) return 1;
  const vw = window.innerWidth  - PAD;
  const vh = window.innerHeight - PAD;
  return Math.min(vw / natW, vh / natH);
};

/*──────── component ───────────────────────────────────────*/
export default function FullscreenModal({
  open         = false,
  onClose      = () => {},
  uri          = '',
  mime         = '',
  allowScripts = false,
  scriptHazard = false,
  /* NEW options */
  hideControlsDefault = false,
  lockControlsHidden  = false,
  showHint            = true,
  hasPrev             = false,
  hasNext             = false,
  onPrev              = () => {},
  onNext              = () => {},
}) {
  const [nat, setNat]          = useState({ w: 0, h: 0 });
  const [scale, setScale]      = useState(1);
  const [base,  setBase]       = useState(1);
  const [mode,  setMode]       = useState('fit');
  const [uiVisible, setUiVisible] = useState(!hideControlsDefault && !lockControlsHidden);
  const [hintVisible, setHintVisible] = useState(false);

  const ref = useRef(null);
  const longPressTimer = useRef(0);
  const touchStartXY   = useRef(null);

  /*──── reset on open ─────────────────────────────────────*/
  useEffect(() => {
    if (!open) return;
    setNat({ w: 0, h: 0 });
    setScale(1);
    setBase(1);
    setMode('fit');

    /* controls visibility */
    const startHidden = !!(hideControlsDefault || lockControlsHidden);
    setUiVisible(!startHidden);
    if (!startHidden && showHint) {
      setHintVisible(true);
      const id = setTimeout(() => setHintVisible(false), 10000);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [open, hideControlsDefault, lockControlsHidden, showHint]);

  /*──── global hotkeys ────────────────────────────────────*/
  useEffect(() => {
    if (!open) return undefined;

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      // ‘H’ toggles UI – only when no modifier keys to avoid conflicts
      if (!lockControlsHidden && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const k = String(e.key || '').toLowerCase();
        if (k === 'h') {
          e.preventDefault();
          setUiVisible((v) => !v);
          setHintVisible(false);
        } else if (k === 'f') {
          e.preventDefault();
          setScale(base);
          setMode('fit');
        } else if (k === 'o') {
          e.preventDefault();
          setScale(1);
          setMode('original');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, base, lockControlsHidden]);

  /*──── natural‑size detection ───────────────────────────*/
  const handleLoaded = useCallback(() => {
    if (!ref.current) return;
    const dim = measureNatural(ref.current);
    if (dim.w && dim.h) setNat(dim);
  }, []);

  /*──── compute baseline “fit” scale ─────────────────────*/
  useLayoutEffect(() => {
    if (!nat.w) return undefined;
    const compute = () => {
      const fit = fitScale(nat.w, nat.h);
      setBase(fit);
      if (mode === 'fit') setScale(fit);
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [nat, mode]);

  /*──── mode switches ────────────────────────────────────*/
  const toFit      = () => { setScale(base); setMode('fit'); };
  const toOriginal = () => { setScale(1);   setMode('original'); };

  /*──── slider → custom scale ────────────────────────────*/
  const onSlide = (e) => {
    const pct = Number(e.target.value) || 1;
    setScale((pct / 100) * base);
    setMode('custom');
  };

  /*──── touch gestures (mobile) ──────────────────────────*/
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = 0;
    }
  };
  const onTouchStart = (e) => {
    if (!open) return;
    // Two‑finger tap toggles immediately
    if (!lockControlsHidden && e.touches && e.touches.length >= 2) {
      setUiVisible((v) => !v);
      setHintVisible(false);
      cancelLongPress();
      return;
    }
    // Long‑press anywhere toggles (600 ms)
    if (!lockControlsHidden) {
      const t = e.touches && e.touches[0];
      touchStartXY.current = t ? { x: t.clientX, y: t.clientY } : null;
      cancelLongPress();
      longPressTimer.current = window.setTimeout(() => {
        setUiVisible((v) => !v);
        setHintVisible(false);
        longPressTimer.current = 0;
      }, 600);
    }
  };
  const onTouchMove = (e) => {
    // Cancel long‑press if user drags significantly (prevents accidental toggles)
    if (!longPressTimer.current || !touchStartXY.current) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    const dx = Math.abs(t.clientX - touchStartXY.current.x);
    const dy = Math.abs(t.clientY - touchStartXY.current.y);
    if (dx > 12 || dy > 12) cancelLongPress();
  };
  const onTouchEnd = () => cancelLongPress();
  const onTouchCancel = () => cancelLongPress();

  /*──── guard (hooks must run) ───────────────────────────*/
  if (!open || (scriptHazard && !allowScripts)) return null;

  const pct       = Math.round((scale / base) * 100);
  const sliderMax = Math.max(pct, 800);

  /* width / height override = intrinsic dims (fixes SVG “100%”) */
  const mediaStyle = {
    ...pixelUpscaleStyle(scale, mime),
    width : nat.w ? `${nat.w}px` : undefined,
    height: nat.h ? `${nat.h}px` : undefined,
  };

  /*──────── render ───────────────────────────────────────*/
  return (
    <Back
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
      role="dialog"
      aria-modal="true"
    >
      <Pane onClick={(e) => e.stopPropagation()}>
        <RenderMedia
          ref={ref}
          uri={uri}
          mime={mime}
          allowScripts={allowScripts}
          style={mediaStyle}
          onLoad={handleLoaded}
          onLoadedMetadata={handleLoaded}

          /* r15: no ⛶ overlay and swallow dbl‑click fullscreen while in modal */
          fsOverlay={false}
          onRequestFullscreen={() => {}}
        />
      </Pane>

      {uiVisible && (
        <>
          <CloseWrap onClick={(e) => e.stopPropagation()}>
            <PixelButton
              size="xs"
              warning
              onClick={onClose}
              aria-label="Close (Esc)"
              title="Close (Esc)"
            >
              CLOSE
            </PixelButton>
          </CloseWrap>

          <Rail onClick={(e) => e.stopPropagation()}>
            <PixelButton size="xs" onClick={toOriginal} aria-label="Original size (O)" title="Original size (O)">
              ORIGINAL
            </PixelButton>
            <PixelButton size="xs" onClick={toFit} aria-label="Fit on screen (F)" title="Fit on screen (F)">
              FIT ON SCREEN
            </PixelButton>

            <VRange
              aria-label="Zoom"
              min="1"
              max={sliderMax}
              value={pct}
              onChange={onSlide}
            />
            <span style={{
              font: '700 .7rem/1 PixeloidSans,monospace',
              color: 'var(--zu-fg)',
              marginRight: '2px',
              userSelect: 'none',
            }}
            >
              {pct}%
            </span>
          </Rail>
        </>
      )}

      {hintVisible && !lockControlsHidden && (
        <Hint>H — hide controls · two‑finger tap/long‑press on mobile</Hint>
      )}

      {hasPrev && uiVisible && (
        <NavBtn style={{ left: '.75rem' }} onClick={onPrev} aria-label="Previous">
          ◀
        </NavBtn>
      )}
      {hasNext && uiVisible && (
        <NavBtn style={{ right: '.75rem' }} onClick={onNext} aria-label="Next">
          ▶
        </NavBtn>
      )}
    </Back>
  );
}

FullscreenModal.propTypes = {
  open                : PropTypes.bool,
  onClose             : PropTypes.func,
  uri                 : PropTypes.string,
  mime                : PropTypes.string,
  allowScripts        : PropTypes.bool,
  scriptHazard        : PropTypes.bool,
  hideControlsDefault : PropTypes.bool,
  lockControlsHidden  : PropTypes.bool,
  showHint            : PropTypes.bool,
  hasPrev             : PropTypes.bool,
  hasNext             : PropTypes.bool,
  onPrev              : PropTypes.func,
  onNext              : PropTypes.func,
};

/* What changed & why (r16):
   • Moved CLOSE button to top‑left and raised modal z‑index to out‑rank
     any site‑wide hamburger/menu overlays that previously overlapped
     the close target.  This fixes mis‑clicks on small screens.
   • Added UI visibility toggles:
       – Desktop: press H (no Ctrl/Alt/Meta) to hide/show controls.
       – Mobile: two‑finger tap OR 600 ms long‑press toggles controls.
     These gestures avoid browser‑reserved shortcuts (Ctrl/⌘‑H opens
     history/Hide App) and work across browsers.
   • Kept r15 behavior (no ⛶ overlay, swallow dbl‑click fullscreen).
   • Added optional props: hideControlsDefault, lockControlsHidden,
     showHint, and an ephemeral hint banner.
*/
/* EOF */
