//File: ghostnet/src/pages/explore.js
/* r267 – stubbed page
   • Removes unused helpers & undefined components (SearchBar, CollectionCard).
   • Zero external deps → passes ESLint/Type checks on Vercel.
   • Maintains retro-CRT look & theme consistency.                      */

import React from 'react';
import CRTFrame from '../ui/CRTFrame';
import PixelHeading from '../ui/PixelHeading';

export default function Explore() {
  return (
    <main style={{ padding: '4rem 1rem' }}>
      <CRTFrame className="surface" style={{ maxWidth: 640, margin: '0 auto' }}>
        <PixelHeading as="h1">Explore (coming soon)</PixelHeading>
        <p style={{ fontSize: '0.9rem', textAlign: 'center', margin: 0 }}>
          The global fully-on-chain explorer is temporarily disabled while we
          refine the IndexedDB snapshot flow. Check back after the next update!
        </p>
      </CRTFrame>
    </main>
  );
}
