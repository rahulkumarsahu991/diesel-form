// Shared page-cache logic (imported by sw-forms.js and firebase-messaging-sw.js).
// Pages + logo are fetched from the network, but if the network hasn't answered
// within 2.5s (weak signal) the last good copy is served from cache so the form
// still opens at once. A fresh copy is always saved for the next visit.
var PAGE_CACHE = 'diesel-pages-v1';
var PAGE_SHELL = ['/calling-form.html', '/office-form.html', '/manager-approval.html',
                  '/diesel-dispense.html', '/index.html', '/logo.png'];

self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(caches.open(PAGE_CACHE).then(function(cache) {
    return Promise.all(PAGE_SHELL.map(function(u) { return cache.add(u).catch(function() {}); }));
  }));
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k.indexOf('diesel-pages-') === 0 && k !== PAGE_CACHE; })
        .map(function(k) { return caches.delete(k); }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!(req.mode === 'navigate' || /\.(html|png)$/i.test(url.pathname))) return;
  event.respondWith(networkThenCache_(req));
});

function networkThenCache_(req) {
  return caches.open(PAGE_CACHE).then(function(cache) {
    return new Promise(function(resolve) {
      var settled = false;
      function done(res) { if (!settled) { settled = true; resolve(res); } }
      var timer = setTimeout(function() {
        cache.match(req, { ignoreSearch: true }).then(function(hit) { if (hit) done(hit); });
      }, 2500);
      fetch(req).then(function(res) {
        clearTimeout(timer);
        if (res && res.ok) cache.put(req, res.clone());
        done(res);
      }).catch(function() {
        clearTimeout(timer);
        cache.match(req, { ignoreSearch: true }).then(function(hit) { done(hit || Response.error()); });
      });
    });
  });
}
