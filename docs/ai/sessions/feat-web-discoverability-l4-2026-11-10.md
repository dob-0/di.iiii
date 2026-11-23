## 2026-11-10 — di-studio.xyz pages move to diiii.xyz with a 301; the install scripts and the API stay

- nginx.conf: a `map` on `$host$request_uri` sends every page on di-studio.xyz (and www.di-studio.xyz) to the same path on diiii.xyz with a 301, so the old host's links and search rank move to the one address.
- Never redirected, because a redirect would break them: the install scripts (`/get`, `/get.sh`, `/get.ps1`, with or without a query; `curl … | sh` does not follow a 301) and `/serverXR` (bare, or with a path or a query).
- serverXR/src/routes/ogRoutes.js: the Organization JSON-LD names di.iiii and links its Instagram.
- src/legacyHostRedirect.test.js: 4 tests — the map and the 301 exist; pages and robots/sitemap go to the same path on diiii.xyz; the API and other hosts are left alone; the install script paths are never redirected.
- Not done here: nginx itself was not run on this machine (no `nginx -t`); the redirect takes effect only after the next deploy to prod.
