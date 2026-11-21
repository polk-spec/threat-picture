/* Shared alert rules for the page and the service worker (importScripts). Mirrored in fetch_feeds.py notify().
   Fires for: a threat in data.json at High or Severe (new, or newly raised), an NWS alert in our zones whose event is
   in NWS_EVENTS (or severity Extreme), and USGS quakes M>=2.5 within 100 km of the metro or M>=4.0 within 300 km of New Madrid,
   metro AQI >= 151 (Open-Meteo live; AirNow in fetch_feeds.py), and due on-device drill / radio-test reminders.
   V2.2: every item carries cls (critical | high | info), cat (one of the 14 hazard categories) and, where known, mi
   (distance from the monitored place). New rules: IDOT closures on interstate/US/state routes nearby, Ameren metro outages
   >= 5,000 customers. National/global threats from data.json are "info" (they never count as household alerts).
   fresh() applies the on-device notification preferences (/__ftp_notify_prefs): classes, categories, distance and quiet
   hours (critical always passes). Filtered items are still recorded as seen, so they do not fire later. */
(function (g) {
  "use strict";
  var ZONES = "ILC163,ILZ101,MOC510,MOZ064,MOC189,MOZ063";
  var NWS_EVENTS = ["Tornado Warning", "Tornado Watch", "Severe Thunderstorm Warning", "Civil Emergency Message", "Civil Danger Warning",
    "Shelter In Place Warning", "Evacuation Immediate", "Local Area Emergency", "Law Enforcement Warning", "Nuclear Power Plant Warning",
    "Radiological Hazard Warning", "Hazardous Materials Warning", "Flash Flood Emergency", "Flash Flood Warning", "Extreme Wind Warning", "Earthquake Warning"];
  // these also open the full-screen severe-weather takeover (severe.js); notifications for them deep-link to #severe
  var SEVERE_EVENTS = ["Tornado Warning", "Severe Thunderstorm Warning", "Flash Flood Warning", "Flash Flood Emergency", "Extreme Wind Warning",
    "Civil Emergency Message", "Civil Danger Warning", "Shelter In Place Warning", "Evacuation Immediate", "Local Area Emergency"];
  var METRO = [38.63, -90.2], NEW_MADRID = [36.59, -89.59];
  var IDOT = "https://services2.arcgis.com/aIrBD8yn1TDTEXoz/arcgis/rest/services/Illinois_Roadway_Incidents/FeatureServer/0/query?where=ROAD_CLOSED%3D%27true%27" +
    "&geometry=-91.5,37.8,-88.8,39.6&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&outFields=OBJECTID,ROAD_CLOSED,TRAFFIC_ITEM_DESCRIPTION,LOCATION_DEFINED_ORIGIN_RDWY,START_TIME&resultRecordCount=800&f=json";
  var TYPE_CAT = { weather: "severe", flood: "flood", fire: "wildfire", earthquake: "quake", power: "power", cyber: "cyber", transport: "transport", crime: "safety", terrorism: "safety",
    nuclear: "nuclear", disease: "health", air: "health", military: "natsec", conflict: "natsec" };
  function nwsCat(ev) { ev = String(ev || "").toLowerCase(); return /tornado/.test(ev) ? "tornado" : /flood/.test(ev) ? "flood" : /fire|red flag/.test(ev) ? "wildfire" : /earthquake/.test(ev) ? "quake" : /nuclear|radiolog/.test(ev) ? "nuclear" : /hazardous|shelter|evacuat|civil|law enforcement|local area/.test(ev) ? "safety" : /air quality/.test(ev) ? "health" : "severe"; }
  function prefs() {
    if (typeof caches === "undefined") return Promise.resolve(null);
    return caches.open("ftp-notify").then(function (c) { return c.match("/__ftp_notify_prefs"); }).then(function (r) { return r ? r.json() : null; }).catch(function () { return null; });
  }
  function hm(s) { var m = /^(\d\d):(\d\d)$/.exec(s || ""); return m ? +m[1] * 60 + +m[2] : null; }
  // true if the item should be shown under the preferences p (null p = V2 behaviour: everything)
  function allowed(it, p, now) {
    if (!p) return true;
    var cls = it.cls || "high";
    if (p[cls] === false) return false;
    if (p.cats && it.cat && p.cats[it.cat] === false && cls !== "critical") return false;
    if (it.mi != null && p.maxMi && it.mi > +p.maxMi && cls !== "critical") return false;
    if (p.quiet && cls !== "critical") {
      var a = hm(p.qFrom), b = hm(p.qTo), parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now || new Date()),
        h = +parts.filter(function (x) { return x.type === "hour"; })[0].value, mm = +parts.filter(function (x) { return x.type === "minute"; })[0].value, t = h * 60 + mm;
      if (a != null && b != null && (a <= b ? t >= a && t < b : t >= a || t < b)) return false;
    }
    return true;
  }
  var AQI_URL = "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=38.63&longitude=-90.2&current=us_aqi,us_aqi_pm2_5,us_aqi_ozone&timezone=America%2FChicago";
  function aqiCat(a) { return a >= 301 ? "Hazardous" : a >= 201 ? "Very Unhealthy" : a >= 151 ? "Unhealthy" : a >= 101 ? "Unhealthy for Sensitive Groups" : a >= 51 ? "Moderate" : "Good"; }
  function km(a, b, c, d) { var r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2); return 12742 * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y)); }
  function j(fetchFn, u, h) { return fetchFn(u, h ? { headers: h } : undefined).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }

  // returns Promise<[{id, title, body, tag, url, level}]> of everything that currently qualifies
  // the location switcher (loc.js) mirrors a non-home place to Cache Storage so this works inside the service worker too
  function place() {
    if (typeof caches === "undefined") return Promise.resolve(null);
    return caches.open("ftp-notify").then(function (c) { return c.match("/__ftp_loc"); }).then(function (r) { return r ? r.json() : null; }).catch(function () { return null; });
  }
  function collect(fetchFn, base) { return place().then(function (loc) { return collectAt(fetchFn, base, loc && isFinite(loc.lat) ? loc : null); }); }
  function collectAt(fetchFn, base, loc) {
    var out = [];
    var here = loc ? [loc.lat, loc.lon] : METRO, where = loc ? loc.label : "St. Louis metro";
    var since = new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 19);
    var p1 = j(fetchFn, base + "data.json?t=" + Date.now()).then(function (d) {
      (d.threats || []).forEach(function (t) {
        if (t.level === "High" || t.level === "Severe")
          out.push({ id: "threat:" + t.id + ":" + t.level, title: t.level.toUpperCase() + ": " + t.name, body: (t.summary || "").slice(0, 180), tag: "threat-" + t.id, url: base + "#board", level: t.level,
            cls: t.category === "Local" ? "high" : "info", cat: t.hazard || TYPE_CAT[t.type] || "infra" });
      });
    }).catch(function () {});
    var p7 = j(fetchFn, base + "feeds.json?t=" + Date.now()).then(outages).catch(function () {});
    function outages(f) {   // Ameren metro counties (fetched by the routine into feeds.json)
      var mc = (f && f.ameren && f.ameren.metroCounties) || [], tot = 0;
      mc.forEach(function (c) { tot += +c.customersOut || 0; });
      var step = tot >= 100000 ? 100000 : tot >= 25000 ? 25000 : tot >= 5000 ? 5000 : 0;
      if (step) out.push({ id: "power:" + new Date().toISOString().slice(0, 10) + ":" + step, title: "Power outages: " + tot.toLocaleString("en-US") + " customers out", body: "Ameren, St. Louis metro counties. Check the outage map and your backup power plan.", tag: "power", url: base + "#map", level: "High", cls: "high", cat: "power" });
    }
    var p6 = j(fetchFn, IDOT).then(function (d) {   // IDOT closures on major routes near the place (fixed regional query box)
      (d.features || []).forEach(function (f) {
        var a = f.attributes || {}, g = f.geometry || {}; if (a.ROAD_CLOSED !== "true" || !isFinite(g.y)) return;
        var road = String(a.LOCATION_DEFINED_ORIGIN_RDWY || ""), desc = String(a.TRAFFIC_ITEM_DESCRIPTION || "");
        if (!/^(I|US|IL)[- ]?\d|interstate/i.test(road) && !/\b(I|US|IL)-\d/.test(desc)) return;
        var mi = km(g.y, g.x, here[0], here[1]) / 1.609; if (mi > 25) return;
        out.push({ id: "idot:" + a.OBJECTID + ":" + (a.START_TIME || ""), title: "Road closed: " + (road || "major route"), body: desc.slice(0, 180) + " (IDOT, ~" + Math.round(mi) + " mi)", tag: "idot-" + a.OBJECTID, url: base + "#map", level: "High", cls: "high", cat: "transport", mi: mi });
      });
    }).catch(function () {});
    var p2 = j(fetchFn, loc ? "https://api.weather.gov/alerts/active?point=" + loc.lat + "," + loc.lon : "https://api.weather.gov/alerts/active?zone=" + ZONES, { Accept: "application/geo+json" }).then(function (d) {
      (d.features || []).forEach(function (f) {
        var p = f.properties;
        if (NWS_EVENTS.indexOf(p.event) >= 0 || p.severity === "Extreme")
          out.push({ id: "nws:" + p.id, title: p.event, body: (p.headline || p.areaDesc || "").slice(0, 180), tag: "nws-" + p.event, url: base + (SEVERE_EVENTS.indexOf(p.event) >= 0 ? "#severe" : "#alerts"), level: "Severe",
            cls: SEVERE_EVENTS.indexOf(p.event) >= 0 || p.severity === "Extreme" ? "critical" : "high", cat: nwsCat(p.event) });
      });
    }).catch(function () {});
    var p3 = j(fetchFn, "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=" + (loc ? here[0] : NEW_MADRID[0]) + "&longitude=" + (loc ? here[1] : NEW_MADRID[1]) + "&maxradiuskm=300&minmagnitude=2.5&starttime=" + since).then(function (d) {
      (d.features || []).forEach(function (f) {
        var c = f.geometry.coordinates, m = f.properties.mag || 0;
        var dk = km(c[1], c[0], here[0], here[1]);
        if ((m >= 2.5 && dk <= 100) || (m >= 4 && km(c[1], c[0], loc ? here[0] : NEW_MADRID[0], loc ? here[1] : NEW_MADRID[1]) <= 300))
          out.push({ cls: m >= 5 && dk <= 160 ? "critical" : m >= 4 ? "high" : "info", cat: "quake", mi: dk / 1.609, id: "usgs:" + f.id, title: "M" + m.toFixed(1) + " earthquake", body: f.properties.place + " · " + new Date(f.properties.time).toLocaleString("en-US", { timeZone: "America/Chicago" }) + " CT", tag: "usgs-" + f.id, url: base + "#alerts", level: m >= 4.5 ? "Severe" : "High" });
      });
    }).catch(function () {});
    var p4 = j(fetchFn, loc ? AQI_URL.replace("latitude=38.63&longitude=-90.2", "latitude=" + here[0] + "&longitude=" + here[1]).replace("timezone=America%2FChicago", "timezone=auto") : AQI_URL).then(function (d) {   // AQI 151+ (Unhealthy) for the metro, once per day per category
      var c = d.current || {}, a = c.us_aqi;
      if (a >= 151) {
        var what = (c.us_aqi_pm2_5 || 0) >= (c.us_aqi_ozone || 0) ? "fine particles (PM2.5, often smoke)" : "ozone";
        out.push({ id: "aqi:" + String(c.time || "").slice(0, 10) + ":" + aqiCat(a), title: "Air quality " + aqiCat(a) + " (AQI " + a + ")", body: where + ", driven by " + what + ". Limit time outdoors; open the app for smoke/ozone steps.", tag: "aqi", url: base + "#prep-air", level: a >= 201 ? "Severe" : "High", cls: a >= 201 ? "high" : "info", cat: "health" });
      }
    }).catch(function () {});
    var p5 = caches.open("ftp-notify").then(function (cc) { return cc.match("/__ftp_reminders"); }).then(function (r) { return r ? r.json() : []; }).then(function (rs) {
      var today = new Date().toISOString().slice(0, 10);   // on-device drill / radio-test reminders mirrored here by the page
      (rs || []).forEach(function (x) { if (x.due && x.due <= today) out.push({ id: "rem:" + x.id + ":" + x.due, title: x.title + " is due", body: x.body || "Due " + x.due + ". Tap to log it.", tag: "rem-" + x.id, url: base + (x.hash || "#prep"), level: "Info", cls: "info", cat: "infra" }); });
    }).catch(function () {});
    return Promise.all([p1, p2, p3, p4, p5, p6, p7]).then(function () { return out; });
  }

  // de-dup state lives in Cache Storage so the page and the service worker share it
  var KEY = "/__ftp_notify_state";
  function loadState() { return caches.open("ftp-notify").then(function (c) { return c.match(KEY); }).then(function (r) { return r ? r.json() : { seen: {} }; }).catch(function () { return { seen: {} }; }); }
  function saveState(s) { return caches.open("ftp-notify").then(function (c) { return c.put(KEY, new Response(JSON.stringify(s), { headers: { "Content-Type": "application/json" } })); }); }

  // collect, drop already-notified ids, remember the rest (kept 7 days); first run only records (no flood of old items)
  function fresh(fetchFn, base) {
    return Promise.all([collect(fetchFn, base), loadState(), prefs()]).then(function (r) {
      var items = r[0], st = r[1], p = r[2], now = Date.now(), first = !st.init, nw = [];
      Object.keys(st.seen).forEach(function (k) { if (now - st.seen[k] > 7 * 864e5) delete st.seen[k]; });
      items.forEach(function (it) { if (!st.seen[it.id]) { st.seen[it.id] = now; if (!first && allowed(it, p)) nw.push(it); } });
      st.init = true; st.last = now;
      return saveState(st).then(function () { return { items: items, fresh: nw, first: first }; });
    });
  }
  g.FTPNotify = { collect: collect, fresh: fresh, allowed: allowed, nwsCat: nwsCat, NWS_EVENTS: NWS_EVENTS, SEVERE_EVENTS: SEVERE_EVENTS, ZONES: ZONES, aqiCat: aqiCat, AQI_URL: AQI_URL };
})(typeof self !== "undefined" ? self : window);
