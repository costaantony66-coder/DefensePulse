// Service worker — coquille de l'application en cache pour un démarrage
// instantané et un mode hors-ligne dégradé.
//
// Stratégies :
//  - data/latest.json (les dépêches) : réseau d'abord, cache en secours.
//    C'est le fichier généré par la GitHub Action ; on veut toujours la
//    version la plus fraîche quand une connexion est disponible.
//  - Coquille applicative (HTML/manifest) : cache d'abord, réseau en secours.

const CACHE_VERSION = 'v2';
const CACHE_NAME = `defense-pulse-${CACHE_VERSION}`;
const APP_SHELL = ['./index.html', './manifest.json', './data/latest.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Le fichier de données : toujours tenter le réseau en premier pour avoir
  // les dernières dépêches publiées par la GitHub Action, avec le cache
  // comme filet de sécurité hors-ligne.
  if (url.pathname.endsWith('/data/latest.json')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Coquille applicative : cache d'abord pour un chargement instantané.
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
