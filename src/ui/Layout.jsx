/* Developed by @jams2blues – ZeroContract Studio
   File:    src/ui/Layout.jsx
   Rev :    r744‑h13  2025‑07‑08 UTC
   Summary: conditional ZerosBg – hidden on explore/marketplace routes */

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
  overflow-y: auto;
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

/* What changed & why: Layout now inspects router pathname and skips
   rendering <ZerosBg> on /explore, /contracts, /tokens & /search routes,
   preventing generative background from overlaying marketplace content. */
/* EOF */
