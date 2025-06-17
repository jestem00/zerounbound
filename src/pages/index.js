/*──────── src/pages/index.js ────────
  Developed by @jams2blues – ZeroContract Studio
  Rev :    r744-h14  2025-07-03 T18:02 UTC
  Summary: anchor colour use var --zu-link */

import React from 'react';
import PixelButton from '../ui/PixelButton.jsx';
import CRTFrame    from '../ui/CRTFrame.jsx';

export default function Home() {
  return (
    <main
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        /* Layout already adds var(--hdr); keep only a small visual gap */
        paddingTop: '0.5rem',
        paddingInline: '1rem',
        paddingBottom: '0.5rem',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <CRTFrame
        noHdrPad
        style={{ maxWidth: 580, width: '100%', textAlign: 'center' }}
      >
        {/* logo */}
        <img
          src="/sprites/logo.svg"
          alt="Zero Unbound — ZeroContract Studio"
          style={{
            display: 'block',
            margin: '0 auto 0.75rem',
            width: 'clamp(100px, 40vw, 160px)',
            maxHeight: '15vh',
            height: 'auto',
          }}
        />

        {/* main title */}
        <h1
          style={{
            margin: '0 0 0.5rem',
            fontSize: 'clamp(1.25rem, 4vw, 1.5rem)',
            lineHeight: 1.1,
          }}
        >
          Fully On‑Chain Tezos NFT Studio
        </h1>

        {/* subtitle */}
        <p
          style={{
            margin: '0 0 0.75rem',
            fontSize: 'clamp(0.8rem, 2vw, 0.95rem)',
            lineHeight: 1.4,
          }}
        >
          Create fully on‑chain NFT collections,
          <br />
          Mint and explore pure Tezos bytes.
        </p>

        {/* author credit */}
        <p style={{
          margin: '0 0 1rem',
          fontSize: 'clamp(0.65rem, 1.5vw, 0.8rem)',
          lineHeight: 1.3,
        }}>
          by{' '}
          <a href="https://x.com/jams2blues" target="_blank" rel="noreferrer">
            @jams2blues
          </a>{' '}
          &{' '}
          <a href="https://x.com/jestemzero" target="_blank" rel="noreferrer">
            @JestemZero
          </a>
        </p>

        {/* CTAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <PixelButton as="a" href="/deploy" style={{
            width: '100%',
            fontSize: 'clamp(0.75rem, 1.5vw, 0.95rem)',
            padding: '0.4rem',
          }}>
            ➕ Create Collection
          </PixelButton>
          <PixelButton as="a" href="/manage" style={{
            width: '100%',
            fontSize: 'clamp(0.75rem, 1.5vw, 0.95rem)',
            padding: '0.4rem',
          }}>
            ⚙ Manage Collections
          </PixelButton>
          <PixelButton as="a" href="/explore" style={{
            width: '100%',
            fontSize: 'clamp(0.75rem, 1.5vw, 0.95rem)',
            padding: '0.4rem',
          }}>
            🔍 Explore FOC
          </PixelButton>
        </div>
      </CRTFrame>
    </main>
  );
}
/* What changed & why: dropped `calc(var(--hdr) + …)` paddingTop; Layout
   already offsets content, so this removes the home page’s blank band. */
/* EOF */