/*Developed by @jams2blues with love for the Tezos community
  File:    src/pages/_app.js
  Rev :    r556   2025‑09‑22
  Summary: adds GlobalSnackbar + syntax fixes + zero unused imports */
import React from 'react';
import Head  from 'next/head';

import Layout                from '../ui/Layout.jsx';
import GlobalSnackbar        from '../ui/GlobalSnackbar.jsx';
import { ThemeProvider  }    from '../contexts/ThemeContext.js';
import { WalletProvider }    from '../contexts/WalletContext.js';
import GlobalStyles          from '../styles/globalStyles.js';
import { purgeExpiredSliceCache } from '../utils/sliceCache.js';

import MakeOfferDialog from '../ui/MakeOfferDialog.jsx';
import BuyDialog       from '../ui/BuyDialog.jsx';
import ListTokenDialog from '../ui/ListTokenDialog.jsx';

/*─────────────────────────────────────────────────────────────*/
export default function ZeroUnboundApp({ Component, pageProps }) {
  /* dialog states */
  const [offer,   setOffer]   = React.useState({ open:false, contract:'', tokenId:'', market:'' });
  const [buy,     setBuy]     = React.useState({ open:false, contract:'', tokenId:'', market:'' });
  const [listing, setListing] = React.useState({ open:false, contract:'', tokenId:'', market:'' });

  /* one‑time PWA SW registration (I09) */
  React.useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js')
      .catch((e) => console.warn('SW registration failed', e));
  }, []);

  /* I61 – purge stale slice checkpoints (>24 h) */
  React.useEffect(() => { purgeExpiredSliceCache(1); }, []);

  /*──────── event buses ─────────────────────────────────────*/
  React.useEffect(() => {
    const onOffer = (e) => {
      const { contract, tokenId, marketContract, market } = e.detail || {};
      setOffer({ open:true, contract, tokenId, market: marketContract || market || '' });
    };
    const onBuy = (e) => {
      const { contract, tokenId, marketContract, market } = e.detail || {};
      setBuy({ open:true, contract, tokenId, market: marketContract || market || '' });
    };
    const onList = (e) => {
      const { contract, tokenId, marketContract, market } = e.detail || {};
      setListing({ open:true, contract, tokenId, market: marketContract || market || '' });
    };

    window.addEventListener('zu:makeOffer', onOffer);
    window.addEventListener('zu:buyToken',  onBuy);
    window.addEventListener('zu:listToken', onList);
    return () => {
      window.removeEventListener('zu:makeOffer', onOffer);
      window.removeEventListener('zu:buyToken',  onBuy);
      window.removeEventListener('zu:listToken', onList);
    };
  }, []);

  /*════════ render ═══════════════════════════════════════════*/
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

        {/* app-wide reactive snackbar */}
        <GlobalSnackbar />

        {/* dialogs */}
        {offer.open && (
          <MakeOfferDialog
            open
            contract={offer.contract}
            tokenId={offer.tokenId}
            marketContract={offer.market}
            onClose={() => setOffer({ open:false, contract:'', tokenId:'', market:'' })}
          />
        )}
        {buy.open && (
          <BuyDialog
            open
            contract={buy.contract}
            tokenId={buy.tokenId}
            market={buy.market}
            onClose={() => setBuy({ open:false, contract:'', tokenId:'', market:'' })}
          />
        )}
        {listing.open && (
          <ListTokenDialog
            open
            contract={listing.contract}
            tokenId={listing.tokenId}
            market={listing.market}
            onClose={() => setListing({ open:false, contract:'', tokenId:'', market:'' })}
          />
        )}
      </WalletProvider>
    </ThemeProvider>
  );
}
/* EOF */