(function () {
  "use strict";
  var LEVELS = ["Severe", "High", "Elevated", "Guarded", "Low"];
  var COLORS = { Severe: "var(--severe)", High: "var(--high)", Elevated: "var(--elevated)", Guarded: "var(--guarded)", Low: "var(--low)" };
  var state = { data: null, cat: "All", lvl: "Any" };
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : "#"; }
  function pill(text, cls) { return text ? '<span class="pill ' + cls + '">' + esc(text) + "</span>" : ""; }
  function fmtTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return iso || "—";
    return d.toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " CT";
  }

  function render() {
    var d = state.data; if (!d) return;
    var o = d.overall || {};
    $("loc").textContent = d.location || "";
    $("overall-level").textContent = o.level || "Unknown";
    window.__ftpLevel = o.level;
    $("banner").style.setProperty("--lvl", COLORS[o.level] || "var(--accent)");
    var up = $("updated"); up.textContent = fmtTime(d.updated); up.setAttribute("datetime", d.updated || "");
    var age = (Date.now() - new Date(d.updated).getTime()) / 36e5;
    var st = $("stale");
    if (age > 14) { st.hidden = false; st.textContent = "This brief is " + Math.round(age) + " hours old. A newer one may be available when you're back online."; } else st.hidden = true;

    var threats = d.threats || [];
    var metrics = [
      { v: o.level, l: "Overall", c: o.level, j: "brief", a: "Open the brief: what changed and top actions" },
      { v: o.topThreat && o.topThreat.level, l: "Top threat", dd: o.topThreat && o.topThreat.name, c: o.topThreat && o.topThreat.level, j: "top", a: "Open the top threat on the threat board" },
      { v: o.localLevel, l: "Local", c: o.localLevel, j: "local", a: "Open the threat board filtered to local threats" },
      { v: String(threats.length), l: "Threats tracked", j: "all", a: "Open the threat board showing all threats" }
    ];
    $("metrics").innerHTML = metrics.map(function (m) {
      return '<button type="button" class="metric" data-jump="' + m.j + '" aria-label="' + esc(m.l + ": " + (m.v || "") + (m.dd ? ", " + m.dd : "") + ". " + m.a) + '"><div class="l">' + esc(m.l) + '<span class="chev" aria-hidden="true">›</span></div><div class="v ' + (m.c ? "lv-" + esc(m.c) : "") + '">' + esc(m.v || "—") + "</div>" + (m.dd ? '<div class="d">' + esc(m.dd) + "</div>" : "") + "</button>";
    }).join("");
    $("overall-summary").textContent = o.summary || "";
    var w = $("watch");
    if (o.watchItem) { w.hidden = false; w.innerHTML = "<b>Watch item:</b> " + esc(o.watchItem); } else w.hidden = true;

    $("top-actions").innerHTML = (d.topActions || []).map(function (a) {
      return '<li><div class="t">' + esc(a.title) + '</div><div class="d">' + esc(a.detail) + "</div></li>";
    }).join("");
    $("changes").innerHTML = (d.whatChanged || []).map(function (c) {
      return '<li><div class="dt">' + esc(c.date) + '</div><div><div class="t">' + esc(c.title) + pill(c.trend, "tr-" + esc(c.trend)) + '</div><div class="d">' + esc(c.detail) + "</div></div></li>";
    }).join("");
    $("sources").innerHTML = (d.sources || []).map(function (s) {
      return '<li><a href="' + esc(safeUrl(s.url)) + '" target="_blank" rel="noopener"><div>' + esc(s.title) + '</div><div class="s">' + esc(s.site) + (s.date ? " · " + esc(s.date) : "") + "</div></a></li>";
    }).join("");
    renderBoard();
  }

  function renderBoard() {
    var threats = state.data.threats || [];
    var cats = ["All", "Global", "National", "Local"];
    $("cat-filter").innerHTML = cats.map(function (c) {
      var n = c === "All" ? threats.length : threats.filter(function (t) { return t.category === c; }).length;
      return '<button data-cat="' + c + '" aria-pressed="' + (state.cat === c) + '">' + c + '<span class="c">' + n + "</span></button>";
    }).join("");
    var shown = threats.filter(function (t) {
      return (state.cat === "All" || t.category === state.cat) && (state.lvl === "Any" || t.level === state.lvl);
    }).sort(function (a, b) { return LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level); });

    var counts = LEVELS.map(function (l) { return { l: l, n: shown.filter(function (t) { return t.level === l; }).length }; }).filter(function (x) { return x.n; });
    $("dist").innerHTML = counts.map(function (x) { return '<span title="' + x.l + '" style="flex:' + x.n + ";background:" + COLORS[x.l] + '"></span>'; }).join("");
    var leg = document.querySelector(".dist-legend");
    if (!leg) { leg = document.createElement("div"); leg.className = "dist-legend"; $("dist").after(leg); }
    leg.innerHTML = counts.map(function (x) { return '<span class="lv-' + x.l + '">' + x.n + " " + x.l + "</span>"; }).join(" · ");

    $("threats").innerHTML = shown.length ? shown.map(function (t) {
      return '<details class="card" data-scope="' + esc(t.category) + '" data-id="' + esc(t.id) + '" style="--c:' + (COLORS[t.level] || "var(--line)") + '"><summary><div class="row1"><div><div class="name">' + esc(t.name) + '</div><div class="meta">' + esc(t.category) + " · as of " + esc(t.date) + " · " + '<span class="tr-' + esc(t.trend) + '">' + esc(t.trend) + "</span></div></div>" + pill(t.level, "lv-" + esc(t.level)) + '</div></summary><div class="body"><p>' + esc(t.summary) + "</p>" +
        ((t.actions && t.actions.length) ? "<ul>" + t.actions.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>" : "") +
        (t.source ? '<div class="src">Source: <a href="' + esc(safeUrl(t.source)) + '" target="_blank" rel="noopener">' + esc(t.source) + "</a></div>" : "") + "</div></details>";
    }).join("") : '<div class="empty">No threats match these filters.</div>';
  }

  // resolves true when a fresh brief came from the network, false when a saved copy was used
  function load(bust) {
    var saved = false;
    return fetch("data.json" + (bust === true ? "?t=" + Date.now() : ""), { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      saved = !!r.headers.get("X-FTP-Saved");   // service worker answered from its offline copy
      return r.json();
    }).then(function (d) {
      state.data = d; render(); document.dispatchEvent(new CustomEvent("ftp-data"));
      try { localStorage.setItem("ftp-data", JSON.stringify(d)); } catch (e) {}
      $("offline").hidden = !saved;
      if (!saved) stampChecked();
      return !saved;
    }).catch(function () {
      // Network failed and SW had nothing: fall back to last copy in localStorage
      var cached = null;
      try { cached = JSON.parse(localStorage.getItem("ftp-data") || "null"); } catch (e) {}
      if (cached) { state.data = cached; render(); document.dispatchEvent(new CustomEvent("ftp-data")); }
      $("offline").hidden = false;
      if (!cached) $("overall-level").textContent = "No data yet";
      return false;
    });
  }
  function clock(t) { return new Date(t).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit", second: "2-digit" }) + " CT"; }
  function stampChecked() { var c = $("checked"); if (c) { c.textContent = "Last updated " + clock(Date.now()); c.setAttribute("datetime", new Date().toISOString()); } }
  var toastT = null;
  function toast(msg, bad) {
    var t = $("toast"); if (!t) return;
    t.textContent = msg; t.className = "toast" + (bad ? " bad" : ""); t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, bad ? 8000 : 4000);
  }
  window.ftpToast = toast;
  // Refresh button: re-fetch the brief and every live feed (bypassing all caches), spin while working, then say what happened
  var refreshing = null;
  function refreshAll() {
    if (refreshing) return refreshing;
    var btn = $("refresh"), t0 = Date.now();
    btn.classList.add("spin"); btn.setAttribute("aria-busy", "true"); btn.setAttribute("aria-label", "Refreshing…");
    var jobs = [load(true), window.ftpLoadAlerts ? window.ftpLoadAlerts(true) : Promise.resolve(null),
                window.ftpSevere ? window.ftpSevere.check().catch(function () { return null; }) : Promise.resolve(null)];
    refreshing = Promise.all(jobs).then(function (r) {
      var fail = [], lv = r[1];
      if (!r[0]) fail.push("threat brief");
      if (lv) {
        if (!lv.nws.live) fail.push("weather.gov alerts");
        if (!lv.usgs.live) fail.push("USGS quakes");
        if (!lv.fema.live) fail.push("FEMA");
        if (lv.feeds && !lv.feeds.live) fail.push("twice-daily feeds");
      }
      document.dispatchEvent(new CustomEvent("ftp-refresh"));
      return new Promise(function (res) { setTimeout(res, Math.max(0, 700 - (Date.now() - t0))); }).then(function () {   // let the spin be seen
        var now = clock(Date.now());
        if (!fail.length) toast("Updated " + now);
        else if (fail.length >= 4 || !navigator.onLine) toast("Couldn't update. You look offline; showing saved copies.", true);
        else toast("Updated " + now + ". Couldn't reach: " + fail.join(", ") + " (showing saved copy).", true);
        if (fail.length < 4) stampChecked();
        return fail;
      });
    }).finally(function () {
      btn.classList.remove("spin"); btn.removeAttribute("aria-busy"); btn.setAttribute("aria-label", "Refresh");
      refreshing = null;
    });
    return refreshing;
  }
  window.ftpRefresh = refreshAll;

  function showTab(name) {
    var b = document.querySelector('[data-tab="' + name + '"]'); if (b) b.click();
  }
  function topThreatId() {
    var d = state.data, o = d.overall || {}, ts = d.threats || [];
    if (o.topThreat && o.topThreat.id) return o.topThreat.id;
    var best = ts.slice().sort(function (a, b) { return LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level); })[0];
    return best && best.id;
  }
  function jump(kind) {
    if (!state.data) return;
    if (kind === "brief") {
      showTab("brief");
      var h = document.querySelector('[data-panel="brief"] h2'); if (h) h.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    state.lvl = "Any"; $("lvl-filter").value = "Any";
    state.cat = kind === "local" ? "Local" : "All";
    showTab("board"); renderBoard();
    var target = null;
    if (kind === "top") {
      target = document.querySelector('.card[data-id="' + topThreatId() + '"]');
      if (target) target.open = true;
    }
    (target || $("cat-filter")).scrollIntoView({ behavior: "smooth", block: "start" });
    if (target) { target.classList.add("flash"); setTimeout(function () { target.classList.remove("flash"); }, 1600); }
  }
  window.ftpOpenThreat = function (id) {
    if (!state.data) return;
    state.lvl = "Any"; $("lvl-filter").value = "Any"; state.cat = "All";
    showTab("board"); renderBoard();
    var c = document.querySelector('.card[data-id="' + id + '"]');
    if (c) { c.open = true; c.scrollIntoView({ behavior: "smooth", block: "start" }); c.classList.add("flash"); setTimeout(function () { c.classList.remove("flash"); }, 1600); }
  };
  window.ftpData = function () { return state.data; };
  document.addEventListener("keydown", function (e) {
    var j = e.target.closest && e.target.closest('[role="button"][data-jump]');
    if (j && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); jump(j.getAttribute("data-jump")); }
  });
  document.addEventListener("click", function (e) {
    var jb = e.target.closest("[data-jump]");
    if (jb) { jump(jb.getAttribute("data-jump")); return; }
    var tab = e.target.closest("[data-tab]");
    if (tab) {
      document.querySelectorAll("[data-tab]").forEach(function (b) { b.setAttribute("aria-selected", String(b === tab)); });
      document.querySelectorAll("[data-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== tab.getAttribute("data-tab"); });
      return;
    }
    var cb = e.target.closest("[data-cat]");
    if (cb) { state.cat = cb.getAttribute("data-cat"); renderBoard(); }
  });
  $("lvl-filter").addEventListener("change", function (e) { state.lvl = e.target.value; renderBoard(); });
  $("refresh").addEventListener("click", function () { refreshAll(); });
  window.addEventListener("online", load);
  window.addEventListener("offline", function () { $("offline").hidden = false; });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) load(); });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
  function syncHeader() { var h = document.querySelector(".topbar"); if (h) document.documentElement.style.setProperty("--hdr", h.offsetHeight + "px"); }
  window.addEventListener("resize", syncHeader); syncHeader();
  load();
})();
