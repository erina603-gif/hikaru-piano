// 同じ github.io ドメインの別アプリや別リポジトリのキャッシュを触らない。
const CACHE_PREFIX = `hikaru-piano:${self.registration.scope}:`;
// 公開ファイルを更新するときは、このバージョンも増やす。
const BUILD = "3.2-audio1";
const CACHE_NAME = `${CACHE_PREFIX}rhythm-${BUILD}`;
const APP_FILES = [
  "./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest",
  "./piano-star.svg", "./apple-touch-icon.png", "./piano-192.png", "./piano-512.png",
  "./rhythm.js", "./songs.js", "./audio.js"
];
const APP_URLS = new Set(APP_FILES.map((file) => new URL(file, self.registration.scope).href));
self.addEventListener("message", (event) => {
  if (event.data?.type !== "PIANO_VERSION" || !event.source?.url) return;
  const url = new URL(event.source.url); url.search = ""; url.hash = "";
  if (url.href === self.registration.scope || url.href === new URL("index.html", self.registration.scope).href) event.source.postMessage({ type: "PIANO_VERSION", version: BUILD });
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll([...APP_URLS].map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(async () => {
        // 初期版の共通キャッシュはこの公開パスの項目だけ除去。他アプリは保持。
        if ((await caches.keys()).includes("hikaru-piano-v1")) {
          const legacy = await caches.open("hikaru-piano-v1");
          const ownedUrls = new Set([...APP_URLS, new URL("icons/piano-star.svg", self.registration.scope).href]);
          for (const request of await legacy.keys()) {
            const url = new URL(request.url); url.search = ""; url.hash = "";
            if (ownedUrls.has(url.href)) await legacy.delete(request);
          }
          if ((await legacy.keys()).length === 0) await caches.delete("hikaru-piano-v1");
        }
        await self.clients.claim();
        // 旧app.jsにはcontrollerchange処理がないので、このゲームの旧画面だけ再読込。
        for (const client of await self.clients.matchAll({ type: "window" })) {
          const url = new URL(client.url); url.search = ""; url.hash = "";
          // navigateの完了をactivateのwaitUntilで待つと、次のfetchがactivate完了を待ち続ける。
          if (url.href === self.registration.scope || url.href === new URL("index.html", self.registration.scope).href) void client.navigate(client.url).catch(() => {});
        }
      })
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
