/* v2 Comms center: GMRS/FRS, amateur radio and NOAA Weather Radio reference tables, family check schedule (device only)
   and a printable wallet comms card. Reference only: verify frequencies and licensing before relying on them. */
(function () {
  "use strict";
  var V2 = window.V2, $ = V2.$, esc = V2.esc, load = V2.load, save = V2.save;
  var KS = "ftp-private-commsched";
  // 47 CFR 95 (2017 rules): GMRS/FRS share 22 channels. Max power: FRS 2 W (ch 1-7, 15-22) / 0.5 W (8-14);
  // GMRS 5 W (1-7), 0.5 W (8-14), 50 W (15-22). GMRS repeater inputs are the 15-22 outputs + 5 MHz.
  var GMRS = [[1, "462.5625", "5 W", "2 W"], [2, "462.5875", "5 W", "2 W"], [3, "462.6125", "5 W", "2 W"], [4, "462.6375", "5 W", "2 W"], [5, "462.6625", "5 W", "2 W"], [6, "462.6875", "5 W", "2 W"], [7, "462.7125", "5 W", "2 W"],
    [8, "467.5625", "0.5 W", "0.5 W"], [9, "467.5875", "0.5 W", "0.5 W"], [10, "467.6125", "0.5 W", "0.5 W"], [11, "467.6375", "0.5 W", "0.5 W"], [12, "467.6625", "0.5 W", "0.5 W"], [13, "467.6875", "0.5 W", "0.5 W"], [14, "467.7125", "0.5 W", "0.5 W"],
    [15, "462.5500", "50 W", "2 W"], [16, "462.5750", "50 W", "2 W"], [17, "462.6000", "50 W", "2 W"], [18, "462.6250", "50 W", "2 W"], [19, "462.6500", "50 W", "2 W"], [20, "462.6750", "50 W", "2 W"], [21, "462.7000", "50 W", "2 W"], [22, "462.7250", "50 W", "2 W"]];
  var HAM = [["146.520 MHz FM", "2 m national simplex calling frequency"], ["446.000 MHz FM", "70 cm national simplex calling frequency"], ["52.525 MHz FM", "6 m national simplex calling frequency"],
    ["147.120 + (PL 127.3)", "K9GXU Belleville repeater · St. Clair ARES net Tue 7 PM"], ["147.360 + (PL 141.3)", "St. Louis Metro Skywarn primary (severe weather nets)"], ["146.850 − (PL 141.3)", "W0SRC Olivette · STL Metro ARES net Wed 7:30 PM"],
    ["7.240 / 3.873 MHz LSB", "Common HF emergency/net frequencies (check current net schedules)"]];
  var NWR = ["162.400", "162.425", "162.450", "162.475", "162.500", "162.525", "162.550"];
  function sched() { var s = load(KS, null); return s && s.items ? s : { items: [] }; }
  function nextDue(it) {
    if (!it.day || !it.time) return null;
    var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], now = new Date(), tgt = it.day === "Daily" ? null : days.indexOf(it.day), hm = it.time.split(":");
    for (var i = 0; i < 8; i++) { var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, +hm[0], +hm[1]); if ((tgt == null || d.getDay() === tgt) && d > now) return d; }
    return null;
  }
  function commsHtml() {
    var c = load("ftp-private-comms", {}), s = sched();
    return '<section class="prep xp-sec" id="cm-intro"><h2>Comms center</h2><p class="hint"><b>Reference only.</b> Frequencies are from FCC Part 95 (GMRS/FRS), the ARRL band plan and NWS; local repeaters and nets are from RepeaterBook, St. Clair ARC and STL ARES and can change. Verify before you rely on them. ' +
      "GMRS needs an FCC license (one license covers the family; no exam). Transmitting on ham bands needs an amateur license, except to save a life in a genuine emergency. FRS radios need no license.</p>" +
      '<div class="row-btns"><button type="button" class="small-btn primary" id="cm-print">Print wallet comms card</button><button type="button" class="small-btn" data-tab-go="prep" data-anchor="prep-comms">Edit family radio channels</button></div></section>' +
      '<section class="prep xp-sec" id="cm-plan"><h2>Family radio plan</h2><dl class="kv"><dt>Primary</dt><dd>' + esc(c.radioPrimary || "not set") + "</dd><dt>Backup</dt><dd>" + esc(c.radioBackup || "not set") + "</dd><dt>Check-in schedule</dt><dd>" + esc(c.checkin || "not set") + "</dd><dt>Out-of-area contact</dt><dd>" + esc([c.oacName, c.oacPhone].filter(Boolean).join(", ") || "not set") + '</dd></dl><p class="d">Saved only on this device (same entries as Supplies &amp; prep → Rally &amp; comms).</p></section>' +
      '<section class="prep xp-sec" id="cm-sched"><h2>Radio check schedule</h2><p class="d">Planned radio checks and nets you want to join. Saved on this device; shown with the next time in Central.</p><table class="iv"><thead><tr><th>Day</th><th>Time (CT)</th><th>Channel / frequency</th><th>Who / net</th><th>Next</th><th></th></tr></thead><tbody>' +
      s.items.map(function (it, i) {
        var nd = nextDue(it);
        return '<tr data-cs="' + i + '"><td><select data-csf="day">' + ["Daily", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(function (d) { return "<option" + (d === it.day ? " selected" : "") + ">" + d + "</option>"; }).join("") + '</select></td><td><input type="time" data-csf="time" value="' + esc(it.time || "") + '"></td>' +
          '<td><input data-csf="chan" value="' + esc(it.chan || "") + '"></td><td><input data-csf="who" value="' + esc(it.who || "") + '"></td><td class="d">' + (nd ? esc(nd.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })) : "—") + '</td><td><button type="button" class="small-btn" data-csdel="' + i + '">✕</button></td></tr>';
      }).join("") + '</tbody></table><div class="row-btns"><button type="button" class="small-btn" id="cs-add">Add check</button></div><p class="d">Log completed radio tests in the Comms check below.</p></section>' +
      '<section class="prep xp-sec" id="cm-gmrs"><h2>GMRS / FRS channels</h2><div class="iv-wrap"><table class="iv"><thead><tr><th>Ch</th><th>MHz</th><th>GMRS max</th><th>FRS max</th></tr></thead><tbody>' +
      GMRS.map(function (g) { return "<tr><td>" + g[0] + "</td><td>" + g[1] + "</td><td>" + g[2] + "</td><td>" + g[3] + "</td></tr>"; }).join("") + '</tbody></table></div><p class="d">GMRS repeaters listen on 467.550–467.725 MHz (channel 15–22 frequency + 5 MHz) and transmit on channels 15–22. Privacy "codes" (CTCSS/DCS) only filter what you hear; they do not make a channel private. <a href="https://www.fcc.gov/wireless/bureau-divisions/mobility-division/general-mobile-radio-service-gmrs" target="_blank" rel="noopener">FCC GMRS ↗</a></p></section>' +
      '<section class="prep xp-sec" id="cm-ham"><h2>Amateur radio</h2><ul class="d">' + HAM.map(function (h) { return "<li><b>" + esc(h[0]) + "</b> — " + esc(h[1]) + "</li>"; }).join("") + '</ul><p class="d"><a href="https://www.arrl.org/band-plan" target="_blank" rel="noopener">ARRL band plan ↗</a> · <a href="https://www.repeaterbook.com/" target="_blank" rel="noopener">RepeaterBook ↗</a> · <a href="https://www.stlares.org/" target="_blank" rel="noopener">STL ARES ↗</a></p></section>' +
      '<section class="prep xp-sec" id="cm-nwr"><h2>NOAA Weather Radio</h2><p class="d">The seven NWR frequencies (MHz): ' + NWR.join(" · ") + '. St. Louis transmitter KDO89 is on <b>162.550</b>. Program SAME codes for your county from the Comms check below. <a href="https://www.weather.gov/nwr/" target="_blank" rel="noopener">NWS NWR ↗</a></p></section>';
  }
  function card() {
    var c = load("ftp-private-comms", {}), f = window.V2.family ? V2.family.state() : { people: [] }, s = sched();
    var row = function (l, v) { return v ? '<div class="gc-row"><div class="gc-l">' + esc(l) + '</div><div class="gc-v">' + esc(v).replace(/\n/g, "<br>") + "</div></div>" : ""; };
    return '<article class="gcard ccard"><header><div class="gc-title">FAMILY COMMS CARD</div><div class="gc-sub">Keep in wallet / go bag</div></header>' +
      row("Family", f.people.map(function (p) { return (p.name || "") + (p.phone ? " " + p.phone : "") + (p.coordinator ? " (coordinator)" : ""); }).join("\n")) +
      row("Out-of-area contact", [c.oacName, c.oacPhone].filter(Boolean).join(", ")) + row("Rally points", [c.rally1, c.rally2, c.rally3].filter(Boolean).map(function (r, i) { return (i + 1) + ". " + r; }).join("\n")) +
      row("Check-ins", c.checkin) + row("Radio primary", c.radioPrimary) + row("Radio backup", c.radioBackup) +
      row("Radio checks", s.items.map(function (it) { return it.day + " " + (it.time || "") + " " + (it.chan || "") + (it.who ? " (" + it.who + ")" : ""); }).join("\n")) +
      row("NOAA Weather Radio", "162.550 MHz (KDO89 St. Louis)") + row("Calling frequencies", "2 m 146.520 · 70 cm 446.000 · GMRS/FRS ch 1 462.5625") +
      '<footer>Emergency: 911. Text if calls fail. Printed ' + esc(new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" })) + ". Reference only; verify frequencies.</footer></article>";
  }
  function paint() { var r = $("comms-root"); if (r) r.innerHTML = commsHtml(); }
  V2.panels.comms = paint;
  document.addEventListener("click", function (e) {
    var t = e.target, s;
    if (t.id === "cm-print") V2.printHtml(card());
    if (t.id === "cs-add") { s = sched(); s.items.push({ day: "Daily", time: "19:00", chan: "", who: "" }); save(KS, s); paint(); }
    var d = t.closest && t.closest("[data-csdel]"); if (d) { s = sched(); s.items.splice(+d.getAttribute("data-csdel"), 1); save(KS, s); paint(); }
  });
  document.addEventListener("change", function (e) {
    var t = e.target; if (!t.matches || !t.matches("[data-csf]")) return;
    var s = sched(), i = +t.closest("[data-cs]").getAttribute("data-cs"); s.items[i][t.getAttribute("data-csf")] = t.value.slice(0, 80); save(KS, s); paint();
  });
  V2.commsCard = card;
})();
