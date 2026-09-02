## 2026-09-02 — both tiers send HSTS

The 2026-09-02 live walk read the response headers of `/` on prod and staging:
`X-Frame-Options`, `Referrer-Policy` and `nosniff` were there, `Strict-Transport-Security`
was not. Caddy issues the certificates but never adds that header by itself, so a
browser that has visited before still tried `http://` first on every fresh tab.

- One `header Strict-Transport-Security "max-age=31536000"` line in each site block
  of the tracked `Caddyfile`. A year, no `preload`, no `includeSubDomains` — nothing
  that could strand a future host under the domain.
- Reaches the live Caddy only on the next `main` promotion: the prod deploy workflow
  is the one that checks out `Caddyfile` and reloads Caddy; the staging block lives
  in the same file, so staging gets it at the same moment.
- A Content-Security-Policy is deliberately NOT added: published spaces are arbitrary
  HTML that pulls Leaflet, CARTO tiles, jsdelivr, Google fonts and the default draco
  decoder from third parties. A platform-wide CSP would break the works; it belongs
  per-route, decided later.
