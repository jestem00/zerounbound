/*Developed by @jams2blues with love for the Tezos community
  File: src/pages/index.js
  Summary: home page – flex-centred, no min-height scroll bug         */

import React        from 'react';
import PixelButton  from '../ui/PixelButton.jsx';
import PixelHeading from '../ui/PixelHeading.jsx';
import CRTFrame     from '../ui/CRTFrame.jsx';

export default function Home () {
  return (
    <main style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem',
      width: '100%',
    }}>
      <CRTFrame className="surface"
        style={{ maxWidth: 620, width: '100%', textAlign: 'center' }}>
        {/* logo */}
        <img
          src="/sprites/logo.svg"
          alt="Zero Unbound — ZeroContract Studio"
          style={{
            display: 'block',
            margin: '0 auto 1.5rem',
            width: 'clamp(160px, 60%, 280px)',
            height: 'auto',
          }}
        />

        {/* tagline */}
        <PixelHeading level={2} style={{ marginBottom: '1rem' }}>
          Fully-On-Chain NFT Studio
        </PixelHeading>

        <p style={{
          margin: '0 0 2rem',
          maxWidth: '32ch',
          marginInline: 'auto',
          lineHeight: 1.45,
        }}>
          Create fully&nbsp;on-chain NFT collections,&nbsp;mint and explore
          pure&nbsp;Tezos bytes.<br/>
          <strong>No IPFS. No indexers.</strong>
        </p>

        {/* CTAs */}
        <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
          <PixelButton as="a" href="/deploy"  style={{ width:'100%' }}>
            ➕ Create Collection
          </PixelButton>
          <PixelButton as="a" href="/manage"  style={{ width:'100%' }}>
            ⚙ Manage Collections
          </PixelButton>
          <PixelButton as="a" href="/explore" style={{ width:'100%' }}>
            🔍 Explore FOC
          </PixelButton>
        </div>
      </CRTFrame>
    </main>
  );
}
