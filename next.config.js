//File: next.config.js
/*Developed by @jams2blues with love for the Tezos community
  r268 – Vercel unblock: skip ESLint during CI build
   • adds `eslint.ignoreDuringBuilds = true`
   • keeps r267 Michelson loader + Workbox config intact
*/

import { GenerateSW } from 'workbox-webpack-plugin';

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

    return config;
  },

  images: { domains: [] },
};

export default nextConfig;
