/* Shared alert rules for the page and the service worker (importScripts). Mirrored in fetch_feeds.py notify().
   Fires for: a threat in data.json at High or Severe (new, or newly raised), an NWS alert in our zones whose event is
   in NWS_EVENTS (or severity Extreme), and USGS quakes M>=2.5 within 100 km of the metro or M>=4.0 within 300 km of New Madrid,
   metro AQI >= 151 (Open-Meteo live; AirNow in fetch_feeds.py), and due on-device drill / radio-test reminders. */
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
          out.push({ id: "threat:" + t.id + ":" + t.level, title: t.level.toUpperCase() + ": " + t.name, body: (t.summary || "").slice(0, 180), tag: "threat-" + t.id, url: base + "#board", level: t.level });
      });
    }).catch(function () {});
    var p2 = j(fetchFn, loc ? "https://api.weather.gov/alerts/active?point=" + loc.lat + "," + loc.lon : "https://api.weather.gov/alerts/active?zone=" + ZONES, { Accept: "application/geo+json" }).then(function (d) {
      (d.features || []).forEach(function (f) {
        var p = f.properties;
        if (NWS_EVENTS.indexOf(p.event) >= 0 || p.severity === "Extreme")
          out.push({ id: "nws:" + p.id, title: p.event, body: (p.headline || p.areaDesc || "").slice(0, 180), tag: "nws-" + p.event, url: base + (SEVERE_EVENTS.indexOf(p.event) >= 0 ? "#severe" : "#alerts"), level: "Severe" });
      });
    }).catch(function () {});
    var p3 = j(fetchFn, "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=" + (loc ? here[0] : NEW_MADRID[0]) + "&longitude=" + (loc ? here[1] : NEW_MADRID[1]) + "&maxradiuskm=300&minmagnitude=2.5&starttime=" + since).then(function (d) {
      (d.features || []).forEach(function (f) {
        var c = f.geometry.coordinates, m = f.properties.mag || 0;
        if ((m >= 2.5 && km(c[1], c[0], here[0], here[1]) <= 100) || (m >= 4 && km(c[1], c[0], loc ? here[0] : NEW_MADRID[0], loc ? here[1] : NEW_MADRID[1]) <= 300))
          out.push({ id: "usgs:" + f.id, title: "M" + m.toFixed(1) + " earthquake", body: f.properties.place + " · " + new Date(f.properties.time).toLocaleString("en-US", { timeZone: "America/Chicago" }) + " CT", tag: "usgs-" + f.id, url: base + "#alerts", level: m >= 4.5 ? "Severe" : "High" });
      });
    }).catch(function () {});
    var p4 = j(fetchFn, loc ? AQI_URL.replace("latitude=38.63&longitude=-90.2", "latitude=" + here[0] + "&longitude=" + here[1]).replace("timezone=America%2FChicago", "timezone=auto") : AQI_URL).then(function (d) {   // AQI 151+ (Unhealthy) for the metro, once per day per category
      var c = d.current || {}, a = c.us_aqi;
      if (a >= 151) {
        var what = (c.us_aqi_pm2_5 || 0) >= (c.us_aqi_ozone || 0) ? "fine particles (PM2.5, often smoke)" : "ozone";
        out.push({ id: "aqi:" + String(c.time || "").slice(0, 10) + ":" + aqiCat(a), title: "Air quality " + aqiCat(a) + " (AQI " + a + ")", body: where + ", driven by " + what + ". Limit time outdoors; open the app for smoke/ozone steps.", tag: "aqi", url: base + "#prep-air", level: a >= 201 ? "Severe" : "High" });
      }
    }).catch(function () {});
    var p5 = caches.open("ftp-notify").then(function (cc) { return cc.match("/__ftp_reminders"); }).then(function (r) { return r ? r.json() : []; }).then(function (rs) {
      var today = new Date().toISOString().slice(0, 10);   // on-device drill / radio-test reminders mirrored here by the page
      (rs || []).forEach(function (x) { if (x.due && x.due <= today) out.push({ id: "rem:" + x.id + ":" + x.due, title: x.title + " is due", body: x.body || "Due " + x.due + ". Tap to log it.", tag: "rem-" + x.id, url: base + (x.hash || "#prep"), level: "Info" }); });
    }).catch(function () {});
    return Promise.all([p1, p2, p3, p4, p5]).then(function () { return out; });
  }

  // de-dup state lives in Cache Storage so the page and the service worker share it
  var KEY = "/__ftp_notify_state";
  function loadState() { return caches.open("ftp-notify").then(function (c) { return c.match(KEY); }).then(function (r) { return r ? r.json() : { seen: {} }; }).catch(function () { return { seen: {} }; }); }
  function saveState(s) { return caches.open("ftp-notify").then(function (c) { return c.put(KEY, new Response(JSON.stringify(s), { headers: { "Content-Type": "application/json" } })); }); }

  // collect, drop already-notified ids, remember the rest (kept 7 days); first run only records (no flood of old items)
  function fresh(fetchFn, base) {
    return Promise.all([collect(fetchFn, base), loadState()]).then(function (r) {
      var items = r[0], st = r[1], now = Date.now(), first = !st.init, nw = [];
      Object.keys(st.seen).forEach(function (k) { if (now - st.seen[k] > 7 * 864e5) delete st.seen[k]; });
      items.forEach(function (it) { if (!st.seen[it.id]) { st.seen[it.id] = now; if (!first) nw.push(it); } });
      st.init = true; st.last = now;
      return saveState(st).then(function () { return { items: items, fresh: nw, first: first }; });
    });
  }
  g.FTPNotify = { collect: collect, fresh: fresh, NWS_EVENTS: NWS_EVENTS, SEVERE_EVENTS: SEVERE_EVENTS, ZONES: ZONES, aqiCat: aqiCat, AQI_URL: AQI_URL };
})(typeof self !== "undefined" ? self : window);
