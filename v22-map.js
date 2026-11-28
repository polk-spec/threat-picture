/* V2.2 map tools: on-device places with 10/25/50/100/250 mi rings, filters (category, severity, distance, time),
   IDOT road incidents & closures (official, live, CORS-enabled ArcGIS) and county-level power outages (Ameren, from the
   twice-daily snapshot). Places are drawn only in this browser; the road query uses a fixed regional box, never a place. */
(function () {
  "use strict";
  var V2 = window.V2, E = window.FTPEngine, V22 = window.V22, $ = V2.$, esc = V2.esc, load = V2.load, save = V2.save;
  var KP = "ftp-private-mapprefs";
  var RINGS = [10, 25, 50, 100, 250];
  var prefs = Object.assign({ places: true, rings: [10, 25, 50], ringsAll: false, cat: "", sev: "", dist: "", time: "", roads: true, outages: true }, load(KP, {}));
  function savePrefs() { save(KP, prefs); }
  var KIND_ICON = { home: "🏠", work: "💼", campus: "🎓", meeting: "🚩", destination: "📍", other: "📌" };
  var ROADS_URL = "https://services2.arcgis.com/aIrBD8yn1TDTEXoz/arcgis/rest/services/Illinois_Roadway_Incidents/FeatureServer/0/query?where=1%3D1" +
    "&geometry=-91.5,37.8,-88.8,39.6&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&outFields=ROAD_CLOSED,CRITICALITY_DESC,TRAFFIC_ITEM_DESCRIPTION,LOCATION_DEFINED_ORIGIN_RDWY,START_TIME,END_TIME,VERIFIED,TRAFFIC_ITEM_TYPE_DESC&resultRecordCount=800&f=json";
  // county centers for the Ameren county outage counts (public geography, St. Louis metro only)
  var COUNTY = { "St. Louis County|MO": [38.64, -90.44], "St. Louis City|MO": [38.63, -90.24], "St. Charles County|MO": [38.78, -90.67], "Jefferson County|MO": [38.26, -90.54],
    "Franklin County|MO": [38.41, -91.07], "Lincoln County|MO": [39.06, -90.96], "Warren County|MO": [38.76, -91.16], "St. Clair County|IL": [38.47, -89.93], "Madison County|IL": [38.83, -89.9],
    "Monroe County|IL": [38.28, -90.18], "Clinton County|IL": [38.61, -89.42], "Jersey County|IL": [39.08, -90.36], "Macoupin County|IL": [39.26, -89.92], "Randolph County|IL": [38.05, -89.82], "Washington County|IL": [38.35, -89.41] };

  // ---------- road incidents (also used by COMMAND and notifications) ----------
  var roads = load("ftp-v22-roads", null), roadsLive = false, roadsP = null;
  function fetchRoads(force) {
    if (!force && roads && Date.now() - Date.parse(roads.at) < 10 * 60e3) return Promise.resolve(roads);
    if (roadsP) return roadsP;
    roadsP = fetch(ROADS_URL, { cache: "no-store" }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) {
      if (j.error) throw 0;
      var now = Date.now();
      var items = (j.features || []).map(function (f) {
        var a = f.attributes || {}, g = f.geometry || {};
        return { lat: Math.round(g.y * 1e4) / 1e4, lng: Math.round(g.x * 1e4) / 1e4, closed: a.ROAD_CLOSED === "true", critical: a.CRITICALITY_DESC === "critical", verified: a.VERIFIED === "true",
          road: String(a.LOCATION_DEFINED_ORIGIN_RDWY || "").slice(0, 80), desc: String(a.TRAFFIC_ITEM_DESCRIPTION || a.TRAFFIC_ITEM_TYPE_DESC || "").slice(0, 200), type: String(a.TRAFFIC_ITEM_TYPE_DESC || ""),
          start: a.START_TIME || null, end: a.END_TIME || null };
      }).filter(function (x) { return isFinite(x.lat) && isFinite(x.lng) && (!x.end || x.end > now); });
      roads = { at: new Date().toISOString(), items: items }; roadsLive = true; save("ftp-v22-roads", roads); return roads;
    }).catch(function () { roadsLive = false; return roads; }).then(function (r) { roadsP = null; document.dispatchEvent(new CustomEvent("ftp-roads")); return r; });
    return roadsP;
  }
  V22.fetchRoads = fetchRoads;
  // interstates, US and state routes (IDOT names them "I-64", "US-50", "IL-158", "Interstate 255", ...)
  V22.majorRoad = function (r) { return /^(I|US|IL|MO)[- ]?\d|interstate|\bhwy\b|highway/i.test(r.road || "") || /\b(I|US|IL)-\d/.test(r.desc || ""); };
  V22.roadIncidents = function () { return roads ? { at: roads.at, items: roads.items, live: roadsLive } : null; };
  setTimeout(function () { if (navigator.onLine) fetchRoads(); }, 4000);
  setInterval(function () { if (!document.hidden && navigator.onLine) fetchRoads(); }, 10 * 60e3);
  document.addEventListener("ftp-roads", function () { if (V22.paintCommand && V2.curTab() === "brief") V22.paintCommand(); });

  // ---------- filters used by map.js ----------
  var SEV_MIN = { "": 0, YELLOW: 1, ORANGE: 2, RED: 3 };
  function nearestMi(lat, lng) { var best = null; V22.places().forEach(function (l) { var mi = E.miles(lat, lng, +l.lat, +l.lon); if (best == null || mi < best) best = mi; }); return best; }
  function timeOk(at) { if (!prefs.time) return true; var t = Date.parse(at); return !isNaN(t) && Date.now() - t <= +prefs.time * 3600e3; }
  window.ftpMapFilter = function (t) {
    if (prefs.cat && E.category(t) !== prefs.cat) return false;
    if (E.rank(E.levelColor(t.level)) < SEV_MIN[prefs.sev || ""]) return false;
    if (prefs.dist) { var mi = nearestMi(t.lat, t.lng); if (mi == null || mi > +prefs.dist) return false; }
    if (prefs.time) { var d = window.ftpData && window.ftpData(); if (!timeOk(t.updatedAt || t.checkedAt || (d && d.updated))) return false; }
    return true;
  };
  window.ftpMapFilterLive = function (kind, p, ll) {
    if (kind === "nws") {
      if (prefs.cat && E.nwsCategory(p.event) !== prefs.cat) return false;
      if (E.rank(E.nwsColor(p)) < SEV_MIN[prefs.sev || ""]) return false;
      return timeOk(p.sent || p.effective);
    }
    if (kind === "usgs") {
      if (prefs.cat && prefs.cat !== "quake") return false;
      var mi = ll ? nearestMi(ll[0], ll[1]) : null;
      if (prefs.dist && (mi == null || mi > +prefs.dist)) return false;
      if (E.rank(E.quakeColor(+p.mag || 0, (mi || 9999) / 0.621371)) < SEV_MIN[prefs.sev || ""]) return false;
      return timeOk(new Date(p.time).toISOString());
    }
    return true;
  };

  // ---------- overlays ----------
  var lay = { places: null, roads: null, outages: null };
  function map() { return window.ftpMap; }
  function drawPlaces() {
    var m = map(); if (!m) return;
    if (!lay.places) lay.places = L.layerGroup();
    lay.places.clearLayers();
    if (!prefs.places) { m.removeLayer(lay.places); return; }
    var ps = V22.places();
    ps.forEach(function (l, i) {
      var k = l.kind || (l.home ? "home" : "other");
      L.marker([+l.lat, +l.lon], { icon: L.divIcon({ className: "place-pin", iconSize: [26, 26], iconAnchor: [13, 13], html: "<span>" + (KIND_ICON[k] || "📌") + "</span>" }), title: l.name, keyboard: true, zIndexOffset: 1500 })
        .bindPopup('<div class="tm-pop"><b>' + esc(l.name) + "</b><div>" + esc((V2.PLACE_KINDS.filter(function (x) { return x[0] === k; })[0] || ["", "Place"])[1]) + "</div><p class=\"d\">Private: stored only on this device, never uploaded.</p></div>").addTo(lay.places);
      if (prefs.ringsAll || l.home || i === 0) (prefs.rings || []).forEach(function (mi) {
        L.circle([+l.lat, +l.lon], { radius: mi * 1609.34, color: "#5aa0ff", weight: 1, opacity: 0.7, fill: false, dashArray: "4 4", interactive: false }).addTo(lay.places);
        L.marker(destPoint(+l.lat, +l.lon, mi), { interactive: false, keyboard: false, icon: L.divIcon({ className: "ring-lab", iconSize: [44, 14], html: '<span style="font:600 10px monospace;color:#9cc4ff">' + mi + " mi</span>" }) }).addTo(lay.places);
      });
    });
    lay.places.addTo(m);
  }
  function destPoint(lat, lon, mi) { return [lat + (mi * 1.609344) / 111.2, lon]; }
  function drawRoads() {
    var m = map(); if (!m) return;
    if (!lay.roads) lay.roads = L.layerGroup();
    lay.roads.clearLayers();
    if (!prefs.roads || !roads) { m.removeLayer(lay.roads); return; }
    roads.items.forEach(function (r) {
      var c = r.closed ? "RED" : r.critical ? "ORANGE" : "YELLOW";
      if (prefs.sev && E.rank(c) < SEV_MIN[prefs.sev]) return;
      if (prefs.cat && prefs.cat !== "transport") return;
      if (prefs.dist) { var mi = nearestMi(r.lat, r.lng); if (mi == null || mi > +prefs.dist) return; }
      if (prefs.time && r.start && Date.now() - r.start > +prefs.time * 3600e3) return;
      L.circleMarker([r.lat, r.lng], { radius: r.closed ? 7 : 5, color: "#111", weight: 1, fillColor: c === "RED" ? "#e04848" : c === "ORANGE" ? "#e8762c" : "#e0b030", fillOpacity: 0.9 })
        .bindPopup('<div class="tm-pop"><b>' + esc(r.closed ? "Road closed" : r.type ? r.type.replace(/_/g, " ").toLowerCase() : "Incident") + (r.road ? " · " + esc(r.road) : "") + "</b><p>" + esc(r.desc) + "</p><div class=\"d\">" +
          (r.start ? "Since " + esc(V2.ct(r.start)) : "") + (r.end ? " · until " + esc(V2.ct(r.end)) : "") + " · " + (r.verified ? "verified" : "unverified") + '</div><div class="d">IDOT / Travel Midwest, ' + (roadsLive ? "live " : "saved copy ") + esc(V2.ct(roads.at)) + '</div><div class="tm-links"><a href="https://www.gettingaroundillinois.com/Traveler%20Information/index.html" target="_blank" rel="noopener">Official map ↗</a></div></div>').addTo(lay.roads);
    });
    lay.roads.addTo(m);
  }
  function drawOutages() {
    var m = map(); if (!m) return;
    if (!lay.outages) lay.outages = L.layerGroup();
    lay.outages.clearLayers();
    var f = window.ftpLive && window.ftpLive.feeds && window.ftpLive.feeds.data, am = f && f.ameren;
    if (!prefs.outages || !am || (prefs.cat && prefs.cat !== "power")) { m.removeLayer(lay.outages); return; }
    (am.metroCounties || []).forEach(function (c) {
      var ll = COUNTY[c.county + "|" + c.state]; if (!ll || !c.customersOut) return;
      var col = c.percentOut >= 10 ? "RED" : c.percentOut >= 2 ? "ORANGE" : c.customersOut >= 500 ? "YELLOW" : "GREEN";
      if (prefs.sev && E.rank(col) < SEV_MIN[prefs.sev]) return;
      L.circleMarker(ll, { radius: Math.min(22, 5 + Math.sqrt(c.customersOut) / 4), color: "#ffd84d", weight: 1, fillColor: "#ffd84d", fillOpacity: 0.25 })
        .bindPopup('<div class="tm-pop"><b>⚡ ' + esc(c.county) + ", " + esc(c.state) + "</b><div>" + esc(c.customersOut) + " customers out of " + esc(c.customersServed) + " (" + esc(c.percentOut) + "%)</div>" +
          '<p class="d">County total from Ameren, snapshot ' + esc(V2.ct(am.generated)) + " (not live). Placed at the county center, not at outage locations.</p>" + '<div class="tm-links"><a href="https://outagemap.ameren.com/" target="_blank" rel="noopener">Ameren outage map ↗</a></div></div>').addTo(lay.outages);
    });
    lay.outages.addTo(m);
  }
  function drawAll() { drawPlaces(); drawRoads(); drawOutages(); }
  V22.mapDraw = drawAll;

  // ---------- tools bar ----------
  function sel(id, label, opts, cur) { return '<label>' + label + ' <select id="' + id + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(cur) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></label>"; }
  function barHtml() {
    var active = [prefs.cat && E.CATS[prefs.cat] ? E.CATS[prefs.cat][0] : "", prefs.sev ? prefs.sev + "+" : "", prefs.dist ? "≤" + prefs.dist + " mi" : "", prefs.time ? "last " + prefs.time + " h" : ""].filter(Boolean).join(" · ");
    return '<details class="mt-wrap" id="mt-wrap"' + (window.innerWidth >= 700 ? " open" : "") + '><summary>Filters, rings &amp; layers <span class="d" id="mt-active">' + esc(active || "showing everything") + "</span></summary>" +
      '<div class="mt-bar" id="mt-bar" role="group" aria-label="Map filters">' +
      sel("mt-cat", "Category", [["", "All"]].concat(Object.keys(E.CATS).map(function (k) { return [k, E.CATS[k][0]]; })), prefs.cat) +
      sel("mt-sev", "Severity", [["", "All"], ["YELLOW", "YELLOW and up"], ["ORANGE", "ORANGE and up"], ["RED", "RED only"]], prefs.sev) +
      sel("mt-dist", "Distance", [["", "Any"]].concat(RINGS.map(function (r) { return [r, "within " + r + " mi of my places"]; })), prefs.dist) +
      sel("mt-time", "Time", [["", "Any time"], [6, "last 6 h"], [24, "last 24 h"], [72, "last 3 days"], [168, "last 7 days"]], prefs.time) +
      '</div><div class="mt-bar"><label><input type="checkbox" id="mt-places"' + (prefs.places ? " checked" : "") + "> My places (this device only)</label>" +
      '<span class="mt-rings" aria-label="Monitoring radii">' + RINGS.map(function (r) { return '<label><input type="checkbox" data-ring="' + r + '"' + (prefs.rings.indexOf(r) >= 0 ? " checked" : "") + "> " + r + " mi</label>"; }).join("") + "</span>" +
      sel("mt-ringsall", "Rings around", [["0", "primary residence"], ["1", "every place"]], prefs.ringsAll ? "1" : "0") +
      '<label><input type="checkbox" id="mt-roads"' + (prefs.roads ? " checked" : "") + '> 🛑 Road incidents (IDOT, live)</label><label><input type="checkbox" id="mt-out"' + (prefs.outages ? " checked" : "") + "> ⚡ Power outages (county, snapshot)</label>" +
      '<button type="button" class="small-btn" data-tab-go="sources" data-anchor="v2-locs">Edit places</button></div>' +
      '<p class="d" id="mt-note">Filters apply to brief markers, NWS alerts, USGS quakes, road incidents and outages. MoDOT closures have no browser-readable feed; use the MoDOT Traveler map. Suggested routes in your plans are not verified road conditions.</p></details>';
  }
  function mountBar() {
    var mb = document.querySelector('[data-panel="map"] .map-bar'); if (!mb || $("mt-bar")) return;
    mb.insertAdjacentHTML("afterend", barHtml());
  }
  document.addEventListener("change", function (e) {
    var t = e.target, ch = true;
    if (t.id === "mt-cat") prefs.cat = t.value; else if (t.id === "mt-sev") prefs.sev = t.value; else if (t.id === "mt-dist") prefs.dist = t.value; else if (t.id === "mt-time") prefs.time = t.value;
    else if (t.id === "mt-places") prefs.places = t.checked; else if (t.id === "mt-ringsall") prefs.ringsAll = t.value === "1"; else if (t.id === "mt-roads") prefs.roads = t.checked; else if (t.id === "mt-out") prefs.outages = t.checked;
    else if (t.matches && t.matches("[data-ring]")) { var r = +t.getAttribute("data-ring"); prefs.rings = prefs.rings.filter(function (x) { return x !== r; }); if (t.checked) prefs.rings.push(r); prefs.rings.sort(function (a, b) { return a - b; }); }
    else ch = false;
    if (!ch || !t.closest("[data-panel=map]")) return;
    savePrefs(); if (window.ftpMapRedraw) window.ftpMapRedraw(); drawAll();
    var ma = $("mt-active"); if (ma) ma.textContent = [prefs.cat && E.CATS[prefs.cat] ? E.CATS[prefs.cat][0] : "", prefs.sev ? prefs.sev + "+" : "", prefs.dist ? "≤" + prefs.dist + " mi" : "", prefs.time ? "last " + prefs.time + " h" : ""].filter(Boolean).join(" · ") || "showing everything";
  });
  function whenMap(fn, n) { n = n || 0; if (map()) return fn(); if (n < 40) setTimeout(function () { whenMap(fn, n + 1); }, 150); }
  document.addEventListener("click", function (e) {
    var tb = e.target.closest && e.target.closest('[data-tab="map"]');
    if (tb) { mountBar(); whenMap(function () { drawAll(); fetchRoads().then(drawRoads); }); }
  });
  ["ftp-places", "ftp-live", "ftp-data"].forEach(function (ev) { document.addEventListener(ev, function () { if (map()) { drawAll(); if (ev !== "ftp-live" && window.ftpMapRedraw && (prefs.dist)) window.ftpMapRedraw(); } }); });
  document.addEventListener("ftp-roads", function () { if (map()) drawRoads(); });
  V22.mapPrefs = function () { return prefs; };
})();
