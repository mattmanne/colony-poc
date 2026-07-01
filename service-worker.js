const CACHE_NAME = 'colony-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/base.css',
  './css/map.css',
  './css/ui.css',
  './css/battle.css',
  './js/main.js',
  './js/state.js',
  './js/mapgen.js',
  './js/hexgrid.js',
  './js/rng.js',
  './js/colony.js',
  './js/trails.js',
  './js/resources.js',
  './js/ai.js',
  './js/battle.js',
  './js/cycle.js',
  './js/milestones.js',
  './js/save.js',
  './js/render.js',
  './js/render_battle.js',
  './js/input.js',
  './js/constants.js',
  './assets/icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});
