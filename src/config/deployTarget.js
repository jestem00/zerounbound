/*─────────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    src/config/deployTarget.js
  Rev :    r1181    2025‑08‑07 UTC
  Summary: Consolidate marketplace configuration and expose both read
           and write addresses for the new ZeroSum contract.  Adds
           MARKETPLACE_WRITE_ADDRESSES, MARKETPLACE_READ_ADDRESSES and
           MARKETPLACE_ADDRESS exports so that consumers can reliably
           resolve the correct marketplace contract and avoid
           undefined look‑ups.  Retains prior network configuration
           (rpc, tzkt, factory addresses, domain constants) and
           preserves existing exports.  See Master Manifest §1 and
           invariant I131 for context.
──────────────────────────────────────────────────────────────────*/

// NOTE: TARGET is overwritten by scripts/setTarget.js during
// development.  Do not edit this value directly.  Use yarn set:ghostnet
// or yarn set:mainnet to toggle networks.  The default network is
// ghostnet.  This constant must be a simple string literal so that
// the regex in scripts/setTarget.js can locate and replace it during
// builds.  Do not add environment variable lookups here or the
// build script will fail.
export const TARGET = 'mainnet';

// ---------------------------------------------------------------------------
// Network definitions
//
// Each network defines its RPC endpoints, TzKT API base and other UI
// configuration.  Modify or extend these entries when adding support for
// additional Tezos networks.  The devPort determines the default port
// used by yarn dev:current for the given network.
const nets = {
  ghostnet: {
    label:        'GHOSTNET',
    themeColor:   '#6f79ff',
    borderVar:    '--zu-ghostnet',
    manifestName: 'ZeroUnbound.art • Ghostnet',
    siteLogo:     '/sprites/ghostnet_logo.svg',
    ctaFirst:     '/deploy',
    description:  'Test your fully‑on‑chain art collection risk‑free on Ghostnet.',
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
      // Primary mainnet RPC (recommended by ECAD Infra) – supports views
      'https://mainnet.tezos.ecadinfra.com',
      'https://prod.tcinfra.net/rpc/mainnet',
    ],
    tzkt:         'https://api.tzkt.io',
    redirects:    [],
    pkgName:      'zerounbound-mainnet',
    devPort:      4000,
    ztBase:       'https://zeroterminal.art',
  },
};

// Derive the selected network configuration.  Changing TARGET via
// environment variable or setTarget.js rewrite automatically updates
// these exports.
export const NET           = nets[TARGET] ?? nets.ghostnet;
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
export const ZT_BASE_URL    = NET.ztBase;
export const ZT_MINT_URL    = `${ZT_BASE_URL}/?cmd=tokendata`;
export const ztTokenUrl     = (cid, tid) => `${ZT_MINT_URL}&cid=${encodeURIComponent(cid)}&tid=${encodeURIComponent(tid)}`;

// Factory contract addresses per network (r1157).  Keep identical
// entries across branches; deployTarget.js remains the sole diverging file.
export const FACTORY_ADDRESSES = {
  ghostnet: 'KT1H8myPr7EmVPFLmBcnSxgiYigdMKZu3ayw',
  mainnet:  'KT1VbzbUiswEqCsE9ugTFsG1nwh3XwwEq6D2',
};
export const FACTORY_ADDRESS = FACTORY_ADDRESSES[TARGET];

// Marketplace configuration
//
// The ZeroSum marketplace now deploys separate read and write
// addresses.  Write operations (list, buy, offer) must target the
// primary address, while read operations may fan out to legacy
// replicas.  Expose explicit WRITE and READ maps along with a
// MARKETPLACE_ADDRESS singleton for back‑compatibility.
export const MARKETPLACE_WRITE_ADDRESSES = {
  ghostnet: 'KT19yn9fWP6zTSLPntGyrPwc7JuMHnYxAn1z',
  mainnet : 'KT19kipdLiWyBZvP7KWCPdRbDXuEiu3gfjBR',
};
/**
 * Read‑only marketplace addresses per network.  Each array lists
 * the contracts that may be queried for listings, offers and views.
 * The legacy ghostnet marketplace has been retired; only the
 * canonical contract remains in the read list.  When the mainnet
 * marketplace is upgraded, update the corresponding entry here.
 */
export const MARKETPLACE_READ_ADDRESSES = {
  ghostnet: [
    MARKETPLACE_WRITE_ADDRESSES.ghostnet,
  ],
  mainnet : [
    MARKETPLACE_WRITE_ADDRESSES.mainnet,
  ],
};
// Primary marketplace address for the active network.
export const MARKETPLACE_ADDRESS = MARKETPLACE_WRITE_ADDRESSES[TARGET];
// Preserve array export for read replicas; used by some modules.
export const MARKETPLACE_ADDRESSES = MARKETPLACE_READ_ADDRESSES;

// Tezos Domain registry and fallback RPCs.  Imported by
// resolveTezosDomain.js per invariant I131.  Do not remove these
// constants; missing values will break domain resolution.
export const DOMAIN_CONTRACTS = {
  ghostnet: 'KT1REqKBXwULnmU6RpZxnRBUgcBmESnXhCWs',
  mainnet:  'KT1GBZmSxmnKJXGMdMLbugPfLyUPmuLSMwKS',
};
export const FALLBACK_RPCS = {
  ghostnet: 'https://ghostnet.tezos.marigold.dev',
  mainnet:  'https://mainnet.api.tez.ie',
};

// Remote forge service disabled (r1015).  Retain export for
// backwards compatibility; always resolves to an empty string.
export const FORGE_SERVICE_URL = '';

/**
 * Select the fastest reachable RPC endpoint.  Pings each endpoint
 * concurrently and returns the first to respond within the timeout.
 * Throws if none respond.  Consumers (net.js, WalletContext) should
 * catch and retry on failure.
 *
 * @param {number} timeout Timeout in milliseconds (default 2000 ms)
 * @returns {Promise<string>} URL of the fastest reachable RPC
 */
export async function selectFastestRpc(timeout = 2000) {
  const promises = RPC_URLS.map(async (url) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const start = performance.now();
    try {
      const res = await fetch(`${url}/chains/main/blocks/head/header`, { signal: controller.signal });
      clearTimeout(id);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { url, time: performance.now() - start };
    } catch {
      return { url, time: Infinity };
    }
  });
  const result = await Promise.race(promises);
  if (!result || !result.url) throw new Error('No reachable RPC endpoints');
  return result.url;
}

// Provide DEFAULT_NETWORK alias for legacy imports.  Equal to TARGET.
export const DEFAULT_NETWORK = TARGET;

/* What changed & why:
   • Added MARKETPLACE_WRITE_ADDRESSES and MARKETPLACE_READ_ADDRESSES
     exports, selecting the new ZeroSum contract (KT19yn9f… on
     ghostnet) for write operations and including the legacy
     ghostnet address for read replicas.  MARKETPLACE_ADDRESS now
     references the write address for the active network.  This
     prevents undefined look‑ups and 400 errors in downstream
     modules (ListTokenDialog, marketplace.js).
   • Retained existing network configuration, factory addresses,
     domain constants and selectFastestRpc helper unchanged.
*/