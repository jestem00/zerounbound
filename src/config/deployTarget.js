/*Developed by @jams2blues with love for the Tezos community
  File: src/config/deployTarget.js
  Summary: Authoritative switch-board. Flip TARGET once → everything
           (RPCs, theming, explorer bases, PWA meta, devPort) updates. */

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
    description:  'Test your fully-on-chain art collection risk-free on Ghostnet.',
    /* URLs */
    siteUrl:      'https://ghostnet.zerounbound.art',
    ogImage:      'https://ghostnet.zerounbound.art/sprites/gostnet_Banner.png',
    startUrl:     '/?source=pwa-ghostnet',
    rpc: [   
      'https://ghostnet.tezos.ecadinfra.com',  // ECAD Infra (May-2025 domain)
      'https://rpc.ghostnet.teztnets.com',      // Rapid EU+US CDN
      'https://rpc.tzkt.io/ghostnet'            // Baking Bad – high U.S. uptime
    ],
    tzkt:         'https://api.ghostnet.tzkt.io',
    redirects: [{
      source: '/:addr(kt1[0-9A-Za-z]{33})',
      destination: '/kt1/:addr',
      statusCode: 307,
    }],
    pkgName:      'zerounbound-ghostnet',
    devPort:      3000,
  },

  mainnet: {
    label:        'MAINNET',
    themeColor:   '#00c48c',
    borderVar:    '--zu-mainnet',
    manifestName: 'ZeroUnbound.art',
    siteLogo:     '/sprites/logo.svg',
    ctaFirst:     '/explore',
    description:  'Create 100 % on-chain art collections on Tezos mainnet.',
    siteUrl:      'https://zerounbound.art',
    ogImage:      'https://zerounbound.art/sprites/Banner.png',
    startUrl:     '/?source=pwa-mainnet',
    rpc: [
      'https://prod.tcinfra.net/rpc/mainnet',   // Tezos Commons – autoscaling cluster
      'https://mainnet.tezos.ecadinfra.com'
    ],
    tzkt:       'https://api.tzkt.io',
    redirects:  [],
    pkgName:    'zerounbound-mainnet',
    devPort:    4000,
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
export const SITE_LOGO       = NET.siteLogo;

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

/* What changed & why:
   • ghostnet RPC list updated to three *real* endpoints exposing full RPC.
*/
/* EOF */