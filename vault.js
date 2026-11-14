/* Medical info vault + grab-and-go cards. Everything stays in this browser's localStorage; nothing is uploaded.
   Optional PIN lock: the vault is encrypted with AES-GCM (256-bit) using a key derived from the PIN with PBKDF2-SHA-256
   (600,000 iterations, random 16-byte salt). The key is held only in memory and dropped on Lock or after 5 minutes in the
   background. Forgetting the PIN means the vault cannot be recovered. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function nl(s) { return esc(s).replace(/\n/g, "<br>"); }
  var K = "ftp-private-medical", ITER = 600000, AUTO_LOCK_MS = 5 * 60e3;
  var FIELDS = [["name", "Name", "input"], ["dob", "Date of birth", "date"], ["blood", "Blood type", "blood"], ["allergies", "Allergies (drug, food, insect, latex)", "text"],
    ["meds", "Medications: name, dose, when", "text"], ["conditions", "Conditions / medical notes", "text"], ["doctors", "Doctors and pharmacy (name, phone)", "text"],
    ["contacts", "Emergency contacts for this person (name, relation, phone)", "text"], ["meeting", "Meeting times / pickup plan (school, work)", "text"], ["insurance", "Insurance (plan, member ID)", "input"]];
  var BLOOD = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"];

  var V = { enc: false, locked: false, data: null, key: null, salt: null, msg: "" };
  var te = new TextEncoder(), td = new TextDecoder();
  function b64(u8) { var s = ""; u8 = new Uint8Array(u8); for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); }
  function unb64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function derive(pin, salt, iter) {
    return crypto.subtle.importKey("raw", te.encode(pin), "PBKDF2", false, ["deriveKey"]).then(function (base) {
      return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    });
  }
  function init() {
    var raw = load(K, null);
    if (!raw) { V.enc = false; V.locked = false; V.data = { people: [] }; return; }
    if (raw.enc) { V.enc = true; V.locked = !V.key; if (V.locked) V.data = null; V.salt = unb64(raw.salt); }
    else { V.enc = false; V.locked = false; V.data = raw.data || { people: [] }; }
  }
  var saveT = null;
  function persist() {
    clearTimeout(saveT);
    return new Promise(function (res, rej) {
      saveT = setTimeout(function () {
        if (!V.enc) { localStorage.setItem(K, JSON.stringify({ v: 1, enc: false, data: V.data })); return res(); }
        if (!V.key) return rej(new Error("locked"));
        var iv = crypto.getRandomValues(new Uint8Array(12));
        crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, V.key, te.encode(JSON.stringify(V.data))).then(function (ct) {
          localStorage.setItem(K, JSON.stringify({ v: 1, enc: true, kdf: "PBKDF2-SHA256", iter: ITER, salt: b64(V.salt), iv: b64(iv), ct: b64(ct) })); res();
        }, rej);
      }, 250);
    });
  }
  function unlock(pin) {
    var raw = load(K, null); if (!raw || !raw.enc) return Promise.resolve(true);
    return derive(pin, unb64(raw.salt), raw.iter || ITER).then(function (key) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(raw.iv) }, key, unb64(raw.ct)).then(function (pt) {
        V.key = key; V.salt = unb64(raw.salt); V.data = JSON.parse(td.decode(pt)); V.locked = false; V.enc = true; return true;
      });
    }).catch(function () { return false; });
  }
  function setPin(pin) {
    V.salt = crypto.getRandomValues(new Uint8Array(16));
    return derive(pin, V.salt, ITER).then(function (key) { V.key = key; V.enc = true; V.locked = false; return persist(); });
  }
  function removePin() { V.enc = false; V.key = null; return persist(); }
  function lock() { if (!V.enc) return; V.msg = ""; V.key = null; V.data = null; V.locked = true; render(); renderCards(); }
  function person(id) { return (V.data && V.data.people || []).filter(function (p) { return p.id === id; })[0]; }

  // ---------- vault UI ----------
  function field(p, f) {
    var v = p[f[0]] || "", a = 'data-vf="' + f[0] + '" data-pid="' + esc(p.id) + '"';
    var ctl = f[2] === "text" ? "<textarea " + a + ' rows="2">' + esc(v) + "</textarea>"
      : f[2] === "blood" ? "<select " + a + ">" + BLOOD.map(function (b) { return '<option value="' + b + '"' + (b === v ? " selected" : "") + ">" + (b || "choose") + "</option>"; }).join("") + "</select>"
      : "<input " + a + (f[2] === "date" ? ' type="date"' : "") + ' value="' + esc(v) + '" autocomplete="off">';
    return "<label>" + esc(f[1]) + ctl + "</label>";
  }
  function vaultHtml() {
    var h = '<section class="prep" id="prep-medical"><h2>Medical info vault</h2>' +
      '<p class="hint"><b>Private:</b> stored only in this browser on this device, never uploaded or added to the public site. ' +
      (V.enc ? "Encrypted with your PIN (AES-GCM)." : "Not PIN-locked: anyone using this phone's browser could read it. Add a PIN to encrypt it.") + "</p>";
    if (V.locked) {
      return h + '<form class="vault-lock" onsubmit="return false"><label>PIN<input id="v-pin" type="password" inputmode="numeric" autocomplete="off" minlength="4" maxlength="12"></label>' +
        '<button type="button" class="small-btn primary" id="v-unlock">Unlock</button><span class="d" id="v-msg">' + esc(V.msg) + "</span></form>" +
        '<p class="d">Forgot the PIN? The vault cannot be recovered; <button type="button" class="linkish" id="v-wipe">erase it and start over</button>.</p></section>';
    }
    var ps = V.data.people || [];
    h += ps.map(function (p) {
      return '<details class="vault-p"' + (p._open || ps.length === 1 ? " open" : "") + '><summary><b>' + esc(p.name || "Unnamed") + "</b>" +
        '<span class="d">' + [p.blood, p.allergies ? "allergies" : "", p.meds ? "meds" : ""].filter(Boolean).map(esc).join(" · ") + "</span></summary>" +
        '<div class="comms vault-f">' + FIELDS.map(function (f) { return field(p, f); }).join("") + "</div>" +
        '<div class="row-btns"><button type="button" class="small-btn" data-vcard="' + esc(p.id) + '">Grab-and-go card</button><button type="button" class="small-btn" data-vdel="' + esc(p.id) + '">Remove person</button></div></details>';
    }).join("") +
      '<div class="row-btns"><button type="button" class="small-btn primary" id="v-add">Add person</button><span class="d" id="v-saved"></span></div>' +
      '<details class="vault-pin"><summary>' + (V.enc ? "PIN lock is on" : "PIN lock (optional)") + "</summary>" +
      (V.enc ? '<div class="row-btns"><button type="button" class="small-btn" id="v-lock">Lock now</button><button type="button" class="small-btn" id="v-chpin">Change PIN</button><button type="button" class="small-btn" id="v-rmpin">Remove PIN</button></div>' : "") +
      '<form class="vault-lock" onsubmit="return false"' + (V.enc ? ' hidden id="v-pinform"' : ' id="v-pinform"') + '><label>New PIN (6+ digits recommended)<input id="v-new" type="password" inputmode="numeric" autocomplete="new-password" minlength="4" maxlength="12"></label>' +
      '<label>Repeat PIN<input id="v-new2" type="password" inputmode="numeric" autocomplete="new-password" minlength="4" maxlength="12"></label><button type="button" class="small-btn primary" id="v-setpin">' + (V.enc ? "Save new PIN" : "Turn on PIN lock") + "</button></form>" +
      '<p class="d" id="v-msg">' + esc(V.msg) + '</p><p class="d">The key is derived from the PIN with PBKDF2-SHA-256 (600,000 rounds) and kept only in memory; the vault locks when you tap Lock or after 5 minutes in the background. A short PIN can be guessed by someone who copies this browser\'s storage, so use 6 or more digits. There is no reset: a forgotten PIN means re-entering the data.</p></details></section>';
    return h;
  }
  function render() { var r = $("vault-root"); if (r) r.innerHTML = vaultHtml(); }

  // ---------- grab-and-go cards ----------
  function comms() { return load("ftp-private-comms", {}); }
  function cardHtml(p, opt) {
    var c = comms(), row = function (label, val, cls) { return val ? '<div class="gc-row' + (cls ? " " + cls : "") + '"><div class="gc-l">' + esc(label) + '</div><div class="gc-v">' + nl(val) + "</div></div>" : ""; };
    var rally = [c.rally1 && "1. " + c.rally1, c.rally2 && "2. " + c.rally2, c.rally3 && "3. " + c.rally3].filter(Boolean).join("\n");
    var contacts = [p.contacts, c.oacName || c.oacPhone ? "Out-of-area contact: " + [c.oacName, c.oacPhone].filter(Boolean).join(", ") : ""].filter(Boolean).join("\n");
    var meet = [p.meeting, c.checkin ? "Family check-in: " + c.checkin : ""].filter(Boolean).join("\n");
    var radio = [c.radioPrimary && "Primary: " + c.radioPrimary, c.radioBackup && "Backup: " + c.radioBackup, "NOAA Weather Radio: 162.550 MHz (KDO89)"].filter(Boolean).join("\n");
    return '<article class="gcard"><header><div class="gc-title">GRAB-AND-GO CARD</div><div class="gc-name">' + esc(p.name || "Name") + "</div>" +
      '<div class="gc-sub">' + [p.dob ? "DOB " + p.dob : "", p.blood ? "Blood type " + p.blood : ""].filter(Boolean).map(esc).join(" · ") + "</div></header>" +
      row("ALLERGIES", p.allergies || "None known", "gc-alert") + row("Medications", p.meds) + row("Conditions", p.conditions) + row("Doctors / pharmacy", p.doctors) + row("Insurance", p.insurance) +
      row("Emergency contacts", contacts) + row("Rally points", rally) + row("Meeting times / pickup", meet) + row("Radio", radio) +
      (opt.code && c.codeword ? row("Family code word", c.codeword) : "") +
      '<footer>In an emergency call 911. Printed ' + esc(new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" })) + ". Keep in the go bag and update every 6 months.</footer></article>";
  }
  function cardsHtml() {
    var h = '<section class="prep" id="prep-cards"><h2>Grab-and-go cards</h2><p class="hint">One printable page per person, built on this device from the medical vault and the Rally &amp; comms plan. Nothing is uploaded: printing or "Save as PDF" happens in your browser\'s print dialog.</p>';
    if (V.locked) return h + '<p class="d">Unlock the medical vault above to build cards.</p></section>';
    var ps = V.data.people || [];
    if (!ps.length) return h + '<p class="d">Add people in the medical vault above, then come back here.</p></section>';
    return h + '<div class="gc-pick">' + ps.map(function (p) { return '<label><input type="checkbox" data-gcp="' + esc(p.id) + '" checked> ' + esc(p.name || "Unnamed") + "</label>"; }).join("") + "</div>" +
      '<label class="gc-opt"><input type="checkbox" id="gc-code"> Include the family code word (leave off if cards might be seen by others)</label>' +
      '<div class="row-btns"><button type="button" class="small-btn primary" id="gc-print">Print / Save as PDF</button><button type="button" class="small-btn" id="gc-preview">Preview</button></div>' +
      '<div id="gc-prev" class="gc-prev"></div></section>';
  }
  function renderCards() { var r = $("cards-root"); if (r) r.innerHTML = cardsHtml(); }
  function picked() { var ids = [].map.call(document.querySelectorAll("[data-gcp]:checked"), function (x) { return x.getAttribute("data-gcp"); }); return ids.map(person).filter(Boolean); }
  function printCards(ps) {
    if (!ps.length) return;
    var opt = { code: !!($("gc-code") && $("gc-code").checked) };
    var area = $("print-area"); if (!area) { area = document.createElement("div"); area.id = "print-area"; document.body.appendChild(area); }
    area.innerHTML = ps.map(function (p) { return cardHtml(p, opt); }).join("");
    document.body.classList.add("print-cards");
    var done = function () { document.body.classList.remove("print-cards"); area.innerHTML = ""; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    setTimeout(function () { window.print(); if (!("onafterprint" in window)) setTimeout(done, 1000); }, 50);
  }

  // ---------- events ----------
  document.addEventListener("click", function (e) {
    var t = e.target;
    var tab = t.closest && t.closest("[data-tab]"); if (tab && tab.getAttribute("data-tab") === "prep") setTimeout(function () { init(); render(); renderCards(); }, 0);
    if (t.id === "v-add") { V.data.people.push({ id: "p" + Date.now().toString(36), name: "", _open: true }); persist().then(function () {}); render(); renderCards(); var ins = document.querySelectorAll('#prep-medical [data-vf="name"]'); if (ins.length) ins[ins.length - 1].focus(); }
    var del = t.closest && t.closest("[data-vdel]");
    if (del && confirm("Remove this person's medical info from this device?")) { var id = del.getAttribute("data-vdel"); V.data.people = V.data.people.filter(function (p) { return p.id !== id; }); persist(); render(); renderCards(); }
    var vc = t.closest && t.closest("[data-vcard]"); if (vc) { var p = person(vc.getAttribute("data-vcard")); if (p) printCards([p]); }
    if (t.id === "v-unlock") {
      var pin = $("v-pin").value; V.msg = "Unlocking…"; $("v-msg").textContent = V.msg;
      unlock(pin).then(function (ok) { V.msg = ok ? "" : "Wrong PIN."; render(); renderCards(); if (!ok) { var i = $("v-pin"); if (i) i.focus(); } });
    }
    if (t.id === "v-lock") lock();
    if (t.id === "v-chpin") { var f = $("v-pinform"); if (f) f.hidden = false; }
    if (t.id === "v-setpin") {
      var a = $("v-new").value, b = $("v-new2").value;
      if (!/^\d{4,12}$/.test(a)) { $("v-msg").textContent = "Use 4 to 12 digits (6+ recommended)."; return; }
      if (a !== b) { $("v-msg").textContent = "The PINs don't match."; return; }
      $("v-msg").textContent = "Encrypting…";
      setPin(a).then(function () { V.msg = "PIN lock on. The vault is encrypted on this device."; render(); });
    }
    if (t.id === "v-rmpin" && confirm("Remove the PIN? The vault will be stored unencrypted on this device.")) removePin().then(function () { V.msg = "PIN removed."; render(); });
    if (t.id === "v-wipe" && confirm("Erase the encrypted medical vault on this device? This cannot be undone.")) { localStorage.removeItem(K); V.key = null; V.msg = ""; init(); render(); renderCards(); }
    if (t.id === "gc-print") printCards(picked());
    if (t.id === "gc-preview") { var pv = $("gc-prev"), opt = { code: !!($("gc-code") && $("gc-code").checked) }; pv.innerHTML = picked().map(function (p) { return cardHtml(p, opt); }).join(""); }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.id === "v-pin") { e.preventDefault(); $("v-unlock").click(); } });
  function onEdit(e) {
    var t = e.target; if (!t.matches || !t.matches("[data-vf]") || !V.data) return;
    var p = person(t.getAttribute("data-pid")); if (!p) return;
    p[t.getAttribute("data-vf")] = t.value; delete p._open;
    persist().then(function () { var s = $("v-saved"); if (s) s.textContent = V.enc ? "Saved (encrypted) on this device" : "Saved on this device"; }).catch(function () {});
    if (t.getAttribute("data-vf") === "name") { var sm = t.closest("details") && t.closest("details").querySelector("summary b"); if (sm) sm.textContent = t.value || "Unnamed"; }
  }
  document.addEventListener("input", onEdit);
  document.addEventListener("change", function (e) { if (e.target.matches && e.target.matches("select[data-vf]")) onEdit(e); if (e.target.matches && e.target.matches("[data-vf]")) renderCards(); });
  var hiddenAt = 0;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) hiddenAt = Date.now();
    else if (V.enc && V.key && hiddenAt && Date.now() - hiddenAt > AUTO_LOCK_MS) lock();
  });
  init();
  window.FTPVault = { state: function () { return { enc: V.enc, locked: V.locked, people: V.data ? V.data.people.length : null }; }, lock: lock };
})();
