# Family Threat Picture: closed-app alerts

The public site is served from the `gh-pages` branch (https://polk-spec.github.io/threat-picture/).
This `alerts` branch holds only a scheduled GitHub Actions workflow that checks the National Weather Service
for the St. Louis Metro East (St. Clair County, IL; St. Louis City and County, MO) every few minutes and pushes
new critical warnings to a private ntfy channel. The channel name is a repository secret and never appears here.

- Free: GitHub Actions on a public repository plus the free ntfy.sh service. No accounts or keys besides the secret.
- Off by default: nothing is sent unless the repository variable `NTFY_ENABLED` is `true`.
- Best effort: GitHub may delay scheduled runs. Keep Wireless Emergency Alerts and a NOAA Weather Radio on.
