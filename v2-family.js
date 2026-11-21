/* v2: Family safety (profiles, I'm Safe check-ins, coordinator, rally points, comms procedures, overdue reminders,
   optional location attach), Evacuation plans and Inventory. Device-only: localStorage ftp-private-family,
   ftp-private-evac, ftp-private-inventory (+ the existing ftp-private-comms rally plan, shared with Prep and Go cards). */
(function () {
  "use strict";
  var V2 = window.V2, $ = V2.$, esc = V2.esc, load = V2.load, save = V2.save;
  var KF = "ftp-private-family", KC = "ftp-private-comms", KEV = "ftp-private-evac", KI = "ftp-private-inventory";

  // ================= Family safety =================
  function fam() { var f = load(KF, {}); f.people = f.people || []; f.checkins = f.checkins || []; f.proc = f.proc || {}; if (f.intervalH == null) f.intervalH = 0; return f; }
  function lastCheck(f, pid) { for (var i = f.checkins.length - 1; i >= 0; i--) if (f.checkins[i].pid === pid) return f.checkins[i]; return null; }
  function overdue(f, p) {
    if (!f.intervalH) return false; var c = lastCheck(f, p.id), base = c ? Date.parse(c.at) : f.intervalSince ? Date.parse(f.intervalSince) : 0;
    return base && Date.now() - base > f.intervalH * 36e5;
  }
  function checkin(pid, status, note) {
    var f = fam(), rec = { pid: pid, status: status || "safe", at: new Date().toISOString() };
    if (note) rec.note = String(note).slice(0, 200);
    var finish = function () { f.checkins.push(rec); f.checkins = f.checkins.slice(-200); save(KF, f); if (V2.curTab() === "family") paint(); document.dispatchEvent(new CustomEvent("ftp-checkin")); famChanged(); };
    if (f.shareLoc && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function (p) { rec.loc = [Math.round(p.coords.latitude * 100) / 100, Math.round(p.coords.longitude * 100) / 100]; finish(); }, finish, { timeout: 8000, maximumAge: 60000 });
    } else finish();
  }
  // V2.2 accountability: GREEN accounted for · YELLOW awaiting check-in · RED assistance required.
  // During an accountability check (started below), only check-ins made after it started count as GREEN.
  function acct(f, p) {
    var c = lastCheck(f, p.id), round = f.round ? Date.parse(f.round) : 0;
    if (c && c.status === "help" && (!round || Date.parse(c.at) >= round - 6 * 36e5)) return { color: "RED", why: "needs help · " + V2.ago(c.at) };
    if (!c) return { color: "YELLOW", why: round ? "no check-in since the check started" : "no check-in yet" };
    var at = Date.parse(c.at), win = f.intervalH ? f.intervalH * 36e5 : 24 * 36e5;
    if (round && at < round) return { color: "YELLOW", why: "awaiting check-in (last " + V2.ago(c.at) + ")" };
    if (!round && Date.now() - at > win) return { color: "YELLOW", why: "last check-in " + V2.ago(c.at) };
    return { color: "GREEN", why: "safe · " + V2.ago(c.at) };
  }
  function accountability() {
    var f = fam(), n = { GREEN: 0, YELLOW: 0, RED: 0 };
    var people = f.people.map(function (p) { var a = acct(f, p); n[a.color]++; return { id: p.id, name: p.name, color: a.color, why: a.why }; });
    return { people: people, n: n, round: f.round || null, overdue: f.people.filter(function (p) { return overdue(f, p); }).map(function (p) { return p.name || "Unnamed"; }) };
  }
  window.V22 = window.V22 || {}; window.V22.accountability = accountability;
  function famChanged() { document.dispatchEvent(new CustomEvent("ftp-family")); }
  V2.family = { checkin: checkin, state: fam, accountability: accountability };
  var METHODS = ["", "Phone call", "Text message", "Messaging app", "Two-way radio", "Email", "In person / rally point"];
  function methodSel(p, key) { return '<select data-fpf="' + key + '">' + METHODS.map(function (m) { return '<option value="' + esc(m) + '"' + ((p[key] || "") === m ? " selected" : "") + ">" + (m || "— choose —") + "</option>"; }).join("") + "</select>"; }
  function placeSel(p) { var ls = V2.locations ? V2.locations() : []; return '<select data-fpf="placeId"><option value="">— none —</option>' + ls.map(function (l) { return '<option value="' + esc(l.id) + '"' + (p.placeId === l.id ? " selected" : "") + ">" + esc(l.name) + "</option>"; }).join("") + "</select>"; }
  var PROC = [["phones", "If phones work", "e.g. Call the coordinator first; if no answer, text. Keep calls short."],
    ["nophones", "If calls fail", "e.g. Text (texts often get through); then post 'safe' to the out-of-area contact; then radio on the family channel."],
    ["noradio", "If nothing works", "e.g. Go to rally point 2 at the top of each hour and wait 15 minutes; leave a note at home."],
    ["times", "Check-in times", "e.g. :00 every 2 hours during an event; 7 PM daily otherwise."]];
  var CF = [["rally1", "Rally point 1 (just outside the house)"], ["rally2", "Rally point 2 (neighborhood, if home is unsafe)"], ["rally3", "Rally point 3 (out of area)"], ["oacName", "Out-of-area contact: name"], ["oacPhone", "Out-of-area contact: phone"]];
  function familyHtml() {
    var f = fam(), c = load(KC, {}), coord = f.people.filter(function (p) { return p.coordinator; })[0];
    var od = f.people.filter(function (p) { return overdue(f, p); });
    var h = '<section class="prep xp-sec" id="fam-intro"><h2>Family safety</h2><p class="hint"><b>Private:</b> everything here is saved only in this browser on this device. It is never uploaded and does not sync to other phones. ' +
      "Check-ins are a local record: tapping \"I'm safe\" does not notify anyone, so also call, text or radio your coordinator.</p>" +
      '<div class="fam-status">' + (f.shareLoc ? '<span class="pill g-high">📍 Location sharing ON — check-ins save a ~1 km location on this device</span>' : '<span class="pill g-ok">Location sharing OFF</span>') +
      (coord ? ' <span class="pill">Coordinator: ' + esc(coord.name || "Unnamed") + "</span>" : ' <span class="pill g-elev">No coordinator set</span>') +
      (od.length ? ' <span class="pill g-sev">Overdue: ' + od.map(function (p) { return esc(p.name || "Unnamed"); }).join(", ") + "</span>" : "") + "</div></section>";
    // accountability dashboard
    var A = accountability();
    h += '<section class="prep xp-sec" id="fam-acct"><h2>Accountability</h2>' +
      (f.people.length ? '<div class="acc-sum">' + ["GREEN", "YELLOW", "RED"].map(function (k) { return '<span class="acc-n gy-' + k.toLowerCase() + '"><b>' + A.n[k] + "</b> " + { GREEN: "accounted for", YELLOW: "awaiting check-in", RED: "assistance required" }[k] + "</span>"; }).join("") + "</div>" +
        '<ul class="acc-list">' + A.people.map(function (p) { return '<li data-acc="' + esc(p.id) + '"><i class="gy gy-' + p.color.toLowerCase() + '">' + p.color + "</i> <b>" + esc(p.name || "Unnamed") + '</b> <span class="d">' + esc(p.why) + "</span></li>"; }).join("") + "</ul>" : '<p class="d">Add family profiles below.</p>') +
      '<div class="row-btns">' + (f.round ? '<span class="d">Accountability check running since ' + esc(V2.ct(f.round)) + '.</span> <button type="button" class="small-btn" id="acc-end">End check</button>' : '<button type="button" class="small-btn primary" id="acc-start">Start accountability check</button>') + "</div>" +
      '<p class="d">GREEN accounted for · YELLOW awaiting check-in · RED assistance required. Starting a check sets everyone to YELLOW until they check in (manually here, by phone, text or radio relayed by you). Nothing is sent to anyone; there is no automatic tracking.</p></section>';
    // check-in
    h += '<section class="prep xp-sec" id="fam-checkin"><h2>I\'m Safe check-in</h2>' +
      (f.people.length ? '<div class="ci-grid">' + f.people.map(function (p) {
        var lc = lastCheck(f, p.id), o = overdue(f, p);
        return '<div class="ci-p' + (o ? " ci-over" : "") + '"><div><b>' + esc(p.name || "Unnamed") + "</b>" + (p.coordinator ? ' <span class="pill">coordinator</span>' : "") +
          '<div class="d">' + (lc ? (lc.status === "help" ? "NEEDS HELP" : "Safe") + " · " + esc(V2.ct(lc.at)) + " (" + esc(V2.ago(lc.at)) + ")" + (lc.loc ? " · 📍 " + lc.loc.join(", ") : "") : "No check-in yet") + (o ? " · <b>overdue</b>" : "") + "</div></div>" +
          '<div class="row-btns"><button type="button" class="small-btn primary" data-ci="' + esc(p.id) + '">I\'m safe</button><button type="button" class="small-btn danger" data-cihelp="' + esc(p.id) + '">Need help</button></div></div>';
      }).join("") + "</div>" : '<p class="d">Add family profiles below to record check-ins.</p>') +
      '<div class="ci-opts"><label>Expect a check-in every<select id="ci-int">' + [[0, "off"], [1, "1 hour"], [2, "2 hours"], [4, "4 hours"], [8, "8 hours"], [12, "12 hours"], [24, "24 hours"]].map(function (o) { return '<option value="' + o[0] + '"' + (+f.intervalH === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" +
      '<label class="chk"><input type="checkbox" id="ci-remind"' + (f.remind ? " checked" : "") + "> Remind me on this device when someone is overdue (only while the app is open)</label>" +
      '<label class="chk"><input type="checkbox" id="ci-share"' + (f.shareLoc ? " checked" : "") + "> Attach my approximate location to check-ins made on this device (off by default; stays on this device)</label></div>" +
      (f.checkins.length ? '<details><summary>Check-in log (' + f.checkins.length + ')</summary><ul class="ci-log">' + f.checkins.slice(-30).reverse().map(function (x) { var p = f.people.filter(function (q) { return q.id === x.pid; })[0]; return "<li>" + esc(V2.ct(x.at)) + " — " + esc(p ? p.name || "Unnamed" : x.pid === "me" ? "Me" : "Removed person") + ": " + esc(x.status === "help" ? "NEEDS HELP" : "safe") + (x.loc ? " · 📍 " + x.loc.join(", ") : "") + "</li>"; }).join("") + '</ul><button type="button" class="small-btn" id="ci-clear">Clear log</button></details>' : "") + "</section>";
    // profiles
    h += '<section class="prep xp-sec" id="fam-people"><h2>Family profiles</h2><p class="d">Names and phone numbers for check-ins and Emergency Mode contacts. Medical details go in the encrypted medical vault below.</p>' +
      f.people.map(function (p) {
        return '<div class="fp" data-fp="' + esc(p.id) + '"><label>Name<input data-fpf="name" value="' + esc(p.name || "") + '" autocomplete="off"></label><label>Role<input data-fpf="role" value="' + esc(p.role || "") + '" placeholder="e.g. primary contact" autocomplete="off"></label>' +
          '<label>Phone<input data-fpf="phone" type="tel" value="' + esc(p.phone || "") + '" autocomplete="off"></label>' +
          "<label>Primary contact method" + methodSel(p, "comm1") + '</label><label>Secondary contact method' + methodSel(p, "comm2") + "</label>" +
          '<label>Usual place (from Monitoring locations)' + placeSel(p) + '</label><label>Evacuation assignment<input data-fpf="assign" value="' + esc(p.assign || "") + '" placeholder="e.g. grabs go-bags and pet carrier" autocomplete="off"></label>' +
          '<label class="chk"><input type="radio" name="fp-coord" data-fpcoord="' + esc(p.id) + '"' + (p.coordinator ? " checked" : "") + "> Family coordinator</label>" +
          '<button type="button" class="small-btn" data-fpdel="' + esc(p.id) + '">Remove</button></div>';
      }).join("") + '<div class="row-btns"><button type="button" class="small-btn primary" id="fp-add">Add person</button></div></section>';
    // rally points + procedures
    h += '<section class="prep xp-sec" id="fam-rally"><h2>Rally points &amp; comms procedures</h2><p class="d">Rally points and the out-of-area contact are the same ones shown in Supplies &amp; prep → Rally &amp; comms and on the Go cards.</p><form class="comms" autocomplete="off">' +
      CF.map(function (x) { return "<label>" + esc(x[1]) + '<input data-fcf="' + x[0] + '" value="' + esc(c[x[0]] || "") + '"></label>'; }).join("") +
      PROC.map(function (x) { return "<label>" + esc(x[1]) + '<textarea rows="2" data-fproc="' + x[0] + '" placeholder="' + esc(x[2]) + '">' + esc(f.proc[x[0]] || "") + "</textarea></label>"; }).join("") + "</form></section>";
    return h;
  }
  function paint() { var r = $("family-root"); if (r) r.innerHTML = familyHtml(); }
  V2.panels.family = paint;
  document.addEventListener("click", function (e) {
    var t = e.target, ci = t.closest && t.closest("[data-ci]"), ch = t.closest && t.closest("[data-cihelp]");
    if (ci) { checkin(ci.getAttribute("data-ci"), "safe"); if (window.ftpToast) ftpToast("Check-in saved on this device. Nobody was notified."); }
    if (ch) { checkin(ch.getAttribute("data-cihelp"), "help"); if (window.ftpToast) ftpToast("Saved as NEEDS HELP on this device. Call 911 or your coordinator now.", true); }
    if (t.id === "fp-add") { var f = fam(); f.people.push({ id: "f" + V2.uid(), name: "" }); save(KF, f); paint(); var ins = document.querySelectorAll('#fam-people [data-fpf="name"]'); if (ins.length) ins[ins.length - 1].focus(); }
    var d = t.closest && t.closest("[data-fpdel]");
    if (d && confirm("Remove this person from family profiles on this device?")) { var f2 = fam(), id = d.getAttribute("data-fpdel"); f2.people = f2.people.filter(function (p) { return p.id !== id; }); save(KF, f2); paint(); }
    if (t.id === "ci-clear" && confirm("Clear the check-in log on this device?")) { var f3 = fam(); f3.checkins = []; save(KF, f3); paint(); famChanged(); }
    if (t.id === "acc-start") { var f4 = fam(); f4.round = new Date().toISOString(); save(KF, f4); paint(); famChanged(); if (window.ftpToast) ftpToast("Accountability check started on this device. Contact each person and record their check-in."); }
    if (t.id === "acc-end") { var f5 = fam(); delete f5.round; save(KF, f5); paint(); famChanged(); }
  });
  document.addEventListener("input", function (e) {
    var t = e.target; if (!t.matches) return;
    if (t.matches("[data-fpf]")) { var f = fam(), id = t.closest("[data-fp]").getAttribute("data-fp"), p = f.people.filter(function (x) { return x.id === id; })[0]; if (p) { p[t.getAttribute("data-fpf")] = t.value.slice(0, 120); save(KF, f); famChanged(); } }
    if (t.matches("[data-fcf]")) { var c = load(KC, {}); c[t.getAttribute("data-fcf")] = t.value.slice(0, 300); save(KC, c); }
    if (t.matches("[data-fproc]")) { var f2 = fam(); f2.proc[t.getAttribute("data-fproc")] = t.value.slice(0, 600); save(KF, f2); }
  });
  document.addEventListener("change", function (e) {
    var t = e.target, f = fam();
    if (t.matches && t.matches("select[data-fpf]")) { var pp = f.people.filter(function (x) { return x.id === t.closest("[data-fp]").getAttribute("data-fp"); })[0]; if (pp) { pp[t.getAttribute("data-fpf")] = t.value.slice(0, 80); save(KF, f); famChanged(); } return; }
    if (t.matches && t.matches("[data-fpcoord]")) { f.people.forEach(function (p) { p.coordinator = p.id === t.getAttribute("data-fpcoord"); }); save(KF, f); paint(); }
    if (t.id === "ci-int") { f.intervalH = +t.value; f.intervalSince = new Date().toISOString(); save(KF, f); paint(); }
    if (t.id === "ci-remind") {
      f.remind = t.checked; save(KF, f);
      if (t.checked && "Notification" in window && Notification.permission === "default") Notification.requestPermission();
    }
    if (t.id === "ci-share") {
      if (t.checked && !confirm("Attach your approximate location (about 1 km) to check-ins you make on this device? It is stored only on this device and never sent anywhere. Your browser will ask for permission.")) { t.checked = false; return; }
      f.shareLoc = t.checked; save(KF, f); paint(); V2.strip();
    }
  });
  // overdue reminders: local only, while the app is open
  function remindLoop() {
    var f = fam(); if (!f.remind || !f.intervalH) return;
    var od = f.people.filter(function (p) { return overdue(f, p); }); if (!od.length) return;
    var key = od.map(function (p) { var c = lastCheck(f, p.id); return p.id + (c ? c.at : ""); }).join("|");
    if (f.lastReminded === key) return; f.lastReminded = key; save(KF, f);
    var msg = "Check-in overdue: " + od.map(function (p) { return p.name || "Unnamed"; }).join(", ");
    if (window.ftpToast) ftpToast(msg, true);
    if ("Notification" in window && Notification.permission === "granted" && navigator.serviceWorker) navigator.serviceWorker.ready.then(function (reg) { reg.showNotification("Family check-in overdue", { body: msg, tag: "ftp-checkin", icon: "icons/icon-192.png", data: { url: "./#family" } }); }).catch(function () {});
  }
  setInterval(remindLoop, 60000); setTimeout(remindLoop, 4000);

  // ================= Evacuation plans =================
  function ev() { var s = load(KEV, {}); s.plans = s.plans || []; return s; }
  var PF = [["name", "Plan name", "input", "e.g. Flood – go north"], ["trigger", "Go when (trigger)", "text", "e.g. Evacuation order for our area, or river forecast above major flood"],
    ["primary", "Primary route", "text", "e.g. I-64 E to I-57 N"], ["secondary", "Secondary route (if primary is blocked)", "text", "e.g. IL-161 E to IL-127 N"],
    ["meet", "Where the family meets if separated", "text", ""], ["hospitals", "Hospitals on the way / at the destination", "text", ""],
    ["fuel", "Fuel plan (stops, how full to keep the tank)", "text", "e.g. Keep tanks above half; fuel stop at …"], ["notes", "Notes (pets, meds, documents)", "text", ""]];
  var GO = ["Water, food and meds for 3 days", "Phone chargers / power bank", "Documents & cash", "Pets, leashes, carriers", "Glasses, hearing aids, medical devices", "Go cards (Family safety)", "Fill the tank", "Tell the out-of-area contact where you are going"];
  function planHtml(p, isPrimary) {
    var dests = p.dests && p.dests.length ? p.dests : [{ name: "", addr: "" }];
    return '<section class="prep xp-sec ev-plan" id="ev-' + esc(p.id) + '"><h2>' + esc(p.name || "Untitled plan") + (isPrimary ? " · PRIMARY" : "") + "</h2>" +
      '<form class="comms" data-evp="' + esc(p.id) + '" autocomplete="off">' + PF.map(function (f) {
        var v = p[f[0]] || "", a = 'data-evf="' + f[0] + '" placeholder="' + esc(f[3]) + '"';
        return "<label>" + esc(f[1]) + (f[2] === "text" ? "<textarea rows=\"2\" " + a + ">" + esc(v) + "</textarea>" : "<input " + a + ' value="' + esc(v) + '">') + "</label>";
      }).join("") +
      '<fieldset class="ev-dests"><legend>Destinations</legend>' + dests.map(function (d, i) {
        return '<div class="ev-d"><label>Destination ' + (i + 1) + '<input data-evd="' + i + '" data-k="name" value="' + esc(d.name || "") + '" placeholder="e.g. relative in Springfield"></label><label>City / address (kept on this device)<input data-evd="' + i + '" data-k="addr" value="' + esc(d.addr || "") + '"></label></div>';
      }).join("") + '<button type="button" class="small-btn" data-evdadd="' + esc(p.id) + '">Add destination</button></fieldset>' +
      '<fieldset><legend>Before you leave</legend>' + GO.map(function (g, i) { return '<label class="chk"><input type="checkbox" data-evchk="' + i + '"' + (p.chk && p.chk[i] ? " checked" : "") + "> " + esc(g) + "</label>"; }).join("") + '<button type="button" class="small-btn" data-evreset="' + esc(p.id) + '">Clear checklist</button></fieldset></form>' +
      '<div class="ev-na"><b>Live routing &amp; traffic: unavailable.</b> This app has no routing or traffic service, so it cannot pick a route or show delays. Check official road conditions before you go: <a href="https://www.gettingaroundillinois.com/" target="_blank" rel="noopener">IDOT Getting Around Illinois ↗</a> · <a href="https://traveler.modot.org/map/" target="_blank" rel="noopener">MoDOT Traveler map ↗</a></div>' +
      '<div class="row-btns">' + (isPrimary ? "" : '<button type="button" class="small-btn" data-evprim="' + esc(p.id) + '">Make primary</button>') + '<button type="button" class="small-btn" data-evhosp="' + esc(p.id) + '">Hospitals near home area</button><button type="button" class="small-btn" data-evdel="' + esc(p.id) + '">Delete plan</button></div><div id="evh-' + esc(p.id) + '"></div></section>';
  }
  function fuelRef() {
    var f = window.ftpLive && window.ftpLive.feeds && window.ftpLive.feeds.data, fu = f && f.fuel;
    if (!fu || !fu.items || !fu.items.length) return '<p class="d">Fuel prices: not available in the last snapshot.</p>';
    return '<p class="d">Fuel prices (AAA, checked ' + esc(V2.ct(fu.checkedAt)) + "): " + fu.items.slice(0, 4).map(function (x) { var r = x.current && x.current.regular; return esc((x.area || "") + (r != null ? " $" + (+r).toFixed(2) : "")); }).join(" · ") + ' <a href="https://gasprices.aaa.com/" target="_blank" rel="noopener">AAA ↗</a></p>';
  }
  function evacHtml() {
    var s = ev();
    return '<section class="prep xp-sec" id="ev-intro"><h2>Evacuation plans</h2><p class="hint"><b>Private:</b> saved only on this device. Make one plan per kind of event (flood, fire, chemical release, civil emergency). The primary plan shows first in Emergency Mode. ' +
      'Public reference: the Map\'s "Routes out" layer shows the main highways out of the metro (Census road data; <b>not official evacuation routes</b>). Follow official evacuation orders and routes.</p>' + fuelRef() +
      '<div class="row-btns"><button type="button" class="small-btn primary" id="ev-add">New plan</button><button type="button" class="small-btn" data-tab-go="map">Open map</button></div></section>' +
      (s.plans.length ? s.plans.slice().sort(function (a, b) { return (b.id === s.primary) - (a.id === s.primary); }).map(function (p) { return planHtml(p, p.id === s.primary || (!s.primary && p === s.plans[0])); }).join("") : '<p class="d">No plans yet.</p>');
  }
  function paintEvac() { var r = $("evac-root"); if (r) r.innerHTML = evacHtml(); }
  V2.panels.evac = paintEvac;
  function plan(s, id) { return s.plans.filter(function (p) { return p.id === id; })[0]; }
  function km(a, b, c, d) { var r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2); return 12742 * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y)); }
  document.addEventListener("click", function (e) {
    var t = e.target, s, p, a;
    if (t.id === "ev-add") { s = ev(); p = { id: "e" + V2.uid(), name: "", dests: [{ name: "", addr: "" }] }; s.plans.push(p); if (!s.primary) s.primary = p.id; save(KEV, s); paintEvac(); var el = $("ev-" + p.id); if (el) { el.scrollIntoView({ block: "start" }); var i = el.querySelector("input"); if (i) i.focus(); } }
    if ((a = t.closest && t.closest("[data-evdel]")) && confirm("Delete this evacuation plan from this device?")) { s = ev(); s.plans = s.plans.filter(function (x) { return x.id !== a.getAttribute("data-evdel"); }); if (s.primary === a.getAttribute("data-evdel")) s.primary = s.plans[0] && s.plans[0].id; save(KEV, s); paintEvac(); }
    if ((a = t.closest && t.closest("[data-evprim]"))) { s = ev(); s.primary = a.getAttribute("data-evprim"); save(KEV, s); paintEvac(); }
    if ((a = t.closest && t.closest("[data-evdadd]"))) { s = ev(); p = plan(s, a.getAttribute("data-evdadd")); p.dests = (p.dests || []).concat([{ name: "", addr: "" }]); save(KEV, s); paintEvac(); }
    if ((a = t.closest && t.closest("[data-evreset]"))) { s = ev(); p = plan(s, a.getAttribute("data-evreset")); p.chk = {}; save(KEV, s); paintEvac(); }
    if ((a = t.closest && t.closest("[data-evhosp]"))) {
      var id = a.getAttribute("data-evhosp"), box = $("evh-" + id); box.innerHTML = '<p class="d">Loading hospital list…</p>';
      fetch("hospitals-us.json").then(function (r) { return r.json(); }).then(function (H) {
        var F = H.fields || [], ix = function (k) { return F.indexOf(k); }, rows = H.rows || [];
        var c = [38.63, -90.2], near = rows.map(function (r) { var la = +r[ix("lat")], lo = +r[ix("lng")]; return { h: { name: r[ix("name")], city: r[ix("city")], state: r[ix("state")], phone: r[ix("phone")], type: r[ix("type")] }, d: isFinite(la) && isFinite(lo) ? km(c[0], c[1], la, lo) : 9e9 }; })
          .filter(function (x) { return !x.h.type || /general|acute|critical|children/i.test(x.h.type); }).sort(function (x, y) { return x.d - y.d; }).slice(0, 6);
        box.innerHTML = near.length ? '<ul class="d">' + near.map(function (x) { var h = x.h; return "<li><b>" + esc(h.name || "") + "</b> · " + esc([h.city, h.state].filter(Boolean).join(", ")) + (h.phone ? " · " + esc(h.phone) : "") + " · " + Math.round(x.d) + " km from the metro center</li>"; }).join("") + '</ul><p class="d">From the HIFLD hospital list in this app (not live ER status).</p>' : '<p class="d">Hospital list unavailable.</p>';
      }).catch(function () { box.innerHTML = '<p class="d">Hospital list unavailable offline (open the Map or Supplies & prep once online to cache it).</p>'; });
    }
  });
  document.addEventListener("input", function (e) {
    var t = e.target, form = t.closest && t.closest("[data-evp]"); if (!form) return;
    var s = ev(), p = plan(s, form.getAttribute("data-evp")); if (!p) return;
    if (t.matches("[data-evf]")) { p[t.getAttribute("data-evf")] = t.value.slice(0, 800); if (t.getAttribute("data-evf") === "name") { var h = form.parentNode.querySelector("h2"); if (h) h.textContent = (t.value || "Untitled plan") + (s.primary === p.id ? " · PRIMARY" : ""); } }
    if (t.matches("[data-evd]")) { var i = +t.getAttribute("data-evd"); p.dests = p.dests || []; p.dests[i] = p.dests[i] || {}; p.dests[i][t.getAttribute("data-k")] = t.value.slice(0, 200); }
    save(KEV, s);
  });
  document.addEventListener("change", function (e) {
    var t = e.target, form = t.closest && t.closest("[data-evp]"); if (!form || !t.matches("[data-evchk]")) return;
    var s = ev(), p = plan(s, form.getAttribute("data-evp")); p.chk = p.chk || {}; p.chk[t.getAttribute("data-evchk")] = t.checked; save(KEV, s);
  });

  // ================= Inventory =================
  // V2.2 categories follow the spec (food, water, medical/first aid, prescriptions, batteries, flashlights, radios, fuel,
  // backup power, communications equipment, important documents); older items keep their saved category.
  var CATS = ["Water", "Food", "Medical & first aid", "Prescriptions", "Batteries", "Flashlights & lighting", "Emergency radios", "Communications equipment", "Fuel", "Backup power", "Important documents", "Hygiene", "Tools & safety", "Pets", "Other"];
  V2.INV_CATS = CATS;
  // Starter targets are per person for the supply target (days) where marked perPersonDay; sources: Ready.gov kit/water/food.
  var STARTER = [
    ["Drinking water", "Water", "gal", 1, "ppd"], ["Shelf-stable food", "Food", "person-days", 1, "ppd"], ["Prescription meds (shortest supply)", "Prescriptions", "days", 14, "fixed"],
    ["First aid kit", "Medical & first aid", "kit", 1, "fixed"], ["Flashlights", "Flashlights & lighting", "each", 1, "pp"], ["Batteries (AA)", "Batteries", "each", 24, "fixed"],
    ["NOAA weather radio", "Emergency radios", "each", 1, "fixed"], ["Power bank", "Backup power", "each", 1, "pp"], ["Stored fuel", "Fuel", "gal", 10, "fixed"],
    ["Two-way radios (FRS/GMRS)", "Communications equipment", "each", 2, "fixed"], ["Car phone chargers", "Communications equipment", "each", 1, "fixed"],
    ["N95 masks", "Medical & first aid", "each", 5, "pp"], ["Trash bags & wipes", "Hygiene", "pack", 1, "fixed"], ["Fire extinguisher", "Tools & safety", "each", 1, "fixed"],
    ["Copies of IDs & insurance", "Important documents", "set", 1, "fixed"], ["Cash (small bills)", "Important documents", "$", 200, "fixed"]];
  function inv() {
    var s = load(KI, null), r = load("ftp-private-readiness", {});
    if (!s) s = { items: [] };
    s.household = s.household || r.people || 4; s.days = s.days || r.target || 14; return s;
  }
  function need(s, it) { var t = +it.target || 0; return it.basis === "ppd" ? t * s.household * s.days : it.basis === "pp" ? t * s.household : t; }
  function scoreInv(s) {
    var now = Date.now(), cats = {}, tot = 0, n = 0, exp = [], soon = [], short = [], reorder = [];
    s.items.forEach(function (it) {
      var nd = need(s, it); if (!(nd > 0)) return;
      var e = it.exp ? Date.parse(it.exp) : null, expired = e && e < now, q = expired ? 0 : +it.qty || 0, cov = Math.min(1, q / nd);
      if (expired) exp.push(it); else if (e && e - now < 60 * 864e5) soon.push(it);
      if (cov < 1) short.push({ it: it, have: q, need: nd });
      if (it.reorder != null && it.reorder !== "" && (+it.qty || 0) <= +it.reorder) reorder.push({ it: it, why: "at or below reorder level (" + it.reorder + ")" });
      else if (e && !expired && e - now < 30 * 864e5) reorder.push({ it: it, why: "expires " + it.exp });
      else if (expired) reorder.push({ it: it, why: "expired " + it.exp });
      var c = cats[it.cat || "Other"] = cats[it.cat || "Other"] || { s: 0, n: 0 }; c.s += cov; c.n++; tot += cov; n++;
    });
    return { score: n ? Math.round(tot / n * 100) : null, cats: cats, exp: exp, soon: soon, short: short, n: n, reorder: reorder };
  }
  V2.inventoryScore = function () { return scoreInv(inv()); };
  V2.inventory = function () { return inv(); };
  V2.inventoryNeed = function (it) { return need(inv(), it); };
  function fmt(x) { return Math.round(x * 10) / 10; }
  function invHtml() {
    var s = inv(), sc = scoreInv(s), cl = sc.score == null ? "" : sc.score >= 80 ? "ok" : sc.score >= 50 ? "elev" : "sev";
    var catOpts = function (it) { var cs = CATS.indexOf(it.cat) < 0 && it.cat ? CATS.concat([it.cat]) : CATS; return cs.map(function (c) { return "<option" + (c === it.cat ? " selected" : "") + ">" + esc(c) + "</option>"; }).join(""); };
    var rows = s.items.map(function (it) {
      var nd = need(s, it), e = it.exp ? Math.round((Date.parse(it.exp) - Date.now()) / 864e5) : null;
      var flag = e == null ? "" : e < 0 ? '<span class="pill g-sev">EXPIRED</span>' : e <= 60 ? '<span class="pill g-high">' + e + " d left</span>" : "";
      return '<tr data-iv="' + esc(it.id) + '"><td><input data-ivf="name" value="' + esc(it.name || "") + '" aria-label="Item"></td><td><select data-ivf="cat" aria-label="Category">' + catOpts(it) + "</select></td>" +
        '<td><input data-ivf="qty" type="number" min="0" step="any" inputmode="decimal" value="' + esc(it.qty == null ? "" : it.qty) + '" aria-label="On hand"></td><td><input data-ivf="unit" value="' + esc(it.unit || "") + '" aria-label="Unit" class="iv-unit"></td>' +
        '<td><input data-ivf="target" type="number" min="0" step="any" inputmode="decimal" value="' + esc(it.target == null ? "" : it.target) + '" aria-label="Target"><select data-ivf="basis" aria-label="Target basis"><option value="fixed"' + (it.basis === "fixed" || !it.basis ? " selected" : "") + ">total</option><option value=\"pp\"" + (it.basis === "pp" ? " selected" : "") + ">per person</option><option value=\"ppd\"" + (it.basis === "ppd" ? " selected" : "") + ">per person per day</option></select><div class=\"d\">need " + fmt(nd) + "</div></td>" +
        '<td><input data-ivf="exp" type="date" value="' + esc(it.exp || "") + '" aria-label="Expiration">' + flag + '</td><td><input data-ivf="reorder" type="number" min="0" step="any" inputmode="decimal" value="' + esc(it.reorder == null ? "" : it.reorder) + '" aria-label="Reorder at" placeholder="—"></td><td><button type="button" class="small-btn" data-ivdel="' + esc(it.id) + '" aria-label="Remove item">✕</button></td></tr>';
    }).join("");
    return '<section class="prep xp-sec" id="v2-inv"><h2>Inventory &amp; readiness score</h2>' +
      '<div class="sup-top"><label>People in household<input type="number" min="1" max="20" id="iv-hh" value="' + s.household + '"></label><label>Days to cover<input type="number" min="1" max="365" id="iv-days" value="' + s.days + '"></label>' +
      '<div class="sup-score g-' + cl + '"><span class="big">' + (sc.score == null ? "—" : sc.score + "%") + "</span> of targets met<br><span class=\"d\">" + sc.n + " tracked items · expired items count as zero</span></div></div>" +
      (sc.n ? '<div class="iv-cats">' + Object.keys(sc.cats).map(function (c) { var p = Math.round(sc.cats[c].s / sc.cats[c].n * 100); return '<div class="iv-c"><span>' + esc(c) + '</span><span class="bar"><i style="width:' + p + '%"></i></span><span class="n">' + p + "%</span></div>"; }).join("") + "</div>" : "") +
      (sc.exp.length || sc.soon.length ? '<p class="d">' + (sc.exp.length ? "<b>Expired:</b> " + sc.exp.map(function (x) { return esc(x.name); }).join(", ") + ". " : "") + (sc.soon.length ? "<b>Expiring within 60 days:</b> " + sc.soon.map(function (x) { return esc(x.name) + " (" + esc(x.exp) + ")"; }).join(", ") + "." : "") + "</p>" : "") +
      (sc.reorder.length ? '<div class="warn-box" id="iv-reorder"><b>Reorder reminders (' + sc.reorder.length + "):</b> " + sc.reorder.map(function (x) { return esc(x.it.name || "Unnamed") + " — " + esc(x.why); }).join("; ") + "</div>" : "") +
      (sc.short.length ? '<details><summary>Shortfalls (' + sc.short.length + ')</summary><ul class="d">' + sc.short.map(function (x) { return "<li>" + esc(x.it.name) + ": have " + fmt(x.have) + " of " + fmt(x.need) + " " + esc(x.it.unit || "") + "</li>"; }).join("") + "</ul></details>" : "") +
      '<div class="iv-wrap"><table class="iv"><thead><tr><th>Item</th><th>Category</th><th>On hand</th><th>Unit</th><th>Target</th><th>Expires</th><th>Reorder at</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<div class="row-btns"><button type="button" class="small-btn primary" id="iv-add">Add item</button>' + (s.items.length ? "" : '<button type="button" class="small-btn" id="iv-starter">Add Ready.gov starter list</button>') + '<button type="button" class="small-btn" id="iv-csv">Export CSV</button></div>' +
      '<p class="d">Saved only on this device. Score = average of each item\'s on-hand ÷ target (capped at 100%). Starter targets follow Ready.gov: 1 gallon of water per person per day, food for the days you choose. The older day-count Supply tracker further down still works.</p></section>';
  }
  function paintInv(keepFocus) {
    var r = $("inv-root"); if (!r) return;
    var a = document.activeElement, key = a && a.closest && a.closest("[data-iv]") ? [a.closest("[data-iv]").getAttribute("data-iv"), a.getAttribute("data-ivf")] : a && a.id ? [a.id] : null;
    r.innerHTML = invHtml();
    if (keepFocus && key) { var el = key.length === 2 ? r.querySelector('[data-iv="' + key[0] + '"] [data-ivf="' + key[1] + '"]') : $(key[0]); if (el) el.focus(); }
  }
  V2.panels.prep = function () { paintInv(); };
  document.addEventListener("click", function (e) {
    var t = e.target, s;
    if (t.id === "iv-add") { s = inv(); s.items.push({ id: "i" + V2.uid(), name: "", cat: "Other", qty: null, target: 1, basis: "fixed" }); save(KI, s); paintInv(); var ins = document.querySelectorAll('#v2-inv [data-ivf="name"]'); if (ins.length) ins[ins.length - 1].focus(); }
    if (t.id === "iv-starter") { s = inv(); STARTER.forEach(function (x) { s.items.push({ id: "i" + V2.uid(), name: x[0], cat: x[1], unit: x[2], target: x[3], basis: x[4], qty: null }); }); save(KI, s); paintInv(); }
    var d = t.closest && t.closest("[data-ivdel]"); if (d) { s = inv(); s.items = s.items.filter(function (x) { return x.id !== d.getAttribute("data-ivdel"); }); save(KI, s); paintInv(); }
    if (t.id === "iv-csv") {
      s = inv(); var q = function (v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      var lines = [["item", "category", "on_hand", "unit", "target", "target_basis", "needed", "expires", "reorder_at"].join(",")].concat(s.items.map(function (it) { return [it.name, it.cat, it.qty, it.unit, it.target, it.basis || "fixed", need(s, it), it.exp, it.reorder].map(q).join(","); }));
      V2.download("threat-picture-inventory-" + new Date().toISOString().slice(0, 10) + ".csv", lines.join("\n"), "text/csv");
    }
  });
  document.addEventListener("change", function (e) {
    var t = e.target, s;
    if (t.id === "iv-hh" || t.id === "iv-days") { s = inv(); if (t.id === "iv-hh") s.household = Math.max(1, Math.min(20, +t.value || 1)); else s.days = Math.max(1, Math.min(365, +t.value || 14)); save(KI, s); paintInv(true); return; }
    if (t.matches && t.matches("[data-ivf]")) {
      s = inv(); var it = s.items.filter(function (x) { return x.id === t.closest("[data-iv]").getAttribute("data-iv"); })[0]; if (!it) return;
      var f = t.getAttribute("data-ivf"); it[f] = (f === "qty" || f === "target" || f === "reorder") ? (t.value === "" ? null : Math.max(0, +t.value)) : t.value.slice(0, 120);
      save(KI, s); paintInv(true);
    }
  });
})();
