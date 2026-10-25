/**
 * StudySynth - Offline Service Worker (v37)
 * Caches the complete local workspace so the installed app opens and works
 * without a network. All paths are scope-relative for sub-path hosting.
 */

// The bundled study-set bodies are listed in a generated manifest so this
// hand-written worker never has to be edited when content changes.
try {
  importScripts('./ctet_manifest.js');
} catch (err) { /* no bundled content in this build */ }

const CACHE_NAME = 'studysynth-v37';
// Bump this whenever any runtime asset or bundled study-set body changes:
// the worker is cache-first, so a stale name would keep serving old files.
const BUNDLED_BODIES = (self.CTET_BUNDLED_BODIES || []);
const CORE_ASSETS = [
  './',
  './?mode=standalone',
  './index.html',
  './styles.css',
  './app.js',
  './sample_data.js',
  './ctet_index.js',
  './engine/generator.js',
  './engine/reasoning/types.js',
  './engine/reasoning/linguistics.js',
  './engine/reasoning/representation.js',
  './engine/reasoning/graph.js',
  './engine/reasoning/distractors.js',
  './engine/reasoning/operators.js',
  './engine/reasoning/constructors.js',
  './engine/reasoning/validator.js',
  './engine/reasoning/ranking.js',
  './engine/reasoning/engine_v2.js',
  './engine/analyze.js',
  './engine/pdfParser.js',
  './engine/ocr.js',
  './engine/storage.js',
  './engine/revision.js',
  './engine/jobs.js',
  './engine/worker.js',
  './manifest.webmanifest',
  './assets/logo.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/favicon.png',
  './assets/apple-touch-icon.png',
  './assets/material/material-symbols-rounded-subset.woff2',
  './vendor/tesseract/tesseract.min.js',
  './vendor/tesseract/worker.min.js',
  './vendor/tesseract/tesseract-core-simd-lstm.wasm.js',
  './vendor/tesseract/tesseract-core-simd-lstm.wasm',
  './vendor/tesseract/eng.traineddata',
  './vendor/pdfjs/pdf.mjs',
  './vendor/pdfjs/pdf.worker.mjs'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache independently so one optional asset cannot abort installation.
      await Promise.allSettled(
        CORE_ASSETS.concat(BUNDLED_BODIES).map((asset) => cache.add(new Request(asset, { cache: 'reload' })))
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : null)))
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

  // Navigation: always serve the app shell. The app is a single page and
  // must open instantly even when the device is in airplane mode.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(request, { ignoreSearch: true })
        .then((cached) => cached || caches.match('./index.html') || caches.match('./'))
        .then((response) => response || fetch(request).catch(() => caches.match('./index.html')))
    );
    return;
  }

  // Static assets: cache-first for instant, zero-network startup.
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((networkResponse) => {
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(request, clone))
            .catch(() => { /* quota or private mode */ });
        }
        return networkResponse;
      }).catch(() => {
        if (request.destination === 'image') return caches.match('./assets/logo.png');
        if (/\.json(\?|$)/.test(url.pathname)) {
          return caches.match(request, { ignoreSearch: true }).then((hit) => hit || Response.error());
        }
        if (request.destination === 'script' || request.destination === 'style') {
          return caches.match(request, { ignoreSearch: true }).then((hit) => hit || Response.error());
        }
        return caches.match('./index.html').then((hit) => hit || Response.error());
      });
    })
  );
});
