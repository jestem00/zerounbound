/*Developed by @jams2blues with love for the Tezos community
  File: src/styles/globalStyles.js
  Summary: global tokens, 100 % root height, safer font clamps. */

import { createGlobalStyle } from 'styled-components';
import palettes from './palettes.json' assert { type: 'json' };

const [fallback] = Object.keys(palettes);
const F          = palettes[fallback];
const v = (k, d) => F?.[`--zu-${k}`] ?? d;

const GlobalStyles = createGlobalStyle`
  :root{
    --hdr: 112px;                                    /* SSR fallback */
    --zu-bg:${v('bg',        '#000')};
    --zu-bg-alt:${v('bg-alt','#101010')};
    --zu-fg:${v('fg',        '#eee')};
    --zu-heading:${v('heading','#fff')};
    --zu-accent:${v('accent', '#2ecc71')};
    --zu-accent-sec:${v('accent-sec','#e74c3c')};
    --zu-btn-fg:${v('btn-fg','#fff')};
  }

  *,*::before,*::after{ box-sizing:border-box; }

  @font-face{font-family:'PixeloidSans';src:url('/fonts/PixeloidSans-mLxMm.ttf') format('truetype');font-display:block;}
  @font-face{font-family:'PixeloidSansBold';src:url('/fonts/PixeloidSansBold-PKnYd.ttf') format('truetype');font-weight:700;font-display:block;}
  @font-face{font-family:'PixeloidMono';src:url('/fonts/PixeloidMono-d94EV.ttf') format('truetype');font-display:block;}

  html, body{ height:100%; }                 /* ensures 100 dvh accurate */
  html{
    font-size:clamp(14px, 1vw + 0.5vh, 18px);
    max-width:100%; overflow-x:hidden;
  }
  @media(max-height:750px){
    html{ font-size:clamp(12px, 1.2vw + 0.4vh, 16px); }
  }
  @media(max-height:620px){
    html{ font-size:clamp(11px, 1.4vw + 0.4vh, 15px); }
  }

  body{
    margin:0; max-width:100%; overflow-x:hidden;
    background:var(--zu-bg); color:var(--zu-fg);
    font-family:'PixeloidSans', sans-serif;
    padding-bottom:env(safe-area-inset-bottom);
  }

  a{ color:var(--zu-accent-sec); }
  :focus-visible{ outline:3px dashed var(--zu-accent); outline-offset:2px; }

  ::-webkit-scrollbar{ width:8px; height:8px; }
  ::-webkit-scrollbar-thumb{ background:var(--zu-accent-sec); border-radius:4px; }
  ::-webkit-scrollbar-track{ background:transparent; }
`;

export default GlobalStyles;
/* What changed & why – root elements given 100 % height so 100 dvh is
   correct after mobile-toolbar resize; font clamp typo fixed. */
