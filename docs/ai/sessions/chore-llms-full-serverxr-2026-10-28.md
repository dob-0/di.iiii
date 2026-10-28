## 2026-10-28 — serverXR serves /llms-full.txt itself when there is no nginx

- An install without nginx (laptop, r-di) answered 404 for /llms-full.txt; serverXR now serves the built file from the install's web root (`fullFile`, passed by index.js from CLIENT_DIR). Ledger N1383.
- No built file: the same plain-text 404 naming /llms.txt. nginx still answers first on dev and prod.
- Catalogue entry for GET /llms-full.txt reworded; two new tests in aiPublic.test.js.
- Not tested: a real install without nginx.
