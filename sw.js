/* Empire FC service worker.
   Two rules, and the reason for each:

   1. The HTML document is NETWORK FIRST. The whole game is one index.html that changes
      on nearly every deploy, so a cache-first document would pin players to whatever
      build they first loaded and no amount of refreshing would move them. Network first
      means an online player always gets the newest build and an offline player still
      gets the last one that reached them.

   2. Everything else (icons, manifest, fonts) is CACHE FIRST. Those files effectively
      never change, and serving them from disk is what makes a cold launch feel instant.

   The service worker never touches localStorage, so saves are unaffected either way.
   Bump CACHE on a deploy that changes any of the icons or the manifest. */
const CACHE = "empirefc2-v1";
const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png"
];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  // addAll fails the whole install if any one file 404s, so tolerate misses
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Anything third party that is not a font is left entirely alone. The analytics
  // beacon in particular must never be served from cache or it would report a stale
  // page view, and must never be blocked by a service worker bug.
  const sameOrigin = url.origin === self.location.origin;
  const isFont = FONT_HOSTS.includes(url.hostname);
  if (!sameOrigin && !isFont) return;

  const isDoc = req.mode === "navigate" ||
                url.pathname === "/" ||
                url.pathname.endsWith(".html");

  if (isDoc) {
    e.respondWith(
      fetch(req)
        .then(r => {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          return r;
        })
        .catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r && (r.ok || r.type === "opaque")) {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return r;
    }))
  );
});
