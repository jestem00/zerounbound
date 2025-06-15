/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/styles/globalStyles.js
  Rev :    r742-r6  2025-06-29 T22:18 UTC
  Summary: adaptive root font-scale for 1080p ↔ 8 k
──────────────────────────────────────────────────────────────*/

import { createGlobalStyle } from 'styled-components';
import palettes from './palettes.json' assert { type: 'json' };

const [fallback] = Object.keys(palettes);
const F          = palettes[fallback];
const v = (k, d) => F?.[`--zu-${k}`] ?? d;

const GlobalStyles = createGlobalStyle`
  :root{
    --hdr: 112px;
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

  html,body{ height:100%; }

  /*──────────────── adaptive root scale ────────────────*
    • 1080 p @150 % ≈ 1620× – starts at 15 px
    • 4 k @150 %  ⇒ ~ 3840× – climbs toward 22 px
    • 8 k native  ⇒ hits 24 px hard-cap
  *──────────────────────────────────────────────────────*/
  html{
    font-size:clamp(15px, 1.35vw + 0.6vh, 24px);
    max-width:100%;
    overflow:hidden; /* page itself never scrolls */
  }

  body{
    margin:0; max-width:100%;
    overflow:hidden;                /* all inner scroll locked */
    background:var(--zu-bg); color:var(--zu-fg);
    font-family:'PixeloidSans', sans-serif;
    padding-bottom:env(safe-area-inset-bottom);
    line-height:1.25;
  }

  /* thin, always-visible scrollbars for inner regions */
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
   • html font-size now scales with 1.35 vw + 0.6 vh (cap 24 px) so UI
     enlarges on 4 k/8 k while still readable on 1080 p @150 % without
     overflowing; meets I00 responsive mandate.
*/
/* EOF */
