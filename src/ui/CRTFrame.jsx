/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/CRTFrame.jsx
  Rev :    r743-h3 2025-07-01 03:35 UTC
  Summary: top padding restored (≙ --hdr + 1.2 rem) while
           keeping overflow visible → no clip, single scroll
──────────────────────────────────────────────────────────────*/
import React from 'react';
import styledPkg from 'styled-components';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Frame = styled.div`
  position: relative;
  margin: 0 auto;
  max-width: 1180px;
  width: clamp(320px, 85vw, 1180px);

  /* leave clear space for fixed header plus default padding */
  padding: calc(var(--hdr) + 1.2rem) 1.2rem 1.2rem;

  background: var(--zu-bg-alt);
  border: 3px solid var(--zu-fg);
  box-shadow: 0 0 10px var(--zu-fg);

  display: flex;
  flex-direction: column;

  /* let <main> own vertical scroll ⇒ single scrollbar */
  overflow-y: visible;
`;

export default function CRTFrame({ children, style, ...rest }) {
  return (
    <Frame style={style} {...rest}>
      {children}
    </Frame>
  );
}
/* What changed & why:
   • Restored header offset using calc(var(--hdr) + 1.2 rem) so
     forms start below fixed bar.
   • Retained `overflow-y: visible` to avoid double scrollbars.
*/
/* EOF */
