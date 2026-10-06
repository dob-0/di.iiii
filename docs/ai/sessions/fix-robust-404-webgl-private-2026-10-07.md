## 2026-10-07 — failed assets never cached; no-WebGL message; private spaces don't leak names

- P16: nginx `add_header Cache-Control ... immutable always` stamped 404s too. Now `map $status $dii_immutable_cc` (4xx/5xx = no-store). serverXR on a `di` install answers a missing /assets/* with 404 + no-store. Client: `vite:preloadError` triggers one guarded reload (src/utils/preloadRecovery.js). Deploy: the client image (nginx.conf) must be rebuilt on dev/prod; nothing live was touched.
