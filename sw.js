// Family Threat Picture service worker.
// App shell: cache-first. data.json, feeds.json, places.json, evac.json: network-first with the last saved copy offline.
// tiles/metro.pmtiles is never cached here; the Map tab's "Save metro map" button stores it in its own cache (ftp-offline-map).
// Alerts: periodic background check (Chrome/Android installed app) + notification clicks. Rules in notify-rules.js.
importScripts("notify-rules.js");
var SHELL = "ftp-shell-v18";
var DATA = "ftp-data";
var KEEP = [SHELL, DATA, "ftp-notify", "ftp-offline-map"];
var ASSETS = ["./", "index.html", "app.css", "loc.js", "app.js", "campl.js", "live.js", "prep.js", "map.js", "extras.js", "map-extras.js", "notify-rules.js", "severe.js", "prep2.js", "vault.js",
  "vendor/hls.min.js", "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css", "vendor/protomaps/protomaps-leaflet.js", "vendor/pmtiles/pmtiles.js", "vendor/markercluster/leaflet.markercluster.js", "vendor/markercluster/MarkerCluster.css", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png", "icons/favicon-32.png"];
var DATA_FILES = ["data.json", "feeds.json", "places.json", "evac.json", "cams-all.json"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return KEEP.indexOf(k) < 0; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf("/tiles/") >= 0) return;          // offline map archive: handled by the page
  var name = url.pathname.split("/").pop(), dataFile = DATA_FILES.indexOf(name) >= 0 ? name : null;
  if (dataFile) {
    e.respondWith(fetch(req).then(function (res) {
      var copy = res.clone();
      if (res.ok) caches.open(DATA).then(function (c) { c.put(dataFile, copy); });
      return res;
    }).catch(function () {
      // offline: hand back the saved copy, flagged so the page can say "showing saved copy" instead of "updated"
      return caches.open(DATA).then(function (c) { return c.match(dataFile); }).then(function (r) {
        if (!r) return Response.error();
        var h = new Headers(r.headers); h.set("X-FTP-Saved", "1");
        return r.blob().then(function (body) { return new Response(body, { status: r.status, statusText: r.statusText, headers: h }); });
      });
    }));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(req).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(SHELL).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () { return req.mode === "navigate" ? caches.match("index.html") : Response.error(); });
  }));
});

// ---- alerts ----
function base() { return self.registration.scope; }
function enabled() { return caches.open("ftp-notify").then(function (c) { return c.match("/__ftp_notify_on"); }).then(function (r) { return !!r; }); }
function runCheck() {
  return enabled().then(function (on) {
    if (!on || Notification.permission !== "granted") return;
    return self.FTPNotify.fresh(fetch.bind(self), base()).then(function (r) {
      return Promise.all(r.fresh.slice(0, 5).map(function (it) {
        return self.registration.showNotification(it.title, { body: it.body, tag: it.tag, icon: "icons/icon-192.png", badge: "icons/favicon-32.png",
          data: { url: it.url }, requireInteraction: it.level === "Severe" });
      }));
    });
  });
}
self.addEventListener("periodicsync", function (e) { if (e.tag === "ftp-check") e.waitUntil(runCheck()); });
self.addEventListener("message", function (e) { if (e.data === "ftp-check") e.waitUntil(runCheck()); });
self.addEventListener("push", function (e) {  // reserved: no push server today (ntfy delivers background pushes)
  var d = {}; try { d = e.data.json(); } catch (x) {}
  e.waitUntil(self.registration.showNotification(d.title || "Family Threat Picture", { body: d.body || "", icon: "icons/icon-192.png", data: { url: d.url || base() } }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var u = (e.notification.data && e.notification.data.url) || base();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) if (cs[i].url.indexOf(base()) === 0) { cs[i].focus(); return cs[i].navigate ? cs[i].navigate(u) : null; }
    return self.clients.openWindow(u);
  }));
});
