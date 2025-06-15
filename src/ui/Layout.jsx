/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/ui/Layout.jsx
  Rev :    r742‑m1  2025‑06‑29
  Summary: consume useViewportUnit; isolate scroll area
──────────────────────────────────────────────────────────────*/
import React from 'react';
import styledPkg from 'styled-components';
import Header    from './Header.jsx';
import ZerosBg   from './ZerosBackground.jsx';
import useViewportUnit from '../hooks/useViewportUnit.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Main = styled.main`
  position: relative;
  height: calc(var(--vh) - var(--hdr));
  overflow-y: auto;
  overflow-x: hidden;
`;

export default function Layout({ children }) {
  useViewportUnit();                    /*   sets --vh   */

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
/* EOF */
