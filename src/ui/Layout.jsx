/* Developed by @jams2blues – ZeroContract Studio
   File:    src/ui/Layout.jsx
   Rev :    r744‑h12  2025‑07‑03 T03:04 UTC
   Summary: global header offset ➜ fixes top‑clip on all pages */

import React from 'react';
import styledPkg from 'styled-components';
import Header    from './Header.jsx';
import ZerosBg   from './ZerosBackground.jsx';
import useViewportUnit from '../hooks/useViewportUnit.js';
import useHeaderHeight from '../hooks/useHeaderHeight.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Main = styled.main`
  position: relative;

  /* reserve space for the fixed header */
  padding-top: var(--hdr);

  /* fill the rest of the visual viewport */
  min-height: calc(var(--vh) - var(--hdr));

  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
`;

export default function Layout({ children }) {
  useViewportUnit();   /* sets --vh        */
  useHeaderHeight();   /* ensures --hdr    */

  return (
    <>
      <Header />
      <Main>
        <ZerosBg />
        {children}
      </Main>
    </>
  );
}

/* What changed & why: added padding‑top var(--hdr) so content
   always starts below the fixed header; removes duplicate offset
   inside CRTFrame, eliminating form clip reported in QA. */
/* EOF */
