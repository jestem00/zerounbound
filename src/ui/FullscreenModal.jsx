/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/FullscreenModal.jsx
  Rev :    r12    2025‑09‑24
  Summary: reliable “Original” mode + fresh Fit computation;
           MIME‑aware pixelUpscale; live slider %
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

/* control rail – vertical stack, top‑right */
const Rail = styled.div`
  position: fixed; top: .75rem; right: .75rem;
  display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
  z-index: 6501;
  opacity: .85; transition: opacity .15s;
  &:hover { opacity: 1; }
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
const PAD = 32;                                            /* px padding */
const fitScale = (natW, natH) => {
  if (!natW || !natH) return 1;
  const vw = window.innerWidth  - PAD;
  const vh = window.innerHeight - PAD;
  return Math.min(vw / natW, vh / natH);
};
const measureNatural = (el) => {
  if (!el) return { w: 0, h: 0 };
  const w = el.naturalWidth  || el.videoWidth  || 0;
  const h = el.naturalHeight || el.videoHeight || 0;
  if (w && h) return { w, h };
  const r = el.getBoundingClientRect();
  return { w: r.width, h: r.height };
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
  /* natural dimensions */
  const [nat, setNat]      = useState({ w: 0, h: 0 });
  /* baseline fit‑on‑screen scale (slider 100 %) */
  const [base, setBase]    = useState(1);
  /* active transform scale */
  const [scale, setScale]  = useState(1);
  /* original | fit | custom */
  const [mode, setMode]    = useState('original');

  const ref = useRef(null);

  /*── initialise on open ───────────────────────────────────*/
  useEffect(() => {
    if (!open) return;
    setNat({ w: 0, h: 0 });
    setMode('original');
    setScale(1);
    setBase(1);
  }, [open]);

  /*── ESC exits ────────────────────────────────────────────*/
  useEffect(() => {
    if (!open) return;
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);

  /*── natural‑size probe ──────────────────────────────────*/
  const probe = useCallback(() => {
    if (!ref.current) return;
    const d = measureNatural(ref.current);
    if (d.w && d.h) setNat(d);
  }, []);
  const handleLoaded = probe;

  /*── recompute baseline on nat / resize ──────────────────*/
  useLayoutEffect(() => {
    if (!nat.w) return;
    const compute = () => {
      const f = fitScale(nat.w, nat.h);
      setBase(f);
      if (mode === 'fit') setScale(f);
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [nat, mode]);

  /*── mode switches ───────────────────────────────────────*/
  const toOriginal = () => { setScale(1); setMode('original'); };
  const toFit      = () => {
    if (!nat.w) return;
    const f = fitScale(nat.w, nat.h);
    setBase(f);
    setScale(f);
    setMode('fit');
  };

  /*── slider → custom mode (percentage of base) ───────────*/
  const onSlide = (e) => {
    const pct = Number(e.target.value) || 1;
    setScale((pct / 100) * base);
    setMode('custom');
  };

  /*── early guard (hooks executed) ────────────────────────*/
  if (!open || (scriptHazard && !allowScripts)) return null;

  /*── compute media style ─────────────────────────────────*/
  let mediaStyle = {};
  if (!(mode === 'original' && scale === 1)) {
    mediaStyle = pixelUpscaleStyle(scale, mime);
  } else if (mime.startsWith('image/') && mime !== 'image/svg+xml') {
    /* override default pixelation inside RenderMedia */
    mediaStyle.imageRendering = 'auto';
  }

  /*── slider presentation values ─────────────────────────*/
  const pct = Math.round((scale / base) * 100);
  const sliderMax = Math.max(pct, 800);

  /*── render ─────────────────────────────────────────────*/
  return (
    <Back onClick={onClose}>
      <Pane onClick={(e) => e.stopPropagation()}>
        <RenderMedia
          ref={ref}
          uri={uri}
          mime={mime}
          allowScripts={allowScripts}
          style={mediaStyle}
          onLoad={handleLoaded}
          onLoadedMetadata={handleLoaded}
        />
      </Pane>

      <Rail onClick={(e) => e.stopPropagation()}>
        <PixelButton size="xs" warning onClick={onClose}>CLOSE</PixelButton>
        <PixelButton size="xs" onClick={toOriginal}>ORIGINAL</PixelButton>
        <PixelButton size="xs" onClick={toFit}>FIT ON SCREEN</PixelButton>

        <VRange min="1" max={sliderMax} value={pct} onChange={onSlide} />
        <span style={{
          font: '700 .7rem/1 PixeloidSans,monospace',
          color: 'var(--zu-fg)',
          marginRight: '2px',
          userSelect: 'none',
        }}
        >
          {pct}
          %
        </span>
      </Rail>
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
/* What changed & why:
   • Default mode = “original” (true natural pixels, no transform).
   • `pixelUpscaleStyle(mime)` now MIME‑aware; raster‑only pixelation.
   • `toFit()` recomputes fresh baseline → never mis‑scales.
   • Slider 100 % = baseline; range auto‑extends up to 800 %.
   • Vector / HTML / audio bypass pixelation entirely.
   • RenderMedia override (`imageRendering:auto`) prevents
     un‑wanted pixel blur in original mode. */
/* EOF */
