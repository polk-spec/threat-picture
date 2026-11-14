/* Prep tab, part 2: air quality & smoke, power outage timer + generator fuel calculator, comms check (NOAA Weather Radio,
   repeaters, scanners, monthly radio test + log), and drill reminders. Personal entries (outage timer, logs, generator
   numbers) live only in this browser's localStorage. Due reminders are mirrored to Cache Storage (same device) so the
   service worker's background check can notify. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function ct(t, o) { var d = new Date(t); return isNaN(d) ? "" : d.toLocaleString("en-US", Object.assign({ timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, o || {})) + " CT"; }
  function today() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function addDays(iso, n) { var d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5); }
  function fmtDay(iso) { return iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""; }
  var feeds = null;
  function getFeeds() { return window.ftpGetFeeds ? window.ftpGetFeeds() : (feeds ? Promise.resolve(feeds) : fetch("feeds.json").then(function (r) { return r.json(); }).then(function (d) { feeds = d; return d; }).catch(function () { return {}; })); }

  // ================= 1. Air quality & smoke =================
  var AQ = [[0, 50, "Good", "#3fb27f"], [51, 100, "Moderate", "#e0b030"], [101, 150, "Unhealthy for Sensitive Groups", "#e8762c"],
    [151, 200, "Unhealthy", "#e04848"], [201, 300, "Very Unhealthy", "#9b4fd6"], [301, 9999, "Hazardous", "#7e0023"]];
  function off(d) { var m = Math.round(((d && d.utc_offset_seconds) || -21600) / 60), a = Math.abs(m); return ":00" + (m < 0 ? "-" : "+") + String(Math.floor(a / 60)).padStart(2, "0") + ":" + String(a % 60).padStart(2, "0"); }
  function cat(a) { for (var i = 0; i < AQ.length; i++) if (a <= AQ[i][1]) return AQ[i]; return AQ[AQ.length - 1]; }
  var aqLive = null, aqAt = 0;
  function liveAqi() {
    if (aqLive && Date.now() - aqAt < 10 * 60e3) return Promise.resolve(aqLive);
    var away = window.FTPLoc && !FTPLoc.isHome(), L0 = window.FTPLoc ? FTPLoc.get() : { lat: 38.63, lon: -90.2 };   // follows the location switcher
    return fetch("https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" + L0.lat + "&longitude=" + L0.lon + "&current=us_aqi,us_aqi_pm2_5,us_aqi_ozone,pm2_5,ozone&hourly=us_aqi&forecast_days=2&timezone=" + (away ? "auto" : "America%2FChicago"))
      .then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) { aqLive = d; aqAt = Date.now(); return d; }).catch(function () { return null; });
  }
  function guidance(a, smoke) {
    var c = cat(a)[2];
    var g = { "Good": ["Air quality is fine for everyone."],
      "Moderate": ["Unusually sensitive people: consider shorter or lighter outdoor activity."],
      "Unhealthy for Sensitive Groups": ["Kids, older adults, pregnant people and anyone with asthma, heart or lung disease: cut back long or heavy outdoor exertion.", "Keep rescue inhalers and meds handy."],
      "Unhealthy": ["Everyone: reduce long or heavy outdoor exertion; sensitive groups avoid it.", "Move activities indoors or reschedule."],
      "Very Unhealthy": ["Everyone: avoid long or heavy outdoor exertion; sensitive groups stay indoors.", "Run HEPA purifiers; keep windows closed."],
      "Hazardous": ["Everyone: stay indoors and keep activity light.", "Follow local health department instructions."] }[c] || [];
    var extra = smoke
      ? ["Smoke (fine particles): stay indoors with windows and doors closed; set HVAC to recirculate with the best filter it takes (MERV 13+).",
        "Run a HEPA purifier, or a DIY box-fan filter, in one 'clean room'. Don't burn candles, fry food or vacuum without HEPA.",
        "Outside, a well-fitted N95 helps with smoke; cloth or surgical masks don't. Drive with recirculate on."]
      : ["Ozone: it peaks in the afternoon, so do outdoor exertion in the morning. Masks don't filter ozone.", "Cut driving and gas-powered yard work on ozone action days."];
    return a >= 101 ? g.concat(extra) : g;
  }
  function airHtml(f, live) {
    var away = window.FTPLoc && !FTPLoc.isHome();
    var an = (f && f.airnow && !away) ? f.airnow : {}, cur = an.current, h = '<section class="prep" id="prep-air"><h2>Air quality &amp; smoke</h2>';
    var a = null, src = "", dom = "", smoke = false;
    if (live && live.current && live.current.us_aqi != null) {
      var c = live.current; a = c.us_aqi; smoke = (c.us_aqi_pm2_5 || 0) >= (c.us_aqi_ozone || 0); dom = smoke ? "PM2.5 (fine particles: smoke, haze)" : "Ozone";
      src = "Live estimate, Open-Meteo (CAMS model) for " + (away ? esc(FTPLoc.get().label) : "the metro") + " · " + esc(ct(c.time + off(live)));
    }
    var official = cur ? '<div class="aq-off"><b>AirNow official:</b> ' + esc(cur.parameter) + " AQI " + esc(cur.aqi) + " (" + esc(cur.category) + ") at " + esc(cur.validTime) + " " + esc(cur.tz) + " " + esc(cur.validDate) +
      " · St. Louis Metropolitan Area monitors" + (f.generated ? ' <span class="d">(checked ' + esc(ct(f.generated)) + ", updated twice daily)</span>" : "") + "</div>" : "";
    if (away) official = '<div class="d stl-note">AirNow official monitor readings: St. Louis area only.</div>';
    var fc = (an.rows || []).filter(function (r) { return r.type === "forecast"; });
    if (fc.length) official += '<div class="d">AirNow forecast: ' + fc.map(function (r) { return esc(r.validDate) + " " + esc(r.parameter) + " " + (r.aqi != null ? "AQI " + esc(r.aqi) + " " : "") + esc(r.category) + (r.actionDay ? " (Action Day)" : ""); }).join("; ") + "</div>";
    if (a == null && cur) { a = cur.aqi; smoke = /PM/.test(cur.parameter); dom = cur.parameter; src = "AirNow official (last twice-daily update)"; }
    if (a == null) return h + '<p class="d">Air quality unavailable right now (offline and no saved copy).</p>' + official + "</section>";
    var c0 = cat(a), peak = null;
    if (live && live.hourly) { var now = Date.now(), mx = -1, mt = null; live.hourly.time.forEach(function (t, i) { var ms = new Date(t + off(live)).getTime(); if (ms >= now && ms < now + 24 * 3600e3 && live.hourly.us_aqi[i] > mx) { mx = live.hourly.us_aqi[i]; mt = t; } }); if (mx >= 0) peak = [mx, mt]; }
    return h + '<div class="aq-big" style="border-color:' + c0[3] + '"><div class="aq-n" style="background:' + c0[3] + '">' + esc(a) + '</div><div><div class="aq-c">' + esc(c0[2]) + "</div>" +
      '<div class="d">Main pollutant: ' + esc(dom) + "</div>" + (peak ? '<div class="d">Next 24 h peak (model): AQI ' + esc(peak[0]) + " (" + esc(cat(peak[0])[2]) + ") around " + esc(new Date(peak[1] + off(live)).toLocaleTimeString("en-US", { timeZone: "America/Chicago", weekday: "short", hour: "numeric" })) + " CT</div>" : "") +
      "</div></div>" + (a >= 151 ? '<div class="aq-warn">AQI 151+ (Unhealthy). With push alerts on, the app notifies you when this happens.</div>' : "") +
      "<ul>" + guidance(a, smoke).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" +
      official + '<p class="d">' + src + '. Sources: <a href="' + esc(an.url || "https://www.airnow.gov/") + '" target="_blank" rel="noopener">AirNow ↗</a> · <a href="https://www.airnow.gov/aqi/aqi-basics/" target="_blank" rel="noopener">AQI basics ↗</a> · <a href="https://www.airnow.gov/wildfires/" target="_blank" rel="noopener">Wildfire smoke guide ↗</a> · <a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noopener">Open-Meteo ↗</a></p></section>';
  }

  // ================= 2. Power outage timer + generator =================
  var K_OUT = "ftp-private-outage", K_GEN = "ftp-private-generator";
  var FOOD = [["Refrigerator", 4, "Keep the door closed. After 4 hours without power, throw out perishable food (meat, poultry, seafood, milk, eggs, leftovers) that has been above 40 °F for 2+ hours."],
    ["Half-full freezer", 24, "A half-full freezer holds about 24 hours if the door stays closed. Food with ice crystals or at 40 °F or below can be refrozen."],
    ["Full freezer", 48, "A full freezer holds about 48 hours if the door stays closed."]];
  var LOADS = [["Fridge", 200], ["Chest freezer", 100], ["Sump pump (1/2 hp)", 1000], ["Furnace fan", 600], ["Window AC", 1000], ["LED lights x10", 100], ["Phones / router", 50], ["CPAP", 60], ["Microwave", 1000], ["Well pump", 1000]];
  function dur(ms) { var neg = ms < 0; ms = Math.abs(ms); var h = Math.floor(ms / 3600e3), m = Math.floor(ms % 3600e3 / 60e3); return (neg ? "-" : "") + (h ? h + " h " : "") + m + " min"; }
  function outageAlert(f) {
    if (window.FTPLoc && !FTPLoc.isHome()) return '<p class="d stl-note">Ameren outage check: St. Louis area only.</p>';
    var am = (f && f.ameren) || {}, cs = am.metroCounties || [], dis = load(K_OUT, {}).dismissed;
    var near = cs.filter(function (c) { return (c.state === "IL" && /St\. Clair|Madison|Monroe/.test(c.county) && c.customersOut >= 25) || c.customersOut >= 500; });
    if (!near.length || dis === am.generated) return "";
    return '<div class="out-prompt"><b>Ameren shows outages nearby:</b> ' + near.map(function (c) { return esc(c.county) + " " + esc(c.customersOut.toLocaleString()) + " customers out"; }).join(", ") +
      ' <span class="d">(as of ' + esc(ct(am.generated)) + ')</span>. Is your power out?<div class="row-btns"><button type="button" class="small-btn primary" id="out-start">Yes, start the outage timer</button><button type="button" class="small-btn" id="out-nope" data-gen="' + esc(am.generated) + '">No</button>' +
      '<a class="small-btn" href="https://outagemap.ameren.com/" target="_blank" rel="noopener">Ameren outage map ↗</a></div></div>';
  }
  function genCalc() {
    var g = load(K_GEN, { fuel: 10, rated: 5000, load: 1500, gph50: 0.55, hpd: 12 });
    var fr = Math.min(1.2, Math.max(0, g.load / g.rated)), burn = g.gph50 * (0.35 + 1.3 * fr);   // simple linear fit: 50% load = manual figure
    var hrs = burn > 0 ? g.fuel / burn : 0;
    var warn = fr > 1 ? "Load is above the generator's rating: it will trip or be damaged." : fr > 0.8 ? "Load is above 80% of rated watts; leave headroom for motor start-up surges." : "";
    return { g: g, burn: burn, hrs: hrs, days: g.hpd > 0 ? hrs / g.hpd : 0, pct: Math.round(fr * 100), warn: warn };
  }
  function powerHtml(f) {
    var o = load(K_OUT, {}), on = o.start && !o.end, now = Date.now(), r = genCalc();
    var h = '<section class="prep" id="prep-outage"><h2>Power outage timer</h2>' + (on ? "" : outageAlert(f));
    if (on) {
      var el = now - o.start;
      h += '<div class="out-run"><div class="out-el">Power out <b>' + esc(dur(el)) + '</b><span class="d"> since ' + esc(ct(o.start)) + "</span></div>" +
        FOOD.map(function (x) { var left = x[1] * 3600e3 - el, pct = Math.min(100, el / (x[1] * 3600e3) * 100); return '<div class="out-f' + (left <= 0 ? " over" : left < 3600e3 ? " soon" : "") + '"><div class="out-fh"><b>' + esc(x[0]) + " (" + x[1] + ' h)</b><span>' + (left > 0 ? esc(dur(left)) + " left" : "Time's up") + "</span></div>" +
          '<div class="out-bar"><i style="width:' + pct.toFixed(1) + '%"></i></div><div class="d">' + esc(x[2]) + "</div></div>"; }).join("") +
        '<div class="row-btns"><button type="button" class="small-btn primary" id="out-end">Power is back</button><button type="button" class="small-btn" id="out-cancel">Cancel timer</button></div></div>';
    } else {
      h += '<p>Start the timer when the power goes out. It tracks USDA food-safety limits: refrigerator 4 h, half-full freezer 24 h, full freezer 48 h (doors closed). It keeps running if you close the app.</p>' +
        '<div class="row-btns"><button type="button" class="small-btn primary" id="out-start">Start outage timer now</button></div>';
    }
    if (o.log && o.log.length) h += '<details><summary>Past outages (' + o.log.length + ")</summary><ul>" + o.log.slice(-6).reverse().map(function (x) { return "<li>" + esc(ct(x.start)) + " · " + esc(dur(x.end - x.start)) + "</li>"; }).join("") + "</ul></details>";
    h += '<p class="d">Keep a thermometer in the fridge (40 °F or below) and freezer (0 °F). When in doubt, throw it out. <a href="https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/food-safety-during-power-outage" target="_blank" rel="noopener">USDA FSIS guidance ↗</a></p>';
    h += '<h3>Generator fuel calculator</h3><div class="gen"><label>Fuel on hand (gal)<input data-gen="fuel" type="number" min="0" step="0.5" value="' + r.g.fuel + '"></label>' +
      '<label>Rated running watts<input data-gen="rated" type="number" min="500" step="100" value="' + r.g.rated + '"></label>' +
      '<label>Load (watts)<input data-gen="load" type="number" min="0" step="50" value="' + r.g.load + '"></label>' +
      '<label>Gal/hour at 50% load (manual)<input data-gen="gph50" type="number" min="0.05" step="0.05" value="' + r.g.gph50 + '"></label>' +
      '<label>Hours run per day<input data-gen="hpd" type="number" min="1" max="24" step="1" value="' + r.g.hpd + '"></label></div>' +
      '<div class="gen-add"><span class="d">Add typical running watts:</span> ' + LOADS.map(function (l) { return '<button type="button" class="chip-btn" data-addw="' + l[1] + '">' + esc(l[0]) + " " + l[1] + "</button>"; }).join("") + ' <button type="button" class="chip-btn" data-addw="0">Reset</button></div>' +
      '<div class="gen-out" id="gen-out">' + genOut(r) + "</div>" +
      '<p class="d">Estimate only: burn scales roughly with load (the manual\'s 50%-load figure, about 35% of it at idle). Check your nameplate and appliance labels; motors need 2-3x watts to start. Run generators outdoors only, 20+ ft from the house with the exhaust pointed away, and use CO alarms. <a href="https://www.cdc.gov/carbon-monoxide/about/index.html" target="_blank" rel="noopener">CDC CO safety ↗</a></p></section>';
    return h;
  }
  function genOut(r) {
    return "<b>" + r.burn.toFixed(2) + " gal/h</b> at " + r.pct + "% load → <b>" + r.hrs.toFixed(1) + " hours</b> of run time on " + r.g.fuel + " gal" +
      " (" + r.days.toFixed(1) + " days at " + r.g.hpd + " h/day). " + (r.warn ? '<span class="warn">' + esc(r.warn) + "</span>" : "");
  }

  // ================= 3. Comms check =================
  var NWR = [ // NWS St. Louis NOAA Weather Radio (weather.gov/lsx/nwr) and county coverage (weather.gov/source/nwr/JS/CCL.js)
    ["KDO89", "162.550", "St. Louis (Shrewsbury, MO), 1,000 W", "Primary for St. Clair, Madison, Monroe (IL) and St. Louis City, St. Louis, St. Charles, Jefferson (MO)"],
    ["KXI70", "162.450", "Jerseyville, IL", "Also covers Madison County, IL"],
    ["WNG728", "162.425", "Hawk Point, MO", "Also covers St. Charles County, MO"],
    ["KXI42", "162.450", "Chester, IL", "Serves parts of southwest Illinois and southeast Missouri"]];
  var SAME = [["St. Clair, IL", "017163"], ["Madison, IL", "017119"], ["Monroe, IL", "017133"], ["St. Louis City, MO", "029510"], ["St. Louis County, MO", "029189"], ["St. Charles, MO", "029183"], ["Jefferson, MO", "029099"]];
  var RADIOS = ["NOAA weather radio", "GMRS / FRS handheld", "Ham handheld (2 m / 70 cm)", "Scanner", "AM/FM battery radio", "CB"];
  var K_DR = "ftp-private-drills";
  function drState() { var s = load(K_DR, {}); s.drills = s.drills || {}; s.radio = s.radio || { interval: 30, log: [] }; return s; }
  function commsHtml() {
    var s = drState(), rd = s.radio, last = rd.log.length ? rd.log[rd.log.length - 1].date : null, due = last ? addDays(last, rd.interval || 30) : today(), dd = daysBetween(today(), due);
    return '<section class="prep" id="prep-radio"><h2>Comms check</h2>' +
      '<h3 class="stl-only">NOAA Weather Radio (NWS St. Louis)</h3><div class="tbl nwr"><table><thead><tr><th>Station</th><th>MHz</th><th>Transmitter / coverage</th></tr></thead><tbody>' +
      NWR.map(function (r) { return "<tr><td><b>" + r[0] + "</b></td><td><b>" + r[1] + "</b></td><td>" + esc(r[2]) + '<div class="d">' + esc(r[3]) + "</div></td></tr>"; }).join("") + "</tbody></table></div>" +
      '<p class="d">SAME codes to program a weather radio for county alerts: ' + SAME.map(function (x) { return esc(x[0]) + " <b>" + x[1] + "</b>"; }).join(" · ") +
      '. The Required Weekly Test airs <b>Wednesdays around 11 AM</b> (skipped if severe weather threatens), a good time to check your radio. Hillsboro KXI79 is off the air. Sources: <a href="https://www.weather.gov/lsx/nwr" target="_blank" rel="noopener">NWS St. Louis NWR ↗</a> · <a href="https://www.weather.gov/nwr/county_coverage" target="_blank" rel="noopener">NWR county coverage ↗</a></p>' +
      "<h3 class=\"stl-only\">Ham repeaters</h3><p class=\"d\">See the repeater table under Rally &amp; comms (St. Clair ARC K9GXU 147.120+, St. Louis Metro Skywarn 147.360+, 2 m simplex 146.520, with sources). Transmitting needs an FCC amateur license; listening doesn't.</p>" +
      '<h3 class="stl-only">Scanners (public safety)</h3><ul><li><b>St. Clair County, IL:</b> STARCOM21 statewide P25 trunked system, St. Clair Co simulcast site 059 (NAC 140). Control channels 851.225, 851.5625, 852.1625 MHz. Used by CenCom 911, the sheriff, EMA and many county agencies. Needs a digital P25 (Phase II capable) trunking scanner. <a href="https://www.radioreference.com/db/site/14146" target="_blank" rel="noopener">RadioReference site ↗</a> · <a href="https://www.radioreference.com/db/browse/ctid/672" target="_blank" rel="noopener">St. Clair County ↗</a></li>' +
      '<li><b>St. Louis, St. Charles and Jefferson counties, MO:</b> SLATER 800 MHz P25 trunked system. Most police dispatch is encrypted and can\'t be heard on a scanner. <a href="https://www.radioreference.com/db/sid/1085" target="_blank" rel="noopener">RadioReference SLATER ↗</a> · <a href="https://wiki.radioreference.com/index.php/St._Louis_Area_Trunked_Emergency_Radio_(SLATER)" target="_blank" rel="noopener">SLATER wiki ↗</a></li>' +
      '<li>Skywarn severe-weather nets on 147.360+ (PL 141.3) are unencrypted and the most useful listen during storms.</li></ul>' +
      '<h3>Monthly radio test</h3><div class="due ' + (dd < 0 ? "over" : dd <= 3 ? "soon" : "") + '">' + (last ? "Last test " + esc(fmtDay(last)) + ". " : "No test logged yet. ") + "Next due <b>" + esc(fmtDay(due)) + "</b>" + (dd < 0 ? " (" + -dd + " days overdue)" : dd === 0 ? " (today)" : " (in " + dd + " days)") + "</div>" +
      '<form class="comms log-form" onsubmit="return false"><label>Radio<select id="rt-radio">' + RADIOS.map(function (r) { return "<option>" + esc(r) + "</option>"; }).join("") + "</select></label>" +
      '<label>Result<select id="rt-res"><option>Heard clearly</option><option>Weak / static</option><option>Failed</option></select></label>' +
      '<label>Notes<input id="rt-notes" placeholder="e.g. KDO89 RWT heard, batteries swapped"></label>' +
      '<label>Repeat every (days)<input id="rt-int" type="number" min="7" max="90" value="' + esc(rd.interval || 30) + '"></label>' +
      '<div class="row"><button type="button" class="small-btn primary" id="rt-log">Log a test today</button></div></form>' +
      (rd.log.length ? '<details><summary>Test log (' + rd.log.length + ")</summary><ul>" + rd.log.slice().reverse().map(function (x, i) { return "<li>" + esc(fmtDay(x.date)) + " · " + esc(x.radio) + " · <b>" + esc(x.result) + "</b>" + (x.notes ? " · " + esc(x.notes) : "") + ' <button type="button" class="linkish" data-rtdel="' + (rd.log.length - 1 - i) + '">delete</button></li>'; }).join("") + "</ul></details>" : "") +
      '<p class="d">Reminder and log are stored on this device only. With push alerts on, you get a notification when the test is due.</p></section>';
  }

  // ================= 4. Drills =================
  var DRILLS = [["fire", "Fire drill", "Smoke alarms tested; two ways out of every room; everyone to rally point 1 in under 2 minutes."],
    ["shelter", "Shelter drill", "Tornado: everyone to the safe room with shoes, helmets and the radio in under 2 minutes."],
    ["meetup", "Meet-up drill", "Practice getting to rally points 2 and 3 without phones; time it."],
    ["comms", "Comms drill", "Everyone checks in by text with the out-of-area contact, then by radio on the primary and backup channels."]];
  function drillsHtml() {
    var s = drState(), t = today();
    return '<section class="prep" id="prep-drills"><h2>Drill reminders</h2><p class="hint">Stored on this device only. Default is every 90 days (quarterly); change per drill. With push alerts on, you get a notification when one is due.</p>' +
      DRILLS.map(function (d) {
        var x = s.drills[d[0]] || {}, iv = x.interval || 90, last = x.log && x.log.length ? x.log[x.log.length - 1].date : null, due = last ? addDays(last, iv) : t, dd = daysBetween(t, due);
        return '<div class="drill"><div class="drill-h"><b>' + esc(d[1]) + '</b><span class="due ' + (dd < 0 ? "over" : dd <= 7 ? "soon" : "") + '">' + (last ? "Due " + esc(fmtDay(due)) + (dd < 0 ? " · " + -dd + " d overdue" : dd === 0 ? " · today" : " · in " + dd + " d") : "Not done yet · due now") + "</span></div>" +
          '<div class="d">' + esc(d[2]) + "</div>" +
          '<div class="drill-row"><span class="d">Last done: <b>' + (last ? esc(fmtDay(last)) : "never") + '</b></span><label class="d">Every <input type="number" min="7" max="365" data-div="' + d[0] + '" value="' + iv + '"> days</label></div>' +
          '<div class="drill-row"><input data-dnote="' + d[0] + '" placeholder="Notes (time taken, what went wrong)"><button type="button" class="small-btn primary" data-ddone="' + d[0] + '">Done today</button></div>' +
          (x.log && x.log.length ? "<details><summary>Log (" + x.log.length + ")</summary><ul>" + x.log.slice().reverse().map(function (l, i) { return "<li>" + esc(fmtDay(l.date)) + (l.notes ? " · " + esc(l.notes) : "") + ' <button type="button" class="linkish" data-ddel="' + d[0] + ":" + (x.log.length - 1 - i) + '">delete</button></li>'; }).join("") + "</ul></details>" : "") + "</div>";
      }).join("") + "</section>";
  }
  // mirror due dates (no personal details) to Cache Storage for the service worker's background check
  function syncReminders() {
    var s = drState(), out = [], t = today();
    DRILLS.forEach(function (d) { var x = s.drills[d[0]] || {}, last = x.log && x.log.length ? x.log[x.log.length - 1].date : null; if (last || x.started) out.push({ id: "drill-" + d[0], title: d[1], due: last ? addDays(last, x.interval || 90) : t, hash: "#prep-drills" }); });
    var rl = s.radio.log; if (rl.length) out.push({ id: "radio", title: "Monthly radio test", due: addDays(rl[rl.length - 1].date, s.radio.interval || 30), hash: "#prep-radio" });
    if (!("caches" in window)) return;
    caches.open("ftp-notify").then(function (c) { return c.put("/__ftp_reminders", new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } })); }).catch(function () {});
  }

  // ================= render & events =================
  function render() {
    var r1 = $("power-root"), r2 = $("radio-root"), r3 = $("drills-root"), r0 = $("air-root");
    if (r2) r2.innerHTML = commsHtml(); if (r3) r3.innerHTML = drillsHtml();
    getFeeds().then(function (f) {
      if (r1) r1.innerHTML = powerHtml(f);
      if (r0) { r0.innerHTML = airHtml(f, aqLive); liveAqi().then(function (l) { if (l) r0.innerHTML = airHtml(f, l); }); }
    });
  }
  document.addEventListener("ftp-loc", function () { aqLive = null; aqAt = 0; if ($("air-root") && $("air-root").innerHTML) render(); });
  function rerender(id, html) { var el = $(id); if (el) { var tmp = document.createElement("div"); tmp.innerHTML = html; el.replaceWith(tmp.firstChild); } }
  function rePower() { getFeeds().then(function (f) { rerender("prep-outage", powerHtml(f)); }); }
  var tick = setInterval(function () { var o = load(K_OUT, {}); if (o.start && !o.end && document.visibilityState === "visible" && $("prep-outage") && !document.querySelector('[data-panel="prep"]').hidden) { var a = document.activeElement; if (!a || !a.closest || !a.closest("#prep-outage .gen")) rePower(); } }, 30000);
  document.addEventListener("click", function (e) {
    var t = e.target;
    var tab = t.closest && t.closest("[data-tab]"); if (tab && tab.getAttribute("data-tab") === "prep") setTimeout(render, 0);
    if (t.id === "out-start") { var o = load(K_OUT, {}); o.start = Date.now(); delete o.end; save(K_OUT, o); rePower(); }
    if (t.id === "out-nope") { var o2 = load(K_OUT, {}); o2.dismissed = t.getAttribute("data-gen"); save(K_OUT, o2); rePower(); }
    if (t.id === "out-end" || t.id === "out-cancel") { var o3 = load(K_OUT, {}); if (t.id === "out-end") { o3.log = (o3.log || []).concat([{ start: o3.start, end: Date.now() }]).slice(-20); } delete o3.start; save(K_OUT, o3); rePower(); }
    var aw = t.closest && t.closest("[data-addw]"); if (aw) { var g = load(K_GEN, genCalc().g), w = +aw.getAttribute("data-addw"); g.load = w ? (+g.load || 0) + w : 0; save(K_GEN, g); rePower(); }
    if (t.id === "rt-log") { var s = drState(); s.radio.log.push({ date: today(), radio: $("rt-radio").value, result: $("rt-res").value, notes: $("rt-notes").value.trim().slice(0, 200) }); s.radio.log = s.radio.log.slice(-60); save(K_DR, s); syncReminders(); rerender("prep-radio", commsHtml()); }
    var rd = t.closest && t.closest("[data-rtdel]"); if (rd) { var s2 = drState(); s2.radio.log.splice(+rd.getAttribute("data-rtdel"), 1); save(K_DR, s2); syncReminders(); rerender("prep-radio", commsHtml()); }
    var dn = t.closest && t.closest("[data-ddone]"); if (dn) { var k = dn.getAttribute("data-ddone"), s3 = drState(), x = s3.drills[k] = s3.drills[k] || {}, note = document.querySelector('[data-dnote="' + k + '"]'); x.log = (x.log || []).concat([{ date: today(), notes: note ? note.value.trim().slice(0, 200) : "" }]).slice(-40); save(K_DR, s3); syncReminders(); rerender("prep-drills", drillsHtml()); }
    var dd = t.closest && t.closest("[data-ddel]"); if (dd) { var p = dd.getAttribute("data-ddel").split(":"), s4 = drState(); s4.drills[p[0]].log.splice(+p[1], 1); save(K_DR, s4); syncReminders(); rerender("prep-drills", drillsHtml()); }
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.matches && t.matches("[data-gen]") && t.tagName === "INPUT") { var g = load(K_GEN, genCalc().g); g[t.getAttribute("data-gen")] = Math.max(0, +t.value || 0); save(K_GEN, g); var o = $("gen-out"); if (o) o.innerHTML = genOut(genCalc()); }
    if (t.matches && t.matches("[data-div]")) { var s = drState(), k = t.getAttribute("data-div"); s.drills[k] = s.drills[k] || {}; s.drills[k].interval = Math.max(7, Math.min(365, +t.value || 90)); s.drills[k].started = true; save(K_DR, s); syncReminders(); rerender("prep-drills", drillsHtml()); }
    if (t.id === "rt-int") { var s5 = drState(); s5.radio.interval = Math.max(7, Math.min(90, +t.value || 30)); save(K_DR, s5); syncReminders(); rerender("prep-radio", commsHtml()); }
  });
  document.addEventListener("input", function (e) { var t = e.target; if (t.matches && t.matches("input[data-gen]")) { var g = load(K_GEN, genCalc().g); g[t.getAttribute("data-gen")] = Math.max(0, +t.value || 0); save(K_GEN, g); var o = $("gen-out"); if (o) o.innerHTML = genOut(genCalc()); } });
  // deep links like #prep-air / #prep-drills (from notifications): open Prep and scroll to the section
  function deep() {
    var h = (location.hash || "").slice(1); if (!/^prep-/.test(h)) return;
    var tb = document.querySelector('[data-tab="prep"]'); if (tb) tb.click();
    var n = 0, iv = setInterval(function () { var el = $(h); if (el || ++n > 30) { clearInterval(iv); if (el) el.scrollIntoView({ block: "start" }); } }, 150);
  }
  window.addEventListener("hashchange", deep);
  setTimeout(deep, 450);
  syncReminders();
  window.ftpPrep2 = { render: render, genCalc: genCalc, syncReminders: syncReminders };
})();
