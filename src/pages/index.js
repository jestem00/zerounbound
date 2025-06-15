/* Developed by @jams2blues – ZeroContract Studio
   File:    src/pages/index.js
   Rev :    r742‑d1  2025‑06‑29 T03:18 UTC
   Summary: heading no‑crop + QA copy tweak */

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
        <PixelHeading
          level={2}
          style={{ marginBottom: '1rem', whiteSpace: 'pre-line' }}
        >
          {`Fully‑on‑chain NFT\nStudio`}
        </PixelHeading>

        <p style={{
          margin: '0 0 2rem',
          maxWidth: '34ch',
          marginInline: 'auto',
          lineHeight: 1.45,
        }}>
          Create fully on‑chain NFT collections, mint and explore pure Tezos
          bytes.<br/><strong>No IPFS. No indexers.</strong>
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

/* What changed & why: forced line‑break to prevent “Studic” crop,
   tweaked copy per QA page 1; container width unchanged. */
