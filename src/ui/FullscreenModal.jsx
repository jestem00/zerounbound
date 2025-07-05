/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/FullscreenModal.jsx
  Rev :    r14    2025‑09‑24
  Summary: SVG‑aware natural‑size probe + width/height override
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
}) {
  const [nat, setNat]          = useState({ w: 0, h: 0 });
  const [scale, setScale]      = useState(1);
  const [base,  setBase]       = useState(1);
  const [mode,  setMode]       = useState('fit');

  const ref = useRef(null);

  /*──── reset on open ─────────────────────────────────────*/
  useEffect(() => {
    if (!open) return;
    setNat({ w: 0, h: 0 }); setScale(1); setBase(1); setMode('fit');
  }, [open]);

  /*──── ESC quits ────────────────────────────────────────*/
  useEffect(() => {
    if (!open) return;
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);

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
          {pct}%
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
   • `measureNatural` now extracts SVG viewBox/width/height for true
     intrinsic dimensions, preventing bogus 100 % reports.
   • Inline `mediaStyle` overrides `width/height` with intrinsic px,
     neutralising the earlier double‑scaling of SVGs.
   • `pixelUpscaleStyle` now receives `mime` to drop pixelation on
     vector or non‑image types.                                               */
/* EOF */
