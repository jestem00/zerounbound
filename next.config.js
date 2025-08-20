/*─────────────────────────────────────────────────────────────
  Developed by @jams2blues – ZeroContract Studio
  File:    next.config.js
  Rev :    r272    2025-07-16
  Summary: ensure views.hex.js regeneration on every client build; fix stale export line
──────────────────────────────────────────────────────────────*/

import { GenerateSW }       from 'workbox-webpack-plugin';
import fs                   from 'fs';
import path                 from 'path';
import { fileURLToPath }    from 'url';
import { char2Bytes }       from '@taquito/utils';

/*──────────────── helper: __dirname in ESM ────────────────*/
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /*──────── compiler options ────*/
  compiler: { styledComponents: true },

  /*──────── ESLint (CI) ─────────*/
  eslint: {
    ignoreDuringBuilds: true,
  },

  /*──────── webpack tweaks ──────*/
  webpack(config, { isServer, dev }) {
    /* Michelson contract files as raw strings (prepended) */
    config.module.rules.unshift({
      test: /\.tz$/i,
      type: 'asset/source',
      generator: { dataUrl: c => c.toString() },
    });

    /* Shim Node built‑ins for browser bundle */
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      fs: false, path: false, crypto: false, stream: false,
    };
    // BEGIN ADD [P5-ASSET-SOURCE]
    config.module.rules.push({ test: /p5-\d+\.\d+\.\d+\.min\.js$/, type: 'asset/source' });
    // END ADD [P5-ASSET-SOURCE]

    /* PWA service‑worker for prod client build */
    if (!isServer && !dev) {
      config.plugins.push(
        new GenerateSW({
          swDest: 'static/sw.js',
          clientsClaim: true,
          skipWaiting: true,
          navigateFallback: '/index.html',
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          runtimeCaching: [
            { urlPattern: /\.(?:js|css|html|json)$/, handler: 'StaleWhileRevalidate' },
            {
              urlPattern: /\.(?:png|jpe?g|svg|gif|webp)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'images',
                expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        }),
      );
    }

    /* Pre‑build views.hex.js for *all* client builds (dev + prod)  */
    if (!isServer) {
      const viewsPath = path.resolve(
        __dirname,
        'contracts/metadata/views/Zero_Contract_v4_views.json',
      );
      const viewsData = fs.readFileSync(viewsPath, 'utf8');
      const hex       = '0x' + char2Bytes(viewsData);
      const outPath   = path.resolve(__dirname, 'src/constants/views.hex.js');
      fs.writeFileSync(outPath, `export default '${hex}';\n`);
    }

    return config;
  },

  images: { domains: [] },
};

export default nextConfig;
/* EOF */

/* What changed & why: Fixed stale "export default viewsHex;" by regenerating on every client build; rev r272; Compile-Guard passed. */
