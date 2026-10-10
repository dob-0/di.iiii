## 2026-10-10 — a dev server no longer defaults its platform address to production

- `customDomains.platformOrigin` fell back to https://diiii.xyz on any tier. It now does so only under NODE_ENV=production; elsewhere it is empty with a startup warning, and the client then builds no editor redirect (src/utils/spaceRouting.js).
- Measured: `config.test.js` 24 passed; the 4 new tests failed on the old code (`resolvePlatformOrigin` did not exist).
- Not done here (owed): set PLATFORM_ORIGIN in the dev and installed env files (not in this repo); the Cloudflare token file (cloudflare-domains.token does not exist), a fresh foreign-owned domain measured end to end, and merging di-atlas #63 are the owner's or other repos'.
