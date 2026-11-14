/* Map tab: Leaflet (bundled), CARTO dark tiles, markers for every data.json threat plus live
   NWS alert zones, USGS quakes and FEMA declarations. Works offline with the last data (tiles may not). */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : "#"; }
  function ct(t) { var d = new Date(t); if (isNaN(d)) return t || ""; return d.toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " CT"; }

  var COLORS = { Severe: "#e04848", High: "#e8762c", Elevated: "#e0b030", Guarded: "#4f8fd6", Low: "#3fb27f" };
  var TYPES = {
    conflict: ["⚔️", "Conflict"], nuclear: ["☢️", "Nuclear"], military: ["🎖️", "Military"], terrorism: ["💣", "Terrorism"],
    cyber: ["💻", "Cyber"], disease: ["🦠", "Disease"], weather: ["❄️", "Weather"], earthquake: ["🌋", "Earthquake"],
    flood: ["🌊", "Flood/river"], power: ["⚡", "Power/grid"], economy: ["⛽", "Economy"], space: ["☀️", "Space wx"],
    crime: ["🚨", "Crime"], fire: ["🔥", "Fire"], air: ["💨", "Air"], transport: ["🚗", "Roads"], other: ["❗", "Other"]
  };
  var LIVE = { nws: ["⛈️", "NWS alerts"], usgs: ["🌋", "USGS quakes"], fema: ["🏛️", "FEMA"],
    radar: ["📡", "Radar loop"], evac: ["🛣️", "Routes out"], shelters: ["⛺", "Open shelters"], hospitals: ["🏥", "Hospitals / ER"], cooling: ["🧊", "Cooling sites"], cams: ["📷", "Traffic cameras (MoDOT blue, IDOT orange)"] };
  var DEFAULT_OFF = { radar: 1, hospitals: 1, cooling: 1, cams: 1 };
  var LOCAL_BOUNDS = [[38.25, -90.75], [38.95, -89.55]];
  var NWS_ZONE_URLS = { ILC163: "county", ILZ101: "forecast", MOC510: "county", MOZ064: "forecast", MOC189: "county", MOZ063: "forecast" };
  var STATE_CENTROID = { IL: [40.0, -89.2], MO: [38.4, -92.5] };
  // rough state centers for FEMA declaration pins when the location switcher points elsewhere (FEMA lists counties, not points)
  var STATE_C = { AL: [32.8, -86.8], AK: [64.7, -152], AZ: [34.3, -111.7], AR: [34.9, -92.4], CA: [37.2, -119.5], CO: [39.0, -105.5], CT: [41.6, -72.7], DE: [39.0, -75.5], DC: [38.9, -77.0], FL: [28.6, -82.4], GA: [32.7, -83.4],
    HI: [20.3, -156.4], ID: [44.4, -114.6], IN: [39.9, -86.3], IA: [42.1, -93.5], KS: [38.5, -98.4], KY: [37.5, -85.3], LA: [31.1, -92.0], ME: [45.4, -69.2], MD: [39.0, -76.8], MA: [42.3, -71.8], MI: [44.3, -85.4], MN: [46.3, -94.3],
    MS: [32.7, -89.7], MT: [47.0, -109.6], NE: [41.5, -99.8], NV: [39.3, -116.6], NH: [43.7, -71.6], NJ: [40.2, -74.7], NM: [34.4, -106.1], NY: [42.9, -75.5], NC: [35.6, -79.4], ND: [47.5, -100.5], OH: [40.3, -82.8], OK: [35.6, -97.5],
    OR: [43.9, -120.6], PA: [40.9, -77.8], RI: [41.7, -71.5], SC: [33.9, -80.9], SD: [44.4, -100.2], TN: [35.9, -86.4], TX: [31.5, -99.3], UT: [39.3, -111.7], VT: [44.1, -72.7], VA: [37.5, -78.9], WA: [47.4, -120.5], WV: [38.6, -80.6],
    WI: [44.6, -89.9], WY: [43.0, -107.6], PR: [18.2, -66.5] };
  Object.keys(STATE_C).forEach(function (k) { if (!STATE_CENTROID[k]) STATE_CENTROID[k] = STATE_C[k]; });
  function away() { return window.FTPLoc && !FTPLoc.isHome(); }
  var STL_LAYERS = { cams: "MO & IL only", evac: "St. Louis area only", cooling: "St. Louis area only" };
  // "Local" = the home metro, or the area around the place picked in the location switcher (no marker is drawn there)
  function localBounds() { if (!away()) return LOCAL_BOUNDS; var l = FTPLoc.get(); return [[l.lat - 0.35, l.lon - 0.5], [l.lat + 0.35, l.lon + 0.5]]; }
  function addLocZones() { var l = away() && FTPLoc.get(); if (l && l.nws) { if (l.nws.county) NWS_ZONE_URLS[l.nws.county] = "county"; if (l.nws.zone) NWS_ZONE_URLS[l.nws.zone] = "forecast"; } }
  addLocZones();

  var baseLayer = null;
  var map = null, mini = null, miniThreats = null, miniNws = null, groups = {}, hidden = load("ftp-map-hidden", {});
  function applyDefaults() { Object.keys(DEFAULT_OFF).forEach(function (k) { if (hidden[k] === undefined) hidden[k] = true; }); }
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  applyDefaults();
  function icon(glyph, color, ring, off, small) {
    off = off || [0, 0]; var h = small ? 11 : 17;
    return L.divIcon({ className: "tm-icon" + (small ? " tm-mini" : ""), iconSize: [h * 2, h * 2], iconAnchor: [h - off[0], h - off[1]], popupAnchor: [off[0], off[1] - 16],
      html: '<span style="background:' + color + ';' + (ring ? "box-shadow:0 0 0 3px " + ring + ";" : "") + '">' + glyph + "</span>" });
  }
  function group(key) {
    if (!groups[key]) { groups[key] = L.layerGroup(); if (!hidden[key]) groups[key].addTo(map); }
    return groups[key];
  }

  function init() {
    if (map) { setTimeout(function () { map.invalidateSize(); }, 50); return; }
    map = L.map("map", { worldCopyJump: true, zoomControl: true, minZoom: 0.5, maxZoom: 16, zoomSnap: 0.25, zoomDelta: 1, tap: true }).setView([30, 10], 2);
    window.ftpMap = map;
    // v14: every popup fits the map it opens on. Width and height come from the live map size, long content scrolls
    // inside the popup (Leaflet adds .leaflet-popup-scrolled), autopan keeps it clear of the zoom buttons, and the
    // local inset steps aside while a popup is open so it can't cover the text.
    map.on("popupopen", function (e) {
      var s = map.getSize(), pop = e.popup, preferredWidth = /idot-popup/.test(pop.options.className || "") ? 440 : 320;
      L.setOptions(pop, { maxWidth: Math.max(180, Math.min(preferredWidth, s.x - 110)), minWidth: Math.max(160, Math.min(preferredWidth === 440 ? 400 : 240, s.x - 130)), maxHeight: Math.max(160, s.y - 90),
        autoPanPaddingTopLeft: L.point(60, 12), autoPanPaddingBottomRight: L.point(12, 12), keepInView: true });
      pop.update();
      // Camera content is inserted after popupopen and can grow while the first auto-pan is running.
      // Refit the final DOM geometry, not just the initial empty media box; keep titles clear of zoom controls.
      var queued = false;
      function fitFinal() {
        if (queued) return; queued = true;
        requestAnimationFrame(function () {
          queued = false; if (!map.hasLayer(pop) || !pop.getElement()) return;
          pop.update();
          var box = pop.getElement().querySelector(".leaflet-popup-content-wrapper"); if (!box) return;
          var r = box.getBoundingClientRect(), bounds = map.getContainer().getBoundingClientRect();
          var dx = r.left < bounds.left + 60 ? r.left - bounds.left - 60 : r.right > bounds.right - 12 ? r.right - bounds.right + 12 : 0;
          var dy = r.top < bounds.top + 12 ? r.top - bounds.top - 12 : r.bottom > bounds.bottom - 12 ? r.bottom - bounds.bottom + 12 : 0;
          if (Math.abs(dx) > 1 || Math.abs(dy) > 1) { map.stop(); map.panBy([dx, dy], { animate: false }); }
        });
      }
      fitFinal(); var settle = setTimeout(fitFinal, 350), observer = null;
      if (window.ResizeObserver && pop.getElement()) {
        observer = new ResizeObserver(fitFinal); observer.observe(pop.getElement().querySelector(".leaflet-popup-content"));
      }
      pop.once("remove", function () { clearTimeout(settle); if (observer) observer.disconnect(); });
      var ins = $("map-inset"), tg = $("map-inset-toggle"); if (ins) ins.classList.add("pop-hide"); if (tg) tg.classList.add("pop-hide");
    });
    map.on("popupclose", function () { var ins = $("map-inset"), tg = $("map-inset-toggle"); if (ins) ins.classList.remove("pop-hide"); if (tg) tg.classList.remove("pop-hide"); });
    // OpenStreetMap standard tiles (free, attribution required; light personal use per the OSM tile policy).
    // Darkened with a CSS filter on the tile pane only.
    baseLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, className: "osm-dark",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).on("tileerror", function () { $("map-status").textContent = "Map tiles need a connection; markers still work."; }).addTo(map);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    map.on("zoomend", declutter);
    map.on("moveend", insetVisibility);
    initInset();
    if (window.ftpMapExtras) window.ftpMapExtras({ map: map, mini: mini, group: group, icon: icon, esc: esc, base: function () { return baseLayer; }, setBase: function (l) { baseLayer = l; }, status: function (t) { $("map-status").textContent = t; } });
    drawThreats(); drawLive(); legend();
    setTimeout(function () { map.invalidateSize(); world(); if (mini) { mini.invalidateSize(); mini.fitBounds(LOCAL_BOUNDS); declutterMini(); } }, 60);
  }

  // Inset mini-map: locked to the St. Louis metro (no pan/zoom), local threat markers + NWS zones, same icons.
  function initInset() {
    mini = L.map("map-inset-map", { zoomControl: false, attributionControl: false, dragging: false, touchZoom: false, scrollWheelZoom: false,
      doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false, zoomSnap: 0.25 }).fitBounds(LOCAL_BOUNDS);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, className: "osm-dark" }).addTo(mini);  // credited on the main map
    miniNws = L.layerGroup().addTo(mini); miniThreats = L.layerGroup().addTo(mini);
    setInsetOpen(load("ftp-map-inset", true));
  }
  function inLocal(ll) { return L.latLngBounds(LOCAL_BOUNDS).pad(0.15).contains(ll); }
  function declutterMini() {
    if (!mini) return;
    var ms = []; miniThreats.eachLayer(function (m) { ms.push(m); });
    var used = [], pts = ms.map(function (m) { return mini.latLngToLayerPoint(m.getLatLng()); });
    ms.forEach(function (m, i) {
      if (used[i]) return; var c = [i]; used[i] = 1;
      ms.forEach(function (o, j) { if (!used[j] && pts[i].distanceTo(pts[j]) < 18) { c.push(j); used[j] = 1; } });
      c.forEach(function (k, n) {
        var off = [0, 0]; if (c.length > 1) { var a = 2 * Math.PI * n / c.length - Math.PI / 2, r = 8 + 3 * c.length; off = [Math.round(r * Math.cos(a)), Math.round(r * Math.sin(a))]; }
        ms[k].setIcon(icon(ms[k]._g, ms[k]._c, null, off, true));
      });
    });
  }
  function setInsetOpen(open) {
    $("map-inset").hidden = !open; save("ftp-map-inset", open);
    var t = $("map-inset-toggle"); t.textContent = open ? "–" : "Local ▸"; t.classList.toggle("closed", !open);
    t.setAttribute("aria-expanded", String(open)); t.title = open ? "Hide local inset" : "Show local inset";
    if (open && mini) setTimeout(function () { mini.invalidateSize(); mini.fitBounds(LOCAL_BOUNDS); declutterMini(); }, 30);
  }
  // fade the inset while the main map is already showing the metro (it would just repeat it)
  function insetVisibility() {
    var el = $("map-inset"); if (!el || !map) return;
    var showingLocal = map.getZoom() >= 7.5 && L.latLngBounds(LOCAL_BOUNDS).pad(0.5).contains(map.getCenter());
    el.classList.toggle("dim", showingLocal); $("map-inset-toggle").classList.toggle("dim", showingLocal);
  }

  function drawThreats() {
    var d = window.ftpData && window.ftpData(); if (!d || !map) return;
    Object.keys(TYPES).forEach(function (k) { if (groups[k]) groups[k].clearLayers(); });
    var pts = (d.threats || []).filter(function (t) { return typeof t.lat === "number" && typeof t.lng === "number"; });
    tms = []; if (miniThreats) miniThreats.clearLayers();
    pts.forEach(function (t) {
      var ty = TYPES[t.type] ? t.type : "other";
      var m = L.marker([t.lat, t.lng], { zIndexOffset: 1000, icon: icon(TYPES[ty][0], COLORS[t.level] || "#888"), title: t.name, alt: t.name + " (" + t.level + ")", keyboard: true });
      m.bindPopup('<div class="tm-pop"><b>' + esc(t.name) + '</b><div><span class="pill" style="color:' + (COLORS[t.level] || "#888") + '">' + esc(t.level) + "</span> " + esc(t.trend) + " · " + esc(t.category) + " · as of " + esc(t.date) +
        "</div><p>" + esc(t.summary) + '</p><div class="tm-links">' + (t.source ? '<a href="' + esc(safeUrl(t.source)) + '" target="_blank" rel="noopener">Source ↗</a>' : "") +
        '<button type="button" class="small-btn tm-details" data-id="' + esc(t.id) + '">View details</button></div></div>', { maxWidth: 300 });
      if (miniThreats && inLocal([t.lat, t.lng])) { var mm = L.marker([t.lat, t.lng], { interactive: false, keyboard: false, icon: icon(TYPES[ty][0], COLORS[t.level] || "#888", null, null, true) }); mm._g = TYPES[ty][0]; mm._c = COLORS[t.level] || "#888"; mm.addTo(miniThreats); }
      m.addTo(group(ty)); tms.push({ m: m, g: group(ty), level: t.level, glyph: TYPES[ty][0], color: COLORS[t.level] || "#888" });
    });
    declutter(); declutterMini();
  }

  // Markers closer than ~30 px at the current zoom fan out on a small ring (icon pixel offset only;
  // the marker's true, validated coordinates never change). Recomputed on every zoom.
  var tms = [], bubbles = null, ORDER = ["Severe", "High", "Elevated", "Guarded", "Low"];
  function declutter() {
    if (!map) return;
    if (!bubbles) bubbles = L.layerGroup().addTo(map);
    bubbles.clearLayers();
    var live = tms.filter(function (x) { return map.hasLayer(x.g); });
    tms.forEach(function (x) { x.m.setOpacity(1); if (x.m._icon) x.m._icon.style.pointerEvents = ""; });
    var used = [], pts = live.map(function (x) { return map.latLngToLayerPoint(x.m.getLatLng()); });
    live.forEach(function (x, i) {
      if (used[i]) return;
      var c = [i]; used[i] = 1;
      live.forEach(function (y, j) { if (!used[j] && pts[i].distanceTo(pts[j]) < 30) { c.push(j); used[j] = 1; } });
      if (c.length > 5) {             // big pile (e.g. all local items at world zoom): one count bubble, tap to zoom in
        var worst = c.map(function (k) { return live[k].level; }).sort(function (a, b) { return ORDER.indexOf(a) - ORDER.indexOf(b); })[0];
        var bounds = L.latLngBounds(c.map(function (k) { return live[k].m.getLatLng(); }));
        c.forEach(function (k) { live[k].m.setOpacity(0); if (live[k].m._icon) live[k].m._icon.style.pointerEvents = "none"; });
        L.marker(bounds.getCenter(), { title: c.length + " threats here - tap to zoom", keyboard: true, zIndexOffset: 2000, icon: L.divIcon({ className: "tm-icon tm-bubble", iconSize: [40, 40], iconAnchor: [20, 20], html: '<span style="background:' + COLORS[worst] + '">' + c.length + "</span>" }) })
          .on("click", function () { map.fitBounds(bounds.pad(0.6), { maxZoom: 10 }); }).addTo(bubbles);
        return;
      }
      c.forEach(function (k, n) {
        var off = [0, 0];
        if (c.length > 1) { var a = 2 * Math.PI * n / c.length - Math.PI / 2, r = 12 + 5 * c.length; off = [Math.round(r * Math.cos(a)), Math.round(r * Math.sin(a))]; }
        live[k].m.setIcon(icon(live[k].glyph, live[k].color, c.length > 1 ? "rgba(255,255,255,.25)" : null, off));
      });
    });
  }

  function zoneGeometry(zone) {
    var k = "ftp-zone-" + zone, c = load(k, null);
    if (c) return Promise.resolve(c);
    return fetch("https://api.weather.gov/zones/" + NWS_ZONE_URLS[zone] + "/" + zone, { headers: { Accept: "application/geo+json" } })
      .then(function (r) { return r.json(); }).then(function (j) { var g = { type: "Feature", geometry: j.geometry, properties: { name: j.properties.name } }; save(k, g); return g; })
      .catch(function () { return null; });
  }

  function drawLive() {
    if (!map || !window.ftpLive) return;
    ["nws", "usgs", "fema"].forEach(function (k) { if (groups[k]) groups[k].clearLayers(); });
    if (miniNws) miniNws.clearLayers();
    var addNws = function (gj, style, pop) { L.geoJSON(gj, { style: style }).bindPopup(pop).addTo(group("nws")); if (miniNws) L.geoJSON(gj, { style: style, interactive: false }).addTo(miniNws); };
    var lv = window.ftpLive;
    // NWS: alert polygon if given, else the affected local zones' shapes
    ((lv.nws.data && lv.nws.data.features) || []).forEach(function (f) {
      var p = f.properties, color = p.severity === "Extreme" || p.severity === "Severe" ? COLORS.High : p.severity === "Moderate" ? COLORS.Elevated : COLORS.Guarded;
      var pop = '<div class="tm-pop"><b>' + esc(p.event) + "</b><div>" + esc(p.severity) + " · until " + esc(ct(p.ends || p.expires)) + "</div><p>" + esc(p.headline || "") + '</p><div class="tm-links"><a href="' + esc(safeUrl(p["@id"] || p.id)) + '" target="_blank" rel="noopener">NWS alert ↗</a></div></div>';
      var style = { color: color, weight: 2, fillOpacity: 0.18 };
      if (f.geometry) { addNws(f, style, pop); return; }
      var ours = (p.affectedZones || []).map(function (u) { return u.split("/").pop(); }).filter(function (z) { return NWS_ZONE_URLS[z]; });
      // forecast zones and county zones overlap; prefer county shapes to avoid double outlines
      var counties = ours.filter(function (z) { return /C\d+$/.test(z); }); if (counties.length) ours = counties;
      ours.forEach(function (z) { zoneGeometry(z).then(function (g) { if (g && g.geometry) addNws(g, style, pop); }); });
    });
    ((lv.usgs.data && lv.usgs.data.features) || []).forEach(function (f) {
      var p = f.properties, c = f.geometry.coordinates, mag = p.mag || 0;
      L.circleMarker([c[1], c[0]], { radius: 4 + mag * 2.2, color: "#e0b030", weight: 1, fillColor: mag >= 4 ? COLORS.High : COLORS.Elevated, fillOpacity: 0.6 })
        .bindPopup('<div class="tm-pop"><b>M' + mag.toFixed(1) + " earthquake</b><div>" + esc(p.place) + " · " + esc(ct(p.time)) + '</div><div class="tm-links"><a href="' + esc(safeUrl(p.url)) + '" target="_blank" rel="noopener">USGS ↗</a></div></div>').addTo(group("usgs"));
    });
    var seen = {};
    (((lv.fema.data || {}).DisasterDeclarationsSummaries) || []).forEach(function (r) {
      if (seen[r.disasterNumber] || !STATE_CENTROID[r.state]) return; seen[r.disasterNumber] = 1;
      var n = Object.keys(seen).length, ll = STATE_CENTROID[r.state];
      L.marker([ll[0] + (n % 3) * 0.25, ll[1] + Math.floor(n / 3) * 0.35], { icon: icon("🏛️", "#6b7c75"), title: r.declarationTitle })
        .bindPopup('<div class="tm-pop"><b>' + esc(r.state) + " · " + esc(r.declarationTitle) + "</b><div>" + esc(r.incidentType) + " · " + esc(r.declarationType) + " " + esc(r.disasterNumber) + " · " + esc(ct(r.declarationDate)) +
          '</div><p class="d">Placed at the state center; FEMA lists affected counties, not points.</p><div class="tm-links"><a href="https://www.fema.gov/disaster/' + esc(r.disasterNumber) + '" target="_blank" rel="noopener">FEMA ↗</a></div></div>').addTo(group("fema"));
    });
    var st = []; if (!lv.nws.live || !lv.usgs.live) st.push("Live layers: offline copy from " + ct(lv.usgs.at || lv.nws.at));
    if (st.length) $("map-status").textContent = st.join(" · ");
  }

  function legend() {
    var d = window.ftpData && window.ftpData(), present = {};
    ((d && d.threats) || []).forEach(function (t) { present[TYPES[t.type] ? t.type : "other"] = (present[t.type] || 0) + 1; });
    var keys = Object.keys(TYPES).filter(function (k) { return present[k]; }).concat(Object.keys(LIVE));
    $("map-layers").innerHTML = keys.map(function (k) {
      var def = TYPES[k] || LIVE[k];
      return '<label class="lay"><input type="checkbox" data-layer="' + k + '"' + (hidden[k] ? "" : " checked") + "> " + def[0] + " " + esc(def[1]) + (away() && STL_LAYERS[k] ? ' <span class="stl-tag">' + STL_LAYERS[k] + "</span>" : "") + (present[k] ? ' <span class="d">' + present[k] + "</span>" : "") + "</label>";
    }).join("") + '<div class="row"><span class="d">NWS, USGS and FEMA are live layers.</span><button type="button" class="small-btn" data-layers="all">All on</button><button type="button" class="small-btn" data-layers="none">All off</button></div>';
    $("map-legend").innerHTML = '<div class="lg-row">' + Object.keys(COLORS).map(function (l) { return '<span><i style="background:' + COLORS[l] + '"></i>' + l + "</span>"; }).join("") + "</div>" +
      '<div class="lg-row icons">' + keys.map(function (k) { var def = TYPES[k] || LIVE[k]; return "<span>" + def[0] + " " + esc(def[1]) + "</span>"; }).join("") + "</div>" +
      '<div class="d">Markers for national items sit near the U.S. center; local items use county or regional points, never a private address. Tap a marker for details.</div>';
  }

  function world() {
    var d = window.ftpData && window.ftpData(), ll = ((d && d.threats) || []).filter(function (t) { return typeof t.lat === "number"; }).map(function (t) { return [t.lat, t.lng]; });
    if (!ll.length) return map.setView([30, -30], 1);
    var bb = L.latLngBounds(ll), z = Math.min(3, map.getBoundsZoom(bb, false, L.point(70, 70)));
    map.setView([Math.max(-50, Math.min(55, bb.getCenter().lat)), bb.getCenter().lng], Math.max(0.5, Math.floor(z * 4) / 4));
  }
  function setLayer(k, on) {
    hidden[k] = !on; save("ftp-map-hidden", hidden);
    var g = groups[k]; if (!g) return;
    if (on) g.addTo(map); else map.removeLayer(g);
    document.dispatchEvent(new CustomEvent("ftp-layer", { detail: { key: k, on: on } }));
    if (k === "nws" && miniNws && mini) { if (on) miniNws.addTo(mini); else mini.removeLayer(miniNws); }
    declutter();
  }

  document.addEventListener("click", function (e) {
    var tab = e.target.closest("[data-tab]");
    if (tab && tab.getAttribute("data-tab") === "map") setTimeout(function () {
      // bring the map bar right under the sticky header+tabs so the map fills the screen
      var panel = document.querySelector('[data-panel="map"]'), tabs = document.querySelector(".tabs");
      var stick = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hdr")) || 61) + tabs.offsetHeight;
      var y = panel.getBoundingClientRect().top + scrollY - stick;
      if (Math.abs(scrollY - y) > 4) scrollTo(0, Math.max(0, y));
      init();
    }, 0);
    if (e.target.id === "map-local" && map) map.fitBounds(localBounds());
    else if (e.target.closest("#map-inset") && map) map.fitBounds(LOCAL_BOUNDS);
    if (e.target.id === "map-inset-toggle") setInsetOpen($("map-inset").hidden);
    if (e.target.id === "map-world" && map) world();
    if (e.target.id === "map-layers-btn") { var p = $("map-layers"); p.hidden = !p.hidden; e.target.setAttribute("aria-expanded", String(!p.hidden)); }
    var all = e.target.closest("[data-layers]");
    if (all) { var on = all.getAttribute("data-layers") === "all"; document.querySelectorAll("[data-layer]").forEach(function (c) { c.checked = on; setLayer(c.getAttribute("data-layer"), on); }); }
    var det = e.target.closest(".tm-details");
    if (det && window.ftpOpenThreat) { if (map) map.closePopup(); window.ftpOpenThreat(det.getAttribute("data-id")); }
  });
  document.addEventListener("keydown", function (e) { if (e.target.id === "map-inset" && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); map.fitBounds(LOCAL_BOUNDS); } });
  document.addEventListener("change", function (e) { if (e.target.matches("[data-layer]")) setLayer(e.target.getAttribute("data-layer"), e.target.checked); });
  document.addEventListener("ftp-data", function () { if (map) { drawThreats(); legend(); } });
  document.addEventListener("ftp-live", function () { if (map) drawLive(); });
  document.addEventListener("ftp-loc", function () { addLocZones(); if (map) { legend(); map.closePopup(); map.fitBounds(localBounds()); } });
  window.ftpLocalBounds = localBounds;
})();
