/*Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/CRTFrame.jsx
  Rev :    r745-h1  2025-07-04 T05:22 UTC
  Summary: robust viewport-height fallback & mobile scroll */

import React from 'react';
import styledPkg from 'styled-components';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/* $noHdrPad → skip the 1.2 rem interior gap (hero uses this) */
const Frame = styled.div.attrs(({ $noHdrPad }) => ({ $noHdrPad }))`
  position: relative;
  margin: 0 auto;
  width: clamp(320px, 85vw, 1180px);
  max-width: 1180px;

  /* interior padding – header gap is handled globally on <main> */
  padding: ${({ $noHdrPad }) =>
      $noHdrPad ? '0 1.2rem 1.2rem' : '1.2rem'};

  background: var(--zu-bg-alt);
  border: 3px solid var(--zu-fg);
  box-shadow: 0 0 10px var(--zu-fg);

  display: flex;
  flex-direction: column;

  /* self-scroll when content exceeds viewport minus header
     – fallback to 100 vh if --vh is undefined (desktop & older browsers) */
  max-height: calc(var(--vh, 100vh) - var(--hdr, 112px) - 1.6rem);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch; /* momentum on iOS */
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
`;

export default function CRTFrame({ children, style, noHdrPad = false, ...rest }) {
  return (
    <Frame $noHdrPad={noHdrPad} style={style} {...rest}>
      {children}
    </Frame>
  );
}

/* What changed & why:
   • Added fallback `var(--vh, 100vh)` so Frame height never collapses
     when the custom --vh property is absent.
   • Enabled smooth mobile scrolling via -webkit-overflow-scrolling: touch.
   • No other behaviour touched, preserving CRTFrame API for other pages. */
/* EOF */

