/* Medical info vault + grab-and-go cards. Everything stays on this device; nothing is uploaded.
   v2: the vault is stored in IndexedDB (db "ftp-private", store "kv", key "medical") and must be encrypted before new data
   is saved: AES-GCM (256-bit) with a key derived from a passphrase by PBKDF2-SHA-256 (600,000 iterations, random 16-byte
   salt, fresh 12-byte IV on every save). The key is held only in memory and dropped on Lock or after 5 minutes in the
   background. Encrypted backup export/import (the file holds only ciphertext + salt/iv). A v1 vault in localStorage
   ("ftp-private-medical") is migrated into IndexedDB on first load; v1 numeric PINs still unlock. Forgetting the
   passphrase means the vault cannot be recovered. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function nl(s) { return esc(s).replace(/\n/g, "<br>"); }
  var K = "ftp-private-medical", ITER = 600000, AUTO_LOCK_MS = 5 * 60e3;
  var FIELDS = [["name", "Name", "input"], ["dob", "Date of birth", "date"], ["blood", "Blood type", "blood"], ["allergies", "Allergies (drug, food, insect, latex)", "text"],
    ["meds", "Medications: name, dose, when", "text"], ["conditions", "Conditions / medical notes", "text"], ["doctors", "Doctors and pharmacy (name, phone)", "text"],
    ["contacts", "Emergency contacts for this person (name, relation, phone)", "text"], ["meeting", "Meeting times / pickup plan", "text"], ["insurance", "Insurance (plan, member ID)", "input"]];
  var BLOOD = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"];

  var V = { enc: false, locked: false, data: null, key: null, salt: null, msg: "", ready: false };
  // ---------- storage: IndexedDB (fallback: localStorage) ----------
  var RAW = null, IDB = null, MIN_PASS = 8;
  function idb() {
    if (IDB) return IDB;
    IDB = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error("no idb"));
      var rq = indexedDB.open("ftp-private", 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore("kv"); };
      rq.onsuccess = function () { res(rq.result); }; rq.onerror = function () { rej(rq.error); };
    });
    return IDB;
  }
  function idbGet(k) { return idb().then(function (db) { return new Promise(function (res, rej) { var r = db.transaction("kv").objectStore("kv").get(k); r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }); }
  function idbPut(k, v) { return idb().then(function (db) { return new Promise(function (res, rej) { var tx = db.transaction("kv", "readwrite"); if (v == null) tx.objectStore("kv").delete(k); else tx.objectStore("kv").put(v, k); tx.oncomplete = function () { res(); }; tx.onerror = function () { rej(tx.error); }; }); }); }
  var useLS = false;
  function writeRaw(rec) {
    RAW = rec;
    if (useLS) { if (rec == null) localStorage.removeItem(K); else localStorage.setItem(K, JSON.stringify(rec)); return Promise.resolve(); }
    return idbPut("medical", rec).then(function () { try { localStorage.removeItem(K); } catch (e) {} });
  }
  var boot = idbGet("medical").then(function (rec) {
    var legacy = load(K, null);
    if (!rec && legacy) return idbPut("medical", legacy).then(function () { localStorage.removeItem(K); return legacy; });   // migrate v1
    return rec || null;
  }).catch(function () { useLS = true; return load(K, null); }).then(function (rec) { RAW = rec; V.ready = true; init(); render(); renderCards(); });
  var te = new TextEncoder(), td = new TextDecoder();
  function b64(u8) { var s = ""; u8 = new Uint8Array(u8); for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); }
  function unb64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function derive(pin, salt, iter) {
    return crypto.subtle.importKey("raw", te.encode(pin), "PBKDF2", false, ["deriveKey"]).then(function (base) {
      return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    });
  }
  function init() {
    var raw = RAW;
    if (!raw) { V.enc = false; V.locked = false; V.data = { people: [] }; return; }
    if (raw.enc) { V.enc = true; V.locked = !V.key; if (V.locked) V.data = null; V.salt = unb64(raw.salt); }
    else { V.enc = false; V.locked = false; V.data = raw.data || { people: [] }; }
  }
  var saveT = null;
  function persist() {
    clearTimeout(saveT);
    return new Promise(function (res, rej) {
      saveT = setTimeout(function () {
        if (!V.ready) return rej(new Error("not ready"));
        if (!V.enc) { writeRaw({ v: 1, enc: false, data: V.data }).then(res, rej); return; }   // legacy unencrypted vault only
        if (!V.key) return rej(new Error("locked"));
        var iv = crypto.getRandomValues(new Uint8Array(12));
        crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, V.key, te.encode(JSON.stringify(V.data))).then(function (ct) {
          return writeRaw({ v: 2, enc: true, kdf: "PBKDF2-SHA256", iter: V.iter || ITER, salt: b64(V.salt), iv: b64(iv), ct: b64(ct) });
        }).then(res, rej);
      }, 250);
    });
  }
  function unlock(pin) {
    var raw = RAW; if (!raw || !raw.enc) return Promise.resolve(true);
    return derive(pin, unb64(raw.salt), raw.iter || ITER).then(function (key) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(raw.iv) }, key, unb64(raw.ct)).then(function (pt) {
        V.key = key; V.iter = raw.iter || ITER; V.salt = unb64(raw.salt); V.data = JSON.parse(td.decode(pt)); V.locked = false; V.enc = true; touch();
        // V2.2: re-encrypt older vaults with today's key-derivation strength (new salt + ITER) right after a good unlock
        if (V.iter < ITER) return setPin(pin).then(function () { return true; }, function () { return true; });
        migrateCode();
        return true;
      });
    }).catch(function () { return false; });
  }
  function setPin(pin) {
    V.salt = crypto.getRandomValues(new Uint8Array(16));
    return derive(pin, V.salt, ITER).then(function (key) { V.key = key; V.iter = ITER; V.enc = true; V.locked = false; touch(); migrateCode(); return persist(); });
  }
  function exportBackup() {
    if (!RAW || !RAW.enc) return false;
    var out = { format: "ftp-medical-backup", v: 2, exportedAt: new Date().toISOString(), kdf: RAW.kdf, iter: RAW.iter, salt: RAW.salt, iv: RAW.iv, ct: RAW.ct };
    var a = document.createElement("a"), u = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: "application/json" }));
    a.href = u; a.download = "threat-picture-medical-vault-" + new Date().toISOString().slice(0, 10) + ".encrypted.json"; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 1000); return true;
  }
  function importBackup(text) {
    var j = JSON.parse(text);
    if (j.format !== "ftp-medical-backup" || !j.salt || !j.iv || !j.ct) throw new Error("not a vault backup");
    unb64(j.salt); unb64(j.iv); unb64(j.ct);   // throws if not base64
    return writeRaw({ v: 2, enc: true, kdf: j.kdf || "PBKDF2-SHA256", iter: +j.iter || ITER, salt: j.salt, iv: j.iv, ct: j.ct }).then(function () { V.key = null; init(); });
  }
  function lock() { if (!V.enc) return; V.msg = ""; V.key = null; V.data = null; V.locked = true; render(); renderCards(); document.dispatchEvent(new CustomEvent("ftp-vault")); }
  // V2.2: the old plain-text family code word (ftp-private-comms.codeword) moves into the encrypted vault
  function migrateCode() {
    if (!V.data) return; var c = load("ftp-private-comms", {});
    if (c.codeword && !V.data.codewords) { V.data.codewords = c.codeword; persist().then(function () { var c2 = load("ftp-private-comms", {}); delete c2.codeword; try { localStorage.setItem("ftp-private-comms", JSON.stringify(c2)); } catch (e) {} }).catch(function () {}); }
  }
  // V2.2 session lock: idle (no taps/keys while unlocked) and optional immediate lock when the app goes to the background
  var VP = load("ftp-vault-prefs", {}), lastAct = Date.now(), IDLE_MS = (VP.idleMin || 10) * 60e3;
  function touch() { lastAct = Date.now(); }
  ["pointerdown", "keydown"].forEach(function (ev) { document.addEventListener(ev, touch, true); });
  setInterval(function () { if (V.enc && V.key && Date.now() - lastAct > IDLE_MS) { lock(); if (window.ftpToast) ftpToast("Medical vault locked after inactivity"); } }, 15000);
  function person(id) { return (V.data && V.data.people || []).filter(function (p) { return p.id === id; })[0]; }

  // ---------- vault UI ----------
  function field(p, f) {
    var v = p[f[0]] || "", a = 'data-vf="' + f[0] + '" data-pid="' + esc(p.id) + '"';
    var ctl = f[2] === "text" ? "<textarea " + a + ' rows="2">' + esc(v) + "</textarea>"
      : f[2] === "blood" ? "<select " + a + ">" + BLOOD.map(function (b) { return '<option value="' + b + '"' + (b === v ? " selected" : "") + ">" + (b || "choose") + "</option>"; }).join("") + "</select>"
      : "<input " + a + (f[2] === "date" ? ' type="date"' : "") + ' value="' + esc(v) + '" autocomplete="off">';
    return "<label>" + esc(f[1]) + ctl + "</label>";
  }
  function passForm(id, btn, label) {
    return '<form class="vault-lock" id="' + id + '"><label>' + label + '<input id="v-new" type="password" autocomplete="new-password" minlength="' + MIN_PASS + '" maxlength="128"></label>' +
      '<label>Repeat passphrase<input id="v-new2" type="password" autocomplete="new-password" minlength="' + MIN_PASS + '" maxlength="128"></label><button type="button" class="small-btn primary" id="v-setpin">' + btn + "</button></form>";
  }
  function backupHtml() {
    return '<details class="vault-pin"><summary>Encrypted backup</summary><p class="d">The backup file holds only the encrypted vault; it is useless without your passphrase. Keep it on a USB stick or another device. Restoring replaces the vault on this device.</p><div class="row-btns">' +
      (RAW && RAW.enc ? '<button type="button" class="small-btn" id="v-export">Download encrypted backup</button>' : "") +
      '<label class="small-btn file-btn">Restore from backup<input type="file" id="v-import" accept="application/json,.json" hidden></label></div></details>';
  }
  function sessionHtml() {
    return '<details class="vault-pin"><summary>Session lock</summary><label>Lock after no activity for <select id="v-idle">' + [5, 10, 15, 30].map(function (m) { return '<option value="' + m + '"' + ((VP.idleMin || 10) === m ? " selected" : "") + ">" + m + " minutes</option>"; }).join("") + "</select></label>" +
      '<label class="chk"><input type="checkbox" id="v-hide"' + (VP.lockOnHide ? " checked" : "") + "> Lock as soon as the app goes to the background (otherwise after 5 minutes)</label></details>";
  }
  function dangerHtml() {
    return '<details class="vault-pin"><summary>Delete the vault</summary><p class="d">Overwrites the encrypted record on this device with random data, then deletes it. Make an encrypted backup first if you may need it.</p><button type="button" class="small-btn danger" id="v-wipe">Erase the medical vault on this device</button></details>';
  }
  var LOSS = '<div class="warn-box"><b>Important:</b> your passphrase is the only key. Nobody (not this app, not the family, not a support desk) can recover the vault if it is forgotten. If this phone is lost or its browser data is cleared, the vault is gone unless you kept an encrypted backup. Medical details never leave this device unless you download or print them yourself.</div>';
  function vaultHtml() {
    var h = '<section class="prep" id="prep-medical"><h2>Medical info vault</h2>' +
      '<p class="hint"><b>Private:</b> stored only on this device (IndexedDB), never uploaded or added to the public site. ' +
      (V.enc ? "Encrypted on this device with your passphrase (AES-GCM 256, PBKDF2-SHA-256 600,000 rounds). Works offline." : V.data && V.data.people && V.data.people.length ? '<b class="warn-t">This older vault is NOT encrypted.</b> Set a passphrase below to encrypt it.' : "Choose a passphrase to create the encrypted vault.") + "</p>";
    h += LOSS;
    if (!V.ready) return h + '<p class="d">Opening the vault…</p></section>';
    if (V.locked) {
      return h + '<form class="vault-lock"><label>Passphrase (or older PIN)<input id="v-pin" type="password" autocomplete="current-password" maxlength="128"></label>' +
        '<button type="button" class="small-btn primary" id="v-unlock">Unlock</button><span class="d" id="v-msg">' + esc(V.msg) + "</span></form>" + backupHtml() +
        '<p class="d">Forgot the passphrase? The vault cannot be recovered; <button type="button" class="linkish" id="v-wipe">erase it and start over</button>.</p></section>';
    }
    var ps = V.data.people || [];
    if (!V.enc && !ps.length) {
      return h + passForm("v-pinform", "Create encrypted vault", "New passphrase (" + MIN_PASS + "+ characters; a few random words is best)") + '<p class="d" id="v-msg">' + esc(V.msg) + "</p>" + backupHtml() +
        '<p class="d">There is no reset: a forgotten passphrase means re-entering the data.</p></section>';
    }
    h += ps.map(function (p) {
      return '<details class="vault-p"' + (p._open || ps.length === 1 ? " open" : "") + '><summary><b>' + esc(p.name || "Unnamed") + "</b>" +
        '<span class="d">' + [p.blood, p.allergies ? "allergies" : "", p.meds ? "meds" : ""].filter(Boolean).map(esc).join(" · ") + "</span></summary>" +
        '<div class="comms vault-f">' + FIELDS.map(function (f) { return field(p, f); }).join("") + "</div>" +
        '<div class="row-btns"><button type="button" class="small-btn" data-vcard="' + esc(p.id) + '">Grab-and-go card</button><button type="button" class="small-btn" data-vdel="' + esc(p.id) + '">Remove person</button></div></details>';
    }).join("") +
      (V.enc ? '<details class="vault-p" id="v-codes"><summary><b>Family code words</b> <span class="d">encrypted with this vault</span></summary><label>Code words and what they mean (e.g. a safe word for pickups, a duress word)<textarea id="v-codewords" rows="3" maxlength="1000">' + esc(V.data.codewords || "") + "</textarea></label></details>" : "") +
      (V.enc ? '<div class="row-btns"><button type="button" class="small-btn primary" id="v-add">Add person</button><button type="button" class="small-btn" id="v-lock">Lock now</button><span class="d" id="v-saved"></span></div>' : "") +
      (V.enc ? '<details class="vault-pin"><summary>Change passphrase</summary>' + passForm("v-pinform", "Save new passphrase", "New passphrase (" + MIN_PASS + "+ characters)") + "</details>"
        : passForm("v-pinform", "Encrypt this vault", "New passphrase (" + MIN_PASS + "+ characters)")) +
      backupHtml() + sessionHtml() + dangerHtml() +
      '<p class="d" id="v-msg">' + esc(V.msg) + '</p><p class="d">The key is derived on this device and kept only in memory; the vault locks when you tap Lock or after 5 minutes in the background. Someone who copies this browser\'s storage could try to guess a weak passphrase, so use a long one. There is no reset.</p></section>';
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
      (opt.code && ((V.data && V.data.codewords) || c.codeword) ? row("Family code words", (V.data && V.data.codewords) || c.codeword) : "") +
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
    var tab = t.closest && t.closest("[data-tab]"); if (tab && tab.getAttribute("data-tab") === "family") setTimeout(function () { if (!V.key) init(); render(); renderCards(); }, 0);
    if (t.id === "v-add" && V.enc && V.key) { V.data.people.push({ id: "p" + Date.now().toString(36), name: "", _open: true }); persist().then(function () {}); render(); renderCards(); var ins = document.querySelectorAll('#prep-medical [data-vf="name"]'); if (ins.length) ins[ins.length - 1].focus(); }
    var del = t.closest && t.closest("[data-vdel]");
    if (del && confirm("Remove this person's medical info from this device?")) { var id = del.getAttribute("data-vdel"); V.data.people = V.data.people.filter(function (p) { return p.id !== id; }); persist(); render(); renderCards(); }
    var vc = t.closest && t.closest("[data-vcard]"); if (vc) { var p = person(vc.getAttribute("data-vcard")); if (p) printCards([p]); }
    if (t.id === "v-unlock") {
      var pin = $("v-pin").value; V.msg = "Unlocking…"; $("v-msg").textContent = V.msg;
      unlock(pin).then(function (ok) { V.msg = ok ? "" : "Wrong passphrase."; render(); renderCards(); if (!ok) { var i = $("v-pin"); if (i) i.focus(); } });
    }
    if (t.id === "v-lock") lock();
    if (t.id === "v-setpin") {
      var a = $("v-new").value, b = $("v-new2").value;
      if (a.length < MIN_PASS) { $("v-msg").textContent = "Use at least " + MIN_PASS + " characters."; return; }
      if (a !== b) { $("v-msg").textContent = "The passphrases don't match."; return; }
      $("v-msg").textContent = "Encrypting…";
      setPin(a).then(function () { V.msg = "Encrypted on this device. Keep your passphrase somewhere safe."; render(); renderCards(); }, function () { V.msg = "Could not save the vault on this device."; render(); });
    }
    if (t.id === "v-export") exportBackup();
    if (t.id === "v-wipe" && confirm("Erase the encrypted medical vault on this device? This cannot be undone.")) { wipe().then(function () { if (window.ftpToast) ftpToast("Medical vault erased on this device"); }); }
    if (t.id === "gc-print") printCards(picked());
    if (t.id === "gc-preview") { var pv = $("gc-prev"), opt = { code: !!($("gc-code") && $("gc-code").checked) }; pv.innerHTML = picked().map(function (p) { return cardHtml(p, opt); }).join(""); }
  });
  // Overwrite the stored record with random bytes, then delete it. Browsers may still keep old copies in their own
  // storage files until they compact them; the data was encrypted, so that copy is useless without the passphrase.
  function wipe() {
    V.key = null; V.data = null; V.msg = "";
    var junk = b64(crypto.getRandomValues(new Uint8Array(4096)));
    return writeRaw({ v: 0, enc: true, wiped: true, salt: junk.slice(0, 24), iv: junk.slice(24, 40), ct: junk }).catch(function () {}).then(function () { return writeRaw(null); })
      .then(function () { try { localStorage.removeItem(K); } catch (e) {} RAW = null; init(); render(); renderCards(); });
  }
  document.addEventListener("change", function (e) {
    if (e.target.id !== "v-import" || !e.target.files[0]) return;
    var fr = new FileReader(); fr.onload = function () {
      if (RAW && !confirm("Replace the medical vault on this device with this backup? You will need the backup's passphrase.")) return;
      try { importBackup(fr.result).then(function () { V.msg = "Backup restored. Unlock it with its passphrase."; render(); renderCards(); }); }
      catch (x) { V.msg = "That file is not an encrypted vault backup."; render(); }
    }; fr.readAsText(e.target.files[0]);
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
  document.addEventListener("input", function (e) { if (e.target.id === "v-codewords" && V.data && V.key) { V.data.codewords = e.target.value.slice(0, 1000); persist().catch(function () {}); } });
  document.addEventListener("change", function (e) {
    if (e.target.id === "v-idle") { VP.idleMin = +e.target.value; IDLE_MS = VP.idleMin * 60e3; V2save(); }
    if (e.target.id === "v-hide") { VP.lockOnHide = e.target.checked; V2save(); }
  });
  function V2save() { try { localStorage.setItem("ftp-vault-prefs", JSON.stringify(VP)); } catch (e) {} }
  document.addEventListener("change", function (e) { if (e.target.matches && e.target.matches("select[data-vf]")) onEdit(e); if (e.target.matches && e.target.matches("[data-vf]")) renderCards(); });
  var hiddenAt = 0;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { hiddenAt = Date.now(); if (VP.lockOnHide && V.enc && V.key) lock(); }
    else if (V.enc && V.key && hiddenAt && Date.now() - hiddenAt > AUTO_LOCK_MS) lock();
  });
  init();
  window.FTPVault = { state: function () { return { enc: V.enc, locked: V.locked, ready: V.ready, people: V.data ? V.data.people.length : null, iter: V.iter || (RAW && RAW.iter) || null }; }, lock: lock, wipe: wipe, ready: function () { return boot; },
    // read-only snapshot for the on-device offline pack (only when unlocked and the user ticked "include medical")
    snapshot: function () { return V.key && V.data ? JSON.parse(JSON.stringify(V.data)) : null; }, codewords: function () { return V.key && V.data ? V.data.codewords || "" : null; } };
})();
