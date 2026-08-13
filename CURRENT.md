# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

No commit SHAs or branch positions below — run `npm run state` for those; see
`docs/ai/golden_rules.md` for why. Agents share this tree: **stage explicit paths**.

## Last session (2026-08-13)

- Closed the owed browser looks: PR #93 done, webcam verified (`npm run
  verify:capture`, new), mic needs Linux/hand (macOS TCC). Owner decisions
  for `open`'s card + purple-gap prepared with evidence. Full detail: `PROGRESS.md`.

## What works

Studio (six panels + phone), Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups.

## Open

- **Lane consolidation: PR #99 MERGED 2026-08-13** (reconciled with #121, CI green,
  both sides' panels seen rendering). Raw-as-default landing promotion still open —
  owner's call, MANIFESTO §6 gates it.
- **Real-browser looks owed**: only `source.mic` (macOS TCC blocks fake-device
  audio headless — `npm run verify:capture` on Linux, or 30s by hand). Webcam
  verified 2026-08-13; PR #93's items all closed (see known-fixes).
- All 8 prod spaces owned; releasing ownership keeps granted scope (deliberate).
  Mesh gate ARMED both tiers; **staging Google OAuth secret parked by the user**
  — rotation script staged, see memory `reference-leaked-secrets`.
- **No byte quota / ENOSPC pre-check anywhere** — only di-bo watches free disk.
- Owner decisions 2026-08-13: purple-gap CLOSED (reel-globe world recolored
  `#04080A`, backdrop palette guard added, DATA_WHITE the one named exception);
  `open` card = upload the honest teal frame — decided, pending staging API token
  then prod approval. Director page still unseen.
- **br_id_ge rite fixes unverified by a human** — Act III backdrop + Act V idle-motion CSS shipped live, page loads clean, but the acts are camera-gesture-gated so no automated check could actually see them render.
- **Prod room append path unproven** — record is empty by design (no backfill); the first real spoken line on di-studio.xyz/br_id_ge/field is both the proof and the room's first memory.
- **Tunnel telegram first-binding untested by any human** — needs a telegram account with NO prior @diiii111bot chat.
- Remaining trees, each with a reason: raw-ws (active session), inscription-mark / rawadmin / design-loading-unify / agents-upgrade (unmerged work — park or PR, owner's call).

## Deploy & validation — [docs/ai/known-fixes.md](docs/ai/known-fixes.md), check before any bug hunt

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts
```
