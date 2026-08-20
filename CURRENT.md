# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

No commit SHAs or branch positions below — run `npm run state` for those; see
`docs/ai/golden_rules.md` for why. Agents share this tree: **stage explicit paths**.

## Last session

- What this branch does

Full detail: `PROGRESS.md`.

## What works

Studio (six panels + phone), Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups.

## Open

- Raw-as-default landing promotion still open — owner's call, MANIFESTO §6 gates it.
- **Staging Google OAuth secret parked by the user** — rotation script staged, see memory
  `reference-leaked-secrets`. Prod spaces all owned; mesh gate ARMED both tiers.
- Per-space byte QUOTA still unset — needs an owner policy number (ENOSPC floor shipped).
- Deps parked: eslint-10 #148, router-7 #150, checkout-7 #143 (its windows install-test fails).
- `open` card = upload the honest teal frame — pending staging API token then prod
  approval. Director page still unseen.
- **br_id_ge rite fixes unverified by a human** — Act III backdrop + Act V idle-motion CSS shipped live and the page loads clean, but the acts are camera-gesture-gated so no automated check can see them render.
- **Prod room append path unproven** — record is empty by design (no backfill); the first real spoken line on di-studio.xyz/br_id_ge/field is both the proof and the room's first memory.
- **Tunnel telegram first-binding untested by any human** — needs a telegram account with NO prior @diiii111bot chat.
- **`httpContracts.test.js` is flaky and is 30–51s of the ~97s suite** — 429/Retry-After
  red-then-green on identical runs. Re-run before believing a red; serverXR's, and the next
  velocity item. `npm run test:raw` (~21s) is the Raw loop, never the gate.
- **A green PR goes BEHIND — not CONFLICTING — the moment dev lands**; `gh` calls both "not
  mergeable". Two agents in flight need a window: memory `feedback-coordinate-with-peer-agents`.
- Trees unmerged/dirty (`npm run state`) and **`stash@{0}` = the parallel audit session's
  CURRENT.md pre-write**, partly stale — both owner's call, don't clear blind.

## Deploy & validation — [docs/ai/known-fixes.md](docs/ai/known-fixes.md), check before any bug hunt

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts
```
