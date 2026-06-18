# Sync Request — Work Process

**Status:** open — waiting on upstream (`dob-0`) to review and sync.

**From:** `emilyanikoghosyan/di.iiii` (fork) · Emily / thedi.studio · info@thedi.studio
**To:** `dob-0/di.iiii` (primary public repo) and its maintaining agent
**Date:** 2026-06-18

---

## Why this file exists

This is a **ping to dob (and dob's agent)** to sync the working process between
this fork and upstream. The fork has been set up to develop locally on Windows,
and one real fix was needed before `npm run dev` would run here. We want that —
and the day-to-day workflow — reviewed and synced upstream so both sides stay
aligned.

Please read this, then sync / merge as appropriate.

## What is in this branch (`sync/workprocess`)

1. **Fix: `scripts/dev-stack.mjs` fails on Windows + Node 24.**
   `spawnProcess` spawned `npm.cmd` without `shell: true`. Recent Node releases
   refuse to spawn `.cmd` files directly and throw `spawn EINVAL`, so
   `npm run dev` never started the client. Added
   `shell: process.platform === 'win32'`. This is the only code change and it is
   safe on non-Windows (the flag is false there).

2. **This document** describing the sync request.

> Not committed (intentionally, all gitignored): local `serverXR/.env` +
> `serverXR/.env.local`, and `dev-stack.log`. These are per-machine only.

## Local work process being proposed for sync

This is how the fork is being run locally; confirm it matches upstream's
intended flow, or tell us what to change:

| Step | Command | Notes |
| --- | --- | --- |
| Install | `npm install` + `npm --prefix serverXR install` | Node 24 works; engines say 22.x |
| Local env | create `serverXR/.env` from `.env.example` | gitignored; `REQUIRE_AUTH=false` for local browsing |
| Run | `npm run dev` | starts serverXR (`:4000`) + Vite client (`:5173`) |
| Validate | `npm run lint && npm run build && npm run test -- --run` | before any push |
| Branch flow | work on `dev` → promote to `main` | per README / CURRENT.md |

## The ask

- [ ] dob / dob's agent reviews the `dev-stack.mjs` Windows fix and merges it
      upstream if acceptable.
- [ ] Confirm the local run/branch/validate process above is the canonical one,
      or send corrections so the fork can mirror it.
- [ ] Agree on how this fork stays synced with `dob-0/di.iiii` going forward
      (regular `upstream` pulls, PRs back, or a mirror schedule).

## How to reach this work

- Fork branch: `sync/workprocess` on `https://github.com/emilyanikoghosyan/di.iiii`
- Open a PR into `dob-0/di.iiii` to bring it to upstream's attention.

_Delete this file once the work process is synced and agreed._
