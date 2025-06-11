/*Developed by @jams2blues – ZeroContract Studio
  File: src/ui/Layout.jsx
  Summary: inject WalletNotice banner below header spacer */

import React from 'react';
import PropTypes from 'prop-types';
import Header from './Header.jsx';
import WalletNotice from './WalletNotice.jsx';
import ZerosBG from './ZerosBackground.jsx';
import { NETWORK_LABEL } from '../config/deployTarget.js';

export default function Layout({ network = NETWORK_LABEL, children }) {
  return (
    <div style={{ position: 'relative', minHeight: '100dvh', overflow: 'hidden' }}>
      <ZerosBG />                         {/* particle layer (z-index 1) */}
      <Header network={network} />        {/* fixed; publishes --hdr      */}

      {/* Spacer equals measured header height                       */}
      <div aria-hidden style={{ height: 'var(--hdr)' }} />

      {/* Wallet banners (reveal / fund / mismatch)                  */}
      <WalletNotice />

      <main
        style={{
          minHeight: 'calc(100dvh - var(--hdr))',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 'clamp(1rem,2vmin,2rem) 1rem',
          overflowY: 'auto', /* single vertical scrollbar          */
        }}
      >
        {children}
      </main>
    </div>
  );
}

Layout.propTypes = {
  network: PropTypes.string,
  children: PropTypes.node.isRequired,
};
/* What changed & why: added WalletNotice below header to surface
   purple “Reveal account” banner whenever WalletContext flags it. */
