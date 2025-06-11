//File: ghostnet/public/sw.js
/* r264 – Invariant I09 compliance (Workbox 7) + stable init
   • Upgraded CDN script to v7.0.0
   • workbox.setConfig placed first (fixes “config must be set”)
   • Spinner svg now cached instantly via image route                                   */

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

/* static assets (js/css/html/json/manifest) */
workbox.routing.registerRoute(
  ({ request }) => ['script', 'style', 'document', 'manifest'].includes(request.destination),
  new workbox.strategies.StaleWhileRevalidate({ cacheName: 'static-assets' }),
);

/* images incl. loading.svg */
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

/* TZKT JSON (5-min SWR) */
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
