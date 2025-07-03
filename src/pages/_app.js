/*Developed by @jams2blues with love for the Tezos community
  File: src/pages/_app.js
  Rev : r552   2025-06-13
  Summary: boots sliceCache auto-purge (I61) + keeps SW register. */

import React from 'react';
import MakeOfferModal from '../ui/MakeOfferModal.jsx';
import Head  from 'next/head';
import Layout       from '../ui/Layout.jsx';
import { ThemeProvider  } from '../contexts/ThemeContext.js';
import { WalletProvider } from '../contexts/WalletContext.js';
import GlobalStyles       from '../styles/globalStyles.js';
import { purgeExpiredSliceCache } from '../utils/sliceCache.js';

export default function ZeroUnboundApp({ Component, pageProps }) {

  const [offer, setOffer] = React.useState({ open:false, contract:'', tokenId:'' });

  /* one-time PWA SW registration */
  React.useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js')
      .catch((e) => console.warn('SW registration failed', e));
  }, []);

  /* global zu:makeOffer handler */
  React.useEffect(() => {
    const handler = (e) => {
      const d = e.detail || {};
      setOffer({ open:true, contract:d.contract, tokenId:d.tokenId });
    };
    window.addEventListener('zu:makeOffer', handler);
    return () => window.removeEventListener('zu:makeOffer', handler);
  }, []);

  /* I61 – purge stale slice checkpoints (>24 h) */
  React.useEffect(() => {
    purgeExpiredSliceCache(1);
  }, []);

  return (
    <ThemeProvider>
      <WalletProvider>
        <Head>
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <title>Zero Unbound — Contract Studio</title>
        </Head>

        <GlobalStyles />
        <Layout>
          <Component {...pageProps} />
        </Layout>
        <MakeOfferModal
          open={offer.open}
          contract={offer.contract}
          tokenId={offer.tokenId}
          onClose={() => setOffer({ open:false, contract:'', tokenId:'' })}
        />
      </WalletProvider>
    </ThemeProvider>
  );
}

/* EOF */
