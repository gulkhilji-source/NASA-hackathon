const CACHE = "astravitals-shell-v4";
const SHELL = ["/", "/index.html"];
const PUBLIC_API = ["/api/health", "/api/scenarios", "/api/model", "/api/metrics"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("astravitals-") && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) {
    // Only cache non-personal mission metadata. Never cache crew health or wellbeing records.
    const cacheable = PUBLIC_API.includes(url.pathname);
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request);
        if (cacheable && response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        const cached = cacheable ? await cache.match(request) : null;
        return cached || new Response(JSON.stringify({ error: "Offline; this private or uncached resource is unavailable." }), {
          status: 503, headers: { "Content-Type": "application/json" }
        });
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch {
      return (await cache.match("/index.html")) || Response.error();
    }
  })());
});
