/* Live official alerts + traffic cameras. Browser-fetchable (CORS) sources are pulled live;
   the rest come from feeds.json, which the box rebuilds twice daily (fetch_feeds.py). */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : "#"; }
  function ct(t) {
    var d = new Date(t); if (isNaN(d)) return t || "";
    return d.toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " CT";
  }
  // fetch JSON with a localStorage fallback so the tab still works offline
  function getJSON(key, url, timeoutMs, bust) {
    // Refresh: our own data files get a cache-buster so no CDN/SW copy can answer; third-party APIs (NWS, USGS, FEMA)
    // reject unknown query params and never pass through the service worker, so for them cache:"no-store" is enough.
    if (bust && !/^https?:/i.test(url)) url += (url.indexOf("?") < 0 ? "?" : "&") + "t=" + Date.now();
    var ctl = "AbortController" in window ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs || 15000) : null;
    return fetch(url, { cache: "no-store", signal: ctl ? ctl.signal : undefined, headers: { Accept: "application/geo+json, application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); if (r.headers.get("X-FTP-Saved")) throw new Error("saved copy"); return r.json(); })
      .then(function (d) { clearTimeout(t); var rec = { at: new Date().toISOString(), data: d }; try { localStorage.setItem("ftp-live-" + key, JSON.stringify(rec)); } catch (e) {} return { live: true, at: rec.at, data: d }; })
      .catch(function () {
        clearTimeout(t);
        var rec = null; try { rec = JSON.parse(localStorage.getItem("ftp-live-" + key) || "null"); } catch (e) {}
        if (rec) return { live: false, at: rec.at, data: rec.data };
        return { live: false, at: null, data: null };
      });
  }

  var NWS_ZONES = "ILC163,ILZ101,MOC510,MOZ064,MOC189,MOZ063"; // St. Clair Co IL; St. Louis City; St. Louis Co
  function away() { return window.FTPLoc && !FTPLoc.isHome(); }
  function quakeCenter() { var l = window.FTPLoc && FTPLoc.get(); return away() ? [l.lat, l.lon] : [36.59, -89.59]; }   // home watches the New Madrid zone
  function femaStates() { return away() && FTPLoc.get().state ? [FTPLoc.get().state] : ["IL", "MO"]; }
  function nwsTitle() { return "NWS watches & warnings (" + (window.FTPLoc ? FTPLoc.label() : "St. Clair Co. IL, St. Louis city & county") + ")"; }
  function nwsLink() { var l = window.FTPLoc && FTPLoc.get(); return away() && l.nws && l.nws.cwa ? ["https://www.weather.gov/" + l.nws.cwa.toLowerCase() + "/", "NWS " + l.nws.cwa] : ["https://www.weather.gov/lsx/", "NWS St. Louis"]; }
  function quakeTitle() { return "Earthquakes within 300 km of " + (away() ? FTPLoc.get().label : "New Madrid") + " (30 days, M1.5+)"; }
  function femaTitle() { return "FEMA disaster declarations, " + femaStates().join(" & ") + " (180 days)"; }
  var SRC = {
    // home: our six NWS zones; elsewhere (location switcher): alerts for the chosen point
    nws: function () { return window.FTPLoc ? FTPLoc.alertsUrl(NWS_ZONES) : "https://api.weather.gov/alerts/active?zone=" + NWS_ZONES; },
    usgs: function () {
      var start = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), c = quakeCenter();
      return "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=" + c[0] + "&longitude=" + c[1] + "&maxradiuskm=300&minmagnitude=1.5&orderby=time&limit=25&starttime=" + start;
    },
    fema: function () {
      var since = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10);
      return "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$select=disasterNumber,state,declarationTitle,incidentType,declarationDate,declarationType,designatedArea&$filter=" +
        encodeURIComponent("(" + femaStates().map(function (st) { return "state eq '" + st + "'"; }).join(" or ") + ") and declarationDate ge '" + since + "'") + "&$orderby=declarationDate%20desc&$top=200";
    }
  };

  function feedBox(title, res, bodyHtml, link, linkText) {
    var status = !res.at ? "Unavailable" : res.box ? "Updated " + ct(res.at) + (navigator.onLine ? "" : " (offline)") : (res.live ? "Live · " + ct(res.at) : "Offline copy · " + ct(res.at));
    return '<section class="feed"><div class="feed-h"><span class="t">' + esc(title) + '</span><span class="s' + (res.live ? "" : " off") + '">' + esc(status) + "</span></div>" +
      bodyHtml + (link ? '<a class="foot-link" href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(linkText || "Official source") + " ↗</a>" : "") + "</section>";
  }
  function none(t) { return '<div class="none">' + esc(t) + "</div>"; }

  // Only alerts that are real and still in effect right now: no tests/exercises, no cancellations, nothing that has
  // ended or been superseded. Used for both the list and the tab badge, so they always agree, and re-applied to
  // saved offline copies so an old warning can't linger after it ends.
  function activeNWS(features, now) {
    now = now || Date.now();
    var seen = {};
    return (features || []).filter(function (x) {
      var p = x && x.properties || {}, end = new Date(p.ends || p.expires).getTime();
      if (p.status !== "Actual" || p.messageType === "Cancel" || p.replacedBy || seen[p.id]) return false;
      if (!isNaN(end) && end <= now) return false;
      seen[p.id] = 1; return true;
    });
  }
  window.ftpActiveNWS = activeNWS;
  function renderNWS(res) {
    var f = res.data && res.data.features && activeNWS(res.data.features);
    if (!f) return feedBox(nwsTitle(), res, none("Could not reach weather.gov."), nwsLink()[0], nwsLink()[1]);
    var body = f.length ? "<ul>" + f.map(function (x) {
      var p = x.properties;
      return '<li class="sev-' + esc(p.severity) + '"><a href="' + esc(safeUrl(p["@id"] || p.id)) + '" target="_blank" rel="noopener"><b>' + esc(p.event) + "</b> <span class=\"d\">" + esc(p.severity) + "</span><div class=\"d\">" +
        esc(p.headline || "") + "</div><div class=\"d\">Until " + esc(ct(p.ends || p.expires)) + "</div></a></li>";
    }).join("") + "</ul>" : none("No active NWS alerts for these areas.");
    return feedBox(nwsTitle(), res, body, nwsLink()[0], nwsLink()[1]);
  }
  function renderUSGS(res) {
    var f = res.data && res.data.features;
    if (!f) return feedBox(quakeTitle(), res, none("Could not reach USGS."), "https://earthquake.usgs.gov/earthquakes/map/", "USGS map");
    var max = f.reduce(function (m, x) { return Math.max(m, x.properties.mag || 0); }, 0);
    var body = '<div class="none">' + f.length + " quakes" + (f.length ? ", largest M" + max.toFixed(1) : "") + (f.length >= 25 ? " (latest 25 shown)" : "") + "</div>" +
      (f.length ? "<ul>" + f.slice(0, 10).map(function (x) {
        var p = x.properties;
        return '<li><a href="' + esc(safeUrl(p.url)) + '" target="_blank" rel="noopener"><span class="mag">M' + esc((p.mag || 0).toFixed(1)) + "</span> " + esc(p.place) + '<div class="d">' + esc(ct(p.time)) + "</div></a></li>";
      }).join("") + "</ul>" : "");
    return feedBox(quakeTitle(), res, body, "https://earthquake.usgs.gov/earthquakes/map/", "USGS map");
  }
  function renderFEMA(res) {
    var rows = res.data && res.data.DisasterDeclarationsSummaries;
    if (!rows) return feedBox(femaTitle(), res, none("Could not reach OpenFEMA."), "https://www.fema.gov/disaster/declarations", "FEMA declarations");
    var seen = {}, list = [];
    rows.forEach(function (r) { if (!seen[r.disasterNumber]) { seen[r.disasterNumber] = 1; list.push(r); } });
    var body = list.length ? "<ul>" + list.slice(0, 8).map(function (r) {
      return '<li><a href="https://www.fema.gov/disaster/' + esc(r.disasterNumber) + '" target="_blank" rel="noopener"><b>' + esc(r.state) + " · " + esc(r.declarationTitle) + '</b><div class="d">' + esc(r.incidentType) + " · " + esc(r.declarationType) + " " + esc(r.disasterNumber) + " · declared " + esc(ct(r.declarationDate)) + "</div></a></li>";
    }).join("") + "</ul>" : none("No new federal disaster declarations for Illinois or Missouri in the last 180 days.");
    return feedBox(femaTitle(), res, body, "https://www.fema.gov/disaster/declarations", "FEMA declarations");
  }
  function renderBoxFeeds(res) {
    var d = res.data || {}; var out = "";
    var boxRes = { box: true, live: res.live, at: d.generated || res.at };
    var ip = d.ipaws || {};
    out += feedBox("FEMA IPAWS emergency alerts, IL & MO (updated twice daily)" + (away() ? " · St. Louis area only" : ""), boxRes,
      (ip.items && ip.items.length) ? "<ul>" + ip.items.map(function (x) {
        return '<li><a href="' + esc(safeUrl(x.url)) + '" target="_blank" rel="noopener"><b>' + esc(x.state) + " · " + esc(x.eventName) + '</b><div class="d">' + esc(ct(x.updated)) + "</div></a></li>";
      }).join("") + "</ul>" : none(ip.items ? "No IPAWS emergency alert messages for Illinois or Missouri in the current public feed." : "Not available yet."),
      "https://www.fema.gov/emergency-managers/practitioners/integrated-public-alert-warning-system", "About IPAWS");
    var kev = d.cisaKev || {};
    out += feedBox("CISA: newly exploited vulnerabilities (" + (kev.windowDays || 14) + " days, updated twice daily)", boxRes,
      (kev.items && kev.items.length) ? "<ul>" + kev.items.slice(0, 8).map(function (x) {
        return '<li><a href="' + esc(safeUrl(x.url)) + '" target="_blank" rel="noopener"><b>' + esc(x.vendor) + " " + esc(x.product) + "</b>" + (x.ransomware ? ' <span class="d" style="color:var(--severe)">ransomware</span>' : "") +
          '<div class="d">' + esc(x.cve) + " · added " + esc(x.dateAdded) + "</div></a></li>";
      }).join("") + "</ul>" : none("No recent additions."), "https://www.cisa.gov/known-exploited-vulnerabilities-catalog", "CISA KEV catalog");
    var adv = d.cisaAdvisories || [];
    out += feedBox("CISA advisories & alerts (updated twice daily)", boxRes,
      adv.length ? "<ul>" + adv.slice(0, 6).map(function (x) {
        return '<li><a href="' + esc(safeUrl(x.url)) + '" target="_blank" rel="noopener">' + esc(x.title) + '<div class="d">' + esc(ct(x.date)) + "</div></a></li>";
      }).join("") + "</ul>" : none("Not available yet."), "https://www.cisa.gov/news-events/cybersecurity-advisories", "CISA advisories");
    return out;
  }

  var feedsPromise = null;
  function loadFeeds(bust) { feedsPromise = getJSON("feeds", "feeds.json", 15000, bust); return feedsPromise; }

  // Tab badge = number of NWS alerts in the "NWS watches & warnings" list (active, real, for our zones). Hidden at 0.
  function badge() {
    var nws = window.ftpLive && window.ftpLive.nws, n = nws && nws.data ? activeNWS(nws.data.features).length : 0;
    var tab = document.querySelector('[data-tab="alerts"]'); if (!tab) return n;
    tab.textContent = n ? "Alerts (" + n + ")" : "Alerts";
    if (n) tab.setAttribute("aria-label", "Alerts, " + n + " active weather alert" + (n > 1 ? "s" : "")); else tab.removeAttribute("aria-label");
    return n;
  }
  function loadAlerts(bust) {
    var root = $("alerts-root"); if (!root.innerHTML) root.innerHTML = '<div class="hint">Loading official alerts…</div>';
    var lk = window.FTPLoc ? FTPLoc.key() : "";   // offline copies are kept per place
    return Promise.all([getJSON("nws" + lk, SRC.nws(), 15000, bust), getJSON("usgs" + lk, SRC.usgs(), 15000, bust), getJSON("fema" + lk, SRC.fema(), 15000, bust), loadFeeds(bust)]).then(function (r) {
      root.innerHTML = renderNWS(r[0]) + renderUSGS(r[1]) + renderFEMA(r[2]) + renderBoxFeeds(r[3]);
      window.ftpLive = { nws: r[0], usgs: r[1], fema: r[2], feeds: r[3], at: Date.now() };
      document.dispatchEvent(new CustomEvent("ftp-live"));
      badge();
      return window.ftpLive;
    });
  }
  window.ftpLoadAlerts = loadAlerts; window.ftpAlertBadge = badge;
  document.addEventListener("ftp-loc", function () { loadAlerts(true); });
  // keep the badge honest while the app stays open: drop alerts the moment they end, re-fetch every 5 minutes
  setInterval(badge, 60e3);
  setInterval(function () { if (document.visibilityState === "visible" && navigator.onLine && (!window.ftpLive || Date.now() - window.ftpLive.at > 4.5 * 60e3)) loadAlerts(); }, 5 * 60e3);

  // ---------- Cameras ----------
  var camsRendered = false, players = [];
  function stopAll() {
    players.forEach(function (p) { try { p.pl.stop(); } catch (e) {} if (p.reset) p.reset(); });
    players = [];
  }
  function play(btn) {
    var tile = btn.closest(".cam"), media = tile.querySelector(".media"), url = tile.getAttribute("data-hls");
    stopAll();
    var orig = media.innerHTML, link = tile.querySelector("a[href]");
    var pl = window.FTPCamPlayer.start(media, url, { official: link ? link.href : "https://traveler.modot.org/map/", officialText: "Open official MoDOT map ↗" });
    players.push({ pl: pl, reset: function () { media.innerHTML = orig; } });
  }
  // ---- IDOT: official Travel Midwest viewer, framed in-app (the viewer page allows framing) ----
  var frames = [];
  function stopFrames(scope) {
    frames = frames.filter(function (f) {
      if (scope && !scope.contains(f.tile)) return true;
      f.pl.stop(); f.tile.querySelector(".media").innerHTML = f.idle; f.tile.classList.remove("live"); return false;
    });
  }
  function startFrame(tile) {
    if (frames.some(function (f) { return f.tile === tile; })) return;
    var media = tile.querySelector(".media"), url = tile.getAttribute("data-viewer"), idle = media.innerHTML;
    media.innerHTML = '<div class="idot-viewer"></div><div class="fr-bar"><span class="fr-time">Loading camera…</span><button type="button" class="fr-stop">Stop</button></div>';
    var label = media.querySelector(".fr-time");
    var pl = window.FTPCamPlayer.startFrame(media.querySelector(".idot-viewer"), url, { title: tile.getAttribute("data-name") + " (official IDOT / Travel Midwest viewer)", onStatus: function (text) { label.textContent = text; } });
    var f = { tile: tile, idle: idle, pl: pl };
    frames.push(f); tile.classList.add("live");
  }
  function autoStartFamily() {
    document.querySelectorAll('#cams-root details.camgrp.family[open] .cam.idot').forEach(startFrame);
  }
  function camTile(c) {
    var name = esc(c.name) + (c.direction ? " (" + esc(c.direction) + ")" : "");
    var media;
    // IDOT stills are hotlink-protected (403 when embedded on another site), so open the official viewer instead.
    if (c.agency === "IDOT") media = '<button type="button" class="play view-here">▶ View here</button>';
    else if (c.hls) media = '<button class="play" type="button">▶ Live video</button>';
    else media = '<div class="err">No public image</div>';
    if (c.agency === "IDOT") name = esc(c.name) + (c.dirs && c.dirs.length > 1 ? ' <span class="tag">(' + esc(c.dirs.join("/")) + " views)</span>" : c.direction ? " (" + esc(c.direction) + ")" : "");
    return '<div class="cam' + (c.agency === "IDOT" ? " idot" : "") + (c.stale ? " stale" : "") + '"' + (c.hls ? ' data-hls="' + esc(c.hls) + '"' : "") + (c.agency === "IDOT" ? ' data-viewer="' + esc(safeUrl(c.viewer)) + '" data-name="' + esc(c.name) + '"' : "") + '><div class="media">' + media + '</div><div class="cap"><div>' + name +
      '<div class="tag">' + esc(c.agency) + (c.agency === "IDOT" ? " · official Travel Midwest viewer" : " live video") + '</div></div><a href="' + esc(safeUrl(c.viewer)) + '" target="_blank" rel="noopener">' + (c.agency === "MoDOT" ? "MoDOT map ↗" : "Open in official viewer ↗") + "</a></div></div>";
  }
  function renderCams(res) {
    var root = $("cams-root"), cams = res.data && res.data.cameras;
    if (!cams) { root.innerHTML = '<div class="hint">Camera list not available yet. Official viewers: <a href="https://traveler.modot.org/map/" target="_blank" rel="noopener">MoDOT Traveler Map</a> · <a href="https://www.gettingaroundillinois.com/Traveler%20Information/index.html" target="_blank" rel="noopener">Getting Around Illinois</a></div>'; return; }
    var by = cams.cameras;
    function collapse(keys) {
      var seen = {}, out = [];
      keys.forEach(function (k) {
        var c = by[k]; if (!c) return;
        if (c.agency !== "IDOT") { out.push(k); return; }
        var loc = k.split("-").slice(0, 2).join("-");
        if (!seen[loc]) { seen[loc] = { k: k, dirs: [] }; out.push(k); }
        if (c.direction) seen[loc].dirs.push(c.direction);
        by[seen[loc].k].dirs = seen[loc].dirs;
      });
      return out;
    }
    root.innerHTML = (res.live ? "" : '<div class="hint">Offline: camera list from ' + esc(ct(res.data.generated)) + ". Images need a connection.</div>") +
      cams.groups.map(function (g, i) {
        var open = g.family || g.id === "bridges";
        var keys = collapse(g.keys);
        return '<details class="camgrp' + (g.family ? " family" : "") + '" data-g="' + esc(g.id) + '"' + (open ? " open" : "") + '><summary><span>' + esc(g.title) + '</span><span class="n">' + keys.length + "</span></summary>" +
          (g.note ? '<div class="note">' + esc(g.note) + "</div>" : "") +
          '<div class="camgrid" data-keys="' + esc(keys.join(",")) + '">' + (open ? keys.map(function (k) { return camTile(by[k]); }).join("") : "") + "</div></details>";
      }).join("") +
      '<div class="hint">Official viewers: <a href="https://traveler.modot.org/map/" target="_blank" rel="noopener">MoDOT Traveler Map</a> · <a href="https://www.gatewayguide.com/" target="_blank" rel="noopener">Gateway Guide</a> · <a href="https://www.travelmidwest.com/" target="_blank" rel="noopener">Travel Midwest</a> · <a href="https://www.gettingaroundillinois.com/Traveler%20Information/index.html" target="_blank" rel="noopener">Getting Around Illinois</a></div>';
    // lazily fill groups when opened
    root.querySelectorAll("details.camgrp").forEach(function (d) {
      d.addEventListener("toggle", function () {
        var grid = d.querySelector(".camgrid");
        if (d.open && !grid.innerHTML) grid.innerHTML = grid.getAttribute("data-keys").split(",").filter(Boolean).map(function (k) { return camTile(by[k]); }).join("");
        if (!d.open) { stopAll(); stopFrames(d); }
        else if (d.classList.contains("family")) autoStartFamily();
      });
    });
  }
  function showCams() {
    if (camsRendered) { autoStartFamily(); return; }
    camsRendered = true;
    (feedsPromise || loadFeeds()).then(function (r) { renderCams(r); autoStartFamily(); });
  }

  document.addEventListener("ftp-refresh", function () {
    camsRendered = false;
    if (!document.querySelector('[data-panel="cams"]').hidden) { stopAll(); stopFrames(); showCams(); }
  });

  document.addEventListener("click", function (e) {
    var tab = e.target.closest("[data-tab]");
    if (tab) {
      var t = tab.getAttribute("data-tab");
      if (t !== "cams") { stopAll(); stopFrames(); }
      if (t === "cams") showCams();
      if (t === "alerts") loadAlerts();
      return;
    }
    var vh = e.target.closest(".cam .view-here"); if (vh) { startFrame(vh.closest(".cam")); return; }
    var fs = e.target.closest(".fr-stop"); if (fs) { stopFrames(fs.closest(".cam")); return; }
    var pb = e.target.closest(".cam .play"); if (pb) { play(pb); return; }
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { stopAll(); stopFrames(); }
    else if (!document.querySelector('[data-panel="cams"]').hidden) autoStartFamily();
  });
  // fetch alerts at app open so the tab badge and offline copy are ready
  loadAlerts();
})();
