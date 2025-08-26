/* Developed by @jams2blues – ZeroContract Studio
   File:    src/ui/Layout.jsx
   Rev :    r744‑h14  2025‑08‑25 UTC
   Summary: conditional ZerosBg – hidden on explore/marketplace routes; unify scroll region */
import React          from 'react';
import { useRouter }  from 'next/router';
import styledPkg      from 'styled-components';

import Header         from './Header.jsx';
import ZerosBg        from './ZerosBackground.jsx';
import useViewportUnit from '../hooks/useViewportUnit.js';
import useHeaderHeight from '../hooks/useHeaderHeight.js';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

const Main = styled.main`
  position: relative;
  padding-top: var(--hdr);                        /* reserve fixed header */
  min-height: calc(var(--vh) - var(--hdr));       /* fill viewport       */
  display: flex;
  flex-direction: column;
  /* Removed overflow-y:auto to avoid nested scrollbars and unify scroll region */
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
`;

export default function Layout({ children }) {
  useViewportUnit();          /* sets --vh       */
  useHeaderHeight();          /* ensures --hdr   */

  const { pathname = '' } = useRouter();
  /* hide animated background on explorer / marketplace views ----------- */
  const hideBg = /^\/(?:explore|contracts|tokens|search)(?:\/|$)/i.test(pathname);

  return (
    <>
      <Header />
      <Main>
        {!hideBg && <ZerosBg />}
        {children}
      </Main>
    </>
  );
}

/* What changed & why: Updated to r744‑h14. Removed inner overflow (overflow-y:auto) to prevent nested scrollbars and unify the scroll region while maintaining conditional background hiding. */
/* EOF */