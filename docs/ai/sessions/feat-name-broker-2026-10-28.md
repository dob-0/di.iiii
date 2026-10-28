## 2026-10-28 — the name broker: a Cloudflare Worker that gives each install its network name

- Owner: ledger N1365/N1386 ("go next the network-name sync"); PR 1 of `docs/ai/team-sync-by-network-name.md` §14. Zone `l.di-studio.xyz`, label `<who>-<4 chars>`, broker A records (lead's §15 decisions).
- Built `services/name-broker/` (worker.js, cloudflare.js, sign.js, wrangler.toml, README): claim checked once against the dev tier's `/api/auth/cli/whoami`, Ed25519-signed TXT and address writes, private addresses only, limits 3/account, 4 orders/week, 60 addresses/hour, 20 bad signatures/hour, admin revoke.
- Tests: `npx vitest run services/name-broker` 40/40 against a fake Cloudflare API and KV; `services/**` added to vitest's include. Not deployed, no real Cloudflare call.
- Open: the dev tier has no handle field, so `<who>` is the `labelHint` or the first word of the display name; KV limits are approximate under a burst; deploy is the owner's `wrangler deploy` (README).
