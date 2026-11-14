/* Location switcher: Home area (default) · Use my location (one-time, on tap) · City/ZIP search (Open-Meteo geocoder).
   Privacy: the chosen place is kept only on this device (localStorage, plus a Cache Storage copy so the service worker's
   push checks use the same place). Coordinates are rounded to 2 decimals (~1 km) and are only ever sent as query values
   directly from this phone to the public data APIs that need them (weather.gov, USGS, Open-Meteo, NOAA river gauges,
   FEMA shelters). No marker is ever drawn at the chosen point. A GPS fix inside the home area just selects Home area. */
(function () {
  "use strict";
  var K = "ftp-loc", CK = "/__ftp_loc";
  var HOME = { mode: "home", label: "Home area", place: "O'Fallon / St. Louis", lat: 38.63, lon: -90.2, state: "IL", states: ["IL", "MO"], tz: "America/Chicago" };
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function km(a, b, c, d) { var r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2); return 12742 * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y)); }
  function r2(x) { return Math.round(x * 100) / 100; }
  var STATES = { Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE", "District of Columbia": "DC", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY", "Puerto Rico": "PR" };

  function read() { try { var v = JSON.parse(localStorage.getItem(K) || "null"); return v && v.mode && v.mode !== "home" && isFinite(v.lat) ? v : null; } catch (e) { return null; } }
  var cur = read();
  function get() { return cur || HOME; }
  function isHome() { return !cur; }
  function mirror() {   // same-device copy for the service worker (it can't read localStorage)
    if (!("caches" in window)) return Promise.resolve();
    return caches.open("ftp-notify").then(function (c) {
      return cur ? c.put(CK, new Response(JSON.stringify(cur), { headers: { "Content-Type": "application/json" } })) : c.delete(CK);
    }).catch(function () {});
  }
  function apply() {
    document.documentElement.classList.toggle("loc-away", !isHome());
    paintBar();
    mirror();
    document.dispatchEvent(new CustomEvent("ftp-loc", { detail: get() }));
  }
  // resolve the NWS grid/zones for a point (weather.gov/points), then save + broadcast
  function setPoint(lat, lon, mode, label, hint) {
    lat = r2(lat); lon = r2(lon);
    if (km(lat, lon, HOME.lat, HOME.lon) <= 40) { useHome("That's inside the home area, so Home area is selected."); return Promise.resolve(get()); }
    msg("Looking up local NWS office…");
    return fetch("https://api.weather.gov/points/" + lat + "," + lon, { headers: { Accept: "application/geo+json" } }).then(function (r) { if (!r.ok) throw new Error(r.status === 404 ? "outside NWS coverage (US only)" : "weather.gov " + r.status); return r.json(); }).then(function (d) {
      var p = d.properties || {}, rl = (p.relativeLocation || {}).properties || {}, id = function (u) { return String(u || "").split("/").pop(); };
      var st = rl.state || (hint && hint.state) || "";
      cur = { mode: mode, lat: lat, lon: lon, label: label || ((rl.city ? rl.city + ", " : "") + st), state: st, tz: p.timeZone || "",
        nws: { cwa: p.cwa, forecast: p.forecast, hourly: p.forecastHourly, zone: id(p.forecastZone), county: id(p.county), radar: p.radarStation }, at: new Date().toISOString() };
      if (mode === "gps") cur.label = (rl.city ? "Near " + rl.city + ", " : "Near ") + st;
      try { localStorage.setItem(K, JSON.stringify(cur)); } catch (e) {}
      msg(""); open(false); apply(); return cur;
    }).catch(function (e) { msg("Couldn't set that location: " + e.message + "."); throw e; });
  }
  function useHome(note) { cur = null; try { localStorage.removeItem(K); } catch (e) {} open(!!note); msg(note || ""); apply(); }
  function useGPS() {
    if (!navigator.geolocation) { msg("This browser can't share its location."); return; }
    msg("Asking for your location (one time)…");
    navigator.geolocation.getCurrentPosition(function (p) { setPoint(p.coords.latitude, p.coords.longitude, "gps").catch(function () {}); },
      function (e) { msg(e.code === 1 ? "Location permission was declined. You can search for a city or ZIP instead." : "Couldn't get your location. Try again or search for a city or ZIP."); },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 0 });
  }
  function search(q) {
    q = String(q || "").trim(); if (q.length < 2) { msg("Type a US city or 5-digit ZIP."); return; }
    msg("Searching…"); $("loc-results").innerHTML = "";
    // Open-Meteo geocoding: free, no key, CORS. Only called when you press Search (no typing-as-you-go lookups).
    fetch("https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&countryCode=US&name=" + encodeURIComponent(q.replace(/,.*$/, "")))
      .then(function (r) { return r.json(); }).then(function (d) {
        var st = (q.match(/,\s*([A-Za-z .]+)$/) || [])[1], rs = (d.results || []);
        if (st) { st = st.trim().toLowerCase(); rs = rs.filter(function (x) { return (STATES[x.admin1] || "").toLowerCase() === st || String(x.admin1 || "").toLowerCase() === st; }).concat(rs.filter(function (x) { return (STATES[x.admin1] || "").toLowerCase() !== st && String(x.admin1 || "").toLowerCase() !== st; })); }
        if (!rs.length) { msg("No US match for “" + q + "”. Try “City, ST” or a ZIP."); return; }
        msg("Pick one:");
        $("loc-results").innerHTML = rs.slice(0, 6).map(function (x, i) {
          var s = STATES[x.admin1] || x.admin1 || "";
          return '<button type="button" class="small-btn loc-pick" data-i="' + i + '">' + esc(x.name + (s ? ", " + s : "")) + (x.admin2 ? ' <span class="d">' + esc(x.admin2) + "</span>" : "") + "</button>";
        }).join("");
        $("loc-results").onclick = function (e) {
          var b = e.target.closest(".loc-pick"); if (!b) return; var x = rs[+b.getAttribute("data-i")], s = STATES[x.admin1] || x.admin1 || "";
          setPoint(x.latitude, x.longitude, "search", x.name + (s ? ", " + s : ""), { state: STATES[x.admin1] }).catch(function () {});
        };
      }).catch(function () { msg("Search is unavailable offline."); });
  }

  // ---- UI: banner under the header + switcher panel ----
  function msg(t) { var m = $("loc-msg"); if (m) m.textContent = t; }
  function open(on) { var p = $("loc-panel"), b = $("loc-change"); if (!p) return; p.hidden = !on; if (b) b.setAttribute("aria-expanded", String(!!on)); }
  function paintBar() {
    var l = get(), t = $("loc-text"); if (!t) return;
    t.innerHTML = isHome() ? "📍 <b>Home area</b> · O'Fallon / St. Louis"
      : "📍 Location: <b>" + esc(l.label) + "</b> <span class=\"d\">(" + (l.mode === "gps" ? "your location" : "searched") + ")</span>";
    $("loc-bar").classList.toggle("away", !isHome());
    var hb = $("loc-home"); if (hb) hb.setAttribute("aria-pressed", String(isHome()));
  }
  function mount() {
    var hdr = document.querySelector(".topbar"); if (!hdr || $("loc-bar")) return;
    var bar = document.createElement("div"); bar.id = "loc-bar"; bar.className = "loc-bar"; bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "Location in use");
    bar.innerHTML = '<div class="loc-row"><span id="loc-text"></span><button type="button" id="loc-change" class="small-btn" aria-expanded="false" aria-controls="loc-panel">Change</button></div>' +
      '<div id="loc-panel" class="loc-panel" hidden>' +
      '<div class="row-btns"><button type="button" class="small-btn" id="loc-home">🏠 Home area</button><button type="button" class="small-btn" id="loc-gps">📍 Use my location</button></div>' +
      '<form id="loc-form" class="loc-form" autocomplete="off"><label for="loc-q">City or ZIP</label><div class="loc-q-row"><input id="loc-q" type="search" inputmode="search" placeholder="e.g. Denver, CO or 80202" enterkeyhint="search"><button type="submit" class="small-btn primary">Search</button></div></form>' +
      '<div id="loc-results" class="loc-results"></div><p class="d" id="loc-msg" role="status" aria-live="polite"></p>' +
      '<p class="d">Weather alerts, forecast, severe-weather mode, push alerts on this device, quakes, air quality, radar, river gauges, hospitals and open shelters follow the location you pick. The national and global threat brief stays the same. St. Louis-only sections are labeled. Your location stays on this phone: rounded coordinates go only to the public data services that need them (weather.gov, USGS, Open-Meteo, NOAA, FEMA).</p></div>';
    hdr.parentNode.insertBefore(bar, hdr.nextSibling);
    $("loc-change").addEventListener("click", function () { open($("loc-panel").hidden); if (!$("loc-panel").hidden) msg(""); });
    $("loc-home").addEventListener("click", function () { useHome(); });
    $("loc-gps").addEventListener("click", useGPS);
    $("loc-form").addEventListener("submit", function (e) { e.preventDefault(); search($("loc-q").value); });
    paintBar();
  }

  // ---- helpers used by the feature modules ----
  function bbox(dLat, dLon) { var l = get(); dLat = dLat || 0.5; dLon = dLon || 0.65; return [r2(l.lon - dLon), r2(l.lat - dLat), r2(l.lon + dLon), r2(l.lat + dLat)]; }
  function alertsUrl(homeZones) { return isHome() ? "https://api.weather.gov/alerts/active?zone=" + homeZones : "https://api.weather.gov/alerts/active?point=" + get().lat + "," + get().lon; }
  function key() { return isHome() ? "" : "@" + get().lat + "," + get().lon; }   // per-place offline copies

  window.FTPLoc = { get: get, isHome: isHome, HOME: HOME, setPoint: setPoint, useHome: useHome, useGPS: useGPS, search: search, bbox: bbox, alertsUrl: alertsUrl, key: key, km: km,
    label: function () { return isHome() ? "St. Clair Co. IL, St. Louis city & county" : get().label; } };
  document.documentElement.classList.toggle("loc-away", !isHome());
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
  mirror();
})();
