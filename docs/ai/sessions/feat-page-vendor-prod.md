## Production, asked for twice

`page-vendor-cdn.mjs` had no prod entry at all — "production data moves on the owner's
word, never from here". The word came ("go prod"), so prod is a tier now, on the terms
`tier-sync.mjs` already set: you have to ask twice. `--tier prod` alone is refused; it
needs `--allow-production` beside it, and an `--api` that resolves to di-studio.xyz by any
spelling needs the same flag. A dry-run needs it too — reading is free, but the printed
diff is what someone acts on.

Everything else about the tool is unchanged and is what makes this safe: the rewrite only
touches URLs it has a vendored file for, `--apply` asks the target's own origin for every
one of those files first and writes nothing if one 404s, and the original of every project
written is saved under `~/di-backups/page-vendor-cdn/<tier>/` for `--restore`.

Verified: 28 tests in `scripts/page-vendor-cdn.test.js` (three rewritten — they had pinned
"there is no prod tier"), eslint clean.
