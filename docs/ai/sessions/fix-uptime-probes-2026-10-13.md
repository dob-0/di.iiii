## Uptime: probe dev and yokozo, one issue on failure

- Changed `.github/workflows/uptime.yml`: added probes for https://dev.diiii.xyz/serverXR/api/health and https://yokozo.xyz/ next to the existing ones, kept `workflow_dispatch:` (already present), and added a step that opens or updates ONE issue titled "uptime: site down" with the failing targets (`issues: write`, `gh issue`; comments only on a down→down state change, never a duplicate).
- GitHub schedules are best-effort (measured 4 of 144 runs in 24 h on 10-09), so an outside monitor is still owed.
- Ledger N426.2.
