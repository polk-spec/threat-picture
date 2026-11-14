/* Prep tab: readiness score + rally/comms plan (both stored ONLY in this device's localStorage),
   fuel & grocery prices, power & grid, nuclear/fallout reference with live NWS wind. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ct(t) { var d = new Date(t); if (isNaN(d)) return t || ""; return d.toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " CT"; }
  function load(k, def) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? def : v; } catch (e) { return def; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function money(n) { return n == null ? "—" : "$" + Number(n).toFixed(2); }
  function delta(a, b) { if (a == null || b == null) return ""; var d = a - b; return '<span class="' + (d > 0 ? "up" : d < 0 ? "down" : "") + '">' + (d > 0 ? "+" : "") + d.toFixed(2) + "</span>"; }

  // ---------- 1. Readiness ----------
  var K_READY = "ftp-private-readiness";
  var REQUIRED = { Low: 40, Guarded: 55, Elevated: 70, High: 85, Severe: 95 };
  var CATS = [
    { id: "water", name: "Water", items: function (P, T) { return ["{W} gallons stored (1 gal per person per day for " + T + " days)", "Filter or purification tablets", "Containers rotated in the last 6 months"]; } },
    { id: "food", name: "Food", items: function (P, T) { return [T + " days of shelf-stable food you already eat", "Manual can opener", "Way to cook without power (camp stove + fuel)"]; } },
    { id: "meds", name: "Medications", items: function (P, T) { return [T + "+ days of each prescription", "OTC: fever/pain, allergy, anti-diarrheal, electrolytes", "Spare glasses or contacts"]; } },
    { id: "fuel", name: "Fuel", items: function () { return ["Vehicles at half a tank or more", "Stored fuel with stabilizer, rotated", "Generator tested in the last month"]; } },
    { id: "cash", name: "Cash", items: function () { return ["Cash in small bills for 2+ weeks of essentials", "Some coins and $1s for vending/fuel pumps"]; } },
    { id: "gobag", name: "Go-bags", items: function () { return ["72-hour go-bag for each person", "Car kit in each vehicle (blanket, water, light, charger)", "Pet supplies, if any"]; } },
    { id: "docs", name: "Documents", items: function () { return ["Copies of IDs, insurance, deeds, medical info in a waterproof pouch", "Encrypted digital copies", "Printed emergency contact list"]; } },
    { id: "comms", name: "Comms", items: function () { return ["NOAA weather radio with spare batteries", "Power banks charged", "Rally & comms plan filled in (below)", "Out-of-area contact everyone knows"]; } },
    { id: "aid", name: "First aid", items: function () { return ["First aid kit stocked and in date", "Bleeding control: tourniquet + pressure dressing", "Someone current on CPR/first aid"]; } }
  ];
  function readiness() {
    var st = load(K_READY, { target: 14, people: 4, checks: {} });
    var T = st.target, P = st.people;
    var level = (window.__ftpLevel || "Elevated"), need = REQUIRED[level] || 70;
    var total = 0, done = 0, catScores = [];
    CATS.forEach(function (c) {
      var its = c.items(P, T), n = 0;
      its.forEach(function (_, i) { if (st.checks[c.id + i]) n++; });
      var pct = Math.round(100 * n / its.length); catScores.push({ c: c, pct: pct, its: its });
      total += 1; done += n / its.length;
    });
    var score = Math.round(100 * done / total);
    var gaps = catScores.filter(function (x) { return x.pct < 100; }).sort(function (a, b) { return a.pct - b.pct; }).slice(0, 3);
    var ok = score >= need;
    return '<section class="prep" id="prep-ready"><h2>Family readiness</h2>' +
      '<div class="score ' + (ok ? "ok" : "short") + '"><div class="big">' + score + '%</div><div><b>' + (ok ? "Meets" : "Below") + " the " + need + "% recommended for " + esc(level) + "</b>" +
      '<div class="d">Supply target ' + T + " days · " + P + " people. " + (ok ? "Keep rotating stock." : "Close the biggest gaps first: " + gaps.map(function (g) { return esc(g.c.name) + " " + g.pct + "%"; }).join(", ") + ".") + "</div></div></div>" +
      '<div class="ready-opts"><label>Supply target <select id="r-target">' + [14, 30, 90].map(function (d) { return '<option value="' + d + '"' + (d === T ? " selected" : "") + ">" + d + " days</option>"; }).join("") + '</select></label>' +
      '<label>People <input id="r-people" type="number" min="1" max="20" value="' + P + '"></label></div>' +
      '<div class="cats">' + catScores.map(function (x) {
        return '<details class="cat"' + (x.pct < 100 && gaps.indexOf(x) >= 0 ? " open" : "") + '><summary><span>' + esc(x.c.name) + '</span><span class="bar"><i style="width:' + x.pct + '%"></i></span><span class="n">' + x.pct + "%</span></summary>" +
          x.its.map(function (t, i) { var id = x.c.id + i; return '<label class="chk"><input type="checkbox" data-chk="' + id + '"' + (st.checks[id] ? " checked" : "") + "> " + esc(t.replace("{W}", String(P * T))) + "</label>"; }).join("") + "</details>";
      }).join("") + '</div><p class="hint">Saved only on this device. Recommended score rises with the overall threat level (Low 40%, Guarded 55%, Elevated 70%, High 85%, Severe 95%). Guidance: <a href="https://www.ready.gov/kit" target="_blank" rel="noopener">Ready.gov kit</a> · <a href="https://www.ready.gov/water" target="_blank" rel="noopener">water</a> · <a href="https://www.ready.gov/food" target="_blank" rel="noopener">food</a> · <a href="https://www.ready.gov/financial-preparedness" target="_blank" rel="noopener">cash &amp; documents</a></p></section>';
  }

  // ---------- 2. Rally points & comms (device only) ----------
  var K_COMMS = "ftp-private-comms";
  var FIELDS = [
    ["rally1", "Rally point 1 (just outside the house)"], ["rally2", "Rally point 2 (neighborhood, if home is unsafe)"], ["rally3", "Rally point 3 (out of area)"],
    ["oacName", "Out-of-area contact: name"], ["oacPhone", "Out-of-area contact: phone"], ["checkin", "Check-in schedule (e.g. text at :00 every 2 hrs)"],
    ["radioPrimary", "Radio primary (repeater/channel)"], ["radioBackup", "Radio backup (simplex/GMRS/FRS)"], ["codeword", "Family code word"], ["notes", "Notes (meds, school/work pickup plans)"]
  ];
  var REPEATERS = [
    ["147.120 +", "127.3", "K9GXU · Belleville (Turkey Hill), St. Clair ARC · ARES net Tue 7 PM", "https://www.repeaterbook.com/repeaters/details.php?ID=498&state_id=17"],
    ["224.120 −", "127.3", "K9GXU · Belleville, St. Clair ARC", "https://www.repeaterbook.com/repeaters/details.php?ID=497&state_id=17"],
    ["444.625 +", "127.3", "K9GXU · Belleville · EchoLink 258260, IRLP 4979", "https://www.ilra.net/DirByFreq.html"],
    ["147.360 +", "141.3", "St. Louis Metro Skywarn primary (severe weather nets)", "https://www.stlares.org/skywarn"],
    ["146.910 −", "141.3", "W0SRC · Des Peres · Skywarn backup", "https://slsrc.org/repeaters-and-nets/"],
    ["146.850 −", "141.3", "W0SRC · Olivette · STL Metro ARES net Wed 7:30 PM", "https://www.stlares.org/"],
    ["442.100 +", "141.3", "W0SRC · Clayton, MO", "https://slsrc.org/repeaters-and-nets/"],
    ["146.520", "none", "National 2 m FM simplex calling frequency", "https://www.arrl.org/band-plan"]
  ];
  function comms() {
    var v = load(K_COMMS, {});
    return '<section class="prep" id="prep-comms"><h2>Rally points &amp; comms plan</h2>' +
      '<p class="hint"><b>Private:</b> saved only in this phone\'s browser storage. It is never uploaded or added to the public site. Each family member fills in their own phone, or print it.</p>' +
      '<form class="comms" autocomplete="off" onsubmit="return false">' + FIELDS.map(function (f) {
        var tag = f[0] === "notes" ? '<textarea data-cf="' + f[0] + '" rows="3">' + esc(v[f[0]] || "") + "</textarea>" : '<input data-cf="' + f[0] + '" value="' + esc(v[f[0]] || "") + '">';
        return "<label>" + esc(f[1]) + tag + "</label>";
      }).join("") + '<div class="row"><span class="d" id="c-saved"></span><button type="button" class="small-btn" id="c-print">Print</button><button type="button" class="small-btn" id="c-clear">Clear</button></div></form>' +
      "<h3 class=\"stl-only\">Area amateur radio repeaters (public listings)</h3><p class=\"hint\">Transmitting needs an FCC amateur license; listening is fine with any scanner. Verify before relying on them; repeaters change.</p>" +
      '<div class="tbl"><table><thead><tr><th>MHz</th><th>PL Hz</th><th>Notes</th></tr></thead><tbody>' + REPEATERS.map(function (r) {
        return "<tr><td><b>" + esc(r[0]) + "</b></td><td>" + esc(r[1]) + '</td><td>' + esc(r[2]) + ' <a href="' + esc(r[3]) + '" target="_blank" rel="noopener">source ↗</a></td></tr>';
      }).join("") + "</tbody></table></div>" +
      '<p class="hint">NOAA Weather Radio for St. Clair Co. IL and St. Louis: <b>KDO89, 162.550 MHz</b> (Shrewsbury, MO); SAME code for St. Clair Co. IL is 017163. <a href="https://www.weather.gov/nwr/station_listing?State=IL" target="_blank" rel="noopener">NWS station list ↗</a> · Family plan template: <a href="https://www.ready.gov/plan" target="_blank" rel="noopener">Ready.gov/plan ↗</a></p></section>';
  }

  // ---------- 3. Fuel & groceries ----------
  function prices(feeds) {
    var f = feeds && feeds.fuel, g = feeds && feeds.grocery, at = feeds && feeds.generated;
    var fuelError = feeds && feeds.errors && feeds.errors.fuel;
    var fuelHtml = f && f.items ? '<p class="d fuel-scroll-hint">Swipe the table sideways to see every fuel grade and comparison.</p><div class="tbl"><table class="fuel-prices"><thead><tr><th>Area</th><th>Regular</th><th>Midgrade</th><th>Premium</th><th>Diesel</th><th>vs week</th><th>vs year</th></tr></thead><tbody>' + f.items.map(function (x) {
      var c = x.current || {}, w = x.weekAgo || {}, y = x.yearAgo || {};
      return "<tr><td>" + esc(x.area) + "</td><td><b>" + money(c.regular) + "</b></td><td>" + money(c.mid) + "</td><td>" + money(c.premium) + "</td><td>" + money(c.diesel) + "</td><td>" + delta(c.regular, w.regular) + "</td><td>" + delta(c.regular, y.regular) + "</td></tr>";
    }).join("") + '</tbody></table></div><p class="hint">AAA average prices as of ' + esc((f.items[0] || {}).asOf || "") + '. Statewide averages match the brief; metro averages are listed separately. ' + (fuelError ? 'Update unavailable; showing the last verified AAA prices. ' : '') + '<a href="https://gasprices.aaa.com/?state=IL" target="_blank" rel="noopener">AAA Illinois ↗</a> · <a href="https://gasprices.aaa.com/?state=MO" target="_blank" rel="noopener">AAA Missouri ↗</a></p>' : '<p class="hint">Fuel prices not available yet.</p>';
    var groHtml = g && g.items && g.items.length ? '<div class="tbl"><table><thead><tr><th>Item</th><th>Avg price</th><th>Year ago</th><th>Month</th></tr></thead><tbody>' + g.items.map(function (x) {
      return '<tr><td><a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.item) + "</a></td><td><b>" + money(x.price) + "</b></td><td>" + money(x.yearAgo) + "</td><td>" + esc(x.period) + "</td></tr>";
    }).join("") + '</tbody></table></div><p class="hint">BLS average retail prices, U.S. city average (published monthly, about 6 weeks behind; local store prices vary).</p>' : '<p class="hint">Grocery prices not available yet.</p>';
    return '<section class="prep" id="prep-prices"><h2 class="stl-only">Fuel &amp; grocery prices</h2><div class="src-line">Updated ' + esc(ct(at)) + " on the twice-daily refresh</div><h3>Gasoline &amp; diesel</h3>" + fuelHtml + "<h3>Grocery staples</h3>" + groHtml + "</section>";
  }

  // ---------- 4. Power & grid ----------
  function power(feeds) {
    var a = feeds && feeds.ameren, m = feeds && feeds.miso;
    var am = a && a.items ? '<div class="metrics two">' + a.items.map(function (x) {
      var tone = x.percentOut >= 5 ? "lv-High" : x.percentOut >= 1 ? "lv-Elevated" : "lv-Low";
      return '<div class="metric"><div class="l">' + esc(x.utility) + '</div><div class="v ' + tone + '">' + Number(x.customersOut).toLocaleString() + ' out</div><div class="d">' + x.outages + " outages · " + Number(x.customersServed).toLocaleString() + " served</div></div>";
    }).join("") + '</div><p class="hint">Ameren outage map data as of ' + esc(ct(a.generated)) + (a.mode && a.mode !== "BLUESKY" ? " · storm mode: " + esc(a.mode) : "") + '. Live map: <a href="https://outagemap.ameren.com/" target="_blank" rel="noopener">outagemap.ameren.com ↗</a> · Text REG to 263736 (AMEREN) for outage alerts.</p>' : '<p class="hint">Ameren outage data not available yet. <a href="https://outagemap.ameren.com/" target="_blank" rel="noopener">Ameren outage map ↗</a></p>';
    var ms = m ? '<div class="gridstat gs-' + esc(m.status) + '"><b>MISO grid: ' + esc(m.status) + '</b><div class="d">' + esc(m.basis) + ". Ameren Illinois and Ameren Missouri are in MISO's Central region.</div></div>" +
      '<ul class="plain">' + (m.items || []).slice(0, 6).map(function (x) {
        return '<li><a href="' + esc(x.url) + '" target="_blank" rel="noopener"><b>' + esc(x.subject) + '</b></a> <span class="d">' + esc(ct(x.time)) + (x.level !== "info" ? " · " + esc(x.level) : "") + "</span></li>";
      }).join("") + "</ul>" : '<p class="hint">MISO notifications not available yet.</p>';
    return '<section class="prep" id="prep-power"><h2 class="stl-only">Power &amp; grid</h2><h3>Ameren customers without power</h3>' + am +
      "<h3>MISO grid status</h3>" + ms + '<div id="miso-live" class="hint">Loading live MISO demand…</div>' +
      '<p class="hint"><a href="https://www.misoenergy.org/markets-and-operations/notifications/real-time-operations-notifications/" target="_blank" rel="noopener">MISO real-time notifications ↗</a></p></section>';
  }
  function misoLive() {
    var el = $("miso-live"); if (!el) return;
    Promise.all([fetch("https://public-api.misoenergy.org/api/Snapshot", { cache: "no-store" }).then(function (r) { return r.json(); }),
                 fetch("https://public-api.misoenergy.org/api/CsatSupplyDemand", { cache: "no-store" }).then(function (r) { return r.json(); })])
      .then(function (r) {
        var snap = {}; (r[0] || []).forEach(function (x) { snap[x.t] = x; });
        var rows = (r[1] || []).filter(function (x) { return x.demand != null && x.committedCapacity != null; });
        var last = rows[rows.length - 1];
        var margin = last ? last.committedCapacity - last.demand : null;
        var pct = last ? Math.round(100 * margin / last.demand) : null;
        var cur = snap["Current Demand (MW)"], peak = snap["Forecasted Peak Demand (MW)"];
        var out = { at: new Date().toISOString(), html: "<b>Live:</b> MISO demand " + esc(cur ? cur.v : "—") + " MW (forecast peak " + esc(peak ? peak.v : "—") + " MW)" +
          (last ? " · committed capacity " + last.committedCapacity.toLocaleString() + " MW, margin " + margin.toLocaleString() + " MW (" + pct + "%)" : "") };
        save("ftp-live-miso", out); el.innerHTML = out.html + ' <span class="d">· ' + esc(ct(out.at)) + "</span>";
      }).catch(function () {
        var o = load("ftp-live-miso", null);
        el.innerHTML = o ? o.html + ' <span class="d">· offline copy ' + esc(ct(o.at)) + "</span>" : "Live MISO demand unavailable.";
      });
  }

  // ---------- 5. Nuclear & fallout ----------
  var FORECAST = "https://api.weather.gov/gridpoints/LSX/105,73/forecast";
  var OPP = { N: "S", NNE: "SSW", NE: "SW", ENE: "WSW", E: "W", ESE: "WNW", SE: "NW", SSE: "NNW", S: "N", SSW: "NNE", SW: "NE", WSW: "ENE", W: "E", WNW: "ESE", NW: "SE", NNW: "SSE" };
  function nuke() {
    return '<section class="prep" id="prep-nuke"><h2>Nuclear &amp; fallout: shelter in place</h2>' +
      '<div class="callout"><b>Get inside · Stay inside · Stay tuned.</b> After a detonation you will have <b>10 minutes or more</b> to reach shelter before fallout arrives.</div>' +
      '<ol class="steps">' +
      "<li><b>Get inside</b> the nearest sturdy building and away from windows. If outside when it happens, lie face down to protect exposed skin from heat and debris.</li>" +
      "<li><b>Go deep:</b> a basement or the center of a large building. Brick or concrete walls are safest; underground parking garages and subways also work.</li>" +
      "<li><b>Stay inside for at least 24 hours</b> unless officials say otherwise or there is an immediate threat like fire. Bring pets inside.</li>" +
      "<li><b>Decontaminate:</b> carefully remove outer clothing (removes up to 90% of radioactive material), bag it away from people and pets. Shower with soap and water; if you can't, wipe uncovered skin and hair with a wet cloth. Don't use household cleaning wipes on skin.</li>" +
      "<li><b>Air:</b> turn off fans, air conditioners and forced-air heating that bring in outside air.</li>" +
      "<li><b>Food and water:</b> food in sealed containers is safe after wiping the container with a damp cloth.</li>" +
      "<li><b>Stay tuned</b> to NOAA Weather Radio" + (window.FTPLoc && !FTPLoc.isHome() ? "" : " (KDO89 162.550)") + ", local radio/TV or Wireless Emergency Alerts. Take potassium iodide (KI) only if public health officials tell you to.</li></ol>" +
      '<h3>Today\'s wind (NWS forecast)</h3><div id="wind" class="hint">Loading NWS forecast…</div>' +
      '<p class="hint">Fallout drifts with the winds aloft, which can differ from ground-level wind, so treat this only as a rough guide and follow official instructions. Source: <a href="https://www.ready.gov/radiation" target="_blank" rel="noopener">Ready.gov: Radiation emergencies ↗</a> · <a href="https://forecast.weather.gov/MapClick.php?lat=38.5923&lon=-89.9112" target="_blank" rel="noopener">NWS forecast ↗</a></p></section>';
  }
  function windLive() {
    var el = $("wind"); if (!el) return;
    function show(o, live) {
      el.innerHTML = '<ul class="plain">' + o.periods.map(function (p) {
        var to = OPP[p.dir] ? " → drifts toward <b>" + OPP[p.dir] + "</b>" : "";
        return "<li><b>" + esc(p.name) + ":</b> from " + esc(p.dir) + " " + esc(p.speed) + to + ' <span class="d">· ' + esc(p.short) + "</span></li>";
      }).join("") + '</ul><span class="d">' + (live ? "Live" : "Offline copy") + " · " + esc(ct(o.at)) + "</span>";
    }
    var away = window.FTPLoc && !FTPLoc.isHome(), L0 = away && FTPLoc.get(), url = away && L0.nws && L0.nws.forecast ? L0.nws.forecast : FORECAST, wk = "ftp-live-wind" + (away ? FTPLoc.key() : "");
    var hd = el.previousElementSibling; if (hd && hd.tagName === "H3") hd.textContent = "Today's wind (NWS forecast" + (away ? ", " + L0.label : "") + ")";
    fetch(url, { cache: "no-store", headers: { Accept: "application/geo+json" } }).then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (d) {
        var o = { at: new Date().toISOString(), periods: d.properties.periods.slice(0, 3).map(function (p) { return { name: p.name, dir: p.windDirection, speed: p.windSpeed, short: p.shortForecast }; }) };
        save(wk, o); show(o, true);
      }).catch(function () { var o = load(wk, null); if (o) show(o, false); else el.textContent = "Wind forecast unavailable offline until it has loaded once."; });
  }

  // ---------- wiring ----------
  var feeds = null;
  function render() {
    var root = $("prep-root");
    root.innerHTML = readiness() + comms() + prices(feeds) + power(feeds) + nuke();
    misoLive(); windLive();
  }
  document.addEventListener("ftp-loc", function () { if ($("prep-root") && $("prep-root").innerHTML) render(); });
  function ensureFeeds() {
    return fetch("feeds.json", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) { feeds = d; try { localStorage.setItem("ftp-live-feeds-prep", JSON.stringify(d)); } catch (e) {} })
      .catch(function () { try { feeds = JSON.parse(localStorage.getItem("ftp-live-feeds-prep") || "null"); } catch (e) {} });
  }
  document.addEventListener("ftp-refresh", function () {
    var fresh = window.ftpLive && window.ftpLive.feeds && window.ftpLive.feeds.data;
    if (!fresh) return;
    feeds = fresh;
    // Update feed-backed sections only; never discard a family's in-progress form fields.
    [["prep-prices", prices], ["prep-power", power]].forEach(function (part) {
      var old = $(part[0]); if (!old) return;
      var tmp = document.createElement("div"); tmp.innerHTML = part[1](feeds); old.replaceWith(tmp.firstChild);
    });
    if ($("prep-power")) misoLive();
  });
  function rerenderReadiness() {
    var old = $("prep-ready"); if (!old) return;
    var tmp = document.createElement("div"); tmp.innerHTML = readiness(); old.replaceWith(tmp.firstChild);
  }
  document.addEventListener("click", function (e) {
    var tab = e.target.closest("[data-tab]");
    if (tab && tab.getAttribute("data-tab") === "prep") ensureFeeds().then(render);
    var chip = e.target.closest(".chips a");
    if (chip) { e.preventDefault(); var t = document.querySelector(chip.getAttribute("href")); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); }
    if (e.target.id === "c-clear" && confirm("Clear the rally & comms plan on this device?")) { localStorage.removeItem(K_COMMS); render(); }
    if (e.target.id === "c-print") window.print();
  });
  document.addEventListener("change", function (e) {
    var st = load(K_READY, { target: 14, people: 4, checks: {} });
    if (e.target.matches("[data-chk]")) { st.checks[e.target.getAttribute("data-chk")] = e.target.checked; save(K_READY, st); rerenderReadiness(); }
    else if (e.target.id === "r-target") { st.target = Number(e.target.value); save(K_READY, st); rerenderReadiness(); }
    else if (e.target.id === "r-people") { st.people = Math.max(1, Math.min(20, Number(e.target.value) || 1)); save(K_READY, st); rerenderReadiness(); }
  });
  document.addEventListener("input", function (e) {
    if (!e.target.matches("[data-cf]")) return;
    var v = load(K_COMMS, {}); v[e.target.getAttribute("data-cf")] = e.target.value; save(K_COMMS, v);
    var s = $("c-saved"); if (s) s.textContent = "Saved on this device";
  });
})();
