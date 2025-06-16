/* Developed by @jams2blues – ZeroContract Studio
   File:    src/ui/CRTFrame.jsx
   Rev :    r744‑h12  2025‑07‑03 T03:04 UTC
   Summary: remove duplicate header offset; keep self‑scroll */

import React from 'react';
import styledPkg from 'styled-components';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

/* $noHdrPad → skip the 1.2 rem interior gap (hero uses this)        */
const Frame = styled.div.attrs(({ $noHdrPad }) => ({ $noHdrPad }))`
  position: relative;
  margin: 0 auto;
  width: clamp(320px, 85vw, 1180px);
  max-width: 1180px;

  /* interior padding – header gap is handled globally on <main>     */
  padding: ${({ $noHdrPad }) =>
      $noHdrPad ? '0 1.2rem 1.2rem' : '1.2rem'};
  
  background: var(--zu-bg-alt);
  border: 3px solid var(--zu-fg);
  box-shadow: 0 0 10px var(--zu-fg);

  display: flex;
  flex-direction: column;

  /* self‑scroll when content is taller than viewport minus header   */
  max-height: calc(var(--vh) - var(--hdr) - 1.6rem);
  overflow-y: auto;
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

/* What changed & why: removed top header offset (now global on <main>);
   keeps internal 8‑bit scrollbar & optional hero gap control. */
/* EOF */
