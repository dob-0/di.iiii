## Uptime: probe dev and yokozo, one issue on failure

- Changed `.github/workflows/uptime.yml`: added probes for https://dev.diiii.xyz/serverXR/api/health and https://yokozo.xyz/ next to the existing ones, kept `workflow_dispatch:` (already present), and added a step that opens or updates ONE issue titled "uptime: site down" with the failing targets (`issues: write`, `gh issue`; comments when the state turns to down (up or unknown → down), stays quiet on down→down so one outage is one issue; a change of WHICH sites are down mid-outage is not detected, and the issue is never closed automatically — both owed).
- GitHub schedules are best-effort (measured 4 of 144 runs in 24 h on 10-09), so an outside monitor is still owed.
- Ledger N426.2.
- 2026-10-20: merged dev; the issue step now also comments when the SET of down sites changes (marker <!-- sites: ... --> in the newest issue body/comment). Probe dry-run against the 5 URLs: all up; marker parse tested locally.
