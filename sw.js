/* Service worker: l'app si installa sulla schermata Home e si apre anche senza rete.
   - file dell'app: rete prima, copia in cache come riserva (aggiornamenti subito visibili)
   - librerie, font, icone e lettore OCR: cache prima (non cambiano; il lettore si salva al primo uso)
   - /api/*: mai in cache (i dati restano solo sul server) */
const VERSION = "ga-v7";
const SHELL = ["./", "index.html", "manifest.webmanifest", "fonts/fonts.css", "css/app.css", "css/themes.css", "js/engine.js", "js/config.js", "js/runtime-config.js", "js/i18n.js", "js/icons.js",
  "js/storage.js", "js/settings.js", "js/scan-parse.js", "js/scan.js", "js/accounting.js", "js/events.js", "js/app.js", "vendor/xlsx.full.min.js", "vendor/chart.umd.min.js", "assets/logo.svg", "icons/icon-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const r = e.request; if (r.method !== "GET") return;
  const u = new URL(r.url); if (u.origin !== location.origin || u.pathname.includes("/api/")) return;
  if (/\/(vendor|fonts|icons)\//.test(u.pathname)) {
    e.respondWith(caches.match(r).then((hit) => hit || fetch(r).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(VERSION).then((c) => c.put(r, cp)); } return res; })));
    return;
  }
  e.respondWith(fetch(r).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(VERSION).then((c) => c.put(r, cp)); } return res; })
    .catch(() => caches.match(r).then((hit) => hit || (r.mode === "navigate" ? caches.match("index.html") : Response.error()))));
});
