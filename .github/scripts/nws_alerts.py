#!/usr/bin/env python3
"""Closed-app critical weather alerts for the St. Louis Metro East (public NWS zones only).

Runs on a GitHub Actions schedule. Polls api.weather.gov for active alerts in public county/zone codes
(St. Clair County IL, St. Louis City MO, St. Louis County MO), keeps the same critical event list as the app
(notify-rules.js), and pushes new ones to a private ntfy topic.

Privacy and safety:
- The ntfy topic comes only from the NTFY_TOPIC Actions secret and is never printed or written to a file.
- Nothing is sent unless the repository variable NTFY_ENABLED is exactly "true" (default: dry run).
- Alerts already pushed are remembered in .github/alerts-state.json (public NWS ids only), so each alert is sent once.
- Uses only public data; never fabricates anything. If the NWS request fails the run exits non-zero and sends nothing.
"""
import json, os, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta

ZONES = "ILC163,ILZ101,MOC510,MOZ064,MOC189,MOZ063"
URL = "https://api.weather.gov/alerts/active?zone=" + ZONES
SITE = "https://polk-spec.github.io/threat-picture/"
STATE = os.path.join(os.path.dirname(__file__), "..", "alerts-state.json")
UA = "threat-picture-alerts (github.com/polk-spec/threat-picture)"
# urgent (ntfy priority 5): same list as SEVERE_EVENTS in notify-rules.js
CRITICAL = ["Tornado Warning", "Severe Thunderstorm Warning", "Flash Flood Warning", "Flash Flood Emergency", "Extreme Wind Warning",
            "Civil Emergency Message", "Civil Danger Warning", "Shelter In Place Warning", "Evacuation Immediate", "Local Area Emergency"]
# high (ntfy priority 4): rest of NWS_EVENTS in notify-rules.js
HIGH = ["Tornado Watch", "Law Enforcement Warning", "Nuclear Power Plant Warning", "Radiological Hazard Warning",
        "Hazardous Materials Warning", "Earthquake Warning"]


def ct(iso):
    if not iso:
        return ""
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        # America/Chicago without tz database: CDT (UTC-5) from 2nd Sun Mar to 1st Sun Nov, else CST (UTC-6)
        y = d.year
        mar = datetime(y, 3, 8, 8, tzinfo=timezone.utc); mar += timedelta(days=(6 - mar.weekday()) % 7)
        nov = datetime(y, 11, 1, 7, tzinfo=timezone.utc); nov += timedelta(days=(6 - nov.weekday()) % 7)
        off, lab = (-5, "CDT") if mar <= d.astimezone(timezone.utc) < nov else (-6, "CST")
        return d.astimezone(timezone(timedelta(hours=off))).strftime("%a %-I:%M %p ") + lab
    except Exception:
        return iso


def load_state():
    try:
        with open(STATE) as f:
            s = json.load(f)
    except Exception:
        s = {}
    s.setdefault("seen", {})
    return s


def main():
    enabled = os.environ.get("NTFY_ENABLED", "").strip().lower() == "true"
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    server = os.environ.get("NTFY_SERVER", "").strip() or "https://ntfy.sh"
    req = urllib.request.Request(URL, headers={"User-Agent": UA, "Accept": "application/geo+json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)
    st = load_state()
    now = time.time()
    st["seen"] = {k: v for k, v in st["seen"].items() if now - v < 4 * 86400}
    first = not st.get("init")
    new = []
    for f in data.get("features", []):
        p = f.get("properties", {})
        ev, aid = p.get("event", ""), p.get("id", "")
        if not aid or p.get("messageType") == "Cancel" or p.get("status") != "Actual":
            continue
        crit = ev in CRITICAL or p.get("severity") == "Extreme"
        if not crit and ev not in HIGH:
            continue
        if aid in st["seen"]:
            continue
        refs = [x.get("identifier") for x in (p.get("references") or [])]
        st["seen"][aid] = now
        if any(r in st["seen"] for r in refs) and p.get("messageType") == "Update":
            continue  # an update/extension of an alert already pushed
        if not first:
            new.append((crit, p))
    st["init"] = True
    st["lastRun"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    sent = 0
    for crit, p in new:
        title = p.get("event", "NWS alert")
        body = (p.get("headline") or p.get("areaDesc") or "")[:300]
        until = p.get("ends") or p.get("expires")
        if until:
            body += "\nUntil " + ct(until) + "."
        body += "\nSource: National Weather Service. Follow official instructions."
        if not enabled or not topic:
            continue
        r = urllib.request.Request(server.rstrip("/") + "/" + topic, data=body.encode("utf-8"), method="POST", headers={
            "Title": title.encode("ascii", "ignore").decode(), "Priority": "5" if crit else "4",
            "Tags": "rotating_light" if crit else "warning", "Click": SITE + ("#severe" if crit else "#alerts")})
        try:
            urllib.request.urlopen(r, timeout=20).read()
            sent += 1
        except urllib.error.URLError as e:
            print("ntfy send failed:", type(e).__name__, file=sys.stderr)
    with open(STATE, "w") as f:
        json.dump(st, f, indent=0, sort_keys=True)
    mode = "live" if enabled and topic else "dry run (NTFY_ENABLED is not 'true' or no NTFY_TOPIC secret)"
    print(f"{len(data.get('features', []))} active NWS alert(s) in zones; {len(new)} new qualifying; sent {sent}; mode: {mode}"
          + ("; first run only records" if first else ""))


if __name__ == "__main__":
    main()
