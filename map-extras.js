/* Map tab extras: animated NEXRAD radar (IEM), routes out of the metro (Census TIGER interstates), hospitals /
   cooling sites / open shelters, statewide MoDOT + IDOT traffic cameras (clustered), and an offline metro basemap (Protomaps extract of OSM, saved only when the user taps). */
(function () {
  "use strict";
  var api = null, M = null;
  var $ = function (id) { return document.getElementById(id); };
  var OFFLINE_URL = "tiles/metro.pmtiles", OFFLINE_CACHE = "ftp-offline-map", OFFLINE_MB = 7.1;
  var ATTR_RADAR = 'Radar: <a href="https://mesonet.agron.iastate.edu/ogc/" target="_blank" rel="noopener">IEM</a> / NWS NEXRAD';

  // ---- radar: RainViewer past frames (free, global, CORS; native tiles to zoom 7, scaled beyond). IEM NEXRAD fallback. ----
  var frames = [], times = [], fi = 0, playing = true, rt = null, rctl = null, built = false;
  var ATTR_RV = 'Radar: <a href="https://www.rainviewer.com/api.html" target="_blank" rel="noopener">RainViewer</a>';
  function radarInit() {
    rctl = L.control({ position: "topleft" });
    rctl.onAdd = function () {
      var d = L.DomUtil.create("div", "radar-ctl"); L.DomEvent.disableClickPropagation(d);
      d.innerHTML = '<button type="button" id="radar-play" aria-label="Pause or play radar">⏸</button><span id="radar-time">Radar…</span>'; return d;
    };
    sync();
  }
  function build() {
    if (built) return Promise.resolve(); built = true;
    var g = api.group("radar");
    function add(url, t, attr, maxN) { frames.push(L.tileLayer(url, { opacity: 0, maxNativeZoom: maxN, maxZoom: 16, zIndex: 300 + frames.length, attribution: attr, className: "radar-frame" }).addTo(g)); times.push(t); }
    return fetch("https://api.rainviewer.com/public/weather-maps.json").then(function (r) { return r.json(); }).then(function (d) {
      var past = (d.radar && d.radar.past || []).slice(-12);
      if (!past.length) throw new Error("no frames");
      past.forEach(function (f, i) { add(d.host + f.path + "/256/{z}/{x}/{y}/4/1_1.png", f.time * 1000, i === past.length - 1 ? ATTR_RV : "", 7); });
    }).catch(function () {
      ["m50m", "m40m", "m30m", "m20m", "m10m", ""].forEach(function (n, i, arr) {
        add("https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913" + (n ? "-" + n : "") + "/{z}/{x}/{y}.png", Date.now() - (n ? +n.slice(1, 3) : 0) * 60e3,
          i === arr.length - 1 ? 'Radar: <a href="https://mesonet.agron.iastate.edu/" target="_blank" rel="noopener">IEM</a> / NWS NEXRAD' : "", 9);
      });
    }).then(function () { fi = frames.length - 1; });
  }
  function show(i) {
    frames.forEach(function (f, k) { f.setOpacity(k === i ? 0.75 : 0); });
    var t = $("radar-time"); if (t && times[i]) t.textContent = "Radar " + new Date(times[i]).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }) + " CT" + (i === frames.length - 1 ? " (latest)" : "");
  }
  function step() { fi = (fi + 1) % frames.length; show(fi); clearTimeout(rt); rt = setTimeout(step, fi === frames.length - 1 ? 1800 : 600); }
  function sync() {
    var on = M.hasLayer(api.group("radar"));
    clearTimeout(rt);
    if (on) {
      rctl.addTo(M);
      // location switcher: center the radar on the chosen place (regional zoom; RainViewer tiles are native to z7)
      if (window.FTPLoc && !FTPLoc.isHome() && !L.latLngBounds(window.ftpLocalBounds()).pad(2).contains(M.getCenter())) M.setView([FTPLoc.get().lat, FTPLoc.get().lon], 7);
      build().then(function () {
        if (!M.hasLayer(api.group("radar")) || !frames.length) return;
        show(fi); if (playing) rt = setTimeout(step, 600);
        var b = $("radar-play"); if (b) b.textContent = playing ? "⏸" : "▶";
      });
    } else if (rctl._map) rctl.remove();
  }

  // ---- routes out ----
  function evacInit() {
    fetch("evac.json").then(function (r) { return r.json(); }).then(function (ev) {
      var g = api.group("evac");
      ev.forEach(function (r) {
        var pop = '<div class="tm-pop"><b>' + api.esc(r.name) + '</b><p>Major interstate out of the metro. These are not official evacuation routes: follow local officials, IEMA (Illinois) or SEMA (Missouri) orders, and expect contraflow or closures. Pick at least two directions in your plan; rally points stay in Prep (this device only).</p>' +
          '<div class="tm-links"><a href="https://www.gettingaroundillinois.com/" target="_blank" rel="noopener">IL road conditions ↗</a><a href="https://traveler.modot.org/map/" target="_blank" rel="noopener">MO road conditions ↗</a></div></div>';
        L.polyline(r.lines.map(function (l) { return l.map(function (p) { return [p[1], p[0]]; }); }), { color: r.color, weight: 4, opacity: 0.85 }).bindPopup(pop).bindTooltip(r.name, { sticky: true }).addTo(g);
        if (api.mini) L.polyline(r.lines.map(function (l) { return l.map(function (p) { return [p[1], p[0]]; }); }), { color: r.color, weight: 2, opacity: 0.8, interactive: false }).addTo(api.mini);
      });
    }).catch(function () {});
  }

  // ---- hospitals / cooling / shelters ----
  var marks = { hospitals: {}, cooling: {}, shelters: {} };
  function facilityInit() {
    var gp = window.ftpGetPlaces ? window.ftpGetPlaces() : fetch("places.json").then(function (r) { return r.json(); });
    var gf = window.ftpGetFeeds ? window.ftpGetFeeds() : fetch("feeds.json").then(function (r) { return r.json(); });
    Promise.all([gp, gf]).then(function (r) {
      var pl = r[0] || {}, f = r[1] || {};
      function add(kind, glyph, color, x, body) {
        if (x.lat == null) return;
        var m = L.marker([x.lat, x.lng], { icon: api.icon(glyph, color, null, null, true), title: x.name }).bindPopup('<div class="tm-pop"><b>' + api.esc(x.name) + "</b>" + body +
          '<div class="tm-links"><a href="https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(x.address || x.lat + "," + x.lng) + '" target="_blank" rel="noopener">Directions ↗</a>' + (x.phone ? '<a href="tel:' + api.esc(String(x.phone).replace(/[^0-9+]/g, "")) + '">Call</a>' : "") + "</div></div>");
        m.addTo(api.group(kind)); marks[kind][x.lat + "," + x.lng] = m;
      }
      hospAdd = function (x) { add("hospitals", "🏥", "#e04848", x, "<div>" + api.esc(x.address) + "</div><div>" + api.esc(x.type) + (x.trauma ? " · Trauma " + api.esc(x.trauma) : "") + '</div><p class="d">Listed ' + api.esc(x.status) + " (federal HIFLD hospital list); ER wait and status are not live. Emergencies: call 911.</p>"); };
      homeHosp = (pl.hospitals || {}).items || []; hospSrc = pl.hospitals || {};
      rebuildHosp();
      ((pl.cooling || {}).items || []).forEach(function (x) { add("cooling", "🧊", "#4f8fd6", x, "<div>" + api.esc(x.address) + "</div>" + (x.hours ? '<div class="d">' + api.esc(x.hours) + "</div>" : "") + '<p class="d">Activated during NWS Extreme Heat Warnings. Call 2-1-1 to confirm.</p>'); });
      (((f.shelters || {}).items) || []).forEach(function (s) { add("shelters", "⛺", "#3fb27f", { name: s.shelter_name, address: [s.address, s.city, s.state].filter(Boolean).join(", "), lat: s.lat, lng: s.lng }, "<div>" + api.esc(s.shelter_status || "") + " · " + api.esc(s.org_name || "") + "</div>"); });
      liveShelters();
    });
  }
  // hospitals layer: the St. Louis list at home; away (location switcher) the national HIFLD list near the chosen place
  var hospAdd = null, homeHosp = [], hospSrc = {}, hospUS = null;
  function rebuildHosp() {
    if (!hospAdd) return;
    var away = window.FTPLoc && !FTPLoc.isHome();
    (away ? (hospUS ? Promise.resolve(hospUS) : fetch("hospitals-us.json").then(function (r) { return r.json(); }).then(function (d) { hospUS = d; return d; }).catch(function () { return null; })) : Promise.resolve(null)).then(function (H) {
      api.group("hospitals").clearLayers(); marks.hospitals = {};
      var l = window.FTPLoc && FTPLoc.get();
      var list = away ? (H ? H.rows.filter(function (x) { return Math.abs(x[8] - l.lat) < 1.2 && Math.abs(x[9] - l.lon) < 1.6; }).map(function (x) {
        return { name: x[0], address: x[1] + ", " + x[2] + ", " + x[3] + " " + x[4], phone: x[5], type: x[6], trauma: x[7], status: "OPEN", lat: x[8], lng: x[9] }; }) : []) : homeHosp;
      list.forEach(hospAdd);
    });
  }
  document.addEventListener("ftp-loc", function () { if (M) { rebuildHosp(); liveShelters(); } });
  function liveShelters() {   // FEMA NSS allows browser CORS: refresh open shelters live when online
    if (!navigator.onLine) return;
    fetch("https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/FeatureServer/0/query?where=1%3D1&outFields=*&f=json&outSR=4326&geometry=" + (window.FTPLoc && !FTPLoc.isHome() ? FTPLoc.bbox(1.0, 1.3).join("%2C") : "-91.2%2C38.0%2C-89.2%2C39.2") + "&geometryType=esriGeometryEnvelope&inSR=4326")
      .then(function (r) { return r.json(); }).then(function (d) {
        if (!d.features) return; var g = api.group("shelters"); g.clearLayers(); marks.shelters = {};
        d.features.forEach(function (ft) { var a = ft.attributes; var m = L.marker([ft.geometry.y, ft.geometry.x], { icon: api.icon("⛺", "#3fb27f", null, null, true), title: a.shelter_name })
          .bindPopup('<div class="tm-pop"><b>' + api.esc(a.shelter_name) + "</b><div>" + api.esc([a.address, a.city, a.state].filter(Boolean).join(", ")) + "</div><div>" + api.esc(a.shelter_status) + " · " + api.esc(a.org_name || "") + '</div><p class="d">Live from FEMA NSS.</p></div>').addTo(g); marks.shelters[ft.geometry.y + "," + ft.geometry.x] = m; });
      }).catch(function () {});
  }
  window.ftpMapTo = function (ll, kind) {
    if (!M) return;
    var cb = document.querySelector('[data-layer="' + kind + '"]'); if (cb && !cb.checked) cb.click();
    M.setView(ll, 14);
    var m = marks[kind] && marks[kind][ll[0] + "," + ll[1]]; if (m) setTimeout(function () { m.openPopup(); }, 350);
  };

  // ---- statewide traffic cameras (MoDOT + IDOT), clustered; loaded only when the layer is turned on ----
  var camsBuilt = false, camLive = null;
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  function loadCss(href) { var l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.appendChild(l); }
  function camIcon(st) { return L.divIcon({ className: "cam-ic " + st, iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -12], html: "<span>📹</span>" }); }
  function clusterIcon(c) {
    var n = c.getChildCount(), mo = 0; c.getAllChildMarkers().forEach(function (m) { if (m._st === "mo") mo++; });
    var cls = mo === n ? "mo" : mo === 0 ? "il" : "mix", sz = n < 10 ? 30 : n < 100 ? 36 : 42;
    return L.divIcon({ className: "cam-cl " + cls, iconSize: [sz, sz], html: "<span>" + n + "</span>" });
  }
  function camsBuild() {
    if (camsBuilt) return; camsBuilt = true;
    api.status("Loading statewide cameras…");
    loadCss("vendor/markercluster/MarkerCluster.css");
    Promise.all([L.markerClusterGroup ? Promise.resolve() : loadScript("vendor/markercluster/leaflet.markercluster.js"),
      fetch("cams-all.json").then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })]).then(function (r) {
      var d = r[1], ic = { mo: camIcon("mo"), il: camIcon("il") }, ms = [];
      var cl = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 55, disableClusteringAtZoom: 15, spiderfyOnMaxZoom: true,
        showCoverageOnHover: false, removeOutsideVisibleBounds: true, iconCreateFunction: clusterIcon });
      (d.mo || []).forEach(function (c) { var m = L.marker([c[2], c[3]], { icon: ic.mo, title: c[1] + " (MoDOT)", keyboard: false }); m._st = "mo"; m._c = c; ms.push(m); });
      (d.il || []).forEach(function (c) { var m = L.marker([c[2], c[3]], { icon: ic.il, title: c[1] + " (IDOT)", keyboard: false }); m._st = "il"; m._c = c; ms.push(m); });
      cl.on("click", function (e) { openCam(e.layer); });
      cl.addLayers(ms); cl.addTo(api.group("cams"));
      window.ftpCamCounts = { mo: (d.mo || []).length, il: (d.il || []).length, ilViews: (d.il || []).reduce(function (a, c) { return a + c[4].length; }, 0), generated: d.generated };
      api.status("Cameras: " + window.ftpCamCounts.mo + " MoDOT, " + window.ftpCamCounts.il + " IDOT (list from " + new Date(d.generated).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" }) + "). Tap one for live view.");
    }).catch(function (e) { camsBuilt = false; api.status("Camera list unavailable (" + e.message + ")."); });
  }
  function stopCam() {
    if (!camLive) return; var c = camLive; camLive = null;
    try { clearInterval(c.timer); } catch (e) {}
    try { if (c.pl) { var vv = c.pl.video; c.pl.stop(); if (vv) vv.remove(); } } catch (e) {}
    if (c.iframe) { c.iframe.src = "about:blank"; c.iframe.remove(); }
  }
  function ct2(d) { return d.toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit", second: "2-digit" }) + " CT"; }
  function openCam(m) {
    var c = m._c, esc = api.esc, mo = m._st === "mo";
    var official = mo ? "https://traveler.modot.org/map/" : c[4][0][1];
    var html = '<div class="cam-pop"><b>' + esc(c[1]) + '</b><div class="d">' + (mo ? "MoDOT live video" + (c[5] ? " · MoDOT reports this stream may be down" : "") : "IDOT camera · official Travel Midwest viewer") + "</div>" +
      (!mo && c[4].length > 1 ? '<div class="cam-dirs">' + c[4].map(function (v, i) { return '<button type="button" class="small-btn' + (i ? "" : " on") + '" data-camdir="' + i + '">' + esc(v[0] && v[0] !== "NONE" ? v[0] : "View " + (i + 1)) + "</button>"; }).join("") + "</div>" : "") +
      '<div class="cam-media' + (mo ? '' : ' il') + '"></div><div class="d cam-st"></div>' +
      '<div class="tm-links"><a class="cam-official" href="' + esc(official) + '" target="_blank" rel="noopener">Open official page ↗</a></div></div>';
    var pop = L.popup({ maxWidth: 320, minWidth: 260, autoPanPaddingTopLeft: [50, 12], autoPanPaddingBottomRight: [10, 12], className: "cam-popup" + (mo ? "" : " idot-popup") }).setLatLng(m.getLatLng());
    var box = document.createElement("div"); box.innerHTML = html; var el = box.firstChild;
    pop.setContent(el);   // a DOM node, so pop.update() keeps the live player instead of re-rendering a string
    pop.on("remove", stopCam);
    pop.openOn(M);
    var media = el.querySelector(".cam-media"), st = el.querySelector(".cam-st");
    L.DomEvent.disableClickPropagation(el);
    if (!mo) media.classList.add("il");
    if (mo) playMo(c, media, st); else frameIl(c, 0, media, st, el);
    pop.update();
    if (!mo) el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-camdir]"); if (!b) return;
      el.querySelectorAll("[data-camdir]").forEach(function (x) { x.classList.toggle("on", x === b); });
      var i = +b.getAttribute("data-camdir"); el.querySelector(".cam-official").href = c[4][i][1];
      frameIl(c, i, media, st, el);
    });
  }
  function playMo(c, media, st) {
    stopCam();
    var me = camLive = {};
    // shared player (campl.js): hls.js, bounded retries, 10 s stall watchdog -> "Stream unavailable" + official page + Retry
    me.pl = window.FTPCamPlayer.start(media, c[4], { official: "https://traveler.modot.org/map/", officialText: "Open official MoDOT map ↗",
      onStatus: function (t) { if (camLive === me) st.textContent = t; } });
  }
  function frameIl(c, i, media, st) {
    stopCam();
    var url = c[4][i][1], stale = c[4][i][2] ? " · IDOT flags this image as old" : "";
    var pl = window.FTPCamPlayer.startFrame(media, url, { title: c[1] + " (official IDOT / Travel Midwest viewer)",
      onStatus: function (text) { st.textContent = text + stale; } });
    camLive = { pl: pl, iframe: pl.iframe };

  }
  window.ftpCamDebug = function () {
    return { live: !!camLive, hls: !!(camLive && camLive.pl && camLive.pl.state().hls), player: camLive && camLive.pl ? camLive.pl.state() : null, timer: !!(camLive && (camLive.timer || camLive.iframe)),
      videos: document.querySelectorAll("#map video").length, iframes: document.querySelectorAll("#map iframe").length,
      playing: [].some.call(document.querySelectorAll("video"), function (v) { return !v.paused && !v.ended && v.readyState > 2; }) };
  };

  // ---- offline metro basemap ----
  var vec = null;
  function savedBlob() { return caches.open(OFFLINE_CACHE).then(function (c) { return c.match(OFFLINE_URL); }).then(function (r) { return r ? r.blob() : null; }).catch(function () { return null; }); }
  function vectorLayer(blob) {
    var file = new File([blob], "metro.pmtiles");
    return protomapsL.leafletLayer({ url: new pmtiles.PMTiles(new pmtiles.FileSource(file)), flavor: "dark", lang: "en", maxDataZoom: 12, maxZoom: 16,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors · <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a> (saved metro map)' });
  }
  function useSaved(on) {
    return savedBlob().then(function (b) {
      if (on && !b) return false;
      var osm = api.base();
      if (on) { if (!vec) vec = vectorLayer(b); if (M.hasLayer(osm)) M.removeLayer(osm); vec.addTo(M); vec.bringToBack(); }
      else { if (vec && M.hasLayer(vec)) M.removeLayer(vec); if (!M.hasLayer(osm)) osm.addTo(M); }
      localStorage.setItem("ftp-map-use-saved", on ? "1" : "0"); paintOffline(); return true;
    });
  }
  function paintOffline(msg) {
    var p = $("map-offline"); if (!p) return;
    savedBlob().then(function (b) {
      var using = vec && M && M.hasLayer(vec);
      p.innerHTML = '<p><b>Offline metro map</b> — St. Louis metro, zoom up to street level, about ' + OFFLINE_MB + ' MB. Saved on this device only when you tap Save; it then works with no signal. Built from OpenStreetMap data (Protomaps), not downloaded from the OSM tile servers, whose policy forbids offline prefetch.</p>' +
        '<div class="row-btns">' + (b ? '<button type="button" class="small-btn primary" id="off-use">' + (using ? "Use online map" : "Use saved map") + '</button><button type="button" class="small-btn" id="off-del">Delete saved map</button>'
          : '<button type="button" class="small-btn primary" id="off-save">Save metro map (' + OFFLINE_MB + " MB)</button>") + "</div>" +
        '<p class="d" id="off-msg">' + (msg || (b ? "Saved (" + (b.size / 1048576).toFixed(1) + " MB). " + (using ? "Showing the saved map." : "The app switches to it automatically when offline.") : "Not saved yet.")) + "</p>";
    });
  }
  function saveOffline() {
    var msg = $("off-msg"); msg.textContent = "Downloading…";
    fetch(OFFLINE_URL, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      var total = +r.headers.get("content-length") || OFFLINE_MB * 1048576, got = 0, reader = r.body.getReader(), chunks = [];
      function pump() { return reader.read().then(function (x) { if (x.done) return; chunks.push(x.value); got += x.value.length; msg.textContent = "Downloading… " + Math.round(got / total * 100) + "%"; return pump(); }); }
      return pump().then(function () { return new Blob(chunks, { type: "application/octet-stream" }); });
    }).then(function (blob) {
      return caches.open(OFFLINE_CACHE).then(function (c) { return c.put(OFFLINE_URL, new Response(blob, { headers: { "Content-Type": "application/octet-stream", "X-Saved": new Date().toISOString() } })); });
    }).then(function () { paintOffline("Saved. The map now works offline in the metro."); }).catch(function (e) { paintOffline("Download failed (" + e.message + "). Try again on Wi-Fi."); });
  }

  window.ftpMapExtras = function (a) {
    api = a; M = a.map;
    radarInit(); evacInit(); facilityInit();
    if (M.hasLayer(api.group("cams"))) camsBuild();
    var bar = document.querySelector(".map-bar"), b = document.createElement("button");
    b.type = "button"; b.className = "small-btn"; b.id = "map-offline-btn"; b.textContent = "Offline"; b.setAttribute("aria-expanded", "false");
    bar.insertBefore(b, $("map-status"));
    var rb = document.createElement("button"); rb.type = "button"; rb.className = "small-btn"; rb.id = "map-radar-btn"; rb.textContent = "Radar";
    bar.insertBefore(rb, b);
    var p = document.createElement("div"); p.id = "map-offline"; p.className = "map-layers map-offline"; p.hidden = true; $("map-layers").after(p);
    M.on("layeradd layerremove", function () { var on = M.hasLayer(api.group("radar")); rb.classList.toggle("on", on); });
    rb.classList.toggle("on", M.hasLayer(api.group("radar")));
    if (localStorage.getItem("ftp-map-use-saved") === "1" || !navigator.onLine) useSaved(true);
  };
  document.addEventListener("ftp-layer", function (e) { if (e.detail.key === "radar" && M) sync(); if (e.detail.key === "cams" && M) { if (e.detail.on) camsBuild(); else M.closePopup(); } });
  // only one stream at a time, and none in the background: leaving the Map tab or hiding the app closes the camera popup
  document.addEventListener("visibilitychange", function () { if (document.hidden && camLive && M) M.closePopup(); });
  window.addEventListener("offline", function () { if (M) useSaved(true); });
  document.addEventListener("click", function (e) {
    var t = e.target;
    var tb = t.closest("[data-tab]"); if (tb && tb.getAttribute("data-tab") !== "map" && camLive && M) M.closePopup();
    if (t.id === "radar-play") { playing = !playing; sync(); }
    if (t.id === "map-radar-btn") { var cb = document.querySelector('[data-layer="radar"]'); if (cb) cb.click(); }
    if (t.id === "map-offline-btn") { var p = $("map-offline"); p.hidden = !p.hidden; t.setAttribute("aria-expanded", String(!p.hidden)); if (!p.hidden) paintOffline(); }
    if (t.id === "off-save") saveOffline();
    if (t.id === "off-use") useSaved(!(vec && M.hasLayer(vec)));
    if (t.id === "off-del" && confirm("Delete the saved metro map from this device?")) caches.delete(OFFLINE_CACHE).then(function () { useSaved(false); vec = null; paintOffline("Deleted."); });
  });
})();
