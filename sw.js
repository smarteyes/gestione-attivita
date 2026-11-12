/* Service worker: PWA offline + aggiornamenti (iOS Home Screen incluso).
   - HTML/JS/CSS/manifest: rete prima (cache: no-store), cache come riserva offline
   - vendor/fonts/icons: cache prima
   - /api/*: mai in cache
   Cambiare VERSION forza nuova installazione e cancella le cache vecchie. */
const VERSION = "ga-v19";
const SHELL = ["./", "index.html", "manifest.webmanifest", "fonts/fonts.css",
  "css/app.css", "css/themes.css",
  "js/engine.js", "js/config.js", "js/runtime-config.js", "js/i18n.js", "js/icons.js",
  "js/storage.js", "js/settings.js", "js/scan-parse.js", "js/scan.js", "js/accounting.js", "js/invoices.js", "js/bank-import-parse.js", "js/bank-import.js", "js/events.js", "js/app.js",
  "vendor/xlsx.full.min.js", "vendor/chart.umd.min.js", "assets/logo.svg", "icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Chiave cache senza ?v=… così index.html?v=8 e la precache coincidono. */
function canonReq(req) {
  const u = new URL(req.url);
  u.search = "";
  u.hash = "";
  return new Request(u.href, { method: "GET" });
}

function matchCache(req) {
  const c = canonReq(req);
  return caches.match(req).then((hit) => hit || caches.match(c));
}

function putCache(req, res) {
  const cp = res.clone();
  return caches.open(VERSION).then((cache) => cache.put(canonReq(req), cp));
}

self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin !== location.origin || u.pathname.includes("/api/")) return;
  // sw.js lo gestisce il browser (updateViaCache: none); non interferire
  if (u.pathname.endsWith("/sw.js") || /(^|\/)sw\.js$/.test(u.pathname)) return;

  if (/\/(vendor|fonts|icons)\//.test(u.pathname)) {
    e.respondWith(matchCache(r).then((hit) => hit || fetch(r).then((res) => {
      if (res && res.ok) putCache(r, res);
      return res;
    })));
    return;
  }

  // Rete prima, senza riusare la HTTP cache del browser (fondamentale su iOS standalone)
  e.respondWith(
    fetch(r.url, { cache: "no-store", credentials: "same-origin" }).then((res) => {
      if (res && res.ok) putCache(r, res);
      return res;
    }).catch(() => matchCache(r).then((hit) => hit || (r.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});
