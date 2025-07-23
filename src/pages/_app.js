/*Developed by @jams2blues with love for the Tezos community
  File:    src/pages/_app.js
  Rev :    r556-a1   2025-07-23
  Summary: add SW update auto-reload; register service worker once and include GlobalSnackbar*/
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

  /* NEW: reload when a new SW takes control
   * Listen for controllerchange events on serviceWorker.
   * When triggered, force a hard reload so users always run the latest code.
   * Without this hook, clients may continue executing stale bundles after
   * an update until a full page reload, causing mismatched fee/slice logic.
   */
  React.useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    let refreshing = false;
    const handleControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      // reload the page to pick up new assets
      try {
        window.location.reload(true);
      } catch {
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
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
/* What changed & why:
   • Added a controllerchange listener to automatically reload when the service
     worker takes control of a new version; this ensures users run the
     latest bundle without manual cache clears.
   • Updated revision and summary lines to reflect the new functionality.
*/
/* EOF */