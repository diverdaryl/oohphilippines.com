// OOH Verify service worker — makes the Ad Verifier installable + usable offline.
// Strategy: network-first for the page (so updates always show when online, cache as fallback
// offline); cache-first for static assets (libs, icons). NEVER intercept uploads/API (POST or
// Supabase functions/rest/storage) — those must always hit the network.
const CACHE = 'oohverify-v2';
const ASSETS = [
  'ad-verifier.html',
  'manifest.webmanifest',
  'field-capture.html',
  'field-manifest.webmanifest',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // never touch uploads (POST, etc.)
  const url = new URL(req.url);
  if (/\/functions\/v1\/|\/rest\/v1\/|\/storage\/v1\//.test(url.pathname)) return; // never cache Supabase API/storage

  const isDoc = req.mode === 'navigate' || req.destination === 'document';
  if (isDoc) {
    // Network-first: always get the freshest page when online; fall back to cache offline.
    e.respondWith(
      fetch(req).then((res) => { const c = res.clone(); caches.open(CACHE).then((ca) => ca.put(req, c)); return res; })
        .catch(() => caches.match(req).then((m) => m || caches.match('ad-verifier.html')))
    );
  } else {
    // Cache-first for static assets (libraries, icons).
    e.respondWith(
      caches.match(req).then((m) => m || fetch(req).then((res) => {
        if (res && res.status === 200) { const c = res.clone(); caches.open(CACHE).then((ca) => ca.put(req, c)); }
        return res;
      }).catch(() => m))
    );
  }
});
