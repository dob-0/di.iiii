## 2026-10-28 — feat/di-name-2026-10-28: `di name`

- `di name` claims this install's network name after `di login`, orders its own certificate (ACME DNS-01 through the name broker's TXT endpoint), keeps it all in `~/.di/name/`, and renews below 30 days.
- `di status` gains a `name:` line; `di up` and `di autoupdate run` renew at most once a day and log one line to `~/.di/logs/name.log`.
- Code is `scripts/di/networkName.mjs` + `nameStore.mjs` (the old `name.mjs` is the `di.local` mDNS publisher); `acme-client` 5.4.0 pinned in `serverXR/package.json`.
- 29 tests against a fake broker and a fake ACME client; no real broker, Let's Encrypt or Cloudflare call was made.
- Owed: the real order (staging first), the real broker (PR 1), `di name --help` text.
