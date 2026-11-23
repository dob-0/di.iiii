# fix/address-guard-2026-11-22 — a check for every public address, before and after a change (2026-11-22)

Base `origin/dev`. Made on studio-mac (`~/work/di.iiii-address-guard`), pushed from aylmo (lint needs node_modules).

## Why

2026-11-22: di-studio.xyz pages were forwarded to diiii.xyz with a Cloudflare 301 while GitHub/Google sign-in still returned to
di-studio.xyz/serverXR. The session cookie is host-only, so sign-in ended as Guest and Taron's push got 401. The forward was removed,
but his browser kept the cached 301. Owner: "make that we change something and nothing will broke from back".

## What

- `scripts/address-guard.mjs` (`npm run address-guard`): per name in `scripts/address-guard.names.json` checks API health, `/get`,
  that each sign-in start returns to the host the page lives on, and that no page jumps cross-host with a permanent 301/308 unless
  marked `settled`. `www.` names are `aliasOf` their apex. Read-only, one name at a time, waits on 429. Exit 1 on any problem.
- `scripts/address-guard.test.mjs` (`node --test`): 7 tests, including the 11-22 case.
- `docs/ai/known-fixes.md`: the 11-22 entry.

## Validation

- `node --test scripts/address-guard.test.mjs`: pass 7, fail 0.
- Live run 2026-11-22 18:5x: fails on diiii.xyz only, "github sign-in returns to di-studio.xyz but the page lives on diiii.xyz" (and google),
  which is the real open bug; the domain chat owns moving the callbacks.

## Open

- Callbacks, cookie host and env to diiii.xyz (domain chat; needs the owner's GitHub login + Google 2-step).
- Wire the guard into the deploy workflows after the callbacks move (it fails today, by design).
