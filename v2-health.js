/* v2 core helpers + Source Health. Loaded FIRST (before app.js) so it can observe every fetch the app makes.
   It records, per source, the last attempt, last success, last failure and whether the answer was live or a saved
   offline copy. Only the time, status and source name are stored (localStorage "ftp-srchealth"); no response data,
   no location, nothing personal. Nothing is sent anywhere. */
(function () {
  "use strict";
  var V2 = window.V2 = window.V2 || {};
  V2.$ = function (id) { return document.getElementById(id); };
  V2.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  V2.load = function (k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } };
  V2.save = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  V2.ct = function (t, opt) {
    var d = new Date(t); if (!t || isNaN(d)) return "—";
    return d.toLocaleString("en-US", Object.assign({ timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, opt || {})) + " CT";
  };
  V2.ago = function (t) {
    var d = new Date(t).getTime(); if (!t || isNaN(d)) return "never";
    var m = Math.round((Date.now() - d) / 60000);
    if (m < 1) return "just now"; if (m < 60) return m + " min ago";
    var h = m / 60; if (h < 48) return (h < 10 ? h.toFixed(1) : Math.round(h)) + " h ago";
    return Math.round(h / 24) + " days ago";
  };
  V2.uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  V2.safeUrl = function (u) { return /^https?:\/\//i.test(u || "") ? u : "#"; };
  // CSP (script-src 'self') forbids inline handlers, so the old onsubmit="return false" lives here: no form in this app
  // ever submits to a server; Enter in a field must not reload the page.
  document.addEventListener("submit", function (e) { e.preventDefault(); }, true);

  // ---------- source registry ----------
  // staleH: hours after which data from this source is flagged stale. null = loaded on demand, never flagged.
  var SOURCES = [
    { id: "brief", name: "Threat brief (data.json)", kind: "Twice-daily brief", re: /\/data\.json(\?|$)/, staleH: 14, url: "data.json" },
    { id: "feeds", name: "Box feeds (feeds.json)", kind: "Twice-daily snapshot", re: /\/feeds\.json(\?|$)/, staleH: 14, url: "feeds.json" },
    { id: "nws", name: "NWS watches & warnings", kind: "Official alerts (live)", re: /api\.weather\.gov\/alerts/, staleH: 0.5, url: "https://www.weather.gov/" },
    { id: "nwsp", name: "NWS forecast, wind & zones", kind: "Official (live)", re: /api\.weather\.gov\/(points|gridpoints|zones|stations)/, staleH: 6, url: "https://www.weather.gov/" },
    { id: "usgs", name: "USGS earthquakes", kind: "Official (live)", re: /earthquake\.usgs\.gov/, staleH: 1, url: "https://earthquake.usgs.gov/" },
    { id: "fema", name: "OpenFEMA disaster declarations", kind: "Official (live)", re: /www\.fema\.gov\/api/, staleH: 24, url: "https://www.fema.gov/openfema" },
    { id: "nss", name: "FEMA open shelters (NSS)", kind: "Official (live)", re: /gis\.fema\.gov/, staleH: null, url: "https://gis.fema.gov/" },
    { id: "aqi", name: "Open-Meteo air quality (CAMS model)", kind: "Model data (live)", re: /air-quality-api\.open-meteo\.com/, staleH: 3, url: "https://open-meteo.com/" },
    { id: "geo", name: "Open-Meteo place search", kind: "Lookup (on demand)", re: /geocoding-api\.open-meteo\.com/, staleH: null, url: "https://open-meteo.com/" },
    { id: "nwps", name: "NOAA river gauges (NWPS)", kind: "Official (live)", re: /api\.water\.noaa\.gov/, staleH: 6, url: "https://water.noaa.gov/" },
    { id: "radar", name: "RainViewer radar frames", kind: "Imagery (live)", re: /rainviewer\.com/, staleH: null, url: "https://www.rainviewer.com/" },
    { id: "miso", name: "MISO grid demand", kind: "Operator data (live)", re: /misoenergy\.org/, staleH: null, url: "https://www.misoenergy.org/" },
    { id: "cams", name: "Camera list (cams-all.json)", kind: "Twice-daily snapshot", re: /\/cams-all\.json(\?|$)/, staleH: null, url: "cams-all.json" },
    { id: "hosp", name: "Hospital list (HIFLD snapshot)", kind: "Static reference", re: /\/hospitals-us\.json(\?|$)/, staleH: null, url: "hospitals-us.json" },
    { id: "places", name: "Cooling sites & hospitals (places.json)", kind: "Static reference", re: /\/places\.json(\?|$)/, staleH: null, url: "places.json" },
    { id: "roads", name: "IDOT road incidents & closures", kind: "Official (live)", re: /Illinois_Roadway_Incidents/, staleH: 1, url: "https://www.gettingaroundillinois.com/" },
    { id: "osm", name: "OpenStreetMap nearby services (Overpass)", kind: "Lookup (on demand)", re: /overpass-api\.de|overpass\.kumi\.systems/, staleH: null, url: "https://www.openstreetmap.org/" }
  ];
  V2.SOURCES = SOURCES;
  var KH = "ftp-srchealth", H = V2.load(KH, {}), saveT = null;
  function persist() { clearTimeout(saveT); saveT = setTimeout(function () { V2.save(KH, H); }, 400); }
  function match(url) { for (var i = 0; i < SOURCES.length; i++) if (SOURCES[i].re.test(url)) return SOURCES[i]; return null; }
  function rec(src, field, extra) {
    var h = H[src.id] = H[src.id] || {}; h[field] = new Date().toISOString();
    if (extra) for (var k in extra) h[k] = extra[k];
    persist();
    if (field !== "attempt") document.dispatchEvent(new CustomEvent("ftp-health"));
  }
  V2.health = function () { return H; };

  // Wrap fetch once. Pure observation: the request and response are passed through untouched.
  if (window.fetch && !window.fetch.__v2) {
    var orig = window.fetch.bind(window);
    var wrapped = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var abs; try { abs = new URL(url, location.href).href; } catch (e) { abs = url; }
      var src = match(abs);
      if (!src) return orig(input, init);
      rec(src, "attempt");
      return orig(input, init).then(function (res) {
        var saved = !!(res.headers && res.headers.get("X-FTP-Saved"));
        var hh = H[src.id] || {};
        if (res.ok && !saved) rec(src, "ok", { last: "live", err: "", fails: 0 });
        else if (res.ok && saved) rec(src, "fail", { last: "cached", err: "Offline: served the saved copy", fails: (hh.fails || 0) + 1 });
        else rec(src, "fail", { last: "error", err: "HTTP " + res.status, fails: (hh.fails || 0) + 1 });
        return res;
      }, function (err) {
        rec(src, "fail", { last: "error", err: (err && err.name === "AbortError") ? "Timed out" : (navigator.onLine ? "Network error" : "Device offline"), fails: ((H[src.id] || {}).fails || 0) + 1 });
        throw err;
      });
    };
    wrapped.__v2 = true;
    window.fetch = wrapped;
  }

  // Age of the CONTENT (not just of the fetch) for sources that carry their own timestamp.
  function contentAge(id) {
    var d = window.ftpData && window.ftpData(), f = window.ftpLive && window.ftpLive.feeds && window.ftpLive.feeds.data;
    if (id === "brief" && d) return { at: d.updated, label: "Brief issued" };
    if (id === "feeds" && f) return { at: f.generated, label: "Snapshot built" };
    if (id === "cams" && f && f.camsAll) return { at: f.camsAll.generated, label: "Snapshot built" };
    return null;
  }
  function status(src) {
    var h = H[src.id] || {}, now = Date.now(), c = contentAge(src.id);
    var okAt = h.ok ? Date.parse(h.ok) : 0, failAt = h.fail ? Date.parse(h.fail) : 0;
    var ageBase = c && c.at ? Date.parse(c.at) : okAt;
    var ageH = ageBase ? (now - ageBase) / 36e5 : null;
    var st = "unused", txt = "Not used yet on this device";
    if (h.attempt && !okAt && !failAt) { st = "pending"; txt = "Checking…"; }
    if (okAt || failAt) {
      if (failAt > okAt) { st = okAt ? "cached" : "down"; txt = okAt ? "Using saved copy (last fetch failed: " + (h.err || "error") + ")" : "Unavailable: " + (h.err || "error"); }
      else { st = "live"; txt = "Live"; }
    }
    var stale = src.staleH != null && ageH != null && ageH > src.staleH;
    if (stale && st === "live") st = "stale";
    return { st: st, txt: txt, stale: stale, ageH: ageH, content: c, h: h };
  }
  V2.sourceStatus = status;
  // Spec colors: GREEN current data · YELLOW delayed (stale or saved copy) · RED unavailable
  V2.grade = function (st) { return st === "live" ? "GREEN" : (st === "stale" || st === "cached") ? "YELLOW" : st === "down" ? "RED" : ""; };
  V2.healthSummary = function () {
    var n = { live: 0, stale: 0, cached: 0, down: 0 }, used = 0;
    SOURCES.forEach(function (s) { var x = status(s); if (x.st === "unused" || x.st === "pending") return; used++; if (x.stale) n.stale++; else if (n[x.st] != null) n[x.st]++; });
    var worst = n.down ? "down" : (n.stale || n.cached) ? "warn" : used ? "ok" : "unused";
    return { n: n, used: used, worst: worst };
  };

  var BOX_FEEDS = [
    ["fuel", "AAA gas prices", function (f) { return f.fuel && f.fuel.checkedAt; }],
    ["ameren", "Ameren outages", function (f) { return f.ameren && f.ameren.generated; }],
    ["airnow", "AirNow St. Louis AQI", function () { return null; }],
    ["ipaws", "FEMA IPAWS (EAS) feed", function (f) { return f.ipaws && f.ipaws.feedUpdated; }],
    ["cisaKev", "CISA KEV catalog", function () { return null; }],
    ["cisaAdvisories", "CISA advisories", function () { return null; }],
    ["gauges", "NOAA gauges snapshot", function () { return null; }],
    ["miso", "MISO notifications", function () { return null; }],
    ["healthNews", "UC Davis health news", function () { return null; }],
    ["camsAll", "Camera list", function (f) { return f.camsAll && f.camsAll.generated; }]
  ];
  function pill(st) {
    var m = { live: ["Live", "ok"], stale: ["Stale", "warn"], cached: ["Saved copy", "warn"], down: ["Unavailable", "bad"], unused: ["Not used yet", "idle"], pending: ["Checking", "idle"] }[st] || [st, "idle"];
    var g = V2.grade(st);
    return '<span class="sh-pill sh-' + m[1] + '">' + (g ? '<i class="gy gy-' + g.toLowerCase() + '">' + g + "</i> " : "") + m[0] + "</span>";
  }
  V2.healthHtml = function () {
    var esc = V2.esc, rows = SOURCES.map(function (s) {
      var x = status(s), h = x.h;
      return '<tr class="sh-row sh-' + x.st + '"><td><b>' + esc(s.name) + '</b><div class="d">' + esc(s.kind) + (s.staleH != null ? " · stale after " + (s.staleH < 1 ? Math.round(s.staleH * 60) + " min" : s.staleH + " h") : "") + "</div></td>" +
        "<td>" + pill(x.stale ? "stale" : x.st) + (x.st !== "unused" && x.txt !== "Live" ? '<div class="d">' + esc(x.txt) + "</div>" : "") + "</td>" +
        '<td><div>' + (h.ok ? esc(V2.ct(h.ok)) : "—") + '</div><div class="d"> (' + (h.ok ? esc(V2.ago(h.ok)) : "no success yet") + ")</div></td>" +
        '<td><div>' + (h.attempt ? esc(V2.ct(h.attempt)) : "—") + "</div></td>" +
        "<td>" + (x.content && x.content.at ? esc(x.content.label) + " " + esc(V2.ago(x.content.at)) : (x.ageH != null ? esc(V2.ago(h.ok)) : "—")) + "</td>" +
        '<td class="sh-n">' + (h.fails ? "<b>" + (+h.fails) + "</b>" : (x.st === "unused" ? "—" : "0")) + "</td>" +
        "<td>" + (x.st === "unused" || x.st === "pending" ? "—" : x.st === "live" || x.st === "stale" ? "Live" : "Saved copy" + (h.ok ? " from " + esc(V2.ct(h.ok)) : "")) + "</td>" +
        '<td class="d">' + (h.err && x.st !== "live" && x.st !== "stale" ? esc(String(h.err).slice(0, 120)) : "—") + "</td></tr>";
    }).join("");
    var f = window.ftpLive && window.ftpLive.feeds && window.ftpLive.feeds.data, box = "";
    if (f) {
      var errs = f.errors || {};
      box = '<h3>Inside the twice-daily snapshot (built ' + esc(V2.ct(f.generated)) + ", " + esc(V2.ago(f.generated)) + ')</h3><ul class="sh-box">' + BOX_FEEDS.map(function (b) {
        var present = f[b[0]] != null, at = b[2](f), e = errs[b[0]] || (b[0] === "camsAll" && errs.camsAll);
        return "<li>" + (e ? pill("down") : present ? pill(at && (Date.now() - Date.parse(at)) / 36e5 > 14 ? "stale" : "live") : pill("unused")) + " " + esc(b[1]) +
          (at ? ' <span class="d">· ' + esc(V2.ct(at)) + "</span>" : "") + (e ? ' <span class="d">· last refresh failed, previous values kept: ' + esc(String(e).slice(0, 140)) + "</span>" : "") + "</li>";
      }).join("") + "</ul>";
    }
    var sm = V2.healthSummary();
    return '<section class="prep xp-sec" id="v2-health"><h2>Source health</h2>' +
      '<p class="hint">What this device last got from each source: last success, last attempt and the age of the data. <b>Saved copy</b> means the last fetch failed and the app is showing what it saved earlier. <b>Stale</b> means the newest data is older than the limit shown. Colors: <b>GREEN</b> current data, <b>YELLOW</b> delayed (stale or saved copy), <b>RED</b> unavailable. Saved copies always show their real time; they are never presented as current. Recorded only on this device; times are Central.</p>' +
      '<div class="sh-sum">' + pill("live") + " " + sm.n.live + " &nbsp; " + pill("stale") + " " + sm.n.stale + " &nbsp; " + pill("cached") + " " + sm.n.cached + " &nbsp; " + pill("down") + " " + sm.n.down + '<span class="d"> · ' + (navigator.onLine ? "Device online" : "Device offline") + "</span></div>" +
      '<div class="sh-wrap"><table class="sh"><thead><tr><th>Source</th><th>Status</th><th>Last success</th><th>Last attempt</th><th>Data age</th><th>Failures in a row</th><th>Live or saved</th><th>Last error</th></tr></thead><tbody>' + rows + "</tbody></table></div>" + box +
      '<div class="row-btns"><button type="button" class="small-btn primary" id="sh-refresh">Re-check all sources now</button></div></section>';
  };

  // ---------- information labels ----------
  // Official alert = issued by a government warning authority (NWS, FEMA/IPAWS, USGS event feed).
  // Verified reporting = the brief marked it confirmed by named reporting/officials.
  // Developing = claims or early reports not yet independently confirmed.
  // AI assessment = the brief's level/trend/summary written by the assistant from the cited sources.
  V2.LABELS = {
    official: { t: "Official alert", c: "lb-off", d: "Issued by a government warning authority" },
    verified: { t: "Verified reporting", c: "lb-ver", d: "Confirmed by officials or multiple named outlets" },
    developing: { t: "Developing", c: "lb-dev", d: "Early or unconfirmed reports; may change" },
    assessment: { t: "AI assessment", c: "lb-ai", d: "Level and summary written by the assistant from the cited sources; not an official rating" }
  };
  var DEV_RE = /\b(unconfirmed|not (yet |been |independently )?(confirmed|verified)|unverified|claims?|claimed|reportedly|alleged(ly)?|rumou?r)\b/i;
  V2.threatLabels = function (t) {
    var out = [];
    if (t.label && V2.LABELS[t.label]) out.push({ k: t.label, auto: false });
    else if (DEV_RE.test(t.summary || "")) out.push({ k: "developing", auto: true });
    if (!t.label || t.label !== "assessment") out.push({ k: "assessment", auto: false });
    return out;
  };
  V2.labelChip = function (k, auto, extra) {
    var L = V2.LABELS[k]; if (!L) return "";
    return '<span class="lb ' + L.c + '" title="' + V2.esc(L.d + (auto ? " (flagged automatically from wording such as 'claims' or 'not confirmed')" : "") + (extra ? " · " + extra : "")) + '">' + V2.esc(L.t) + (auto ? "*" : "") + "</span>";
  };
})();
