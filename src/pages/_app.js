/*Developed by @jams2blues with love for the Tezos community
  File: src/pages/_app.js
  Rev : r552   2025-06-13
  Summary: boots sliceCache auto-purge (I61) + keeps SW register. */

import React from 'react';
import Head  from 'next/head';
import Layout       from '../ui/Layout.jsx';
import { ThemeProvider  } from '../contexts/ThemeContext.js';
import { WalletProvider } from '../contexts/WalletContext.js';
import GlobalStyles       from '../styles/globalStyles.js';
import { purgeExpiredSliceCache } from '../utils/sliceCache.js';
import MakeOfferDialog from '../ui/MakeOfferDialog.jsx';

export default function ZeroUnboundApp({ Component, pageProps }) {

  const [offer, setOffer] = React.useState({ open:false, contract:'', tokenId:'', market:'' });

  /* one-time PWA SW registration */
  React.useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js')
      .catch((e) => console.warn('SW registration failed', e));
  }, []);

  /* I61 – purge stale slice checkpoints (>24 h) */
  React.useEffect(() => {
    purgeExpiredSliceCache(1);
  }, []);

  /* make-offer overlay listener */
  React.useEffect(() => {
    const handler = (e) => {
      const { contract, tokenId, marketContract } = e.detail || {};
      setOffer({ open:true, contract, tokenId, market: marketContract || '' });
    };
    window.addEventListener('zu:makeOffer', handler);
    return () => window.removeEventListener('zu:makeOffer', handler);
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
        <MakeOfferDialog
          open={offer.open}
          contract={offer.contract}
          tokenId={offer.tokenId}
          marketContract={offer.market}
          onClose={() => setOffer({ open:false, contract:'', tokenId:'', market:'' })}
        />
      </WalletProvider>
    </ThemeProvider>
  );
}

/* EOF */
