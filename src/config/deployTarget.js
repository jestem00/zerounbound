/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues with love for the Tezos community
  File:    src/config/deployTarget.js
  Rev :    r749   2025‑07‑18
  Summary: add default USE_BACKEND/FAST_ORIGIN flags w/o .env

  This module centralises network configuration and flag handling.
  The `TARGET` constant selects between ghostnet and mainnet,
  deriving labels, RPC lists, manifest names and URLs.  The
  `flag()` helper now consults the environment variables but falls
  back to sensible defaults when unspecified, avoiding reliance on
  `.env.local` while still allowing overrides via NEXT_PUBLIC_*
  variables.  By default USE_BACKEND is `true` (backend forging and
  injection) and FAST_ORIGIN is `false`, ensuring robust contract
  origination across wallets even on localhost or Vercel.  All
  exports remain tree‑shakable and side‑effect free.

────────────────────────────────────────────────────────────*/

export const TARGET = 'ghostnet';           // 'ghostnet' | 'mainnet'

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
export const ZT_BASE_URL  = NET.ztBase;
export const ZT_MINT_URL  = `${ZT_BASE_URL}/?cmd=tokendata`;
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

/* Environment flags (front‑end/server accessible) with sensible defaults.
   We avoid dependence on .env.local by returning fallback values when
   environment variables are undefined.  To override, set
   NEXT_PUBLIC_USE_BACKEND=true|false or NEXT_PUBLIC_FAST_ORIGIN=true|false. */
const defaults = { FAST_ORIGIN: false, USE_BACKEND: true };
const flag = (name) => {
  if (typeof process !== 'undefined' && process.env) {
    const v = process.env[`NEXT_PUBLIC_${name}`] ?? process.env[name];
    if (v !== undefined) return v === 'true';
  }
  return defaults[name] ?? false;
};
export const FAST_ORIGIN = flag('FAST_ORIGIN');
export const USE_BACKEND = flag('USE_BACKEND');

/* What changed & why:
   • Added default-based flag helper: if no env var is provided,
     USE_BACKEND defaults to true and FAST_ORIGIN defaults to false.
     This removes reliance on .env.local and ensures backend forging/
     injection is used by default on localhost and Vercel.
   • Updated Rev and summary to reflect new detection logic.
*/
/* EOF */
