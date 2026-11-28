/* V2.2 operations modules (all on-device; localStorage ftp-private-* unless noted):
   - SYSTEM: notification preferences (classes, distance, quiet hours, categories), mirrored to Cache Storage so the
     service worker applies the same filter; honest explanation of closed-app alerts.
   - PREPAREDNESS: emergency supply checklists, downloadable preparedness report (generated on this device).
   - PLANS: emergency scenarios, shelter-in-place plan, reunification points, nearby services lookup (OpenStreetMap
     Overpass, only when tapped; sends the chosen place rounded to 2 decimals), suggested-vs-verified route note.
   - FAMILY/COMMS: important public phone numbers, one-file offline pack download. */
(function () {
  "use strict";
  var V2 = window.V2, V22 = window.V22, E = window.FTPEngine, $ = V2.$, esc = V2.esc, load = V2.load, save = V2.save;

  // ================= notification preferences =================
  var KN = "ftp-notify-prefs";
  var NDEF = { critical: true, high: true, info: true, maxMi: 50, quiet: false, qFrom: "22:00", qTo: "07:00", cats: {} };
  function nprefs() { var p = Object.assign({}, NDEF, load(KN, {})); p.cats = p.cats || {}; return p; }
  V22.notifyPrefs = nprefs;
  function mirrorPrefs(p) {
    if (typeof caches === "undefined") return;
    caches.open("ftp-notify").then(function (c) { return c.put("/__ftp_notify_prefs", new Response(JSON.stringify(p), { headers: { "Content-Type": "application/json" } })); }).catch(function () {});
  }
  mirrorPrefs(nprefs());
  function notifPrefsHtml() {
    var p = nprefs();
    return '<section class="prep xp-sec" id="v22-notifprefs"><h2>Notification preferences</h2>' +
      '<p class="hint">Applied on this device by the app and its service worker. <b>Critical</b> = tornado, flash flood, evacuation, shelter-in-place, civil danger, hazmat and similar warnings; ' +
      "<b>High</b> = other warnings, highway closures, large metro power outages, local threats at High/Severe; <b>Informational</b> = national or world threats at High/Severe, unhealthy air, small quakes, drill and radio-test reminders.</p>" +
      '<div class="np-grid"><label class="chk"><input type="checkbox" data-np="critical"' + (p.critical ? " checked" : "") + "> Critical alerts</label>" +
      '<label class="chk"><input type="checkbox" data-np="high"' + (p.high ? " checked" : "") + "> High-priority alerts</label>" +
      '<label class="chk"><input type="checkbox" data-np="info"' + (p.info ? " checked" : "") + "> Informational alerts</label>" +
      '<label>Only events within <select data-np="maxMi">' + [10, 25, 50, 100, 250].map(function (m) { return '<option value="' + m + '"' + (+p.maxMi === m ? " selected" : "") + ">" + m + " mi</option>"; }).join("") + "</select> of a monitored place (where a distance is known)</label>" +
      '<label class="chk"><input type="checkbox" data-np="quiet"' + (p.quiet ? " checked" : "") + '> Quiet hours</label><label>from <input type="time" data-np="qFrom" value="' + esc(p.qFrom) + '"> to <input type="time" data-np="qTo" value="' + esc(p.qTo) + '"></label></div>' +
      '<p class="d">Quiet hours hold back High and Informational alerts. <b>Critical alerts always come through.</b></p>' +
      '<details><summary>Categories</summary><div class="np-grid">' + Object.keys(E.CATS).map(function (k) { return '<label class="chk"><input type="checkbox" data-npcat="' + k + '"' + (p.cats[k] === false ? "" : " checked") + "> " + esc(E.CATS[k][0]) + "</label>"; }).join("") + "</div></details>" +
      '<h3>Alerts when the app is closed</h3><ul class="d"><li><b>Phone alerts that do not need this app open:</b> a free scheduled checker on GitHub polls the National Weather Service every few minutes for the St. Louis area (St. Clair County, St. Louis city and county) and sends critical warnings to the family\'s private ntfy channel. Install the free <b>ntfy</b> app and subscribe to the channel name the family coordinator gives you (it is never shown on this public site). GitHub runs it on a best-effort schedule, so it can lag by several minutes: keep a NOAA Weather Radio and Wireless Emergency Alerts on.</li>' +
      "<li><b>This app:</b> checks while open; on Android an installed app may also check in the background about hourly. It cannot alert you when the device is offline.</li>" +
      '<li><b>Wireless Emergency Alerts</b> (phone settings) and <b>NOAA Weather Radio 162.550 MHz</b> remain the primary warning paths.</li></ul></section>';
  }
  function paintNotif() {
    var s = $("v2-notif"); if (!s || $("v22-notifprefs")) return;
    s.insertAdjacentHTML("afterend", notifPrefsHtml());
  }
  document.addEventListener("change", function (e) {
    var t = e.target, p;
    if (t.matches && t.matches("[data-np]")) { p = nprefs(); var k = t.getAttribute("data-np"); p[k] = t.type === "checkbox" ? t.checked : k === "maxMi" ? +t.value : t.value; save(KN, p); mirrorPrefs(p); }
    if (t.matches && t.matches("[data-npcat]")) { p = nprefs(); p.cats[t.getAttribute("data-npcat")] = t.checked; save(KN, p); mirrorPrefs(p); }
  });

  // ================= checklists =================
  var KCL = "ftp-private-checklists";
  var LISTS = {
    gobag: ["Go bag (each person)", ["Water and snacks for 3 days", "Medications (7 days) and copies of prescriptions", "Phone charger and power bank", "Flashlight and spare batteries", "Change of clothes and sturdy shoes", "Cash in small bills", "Copies of IDs and insurance cards", "Glasses / hearing aids / medical devices", "Whistle, N95 mask, basic first aid", "Printed contact card and rally points"]],
    shelter: ["Shelter-in-place kit", ["Water: 1 gallon per person per day", "Food that needs no cooking", "Battery or hand-crank NOAA radio", "Plastic sheeting and duct tape", "Flashlights in the shelter room", "First aid kit", "Sanitation: bags, wipes, bucket", "Pet supplies"]],
    car: ["Vehicle kit", ["Blanket and warm layers", "Water and snacks", "Jumper cables", "Flashlight", "Phone car charger", "First aid kit", "Ice scraper / small shovel (winter)", "Paper map of the region"]],
    docs: ["Important documents", ["IDs, passports, birth certificates (copies)", "Insurance policies (home, auto, health)", "Medical records / medication list", "Bank and credit card contacts", "Property deed or lease", "Pet records", "Encrypted backup of the medical vault on a USB stick"]],
    outage: ["Extended power outage", ["Flashlights and lanterns (no candles near kids or pets)", "Batteries for every device", "Charged power banks / power station", "Cooler and ice packs", "Generator fuel stored safely (run outdoors only)", "CO alarm with fresh batteries", "Medical devices: backup power plan", "Know how to open the garage door manually"]],
    comms: ["Communications kit", ["NOAA Weather Radio with fresh batteries", "Two-way radios charged and channel agreed", "Printed contact list and comms card", "Out-of-area contact knows the plan", "Car chargers for every phone"]]
  };
  function cl() { var s = load(KCL, {}); s.done = s.done || {}; s.custom = s.custom || {}; return s; }
  function clItems(s, k) { return LISTS[k][1].concat(s.custom[k] || []); }
  function checklistsHtml() {
    var s = cl();
    return '<section class="prep xp-sec" id="v22-checklists"><h2>Emergency supply checklists</h2><p class="hint">Tick what is ready. Saved only on this device. Add your own items to any list.</p>' +
      Object.keys(LISTS).map(function (k) {
        var its = clItems(s, k), n = its.filter(function (_, i) { return s.done[k + ":" + i]; }).length;
        return '<details class="scn-card" data-cl="' + k + '"><summary>' + esc(LISTS[k][0]) + ' <span class="badge-s">' + n + "/" + its.length + "</span></summary>" +
          '<ul class="chk-list">' + its.map(function (it, i) { return '<li><label class="chk"><input type="checkbox" data-clk="' + k + ":" + i + '"' + (s.done[k + ":" + i] ? " checked" : "") + "> " + esc(it) + "</label></li>"; }).join("") + "</ul>" +
          '<div class="row-btns"><input data-cladd="' + k + '" placeholder="Add an item" maxlength="80" aria-label="New checklist item"><button type="button" class="small-btn" data-claddbtn="' + k + '">Add</button><button type="button" class="small-btn" data-clreset="' + k + '">Untick all</button></div></details>';
      }).join("") +
      '<div class="row-btns"><button type="button" class="small-btn primary" id="v22-report">Download preparedness report</button></div><p class="d">The report is built on this device (inventory, readiness, reorder list, checklists, scenarios). Medical details are never included.</p></section>';
  }
  function paintChecklists() { var r = $("v22-cl-root"); if (r) r.innerHTML = checklistsHtml(); }
  (function mountPrep() { var inv = $("inv-root"); if (inv && !$("v22-cl-root")) inv.insertAdjacentHTML("afterend", '<div id="v22-cl-root"></div>'); })();
  document.addEventListener("change", function (e) {
    var t = e.target; if (!t.matches || !t.matches("[data-clk]")) return;
    var s = cl(); s.done[t.getAttribute("data-clk")] = t.checked; save(KCL, s);
    var k = t.getAttribute("data-clk").split(":")[0], d = t.closest("details"), its = clItems(s, k), n = its.filter(function (_, i) { return s.done[k + ":" + i]; }).length, b = d && d.querySelector(".badge-s"); if (b) b.textContent = n + "/" + its.length;
  });
  document.addEventListener("click", function (e) {
    var t = e.target, s;
    var ab = t.closest && t.closest("[data-claddbtn]");
    if (ab) { var k = ab.getAttribute("data-claddbtn"), inp = document.querySelector('[data-cladd="' + k + '"]'), v = (inp.value || "").trim().slice(0, 80); if (!v) return; s = cl(); s.custom[k] = (s.custom[k] || []).concat([v]); save(KCL, s); paintChecklists(); var d = document.querySelector('[data-cl="' + k + '"]'); if (d) d.open = true; }
    var rb = t.closest && t.closest("[data-clreset]");
    if (rb) { s = cl(); var kk = rb.getAttribute("data-clreset"); Object.keys(s.done).forEach(function (x) { if (x.indexOf(kk + ":") === 0) delete s.done[x]; }); save(KCL, s); paintChecklists(); }
    if (t.id === "v22-report") V2.download("preparedness-report-" + new Date().toISOString().slice(0, 10) + ".html", reportHtml(), "text/html");
    if (t.id === "v22-pack") V2.download("family-emergency-pack-" + new Date().toISOString().slice(0, 10) + ".html", packHtml(!!($("v22-pack-med") && $("v22-pack-med").checked)), "text/html");
  });

  // ================= scenarios, shelter-in-place, reunification =================
  var KS = "ftp-private-scenarios";
  var SCN = {
    weather: ["Severe weather", "shelter", ["Monitor NWS warnings and WEA", "Move to the shelter room on a Tornado Warning", "Bring phones, shoes, flashlight, helmet", "Check in with the family after it passes"]],
    outage: ["Extended power outage", "shelter", ["Check on medical devices and backup power", "Keep fridge closed; move food to cooler after 4 h", "Run generators outdoors only, 20 ft from windows", "Charge phones in the car if needed", "Check on neighbors"]],
    wildfire: ["Wildfire / heavy smoke", "depends", ["Close windows; run HVAC on recirculate with a clean filter", "N95 masks for anyone outdoors", "Pack the car if smoke or fire is near", "Leave early if officials advise"]],
    flood: ["Flooding", "depends", ["Never drive through water", "Move valuables and documents upstairs", "Know the higher-ground route", "Turn off utilities if told to"]],
    infra: ["Regional infrastructure failure", "shelter", ["Expect phones, fuel, stores and ATMs to fail", "Use the comms plan: text first, then radio", "Conserve fuel and water", "Use paper maps and cash"]],
    evac: ["Evacuation order", "evacuate", ["Grab go bags and medications", "Follow the primary route; switch to secondary if blocked", "Tell the out-of-area contact you are leaving", "Turn off utilities if told; lock up", "Meet at the reunification point if separated"]]
  };
  function scn() { var s = load(KS, {}); s.list = s.list || {}; s.shelter = s.shelter || {}; s.reunion = s.reunion || []; return s; }
  function evacPlans() { var e = load("ftp-private-evac", {}); return e.plans || []; }
  function scenariosHtml() {
    var s = scn(), plans = evacPlans(), roads = V22.roadIncidents ? V22.roadIncidents() : null, closed = 0, major = 0;
    if (roads) roads.items.forEach(function (r) { var near = V22.places().some(function (l) { return E.miles(r.lat, r.lng, +l.lat, +l.lon) <= 25; }); if (near && r.closed) { closed++; if (V22.majorRoad(r)) major++; } });
    var h = '<section class="prep xp-sec" id="v22-scenarios"><h2>Emergency scenarios</h2><p class="hint">One plan per scenario: shelter or go, the steps, where to go and where to reunite. Saved only on this device. Routes you write are <b>suggested routes, not verified road conditions</b>.</p>' +
      '<div class="warn-box"><b>Verified road conditions right now:</b> ' + (roads ? closed + " IDOT road closure" + (closed === 1 ? "" : "s") + " within 25 mi of your places, " + major + " on interstate, US or state routes (" + (roads.live ? "live, " : "saved copy, ") + esc(V2.ct(roads.at)) + "). " : "IDOT feed not loaded yet (open the Map). ") +
      'Missouri: check the <a href="https://traveler.modot.org/map/" target="_blank" rel="noopener">MoDOT Traveler map</a>. Illinois: <a href="https://www.gettingaroundillinois.com/Traveler%20Information/index.html" target="_blank" rel="noopener">Getting Around Illinois</a>.</div>';
    h += Object.keys(SCN).map(function (k) {
      var x = s.list[k] || {}, steps = x.steps || SCN[k][2], dec = x.decision || SCN[k][1];
      return '<details class="scn-card" data-scn="' + k + '"><summary>' + esc(SCN[k][0]) + ' <span class="badge-s">' + esc({ shelter: "shelter in place", evacuate: "evacuate", depends: "depends" }[dec]) + "</span></summary>" +
        '<form class="comms" autocomplete="off"><label>Decision<select data-sf="decision"><option value="shelter"' + (dec === "shelter" ? " selected" : "") + '>Shelter in place</option><option value="evacuate"' + (dec === "evacuate" ? " selected" : "") + '>Evacuate</option><option value="depends"' + (dec === "depends" ? " selected" : "") + ">Depends on the trigger</option></select></label>" +
        '<label>Trigger (when we act)<input data-sf="trigger" value="' + esc(x.trigger || "") + '" placeholder="e.g. Tornado Warning for our county"></label>' +
        "<label>Steps (one per line)<textarea data-sf=\"steps\" rows=\"4\">" + esc(steps.join("\n")) + "</textarea></label>" +
        '<label>Evacuation plan<select data-sf="plan"><option value="">— none —</option>' + plans.map(function (p) { return '<option value="' + esc(p.id) + '"' + (x.plan === p.id ? " selected" : "") + ">" + esc(p.name || "Untitled plan") + "</option>"; }).join("") + "</select></label>" +
        '<label>Primary destination<input data-sf="dest1" value="' + esc(x.dest1 || "") + '"></label><label>Secondary destination<input data-sf="dest2" value="' + esc(x.dest2 || "") + '"></label>' +
        '<label>Alternate transportation / route (suggested, not verified)<input data-sf="alt" value="' + esc(x.alt || "") + '"></label>' +
        '<label>Reunification point if separated<input data-sf="reunite" value="' + esc(x.reunite || "") + '"></label></form></details>';
    }).join("");
    var sh = s.shelter;
    h += '<details class="scn-card" id="v22-shelter"><summary>Shelter-in-place plan</summary><form class="comms" autocomplete="off">' +
      [["room", "Shelter room (lowest floor, interior, no windows)"], ["supplies", "Where the shelter supplies are"], ["utilities", "Utility shutoffs (gas, water, power) and who handles them"], ["seal", "Sealing the room (chemical release): who and with what"], ["duration", "How long we can stay (water/food days)"], ["pets", "Pets"]]
        .map(function (f) { return "<label>" + esc(f[1]) + '<input data-shf="' + f[0] + '" value="' + esc(sh[f[0]] || "") + '"></label>'; }).join("") + "</form></details>";
    h += '<details class="scn-card" id="v22-reunion"><summary>Family reunification points <span class="badge-s">' + s.reunion.length + "</span></summary>" +
      '<ul class="chk-list">' + s.reunion.map(function (r, i) { return "<li><b>" + esc(r.name) + "</b> " + esc(r.note || "") + ' <button type="button" class="small-btn" data-rudel="' + i + '">Remove</button></li>'; }).join("") + "</ul>" +
      '<div class="row-btns"><input id="ru-name" placeholder="Place (public landmark)" maxlength="80" aria-label="Reunification place"><input id="ru-note" placeholder="When to use it" maxlength="120" aria-label="When to use it"><button type="button" class="small-btn" id="ru-add">Add</button></div>' +
      '<p class="d">Rally points 1–3 (Family operations) are the first meeting places; these are wider-area points for when the area is closed or phones are down.</p></details>';
    h += servicesHtml() + "</section>";
    return h;
  }
  // nearby services (OpenStreetMap via Overpass) — on demand only
  var SVC = [["hospital", "Hospitals", '["amenity"="hospital"]'], ["pharmacy", "Pharmacies", '["amenity"="pharmacy"]'], ["fuel", "Fuel stations", '["amenity"="fuel"]'],
    ["police", "Police", '["amenity"="police"]'], ["fire", "Fire stations", '["amenity"="fire_station"]'], ["supply", "Groceries & hardware", '["shop"~"^(supermarket|hardware|doityourself)$"]']];
  function servicesHtml() {
    var ps = V22.places();
    return '<details class="scn-card" id="v22-services"><summary>Nearby hospitals, pharmacies, fuel, emergency services and supplies</summary>' +
      '<p class="d">Looks up OpenStreetMap (community data; may be incomplete or out of date) around one of your places. Only that place\'s point, rounded to about 1 km, is sent to the public Overpass server, and only when you tap Search. Call ahead: hours and stock are not live.</p>' +
      '<div class="row-btns"><label>Around <select id="svc-place">' + ps.map(function (l, i) { return '<option value="' + i + '">' + esc(l.name) + "</option>"; }).join("") + '</select></label><label>Within <select id="svc-r"><option value="5000">3 mi</option><option value="10000" selected>6 mi</option><option value="25000">15 mi</option></select></label>' +
      '<label>Type <select id="svc-type">' + SVC.map(function (x) { return '<option value="' + x[0] + '">' + esc(x[1]) + "</option>"; }).join("") + '</select></label><button type="button" class="small-btn primary" id="svc-go">Search</button></div><div id="svc-res"></div></details>';
  }
  function svcSearch() {
    var ps = V22.places(), l = ps[+$("svc-place").value] || ps[0], r = +$("svc-r").value, ty = SVC.filter(function (x) { return x[0] === $("svc-type").value; })[0], out = $("svc-res");
    var lat = (+l.lat).toFixed(2), lon = (+l.lon).toFixed(2), key = "ftp-v22-svc-" + ty[0] + "-" + lat + "," + lon + "-" + r, c = load(key, null);
    var show = function (rec, live) {
      var items = rec.items.map(function (x) { x.mi = E.miles(+lat, +lon, x.lat, x.lon); return x; }).sort(function (a, b) { return a.mi - b.mi; }).slice(0, 25);
      out.innerHTML = '<p class="d">' + items.length + " found · OpenStreetMap " + (live ? "now" : "saved copy " + esc(V2.ct(rec.at))) + "</p>" + (items.length ? '<ul class="chk-list">' + items.map(function (x) {
        return "<li><b>" + esc(x.name || ty[1].replace(/s$/, "")) + '</b> <span class="d">~' + x.mi.toFixed(1) + " mi" + (x.addr ? " · " + esc(x.addr) : "") + (x.phone ? " · " + esc(x.phone) : "") + (x.hours ? " · hours: " + esc(x.hours) : "") + '</span> <a href="https://www.openstreetmap.org/' + esc(x.osm) + '" target="_blank" rel="noopener">map ↗</a></li>';
      }).join("") + "</ul>" : "");
    };
    if (c && Date.now() - Date.parse(c.at) < 7 * 864e5 && navigator.onLine === false) return show(c, false);
    out.innerHTML = '<p class="d">Searching…</p>';
    var q = "[out:json][timeout:25];(node" + ty[2] + "(around:" + r + "," + lat + "," + lon + ");way" + ty[2] + "(around:" + r + "," + lat + "," + lon + "););out center 80;";
    var ac = typeof AbortController !== "undefined" ? new AbortController() : null; if (ac) setTimeout(function () { ac.abort(); }, 30000);
    var osmLink = '<a href="https://www.openstreetmap.org/search?query=' + encodeURIComponent(ty[1].toLowerCase()) + "%20near%20" + lat + "%2C" + lon + '" target="_blank" rel="noopener">search OpenStreetMap instead ↗</a>';
    fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: ac ? ac.signal : undefined })
      .then(function (res) { if (!res.ok) throw 0; return res.json(); })
      .then(function (j) {
        var rec = { at: new Date().toISOString(), items: (j.elements || []).map(function (el) {
          var t = el.tags || {}, la = el.lat != null ? el.lat : el.center && el.center.lat, lo = el.lon != null ? el.lon : el.center && el.center.lon;
          return { name: String(t.name || "").slice(0, 80), lat: la, lon: lo, osm: el.type + "/" + el.id, phone: String(t.phone || t["contact:phone"] || "").slice(0, 30), hours: String(t.opening_hours || "").slice(0, 60), addr: [t["addr:housenumber"], t["addr:street"], t["addr:city"]].filter(Boolean).join(" ").slice(0, 90) };
        }).filter(function (x) { return isFinite(x.lat) && isFinite(x.lon); }) };
        save(key, rec); show(rec, true);
      }).catch(function () { if (c) show(c, false); else out.innerHTML = '<p class="d">Lookup failed (offline or the public server is busy). Try again later, or ' + osmLink + ".</p>"; });
  }
  function paintScenarios() { var r = $("v22-scn-root"); if (r) { var open = [].map.call(r.querySelectorAll("details[open]"), function (d) { return d.id || d.getAttribute("data-scn"); }); r.innerHTML = scenariosHtml(); open.forEach(function (k) { var d = $(k) || r.querySelector('[data-scn="' + k + '"]'); if (d) d.open = true; }); } }
  (function mountEvac() { var ev = $("evac-root"); if (ev && !$("v22-scn-root")) ev.insertAdjacentHTML("beforebegin", '<div id="v22-scn-root"></div>'); })();
  document.addEventListener("input", function (e) {
    var t = e.target; if (!t.matches) return;
    if (t.matches("[data-sf]")) { var s = scn(), k = t.closest("[data-scn]").getAttribute("data-scn"), x = s.list[k] = s.list[k] || {}, f = t.getAttribute("data-sf"); x[f] = f === "steps" ? t.value.split("\n").map(function (l) { return l.slice(0, 200); }).slice(0, 30) : t.value.slice(0, 300); save(KS, s); }
    if (t.matches("[data-shf]")) { var s2 = scn(); s2.shelter[t.getAttribute("data-shf")] = t.value.slice(0, 300); save(KS, s2); }
  });
  document.addEventListener("change", function (e) { var t = e.target; if (t.matches && t.matches("select[data-sf]")) { var s = scn(), k = t.closest("[data-scn]").getAttribute("data-scn"); (s.list[k] = s.list[k] || {})[t.getAttribute("data-sf")] = t.value; save(KS, s); if (t.getAttribute("data-sf") === "decision") paintScenarios(); } });
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t.id === "ru-add") { var n = ($("ru-name").value || "").trim().slice(0, 80); if (!n) return; var s = scn(); s.reunion.push({ name: n, note: ($("ru-note").value || "").trim().slice(0, 120) }); save(KS, s); paintScenarios(); $("v22-reunion").open = true; }
    var rd = t.closest && t.closest("[data-rudel]"); if (rd) { var s2 = scn(); s2.reunion.splice(+rd.getAttribute("data-rudel"), 1); save(KS, s2); paintScenarios(); $("v22-reunion").open = true; }
    if (t.id === "svc-go") svcSearch();
  });

  // ================= comms: important numbers + offline pack =================
  var NUMBERS = [["Emergency (police, fire, EMS)", "911"], ["Suicide & Crisis Lifeline", "988"], ["Poison Control", "1-800-222-1222"], ["Ameren Illinois outages & gas leaks", "1-800-755-5000"],
    ["Ameren Missouri outages", "1-800-552-7583"], ["MoDOT road conditions (888-ASK-MODOT)", "1-888-275-6636"], ["FEMA helpline", "1-800-621-3362"], ["Community help (United Way)", "211"]];
  function commsHtml() {
    return '<section class="prep xp-sec" id="v22-numbers"><h2>Important phone numbers</h2><ul class="chk-list">' + NUMBERS.map(function (n) { return "<li>" + esc(n[0]) + ': <a href="tel:' + esc(n[1].replace(/[^\d]/g, "")) + '">' + esc(n[1]) + "</a></li>"; }).join("") +
      '</ul><p class="d">Public numbers for the St. Louis area. Family numbers are in Family operations.</p></section>' +
      '<section class="prep xp-sec" id="v22-offlinepack"><h2>Offline emergency pack</h2><p class="hint">One HTML file with contacts, contact methods, rally and reunification points, comms procedures, radio plan, scenarios, shelter and evacuation plans and these numbers. It opens in any browser without internet. Built on this device; save it to the phone and print a copy.</p>' +
      '<label class="chk"><input type="checkbox" id="v22-pack-med"> Include code words and medical details from the vault (only if unlocked; the file is <b>not encrypted</b>)</label>' +
      '<div class="row-btns"><button type="button" class="small-btn primary" id="v22-pack">Download offline pack</button></div></section>';
  }
  function paintComms() { var r = $("comms-root"); if (r && !$("v22-numbers")) r.insertAdjacentHTML("afterbegin", '<div id="v22-comms-root">' + commsHtml() + "</div>"); }
  function docShell(title, body) {
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + "</title>" +
      "<style>body{font:15px/1.45 system-ui,sans-serif;max-width:800px;margin:16px auto;padding:0 14px;color:#111}h1{font-size:1.4rem}h2{font-size:1.1rem;border-bottom:2px solid #333;margin-top:22px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:4px 6px;text-align:left;font-size:.9rem}.d{color:#555;font-size:.85rem}.warn{background:#fff3cd;padding:6px 8px;border:1px solid #e0b030}</style></head><body><h1>" + esc(title) + "</h1>" +
      '<p class="d">Generated ' + esc(V2.ct(new Date().toISOString())) + " on this device by Family Threat Picture. Private: do not post or share publicly.</p>" + body + "</body></html>";
  }
  function li(a) { return a.length ? "<ul>" + a.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>" : "<p class=\"d\">None saved.</p>"; }
  function packHtml(withMed) {
    var f = V2.family ? V2.family.state() : { people: [], proc: {} }, c = load("ftp-private-comms", {}), s = scn(), plans = evacPlans(), b = "";
    b += "<h2>Family contacts</h2>" + (f.people.length ? "<table><tr><th>Name</th><th>Role</th><th>Phone</th><th>Primary method</th><th>Secondary</th><th>Evacuation job</th></tr>" + f.people.map(function (p) { return "<tr><td>" + esc(p.name) + (p.coordinator ? " (coordinator)" : "") + "</td><td>" + esc(p.role) + "</td><td>" + esc(p.phone) + "</td><td>" + esc(p.comm1) + "</td><td>" + esc(p.comm2) + "</td><td>" + esc(p.assign) + "</td></tr>"; }).join("") + "</table>" : '<p class="d">None saved.</p>');
    b += "<h2>Out-of-area contact</h2><p>" + esc([c.oacName, c.oacPhone].filter(Boolean).join(" · ") || "Not set") + "</p>";
    b += "<h2>Rally points</h2>" + li([c.rally1, c.rally2, c.rally3].filter(Boolean).map(esc));
    b += "<h2>Reunification points</h2>" + li(s.reunion.map(function (r) { return "<b>" + esc(r.name) + "</b> " + esc(r.note || ""); }));
    b += "<h2>Communication procedures</h2>" + li([["If phones work", f.proc.phones], ["If calls fail", f.proc.nophones], ["If nothing works", f.proc.noradio], ["Check-in times", f.proc.times || c.checkin]].filter(function (x) { return x[1]; }).map(function (x) { return "<b>" + esc(x[0]) + ":</b> " + esc(x[1]); }));
    b += "<h2>Radio</h2>" + li([c.radioPrimary && "<b>Family primary:</b> " + esc(c.radioPrimary), c.radioBackup && "<b>Family backup:</b> " + esc(c.radioBackup), "<b>NOAA Weather Radio:</b> 162.550 MHz (KDO89, St. Louis)", "<b>GMRS/FRS channel 1:</b> 462.5625 MHz"].filter(Boolean));
    b += "<h2>Important numbers</h2>" + li(NUMBERS.map(function (n) { return esc(n[0]) + ": <b>" + esc(n[1]) + "</b>"; }));
    b += "<h2>Scenarios</h2>" + Object.keys(SCN).map(function (k) { var x = s.list[k] || {}; return "<h3>" + esc(SCN[k][0]) + " — " + esc({ shelter: "shelter in place", evacuate: "evacuate", depends: "depends on trigger" }[x.decision || SCN[k][1]]) + "</h3>" + (x.trigger ? "<p><b>Trigger:</b> " + esc(x.trigger) + "</p>" : "") + "<ol>" + (x.steps || SCN[k][2]).filter(Boolean).map(function (st) { return "<li>" + esc(st) + "</li>"; }).join("") + "</ol>" + [["Primary destination", x.dest1], ["Secondary destination", x.dest2], ["Alternate route (suggested, not verified)", x.alt], ["Reunite at", x.reunite]].filter(function (r) { return r[1]; }).map(function (r) { return "<p><b>" + esc(r[0]) + ":</b> " + esc(r[1]) + "</p>"; }).join(""); }).join("");
    b += "<h2>Shelter in place</h2>" + li(Object.keys(s.shelter).filter(function (k) { return s.shelter[k]; }).map(function (k) { return "<b>" + esc(k) + ":</b> " + esc(s.shelter[k]); }));
    b += "<h2>Evacuation plans</h2>" + (plans.length ? plans.map(function (p) { return "<h3>" + esc(p.name || "Plan") + "</h3>" + li([["Go when", p.trigger], ["Primary route (suggested)", p.primary], ["Secondary route (suggested)", p.secondary], ["Meet at", p.meet], ["Hospitals", p.hospitals], ["Fuel", p.fuel]].filter(function (r) { return r[1]; }).map(function (r) { return "<b>" + esc(r[0]) + ":</b> " + esc(r[1]); }).concat((p.dests || []).filter(function (d) { return d && d.name; }).map(function (d) { return "<b>Destination:</b> " + esc(d.name) + (d.addr ? " — " + esc(d.addr) : ""); }))); }).join("") : '<p class="d">None saved.</p>');
    if (withMed && window.FTPVault && FTPVault.snapshot) {
      var v = FTPVault.snapshot();
      if (v) b += '<h2>Code words and medical (from the vault)</h2><p class="warn">Sensitive. This file is not encrypted.</p>' + (v.codewords ? "<p><b>Code words:</b> " + esc(v.codewords) + "</p>" : "") + (v.people || []).map(function (p) { return "<h3>" + esc(p.name) + "</h3>" + li(Object.keys(p).filter(function (k) { return k !== "id" && k !== "name" && k.charAt(0) !== "_" && p[k]; }).map(function (k) { return "<b>" + esc(k) + ":</b> " + esc(p[k]); })); }).join("");
      else b += '<p class="d">Vault locked: medical details and code words were not included.</p>';
    }
    return docShell("Family emergency pack", b);
  }
  V22.packHtml = packHtml;
  function reportHtml() {
    var inv = V2.inventory ? V2.inventory() : { items: [] }, sc = V2.inventoryScore ? V2.inventoryScore() : { score: null, cats: {}, reorder: [], short: [], exp: [] }, s = cl(), sn = scn(), b = "";
    b += "<h2>Readiness</h2><p><b>" + (sc.score == null ? "No inventory yet" : sc.score + "% of targets met") + "</b> for " + esc(inv.household) + " people × " + esc(inv.days) + " days.</p>";
    b += Object.keys(sc.cats).length ? "<table><tr><th>Category</th><th>Met</th></tr>" + Object.keys(sc.cats).map(function (k) { return "<tr><td>" + esc(k) + "</td><td>" + Math.round(sc.cats[k].s / sc.cats[k].n * 100) + "%</td></tr>"; }).join("") + "</table>" : "";
    b += "<h2>Reorder / replace</h2>" + li((sc.reorder || []).map(function (x) { return esc(x.it.name) + " — " + esc(x.why); }));
    b += "<h2>Shortfalls</h2>" + li((sc.short || []).map(function (x) { return esc(x.it.name) + ": have " + esc(Math.round(x.have * 10) / 10) + " of " + esc(Math.round(x.need * 10) / 10) + " " + esc(x.it.unit || ""); }));
    b += "<h2>Inventory</h2>" + (inv.items.length ? "<table><tr><th>Item</th><th>Category</th><th>On hand</th><th>Unit</th><th>Expires</th><th>Reorder at</th></tr>" + inv.items.map(function (it) { return "<tr><td>" + esc(it.name) + "</td><td>" + esc(it.cat) + "</td><td>" + esc(it.qty == null ? "" : it.qty) + "</td><td>" + esc(it.unit) + "</td><td>" + esc(it.exp || "") + "</td><td>" + esc(it.reorder == null ? "" : it.reorder) + "</td></tr>"; }).join("") + "</table>" : '<p class="d">None saved.</p>');
    b += "<h2>Checklists</h2>" + Object.keys(LISTS).map(function (k) { var its = clItems(s, k); return "<h3>" + esc(LISTS[k][0]) + " (" + its.filter(function (_, i) { return s.done[k + ":" + i]; }).length + "/" + its.length + ")</h3><ul>" + its.map(function (it, i) { return "<li>" + (s.done[k + ":" + i] ? "☑" : "☐") + " " + esc(it) + "</li>"; }).join("") + "</ul>"; }).join("");
    b += "<h2>Scenarios planned</h2>" + li(Object.keys(SCN).map(function (k) { var x = sn.list[k] || {}; return esc(SCN[k][0]) + ": " + esc({ shelter: "shelter in place", evacuate: "evacuate", depends: "depends" }[x.decision || SCN[k][1]]) + (x.trigger ? " · trigger set" : " · no trigger set") + (x.reunite ? " · reunification point set" : ""); }));
    return docShell("Emergency preparedness report", b);
  }
  V22.reportHtml = reportHtml;

  // ================= panel hooks =================
  function wrap(name, fn) { var orig = V2.panels[name]; V2.panels[name] = function () { if (orig) orig(); setTimeout(fn, 0); }; }
  wrap("sources", paintNotif);
  wrap("prep", paintChecklists);
  wrap("evac", paintScenarios);
  wrap("comms", paintComms);
  document.addEventListener("ftp-roads", function () { if (V2.curTab() === "evac") { var w = $("v22-scn-root") && $("v22-scn-root").querySelector(".warn-box"); if (w) paintScenarios(); } });
})();
/* generic in-app links: <button data-go="tab"> */
document.addEventListener("click", function (e) { var g = e.target.closest && e.target.closest("[data-go]"); if (g && window.V2 && V2.go) V2.go(g.getAttribute("data-go")); });
