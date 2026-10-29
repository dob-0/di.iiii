## 2026-10-29 — The page route on the Mac tiers (languages S13a, the gate)

- Replaces: the standby's dead `client:8080` shell and sitemap addresses and the dead `/usr/share/nginx/html` alias. Nothing that worked is removed: Docker (the VPS) still reads `docker-compose.yml` unchanged; `--set SHELL_URL=…` still overrides; nginx `@shell` stays the fallback when serverXR is down.
- `scripts/standby/server-env.mjs`: `--nginx <host:port>`, refusal of any `client:8080` leftover. `scripts/standby/nginx-conf.sh`: the alias rewrite and a leftover check.
- Pairs with di-atlas `fix/standby-shell-url` (release.sh genenv passes `--nginx 127.0.0.1:$NGINX_PORT`). Merge order: di-atlas first (old server-env ignores the flag), then this; then `tools/standby-deploy.sh ops` from aylmo puts both copies on the Mac, then a dev deploy.
- Tests: `npx vitest run scripts/standby/server-env.test.js scripts/standby/nginx-conf.test.js` 10 passed; 5 failed on the origin/dev scripts.
- Rehearsal: r-di offline (tailscale "last seen 1d ago"; ssh timed out on r-di, r-di-lan, r-di-mesh), so rehearsed on aylmo (agent report `ux-fix/s13/S13a/rehearse-aylmo.txt`); real `nginx -t` not run (no nginx or docker access on aylmo): owed on r-di; the deploy's own `nginx -t` gate (release.sh step 4) still refuses a bad block.
- Proof owed after the dev deploy: `/serverXR/page/terms` 200, an unknown address 404, `/sitemap-built.xml` 200.
- Idea, not built: `renderPage` swallows the shell fetch error (`.catch(() => null)`); one log line would have named `client:8080` on day one.
