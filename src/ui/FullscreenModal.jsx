/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/FullscreenModal.jsx
  Rev :    r13    2025‑09‑24
  Summary: fluid‑media fix → correct “FIT ON SCREEN” for SVG/HTML
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
const PAD = 32;                                            /* px */
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
}) {
  /* is the media self‑scaling (SVG, HTML, etc.)? */
  const isFluid = /^image\/svg\+xml$|^text\/html$/.test(mime);

  /* natural px dims (not used for fluid media) */
  const [nat, setNat]          = useState({ w: 0, h: 0 });
  /* scale applied via CSS – 1 == natural px / fluid baseline */
  const [scale, setScale]      = useState(1);
  /* baseline “fit” scale – slider 100 % */
  const [base,  setBase]       = useState(1);
  /* custom / original / fit */
  const [mode,  setMode]       = useState('fit');

  const ref = useRef(null);

  /*──── initial & reopen reset ────────────────────────────*/
  useEffect(() => {
    if (!open) return;
    setNat({ w: 0, h: 0 });
    setScale(1);
    setBase(1);
    setMode('fit');
  }, [open]);

  /*──── ESC key exits ─────────────────────────────────────*/
  useEffect(() => {
    if (!open) return;
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);

  /*──── detect natural size once media ready ─────────────*/
  const handleLoaded = useCallback(() => {
    if (isFluid || !ref.current) return;
    const w = ref.current.naturalWidth  || ref.current.videoWidth  || 0;
    const h = ref.current.naturalHeight || ref.current.videoHeight || 0;
    if (w && h) setNat({ w, h });
  }, [isFluid]);

  /*──── recompute baseline on nat / resize ───────────────*/
  useLayoutEffect(() => {
    const compute = () => {
      const fit = isFluid ? 1 : fitScale(nat.w, nat.h);
      setBase(fit);
      if (mode === 'fit') setScale(fit);
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [nat, mode, isFluid]);

  /*──── mode switches ─────────────────────────────────────*/
  const toFit      = () => { setScale(base); setMode('fit'); };
  const toOriginal = () => { setScale(1);   setMode('original'); };

  /*──── slider interaction → custom mode ─────────────────*/
  const onSlide = (e) => {
    const pct = Number(e.target.value) || 1;          /* (1‑800) */
    setScale((pct / 100) * base);
    setMode('custom');
  };

  /*──── guard (hooks must run) ───────────────────────────*/
  if (!open || (scriptHazard && !allowScripts)) return null;

  /* slider marks (1 → 800 %) relative to baseline */
  const pct      = Math.round((scale / base) * 100);
  const sliderMax = Math.max(pct, 800);

  /*──────── render ───────────────────────────────────────*/
  return (
    <Back onClick={onClose}>
      <Pane onClick={(e) => e.stopPropagation()}>
        <RenderMedia
          ref={ref}
          uri={uri}
          mime={mime}
          allowScripts={allowScripts}
          style={pixelUpscaleStyle(scale, mime)}
          onLoad={handleLoaded}
          onLoadedMetadata={handleLoaded}
        />
      </Pane>

      <Rail onClick={(e) => e.stopPropagation()}>
        <PixelButton size="xs" warning onClick={onClose}>CLOSE</PixelButton>
        <PixelButton size="xs" onClick={toOriginal}>ORIGINAL</PixelButton>
        <PixelButton size="xs" onClick={toFit}>FIT ON SCREEN</PixelButton>

        <VRange
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
   • Added `isFluid` detection (SVG/HTML) — these assets already
     scale to their container, so baseline “fit” is always 1.
   • Baseline & natural‑size computation now bypassed for fluid
     media; prevents runaway upscale shown in SVG edge‑cases.
   • `pixelUpscaleStyle` now receives `mime` so it can suppress
     `image‑rendering: pixelated` for vector content.                        */
/* EOF */
