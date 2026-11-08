'use strict';
// Service worker de Arca: solo para poder instalarla como app y que la interfaz
// abra rápido. Los archivos y la API (/api/...) van siempre en directo al
// servidor y nunca se guardan en el dispositivo.
const CACHE = 'arca-v18';
const INTERFAZ = ['/', '/index.html', '/styles.css', '/tema.js', '/app.js', '/visor.js', '/manifest.webmanifest', '/iconos/icono.svg?v=4', '/iconos/icono-192.png?v=4'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(INTERFAZ)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); }
    return r;
  }).catch(async () => (await caches.match(e.request, { ignoreSearch: true })) || (e.request.mode === 'navigate' ? caches.match('/') : Response.error())));
});
