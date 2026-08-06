# Space-sync engine vendoring

`scripts/space-sync.mjs` is the one engine that syncs a repo's local pages into a
di.iiii space (Studio, staging, prod). Linked-space repos that aren't di.iiii itself —
`br_id_ge`, `beyond_form`, `platform_recordar` — each vendor a copy of it as
`scripts/sync-space.mjs`, so their own CI can run without checking out di.iiii.

**Never edit a vendored copy directly.** Change the engine here, in di.iiii, and
vendor it out — editing a downstream copy is exactly how the two documented drifts
(`docs/ai/known-fixes.md`) and the 2026-08-06 v5→v6 stall happened. All three were
invisible for the same reason: nothing was actually watching for drift in the place
that could see it.

## The commands

```bash
node scripts/space-sync-vendor.mjs              # check only; exit 1 on drift
node scripts/space-sync-vendor.mjs --write      # copy the engine over the linked repos
node scripts/space-sync-vendor.mjs --release    # write + bump minEngine + commit + push,
                                                 # per repo — npm run space:sync:release
node scripts/space-sync-vendor.mjs --release --dry-run   # preview, touches nothing
```

`--release` is the one command that actually lands a bump — `--write` alone changes
working trees only, and vendoring locally changes nothing that any CI runs.

## The guard

Both `--write` and `--release` refuse (`checkSafeSource` in `space-sync-vendor.mjs`)
unless run from:

- the **canonical checkout** — not a linked git worktree. Every worktree in this repo
  carries a full `scripts/` directory, including its own copy of this very tool; on
  2026-08-06 two of them sat next to a stale v4 engine, and running `--write` from
  either would have silently downgraded all three linked repos.
- **`dev` or `main`**, not behind `origin/dev`.
- with the **upstream engine itself committed** — an uncommitted `space-sync.mjs` is
  exactly what stalled the real v5→v6 upgrade for 15+ hours.
- and never **downgrading** a target's `ENGINE_VERSION` unless `--allow-downgrade` is
  passed explicitly.

Every refusal names the exact fix. See the test suite (`space-sync-vendor.test.js`) for
each case exercised directly, including one caught live: the guard was verified against
the real 2026-08-06 vulnerability, not just synthetic input.

## What gets vendored, per repo

`--release` writes three things to each repo in `VENDORED_REPOS`:

| File | Purpose |
|---|---|
| `scripts/sync-space.mjs` | the engine itself |
| `scripts/sync-space-check.mjs` | self-check — see below |
| `.github/workflows/vendor-check.yml` | runs the self-check in that repo's own CI |

...and bumps `di-space.space.json`'s `minEngine` to match, in the same commit.

## Where the drift check actually lives

di.iiii's own CI **cannot** catch drift in a linked repo — a runner only ever has
di.iiii checked out, so `space-sync-vendor.mjs`'s check is explicitly designed to
*skip*, not fail, a repo it can't find on disk. That's not a bug in the check; it's the
whole reason the check alone was insufficient.

The fix inverts it: **each linked repo checks itself**, in its own CI, against a fresh
fetch of di.iiii's real upstream file (`dob-0/di.iiii` is public — no token needed).
`scripts/sync-space-check.mjs` (vendored from `scripts/space-sync-selfcheck.mjs`) does
this: fetches, byte-compares, and asserts every local `di-space*.space.json`'s
`minEngine` matches. It never skips on a fetch failure — that would repeat the exact
flaw being fixed — it fails loudly instead. `vendor-check.yml` runs it on every push and
weekly (the real failure mode is an idle repo nobody pushes to for weeks while di.iiii's
engine moves on).

`br_id_ge`'s own `sync-space.yml` (the workflow that actually pushes content to
staging/prod) gates on `vendor-check` — a drifted engine must not be allowed to sync
production.

## Known exceptions

`space-sync-vendor.mjs`'s `KNOWN_EXCEPTIONS` prints on every run so these stay visible
rather than silently unmentioned:

| Repo/dir | Why it's an exception |
|---|---|
| `platform_recordar` | no git remote — local-only, so it can have no CI at all. The vendor tool still writes and reports drift; there is just no automated push-side enforcement. `platform_recordar/AGENTS.md` states this. |
| `space-starter` | a scaffold template for bootstrapping a *new* linked space, not a git repo itself. `--write`/`--release` refresh its copy so a new space isn't born already behind, but nothing commits it — there's nothing to commit to. |

## Files

`scripts/space-sync-vendor.mjs` (the tool + guard), `scripts/space-sync-selfcheck.mjs`
(source of the vendored self-check), `docs/templates/vendor-check.yml` (source of the
vendored workflow), `scripts/space-sync.test.js` (asserts di.iiii's own spaces'
`minEngine` matches `ENGINE_VERSION` exactly — no excuse for those to lag, unlike a
linked repo).
