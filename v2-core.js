/* v2 core: section navigation + expandable panels, EOC status strip, Emergency Mode, household risk scoring,
   Sources & settings (source health, information labels, monitoring locations, notification settings, on-device data).
   Personal entries live only in this browser (localStorage keys ftp-private-*). Nothing is uploaded. */
(function () {
  "use strict";
  var V2 = window.V2, $ = V2.$, esc = V2.esc, load = V2.load, save = V2.save;
  var LV = ["Low", "Guarded", "Elevated", "High", "Severe"];
  V2.panels = V2.panels || {};
  function curTab() { var b = document.querySelector('[data-tab][aria-selected="true"]'); return b ? b.getAttribute("data-tab") : "brief"; }
  V2.curTab = curTab;
  V2.go = function (tab, anchor) {
    var b = document.querySelector('[data-tab="' + tab + '"]'); if (b) b.click();
    if (anchor) setTimeout(function () { var el = $(anchor); if (el) { el.classList.remove("xp-closed"); el.scrollIntoView({ block: "start" }); } }, 120);
  };

  // ================= navigation =================
  function heroFor(name) { document.documentElement.classList.toggle("v2-sub", name !== "brief"); }
  function onTab(name) {
    heroFor(name);
    try { if (!/^#(severe|prep-)/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search + "#" + name); } catch (e) {}
    var fn = V2.panels[name]; if (fn) setTimeout(fn, 0);
    var nav = $("tabs"), b = nav && nav.querySelector('[data-tab="' + name + '"]');
    if (b && nav.scrollWidth > nav.clientWidth && b.scrollIntoView) b.scrollIntoView({ block: "nearest", inline: "center" });
    window.scrollTo({ top: 0 });
  }
  document.addEventListener("click", function (e) {
    var t = e.target, tab = t.closest && t.closest("[data-tab]");
    if (tab) onTab(tab.getAttribute("data-tab"));
    var go = t.closest && t.closest("[data-tab-go]");
    if (go) { e.preventDefault(); V2.go(go.getAttribute("data-tab-go"), go.getAttribute("data-anchor")); }
    var h2 = t.closest && t.closest("section.prep > h2, section.xp-sec > h2");
    if (h2) toggleSec(h2.parentNode);
  });
  // legacy deep links (#board, #alerts …) are handled by extras.js; the new sections are handled here
  function deepNew() { var h = (location.hash || "").slice(1); if (V2.panels[h] && document.querySelector('[data-tab="' + h + '"]')) setTimeout(function () { V2.go(h); }, 450); }

  // ================= expandable panels =================
  var KX = "ftp-v2-collapsed", closed = load(KX, {});
  function toggleSec(sec) {
    if (!sec || !sec.id) return;
    var c = !sec.classList.contains("xp-closed");
    sec.classList.toggle("xp-closed", c); closed[sec.id] = c; if (!c) delete closed[sec.id]; save(KX, closed);
    var h = sec.querySelector(":scope > h2"); if (h) h.setAttribute("aria-expanded", String(!c));
  }
  function decorate() {
    document.querySelectorAll("section.prep[id] > h2, section.xp-sec[id] > h2").forEach(function (h) {
      var sec = h.parentNode;
      if (!h.hasAttribute("tabindex")) { h.setAttribute("tabindex", "0"); h.setAttribute("role", "button"); h.classList.add("xp-h"); }
      var c = !!closed[sec.id]; sec.classList.toggle("xp-closed", c); h.setAttribute("aria-expanded", String(!c));
    });
  }
  var decoT = null, mo = new MutationObserver(function () { clearTimeout(decoT); decoT = setTimeout(decorate, 30); });
  mo.observe(document.getElementById("app"), { childList: true, subtree: true });
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("xp-h")) { e.preventDefault(); toggleSec(e.target.parentNode); }
  });
  function xpTools(panel) {
    return '<div class="xp-tools"><button type="button" class="small-btn" data-xpall="' + panel + '" data-open="1">Expand all</button><button type="button" class="small-btn" data-xpall="' + panel + '" data-open="0">Collapse all</button></div>';
  }
  V2.xpTools = xpTools;
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-xpall]"); if (!b) return;
    var open = b.getAttribute("data-open") === "1", p = document.querySelector('[data-panel="' + b.getAttribute("data-xpall") + '"]');
    p.querySelectorAll("section.prep[id], section.xp-sec[id]").forEach(function (s) { s.classList.toggle("xp-closed", !open); if (open) delete closed[s.id]; else closed[s.id] = true; });
    save(KX, closed); decorate();
  });
  (function addPrepTools() { var p = document.querySelector('[data-panel="prep"]'), n = p && p.querySelector(".chips"); if (n) n.insertAdjacentHTML("afterend", xpTools("prep")); })();

  // ================= status strip =================
  function strip() {
    var c = $("es-clock"); if (c) c.textContent = new Date().toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" });
    var n = $("es-net"); if (n) { var on = navigator.onLine; n.className = "es-i " + (on ? "es-ok" : "es-bad"); n.lastElementChild.textContent = on ? "Online" : "Offline"; }
    var s = V2.healthSummary(), h = $("es-health");
    if (h) { h.className = "es-i es-btn es-" + (s.worst === "down" ? "bad" : s.worst === "warn" ? "warn" : s.worst === "ok" ? "ok" : "idle");
      h.lastElementChild.textContent = s.used ? "Sources " + s.n.live + "/" + s.used + " live" + (s.n.stale ? " · " + s.n.stale + " stale" : "") : "Sources"; }
    var d = window.ftpData && window.ftpData(), lv = $("es-lvl");
    var hh = window.V22 && V22.household && V22.household();
    if (lv && hh) { lv.hidden = false; lv.textContent = "Household: " + hh.color; lv.title = "Household threat level (official alerts at your places + local assessment). Brief overall: " + (d && d.overall ? d.overall.level : "—"); lv.style.setProperty("--lvc", "var(--g-" + hh.color.toLowerCase() + ")"); }
    else if (lv && d && d.overall) { lv.hidden = false; lv.textContent = "Brief: " + d.overall.level; lv.style.setProperty("--lvc", "var(--" + String(d.overall.level).toLowerCase() + ")"); }
    var ls = $("es-locshare"), fam = load("ftp-private-family", {}); if (ls) ls.hidden = !fam.shareLoc;
    document.documentElement.classList.toggle("v2-locshare", !!fam.shareLoc);
  }
  V2.strip = strip;
  setInterval(strip, 20000);
  ["online", "offline"].forEach(function (ev) { window.addEventListener(ev, strip); });
  document.addEventListener("ftp-health", function () { clearTimeout(strip.t); strip.t = setTimeout(strip, 300); if (curTab() === "sources") paintHealth(); });

  // ================= household risk scoring =================
  var TIERS = [[15, "Informational"], [30, "Low"], [50, "Moderate"], [70, "High"], [101, "Critical"]];
  function tier(s) { for (var i = 0; i < TIERS.length; i++) if (s < TIERS[i][0]) return TIERS[i][1]; return "Critical"; }
  V2.riskTier = tier;
  var LVPTS = { Low: 5, Guarded: 15, Elevated: 30, High: 50, Severe: 75 };
  // how directly a hazard type hits a household (1 = directly), and the hazard group it is reported under
  var TYPE = {
    weather: [1, "Weather & natural"], flood: [1, "Weather & natural"], earthquake: [1, "Weather & natural"], fire: [1, "Weather & natural"], air: [0.9, "Weather & natural"], space: [0.4, "Weather & natural"],
    disease: [0.8, "Health"], power: [1, "Infrastructure"], transport: [0.6, "Infrastructure"], cyber: [0.5, "Infrastructure"],
    crime: [0.7, "Security"], terrorism: [0.7, "Security"], nuclear: [0.6, "Security"], military: [0.5, "Security"], conflict: [0.4, "Security"],
    economy: [0.5, "Economic"], other: [0.5, "Other"]
  };
  var CATW = { Local: 1, National: 0.6, Global: 0.35 };
  var METRO = [38.63, -90.2];
  function km(a, b, c, d) { var r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2); return 12742 * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y)); }
  function inUS(lat, lon) { return lat > 18 && lat < 72 && lon > -180 && lon < -64; }
  function nwsType(ev) {
    ev = (ev || "").toLowerCase();
    if (/flood/.test(ev)) return "flood"; if (/air quality|smoke/.test(ev)) return "air"; if (/fire|red flag/.test(ev)) return "fire";
    if (/civil|shelter|evacuat|law enforcement|hazardous materials|nuclear|radiolog|911/.test(ev)) return "terrorism";
    return "weather";
  }
  var SEVPTS = { Extreme: 90, Severe: 70, Moderate: 45, Minor: 25, Unknown: 20 };
  var HOME_LOC = { id: "home", name: "Home area (St. Louis metro)", lat: METRO[0], lon: METRO[1], home: true };
  var KL = "ftp-private-locations";
  function locations() { var l = load(KL, null); if (!l || !l.length) l = [HOME_LOC]; if (!l.some(function (x) { return x.home; })) l.unshift(HOME_LOC); return l; }
  // V2.2 place kinds (spec: residence, campus/classes, work, meeting points, destinations). Stored only on this device.
  var KINDS = [["home", "Primary residence"], ["work", "Work"], ["campus", "Campus / classes"], ["meeting", "Meeting point"], ["destination", "Destination"], ["other", "Other"]];
  V2.PLACE_KINDS = KINDS;
  function kindSel(cur, attr) { return '<select ' + attr + ' aria-label="Kind of place">' + KINDS.map(function (k) { return '<option value="' + k[0] + '"' + (k[0] === cur ? " selected" : "") + ">" + k[1] + "</option>"; }).join("") + "</select>"; }
  V2.locations = locations;
  function activeNWS(fs) {
    var now = Date.now();
    return (fs || []).filter(function (f) { var p = f.properties || {}, end = Date.parse(p.ends || p.expires || ""); return p.status === "Actual" && p.messageType !== "Cancel" && (!end || end > now); });
  }
  function cachedLive(key) { return load("ftp-live-" + key, null); }
  function alertsFor(loc, fresh) {
    if (loc.home && loc.id === "home") {
      var live = window.ftpLive && window.ftpLive.nws;
      if (live && live.data && (!window.FTPLoc || FTPLoc.isHome())) return Promise.resolve({ feats: live.data.features, at: live.at, live: live.live });
      var c = cachedLive("nws"); if (c && !fresh) return Promise.resolve({ feats: c.data && c.data.features, at: c.at, live: false });
    }
    var key = "nws-risk-" + loc.id, c2 = cachedLive(key);
    if (c2 && !fresh && Date.now() - Date.parse(c2.at) < 10 * 60e3) return Promise.resolve({ feats: c2.data.features, at: c2.at, live: true });
    if (!inUS(loc.lat, loc.lon)) return Promise.resolve({ feats: [], at: null, live: false, na: true });
    return fetch("https://api.weather.gov/alerts/active?point=" + (+loc.lat).toFixed(4) + "," + (+loc.lon).toFixed(4), { cache: "no-store", headers: { Accept: "application/geo+json" } })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (d) { var rec = { at: new Date().toISOString(), data: { features: d.features || [] } }; save("ftp-live-" + key, rec); return { feats: rec.data.features, at: rec.at, live: true }; })
      .catch(function () { return c2 ? { feats: c2.data.features, at: c2.at, live: false } : { feats: null, at: null, live: false }; });
  }
  function quakesFor(loc) {
    var key = "usgs-risk-" + loc.id, c = cachedLive(key);
    if (c && Date.now() - Date.parse(c.at) < 15 * 60e3) return Promise.resolve({ feats: c.data.features, at: c.at, live: true });
    var start = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
    return fetch("https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=" + (+loc.lat).toFixed(3) + "&longitude=" + (+loc.lon).toFixed(3) + "&maxradiuskm=250&minmagnitude=2.5&starttime=" + start, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (d) { var rec = { at: new Date().toISOString(), data: { features: (d.features || []).map(function (f) { return { properties: { mag: f.properties.mag, place: f.properties.place, time: f.properties.time, url: f.properties.url }, geometry: f.geometry }; }) } }; save("ftp-live-" + key, rec); return { feats: rec.data.features, at: rec.at, live: true }; })
      .catch(function () { return c ? { feats: c.data.features, at: c.at, live: false } : { feats: null, at: null, live: false }; });
  }
  function scoreLoc(loc, fresh) {
    var d = window.ftpData && window.ftpData(), local = km(loc.lat, loc.lon, METRO[0], METRO[1]) <= 80, us = inUS(loc.lat, loc.lon);
    return Promise.all([alertsFor(loc, fresh), quakesFor(loc)]).then(function (r) {
      var parts = [];
      (activeNWS(r[0].feats)).forEach(function (f) {
        var p = f.properties, ty = nwsType(p.event);
        parts.push({ pts: SEVPTS[p.severity] || 20, group: (TYPE[ty] || TYPE.other)[1], what: p.event, label: "official", src: "NWS · " + (p.senderName || "weather.gov"), at: p.sent || p.effective, until: p.ends || p.expires });
      });
      (r[1].feats || []).forEach(function (f) {
        var p = f.properties, m = +p.mag, g = f.geometry && f.geometry.coordinates, dist = g ? km(loc.lat, loc.lon, g[1], g[0]) : 999;
        var pts = m >= 5 ? 60 : m >= 4 ? 35 : m >= 3 ? 12 : 5; if (dist > 100) pts = Math.round(pts * 0.5);
        parts.push({ pts: pts, group: "Weather & natural", what: "M" + m.toFixed(1) + " earthquake, " + Math.round(dist) + " km away (" + (p.place || "") + ")", label: "official", src: "USGS", at: new Date(p.time).toISOString() });
      });
      ((d && d.threats) || []).forEach(function (t) {
        if (t.category === "Local" && !local) return;
        if (t.category === "National" && !us) return;
        var ty = TYPE[t.type] || TYPE.other, pts = (LVPTS[t.level] || 0) * ty[0] * (CATW[t.category] || 0.35);
        if (pts < 1) return;
        parts.push({ pts: Math.round(pts * 10) / 10, group: ty[1], what: t.name + " (" + t.category + ", " + t.level + ")", label: t.label || "assessment", src: "Threat brief" + (t.date ? ", as of " + t.date : ""), at: d.updated, id: t.id });
      });
      parts.sort(function (a, b) { return b.pts - a.pts; });
      var top = parts[0] ? parts[0].pts : 0, rest = parts.slice(1).reduce(function (s, p) { return s + p.pts; }, 0);
      var score = Math.min(100, Math.round(top + Math.min(15, rest * 0.1)));
      var groups = {}; parts.forEach(function (p) { var g = groups[p.group] = groups[p.group] || { pts: 0, n: 0 }; g.pts = Math.max(g.pts, p.pts); g.n++; });
      return { loc: loc, score: score, tier: tier(score), parts: parts, groups: groups, local: local, us: us, nws: r[0], usgs: r[1], briefAt: d && d.updated };
    });
  }
  V2.scoreLoc = scoreLoc;
  function tierCls(t) { return "rk-" + t.toLowerCase(); }
  function riskCard(res) {
    var gs = Object.keys(res.groups).sort(function (a, b) { return res.groups[b].pts - res.groups[a].pts; });
    var srcLine = [res.nws.na ? "NWS alerts: not available outside the US" : "NWS alerts: " + (res.nws.at ? (res.nws.live ? "live " : "saved copy ") + V2.ct(res.nws.at) : "unavailable"),
      "USGS quakes: " + (res.usgs.at ? (res.usgs.live ? "live " : "saved copy ") + V2.ct(res.usgs.at) : "unavailable"),
      "Brief: " + (res.briefAt ? V2.ct(res.briefAt) : "not loaded")].join(" · ");
    return '<section class="prep xp-sec rk-card ' + tierCls(res.tier) + '" id="risk-' + esc(res.loc.id) + '"><h2>' + esc(res.loc.name) + "</h2>" +
      '<div class="rk-top"><div class="rk-tier">' + esc(res.tier) + '</div><div class="rk-score"><b>' + res.score + '</b>/100</div><div class="rk-bar"><i style="width:' + res.score + '%"></i></div></div>' +
      (res.local ? "" : '<p class="d">Outside the St. Louis metro: Local items from the brief do not apply here; national items ' + (res.us ? "do" : "do not (outside the US)") + ".</p>") +
      (gs.length ? '<div class="rk-groups">' + gs.map(function (g) { return '<span class="rk-g ' + tierCls(tier(res.groups[g].pts)) + '">' + esc(g) + " · " + esc(tier(res.groups[g].pts)) + "</span>"; }).join("") + "</div>" : "") +
      '<details class="rk-why"><summary>What drives this score (' + res.parts.length + ")</summary><ol>" + res.parts.slice(0, 12).map(function (p) {
        return "<li><b>" + esc(p.what) + "</b> " + V2.labelChip(p.label) + '<div class="d">' + esc(p.group) + " · +" + p.pts + " · " + esc(p.src) + (p.at ? " · " + esc(V2.ct(p.at)) : "") + (p.until ? " · until " + esc(V2.ct(p.until)) : "") + "</div></li>";
      }).join("") + "</ol></details>" +
      '<p class="d">' + esc(srcLine) + "</p>" +
      (res.loc.home ? "" : '<div class="row-btns"><button type="button" class="small-btn" data-rkdel="' + esc(res.loc.id) + '">Remove this location</button></div>') + "</section>";
  }
  var riskCache = null;
  function paintRisk(fresh) {
    var r = $("risk-root"); if (!r) return;
    if (!r.innerHTML) r.innerHTML = '<p class="hint">Scoring…</p>';
    var locs = locations();
    Promise.all(locs.map(function (l) { return scoreLoc(l, fresh); })).then(function (res) {
      riskCache = res;
      r.innerHTML = '<section class="xp-sec prep" id="risk-intro"><h2>Household risk</h2><p class="hint">A household score for each place you watch, computed <b>on this device</b> from active NWS alerts and USGS quakes for that point plus the threat brief. ' +
        "Levels: <b>Informational</b> (0–14), <b>Low</b> (15–29), <b>Moderate</b> (30–49), <b>High</b> (50–69), <b>Critical</b> (70+). Threat type matters: weather, flood, quake and power hazards count in full; distant conflicts and markets count less. " +
        "The score is the strongest single driver plus a small amount for everything else. It is a planning aid, <b>not an official rating</b>; follow NWS and local officials.</p>" +
        '<div class="row-btns"><button type="button" class="small-btn" id="rk-refresh">Re-check now</button><button type="button" class="small-btn" data-tab-go="sources" data-anchor="v2-locs">Manage locations</button></div></section>' +
        res.map(riskCard).join("");
      var home = res[0], es = $("es-risk");
      if (es && home) { es.hidden = false; es.className = "es-i " + tierCls(home.tier); es.textContent = "Home risk: " + home.tier; }
    });
  }
  V2.panels.risk = function () { paintRisk(false); };
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t.id === "rk-refresh") paintRisk(true);
    var del = t.closest && t.closest("[data-rkdel]");
    if (del && confirm("Stop watching this location?")) { var id = del.getAttribute("data-rkdel"); save(KL, locations().filter(function (l) { return l.id !== id; })); paintRisk(false); paintSettings(); }
  });
  // keep the strip's home-risk chip current without extra network calls (home uses the alert feed the app already loads)
  function homeChip() { scoreLoc(HOME_LOC, false).then(function (res) { var es = $("es-risk"); if (es) { es.hidden = false; es.className = "es-i " + tierCls(res.tier); es.textContent = "Home risk: " + res.tier; } }); }
  function officialChips() {
    document.querySelectorAll("#alerts-root .feed-h .t").forEach(function (t) {
      if (t.querySelector(".lb") || !/NWS|weather\.gov|Earthquake|FEMA|IPAWS|EAS|CISA/i.test(t.textContent)) return;
      t.insertAdjacentHTML("beforeend", " " + V2.labelChip("official"));
    });
  }
  document.addEventListener("ftp-live", function () { homeChip(); officialChips(); if (curTab() === "risk") paintRisk(false); });
  document.addEventListener("ftp-data", function () { setTimeout(homeChip, 50); strip(); });

  // ================= Emergency Mode =================
  var KE = "ftp-v2-emergency";
  function emState() { return load(KE, {}); }
  function cachedAlerts() {
    var live = window.ftpLive && window.ftpLive.nws, src = live && live.data ? live : cachedLive("nws" + (window.FTPLoc ? FTPLoc.key() : ""));
    return { list: src && src.data ? activeNWS(src.data.features) : [], at: src && src.at, live: !!(live && live.live) };
  }
  function emHtml() {
    var d = (window.ftpData && window.ftpData()) || load("ftp-data", null) || {}, o = d.overall || {}, al = cachedAlerts();
    var comms = load("ftp-private-comms", {}), fam = load("ftp-private-family", {}), evac = load("ftp-private-evac", {});
    var people = fam.people || [], plan = (evac.plans || []).filter(function (p) { return p.id === evac.primary; })[0] || (evac.plans || [])[0];
    var tel = function (n) { var c = String(n || "").replace(/[^\d+]/g, ""); return c ? '<a class="em-tel" href="tel:' + esc(c) + '">' + esc(n) + "</a>" : ""; };
    var view = emState().view || "home", body = "";
    if (view === "home") {
      body = '<div class="em-grid">' +
        '<button type="button" class="em-big em-safe" data-em="safe">I\'M SAFE<small>record a check-in on this device</small></button>' +
        '<button type="button" class="em-big" data-em="alerts">ALERTS<small>' + al.list.length + " active (saved copy " + esc(al.at ? V2.ago(al.at) : "none") + ")</small></button>" +
        '<button type="button" class="em-big" data-em="shelter">SHELTER<small>where and how</small></button>' +
        '<button type="button" class="em-big" data-em="evac">EVACUATE<small>' + esc(plan ? plan.name || "Plan" : "no plan saved") + "</small></button>" +
        '<button type="button" class="em-big" data-em="rally">RALLY POINTS<small>meet-up plan</small></button>' +
        '<button type="button" class="em-big" data-em="contacts">CONTACTS<small>family &amp; out-of-area</small></button>' +
        '<button type="button" class="em-big" data-em="radio">RADIO<small>NOAA &amp; family channels</small></button>' +
        '<a class="em-big em-911" href="tel:911">CALL 911<small>opens your phone dialer</small></a></div>';
    } else {
      body = '<button type="button" class="em-back" data-em="home">‹ Back</button>';
      if (view === "safe") {
        body += "<h3>Who is safe?</h3>" + (people.length ? '<div class="em-grid">' + people.map(function (p) { return '<button type="button" class="em-big em-safe" data-emsafe="' + esc(p.id) + '">' + esc(p.name || "Unnamed") + "<small>tap: I'm safe</small></button>"; }).join("") + "</div>"
          : '<p>No family profiles yet. <button type="button" class="em-big em-safe" data-emsafe="me">ME: I\'M SAFE</button></p>') +
          '<p class="em-note">Recorded on this device only. Nobody is notified; tell your coordinator by call, text or radio.</p>' + lastChecks(fam);
      } else if (view === "alerts") {
        body += "<h3>Active official alerts</h3>" + (al.list.length ? al.list.map(function (f) { var p = f.properties; return '<div class="em-alert"><b>' + esc(p.event) + "</b> · until " + esc(V2.ct(p.ends || p.expires)) + "<p>" + esc((p.instruction || p.headline || "").slice(0, 400)) + "</p></div>"; }).join("") : "<p>No active NWS alerts in the last saved copy.</p>") +
          '<p class="em-note">' + (al.at ? (al.live ? "Live as of " : "Saved copy from ") + esc(V2.ct(al.at)) : "No saved alert data on this device yet.") + " Confirm with NOAA Weather Radio 162.550 MHz or local TV/radio.</p>";
      } else if (view === "shelter") {
        body += "<h3>Shelter in place</h3><ol class='em-list'><li><b>Tornado:</b> lowest floor, interior room or basement, away from windows. Cover your head.</li><li><b>Chemical / radiation:</b> get inside, close windows and doors, turn off HVAC/fans, go to a central room. Stay tuned to officials.</li><li><b>Flash flood:</b> move to higher ground; never drive into water.</li><li><b>Active threat:</b> run, hide, fight. Silence phones.</li></ol>" +
          '<p class="em-note">General guidance from Ready.gov and NWS. Follow instructions from officials first.</p>';
      } else if (view === "evac") {
        body += "<h3>Evacuation" + (plan ? ": " + esc(plan.name || "Plan") : "") + "</h3>" + (plan ? '<dl class="em-dl">' +
          [["Go when", plan.trigger], ["Destination", (plan.dests || []).map(function (x) { return x.name + (x.addr ? " — " + x.addr : ""); }).join("\n")], ["Primary route", plan.primary], ["Secondary route", plan.secondary], ["Meet at", plan.meet], ["Hospitals", plan.hospitals], ["Fuel", plan.fuel]]
            .filter(function (r) { return r[1]; }).map(function (r) { return "<dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]).replace(/\n/g, "<br>") + "</dd>"; }).join("") + "</dl>" : "<p>No evacuation plan saved on this device. Add one under Evacuation.</p>") +
          '<p class="em-note">Live routing and traffic are not available in this app. Check official road conditions before you leave if you can.</p>';
      } else if (view === "rally") {
        body += "<h3>Rally points</h3><ol class='em-list'>" + [comms.rally1, comms.rally2, comms.rally3].map(function (r, i) { return "<li>" + (r ? esc(r) : "<i>Rally point " + (i + 1) + " not set</i>") + "</li>"; }).join("") + "</ol>" +
          (comms.checkin ? '<p><b>Check-in plan:</b> ' + esc(comms.checkin) + "</p>" : "");
      } else if (view === "contacts") {
        body += "<h3>Contacts</h3><ul class='em-list'>" + people.map(function (p) { return "<li><b>" + esc(p.name || "Unnamed") + (p.coordinator ? " (coordinator)" : "") + "</b> " + tel(p.phone) + "</li>"; }).join("") +
          (comms.oacName || comms.oacPhone ? "<li><b>Out-of-area contact: " + esc(comms.oacName || "") + "</b> " + tel(comms.oacPhone) + "</li>" : "") + "<li><b>Emergency</b> " + tel("911") + "</li></ul>" +
          '<p class="em-note">Phone numbers open your dialer only when you tap them. Texts often get through when calls do not.</p>';
      } else if (view === "radio") {
        body += "<h3>Radio</h3><ul class='em-list'><li><b>NOAA Weather Radio (St. Louis, KDO89):</b> 162.550 MHz</li>" + (comms.radioPrimary ? "<li><b>Family primary:</b> " + esc(comms.radioPrimary) + "</li>" : "") + (comms.radioBackup ? "<li><b>Family backup:</b> " + esc(comms.radioBackup) + "</li>" : "") +
          "<li><b>2 m ham calling (simplex):</b> 146.520 MHz (license required to transmit, except in a genuine emergency)</li><li><b>GMRS/FRS channel 1:</b> 462.5625 MHz</li></ul>" + '<p class="em-note">Reference only. Full tables are in the Comms section.</p>';
      }
    }
    return '<div class="em-box"><header class="em-h"><div><div class="em-title" id="em-title">EMERGENCY MODE</div><div class="em-sub">' + esc(o.level || "Unknown") + " overall · local " + esc(o.localLevel || "—") +
      " · brief " + esc(d.updated ? V2.ago(d.updated) : "not loaded") + " · " + (navigator.onLine ? "online" : "OFFLINE (saved data)") + '</div></div><button type="button" class="em-exit" id="em-exit">EXIT ✕</button></header>' + body +
      '<p class="em-foot">Emergency Mode only changes this screen. It does not call, text, share location or alert anyone.</p></div>';
  }
  function lastChecks(fam) {
    var cs = (fam.checkins || []).slice(-5).reverse(), ppl = fam.people || [];
    if (!cs.length) return "";
    return '<div class="em-note"><b>Recent check-ins (this device):</b><br>' + cs.map(function (c) { var p = ppl.filter(function (x) { return x.id === c.pid; })[0]; return esc((p && p.name) || (c.pid === "me" ? "Me" : "Someone")) + " — " + esc(c.status === "help" ? "NEEDS HELP" : "safe") + " · " + esc(V2.ct(c.at)); }).join("<br>") + "</div>";
  }
  function emRender() { var r = $("em-root"); if (r) r.innerHTML = emHtml(); }
  function emOpen() {
    var s = emState(); s.on = true; s.since = s.since || new Date().toISOString(); s.view = s.view || "home"; save(KE, s);
    var r = $("em-root"); r.hidden = false; document.documentElement.classList.add("v2-em"); emRender();
    var x = $("em-exit"); if (x) x.focus();
  }
  function emClose() { save(KE, {}); var r = $("em-root"); r.hidden = true; r.innerHTML = ""; document.documentElement.classList.remove("v2-em"); var b = $("em-open"); if (b) b.focus(); }
  function emConfirm() {
    var r = $("em-root"); r.hidden = false;
    r.innerHTML = '<div class="em-box em-confirm"><div class="em-title" id="em-title">Turn on Emergency Mode?</div><p>Big buttons for check-ins, alerts, shelter, evacuation, rally points, contacts and radio. It works offline from the last saved data.</p><p><b>It does not call, text, share your location or alert anyone.</b> You can exit at any time.</p>' +
      '<div class="em-cbtns"><button type="button" class="em-big em-go" id="em-yes">TURN ON</button><button type="button" class="em-big" id="em-no">Cancel</button></div></div>';
    $("em-yes").focus();
  }
  V2.emergency = { open: emOpen, close: emClose, confirm: emConfirm, state: emState };
  document.addEventListener("click", function (e) {
    var t = e.target, c = t.closest ? t : t.parentNode;
    if (c.closest("#em-open")) { emConfirm(); return; }
    if (c.closest("#em-yes")) { emOpen(); return; }
    if (c.closest("#em-no")) { var r = $("em-root"); r.hidden = true; r.innerHTML = ""; return; }
    if (c.closest("#em-exit")) { emClose(); return; }
    var v = c.closest("[data-em]"); if (v) { var s = emState(); s.view = v.getAttribute("data-em"); save(KE, s); emRender(); return; }
    var sf = c.closest("[data-emsafe]");
    if (sf && V2.family) { V2.family.checkin(sf.getAttribute("data-emsafe"), "safe"); emRender(); if (window.ftpToast) ftpToast("Check-in saved on this device"); }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("em-root").hidden) { if (emState().on) emClose(); else { $("em-root").hidden = true; $("em-root").innerHTML = ""; } } });
  document.addEventListener("ftp-live", function () { if (emState().on) emRender(); });
  if (emState().on || location.hash === "#emergency") setTimeout(function () { if (location.hash === "#emergency" && !emState().on) emConfirm(); else emOpen(); }, 300);

  // ================= Sources & settings =================
  function paintHealth() { var r = $("health-root"); if (r) r.innerHTML = V2.healthHtml() + labelsHtml(); }
  function labelsHtml() {
    return '<section class="prep xp-sec" id="v2-labels"><h2>How information is labeled</h2><ul class="lb-legend">' + Object.keys(V2.LABELS).map(function (k) { return "<li>" + V2.labelChip(k) + " " + esc(V2.LABELS[k].d) + "</li>"; }).join("") +
      '</ul><p class="d">Every threat card shows its source and "as of" time. When the brief does not mark an item, the app labels its level and summary as an <b>AI assessment</b>, and adds <b>Developing*</b> when the wording says a claim is not yet confirmed (the * means it was flagged automatically). Alerts from NWS, USGS, FEMA and IPAWS are official alerts.</p></section>';
  }
  function notifHtml() {
    var perm = "Notification" in window ? Notification.permission : "unsupported", ios = /iPad|iPhone|iPod/.test(navigator.userAgent), standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    var fam = load("ftp-private-family", {});
    return '<section class="prep xp-sec" id="v2-notif"><h2>Notification settings</h2>' +
      '<dl class="kv"><dt>Browser permission</dt><dd>' + esc(perm) + "</dd><dt>Installed app</dt><dd>" + (standalone ? "Yes" : "No (opened in a browser tab)") + "</dd><dt>Threat &amp; weather alerts</dt><dd>" + (window.ftpNotifOn && ftpNotifOn() ? "On" : "Off") + ' · <button type="button" class="linkish" data-tab-go="alerts" data-anchor="push-root">change in Alerts</button></dd>' +
      "<dt>Check-in overdue reminders</dt><dd>" + (fam.remind ? "On" : "Off") + ' · <button type="button" class="linkish" data-tab-go="family" data-anchor="fam-checkin">change in Family safety</button></dd></dl>' +
      '<h3>What works, honestly</h3><ul class="d"><li><b>App open:</b> official alerts are checked every 5 minutes and can notify.</li><li><b>App closed, Android Chrome installed app:</b> the browser may run a background check about hourly (Periodic Background Sync). The browser decides when; it can be much less often.</li>' +
      '<li><b>App closed, iPhone/iPad:</b> needs iOS 16.4+ and the app added to the Home Screen; iOS gives web apps no background checks without a push server, which this free site does not have.</li><li><b>Check-in reminders</b> are local only: they fire while the app is open on this device.</li>' +
      "<li><b>True push with the app closed</b> needs a push server (see the v2 plan). Today the family's optional ntfy channel (twice-daily, set up on the update box) is the only closed-app path.</li></ul>" + (ios && !standalone ? '<p class="d"><b>This looks like an iPhone/iPad in a browser tab:</b> add to the Home Screen first, then enable alerts from the installed app.</p>' : "") + "</section>";
  }
  function locsHtml() {
    var ls = locations();
    return '<section class="prep xp-sec" id="v2-locs"><h2>Monitoring locations</h2><p class="hint">Places scored in Household risk. Saved only on this device. Searching sends only the city/ZIP text to the Open-Meteo geocoder; points are rounded to about 1 km. Use public places (a city, ZIP or county), not exact addresses.</p>' +
      '<ul class="loc-list">' + ls.map(function (l) { return "<li><b>" + esc(l.name) + '</b> <span class="d">' + (+l.lat).toFixed(2) + ", " + (+l.lon).toFixed(2) + "</span> " + (l.id === "home" ? '<span class="d">(default: generic metro point)</span>' : kindSel(l.kind || (l.home ? "home" : "other"), 'data-lckind="' + esc(l.id) + '"') + ' <button type="button" class="small-btn" data-rkdel="' + esc(l.id) + '">Remove</button>') + "</li>"; }).join("") + "</ul>" +
      '<p class="d">Choose <b>Primary residence</b> for one place to use it instead of the generic metro point. Places, kinds and names never leave this device; only the city/ZIP text you search is sent to the geocoder.</p>' +
      '<form class="comms"><label>Kind of place ' + kindSel("other", 'id="lc-kind"') + '</label><label>Add a city or ZIP<input id="lc-q" autocomplete="off" placeholder="e.g. Springfield, IL or 62269"></label><div class="row-btns"><button type="button" class="small-btn primary" id="lc-find">Search</button></div><div id="lc-res"></div>' +
      '<details><summary>Or enter coordinates</summary><label>Name<input id="lc-name" autocomplete="off"></label><label>Latitude<input id="lc-lat" inputmode="decimal"></label><label>Longitude<input id="lc-lon" inputmode="decimal"></label><div class="row-btns"><button type="button" class="small-btn" id="lc-add">Add</button></div></details></form></section>';
  }
  function dataHtml() {
    var keys = Object.keys(localStorage).filter(function (k) { return /^ftp-private-/.test(k); });
    return '<section class="prep xp-sec" id="v2-data"><h2>Data on this device</h2><p class="hint">All family plans, check-ins, inventory, locations and the medical vault stay in this browser on this device. None of it is in the public site or its code, and nothing is uploaded. Another phone has its own separate copy (no sync).</p>' +
      '<p class="d">' + keys.length + " private item group" + (keys.length === 1 ? "" : "s") + " stored: " + esc(keys.map(function (k) { return k.replace("ftp-private-", ""); }).join(", ") || "none") + ". The medical vault is stored encrypted in IndexedDB.</p>" +
      '<div class="row-btns"><button type="button" class="small-btn" id="dv-export">Download plans backup (not encrypted, excludes medical)</button><label class="small-btn file-btn">Restore plans backup<input type="file" id="dv-import" accept="application/json,.json" hidden></label><button type="button" class="small-btn danger" id="dv-wipe">Erase all private data on this device</button></div></section>';
  }
  // ---- Personalization: home label, private context note, pinned camera groups. Stored only in localStorage
  // (ftp-private-personal); never uploaded. The public site and its data stay generic.
  var KP = "ftp-private-personal", camDraft = [];
  function personal() { var p = load(KP, {}); p.camGroups = p.camGroups || []; return p; }
  function personalHtml() {
    var p = personal();
    return '<section class="prep xp-sec" id="v2-personal"><h2>Personalization (this device only)</h2><p class="hint">The public site is written for a generic St. Louis Metro East household. Anything you enter here stays in this browser, is never uploaded and is not in the site or its code.</p>' +
      '<form class="comms"><label>Home area label (shown in the header)<input id="ps-home" autocomplete="off" maxlength="60" placeholder="St. Louis Metro East" value="' + esc(p.homeLabel || "") + '"></label>' +
      '<label>Household context note (shown on Overview, this device only)<textarea id="ps-context" rows="3" maxlength="600" placeholder="e.g. who needs pickup, work and activity schedules">' + esc(p.context || "") + "</textarea></label>" +
      '<div class="row-btns"><button type="button" class="small-btn primary" id="ps-save">Save</button></div></form>' +
      "<h3>Pinned camera groups</h3><p class=\"hint\">Pinned groups open first in Live cameras and IDOT views start automatically. Search the public IDOT/MoDOT camera list by road or cross street.</p>" +
      '<ul class="loc-list" id="ps-groups">' + (p.camGroups.length ? p.camGroups.map(function (g) { return "<li><b>" + esc(g.title) + '</b> <span class="d">' + g.keys.length + ' camera view(s)</span> <button type="button" class="small-btn" data-psdel="' + esc(g.id) + '">Remove</button></li>'; }).join("") : '<li class="d">None yet.</li>') + "</ul>" +
      '<form class="comms"><label>New group name<input id="ps-gname" autocomplete="off" maxlength="60" placeholder="e.g. My commute"></label><label>Find cameras<input id="ps-cq" autocomplete="off" placeholder="e.g. Airport, IL 15, I-64"></label>' +
      '<div class="row-btns"><button type="button" class="small-btn" id="ps-cfind">Search cameras</button></div><div id="ps-cres"></div><p class="d" id="ps-draft">' + draftText() + '</p>' +
      '<div class="row-btns"><button type="button" class="small-btn primary" id="ps-gsave">Save group</button></div></form></section>';
  }
  function draftText() { return camDraft.length ? "Selected: " + camDraft.length + " camera view(s)." : "No cameras selected yet."; }
  function personalChanged() { paintSettings(); try { document.dispatchEvent(new Event("ftp-personal")); } catch (e) {}
    var p = personal(), lc = $("loc"); if (lc && p.homeLabel) lc.textContent = p.homeLabel;
    var pn = $("personal-note"); if (pn) { pn.hidden = !p.context; pn.textContent = p.context ? "Your note (this device only): " + p.context : ""; } }
  document.addEventListener("click", function (e) {
    var t = e.target; if (!t || !t.closest) return;
    if (t.id === "ps-save") { var p = personal(); p.homeLabel = ($("ps-home").value || "").trim().slice(0, 60); p.context = ($("ps-context").value || "").trim().slice(0, 600); save(KP, p); personalChanged(); if (window.ftpToast) ftpToast("Saved on this device"); }
    var d = t.closest("[data-psdel]"); if (d && confirm("Remove this pinned camera group?")) { var p2 = personal(); p2.camGroups = p2.camGroups.filter(function (g) { return g.id !== d.getAttribute("data-psdel"); }); save(KP, p2); personalChanged(); }
    if (t.id === "ps-cfind") {
      var q = ($("ps-cq").value || "").trim().toLowerCase(), out = $("ps-cres"); if (!q) return;
      fetch("feeds.json").then(function (r) { return r.json(); }).then(function (f) {
        var by = (f.cameras && f.cameras.cameras) || {}, ks = Object.keys(by).filter(function (k) { return String(by[k].name || "").toLowerCase().indexOf(q) >= 0; }).slice(0, 25);
        out.innerHTML = ks.length ? '<ul class="loc-list">' + ks.map(function (k) { var c = by[k]; return "<li>" + esc(c.name) + (c.direction ? " (" + esc(c.direction) + ")" : "") + ' <span class="d">' + esc(c.agency) + '</span> <button type="button" class="small-btn" data-psadd="' + esc(k) + '">' + (camDraft.indexOf(k) >= 0 ? "Added" : "Add") + "</button></li>"; }).join("") + "</ul>" : '<p class="d">No camera matches.</p>';
      }).catch(function () { out.innerHTML = '<p class="d">Camera list is not available offline yet.</p>'; });
    }
    var a = t.closest("[data-psadd]"); if (a) { var k = a.getAttribute("data-psadd"); if (camDraft.indexOf(k) < 0) camDraft.push(k); a.textContent = "Added"; var dr = $("ps-draft"); if (dr) dr.textContent = draftText(); }
    if (t.id === "ps-gsave") {
      if (!camDraft.length) { alert("Search and add at least one camera first."); return; }
      var p3 = personal(); p3.camGroups.push({ id: "g" + V2.uid(), title: (($("ps-gname").value || "").trim() || "My cameras").slice(0, 60), keys: camDraft.slice(0, 40) }); save(KP, p3); camDraft = []; personalChanged(); if (window.ftpToast) ftpToast("Camera group saved on this device");
    }
  });
  function paintSettings() { var r = $("settings-root"); if (r) r.innerHTML = personalHtml() + locsHtml() + notifHtml() + dataHtml(); }
  V2.panels.sources = function () { paintHealth(); paintSettings(); };
  function round2(x) { return Math.round(+x * 100) / 100; }
  function addLoc(name, lat, lon) {
    lat = round2(lat); lon = round2(lon); if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
    var kind = ($("lc-kind") && $("lc-kind").value) || "other", ls = locations();
    if (kind === "home") ls = ls.filter(function (l) { return l.id !== "home"; }).map(function (l) { if (l.home) { l.home = false; l.kind = "other"; } return l; });
    ls.push({ id: "l" + V2.uid(), name: String(name || "Location").replace(/[<>]/g, "").slice(0, 60), lat: lat, lon: lon, kind: kind, home: kind === "home" || undefined });
    save(KL, ls); paintSettings(); document.dispatchEvent(new CustomEvent("ftp-places")); return true;
  }
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t.id === "sh-refresh" && window.ftpRefresh) ftpRefresh().then(paintHealth);
    if (t.id === "lc-find") {
      var q = ($("lc-q").value || "").trim(), out = $("lc-res"); if (!q) return; out.innerHTML = '<p class="d">Searching…</p>';
      fetch("https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&countryCode=US&name=" + encodeURIComponent(q)).then(function (r) { return r.json(); }).then(function (d) {
        var rs = d.results || []; out.innerHTML = rs.length ? '<ul class="loc-list">' + rs.map(function (x) { var nm = x.name + (x.admin1 ? ", " + x.admin1 : ""); return "<li>" + esc(nm) + ' <button type="button" class="small-btn primary" data-lcadd="' + esc(JSON.stringify([nm, x.latitude, x.longitude])) + '">Add</button></li>'; }).join("") + "</ul>" : '<p class="d">No US match.</p>';
      }).catch(function () { out.innerHTML = '<p class="d">Search needs a connection. You can enter coordinates instead.</p>'; });
    }
    var la = t.closest && t.closest("[data-lcadd]"); if (la) { var a = JSON.parse(la.getAttribute("data-lcadd")); addLoc(a[0], a[1], a[2]); }
    if (t.id === "lc-add") { if (!addLoc($("lc-name").value || "Location", $("lc-lat").value, $("lc-lon").value)) alert("Enter a latitude between -90 and 90 and a longitude between -180 and 180."); }
    if (t.id === "dv-export") {
      var out2 = { format: "ftp-plans-backup", v: 1, exportedAt: new Date().toISOString(), items: {} };
      Object.keys(localStorage).filter(function (k) { return /^ftp-private-/.test(k) && k !== "ftp-private-medical"; }).forEach(function (k) { out2.items[k] = localStorage.getItem(k); });
      V2.download("threat-picture-plans-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(out2, null, 1), "application/json");
    }
    if (t.id === "dv-wipe" && confirm("Erase ALL private data on this device: family profiles, check-ins, plans, inventory, locations and the medical vault? This cannot be undone.")) {
      Object.keys(localStorage).filter(function (k) { return /^ftp-private-/.test(k); }).forEach(function (k) { localStorage.removeItem(k); });
      if (window.FTPVault && FTPVault.wipe) FTPVault.wipe();
      paintSettings(); strip(); if (window.ftpToast) ftpToast("Private data erased on this device");
    }
  });
  document.addEventListener("change", function (e) {
    var kc = e.target.closest && e.target.closest("[data-lckind]");
    if (kc) {
      var id = kc.getAttribute("data-lckind"), k = kc.value, ls = locations().filter(function (l) { return !(k === "home" && l.id === "home"); });
      ls.forEach(function (l) { if (l.id === id) { l.kind = k; l.home = k === "home" || undefined; } else if (k === "home" && l.home) { l.home = undefined; l.kind = "other"; } });
      if (!ls.some(function (l) { return l.home; })) ls = ls.filter(function (l) { return l.id !== "home"; });
      save(KL, ls); paintSettings(); document.dispatchEvent(new CustomEvent("ftp-places")); return;
    }
    if (e.target.id !== "dv-import" || !e.target.files[0]) return;
    var fr = new FileReader(); fr.onload = function () {
      try {
        var j = JSON.parse(fr.result); if (j.format !== "ftp-plans-backup" || !j.items) throw 0;
        if (!confirm("Replace the plans on this device with this backup (" + Object.keys(j.items).length + " groups)?")) return;
        Object.keys(j.items).forEach(function (k) { if (/^ftp-private-/.test(k) && k !== "ftp-private-medical" && typeof j.items[k] === "string") localStorage.setItem(k, j.items[k]); });
        paintSettings(); strip(); if (window.ftpToast) ftpToast("Plans restored on this device");
      } catch (x) { alert("That file is not a Threat Picture plans backup."); }
    }; fr.readAsText(e.target.files[0]);
  });
  V2.download = function (name, text, type) {
    var a = document.createElement("a"), u = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 1000);
  };
  V2.printHtml = function (html) {
    var area = $("print-area"); if (!area) { area = document.createElement("div"); area.id = "print-area"; document.body.appendChild(area); }
    area.innerHTML = html; document.body.classList.add("print-cards");
    var done = function () { document.body.classList.remove("print-cards"); area.innerHTML = ""; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    setTimeout(function () { window.print(); if (!("onafterprint" in window)) setTimeout(done, 1000); }, 50);
  };
  document.addEventListener("ftp-refresh", function () { if (curTab() === "risk") paintRisk(true); if (curTab() === "sources") paintHealth(); });

  strip(); decorate(); deepNew(); heroFor(curTab());
})();
