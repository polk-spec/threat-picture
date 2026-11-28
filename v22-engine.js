/* V2.2 threat engine: pure functions (no DOM, no network) so they can be unit-tested in Node (tools/v22_engine_test.js).
   - 14 spec categories, mapped from the brief's `type` (+ keywords) unless the brief sets `hazard`.
   - GREEN / YELLOW / ORANGE / RED classification (mapping documented in SCHEMA.md and docs/V2.2-GAP-AUDIT.md).
   - Household level = max(official component, analytical component). Official = NWS alerts at monitored places + USGS
     quakes. Analytical = the brief's LOCAL items only, capped at ORANGE (Developing items at YELLOW). National and
     international items never raise the household level; they are reported as the "wider situation".
   Private places are passed in by the caller from on-device storage; nothing here stores or sends them. */
(function (g) {
  "use strict";
  var COLORS = ["GREEN", "YELLOW", "ORANGE", "RED"];
  var CATS = {
    severe: ["Severe weather", "⛈️"], tornado: ["Tornadoes & hurricanes", "🌪️"], flood: ["Flooding", "🌊"], wildfire: ["Wildfires", "🔥"],
    quake: ["Earthquakes", "🌋"], unrest: ["Civil unrest", "📢"], infra: ["Infrastructure disruptions", "🏗️"], power: ["Power outages", "⚡"],
    cyber: ["Cybersecurity incidents", "💻"], transport: ["Transportation disruptions", "🚗"], safety: ["Public safety incidents", "🚨"],
    nuclear: ["Nuclear & radiological", "☢️"], health: ["Biological & public health", "🦠"], natsec: ["National security developments", "🛡️"]
  };
  var TYPE_CAT = { weather: "severe", flood: "flood", fire: "wildfire", earthquake: "quake", power: "power", cyber: "cyber", transport: "transport",
    crime: "safety", terrorism: "safety", nuclear: "nuclear", disease: "health", air: "health", military: "natsec", conflict: "natsec",
    economy: "infra", space: "infra", other: "infra" };
  var LEVEL_COLOR = { Low: "GREEN", Guarded: "GREEN", Elevated: "YELLOW", High: "ORANGE", Severe: "RED" };
  // NWS events that mean act now (life safety) → RED; mirrors notify-rules.js SEVERE_EVENTS plus hazmat/nuclear
  var RED_EVENTS = /^(Tornado Warning|Flash Flood (Warning|Emergency)|Extreme Wind Warning|Evacuation Immediate|Shelter In Place Warning|Civil (Danger Warning|Emergency Message)|Local Area Emergency|Hazardous Materials Warning|Nuclear Power Plant Warning|Radiological Hazard Warning|Law Enforcement Warning|Earthquake Warning|Hurricane Warning|Storm Surge Warning)$/;
  function rank(c) { return Math.max(0, COLORS.indexOf(c)); }
  function maxColor(a, b) { return rank(a) >= rank(b) ? a : b; }
  function minColor(a, b) { return rank(a) <= rank(b) ? a : b; }

  function category(t) {
    if (t && t.hazard && CATS[t.hazard]) return t.hazard;
    var txt = ((t && t.name) || "") + " " + ((t && t.summary) || "");
    if (t && t.type === "weather" && /tornado|hurricane|tropical storm/i.test(t.name || "")) return "tornado";
    if (t && (t.type === "crime" || t.type === "terrorism" || t.type === "other") && /\b(protest|riot|unrest|demonstrat)/i.test(txt)) return "unrest";
    if (t && t.type === "other" && /\b(outage|grid)\b/i.test(t.name || "")) return "power";
    return TYPE_CAT[(t && t.type) || "other"] || "infra";
  }
  function nwsCategory(ev) {
    ev = ev || "";
    if (/tornado|hurricane|tropical|storm surge/i.test(ev)) return "tornado";
    if (/flood/i.test(ev)) return "flood";
    if (/fire|red flag/i.test(ev)) return "wildfire";
    if (/earthquake/i.test(ev)) return "quake";
    if (/nuclear|radiolog/i.test(ev)) return "nuclear";
    if (/civil|law enforcement|evacuat|shelter|local area|911/i.test(ev)) return "safety";
    if (/hazardous materials/i.test(ev)) return "infra";
    if (/air quality|smoke|dust/i.test(ev)) return "health";
    return "severe";
  }
  function levelColor(level) { return LEVEL_COLOR[level] || "GREEN"; }
  function nwsColor(p) {
    p = p || {};
    if (RED_EVENTS.test(p.event || "") || p.severity === "Extreme") return "RED";
    if (p.severity === "Severe" || / Warning$/.test(p.event || "")) return "ORANGE";
    if (p.severity === "Moderate" || / (Watch|Advisory)$/.test(p.event || "")) return "YELLOW";
    return "GREEN";
  }
  function quakeColor(mag, km) {
    if (mag >= 6 && km <= 80) return "RED";
    if (mag >= 5 && km <= 160) return "ORANGE";
    if (mag >= 4 && km <= 160) return "YELLOW";
    return "GREEN";
  }
  var DEV_RE = /\b(unconfirmed|not (yet |been |independently )?(confirmed|verified)|unverified|claims?|claimed|reportedly|alleged(ly)?|rumou?r)\b/i;
  function developing(t) { return t.label === "developing" || (!t.label && DEV_RE.test(t.summary || "")); }
  function confidence(t) {
    if (t.confidence && /^(high|medium|low)$/i.test(t.confidence)) return t.confidence.charAt(0).toUpperCase() + t.confidence.slice(1).toLowerCase();
    if (t.label === "official" || t.label === "verified") return "High";
    if (developing(t)) return "Low";
    return "Medium";
  }
  function km(a, b, c, d) { var r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2); return 12742 * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y)); }
  function miles(a, b, c, d) { return km(a, b, c, d) * 0.621371; }
  function place(t) {
    if (t.place) return String(t.place);
    return t.category === "Local" ? "St. Louis Metro East" : t.category === "National" ? "United States" : "International";
  }
  var IMPACT = {
    severe: "Travel, outdoor plans and power can be affected.", tornado: "Shelter decisions may be needed quickly.", flood: "Roads and low areas can close; check routes.",
    wildfire: "Smoke and air quality; evacuation only if near.", quake: "Check home for damage; aftershocks possible.", unrest: "Avoid the affected area; expect road closures.",
    infra: "Services or supplies may be disrupted.", power: "Plan for lights, refrigeration, medical devices and phone charging.", cyber: "Update devices; watch accounts and payment cards.",
    transport: "Allow extra travel time; check routes before leaving.", safety: "Stay aware; follow official instructions for the area.", nuclear: "Follow official shelter guidance only if issued for this area.",
    health: "Hygiene, vaccinations and staying home when sick.", natsec: "Indirect: prices, travel or news alerts; no direct local effect reported."
  };
  // "Does it affect my household?" — Yes / Possible / Unlikely, from scope, distance and color (never from wording alone)
  function affects(t, nearestMi) {
    var c = levelColor(t.level);
    if (t.category === "Local") return nearestMi != null && nearestMi <= 25 && rank(c) >= 2 ? "Yes" : rank(c) >= 1 ? "Possible" : "Unlikely";
    if (t.category === "National") return rank(c) >= 2 && /^(health|cyber|infra|power)$/.test(category(t)) ? "Possible" : "Unlikely";
    return "Unlikely";
  }
  function enrich(t, locs, briefUpdated) {
    var cat = category(t), dists = [], near = null;
    if (typeof t.lat === "number" && typeof t.lng === "number" && t.category === "Local") {
      (locs || []).forEach(function (l) { var mi = miles(t.lat, t.lng, +l.lat, +l.lon); dists.push({ name: l.name, kind: l.kind || (l.home ? "home" : "other"), mi: Math.round(mi) }); if (near == null || mi < near) near = mi; });
    }
    return {
      cat: cat, catLabel: CATS[cat][0], icon: CATS[cat][1], color: levelColor(t.level), confidence: confidence(t), developing: developing(t),
      place: place(t), dists: dists, nearestMi: near == null ? null : Math.round(near), affects: affects(t, near),
      impact: t.impact ? String(t.impact) : (t.category === "Local" ? IMPACT[cat] : "Indirect for the household: " + IMPACT[cat].charAt(0).toLowerCase() + IMPACT[cat].slice(1)),
      reported: t.reportedAt || t.date || "", updated: t.updatedAt || t.checkedAt || briefUpdated || "", precautions: (t.actions || []).slice(0, 4),
      official: t.label === "official"
    };
  }
  function activeNWS(fs, now) {
    now = now || Date.now();
    return (fs || []).filter(function (f) { var p = f.properties || {}, end = Date.parse(p.ends || p.expires || ""); return p.status === "Actual" && p.messageType !== "Cancel" && (!end || end > now); });
  }
  /* places: [{loc:{name,lat,lon,home}, nws:[features], quakes:[features]}]; threats: data.json threats */
  function household(places, threats, now) {
    var off = { color: "GREEN", drivers: [] }, ana = { color: "GREEN", drivers: [] }, wider = { color: "GREEN", items: [] }, seen = {};
    (places || []).forEach(function (pl) {
      activeNWS(pl.nws, now).forEach(function (f) {
        var p = f.properties, c = nwsColor(p), key = p.id || p.event + p.sent;
        if (seen[key]) { seen[key].places.push(pl.loc.name); return; }
        var d = { what: p.event, color: c, cat: nwsCategory(p.event), places: [pl.loc.name], src: "NWS", at: p.sent || p.effective, until: p.ends || p.expires, headline: p.headline || "", instruction: p.instruction || "", kind: "official" };
        seen[key] = d; off.drivers.push(d); off.color = maxColor(off.color, c);
      });
      (pl.quakes || []).forEach(function (f) {
        var gq = f.geometry && f.geometry.coordinates, m = +(f.properties || {}).mag || 0; if (!gq) return;
        var k = km(+pl.loc.lat, +pl.loc.lon, gq[1], gq[0]), c = quakeColor(m, k); if (c === "GREEN") return;
        off.drivers.push({ what: "M" + m.toFixed(1) + " earthquake, " + Math.round(k * 0.621371) + " mi from " + pl.loc.name, color: c, cat: "quake", places: [pl.loc.name], src: "USGS", at: new Date(f.properties.time).toISOString(), kind: "official" });
        off.color = maxColor(off.color, c);
      });
    });
    (threats || []).forEach(function (t) {
      var c = levelColor(t.level);
      if (t.category !== "Local") { if (rank(c) > 0) wider.items.push({ id: t.id, what: t.name, color: c, scope: t.category, cat: category(t) }); wider.color = maxColor(wider.color, c); return; }
      var cap = developing(t) ? "YELLOW" : "ORANGE", cc = minColor(c, cap);
      if (rank(cc) > 0) ana.drivers.push({ id: t.id, what: t.name, color: cc, raw: t.level, cat: category(t), kind: "assessment", developing: developing(t) });
      ana.color = maxColor(ana.color, cc);
    });
    var byRank = function (a, b) { return rank(b.color) - rank(a.color); };
    off.drivers.sort(byRank); ana.drivers.sort(byRank); wider.items.sort(byRank);
    return { color: maxColor(off.color, ana.color), official: off, analytical: ana, wider: wider };
  }
  var E = { COLORS: COLORS, CATS: CATS, TYPE_CAT: TYPE_CAT, LEVEL_COLOR: LEVEL_COLOR, category: category, nwsCategory: nwsCategory, levelColor: levelColor, nwsColor: nwsColor,
    quakeColor: quakeColor, confidence: confidence, developing: developing, place: place, affects: affects, enrich: enrich, household: household, miles: miles, km: km,
    activeNWS: activeNWS, rank: rank, maxColor: maxColor, COLOR_TEXT: { GREEN: "Normal", YELLOW: "Elevated awareness", ORANGE: "Significant concern", RED: "Immediate emergency" } };
  if (typeof module !== "undefined" && module.exports) module.exports = E; else g.FTPEngine = E;
})(typeof self !== "undefined" ? self : this);
