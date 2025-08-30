/*Developed by @jams2blues
  File: src/pages/_app.js
  Rev:  r559
  Summary: Global preview CSS + global ShareDialog bus (view/purchase);
           compile-safe, resilient, and network-aware. */

import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

import Layout                 from '../ui/Layout.jsx';
import GlobalSnackbar         from '../ui/GlobalSnackbar.jsx';
import { ThemeProvider  }     from '../contexts/ThemeContext.js';
import { WalletProvider }     from '../contexts/WalletContext.js';
import GlobalStyles           from '../styles/globalStyles.js';
import { purgeExpiredSliceCache } from '../utils/sliceCache.js';

import MakeOfferDialog from '../ui/MakeOfferDialog.jsx';
import BuyDialog       from '../ui/BuyDialog.jsx';
import ListTokenDialog from '../ui/ListTokenDialog.jsx';
import { installNavigationRecovery } from '../utils/navigationRecovery.js';

// Global 1x1 preview CSS (images/videos fit without cropping)
import '../styles/preview-1x1.css';

// Global share overlay
import ShareDialog from '../ui/ShareDialog.jsx';
import { TZKT_API } from '../config/deployTarget.js';
import decodeHexFields, { decodeHexJson } from '../utils/decodeHexFields.js';
import { jFetch } from '../core/net.js';

export default function ZeroUnboundApp({ Component, pageProps }) {
  // Dialog states
  const [offer,   setOffer]   = React.useState({ open:false, contract:'', tokenId:'', market:'' });
  const [buy,     setBuy]     = React.useState({ open:false, contract:'', tokenId:'', market:'' });
  const [listing, setListing] = React.useState({ open:false, contract:'', tokenId:'', market:'' });
  const [shareDlg, setShareDlg] = React.useState({ open:false });

  // Navigation recovery key
  const router = useRouter();
  const [navVer, setNavVer] = React.useState(0);

  // PWA SW registration (once)
  React.useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('SW registration failed', e));
  }, []);

  // Global ShareDialog bus
  React.useEffect(() => {
    const onShare = async (e) => {
      const { contract, addr, tokenId, variant = 'view', url, previewUri, scope: scopeIn, name: nameIn, creators: creatorsIn } = e.detail || {};
      const collection = addr || contract || '';
      let name = String(nameIn || '').trim();
      let creators = Array.isArray(creatorsIn) ? creatorsIn : (creatorsIn ? [creatorsIn] : []);
      let preview = previewUri || (collection && tokenId != null ? `/api/snapshot/${collection}/${tokenId}` : '');
      let scope = scopeIn || 'token';
      let meta = null;

      const base = `${String(TZKT_API || '').replace(/\/+$/, '')}/v1`;
      const ipfsToHttp = (u = '') => (typeof u === 'string' && u.startsWith('ipfs://') ? u.replace(/^ipfs:\/\//i, 'https://ipfs.io/ipfs/') : u);

      const fetchJson = async (u) => {
        try {
          const res = await jFetch(u, 2);
          if (res && typeof res === 'object' && 'ok' in res && typeof res.json === 'function') {
            return await res.json();
          }
          return res; // assume already JSON
        } catch {
          return null;
        }
      };

      try {
        if (collection && tokenId != null) {
          // Token share: fetch token metadata for name + creators
          const rows = await fetchJson(`${base}/tokens?contract=${encodeURIComponent(collection)}&tokenId=${encodeURIComponent(tokenId)}&select=metadata&limit=1`);
          const metaRaw = Array.isArray(rows) ? (rows[0] || {}) : (rows || {});
          meta = metaRaw;
          if (typeof metaRaw === 'string') {
            try { meta = JSON.parse(metaRaw); } catch { meta = decodeHexJson(metaRaw) || {}; }
          }
          meta = decodeHexFields(meta || {});
          if (!name) name = String(meta?.name || '').trim() || '';
          if (!creators || creators.length === 0) {
            const cr = meta?.creators || meta?.authors || [];
            creators = Array.isArray(cr) ? cr : (cr ? [cr] : []);
          }
          scope = scopeIn || 'token';
        } else if (collection) {
          // Collection share: fetch contract metadata for name + authors; preview if not provided
          scope = 'collection';
          try {
            // Big-map content
            const bm = await fetchJson(`${base}/contracts/${encodeURIComponent(collection)}/bigmaps/metadata/keys?key=content&select=value&limit=1`);
            const raw = Array.isArray(bm) ? bm[0] : null;
            let content = {};
            if (typeof raw === 'string') {
              try { content = JSON.parse(raw); } catch { content = decodeHexJson(raw) || {}; }
            }
            content = decodeHexFields(content || {});
            if (!name) name = String(content?.name || content?.collectionName || content?.title || '').trim();
            if (!preview) {
              const p = content?.imageUri || content?.displayUri || content?.thumbnailUri || '';
              if (p) preview = ipfsToHttp(p);
            }
            const auth = content?.authors || content?.creators || [];
            if (creators.length === 0) creators = Array.isArray(auth) ? auth : (auth ? [auth] : []);
          } catch { /* ignore */ }

          try {
            // Fallback to contract metadata fields
            const obj = await fetchJson(`${base}/contracts/${encodeURIComponent(collection)}?select=metadata,alias,creator`);
            let md = obj?.metadata || {};
            md = decodeHexFields(md || {});
            if (!name) name = String(md?.name || md?.collectionName || md?.title || obj?.alias || '').trim();
            if (!preview) {
              const p = md?.imageUri || md?.displayUri || md?.thumbnailUri || '';
              if (p) preview = ipfsToHttp(p);
            }
            if (creators.length === 0) {
              const c = md?.authors || md?.creators || obj?.creator?.address || '';
              creators = Array.isArray(c) ? c : (c ? [c] : []);
            }
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }

      // Normalize absolute URL if a relative page URL was provided
      let absUrl = url || '';
      try {
        if (absUrl && !/^https?:/i.test(absUrl)) {
          const origin = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : '';
          absUrl = origin ? `${origin}${absUrl.startsWith('/') ? '' : '/'}${absUrl}` : absUrl;
        }
      } catch { /* ignore */ }

      // Resolve @alias for first tz creator (best-effort)
      let alias = '';
      try {
        const tz = creators.find((v) => typeof v === 'string' && /^tz/i.test(v.trim()));
        if (tz) {
          const res = await fetch(`/api/handle/${encodeURIComponent(tz)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
          // Only prefix '@' when we have a real handle; otherwise use the FULL tz address (not shortened)
          alias = res?.handle ? `@${res.handle}` : tz;
        }
      } catch { /* ignore */ }

      // Download info (tokens only)
      let downloadUri = '';
      let downloadMime = '';
      let downloadName = '';
      try {
        if (scope === 'token' && meta && typeof meta === 'object') {
          downloadUri = meta.artifactUri || '';
          downloadMime = meta.mimeType || (Array.isArray(meta.formats) ? meta.formats[0]?.mimeType : '') || '';
          downloadName = meta.name || name || '';
        }
      } catch { /* ignore */ }

      setShareDlg({
        open: true,
        variant,
        scope,
        addr: collection,
        tokenId,
        name,
        creators,
        preview,
        alias,
        url: absUrl,
        downloadUri,
        downloadMime,
        downloadName,
      });
    };
    window.addEventListener('zu:openShare', onShare);
    return () => window.removeEventListener('zu:openShare', onShare);
  }, []);

  // Purge stale slice checkpoints
  React.useEffect(() => { purgeExpiredSliceCache(1); }, []);

  // Navigation recovery (back/forward + BFCache)
  React.useEffect(() => {
    if (!router?.isReady) return undefined;
    return installNavigationRecovery(router, () => setNavVer((v) => v + 1));
  }, [router?.isReady]);

  // Dialog buses
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

  return (
    <ThemeProvider>
      <WalletProvider>
        <Head>
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <title>Zero Unbound - Contract Studio</title>
        </Head>

        <GlobalStyles />
        <Layout>
          {/* Keyed by path + navVer so back/forward remounts page components */}
          <Component key={`${router.asPath}::${navVer}`} {...pageProps} />
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
        {shareDlg.open && (
          <ShareDialog
            open
            onClose={() => setShareDlg({ open:false })}
            variant={shareDlg.variant}
            scope={shareDlg.scope}
            addr={shareDlg.addr}
            tokenId={shareDlg.tokenId}
            name={shareDlg.name}
            creators={shareDlg.creators}
            previewUri={shareDlg.preview}
            artistAlias={shareDlg.alias}
            url={shareDlg.url}
            downloadUri={shareDlg.downloadUri}
            downloadMime={shareDlg.downloadMime}
            downloadName={shareDlg.downloadName}
          />
        )}
      </WalletProvider>
    </ThemeProvider>
  );
}

/* EOF */
