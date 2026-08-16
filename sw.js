
var CACHE_NAME = 'didar2026-v2';
var urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

// Install - cache basic files
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) { return caches.delete(name); })
      );
    })
  );
  self.clients.claim();
});

// Fetch - IMPORTANT: Let API calls pass through without caching
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // DO NOT intercept Google Apps Script API calls
  if (url.indexOf('script.google.com') !== -1) {
    return;
  }

  // DO NOT intercept Google Drive calls
  if (url.indexOf('drive.google.com') !== -1) {
    return;
  }

  // DO NOT intercept POST requests
  if (event.request.method !== 'GET') {
    return;
  }

  // For everything else, try cache first, then network
  event.respondWith(
    caches.match(event.request).then(function(response) {
      return response || fetch(event.request);
    })
  );
});

