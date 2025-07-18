/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues with love for the Tezos community
  File: src/config/deployTarget.js
  Rev : r748   2025‑07‑18
  Summary: expose FAST_ORIGIN and USE_BACKEND flags
─────────────────────────────────────────────────────────────*/

/*───────── flip when promoting to mainnet ─────────*/
export const TARGET = 'ghostnet';           // 'ghostnet' | 'mainnet'
/*──────────────────────────────────────────────────*/

/*──── per-network dictionaries ────*/
const nets = {
  ghostnet: {
    /* branding */
    label:        'GHOSTNET',
    themeColor:   '#6f79ff',
    borderVar:    '--zu-ghostnet',
    manifestName: 'ZeroUnbound.art • Ghostnet',
    siteLogo:     '/sprites/ghostnet_logo.svg',
    /* UX */
    ctaFirst:     '/deploy',
    description:  'Test your fully-on-chain art collection risk‑free on Ghostnet.',
    /* URLs */
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
    /* ZeroTerminal */
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
    tzkt:       'https://api.tzkt.io',
    redirects:  [],
    pkgName:    'zerounbound-mainnet',
    devPort:    4000,
    /* ZeroTerminal */
    ztBase:     'https://zeroterminal.art',
  },
};

/*──── derived exports ────*/
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
/* canonical origin (used by mintingTool metadata key) */
export const ROOT_URL       = SITE_URL;
export const OG_TITLE       = 'Zero Unbound — ZeroContract Studio';
export const OG_IMAGE       = NET.ogImage;

export const START_URL      = NET.startUrl;
export const RPC_URLS       = NET.rpc;
export const TZKT_API       = NET.tzkt;

export const REDIRECTS      = NET.redirects;
export const PACKAGE_NAME   = NET.pkgName;
export const DEV_PORT       = NET.devPort;

/*homepage logo*/
export const SITE_LOGO      = NET.siteLogo;

/*──── explorer bases (consumed by OperationOverlay) ────*/
export const URL_BCD_BASE   = TARGET === 'ghostnet'
  ? 'https://better-call.dev/ghostnet/'
  : 'https://better-call.dev/mainnet/';

export const URL_OBJKT_BASE = TARGET === 'ghostnet'
  ? 'https://ghostnet.objkt.com/collection/'
  : 'https://objkt.com/collection/';

export const URL_TZKT_OP_BASE = TARGET === 'ghostnet'
  ? 'https://ghostnet.tzkt.io/'
  : 'https://tzkt.io/';

/*────────── ZeroTerminal helpers ───────────────────────────*/
/** Base domain for ZeroTerminal (network‑aware) */
export const ZT_BASE_URL  = NET.ztBase;

/** Direct mint‑new link on ZeroTerminal */
export const ZT_MINT_URL  = `${ZT_BASE_URL}/?cmd=tokendata`;

/**
 * Build a ZeroTerminal URL for viewing/updating an existing token’s
 * metadata (`cid` = contract, `tid` = token‑id).
 */
export const ztTokenUrl = (contract, tokenId) =>
  `${ZT_MINT_URL}&cid=${encodeURIComponent(contract)}&tid=${encodeURIComponent(tokenId)}`;

/*──────── RPC selector ────────────────────────────*/
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

/* Environment flags (front‑end accessible) */
const flag = (name) => {
  if (typeof process === 'undefined') return false;
  const val = process.env[`NEXT_PUBLIC_${name}`] ?? process.env[name];
  return val === 'true';
};
export const FAST_ORIGIN = flag('FAST_ORIGIN');
export const USE_BACKEND = flag('USE_BACKEND');

/* What changed & why:
   • Added FAST_ORIGIN and USE_BACKEND exports derived from environment variables
     (reads NEXT_PUBLIC_FAST_ORIGIN/FAST_ORIGIN and NEXT_PUBLIC_USE_BACKEND/USE_BACKEND).
   • Updated revision and summary; Compile‑Guard passed.
*/
/* EOF */
