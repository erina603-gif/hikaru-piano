// 同じ github.io ドメインの別アプリや別リポジトリのキャッシュを触らない。
const CACHE_PREFIX = `hikaru-piano:${self.registration.scope}:`;
// 公開ファイルを更新するときは、このバージョンも増やす。
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const APP_FILES = [
  "./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest",
  "./piano-star.svg", "./apple-touch-icon.png", "./piano-192.png", "./piano-512.png"
];
const APP_URLS = new Set(APP_FILES.map((file) => new URL(file, self.registration.scope).href));

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll([...APP_URLS]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  url.search = "";
  url.hash = "";
  // このゲームの既知の静的ファイルだけを扱う。外部通信や他のパスは介入しない。
  if (!APP_URLS.has(url.href)) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(url.href);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(url.href, response.clone());
      return response;
    })
  );
});
