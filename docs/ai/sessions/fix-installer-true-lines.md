## 2026-09-27 — the installer's lines tell the truth

- The no-node failure in `install.sh` offered Docker Desktop, which cannot help: the di command itself
  runs on node. It now names the one way forward, Node.js 22.15 or newer (the floor `node_ok` checks).
  Run for real with no node on PATH and nodejs.org blocked: the new message prints, exit 1.
- `detect.mjs` told people "docker stays opt-in (--docker)"; no caller reads such a flag
  (`probeAll` is never given `forcedMode`). The reason no longer names it; the comment says it is a seam.
- Every "install it with" line (install.sh, install.ps1, both shims, ui.mjs, SELF_HOST.md) names
  diiii.xyz. Both hosts serve byte-identical `/get` and `/get.ps1` (sha256 checked 2026-09-27).
- Guard: `scripts/di/installLines.test.js` (8 cases, all red on the old files).
- Owed, not here: `docs/deploy/{LIVE_DEPLOY,CPANEL_*,VPS_DOCKER_DEPLOY,STUDIO_CHAT_APK}.md` still name
  di-studio.xyz as the live host in runbooks.
