const CACHE = "mdnotes-v2";

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.addAll([
        "./",
        "./index.html",
        "./styles.css",
        "./app.js",
        "./manifest.json",
        "https://uicdn.toast.com/editor/latest/toastui-editor.min.css",
        "https://uicdn.toast.com/editor/latest/toastui-editor-all.min.js"
      ])
    )
  );
  self.skipWaiting();
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});