/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/FullscreenModal.jsx
  Rev :    r16    2025‑08‑10 UTC
  Summary: Keep r15 (no ⛶ overlay + swallow dbl‑click FS). Add a
           clean, conflict‑free keyboard toggle to hide/show the
           control rail, plus a mobile‑friendly tap toggle and a
           subtle on‑screen hint. Chosen shortcut: **H** (for
           “Hide UI”), which avoids browser‑reserved combos.
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
const Back = styled.div`
  position: fixed; inset: 0;
  background: rgba(0,0,0,.92);
  z-index: 6500;
`;

const Pane = styled.div`
  position: absolute; inset: 0;
  overflow: auto;
  display: flex; align-items: center; justify-content: center;
  padding: 1rem;
`;

/* control rail – vertical stack, top‑right */
const Rail = styled.div`
  position: fixed;
  top: .75rem; right: .75rem;
  display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
  z-index: 6501;
  opacity: .88;
  transition: opacity .15s ease, visibility .15s ease, transform .18s ease;
  &:hover { opacity: 1; }

  /* hidden state (no pointer hitbox when hidden) */
  ${(p) => p['data-hidden'] ? `
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transform: translateY(-4px);
  ` : ''}
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

/* small, low‑distraction hint chip (bottom‑left) */
const Hint = styled.div`
  position: fixed;
  left: .75rem; bottom: .75rem;
  z-index: 6502;
  max-width: min(92vw, 560px);
  padding: .4rem .6rem;
  border-radius: 6px;
  font: 600 .72rem/1.3 PixeloidSans, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  color: var(--zu-fg,#eee);
  background: color-mix(in srgb, #000 70%, transparent);
  border: 1px solid color-mix(in srgb, #fff 18%, transparent);
  box-shadow: 0 8px 20px rgba(0,0,0,.35);
  pointer-events: none;
  opacity: ${(p) => (p.$show ? 1 : 0)};
  transform: translateY(${(p) => (p.$show ? '0' : '3px')});
  transition: opacity .18s ease, transform .18s ease;
  user-select: none;
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

/* Detect coarse pointer (touch‑first, “mobile”) once per open */
const hasCoarsePointer = () => {
  try {
    if (typeof window === 'undefined') return false;
    if ('maxTouchPoints' in navigator && navigator.maxTouchPoints > 0) return true;
    return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  } catch { return false; }
};

/*──────── component ───────────────────────────────────────*/
export default function FullscreenModal({
  open         = false,
  onClose      = () => {},
  uri          = '',
  mime         = '',
  allowScripts = false,
  scriptHazard = false,
}) {
  const [nat, setNat]          = useState({ w: 0, h: 0 });
  const [scale, setScale]      = useState(1);
  const [base,  setBase]       = useState(1);
  const [mode,  setMode]       = useState('fit');

  /* NEW: UI rail visibility + hint text */
  const [uiHidden, setUiHidden] = useState(false);
  const [hint, setHint]         = useState('');
  const [coarse, setCoarse]     = useState(false);
  const hintTimer = useRef(/** @type {ReturnType<typeof setTimeout>|null} */(null));

  const ref = useRef(null);

  /*──── reset on open ─────────────────────────────────────*/
  useEffect(() => {
    if (!open) return;
    setNat({ w: 0, h: 0 }); setScale(1); setBase(1); setMode('fit');
    setUiHidden(false);
    setCoarse(hasCoarsePointer());
    // short onboarding hint (visible, low‑distraction)
    const msg = `Press H to hide controls${hasCoarsePointer() ? ' • Tap artwork to toggle on mobile' : ''} • Esc to close`;
    setHint(msg);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => { setHint(''); }, 2600);
    return () => { if (hintTimer.current) clearTimeout(hintTimer.current); };
  }, [open]);

  /*──── ESC quits ────────────────────────────────────────*/
  useEffect(() => {
    if (!open) return;
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);

  /*──── Keyboard: H toggles rail (conflict‑free) ─────────*/
  const toggleUi = useCallback(() => {
    setUiHidden((prev) => {
      const next = !prev;
      // transient hint announcing the state change
      const msg = next
        ? `Controls hidden — press H${coarse ? ' or tap' : ''} to show`
        : `Controls visible — press H${coarse ? ' or tap' : ''} to hide`;
      setHint(msg);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => { setHint(''); }, 1500);
      return next;
    });
  }, [coarse]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      // ignore when typing in a field/contentEditable
      const ae = document.activeElement;
      const typing = ae && (
        ae.tagName === 'INPUT' ||
        ae.tagName === 'TEXTAREA' ||
        ae.isContentEditable
      );
      if (typing) return;

      // chosen shortcut: "h" / "H" only (no modifiers) – avoids browser conflicts
      if (!e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        toggleUi();
      }
    };
    window.addEventListener('keydown', onKey, { passive: false });
    return () => window.removeEventListener('keydown', onKey, { passive: false });
  }, [open, toggleUi]);

  /*──── natural‑size detection ───────────────────────────*/
  const handleLoaded = useCallback(() => {
    if (!ref.current) return;
    const dim = measureNatural(ref.current);
    if (dim.w && dim.h) setNat(dim);
  }, []);

  /*──── compute baseline “fit” scale ─────────────────────*/
  useLayoutEffect(() => {
    if (!nat.w) return;
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

  /*──── mobile/touch: tap artwork to toggle UI ───────────*/
  const onPaneTap = useCallback((e) => {
    // Always stop here so we never bubble to Back (which would close).
    e.stopPropagation();
    if (!coarse) return;
    // Do not toggle if the user started interacting with a native control
    // (no such controls inside Pane for now; kept for future safety).
    toggleUi();
  }, [coarse, toggleUi]);

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
    <Back onClick={onClose}>
      <Pane onClick={onPaneTap}>
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

      <Rail onClick={(e) => e.stopPropagation()} data-hidden={uiHidden}>
        <PixelButton size="xs" warning onClick={onClose}>CLOSE</PixelButton>
        <PixelButton size="xs" onClick={toOriginal}>ORIGINAL</PixelButton>
        <PixelButton size="xs" onClick={toFit}>FIT ON SCREEN</PixelButton>

        <VRange
          min="1"
          max={sliderMax}
          value={pct}
          onChange={onSlide}
          aria-label="Zoom"
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

        {/* Explicit, visible toggle in the rail. If the rail is hidden, H/tap reveals it. */}
        <PixelButton
          size="xs"
          onClick={toggleUi}
          title="Hide/Show controls (H)"
        >
          {uiHidden ? 'SHOW UI (H)' : 'HIDE UI (H)'}
        </PixelButton>
      </Rail>

      {/* low‑key, timed helper hint for discoverability (SR‑friendly) */}
      <Hint
        role="status"
        aria-live="polite"
        aria-atomic="true"
        $show={Boolean(hint)}
      >
        {hint}
      </Hint>
    </Back>
  );
}

FullscreenModal.propTypes = {
  open         : PropTypes.bool,
  onClose      : PropTypes.func,
  uri          : PropTypes.string,
  mime         : PropTypes.string,
  allowScripts : PropTypes.bool,
  scriptHazard : PropTypes.bool,
};

/* What changed & why (r16):
   • Keyboard toggle: "H" hides/unhides the control rail. Chosen
     to avoid browser‑reserved combos across Chrome/Safari/Firefox.
   • Mobile: tap on artwork (coarse pointer devices only) toggles the
     controls. This does not bubble to the backdrop (so no accidental
     close) and doesn’t conflict with pinch‑zoom.
   • Visible affordance: small hint chip (auto‑fades) and an explicit
     "HIDE UI (H)" button on the rail. When hidden, H/tap brings it back.
   • Kept r15 behavior (no fullscreen overlay + swallowing dbl‑click).
   • Accessibility: role="status" hint, input focus guard, ARIA label
     on zoom slider. */
/* EOF */
