/* Severe weather mode: full-screen takeover while an NWS Tornado / Severe Thunderstorm / Flash Flood Warning, Extreme Wind
   Warning or civil-emergency type alert is active for our zones. Shows the warning text and expiry (CT), the warning polygon
   on a mini map with the latest radar, and a "take shelter now" checklist per hazard. Polls NWS every 2 minutes while open.
   Dismissals are kept on this device until the warning expires. Notifications for these events deep-link to #severe. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function ctTime(t) { var d = new Date(t); return isNaN(d) ? "" : d.toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", hour: "numeric", minute: "2-digit" }) + " CT"; }
  var N = window.FTPNotify || {};
  var ZONES = N.ZONES || "ILC163,ILZ101,MOC510,MOZ064,MOC189,MOZ063";
  var EVENTS = N.SEVERE_EVENTS || ["Tornado Warning", "Severe Thunderstorm Warning", "Flash Flood Warning", "Flash Flood Emergency", "Extreme Wind Warning",
    "Civil Emergency Message", "Civil Danger Warning", "Shelter In Place Warning", "Evacuation Immediate", "Local Area Emergency"];
  var RANK = { "Tornado Warning": 1, "Extreme Wind Warning": 2, "Flash Flood Emergency": 3, "Civil Danger Warning": 4, "Evacuation Immediate": 4,
    "Shelter In Place Warning": 4, "Civil Emergency Message": 5, "Local Area Emergency": 5, "Flash Flood Warning": 6, "Severe Thunderstorm Warning": 7 };
  var K_DISMISS = "ftp-severe-dismissed";
  function hazard(ev) { return /Tornado/.test(ev) ? "tornado" : /Extreme Wind/.test(ev) ? "wind" : /Flood/.test(ev) ? "flood" : /Thunderstorm/.test(ev) ? "storm" : "civil"; }
  // Take-shelter checklists from NWS / Ready.gov safety guidance (links shown in the takeover)
  var CHECK = {
    tornado: ["Go NOW to the basement or storm cellar, or the lowest floor in an interior room with no windows (bathroom, closet, hallway).",
      "Shoes on. Helmets (bike or sports) for everyone; cover heads and necks with arms, pillows, blankets or a mattress.",
      "Bring phones, the NOAA weather radio and a flashlight. Pets on leashes or in carriers.",
      "Mobile home or vehicle: leave now for a sturdy building. Last resort: lie flat in a low spot and cover your head.",
      "Stay sheltered until the warning expires or NWS cancels it."],
    wind: ["Treat it like a tornado: go now to an interior room on the lowest floor, away from windows.",
      "Shoes and helmets on; cover heads and necks.", "Get out of vehicles and mobile homes into a sturdy building now.",
      "Stay sheltered until the warning expires."],
    storm: ["Get inside a sturdy building now and stay away from windows (damaging wind, large hail).",
      "Avoid corded phones, plumbing and plugged-in electronics while there is lightning.",
      "Never shelter under trees. Bring pets inside.", "Keep the NOAA radio on: a tornado warning can follow with little notice.",
      "Wait 30 minutes after the last thunder before going outside."],
    flood: ["Move to higher ground now if you are in a low area or near a creek or river.",
      "Turn Around, Don't Drown: never drive or walk into flood water. 6 inches can knock you down; 12 inches can float a car.",
      "Avoid underpasses, low-water crossings and creek beds, especially at night.",
      "If water enters the home, go to the highest floor (not a closed attic). Go on the roof only if you must, and signal for help.",
      "Shut off power at the main breaker only if you are dry and it is safe."],
    civil: ["Read the full message below and follow what officials tell you to do.",
      "If told to shelter in place: get inside, close and lock windows and doors, turn off HVAC and fans, and go to an interior room.",
      "If told to evacuate: take go bags and grab-and-go cards, and use the routes officials give.",
      "Keep NOAA Weather Radio 162.550 MHz (KDO89) or local TV and radio on. Text instead of calling.",
      "Check in with the family using your check-in plan."]
  };
  var SAFETY = { tornado: "https://www.weather.gov/safety/tornado", wind: "https://www.weather.gov/safety/wind", storm: "https://www.weather.gov/safety/thunderstorm",
    flood: "https://www.weather.gov/safety/flood-turn-around-dont-drown", civil: "https://www.ready.gov/shelter" };

  var active = [], idx = 0, testMode = false, mmap = null, lastCheck = null, checking = null, seenIds = {};
  function dismissed() { var d = load(K_DISMISS, {}), now = Date.now(), ch = false; Object.keys(d).forEach(function (k) { if (d[k] < now) { delete d[k]; ch = true; } }); if (ch) save(K_DISMISS, d); return d; }
  function endsAt(p) { return p.ends || p.expires; }

  function fetchActive() {
    if (checking) return checking;
    checking = fetch(window.FTPLoc ? FTPLoc.alertsUrl(ZONES) : "https://api.weather.gov/alerts/active?zone=" + ZONES, { cache: "no-store", headers: { Accept: "application/geo+json" } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        lastCheck = Date.now();
        var seen = {}, out = [];
        (d.features || []).forEach(function (f) {
          var p = f.properties || {};
          if (EVENTS.indexOf(p.event) < 0 || seen[p.id]) return;
          if (endsAt(p) && new Date(endsAt(p)) < new Date()) return;
          seen[p.id] = 1; out.push(f);
        });
        out.sort(function (a, b) { return (RANK[a.properties.event] || 9) - (RANK[b.properties.event] || 9); });
        return out;
      }).finally(function () { checking = null; });
    return checking;
  }
  function check(force) {
    return fetchActive().then(function (list) {
      var dis = dismissed(), fresh = list.filter(function (f) { return !seenIds[f.properties.id]; });
      list.forEach(function (f) { seenIds[f.properties.id] = 1; });
      if (fresh.length && window.ftpAlertCheck && window.ftpNotifOn && window.ftpNotifOn()) window.ftpAlertCheck();   // same de-dup as push alerts
      if (testMode) return list;
      var show = list.filter(function (f) { return force || !dis[f.properties.id]; });
      active = list;
      var el = $("severe"), cur = el && !el.hidden && active[idx] && active[idx].properties.id;
      if (show.length) {
        active = show.concat(list.filter(function (f) { return show.indexOf(f) < 0; }));
        var keep = cur ? active.map(function (f) { return f.properties.id; }).indexOf(cur) : -1;
        if (keep >= 0) idx = keep; else { idx = 0; open(); }   // already showing this warning: keep the checklist ticks
      }
      else if ($("severe") && !$("severe").hidden) close(true);
      banner(); card();
      return list;
    }).catch(function () { card(); return null; });
  }

  // ---- takeover ----
  function ensureEl() {
    if ($("severe")) return $("severe");
    var el = document.createElement("div"); el.id = "severe"; el.hidden = true; el.setAttribute("role", "alertdialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "sev-title");
    document.body.appendChild(el); return el;
  }
  function open() {
    var el = ensureEl(), f = active[idx]; if (!f) return;
    var p = f.properties, hz = hazard(p.event), end = endsAt(p), mins = end ? Math.round((new Date(end) - Date.now()) / 60000) : null;
    el.className = "sev-" + hz + (testMode ? " sev-test" : "");
    el.innerHTML = '<div class="sev-box">' +
      (testMode ? '<div class="sev-testbar">TEST - this is not a real warning</div>' : "") +
      '<div class="sev-head"><div class="sev-ev" id="sev-title">' + esc(p.event) + '</div>' +
      (active.length > 1 ? '<div class="sev-n">' + (idx + 1) + " of " + active.length + ' <button type="button" class="small-btn" id="sev-next">Next ›</button></div>' : "") + "</div>" +
      '<div class="sev-until">' + (end ? "Until <b>" + esc(ctTime(end)) + "</b>" + (mins != null && mins >= 0 ? " · " + (mins < 60 ? mins + " min left" : Math.floor(mins / 60) + " h " + (mins % 60) + " min left") : "") : "Until further notice") + "</div>" +
      '<div class="sev-area">' + esc(p.areaDesc || "") + "</div>" +
      (p.instruction ? '<div class="sev-instr">' + esc(p.instruction).replace(/\n\n+/g, "<br><br>").replace(/\n/g, " ") + "</div>" : "") +
      '<h3>Take shelter now</h3><ul class="sev-check">' + CHECK[hz].map(function (c, i) { return '<li><label><input type="checkbox" data-sevc="' + i + '"> ' + esc(c) + "</label></li>"; }).join("") + "</ul>" +
      '<div class="sev-map-wrap"><div id="sev-map" aria-label="Warning area map with radar"></div><div class="sev-map-note" id="sev-map-note">Warning area' + (navigator.onLine ? " · loading radar…" : " · offline: map needs a connection") + "</div></div>" +
      '<details class="sev-text"' + (p.instruction ? "" : " open") + "><summary>Full NWS text</summary><p><b>" + esc(p.headline || "") + "</b></p><pre>" + esc(p.description || "") + "</pre>" +
      '<p class="d">' + esc(p.senderName || "NWS") + " · issued " + esc(ctTime(p.sent || p.effective)) + "</p></details>" +
      '<div class="sev-btns"><button type="button" class="sev-dismiss" id="sev-dismiss">' + (testMode ? "End test" : "Dismiss") + '</button>' +
      '<a class="small-btn" href="' + esc(SAFETY[hz]) + '" target="_blank" rel="noopener">NWS safety tips ↗</a>' +
      (testMode ? "" : '<a class="small-btn" href="' + esc(/^https:\/\//.test(p["@id"] || "") ? p["@id"] : "https://www.weather.gov/lsx/") + '" target="_blank" rel="noopener">Official alert ↗</a>') + "</div>" +
      '<p class="d sev-foot">' + (testMode ? "Test mode uses a made-up warning over Jefferson County, MO." : "Live from api.weather.gov · checked " + esc(ctTime(lastCheck || Date.now())) + " · rechecks every 2 min.") + " Dismissing hides this screen on this device until the warning ends; the red bar at the top reopens it.</p></div>";
    el.hidden = false; document.documentElement.classList.add("sev-open");
    el.querySelector(".sev-box").scrollTop = 0;
    if (!testMode && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) try { navigator.vibrate([400, 200, 400]); } catch (e) {}
    drawMap(f);
    var b = $("sev-dismiss"); if (b) b.focus({ preventScroll: true });
  }
  function close(silent) {
    var el = $("severe"); if (!el) return;
    if (mmap) { mmap.remove(); mmap = null; }
    el.hidden = true; el.innerHTML = ""; document.documentElement.classList.remove("sev-open");
    if (testMode) { testMode = false; active = []; check(); }
    if (!silent) banner();
  }
  function dismiss() {
    if (!testMode) {
      var d = dismissed();
      active.forEach(function (f) { var e = endsAt(f.properties); d[f.properties.id] = e ? new Date(e).getTime() : Date.now() + 3 * 3600e3; });
      save(K_DISMISS, d);
    }
    close();
  }
  function drawMap(f) {
    var box = $("sev-map"); if (!box || !window.L) return;
    if (mmap) { mmap.remove(); mmap = null; }
    mmap = L.map(box, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, tap: true }).setView(window.FTPLoc && !FTPLoc.isHome() ? [FTPLoc.get().lat, FTPLoc.get().lon] : [38.62, -90.2], 8);
    mmap.attributionControl.setPrefix(false);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 16, className: "osm-dark", attribution: "© OpenStreetMap" }).addTo(mmap);
    var note = $("sev-map-note");
    fetch("https://api.rainviewer.com/public/weather-maps.json").then(function (r) { return r.json(); }).then(function (d) {
      var last = (d.radar && d.radar.past || []).slice(-1)[0]; if (!last || !mmap) throw 0;
      L.tileLayer(d.host + last.path + "/256/{z}/{x}/{y}/4/1_1.png", { opacity: 0.7, maxNativeZoom: 7, maxZoom: 16, zIndex: 300, attribution: "Radar: RainViewer" }).addTo(mmap);
      if (note) note.textContent = "Warning area (red) · radar " + new Date(last.time * 1000).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }) + " CT";
    }).catch(function () { if (note && navigator.onLine) note.textContent = "Warning area (red) · radar unavailable"; });
    var style = { color: "#ff3b3b", weight: 3, fillColor: "#ff3b3b", fillOpacity: 0.18 };
    function fit(layer) { try { mmap.fitBounds(layer.getBounds(), { padding: [16, 16], maxZoom: 10 }); } catch (e) {} }
    if (f.geometry) { var g = L.geoJSON(f.geometry, { style: style }).addTo(mmap); fit(g); return; }
    // county/zone-based alerts carry no polygon: draw the affected zones instead (up to 8)
    var zs = (f.properties.affectedZones || []).slice(0, 8), grp = L.featureGroup().addTo(mmap);
    Promise.all(zs.map(function (u) { return /^https:\/\/api\.weather\.gov\//.test(u) ? fetch(u, { headers: { Accept: "application/geo+json" } }).then(function (r) { return r.json(); }).then(function (z) { if (z.geometry && mmap) L.geoJSON(z.geometry, { style: style }).addTo(grp); }).catch(function () {}) : null; }))
      .then(function () { if (mmap && grp.getLayers().length) fit(grp); });
  }

  // ---- red reopen bar + Alerts-tab card ----
  function banner() {
    var b = $("sev-bar"), live = active.filter(function () { return !testMode; });
    var hidden = !$("severe") || $("severe").hidden;
    if (!live.length || !hidden) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement("button"); b.type = "button"; b.id = "sev-bar"; document.body.insertBefore(b, document.body.firstChild); }
    var p = live[0].properties, e = endsAt(p);
    b.className = "sev-bar sev-" + hazard(p.event);
    b.textContent = "⚠ " + p.event + (live.length > 1 ? " +" + (live.length - 1) : "") + (e ? " until " + ctTime(e) : "") + " · tap to open";
  }
  function card() {
    var r = $("severe-root"); if (!r) return;
    var live = testMode ? [] : active;
    r.innerHTML = '<section class="prep" id="severe-card"><h2>Severe weather mode</h2>' +
      "<p>When NWS issues a <b>Tornado</b>, <b>Severe Thunderstorm</b>, <b>Flash Flood</b> or <b>Extreme Wind Warning</b>, or a civil-emergency type alert, for St. Clair County or St. Louis city and county, the app switches to a full-screen take-shelter screen with the warning area and radar. It checks every 2 minutes while the app is open. With push alerts on, the notification opens this screen.</p>" +
      '<p class="d">' + (live.length ? "<b>Active now:</b> " + live.map(function (f) { return esc(f.properties.event) + (endsAt(f.properties) ? " until " + esc(ctTime(endsAt(f.properties))) : ""); }).join("; ") : "No severe warnings active for our zones.") +
      (lastCheck ? " Checked " + esc(ctTime(lastCheck)) + "." : "") + "</p>" +
      '<div class="row-btns">' + (live.length ? '<button type="button" class="small-btn primary" id="sev-open">Open severe mode</button>' : "") +
      '<button type="button" class="small-btn" id="sev-test">Test severe mode</button></div></section>';
  }
  function test() {
    testMode = true; var now = Date.now();
    active = [{ geometry: { type: "Polygon", coordinates: [[[-90.66, 38.16], [-90.38, 38.22], [-90.36, 38.36], [-90.62, 38.40], [-90.66, 38.16]]] },
      properties: { id: "test", event: "Tornado Warning", areaDesc: "Jefferson County, MO (TEST)", headline: "TEST Tornado Warning issued by NWS St. Louis MO (not real)",
        description: "THIS IS A TEST. At this time a severe thunderstorm capable of producing a tornado was located near Hillsboro, moving northeast at 35 mph.\n\nHAZARD...Tornado.\n\nSOURCE...Radar indicated rotation.\n\nIMPACT...Flying debris will be dangerous to those caught without shelter.",
        instruction: "TAKE COVER NOW! Move to a basement or an interior room on the lowest floor of a sturdy building. Avoid windows. (TEST)",
        sent: new Date(now).toISOString(), ends: new Date(now + 45 * 60e3).toISOString(), senderName: "NWS St. Louis MO (test)" } }];
    idx = 0; open();
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t.id === "sev-dismiss") dismiss();
    if (t.id === "sev-next") { idx = (idx + 1) % active.length; open(); }
    if (t.id === "sev-test") test();
    if (t.id === "sev-open" || t.id === "sev-bar" || (t.closest && t.closest("#sev-bar"))) { if (active.length) { idx = 0; open(); banner(); } }
    var tab = t.closest && t.closest("[data-tab]"); if (tab && tab.getAttribute("data-tab") === "alerts") setTimeout(card, 0);
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && $("severe") && !$("severe").hidden) dismiss(); });
  var timer = setInterval(function () { if (document.visibilityState === "visible" && navigator.onLine) check(); }, 2 * 60e3);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") check(); });
  window.addEventListener("hashchange", function () { if (location.hash === "#severe") check(true); });
  // location switcher: re-check right away for the new place (seenIds keep notifications from repeating)
  document.addEventListener("ftp-loc", function () { if (!testMode) { if ($("severe") && !$("severe").hidden) close(true); check(); } });
  window.ftpSevere = { check: check, test: test, close: close, state: function () { return { active: active.length, open: !!($("severe") && !$("severe").hidden), test: testMode, lastCheck: lastCheck }; } };
  if (location.hash === "#severe") { history.replaceState(null, "", location.pathname + location.search); check(true).then(function (l) { if (l && !l.length) { var s = document.createElement("div"); s.className = "toast"; s.textContent = "No severe warnings are active for our zones right now."; document.body.appendChild(s); setTimeout(function () { s.remove(); }, 5000); } }); }
  else check();
})();
