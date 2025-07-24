/*─────────────────────────────────────────────────────────────────
Developed by @jams2blues – ZeroContract Studio
File: src/config/deployTarget.js
Rev:  r747‑r32   2025‑07‑24
Summary: switch to single‑stage origination across all networks;
         disable FAST_ORIGIN and remove remote forge service support.  */

// Define which network to target. Accepts 'ghostnet' or 'mainnet'.
export const TARGET = 'ghostnet';           // 'ghostnet' | 'mainnet'

// Per-network configuration. These values describe site appearance,
// RPC endpoints, TzKT API base URLs and other settings used across
// the application.  Adjust as needed when adding new networks.
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
      'https://rpc.ghostnet.teztnets.com',
      'https://ghostnet.tezos.ecadinfra.com',
      'https://rpc.tzkt.io/ghostnet',
    ],
    tzkt:         'https://api.ghostnet.tzkt.io',
    redirects: [{
      source: '/:addr(kt1[0-9A-Za-z]{33})',
      destination: '/kt1/:addr',
      statusCode: 307,
    }],
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
      'https://prod.tcinfra.net/rpc/mainnet',
      'https://mainnet.tezos.ecadinfra.com',
    ],
    tzkt:         'https://api.tzkt.io',
    redirects:    [],
    pkgName:      'zerounbound-mainnet',
    devPort:      4000,
    ztBase:       'https://zeroterminal.art',
  },
};

// Export commonly used network properties for easy import.  Changing
// TARGET will automatically select the appropriate network config.
export const NET            = nets[TARGET];
export const NETWORK_KEY    = TARGET;
export const NETWORK_TYPE   = TARGET === 'mainnet' ? 'production' : 'test';
export const NETWORK_LABEL  = NET.label;

export const THEME_COLOR    = NET.themeColor;
export const BORDER_VAR     = NET.borderVar;
export const MANIFEST_NAME  = NET.manifestName;
export const DESCRIPTION    = NET.description;
export const CTA_FIRST      = NET.ctaFirst;
export const SITE_URL       = NET.siteUrl;
export const ROOT_URL       = SITE_URL;
export const OG_TITLE       = 'Zero Unbound — ZeroContract Studio';
export const OG_IMAGE       = NET.ogImage;
export const START_URL      = NET.startUrl;
export const RPC_URLS       = NET.rpc;
export const TZKT_API       = NET.tzkt;
export const REDIRECTS      = NET.redirects;
export const PACKAGE_NAME   = NET.pkgName;
export const DEV_PORT       = NET.devPort;
export const SITE_LOGO      = NET.siteLogo;

export const URL_BCD_BASE   = TARGET === 'ghostnet'
  ? 'https://better-call.dev/ghostnet/'
  : 'https://better-call.dev/mainnet/';

export const URL_OBJKT_BASE = TARGET === 'ghostnet'
  ? 'https://ghostnet.objkt.com/collection/'
  : 'https://objkt.com/collection/';

export const URL_TZKT_OP_BASE = TARGET === 'ghostnet'
  ? 'https://ghostnet.tzkt.io/'
  : 'https://tzkt.io/';

export const ZT_BASE_URL  = NET.ztBase;
export const ZT_MINT_URL  = `${ZT_BASE_URL}/?cmd=tokendata`;
export const ztTokenUrl   = (cid, tid) =>
  `${ZT_MINT_URL}&cid=${encodeURIComponent(cid)}&tid=${encodeURIComponent(tid)}`;

// Utility to select the fastest RPC endpoint by pinging multiple
// endpoints concurrently.  Returns the first reachable URL within
// the given timeout; throws if none are reachable.
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
    } catch (e) {
      clearTimeout(id);
      return { url, time: Infinity };
    }
  });
  const results = await Promise.all(promises);
  results.sort((a, b) => a.time - b.time);
  const fastest = results.find(r => r.time < Infinity);
  if (!fastest) throw new Error('All RPCs unreachable');
  return fastest.url;
}

export const DEFAULT_NETWORK = NETWORK_KEY;

/**
 * FAST_ORIGIN: dual‑stage origination has been retired.  This constant
 * exists for backward compatibility but is now permanently set to false.
 */
export const FAST_ORIGIN = false;

/**
 * Base URLs for remote forge services.  Remote forging and injection
 * have been removed from the platform.  These values are left empty
 * to indicate that client‑side forging is always used.
 */
const FORGE_URLS = {
  ghostnet: '',
  mainnet : '',
};

// Deprecated: always returns an empty string.
export const FORGE_SERVICE_URL = '';

/* What changed & why:
   • Disabled dual‑stage origination by permanently setting FAST_ORIGIN to false.
   • Removed remote forge service support; FORGE_SERVICE_URL now always empty.
   • Updated summary and comments to reflect single‑stage origination for all wallets. */