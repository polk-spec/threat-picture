/* v10 extras: push alerts (Alerts tab), river gauges, supply tracker, help-nearby finder (Prep tab).
   Personal data (supplies, ntfy topic, alert switch) stays on this device only (localStorage / Cache Storage). */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function ct(t) { var d = new Date(t); if (isNaN(d)) return ""; return d.toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " CT"; }
  function km(a, b, c, d) { var r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2); return 12742 * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y)); }
  var BASE = location.href.replace(/[#?].*$/, "").replace(/[^/]*$/, "");
  var feeds = null, places = null;
  function getFeeds() { return feeds ? Promise.resolve(feeds) : fetch("feeds.json").then(function (r) { return r.json(); }).then(function (d) { feeds = d; return d; }).catch(function () { return {}; }); }
  function getPlaces() { return places ? Promise.resolve(places) : fetch("places.json").then(function (r) { return r.json(); }).then(function (d) { places = d; window.ftpPlaces = d; return d; }).catch(function () { return null; }); }

  // ---------- 1. Push alerts ----------
  var IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var STANDALONE = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  var K_N = "ftp-private-alerts";
  function notifOn() { return load(K_N, {}).on === true && "Notification" in window && Notification.permission === "granted"; }
  function setFlag(on) { return caches.open("ftp-notify").then(function (c) { return on ? c.put("/__ftp_notify_on", new Response("1")) : c.delete("/__ftp_notify_on"); }); }
  function alertsCard() {
    var st = load(K_N, {}), supported = "Notification" in window && "serviceWorker" in navigator;
    var status = !supported ? (IOS && !STANDALONE ? "On iPhone/iPad, add this app to the Home Screen first (Share > Add to Home Screen), then open it from there." : "This browser does not support notifications.")
      : Notification.permission === "denied" ? "Notifications are blocked for this site in browser settings."
      : notifOn() ? "On. Checking every 5 minutes while the app is open" + ("periodicSync" in (self.ServiceWorkerRegistration ? ServiceWorkerRegistration.prototype : {}) ? ", plus background checks about hourly on this device." : ".")
      : "Off.";
    return '<section class="prep alerts-card" id="push-card"><h2>Push alerts</h2>' +
      '<p>Notifies you when a threat reaches <b>High</b> or <b>Severe</b>, when NWS issues a tornado, severe thunderstorm, flash flood, or civil-emergency type alert for our zones (tapping it opens severe weather mode), when metro air quality reaches <b>AQI 151+</b>, when a quake hits near the metro (M2.5+ within 100 km) or the New Madrid zone (M4+), and when an on-device drill or radio test comes due.</p>' +
      '<div class="row-btns"><button type="button" class="small-btn primary" id="push-toggle"' + (supported ? "" : " disabled") + ">" + (notifOn() ? "Turn alerts off" : "Enable alerts") + '</button>' +
      (notifOn() ? '<button type="button" class="small-btn" id="push-test">Send test</button>' : "") + "</div>" +
      '<p class="d" id="push-status">' + esc(status) + (st.last ? " Last check " + esc(ct(st.last)) + "." : "") + "</p>" +
      '<details class="ntfy"><summary>Background push when the app is closed (free, via ntfy)</summary>' +
      '<p>Browsers only check while the app is open (Android Chrome also checks about hourly in the background). For alerts with the app closed, install the free <a href="https://ntfy.sh/" target="_blank" rel="noopener">ntfy app</a> and subscribe to the family\'s private alert channel (ask whoever set up this app for the name). Alerts go out on each twice-daily update. Save the topic here to get a one-tap subscribe link (kept on this device only).</p>' +
      '<label class="ci-note">Private ntfy topic<input id="ntfy-topic" autocomplete="off" spellcheck="false" value="' + esc(st.topic || "") + '" placeholder="paste the topic name"></label>' +
      (st.topic ? '<div class="row-btns"><a class="btn-link" href="https://ntfy.sh/' + esc(encodeURIComponent(st.topic)) + '" target="_blank" rel="noopener">Open topic in ntfy</a></div>' : "") + "</details>" +
      '<p class="d">iPhone/iPad: web notifications need iOS 16.4+ and the app added to the Home Screen and opened from there. Twice-daily refreshes mean ntfy alerts can lag up to about 12 hours for slow-moving items; NWS/quake checks in the open app run every 5 minutes.</p></section>';
  }
  function renderAlertsCard() { var r = $("push-root"); if (r) r.innerHTML = alertsCard(); }
  function check(show) {
    if (!notifOn() || !window.FTPNotify) return Promise.resolve();
    return window.FTPNotify.fresh(fetch.bind(window), BASE).then(function (r) {
      var st = load(K_N, {}); st.last = Date.now(); save(K_N, st);
      return navigator.serviceWorker.ready.then(function (reg) {
        r.fresh.slice(0, 5).forEach(function (it) { reg.showNotification(it.title, { body: it.body, tag: it.tag, icon: "icons/icon-192.png", badge: "icons/favicon-32.png", data: { url: it.url }, requireInteraction: it.level === "Severe" }); });
        if (show) $("push-status") && ($("push-status").textContent = "Checked: " + r.items.length + " item(s) currently qualify, " + r.fresh.length + " new.");
      });
    }).catch(function () {});
  }
  var timer = null;
  function loop() { clearInterval(timer); if (notifOn()) { check(); timer = setInterval(function () { if (document.visibilityState === "visible") check(); }, 5 * 60e3); } }
  function enable() {
    Notification.requestPermission().then(function (p) {
      if (p !== "granted") { renderAlertsCard(); return; }
      var st = load(K_N, {}); st.on = true; save(K_N, st);
      return setFlag(true).then(function () { return navigator.serviceWorker.ready; }).then(function (reg) {
        if (reg.periodicSync) reg.periodicSync.register("ftp-check", { minInterval: 60 * 60e3 }).catch(function () {});
        document.addEventListener("ftp-refresh", function () {
    feeds = window.ftpLive && window.ftpLive.feeds && window.ftpLive.feeds.data || null;
    if ($("health-news-root") && $("health-news-root").innerHTML) renderSources();
    if ($("prep-help") || !document.querySelector('[data-panel="prep"]').hidden) renderPrep();
  });
  renderAlertsCard(); loop(); renderSources();
      });
    });
  }
  function disable() {
    var st = load(K_N, {}); st.on = false; save(K_N, st); setFlag(false); clearInterval(timer);
    navigator.serviceWorker.ready.then(function (reg) { if (reg.periodicSync) reg.periodicSync.unregister("ftp-check").catch(function () {}); });
    renderAlertsCard();
  }

  // ---------- 2. River gauges ----------
  function chart(g) {
    var pts = g.observed.map(function (p) { return [Date.parse(p[0]), p[1], 0]; }).concat(g.forecast.map(function (p) { return [Date.parse(p[0]), p[1], 1]; }));
    if (pts.length < 2) return "";
    var W = 320, H = 110, P = 26, xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    var fl = g.flood || {}; Object.keys(fl).forEach(function (k) { if (k === "minor" || k === "action") ys.push(fl[k]); });
    var x0 = Math.min.apply(0, xs), x1 = Math.max.apply(0, xs), y0 = Math.floor(Math.min.apply(0, ys) - 1), y1 = Math.ceil(Math.max.apply(0, ys) + 1);
    var X = function (t) { return P + (t - x0) / (x1 - x0 || 1) * (W - P - 6); }, Y = function (v) { return H - 16 - (v - y0) / (y1 - y0 || 1) * (H - 24); };
    var line = function (arr) { return arr.map(function (p, i) { return (i ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1); }).join(""); };
    var obs = pts.filter(function (p) { return !p[2]; }), fc = pts.filter(function (p) { return p[2]; });
    if (obs.length && fc.length) fc.unshift(obs[obs.length - 1]);
    var bands = "";
    [["action", "#e0b030", "Action", 0], ["minor", "#e8762c", "Flood", 1], ["moderate", "#e04848", "Mod", 2]].forEach(function (b) {
      var v = fl[b[0]]; if (v == null || v > y1 + 2) return;
      var tx = [P + 40, W - 8, W - 70][b[3]], anc = b[3] === 0 ? "start" : "end";  // stagger labels so close bands don't overlap
      bands += '<line x1="' + P + '" x2="' + (W - 6) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" stroke="' + b[1] + '" stroke-dasharray="4 3"/><text x="' + tx + '" y="' + (Y(v) - 3).toFixed(1) + '" fill="' + b[1] + '" font-size="9" text-anchor="' + anc + '">' + b[2] + " " + v + " ft</text>";
    });
    var nowX = X(Date.now());
    return '<svg class="hydro" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Stage chart for ' + esc(g.name) + '">' +
      '<text x="2" y="' + (Y(y1) + 8) + '" font-size="9" fill="#8a9a93">' + y1 + ' ft</text><text x="2" y="' + Y(y0) + '" font-size="9" fill="#8a9a93">' + y0 + " ft</text>" + bands +
      (nowX > P && nowX < W ? '<line x1="' + nowX + '" x2="' + nowX + '" y1="6" y2="' + (H - 16) + '" stroke="#55615c"/><text x="' + nowX + '" y="' + (H - 4) + '" font-size="9" fill="#8a9a93" text-anchor="middle">now</text>' : "") +
      '<path d="' + line(obs) + '" fill="none" stroke="#8cc8ff" stroke-width="2"/>' + (fc.length > 1 ? '<path d="' + line(fc) + '" fill="none" stroke="#8cc8ff" stroke-width="2" stroke-dasharray="5 4"/>' : "") + "</svg>";
  }
  function riversHtml(f, live) {
    var g = (f.gauges || {}).items || [], h2 = "<h2>Rivers &amp; flood gauges" + (f.near ? " near " + esc(f.near) : "") + "</h2>";
    if (!g.length) return '<section class="prep" id="prep-rivers">' + h2 + '<p class="d">' + (f.near ? (f.err ? "NOAA river gauges are unavailable right now." : "No NOAA river gauges with current readings within about 50 miles.") : "Gauge data not loaded yet.") + "</p></section>";
    return '<section class="prep" id="prep-rivers">' + h2 + '<div class="src-line">' + (live ? "Live from NOAA river gauges" : "Updated " + esc(ct(f.generated)) + " (updated twice daily)") + '</div>' +
      g.map(function (x) {
        var fs = x.flood && x.flood.minor, cat = (x.category || "").replace(/_/g, " "), peak = x.forecast.length ? Math.max.apply(0, x.forecast.map(function (p) { return p[1]; })) : null;
        var cls = /major|moderate/.test(cat) ? "sev" : /minor/.test(cat) ? "high" : /action/.test(cat) ? "elev" : "ok";
        return '<div class="gauge"><div class="g-head"><b>' + esc(x.name) + '</b><span class="pill g-' + cls + '">' + esc(cat || "n/a") + "</span></div>" +
          '<div class="g-now"><span class="big">' + (x.now != null ? x.now.toFixed(1) : "–") + ' ft</span> <span class="d">' + esc(ct(x.nowAt)) + "</span></div>" +
          '<div class="d">' + (fs ? "Flood stage " + fs + " ft" + (x.now != null ? " · " + (fs - x.now).toFixed(1) + " ft below" : "") : "NWS has not set a flood stage here; watch the trend.") +
          (peak != null ? " · forecast peak " + peak.toFixed(1) + " ft" : "") + "</div>" + chart(x) +
          '<a class="d" href="' + esc(x.url) + '" target="_blank" rel="noopener">NOAA gauge page ↗</a>' + (x.usgs ? ' · <a class="d" href="https://waterdata.usgs.gov/monitoring-location/USGS-' + esc(x.usgs) + '/" target="_blank" rel="noopener">USGS ' + esc(x.usgs) + " ↗</a>" : "") + "</div>";
      }).join("") + '<p class="d">Solid line: observed. Dashed: NWS forecast. Dashed bands: action / flood / moderate stages.</p></section>';
  }
  function liveGauges(f) {   // refresh observed values from NWPS (CORS-open); keeps the box copy if offline
    var g = (f.gauges || {}).items || [];
    return Promise.all(g.map(function (x) {
      return fetch("https://api.water.noaa.gov/nwps/v1/gauges/" + x.lid + "/stageflow").then(function (r) { return r.json(); }).then(function (sf) {
        var o = (sf.observed && sf.observed.data || []).filter(function (p) { return p.primary > -999; });
        if (o.length) { x.observed = o.slice(-96).map(function (p) { return [p.validTime, p.primary]; }); x.now = o[o.length - 1].primary; x.nowAt = o[o.length - 1].validTime; }
        var fc = (sf.forecast && sf.forecast.data || []).filter(function (p) { return p.primary > -999; });
        if (fc.length) x.forecast = fc.map(function (p) { return [p.validTime, p.primary]; });
        return true;
      });
    })).then(function () { return true; }, function () { return false; });
  }

  // away from home (location switcher): find NOAA gauges around the chosen place by bounding box (NWPS, CORS-open)
  function awayGauges() {
    var L0 = FTPLoc.get(), b = FTPLoc.bbox(0.6, 0.8);
    return fetch("https://api.water.noaa.gov/nwps/v1/gauges?bbox.xmin=" + b[0] + "&bbox.ymin=" + b[1] + "&bbox.xmax=" + b[2] + "&bbox.ymax=" + b[3] + "&srid=EPSG_4326")
      .then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) {
        var gs = (d.gauges || []).filter(function (x) { var o = x.status && x.status.observed; return o && o.primary > -999 && Date.now() - Date.parse(o.validTime) < 3 * 864e5; })
          .map(function (x) { return { x: x, d: km(L0.lat, L0.lon, x.latitude, x.longitude) }; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 6);
        return Promise.all(gs.map(function (o) {
          var x = o.x, it = { lid: x.lid, name: x.name, now: x.status.observed.primary, nowAt: x.status.observed.validTime, category: x.status.observed.floodCategory || "", flood: {}, forecast: [], observed: [],
            url: "https://water.noaa.gov/gauges/" + String(x.lid).toLowerCase() };
          return fetch("https://api.water.noaa.gov/nwps/v1/gauges/" + x.lid).then(function (r) { return r.json(); }).then(function (g) {
            var c = (g.flood && g.flood.categories) || {}; ["action", "minor", "moderate", "major"].forEach(function (k) { if (c[k] && c[k].stage > -999) it.flood[k] = c[k].stage; });
            if (g.usgsId) it.usgs = g.usgsId; return it; }).catch(function () { return it; });
        })).then(function (items) { return { near: L0.label, generated: new Date().toISOString(), gauges: { items: items } }; });
      }).catch(function () { return { near: L0.label, err: true, gauges: { items: [] } }; });
  }
  // away: national HIFLD hospital list (static file, filtered on this phone) + live FEMA open shelters near the place
  var hospUS = null;
  function awayHelp() {
    var L0 = FTPLoc.get(), b = FTPLoc.bbox(1.0, 1.3);
    var hp = hospUS ? Promise.resolve(hospUS) : fetch("hospitals-us.json").then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) { hospUS = d; return d; }).catch(function () { return null; });
    var sp = fetch("https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/FeatureServer/0/query?where=1%3D1&outFields=*&f=json&outSR=4326&geometryType=esriGeometryEnvelope&inSR=4326&geometry=" + b.join("%2C"))
      .then(function (r) { return r.json(); }).then(function (d) { return (d.features || []).map(function (ft) { var a = ft.attributes; a.lat = ft.geometry.y; a.lng = ft.geometry.x; return a; }); }).catch(function () { return null; });
    return Promise.all([hp, sp]).then(function (r) {
      var H = r[0], items = [];
      if (H) items = H.rows.filter(function (x) { return Math.abs(x[8] - L0.lat) < 1.2 && Math.abs(x[9] - L0.lon) < 1.6; }).map(function (x) {
        return { name: x[0], address: x[1] + ", " + x[2] + ", " + x[3] + " " + x[4], phone: x[5], type: x[6], trauma: x[7], status: "Open", lat: x[8], lng: x[9] }; });
      window.ftpAwayHospitals = items;
      return [{ away: true, hospitals: { items: items, source: H ? H.source : "HIFLD hospital list (unavailable offline)", url: H ? H.url : "#" },
        cooling: { items: [], note: "", url: "https://www.211.org/" }, warming: { note: "", url: "https://www.211.org/" } },
        { generated: new Date().toISOString(), shelters: { items: r[1] || [] }, sheltersErr: !r[1] }];
    });
  }
  function helpData() { return window.FTPLoc && !FTPLoc.isHome() ? awayHelp() : Promise.all([getPlaces(), getFeeds()]); }
  function paintHelp() { helpData().then(function (r) { var hr = $("help-root"); if (hr) hr.innerHTML = helpHtml(r[0], r[1]); }); }

  // ---------- 5. Supply tracker ----------
  var K_S = "ftp-private-supplies";
  var SUP = [
    { id: "water", name: "Water", unit: "gal", per: 1, perLabel: "gal per person per day", person: true },
    { id: "food", name: "Food", unit: "person-days", per: 1, perLabel: "person-day per person per day", person: true },
    { id: "meds", name: "Meds (shortest Rx)", unit: "days", per: 1, perLabel: "day per day", person: false },
    { id: "fuel", name: "Fuel (stored)", unit: "gal", per: 2, perLabel: "gal per day (generator/vehicle)", person: false },
    { id: "batt", name: "Batteries (AA/AAA)", unit: "count", per: 2, perLabel: "per day (radio, lights)", person: false }
  ];
  function supState() {
    var r = load("ftp-private-readiness", {}), s = load(K_S, null);
    if (!s) s = { people: r.people || 4, items: {} };
    s.target = r.target || 14; return s;
  }
  function supplyHtml() {
    var s = supState(), P = Math.max(1, +s.people || 1), now = Date.now(), minD = Infinity;
    var rows = SUP.map(function (it) {
      var v = s.items[it.id] || {}, qty = +v.qty || 0, per = v.per != null && v.per !== "" ? +v.per : it.per, use = it.person ? per * P : per;
      var days = use > 0 ? qty / use : 0; minD = Math.min(minD, days);
      var exp = v.exp ? Date.parse(v.exp) : null, ed = exp ? Math.round((exp - now) / 864e5) : null;
      var flag = ed == null ? "" : ed < 0 ? '<span class="pill g-sev">EXPIRED</span>' : ed <= 60 ? '<span class="pill g-high">expires in ' + ed + " d</span>" : '<span class="pill g-ok">good to ' + esc(v.exp) + "</span>";
      var cls = days >= s.target ? "ok" : days >= s.target / 2 ? "elev" : "sev";
      return '<div class="sup" data-id="' + it.id + '"><div class="sup-h"><b>' + esc(it.name) + '</b><span class="sup-days g-' + cls + '">' + (days >= 999 ? "999+" : days.toFixed(days < 10 ? 1 : 0)) + " days</span></div>" +
        '<div class="sup-f"><label>On hand (' + esc(it.unit) + ')<input type="number" min="0" step="any" inputmode="decimal" data-f="qty" value="' + esc(v.qty == null ? "" : v.qty) + '"></label>' +
        '<label>Use: ' + esc(it.perLabel) + '<input type="number" min="0" step="any" inputmode="decimal" data-f="per" value="' + esc(v.per == null ? it.per : v.per) + '"></label>' +
        '<label>Earliest expiration<input type="date" data-f="exp" value="' + esc(v.exp || "") + '"></label></div><div class="sup-flag">' + flag + "</div></div>";
    }).join("");
    var overall = isFinite(minD) ? minD : 0, oc = overall >= s.target ? "ok" : overall >= s.target / 2 ? "elev" : "sev";
    return '<section class="prep" id="prep-supplies"><h2>Supply tracker</h2><div class="sup-top"><label>People in household<input type="number" min="1" max="20" id="sup-people" value="' + P + '"></label>' +
      '<div class="sup-score g-' + oc + '"><span class="big">' + (overall >= 999 ? "999+" : overall.toFixed(overall < 10 ? 1 : 0)) + '</span> days covered<br><span class="d">limited by the shortest item · target ' + s.target + " days (set in Readiness)</span></div></div>" +
      rows + '<p class="d">Stored only on this device. Water: 1 gal per person per day (Ready.gov). Flags show items expired or expiring within 60 days.</p></section>';
  }
  function saveSupply(el) {
    var s = load(K_S, null) || supState();
    if (el.id === "sup-people") { s.people = Math.max(1, Math.min(20, +el.value || 1)); var r = load("ftp-private-readiness", null); if (r) { r.people = s.people; save("ftp-private-readiness", r); } }
    else { var row = el.closest(".sup"), id = row.getAttribute("data-id"), f = el.getAttribute("data-f"); s.items[id] = s.items[id] || {}; s.items[id][f] = f === "exp" ? el.value : el.value === "" ? null : +el.value; }
    delete s.target; save(K_S, s);
    var old = $("prep-supplies"), tmp = document.createElement("div"); tmp.innerHTML = supplyHtml(); old.replaceWith(tmp.firstChild);
  }

  // ---------- 7. Help nearby ----------
  var here = null, helpKind = load("ftp-help-kind", "hospitals");
  function helpHtml(pl, f) {
    var shelters = ((f.shelters || {}).items || []);
    var heat = (window.ftpLive && window.ftpLive.nws && window.ftpLive.nws.data && window.ftpLive.nws.data.features || []).map(function (x) { return x.properties.event; });
    var hot = heat.some(function (e) { return /Extreme Heat|Excessive Heat|Heat Advisory/.test(e); }), cold = heat.some(function (e) { return /Extreme Cold|Wind Chill|Cold Weather Advisory/.test(e); });
    var away = pl && pl.away, L0 = window.FTPLoc && FTPLoc.get();
    var origin = here || (away ? [L0.lat, L0.lon] : [38.627, -90.199]), items = [], meta = {};
    if (!pl) return '<section class="prep" id="prep-help"><h2>Help nearby</h2><p class="d">Facility list not loaded yet.</p></section>';
    if (helpKind === "hospitals") { items = pl.hospitals.items; meta = pl.hospitals; }
    if (helpKind === "cooling") { items = pl.cooling.items; meta = pl.cooling; }
    if (helpKind === "shelters") { items = shelters.map(function (s) { return { name: s.shelter_name, address: [s.address, s.city, s.state].filter(Boolean).join(", "), lat: s.lat, lng: s.lng, status: s.shelter_status, extra: [s.org_name, s.total_population != null ? "pop " + s.total_population + "/" + (s.evacuation_capacity || "?") : "", s.pet_accommodations_code ? "pets: " + s.pet_accommodations_code : ""].filter(Boolean).join(" · ") }; }); meta = f.shelters || {}; }
    var list = items.map(function (x) { return Object.assign({ d: x.lat != null ? km(origin[0], origin[1], x.lat, x.lng) : 9999 }, x); }).sort(function (a, b) { return a.d - b.d; }).slice(0, helpKind === "cooling" ? 25 : 20);
    var statusLine = helpKind === "cooling" && away ? '<p class="d stl-note">Cooling and warming center lists: St. Louis area only. Call 2-1-1 or visit <a href="https://www.211.org/" target="_blank" rel="noopener">211.org ↗</a> for sites near ' + esc(L0.label) + ".</p>"
      : helpKind === "shelters" && away ? '<p class="d">' + (f.sheltersErr ? "FEMA shelter list unavailable right now." : shelters.length ? shelters.length + " open shelter(s) near " + esc(L0.label) + " (FEMA NSS, live)." : "No open Red Cross/FEMA shelters near " + esc(L0.label) + " right now (FEMA NSS, live). Shelters appear here when they open.") + "</p>"
      : helpKind === "hospitals" && away && !items.length ? '<p class="d">Hospital list unavailable (needs a connection once).</p>'
      : helpKind === "cooling" ? (hot ? '<p class="pill g-high">Heat alert in effect: cooling sites should be active. Call 2-1-1 to confirm.</p>' : '<p class="d">No NWS heat alert now, so cooling sites are not activated. ' + esc(pl.cooling.note) + "</p>") +
        '<p class="d">Warming centers: ' + (cold ? "<b>cold alert in effect</b>. " : "") + esc(pl.warming.note) + ' <a href="' + esc(pl.warming.url) + '" target="_blank" rel="noopener">2-1-1 warming search ↗</a></p>'
      : helpKind === "shelters" ? '<p class="d">' + (shelters.length ? shelters.length + " open shelter(s) in the region (FEMA NSS)." : "No open Red Cross/FEMA shelters in the region right now (FEMA NSS, updated " + esc(ct(f.generated)) + "). Shelters appear here when they open.") + "</p>"
      : '<p class="d">ER status is not published live; call 911 for emergencies. Listed status from ' + esc(pl.hospitals.source) + ".</p>";
    return '<section class="prep" id="prep-help"><h2>Help nearby</h2><div class="seg help-seg" role="group" aria-label="Facility type">' +
      [["hospitals", "Hospitals / ER"], ["shelters", "Shelters"], ["cooling", "Cooling / warming"]].map(function (k) { return '<button type="button" data-help="' + k[0] + '" aria-pressed="' + (helpKind === k[0]) + '">' + k[1] + "</button>"; }).join("") +
      '</div><div class="row-btns"><button type="button" class="small-btn" id="help-near">📍 Sort by my location (one time)</button><span class="d" id="help-from">' + (here ? "Sorted from your current location (not saved)." : away ? "Sorted from " + esc(L0.label) + "." : "Sorted from downtown St. Louis.") + "</span></div>" + statusLine +
      (list.length ? '<ol class="help-list">' + list.map(function (x) {
        return "<li><b>" + esc(x.name) + "</b>" + (x.trauma ? ' <span class="pill g-elev">Trauma ' + esc(x.trauma) + "</span>" : "") + (x.status ? ' <span class="d">' + esc(x.status) + "</span>" : "") +
          '<div class="d">' + esc(x.address) + (x.d < 9999 ? " · " + (x.d * 0.621).toFixed(1) + " mi" : "") + "</div>" + (x.hours ? '<div class="d">' + esc(x.hours) + "</div>" : "") + (x.extra ? '<div class="d">' + esc(x.extra) + "</div>" : "") +
          '<div class="help-links">' + (x.phone ? '<a href="tel:' + esc(x.phone.replace(/[^0-9+]/g, "")) + '">Call ' + esc(x.phone) + "</a>" : "") +
          '<a href="https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(x.address) + '" target="_blank" rel="noopener">Directions ↗</a>' +
          (x.phoneSource ? '<a href="' + esc(x.phoneSource) + '" target="_blank" rel="noopener">Official contact ↗</a>' : "") +
          (x.lat != null ? '<a href="#" data-mapto="' + x.lat + "," + x.lng + '">On map</a>' : "") + "</div></li>";
      }).join("") + "</ol>" : "") + '<p class="d">Source: <a href="' + esc(meta.url || "#") + '" target="_blank" rel="noopener">' + esc(meta.source || "") + " ↗</a></p></section>";
  }

  // ---------- render / wiring ----------
  function dayOnly(t) { var d = new Date(t); return isNaN(d) ? "" : d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }); }
  function healthNewsHtml(f) {
    var h = f.healthNews || {}, it = h.items || [];
    var err = f.errors && f.errors.healthNews;
    return '<section class="feed"><div class="feed-h"><span class="t">Health-threat news · UC Davis Health (updated twice daily)</span><span class="s off">' +
      esc(f.generated ? "Updated " + ct(f.generated) : "Unavailable") + "</span></div>" +
      (it.length ? "<ul>" + it.map(function (x) {
        return '<li><a href="' + esc(/^https:\/\//.test(x.url) ? x.url : "#") + '" target="_blank" rel="noopener"><b>' + esc(x.title) + '</b><div class="d">' + esc(dayOnly(x.date)) + "</div>" +
          (x.summary ? '<div class="d">' + esc(x.summary) + "</div>" : "") + "</a></li>";
      }).join("") + "</ul>" : '<div class="none">' + esc(err ? "Feed unavailable on the last refresh." : "No health-threat items in the latest feed.") + "</div>") +
      '<p class="hint">Filtered from the UC Davis Health newsroom RSS to infections, outbreaks and environmental health risks. News and research, not official alerts; CDC and IDPH/MO DHSS are the authorities.</p>' +
      '<a class="foot-link" href="https://health.ucdavis.edu/news/" target="_blank" rel="noopener">UC Davis Health News ↗</a></section>';
  }
  function renderSources() { var r = $("health-news-root"); if (r) getFeeds().then(function (f) { r.innerHTML = healthNewsHtml(f || {}); }); }
  function renderPrep() {
    getFeeds().then(function (f) {
      var rr = $("rivers-root"), sr = $("supply-root"), hr = $("help-root");
      if (sr && !$("prep-supplies")) sr.innerHTML = supplyHtml();
      if (rr && window.FTPLoc && !FTPLoc.isHome()) { rr.innerHTML = '<section class="prep" id="prep-rivers"><h2>Rivers &amp; flood gauges</h2><p class="d">Finding NOAA gauges near ' + esc(FTPLoc.get().label) + "…</p></section>";
        awayGauges().then(function (g) { if (!g.gauges.items.length) { rr.innerHTML = riversHtml(g, true); return; } liveGauges(g).then(function () { rr.innerHTML = riversHtml(g, true); }); }); }
      else if (rr) { rr.innerHTML = riversHtml(f, false); liveGauges(f).then(function (ok) { if (ok) rr.innerHTML = riversHtml(f, true); }); }
      if (hr) paintHelp();
    });
  }
  document.addEventListener("click", function (e) {
    var t = e.target;
    var tab = t.closest("[data-tab]");
    if (tab && tab.getAttribute("data-tab") === "prep") setTimeout(renderPrep, 0);
    if (tab && tab.getAttribute("data-tab") === "alerts") setTimeout(renderAlertsCard, 0);
    if (tab && tab.getAttribute("data-tab") === "sources") setTimeout(renderSources, 0);
    if (t.id === "push-toggle") { if (notifOn()) disable(); else enable(); }
    if (t.id === "push-test") navigator.serviceWorker.ready.then(function (reg) { reg.showNotification("Test alert", { body: "Family Threat Picture alerts are working on this device.", icon: "icons/icon-192.png", tag: "ftp-test", data: { url: BASE } }); });
    var hk = t.closest("[data-help]"); if (hk) { helpKind = hk.getAttribute("data-help"); save("ftp-help-kind", helpKind); paintHelp(); }
    if (t.id === "help-near" && navigator.geolocation) {
      $("help-from").textContent = "Getting your location…";
      navigator.geolocation.getCurrentPosition(function (p) { here = [p.coords.latitude, p.coords.longitude]; paintHelp(); },
        function () { $("help-from").textContent = "Location unavailable; sorted from downtown St. Louis."; }, { timeout: 15000, maximumAge: 300000 });
    }
    var mt = t.closest("[data-mapto]");
    if (mt) { e.preventDefault(); var ll = mt.getAttribute("data-mapto").split(",").map(Number); document.querySelector('[data-tab="map"]').click(); setTimeout(function () { if (window.ftpMapTo) window.ftpMapTo(ll, helpKind); }, 300); }
  });
  document.addEventListener("change", function (e) {
    if (e.target.closest("#prep-supplies")) saveSupply(e.target);
    if (e.target.id === "ntfy-topic") { var st = load(K_N, {}); st.topic = e.target.value.trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64); save(K_N, st); renderAlertsCard(); }
  });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && notifOn()) check(); });
  // deep links from notifications (#alerts, #board, …)
  var h = (location.hash || "").slice(1); if (h && document.querySelector('[data-tab="' + h + '"]')) setTimeout(function () { document.querySelector('[data-tab="' + h + '"]').click(); }, 400);
  document.addEventListener("ftp-loc", function () { here = null; if (!document.querySelector('[data-panel="prep"]').hidden || ($("rivers-root") && $("rivers-root").innerHTML)) renderPrep(); });
  document.addEventListener("ftp-refresh", function () {
    feeds = window.ftpLive && window.ftpLive.feeds && window.ftpLive.feeds.data || null;
    if ($("health-news-root") && $("health-news-root").innerHTML) renderSources();
    if ($("prep-help") || !document.querySelector('[data-panel="prep"]').hidden) renderPrep();
  });
  renderAlertsCard(); loop();
  window.ftpGetPlaces = getPlaces; window.ftpGetFeeds = getFeeds; window.ftpAlertCheck = check; window.ftpNotifOn = notifOn;
})();
