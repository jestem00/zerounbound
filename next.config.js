//File: next.config.js
/*Developed by @jams2blues with love for the Tezos community
  r269 – Origination accel: add webpack rule for views.hex.js
   • during build, emit src/constants/views.hex.js from views JSON
   • rev-bump r269; keeps Vercel ESLint skip intact
*/

import { GenerateSW } from 'workbox-webpack-plugin';
import fs             from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { char2Bytes } from '@taquito/utils';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /*──────── compiler options ────*/
  compiler: { styledComponents: true },

  /*──────── ESLint (CI) ─────────*/
  eslint: {
    /*  Vercel fails build on stylistic warnings from strict ruleset.
        We keep linting locally (‵yarn lint‵) but allow production
        build to proceed.  Invariants allow – no rule requires
        build-breaking lint. */
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

    /* Shim Node built-ins for browser bundle */
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      fs: false, path: false, crypto: false, stream: false,
    };

    /* PWA service-worker for prod client build */
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

    /* Pre-build views.hex.js during production build */
    if (!dev && !isServer) {
      const viewsPath = path.resolve(__dirname, 'contracts/metadata/views/Zero_Contract_v4_views.json');
      const viewsData = fs.readFileSync(viewsPath, 'utf8');
      const hex = '0x' + char2Bytes(viewsData);
      const outPath = path.resolve(__dirname, 'src/constants/views.hex.js');
      fs.writeFileSync(outPath, `export default '${hex}';\n`);
    }

    return config;
  },

  images: { domains: [] },
};

export default nextConfig;

/* What changed & why: Added webpack hook to generate views.hex.js from JSON during build; rev r269. */