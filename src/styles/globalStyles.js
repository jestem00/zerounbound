/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/styles/globalStyles.js
  Rev :    r742-r7  2025-07-02
  Summary: lower root scale for saner size */
import { createGlobalStyle } from 'styled-components';
import palettes from './palettes.json' assert { type: 'json' };

const [fallback] = Object.keys(palettes);
const F          = palettes[fallback];
const v = (k, d) => F?.[`--zu-${k}`] ?? d;

const GlobalStyles = createGlobalStyle`
  :root{
    --hdr: 112px;
    --zu-bg:${v('bg','#000')};
    --zu-bg-alt:${v('bg-alt','#101010')};
    --zu-fg:${v('fg','#eee')};
    --zu-heading:${v('heading','#fff')};
    --zu-accent:${v('accent','#2ecc71')};
    --zu-accent-sec:${v('accent-sec','#e74c3c')};
    --zu-btn-fg:${v('btn-fg','#fff')};
  }

  *,*::before,*::after{ box-sizing:border-box; }

  @font-face{font-family:'PixeloidSans';src:url('/fonts/PixeloidSans-mLxMm.ttf') format('truetype');font-display:block;}
  @font-face{font-family:'PixeloidSansBold';src:url('/fonts/PixeloidSansBold-PKnYd.ttf') format('truetype');font-weight:700;font-display:block;}
  @font-face{font-family:'PixeloidMono';src:url('/fonts/PixeloidMono-d94EV.ttf') format('truetype');font-display:block;}

  html,body{ height:100%; }

  /* tamer root scale */
  html{
    font-size:clamp(14px, 1vw + 0.5vh, 20px);
    max-width:100%;
    overflow:hidden;
  }

  body{
    margin:0;
    max-width:100%;
    overflow:hidden;
    background:var(--zu-bg);
    color:var(--zu-fg);
    font-family:'PixeloidSans', sans-serif;
    padding-bottom:env(safe-area-inset-bottom);
    line-height:1.25;
  }

  /* scrollbars unchanged */
  ::-webkit-scrollbar{ width:6px; height:6px; }
  ::-webkit-scrollbar-thumb{
    background:var(--zu-accent-sec);
    border-radius:3px;
  }
  ::-webkit-scrollbar-track{ background:transparent; }
  scrollbar-color: var(--zu-accent-sec) transparent;
  scrollbar-width: thin;

  a{ color:var(--zu-accent-sec); }
  :focus-visible{ outline:3px dashed var(--zu-accent); outline-offset:2px; }
`;

export default GlobalStyles;
/* What changed & why:
   • Root clamp lowered → overall UI ~20 % smaller, fits 1080 p. */
/* EOF */
