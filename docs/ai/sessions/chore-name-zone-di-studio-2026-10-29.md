## Network-name zone moves to l.di-studio.xyz (2026-10-29)

- Owner N1418.10/.11: thedi.studio is on GoDaddy nameservers, not Cloudflare, so `l.thedi.studio` cannot be served; zone is now `l.di-studio.xyz`, broker `name.di-studio.xyz`.
- Changed defaults (`nameResolve.mjs`, `networkName.mjs`, `nameResolver.js`, `wrangler.toml`), tests, README, SPEC_follow, wiki line and the design doc; `local.thedi.studio` untouched.
- Design doc §15 records the owed move back to thedi.studio (GoDaddy nameserver step) and Opus R20's note with its mitigation (name guard, zone-scoped token).
- Tests: vitest on name-broker, scripts/di, src/wiki, serverXR/src/follow, plus src/landing and wifiDoor; lint, docs checks.
- Open: a real claim against the deployed broker (the lead does it).
