const CACHE = "coding-cpp-shell-v4";
const CORE = ["/", "/index.html", "/app.css?v=4", "/app.js?v=4", "/manifest.json"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("coding-cpp-shell-") && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put("/index.html", copy));
      return response;
    }).catch(async () => (await caches.open(CACHE)).match("/index.html")));
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && ["/app.css", "/app.js", "/manifest.json"].includes(url.pathname)) {
      cache.put(request, response.clone());
    }
    return response;
  })());
});
