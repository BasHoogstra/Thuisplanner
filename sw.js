// Service worker van Huisplan.
// Network-first: met internet altijd de nieuwste versie van de app (zodat niemand op een
// oude versie blijft hangen); zonder internet de laatst geladen versie uit de cache.
// Verzoeken naar andere domeinen (Firebase, weer, kaarten) worden niet aangeraakt, en
// plannerdata (.json) wordt nooit gecachet: die staat al in de lokale cache van de app zelf.
const CACHE = 'huisplan-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.endsWith('.json')) return;
  // De app-pagina wordt opgeslagen zonder ?db=…&p=… zodat de toegangscode niet in de cache staat.
  const key = req.mode === 'navigate' ? url.origin + url.pathname : req;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(key, copy));
        }
        return res;
      })
      .catch(() => caches.match(key).then((hit) => hit || caches.match(req, { ignoreSearch: true })))
  );
});
