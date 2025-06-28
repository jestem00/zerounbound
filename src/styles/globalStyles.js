/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/styles/globalStyles.js
  Rev :    r742‑r9   2025‑08‑12
  Summary: add --zu‑on-dark var + readable overlay class
──────────────────────────────────────────────────────────────*/
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
    /* new guaranteed‑contrast foreground for dark overlays */
    --zu-on-dark:${v('on-dark','#c3c7cb')};
  }

  *,*::before,*::after{ box-sizing:border-box; }

  @font-face{font-family:'PixeloidSans';src:url('/fonts/PixeloidSans-mLxMm.ttf') format('truetype');font-display:block;}
  @font-face{font-family:'PixeloidSansBold';src:url('/fonts/PixeloidSansBold-PKnYd.ttf') format('truetype');font-weight:700;font-display:block;}
  @font-face{font-family:'PixeloidMono';src:url('/fonts/PixeloidMono-d94EV.ttf') format('truetype');font-display:block;}

  html,body{ height:100%; }

  html{
    font-size:clamp(14px, 1vw + 0.5vh, 20px);
    max-width:100%;
    overflow-x:hidden;
  }

  body{
    margin:0;
    max-width:100%;
    overflow-x:hidden;
    overflow-y:auto;
    -webkit-overflow-scrolling:touch;
    background:var(--zu-bg);
    color:var(--zu-fg);
    font-family:'PixeloidSans', sans-serif;
    padding-bottom:env(safe-area-inset-bottom);
    line-height:1.25;
  }

  /* always‑visible scrollbar */
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

  /* universal dark‑overlay readability */
  .zu-overlay, .zu-overlay *{
    color:var(--zu-on-dark);
  }
`;

export default GlobalStyles;
/* What changed & why:
   • Added --zu‑on-dark root var with palette fallback.
   • Introduced .zu-overlay rule to force high‑contrast text across
     all light palettes without touching existing colour scheme.
   • Rev bump r9. */
/* EOF */
