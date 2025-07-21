//File: ghostnet/public/sw.js
/* r265 – network-first scripts & styles, network-only html
   • Switch static asset cache from StaleWhileRevalidate to NetworkFirst for JS/CSS/manifest
   • Use NetworkOnly for HTML documents to always fetch latest pages
   • Retains image and tzkt caching unchanged                                 */

/* IMPORTANT: This service worker is loaded by Workbox v7.0.0. It
   controls caching behaviour across the Zerounbound front‑end.  The
   previous revision used a StaleWhileRevalidate strategy for all
   scripts, styles and documents which meant browsers could keep
   returning outdated code from the cache until a network request
   eventually updated it.  To guarantee users always receive fresh
   code after a deploy, this revision changes the strategy: scripts,
   styles and manifests now use NetworkFirst with a 10‑second network
   timeout (falling back to cache only if offline), and HTML
   documents bypass the cache entirely.  Images and tzkt JSON
   continue to use StaleWhileRevalidate with the same expiration
   policies. */

importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');

/* MUST precede every other workbox call */
workbox.setConfig({ debug: false });

self.skipWaiting();
workbox.core.clientsClaim();

/* purge all caches on quota overflow once */
workbox.core.registerQuotaErrorCallback(() =>
  caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))),
);

/* clear legacy precaches */
workbox.precaching.cleanupOutdatedCaches();

/* scripts, styles and manifests: network‑first with timeout */
workbox.routing.registerRoute(
  ({ request }) => ['script', 'style', 'manifest'].includes(request.destination),
  new workbox.strategies.NetworkFirst({
    cacheName: 'static-assets',
    networkTimeoutSeconds: 10,
  }),
);

/* HTML documents: always fetch from network (fallback offline only) */
workbox.routing.registerRoute(
  ({ request }) => request.destination === 'document',
  new workbox.strategies.NetworkOnly(),
);

/* images incl. loading.svg (unchanged) */
workbox.routing.registerRoute(
  ({ request }) => request.destination === 'image',
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: 'images',
    plugins: [new workbox.expiration.ExpirationPlugin({
      maxEntries: 200,
      maxAgeSeconds: 60 * 60 * 24 * 30,
    })],
  }),
);

/* TZKT JSON (5‑min SWR) */
workbox.routing.registerRoute(
  ({ url }) => url.hostname.endsWith('tzkt.io'),
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: 'tzkt-json',
    plugins: [new workbox.expiration.ExpirationPlugin({
      maxEntries: 60,
      maxAgeSeconds: 300,
    })],
  }),
);
