## 2026-10-05 — the secrets backup leaves this repo for di-atlas (private)

- **What.** `deploy/secrets-backup.sh` pulled production's `.env` files from the VPS, which is offline (prod runs
  on the Mac since 09-26), so the nightly timer failed every night. It was rebuilt to pull from the Mac and keep
  the encrypted bundle on aylmo and asuz, then — owner's word 10-05, "atlas" — moved to the private di-atlas repo:
  `tools/secrets-backup/` (script, units, `install.sh` / `install.sh uninstall`). This repo keeps no copy, so
  the list of production's secret file paths is no longer public.
- **Measured.** Installed unit run 10-05 15:17: 6 files, `age` to aylmo's key + di-mac's backup key, 8.0 KB,
  second copy on asuz verified by sha256, `Result=success`.
- **Limits.** asuz only over the LAN name; the Tailscale route is refused by the Tailscale SSH check.
- `docs/ai/known-fixes.md` keeps its row about the tar fix; the file it names now lives in di-atlas.
