// Cache only the public offline notice and its icons. Account pages, RSC and APIs stay on the network.
const CACHE_PREFIX = "arch-public-offline-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const PUBLIC_ASSETS = ["/offline.html", "/pwa/icon-192.png", "/pwa/icon-512.png", "/pwa/apple-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(PUBLIC_ASSETS.map((path) => new Request(path, { credentials: "omit", cache: "reload" })));
      await self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match("/offline.html")) ?? Response.error();
      }),
    );
    return;
  }

  if (PUBLIC_ASSETS.includes(url.pathname) && !url.search) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(request)) ?? fetch(request);
      })(),
    );
  }
});

self.addEventListener("push", (event) => {
  let data;
  try { data = event.data?.json(); } catch { return; }
  if (!data || typeof data.body !== "string") return;
  event.waitUntil(self.registration.showNotification("arch-campus", {
    body: data.body,
    icon: "/pwa/icon-192.png",
    badge: "/pwa/icon-192.png",
    tag: typeof data.tag === "string" ? data.tag : "arch-reminder",
    data: { url: "/dashboard/calendar" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL("/dashboard/calendar", self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(url);
      await existing.focus();
    } else {
      await self.clients.openWindow(url);
    }
  })());
});
