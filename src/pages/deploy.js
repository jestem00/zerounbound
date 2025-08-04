/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/pages/deploy.js
  Rev :    r1162   2025‑08‑04
  Summary: Temporarily disable contract deployment due to a
           critical issue in the v4 contract.  The page now
           displays a light‑hearted message and a sad face
           emoji instead of the deployment form.  Once the
           contract bug is addressed and a new version is
           available, this page can be restored to its full
           functionality.  See r1162 changelog for details.
─────────────────────────────────────────────────────────────*/

import React from 'react';
import styledPkg from 'styled-components';
import PixelHeading from '../ui/PixelHeading.jsx';
import PixelButton from '../ui/PixelButton.jsx';

const styled = typeof styledPkg === 'function' ? styledPkg : styledPkg.default;

// Wrapper replicating the original layout: positions content
// relative to the viewport, centres it and provides a neutral
// background.  This ensures the page remains responsive and
// preserves the 8‑bit theme even while deployment is disabled.
const Wrap = styled.div`
  position: relative;
  z-index: 2;
  background: var(--zu-bg);
  width: 100%;
  max-width: min(90vw, 1920px);
  margin: 0 auto;
  min-height: calc(var(--vh) - var(--hdr, 0));
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  padding: 1rem clamp(0.4rem, 1.5vw, 1.2rem) 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
`;

/**
 * Deploy – Disabled
 *
 * This component replaces the original deployment form with a
 * friendly notice and a sad face emoji.  It informs users that
 * contract deployments are temporarily paused due to a critical
 * issue in the underlying contract and encourages them to return
 * once the fix has been deployed.  A PixelButton is provided to
 * navigate back to the home page.
 */
export default function Deploy() {
  return (
    <Wrap>
      <PixelHeading as="h2" style={{ textAlign: 'center' }}>
        😔 Deployments Disabled
      </PixelHeading>
      <p style={{ textAlign: 'center', maxWidth: '40ch', lineHeight: 1.4 }}>
        We’re taking a short break from originating new contracts while we
        investigate a bug in the FA2 operator logic.  Existing NFTs and
        marketplace functionality are unaffected.  Please check back soon –
        we’ll be back online as soon as everything is patched up!
      </p>
      <PixelButton onClick={() => { window.location.href = '/'; }}>
        Return Home
      </PixelButton>
    </Wrap>
  );
}
