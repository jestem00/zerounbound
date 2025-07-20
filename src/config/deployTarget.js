/*─────────────────────────────────────────────────────────────
      Developed by @jams2blues with love for the Tezos community
      File: src/config/deployTarget.js
      Rev : r747‑r30   2025‑07‑20
      Summary: default FAST_ORIGIN to true on testnets; retain
               forge service support for remote forging and injection.
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

/* optional slim origination (see docs/ThinBackendsteps.md) */
/**
 * Determine whether to use dual‑stage origination (FAST_ORIGIN).
 * When enabled, the dApp originates the collection with a minimal
 * metadata header and patches the full metadata in a second step.
 * This reduces the size of the first operation and avoids parsing
 * the huge views.json on the client.  Users can override via
 * the FAST_ORIGIN environment variable.  If FAST_ORIGIN is
 * undefined, we default to true on testnets (i.e. non‑mainnet).
 */
export const FAST_ORIGIN =
  process.env.FAST_ORIGIN === 'true' ||
  (!process.env.FAST_ORIGIN && TARGET !== 'mainnet');

/**
 * Base URL for the external forge service.  If set to a non-empty string,
 * forgeViaBackend/injectViaBackend will send requests to this host.  For
 * example, you might deploy the accompanying forge service at
 * `https://forgeghostnet.zerounbound.art` and set this to that domain.
 * Leave empty to use the built-in Next.js API routes (/api/forge, /api/inject).
 */
const FORGE_URLS = {
  ghostnet: 'https://forgeghostnet.zerounbound.art',
  mainnet : 'https://forgemainnet.zerounbound.art',
};

export const FORGE_SERVICE_URL = FORGE_URLS[TARGET] ?? '';

/* What changed & why:
   • Default FAST_ORIGIN to true on non‑mainnet when the environment variable
     is unset, to avoid heavy views parsing during storage preparation.
   • Updated header (r747‑r30) and summary to reflect the change, and retained
     remote forging support via FORGE_SERVICE_URL.
 */
