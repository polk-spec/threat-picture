/* V2.2 core: six-section navigation, COMMAND view (the 7 questions), household level (v22-engine.js),
   threat-card details (category, distance, confidence, impact, times), hazard filter, prominent offline banner.
   Uses only data the app already loads plus on-device places; nothing personal leaves the device. */
(function () {
  "use strict";
  var V2 = window.V2, E = window.FTPEngine, $ = V2.$, esc = V2.esc, load = V2.load, save = V2.save;
  var V22 = window.V22 = window.V22 || {};

  // ================= six sections =================
  var SECTIONS = [
    { id: "command", label: "COMMAND", short: "Command", ico: "◉", tabs: ["brief"] },
    { id: "threats", label: "THREATS", short: "Threats", ico: "⚠", tabs: ["board", "alerts", "risk"] },
    { id: "map", label: "MAP", short: "Map", ico: "⌖", tabs: ["map", "cams"] },
    { id: "family", label: "FAMILY", short: "Family", ico: "♥", tabs: ["family", "comms"] },
    { id: "prep", label: "PREPAREDNESS", short: "Prepare", ico: "▦", tabs: ["prep", "evac"] },
    { id: "system", label: "SYSTEM", short: "System", ico: "⚙", tabs: ["sources"] }
  ];
  var SUBLABEL = { brief: "Command", board: "Threat board", alerts: "Official alerts", risk: "Household risk", map: "Map", cams: "Cameras",
    family: "Family operations", comms: "Communications", prep: "Supplies & readiness", evac: "Plans & evacuation", sources: "Sources & settings" };
  V22.SECTIONS = SECTIONS;
  function secOf(tab) { for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].tabs.indexOf(tab) >= 0) return SECTIONS[i]; return SECTIONS[0]; }
  V22.secOf = secOf;
  var lastTab = load("ftp-v22-lasttab", {});
  (function buildNav() {
    var tabs = $("tabs"); if (!tabs) return;
    tabs.setAttribute("aria-label", "Section views");
    tabs.querySelectorAll("[data-tab]").forEach(function (b) { var t = b.getAttribute("data-tab"); if (SUBLABEL[t]) b.firstChild && b.firstChild.nodeType === 3 ? (b.firstChild.nodeValue = SUBLABEL[t]) : null; });
    var nav = document.createElement("nav");
    nav.className = "sections"; nav.id = "sections"; nav.setAttribute("aria-label", "Main sections");
    nav.innerHTML = SECTIONS.map(function (s) {
      return '<button type="button" data-sec="' + s.id + '" aria-label="' + esc(s.label) + '" title="' + esc(s.label) + '"><span class="sec-ico" aria-hidden="true">' + s.ico + '</span><span class="sec-l">' + esc(s.label) + '</span><span class="sec-s" aria-hidden="true">' + esc(s.short) + "</span></button>";
    }).join("");
    document.body.insertBefore(nav, document.body.firstChild);
    document.documentElement.classList.add("v22");
  })();
  function syncNav(tab) {
    var s = secOf(tab);
    document.querySelectorAll("#sections [data-sec]").forEach(function (b) { var on = b.getAttribute("data-sec") === s.id; b.setAttribute("aria-current", on ? "page" : "false"); b.classList.toggle("on", on); });
    var tabs = $("tabs");
    if (tabs) {
      tabs.querySelectorAll("[data-tab]").forEach(function (b) { b.hidden = s.tabs.indexOf(b.getAttribute("data-tab")) < 0; });
      tabs.classList.toggle("single", s.tabs.length < 2);
    }
    document.documentElement.setAttribute("data-section", s.id);
    lastTab[s.id] = tab; save("ftp-v22-lasttab", lastTab);
  }
  V22.syncNav = syncNav;
  document.addEventListener("click", function (e) {
    var sb = e.target.closest && e.target.closest("button[data-sec]");
    if (sb) { var s = SECTIONS.filter(function (x) { return x.id === sb.getAttribute("data-sec"); })[0]; if (s) V2.go(lastTab[s.id] && s.tabs.indexOf(lastTab[s.id]) >= 0 ? lastTab[s.id] : s.tabs[0]); return; }
    var tb = e.target.closest && e.target.closest("[data-tab]");
    if (tb) syncNav(tb.getAttribute("data-tab"));
  });
  setTimeout(function () { syncNav(V2.curTab()); }, 0);
  // section tiles on COMMAND now point at the six sections
  (function tiles() {
    var t = document.querySelector(".v2-tiles"); if (!t) return;
    var D = { command: "This screen", threats: "Threat board, official alerts, household risk", map: "Places, radii, overlays, cameras", family: "Accountability, contacts, vault, comms",
      prep: "Supplies, checklists, scenarios, evacuation", system: "Source health, notifications, settings" };
    t.innerHTML = SECTIONS.filter(function (s) { return s.id !== "command"; }).map(function (s) { return '<button type="button" class="v2-tile" data-sec="' + s.id + '"><b>' + s.ico + " " + esc(s.label) + "</b><span>" + esc(D[s.id]) + "</span></button>"; }).join("");
  })();

  // ================= household level =================
  var HH = null, hhT = null;
  function places() { return (V2.locations ? V2.locations() : []); }
  V22.places = places;
  function computeHousehold() {
    var d = window.ftpData && window.ftpData(); if (!d || !V2.scoreLoc) return Promise.resolve(null);
    return Promise.all(places().map(function (l) { return V2.scoreLoc(l, false).then(function (r) { return { loc: l, nws: (r.nws && r.nws.feats) || [], quakes: (r.usgs && r.usgs.feats) || [], nwsAt: r.nws && r.nws.at, nwsLive: r.nws && r.nws.live }; }); }))
      .then(function (pl) { HH = E.household(pl, d.threats || []); HH.places = pl; HH.at = new Date().toISOString(); document.dispatchEvent(new CustomEvent("ftp-household")); if (V2.strip) V2.strip(); return HH; })
      .catch(function () { HH = E.household([], d.threats || []); HH.places = []; HH.failed = true; HH.at = new Date().toISOString(); document.dispatchEvent(new CustomEvent("ftp-household")); return HH; });
  }
  V22.household = function () { return HH; };
  V22.refreshHousehold = function () { clearTimeout(hhT); hhT = setTimeout(function () { computeHousehold().then(paintCommand); }, 250); };
  ["ftp-data", "ftp-live", "ftp-health", "ftp-family", "ftp-places"].forEach(function (ev) { document.addEventListener(ev, function () { if (ev === "ftp-health") { clearTimeout(paintCommand.t); paintCommand.t = setTimeout(paintCommand, 400); } else V22.refreshHousehold(); }); });

  // ================= local weather (NWS, county point; KCPS observations) =================
  var WX_ST = ["KCPS", "KSTL", "KALN"], WX_FC = "https://api.weather.gov/gridpoints/LSX/103,70/forecast";
  function wx() {
    var c = load("ftp-v22-wx2", null);
    if (c && Date.now() - Date.parse(c.at) < 20 * 60e3) return Promise.resolve(c);
    var h = { headers: { Accept: "application/geo+json" } };
    // first station with an observation under 3 hours old (KCPS sometimes stops reporting)
    function obs(i) {
      if (i >= WX_ST.length) return Promise.resolve(null);
      return fetch("https://api.weather.gov/stations/" + WX_ST[i] + "/observations/latest", h).then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (j) { var ts = j && j.properties && Date.parse(j.properties.timestamp); if (!ts || Date.now() - ts > 3 * 36e5 || j.properties.temperature.value == null) return obs(i + 1); j.station = WX_ST[i]; return j; })
        .catch(function () { return obs(i + 1); });
    }
    return Promise.all([obs(0), fetch(WX_FC, h).then(function (r) { if (!r.ok) throw 0; return r.json(); }).catch(function () { return null; })])
      .then(function (r) {
        if (!r[0] && !r[1]) return c ? Object.assign({}, c, { saved: true }) : null;
        var o = r[0] && r[0].properties, f = r[1] && r[1].properties && r[1].properties.periods;
        var rec = { at: new Date().toISOString(), station: r[0] && r[0].station, obsAt: o && o.timestamp, tempF: o && o.temperature && o.temperature.value != null ? Math.round(o.temperature.value * 9 / 5 + 32) : null,
          text: o && o.textDescription, windMph: o && o.windSpeed && o.windSpeed.value != null ? Math.round(o.windSpeed.value * 0.621371) : null,
          fc: f ? f.slice(0, 2).map(function (p) { return { name: p.name, text: p.shortForecast, t: p.temperature, u: p.temperatureUnit }; }) : (c && c.fc) || [] };
        save("ftp-v22-wx2", rec); return rec;
      });
  }
  var WX = load("ftp-v22-wx2", null);

  // ================= COMMAND =================
  function dot(c) { return '<i class="gy gy-' + String(c || "green").toLowerCase() + '" title="' + esc(c) + '">' + esc(c) + "</i>"; }
  V22.dot = dot;
  function nearestTo(lat, lng) {
    var best = null; places().forEach(function (l) { var mi = E.miles(lat, lng, +l.lat, +l.lon); if (!best || mi < best.mi) best = { name: l.name, mi: mi }; }); return best;
  }
  function situationRows(d) {
    var rows = [];
    (HH ? HH.official.drivers : []).slice(0, 4).forEach(function (x) {
      rows.push({ color: x.color, what: x.what, where: x.places.join(", "), dist: "at " + (x.places.length > 1 ? x.places.length + " places" : "your place"), affects: x.color === "GREEN" ? "Possible" : "Yes", label: "official", until: x.until });
    });
    (d.threats || []).filter(function (t) { return t.category === "Local"; }).map(function (t) { return { t: t, e: E.enrich(t, places(), d.updated) }; })
      .sort(function (a, b) { return E.rank(b.e.color) - E.rank(a.e.color) || (a.e.nearestMi || 999) - (b.e.nearestMi || 999); }).slice(0, rows.length ? 3 : 4)
      .forEach(function (x) { rows.push({ color: x.e.color, what: x.t.name, where: x.e.place, dist: x.e.nearestMi != null ? "~" + x.e.nearestMi + " mi" : "regional", affects: x.e.affects, label: x.e.developing ? "developing" : (x.t.label || "assessment"), id: x.t.id }); });
    return rows;
  }
  function accountabilityHtml() {
    var a = V22.accountability ? V22.accountability() : null;
    if (!a || !a.people.length) return '<p class="d">No family profiles on this device yet.</p><button type="button" class="small-btn" data-tab-go="family">Add people</button>';
    return '<div class="acc-sum">' + ["GREEN", "YELLOW", "RED"].map(function (c) { return '<span class="acc-n gy-' + c.toLowerCase() + '"><b>' + a.n[c] + "</b> " + { GREEN: "accounted for", YELLOW: "awaiting check-in", RED: "need help" }[c] + "</span>"; }).join("") + "</div>" +
      '<ul class="cmd-list">' + a.people.slice(0, 6).map(function (p) { return "<li>" + dot(p.color) + " " + esc(p.name || "Unnamed") + ' <span class="d">' + esc(p.why) + "</span></li>"; }).join("") + "</ul>" +
      (a.round ? '<p class="d">Accountability check started ' + esc(V2.ct(a.round)) + ".</p>" : "");
  }
  function sourcesHtml() {
    var n = { GREEN: 0, YELLOW: 0, RED: 0 }, bad = [];
    (V2.SOURCES || []).forEach(function (s) { var x = V2.sourceStatus(s), st = x.stale ? "stale" : x.st, g = V2.grade(st); if (!g) return; n[g]++; if (g !== "GREEN") bad.push({ g: g, name: s.name, txt: x.txt, at: x.h.ok }); });
    return '<div class="acc-sum">' + ["GREEN", "YELLOW", "RED"].map(function (c) { return '<span class="acc-n gy-' + c.toLowerCase() + '"><b>' + n[c] + "</b> " + { GREEN: "current", YELLOW: "delayed", RED: "unavailable" }[c] + "</span>"; }).join("") + "</div>" +
      (bad.length ? '<ul class="cmd-list">' + bad.slice(0, 4).map(function (b) { return "<li>" + dot(b.g) + " " + esc(b.name) + ' <span class="d">' + esc(b.g === "RED" ? "unavailable" : "last good " + (b.at ? V2.ago(b.at) : "never")) + "</span></li>"; }).join("") + "</ul>" : '<p class="d">Every source used on this device is current.</p>') +
      '<button type="button" class="small-btn" data-tab-go="sources" data-anchor="v2-health">Source health</button>';
  }
  function actionsHtml(d) {
    var out = [];
    (HH ? HH.official.drivers : []).filter(function (x) { return x.instruction; }).slice(0, 2).forEach(function (x) { out.push('<li><b>' + esc(x.what) + ":</b> " + esc(x.instruction.slice(0, 220)) + " " + V2.labelChip("official") + "</li>"); });
    (d.topActions || []).slice(0, 3).forEach(function (a) { if (typeof a === "string") out.push("<li>" + esc(a) + "</li>"); else if (a && (a.title || a.detail)) out.push("<li><b>" + esc(a.title || "") + "</b> " + esc(a.detail || "") + "</li>"); });
    return out.length ? '<ol class="cmd-list">' + out.join("") + "</ol>" : '<p class="d">No actions listed in the brief.</p>';
  }
  function wxHtml() {
    var w = WX; if (!w) return '<p class="d">Loading NWS conditions…</p>';
    var age = w.obsAt ? V2.ago(w.obsAt) : V2.ago(w.at);
    return '<div class="wx-now">' + (w.tempF != null ? "<b>" + w.tempF + "°F</b> " : "") + esc(w.text || "") + (w.windMph != null ? ' · wind ' + w.windMph + " mph" : "") + "</div>" +
      (w.fc && w.fc.length ? '<ul class="cmd-list">' + w.fc.map(function (p) { return "<li><b>" + esc(p.name) + ":</b> " + esc(p.text) + " " + esc(p.t) + "°" + esc(p.u) + "</li>"; }).join("") + "</ul>" : "") +
      '<p class="d">NWS observation ' + esc({ KCPS: "St. Louis Downtown Airport", KSTL: "St. Louis Lambert", KALN: "St. Louis Regional (Alton)" }[w.station] || "unavailable") + " and the St. Clair County forecast · observed " + esc(age) + (navigator.onLine ? "" : " · saved copy (offline)") + "</p>";
  }
  function incidentsHtml(d) {
    var loc = (d.threats || []).filter(function (t) { return t.category === "Local" && E.rank(E.levelColor(t.level)) >= 1; });
    var roads = V22.roadIncidents ? V22.roadIncidents() : null, near = [];
    if (roads && roads.items) roads.items.forEach(function (r) { var n = nearestTo(r.lat, r.lng); if (n && n.mi <= 25 && r.closed) near.push({ r: r, mi: n.mi }); });
    near.sort(function (a, b) { return a.mi - b.mi; });
    var h = "";
    if (loc.length) h += '<ul class="cmd-list">' + loc.slice(0, 3).map(function (t) { return "<li>" + dot(E.levelColor(t.level)) + " " + esc(t.name) + "</li>"; }).join("") + "</ul>";
    h += roads ? '<p class="d">Road incidents (IDOT, ' + (roads.live ? "live " : "saved ") + esc(V2.ct(roads.at)) + "): <b>" + near.length + "</b> road closures within 25 mi of your places" + (near[0] ? ", nearest: " + esc(near[0].r.road || near[0].r.desc) + " (~" + Math.round(near[0].mi) + " mi)" : "") + ".</p>" : '<p class="d">Road incidents load when you open the Map (IDOT live feed).</p>';
    if (!loc.length) h = '<p class="d">No local brief item above GREEN.</p>' + h;
    return h;
  }
  function updatesHtml(d) {
    var w = (d.whatChanged || []).slice(0, 3);
    return w.length ? '<ul class="cmd-list">' + w.map(function (c) { return "<li><b>" + esc(c.title || "") + "</b> " + '<span class="d">' + esc(c.date || "") + "</span></li>"; }).join("") + "</ul>" : '<p class="d">No changes listed.</p>';
  }
  function priorityHtml(d) {
    var items = [];
    (HH ? HH.official.drivers : []).filter(function (x) { return E.rank(x.color) >= 2; }).forEach(function (x) { items.push(dot(x.color) + " " + esc(x.what) + ' <span class="d">' + esc(x.places.join(", ")) + (x.until ? " · until " + esc(V2.ct(x.until)) : "") + "</span>"); });
    var a = V22.accountability ? V22.accountability() : null;
    if (a) a.people.filter(function (p) { return p.color === "RED"; }).forEach(function (p) { items.push(dot("RED") + " " + esc(p.name || "Someone") + " needs help"); });
    if (a && a.overdue && a.overdue.length) items.push(dot("YELLOW") + " Check-in overdue: " + esc(a.overdue.join(", ")));
    var inv = V2.inventoryScore ? V2.inventoryScore() : null;
    if (inv && inv.reorder && inv.reorder.length) items.push(dot("YELLOW") + " " + inv.reorder.length + " supply item" + (inv.reorder.length === 1 ? "" : "s") + ' to reorder or replace <button type="button" class="linkish" data-go="prep">open</button>');
    return items.length ? '<ul class="cmd-list">' + items.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>" : '<p class="d">Nothing needs attention right now.</p>';
  }
  function paintCommand() {
    var r = $("cmd-root"), d = window.ftpData && window.ftpData(); if (!r) return;
    if (!d) { r.innerHTML = '<p class="hint">Loading the brief…</p>'; return; }
    var hc = HH ? HH.color : "GREEN", online = navigator.onLine, brief = d.overall || {};
    var nwsLive = HH && HH.places && HH.places[0] && HH.places[0].nwsLive, nwsAt = HH && HH.places && HH.places[0] && HH.places[0].nwsAt;
    var rows = situationRows(d);
    r.innerHTML =
      '<section class="cmd-hero' + (HH ? " gy-bg-" + hc.toLowerCase() : " cmd-pending") + '" aria-live="polite"><div class="cmd-k">HOUSEHOLD THREAT LEVEL</div>' +
      (HH ? '<div class="cmd-lvl" id="hh-level">' + esc(hc) + " <small>" + esc(E.COLOR_TEXT[hc]) + "</small></div>"
        : '<div class="cmd-lvl" id="hh-level" data-pending="1">CHECKING… <small>loading official alerts for your places</small></div>') +
      '<div class="cmd-split"><span>Official alerts at your places: ' + (HH ? (HH.failed ? '<b class="warn-t">could not be checked</b>' : dot(HH.official.color) + " " + HH.official.drivers.length + " active") : "checking…") + "</span>" +
      "<span>Local assessment: " + (HH ? dot(HH.analytical.color) : "…") + "</span>" +
      "<span>Wider situation: " + dot(HH ? HH.wider.color : E.levelColor(brief.level)) + ' <span class="d">(brief overall ' + esc(brief.level || "—") + ")</span></span></div>" +
      '<p class="cmd-note">National and international news is shown but never raises your household level. Assessments can reach ORANGE at most; only official alerts can make it RED.</p>' +
      '<div class="cmd-ops"><b>' + (online ? (nwsLive ? "MONITORING LIVE" : "ONLINE · alerts from saved copy") : "OFFLINE · monitoring paused") + "</b> · official alerts " + esc(nwsAt ? (nwsLive ? "checked " : "saved ") + V2.ago(nwsAt) : "not loaded") +
      " · brief issued " + esc(V2.ct(d.updated)) + " (" + esc(V2.ago(d.updated)) + ") · " + places().length + " monitored place" + (places().length === 1 ? "" : "s") + ' · <button type="button" class="linkish" data-tab-go="sources" data-anchor="v2-locs">manage</button></div></section>' +
      '<div class="cmd-grid">' +
      '<section class="cmd-card cmd-wide" id="cmd-situation"><h3>What is happening, where, how close, does it affect us?</h3>' +
      (rows.length ? '<table class="cmd-t"><thead><tr><th></th><th>What</th><th>Where</th><th>How close</th><th>Affects us?</th></tr></thead><tbody>' + rows.map(function (x) {
        return "<tr>" + "<td>" + dot(x.color) + "</td><td>" + (x.id ? '<button type="button" class="linkish" data-open-threat="' + esc(x.id) + '">' + esc(x.what) + "</button>" : "<b>" + esc(x.what) + "</b>") + " " + V2.labelChip(x.label) + "</td><td>" + esc(x.where) + "</td><td>" + esc(x.dist) + '</td><td class="aff-' + esc(String(x.affects).toLowerCase()) + '">' + esc(x.affects) + "</td></tr>";
      }).join("") + "</tbody></table>" : '<p class="d">No official alerts and no local items.</p>') +
      (HH && HH.wider.items.length ? '<details class="cmd-more"><summary>Wider situation (national & international, ' + HH.wider.items.length + ")</summary><ul class=\"cmd-list\">" + HH.wider.items.slice(0, 8).map(function (w) { return "<li>" + dot(w.color) + ' <button type="button" class="linkish" data-open-threat="' + esc(w.id) + '">' + esc(w.what) + '</button> <span class="d">' + esc(w.scope) + " · " + esc(E.CATS[w.cat][0]) + "</span></li>"; }).join("") + "</ul>" + (brief.summary ? '<p class="d">' + esc(brief.summary) + "</p>" : "") + "</details>" : "") + "</section>" +
      '<section class="cmd-card" id="cmd-priority"><h3>Priority notifications</h3>' + priorityHtml(d) + "</section>" +
      '<section class="cmd-card" id="cmd-actions"><h3>Actions to consider</h3>' + actionsHtml(d) + "</section>" +
      '<section class="cmd-card" id="cmd-family"><h3>Is everyone accounted for?</h3>' + accountabilityHtml() + "</section>" +
      '<section class="cmd-card" id="cmd-sources"><h3>Are the sources working?</h3>' + sourcesHtml() + "</section>" +
      '<section class="cmd-card" id="cmd-wx"><h3>Local weather</h3>' + wxHtml() + "</section>" +
      '<section class="cmd-card" id="cmd-incidents"><h3>Regional incidents</h3>' + incidentsHtml(d) + "</section>" +
      '<section class="cmd-card" id="cmd-updates"><h3>Recent intelligence updates</h3>' + updatesHtml(d) + '<button type="button" class="small-btn" data-jump="brief">All changes</button></section>' +
      "</div>";
  }
  V22.paintCommand = paintCommand;
  document.addEventListener("click", function (e) { var o = e.target.closest && e.target.closest("[data-open-threat]"); if (o && window.ftpOpenThreat) window.ftpOpenThreat(o.getAttribute("data-open-threat")); });
  V2.panels.brief = function () { paintCommand(); };
  function wxLoop() { wx().then(function (w) { if (w) { WX = w; paintCommand(); } }); }
  setTimeout(wxLoop, 1200); setInterval(function () { if (!document.hidden && navigator.onLine) wxLoop(); }, 20 * 60e3);

  // ================= threat cards: category, place, distance, times, confidence, impact =================
  window.ftpCardExtra = function (t, where) {
    var d = window.ftpData && window.ftpData(), e = E.enrich(t, places(), d && d.updated);
    if (where === "summary") return '<div class="tx-row"><span class="tx-cat">' + e.icon + " " + esc(e.catLabel) + "</span> " + dot(e.color) + ' <span class="tx-conf">Confidence: ' + esc(e.confidence) + "</span>" + (e.nearestMi != null ? ' <span class="tx-dist">~' + e.nearestMi + " mi from your nearest place</span>" : "") + "</div>";
    return '<dl class="tx-dl"><dt>Category</dt><dd>' + esc(e.catLabel) + "</dd><dt>Severity</dt><dd>" + dot(e.color) + " " + esc(E.COLOR_TEXT[e.color]) + " (brief level " + esc(t.level) + ")</dd>" +
      "<dt>Location</dt><dd>" + esc(e.place) + (typeof t.lat === "number" ? ' <span class="d">(' + (+t.lat).toFixed(2) + ", " + (+t.lng).toFixed(2) + ", a county or regional point)</span>" : "") + "</dd>" +
      (e.dists.length ? "<dt>Distance</dt><dd>" + e.dists.map(function (x) { return esc(x.name) + " ~" + x.mi + " mi"; }).join(" · ") + "</dd>" : (t.category !== "Local" ? "<dt>Distance</dt><dd>Not local (" + esc(t.category) + ")</dd>" : "")) +
      "<dt>Reported</dt><dd>" + esc(/^\d{4}-/.test(e.reported) ? V2.ct(e.reported) : e.reported || "—") + "</dd><dt>Last updated</dt><dd>" + esc(e.updated ? V2.ct(e.updated) : "—") + "</dd>" +
      "<dt>Confidence</dt><dd>" + esc(e.confidence) + (e.developing ? " (unconfirmed reports)" : "") + "</dd><dt>Household impact</dt><dd>" + esc(e.impact) + " <b>Affects us: " + esc(e.affects) + "</b></dd></dl>";
  };
  (function hazardFilter() {
    var f = document.querySelector('[data-panel="board"] .filters'); if (!f) return;
    var lab = document.createElement("label"); lab.className = "sel";
    lab.innerHTML = 'Category <select id="haz-filter"><option value="">All categories</option>' + Object.keys(E.CATS).map(function (k) { return '<option value="' + k + '">' + esc(E.CATS[k][0]) + "</option>"; }).join("") + "</select>";
    f.appendChild(lab);
    function apply() { var v = $("haz-filter").value; document.querySelectorAll("#threats .card").forEach(function (c) { c.hidden = !!v && c.getAttribute("data-hazard") !== v; }); }
    lab.querySelector("select").addEventListener("change", apply);
    new MutationObserver(apply).observe($("threats"), { childList: true });
  })();

  // ================= prominent offline banner =================
  (function offline() {
    var b = document.createElement("div"); b.id = "v22-offline"; b.className = "v22-offline"; b.setAttribute("role", "alert"); b.hidden = true;
    var strip = $("eoc-strip"); if (strip) strip.after(b); else document.body.prepend(b);
    function paint() {
      var off = !navigator.onLine; b.hidden = !off; document.documentElement.classList.toggle("v22-off", off);
      if (!off) return;
      var d = window.ftpData && window.ftpData(), n = window.ftpLive && window.ftpLive.nws;
      b.innerHTML = "<b>OFFLINE.</b> Live monitoring and in-app alerts are paused on this device. Showing saved data: brief issued " + esc(d ? V2.ct(d.updated) : "—") +
        (n && n.at ? " · official alerts saved " + esc(V2.ct(n.at)) : "") + ". Use NOAA Weather Radio 162.550 MHz for warnings.";
    }
    window.addEventListener("online", paint); window.addEventListener("offline", paint); document.addEventListener("ftp-data", paint); document.addEventListener("ftp-live", paint);
    setTimeout(paint, 0);
  })();
})();
