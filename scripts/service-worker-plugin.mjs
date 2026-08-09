/**
 * Emit the service worker, with the build's own asset list baked in.
 *
 * Workbox would do this, and vite-plugin-pwa would wire Workbox up — but the
 * app is a static shell with hashed filenames and no runtime data, which is the
 * one case where precaching is a list and a fetch handler. Both dependencies
 * would ship their own runtime into a bundle that currently has none, and both
 * would need the licence audit every dependency here gets.
 *
 * The build knows the asset names; this plugin asks the bundle for them and
 * writes them into the worker. Nothing is guessed and nothing is globbed at
 * runtime.
 */

/** Precached beyond the bundle's own output. Paths are relative to the base. */
const EXTRA_ASSETS = [
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
];

function serviceWorkerSource(cacheName, assets) {
  return `/*
 * Floored service worker — generated at build time. Do not edit by hand.
 *
 * Precaches the shell so the app opens with no network at all, which is the
 * promise the README makes and the one a planner standing in a venue basement
 * actually needs.
 */

const CACHE = ${JSON.stringify(cacheName)};
const ASSETS = ${JSON.stringify(assets, null, 2)};

self.addEventListener('install', (event) => {
  // No skipWaiting: a silent reload mid-edit is data loss. The page prompts,
  // and the user decides when to take the new version.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // A navigation always resolves to the shell: the app is one page, and its
  // routes are state rather than paths.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches
        .match(${JSON.stringify(assets[0])}, { ignoreVary: true })
        .then((cached) => cached ?? fetch(request))
    );
    return;
  }

  // Everything else is hashed and immutable, so a hit is always correct.
  event.respondWith(
    // ignoreVary: the module scripts are requested with \`crossorigin\`, so they
    // carry an Origin header the precache fetch did not, and a host that sends
    // \`Vary: Origin\` makes every one of those a cache miss — the app then
    // renders a blank page offline while the cache sits there full.
    caches.match(request, { ignoreVary: true }).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (!response.ok || response.type !== 'basic') return response;
        const copy = response.clone();
        void caches.open(CACHE).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});
`;
}

/**
 * @param {{ version?: string }} options
 * @returns {import('vite').Plugin}
 */
export function serviceWorker(options = {}) {
  return {
    name: 'floored-service-worker',
    apply: 'build',

    generateBundle(_outputOptions, bundle) {
      const emitted = Object.keys(bundle)
        // Source maps are large and never needed offline.
        .filter((name) => !name.endsWith('.map'))
        .map((name) => `./${name}`);

      // The shell is cached as the directory URL, not as `index.html`.
      // A static host redirects `/index.html` to `/`, and `cache.addAll`
      // rejects a redirected response outright — which failed the install,
      // left no cache at all, and produced a blank page offline while every
      // other signal said the worker was running.
      const assets = [
        './',
        ...emitted.filter((name) => name !== './index.html'),
        ...EXTRA_ASSETS.map((name) => `./${name}`),
      ];

      // The cache name carries the asset hashes, so any change to the build
      // produces a new cache and the old one is dropped on activate.
      const version =
        options.version ??
        assets
          .join('|')
          .split('')
          .reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 0xffffffff, 7)
          .toString(36);

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: serviceWorkerSource(`floored-${version}`, assets),
      });
    },
  };
}
