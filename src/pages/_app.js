/*Developed by @jams2blues with love for the Tezos community
  File: src/pages/_app.js
  Summary: registers service-worker once on client */

import React       from 'react';
import Head        from 'next/head';
import Layout      from '../ui/Layout.jsx';
import { ThemeProvider  } from '../contexts/ThemeContext.js';
import { WalletProvider } from '../contexts/WalletContext.js';
import GlobalStyles      from '../styles/globalStyles.js';

export default function ZeroUnboundApp({ Component, pageProps }) {
  /* one-time SW registration */
  React.useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js')
      .catch((e) => console.warn('SW registration failed', e));
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
      </WalletProvider>
    </ThemeProvider>
  );
}

/* What changed & why: adds SW registration via useEffect, no duplicate
   renders, fulfils PWA offline invariant (I09). */
