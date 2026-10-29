## 2026-10-29 — The page route on the Mac tiers (languages S13a, the gate)

- Replaces: the standby's dead `client:8080` shell and sitemap addresses and the dead `/usr/share/nginx/html` alias. Nothing that worked is removed: Docker (the VPS) still reads `docker-compose.yml` unchanged; `--set SHELL_URL=…` still overrides; nginx `@shell` stays the fallback when serverXR is down.
- `scripts/standby/server-env.mjs`: `--nginx <host:port>`, refusal of any `client:8080` leftover. `scripts/standby/nginx-conf.sh`: the alias rewrite and a leftover check.
- Pairs with di-atlas `fix/standby-shell-url` (release.sh genenv passes `--nginx 127.0.0.1:$NGINX_PORT`). Merge order: di-atlas first (old server-env ignores the flag), then this; then `tools/standby-deploy.sh ops` from aylmo puts both copies on the Mac, then a dev deploy.
- Tests: `npx vitest run scripts/standby/server-env.test.js scripts/standby/nginx-conf.test.js` 11 passed; 5 failed on the origin/dev scripts.
- Rehearsal, scripts (2026-10-29 16:4x): r-di offline (tailscale "offline, last seen 1d ago"; `ssh r-di` timed out), so rehearsed on aylmo (agent report `ux-fix/s13/S13a/rehearse-aylmo.txt`).
- Rehearsal, real nginx: nginx 1.31.6 (the Mac's pinned Homebrew version, `instance.sh:21`) built from nginx.org source, signature checked, on aylmo: old and new `nginx-conf.sh` both pass their own `nginx -t`; the new block served on a scratch port answered SHELL_URL 200 (static `index.html`, never the upstream), `/sitemap-built.xml` 200 (the old block's alias points at `/usr/share/nginx/html`), `/terms` reached the upstream as `/serverXR/page/terms` (agent report `ux-fix/s13/S13a/rehearse-nginx-aylmo.txt`).
- Owed, the owner's gate: the same two scripts on r-di (`rehearse.sh`, `rehearse-nginx.sh`) once r-di is back on (aarch64 Debian); no merge before it, by the rule "Rehearse on r-di, then the Mac".
- The leftover refusal matches only the host `client` (`//client:8080`), so a name like `myclient:8080` passes.
- Proof owed after the dev deploy: `/serverXR/page/terms` 200, an unknown address 404, `/sitemap-built.xml` 200.
- Idea, not built: `renderPage` swallows the shell fetch error (`.catch(() => null)`); one log line would have named `client:8080` on day one.
