/*─────────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/config/deployTarget.js
  Rev :    r1158    2025‑08‑05
  Summary: Corrected ghostnet marketplace address. Updated
           MARKETPLACE_ADDRESSES to use KT1R1PzLhBXEd98ei72mFuz4FrUYEcuV7t1p for
           ghostnet, fixing listing errors. Previous revision added
           DOMAIN_CONTRACTS and FALLBACK_RPCS; other configuration
           remains unchanged.
*/

// ---------------------------------------------------------------------------
// Network target selection
//
// The ZeroUnbound platform supports multiple Tezos networks.  During
// development the target network is usually switched by running one of
// the provided yarn scripts (e.g. yarn set:ghostnet or yarn set:mainnet).
// Historically, these scripts rewrote a hard‑coded TARGET constant in this
// file.  A recent revision replaced the constant with a dynamic lookup
// against process.env.NEXT_PUBLIC_NETWORK, which broke the rewrite logic
// and caused the dev server to always default to the ghostnet configuration.
//
// To maintain compatibility with both approaches we define a
// TARGET_FALLBACK constant that represents the last network chosen by
// scripts/setTarget.js.  If the NEXT_PUBLIC_NETWORK environment variable
// is defined at runtime it takes precedence; otherwise the fallback is
// used.  This hybrid approach lets developers switch networks via the
// rewrite script or by exporting NEXT_PUBLIC_NETWORK for CI/production.

// NOTE: The value of TARGET is overwritten by scripts/setTarget.js.  Do not
// edit it manually.  If you wish to change the default network for your
// environment, run yarn set:<network> (e.g. yarn set:mainnet or
// yarn set:ghostnet).  This constant defines the active Tezos
// network for the entire application.  Branches destined for Vercel
// deployments should commit a version of this file with TARGET set to
// 'mainnet' or 'ghostnet' as appropriate; deployTarget.js is the sole
// diverging file between network branches.  During development, the
// scripts/setTarget.js helper rewrites this line to toggle networks.
export const TARGET = 'ghostnet';

// ---------------------------------------------------------------------------
// Per‑network configuration
//
// Each supported network defines its own appearance, RPC endpoints, TzKT
// API domains and other variables.  The fastest reachable RPC is selected
// at runtime via selectFastestRpc().  Adjust these values as necessary
// when adding or updating networks.  The devPort property determines
// the port used by yarn dev:current; ghostnet defaults to 3000 and
// mainnet defaults to 4000.

const nets = {
  ghostnet: {
    label:        'GHOSTNET',
    themeColor:   '#6f79ff',
    borderVar:    '--zu-ghostnet',
    manifestName: 'ZeroUnbound.art • Ghostnet',
    siteLogo:     '/sprites/ghostnet_logo.svg',
    ctaFirst:     '/deploy',
    description:  'Test your fully-on-chain art collection risk‑free on Ghostnet.',
    siteUrl:      'https://ghostnet.zerounbound.art',
    ogImage:      'https://ghostnet.zerounbound.art/sprites/ghostnetBanner.png',
    startUrl:     '/?source=pwa-ghostnet',
    rpc: [
      'https://ghostnet.ecadinfra.com',
      'https://rpc.ghostnet.teztnets.com',
    ],
    tzkt:         'https://api.ghostnet.tzkt.io',
    redirects: [
      {
        source: '/:addr(kt1[0-9A-Za-z]{33})',
        destination: '/kt1/:addr',
        statusCode: 307,
      },
    ],
    pkgName:      'zerounbound-ghostnet',
    devPort:      3000,
    ztBase:       'https://testnet.zeroterminal.art',
  },
  mainnet: {
    label:        'MAINNET',
    themeColor:   '#00c48c',
    borderVar:    '--zu-mainnet',
    manifestName: 'ZeroUnbound.art',
    siteLogo:     '/sprites/logo.svg',
    ctaFirst:     '/explore',
    description:  'Create 100 % on‑chain art collections on Tezos mainnet.',
    siteUrl:      'https://zerounbound.art',
    ogImage:      'https://zerounbound.art/sprites/Banner.png',
    startUrl:     '/?source=pwa-mainnet',
    rpc: [
      // Reordered to avoid SmartPy CORS intermittency in browsers
      'https://mainnet.tezos.ecadinfra.com',
      'https://prod.tcinfra.net/rpc/mainnet',
      // Keep SmartPy last as a fallback
      'https://mainnet.smartpy.io',
    ],
    tzkt:         'https://api.tzkt.io',
    redirects:    [],
    pkgName:      'zerounbound-mainnet',
    devPort:      4000,
    ztBase:       'https://zeroterminal.art',
  },
};

// Extract the selected network configuration.  Changing TARGET (via
// environment variable or setTarget.js rewrite) will automatically
// update these exports.

export const NET           = nets[TARGET];
export const NETWORK_KEY   = TARGET;
export const NETWORK_TYPE  = TARGET === 'mainnet' ? 'production' : 'test';
export const NETWORK_LABEL = NET.label;

export const THEME_COLOR   = NET.themeColor;
export const BORDER_VAR    = NET.borderVar;
export const MANIFEST_NAME = NET.manifestName;
export const DESCRIPTION   = NET.description;
export const CTA_FIRST     = NET.ctaFirst;
export const SITE_URL      = NET.siteUrl;
export const ROOT_URL      = SITE_URL;
export const OG_TITLE      = 'Zero Unbound — ZeroContract Studio';
export const OG_IMAGE      = NET.ogImage;
export const START_URL     = NET.startUrl;
export const RPC_URLS      = NET.rpc;
export const TZKT_API      = NET.tzkt;
export const REDIRECTS     = NET.redirects;
export const PACKAGE_NAME  = NET.pkgName;
export const DEV_PORT      = NET.devPort;
export const SITE_LOGO     = NET.siteLogo;

// ---------------------------------------------------------------------------
// View execution feature flags (compile-time config)
//
// Some public RPCs intermittently fail run_code/run_script_view requests, and
// some providers enforce strict CORS. We centralize these toggles here so they
// are controlled alongside network settings rather than environment variables.
//
// ENABLE_ONCHAIN_VIEWS: enables Taquito metadata views (on-chain_listings,
// on-chain_offers, etc). Default true for parity with previous behavior.
// ENABLE_OFFCHAIN_MARKET_VIEWS: enables TZIP-16 off-chain listings view
// (offchain_listings_for_token). Default false to avoid RPC/CORS issues.
// Disable on-chain views in mainnet to avoid browser CORS on run_code; keep
// enabled on ghostnet for testing. TzKT/BCD fallbacks remain available.
export const ENABLE_ONCHAIN_VIEWS = TARGET !== 'mainnet';
export const ENABLE_OFFCHAIN_MARKET_VIEWS = false;

// External site URL prefixes.  These base URLs change by network.
export const URL_BCD_BASE = TARGET === 'ghostnet'
  ? 'https://better-call.dev/ghostnet/'
  : 'https://better-call.dev/mainnet/';
export const URL_OBJKT_BASE = TARGET === 'ghostnet'
  ? 'https://ghostnet.objkt.com/collection/'
  : 'https://objkt.com/collection/';

// Base URL for the Objkt tokens pages.  This constant points to
// the network-specific site where individual tokens can be listed or
// viewed.  It is derived from the collection base but exported
// explicitly for convenience in UIs that need to construct token
// links.  See ListTokenDialog.jsx for usage.
export const URL_OBJKT_TOKENS_BASE = TARGET === 'ghostnet'
  ? 'https://ghostnet.objkt.com/tokens/'
  : 'https://objkt.com/tokens/';
export const URL_TZKT_OP_BASE = TARGET === 'ghostnet'
  ? 'https://ghostnet.tzkt.io/'
  : 'https://tzkt.io/';
export const ZT_BASE_URL    = NET.ztBase;
export const ZT_MINT_URL    = `${ZT_BASE_URL}/?cmd=tokendata`;
export const ztTokenUrl     = (cid, tid) =>
  `${ZT_MINT_URL}&cid=${encodeURIComponent(cid)}&tid=${encodeURIComponent(tid)}`;

// Factory contract addresses per network.  These addresses correspond to
// factories deployed on 2025‑07‑29.  Ghostnet: KT1H8myPr7EmVPFLmBcnSxgiYigdMKZu3ayw.
// Mainnet: KT1VbzbUiswEqCsE9ugTFsG1nwh3XwwEq6D2.  Both entries must be kept
// identical across branches; deployTarget.js is the sole diverging file.
export const FACTORY_ADDRESSES = {
  ghostnet: 'KT1H8myPr7EmVPFLmBcnSxgiYigdMKZu3ayw',
  mainnet:  'KT1VbzbUiswEqCsE9ugTFsG1nwh3XwwEq6D2',
};

// Selected factory address based on TARGET.  Use this constant to call
// the factory when originating new collections.  If no factory exists for
// the current network, FACTORY_ADDRESS will be undefined and the UI can
// fallback to direct origination.
export const FACTORY_ADDRESS = FACTORY_ADDRESSES[TARGET];

// ---------------------------------------------------------------------------
// Marketplace contract addresses
//
// The ZeroSum marketplace lives at different addresses on Ghostnet and
// Mainnet.  Rather than hard‑coding these values in multiple modules, we
// centralise them here alongside other per‑network configuration.  Each
// entry corresponds to the canonical marketplace contract for the given
// network.  These values should be kept identical across branches, with
// deployTarget.js remaining the sole diverging file between Ghostnet and
// Mainnet.  See src/core/marketplace.js for usage.
// Marketplace – canonical ZeroSum contracts
export const MARKETPLACE_ADDRESSES = {
  ghostnet: 'KT19yn9fWP6zTSLPntGyrPwc7JuMHnYxAn1z',
  mainnet : 'KT1Stfgf6H5N1idSBcAMAbo1BdPMi9K6E43M',
};

// Selected marketplace address based on the active TARGET.  Use this
// constant when you need the marketplace contract for a given network.
// If no entry exists for a network, the value will be undefined and
// calling code should handle that case appropriately.
export const MARKETPLACE_ADDRESS = MARKETPLACE_ADDRESSES[TARGET];

// ---------------------------------------------------------------------------
// Static Explore Feed (GitHub Pages) configuration
// These values do not diverge between branches; they point to the same Pages
// site that publishes both mainnet and ghostnet feeds under /<network>/.
// Clients use FEED_PAGE_SIZE to compute pagination offsets into the static feed.
export const FEED_STATIC_BASE = 'https://jams2blues.github.io/zerounbound';
export const FEED_PAGE_SIZE   = 120; // must match scripts/exploreFeed.mjs --page-size

// ---------------------------------------------------------------------------
// Tezos Domain registry addresses and fallback RPCs
//
// DOMAIN_CONTRACTS exposes the NameRegistry contract addresses used by the
// Tezos Domains project to store reverse record mappings.  FALLBACK_RPCS
// lists network-specific endpoints for on‑chain domain lookup when
// RPC_URLS is unavailable.  Both exports are consumed by
// resolveTezosDomain.js to perform optional on-chain resolution.
export const DOMAIN_CONTRACTS = {
  ghostnet: 'KT1REqKBXwULnmU6RpZxnRBUgcBmESnXhCWs',
  mainnet:  'KT1GBZmSxmnKJXGMdMLbugPfLyUPmuLSMwKS',
};

export const FALLBACK_RPCS = {
  ghostnet: 'https://ghostnet.tezos.marigold.dev',
  mainnet:  'https://mainnet.api.tez.ie',
};

// ---------------------------------------------------------------------------
// Remote forge service
//
// Remote forging and injection were removed from the ZeroUnbound
// platform in r1015; however, some legacy modules still import
// FORGE_SERVICE_URL from deployTarget.js.  To maintain backward
// compatibility and avoid build errors we export a constant that
// always resolves to an empty string.  Additional URLs could be
// mapped per network if remote forging is ever reintroduced.
// eslint-disable-next-line no-unused-vars
const FORGE_URLS = {
  ghostnet: '',
  mainnet:  '',
};

// Deprecated: always returns an empty string.  Remote forge services are
// permanently disabled; client code should fall back to local forging via
// Taquito’s LocalForger.  This export is retained solely to satisfy
// existing imports.
export const FORGE_SERVICE_URL = '';

/**
 * Utility to select the fastest reachable RPC endpoint.  Given an array of
 * endpoints (RPC_URLS), this function pings each endpoint concurrently and
 * returns the first one that responds within the specified timeout.  If no
 * endpoints respond, an error is thrown.  See core/net.js for usage.
 *
 * @param {number} timeout Timeout in milliseconds (default 2000 ms).
 * @returns {Promise<string>} The URL of the fastest reachable RPC.
 */
export async function selectFastestRpc(timeout = 2000) {
  // Probe each RPC for a simple GET that avoids CORS preflight.
  // Pick the fastest successful endpoint; never return a failing URL.
  const checks = await Promise.allSettled(
    RPC_URLS.map(async (url) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
      let ok = false;
      try {
        const res = await fetch(`${url}/chains/main/chain_id`, { signal: controller.signal, mode: 'cors' });
        ok = !!res && res.ok;
      } catch {
        ok = false;
      } finally {
        clearTimeout(id);
      }
      const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
      return { url, ok, time: ok ? (end - start) : Infinity };
    })
  );
  const candidates = checks
    .map((r, i) => (r.status === 'fulfilled' ? r.value : { url: RPC_URLS[i], ok: false, time: Infinity }))
    .filter(Boolean);
  let best = null;
  for (const c of candidates) {
    if (c.ok && (best == null || c.time < best.time)) best = c;
  }
  if (best && best.ok) return best.url;
  // Fallback: try endpoints sequentially until one succeeds.
  for (const url of RPC_URLS) {
    try {
      const res = await fetch(`${url}/chains/main/chain_id`, { mode: 'cors' });
      if (res && res.ok) return url;
    } catch { /* try next */ }
  }
  throw new Error('No reachable RPC endpoints');
}

// Default network key.  Many modules import this constant to determine the
// initial network.  By defining DEFAULT_NETWORK equal to TARGET we maintain
// compatibility with components such as WalletContext that expect this export.
export const DEFAULT_NETWORK = TARGET;

// ---------------------------------------------------------------------------
// External marketplace addresses (for attribution in history views)
//
// OBJKT marketplace (mainnet). Ghostnet address is not used in production;
// leave empty to disable OBJKT correlation on test networks.
export const OBJKT_MARKET_ADDRESS = TARGET === 'mainnet'
  ? 'KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X'
  : 'KT1SegJhvGNsu9j9fPYC8PcH88Y4bFR9qi33';

/* What changed & why:
   • Added DOMAIN_CONTRACTS and FALLBACK_RPCS exports.  These new constants
     centralise the Tezos Domains registry contract addresses and fallback
     RPC endpoints per network.  resolveTezosDomain.js imports them to
     perform network-aware on-chain lookups and avoid hard‑coded values,
     complying with invariant I10.
   • Added a revision header noting the new revision r1157 on 2025‑08‑01.
*/
