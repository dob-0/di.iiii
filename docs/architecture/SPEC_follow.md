# A followed space — one work on two di.iiii

`di invite <space>` on one install, `di follow <space> --from <url> --key …` on another: from then on the space,
its room and every project in it live on both machines, and an edit made on either appears on the other. This is
the op-level, two-way sync that `THREE_DISTANCES.md` "The sync door" asks for. The file-level parts are
`SPEC_follow_files.md`; the key is `SPEC_space_sync_keys.md`; `SPEC_di_sync.md` is the separate, read-only audit.

Code: `serverXR/src/follow/` — `follower.js` (the loop), `followPlan.js` (what to carry), `followConverge.js`
(when copies disagree), `streams.js`, `assets.js` (files), `followStore.js` (follows.json + saved state),
`index.js` (wiring). CLI: `scripts/di/{follow,follows,share}.mjs`.

## How it works

- Each side keeps the whole work on its own disk. What crosses is the **op log**, per stream (the room's log and
  each project's), over plain HTTP, both ways, by the follower. The follower does all the reaching, so only the
  HOST has to be reachable — a follower behind a firewall or NAT still syncs both ways.
- Every op has an `opId`; a write route drops ops whose opId it already holds, so an op returning to where it came
  from is a no-op. A write states its `baseVersion`; if the target moved it answers 409 and the follower comes
  back next tick.
- A read parks on the other side for up to 20 s (`?wait=`), so a quiet room costs one held request and an edit
  arrives as soon as it lands. A local edit wakes the loop at once.

## What a follow guarantees (2026-10-01)

1. **Nothing is lost in a race.** A write refused with 409 marks nothing as carried; the edits that caused the
   refusal travel the other way on the next tick (known-fixes: "An edit made on one machine at the exact moment…").
2. **The two copies end up showing the same thing.** When both sides edit the same field at the same moment they
   apply the two edits in different orders. The **host's order is the order**: once a stream is quiet after both
   sides moved (and once when a follow starts), the follower compares the two copies — everything but each
   install's own version counter, timestamps and filled-in asset URLs — and if they differ writes the host's copy
   over its own as one `replaceDocument` / `replaceScene`, through its own write route (version check, a restore
   point before the change, broadcast to open browsers). This is the server-ordered rule of Figma's multiplayer
   (E. Wallace, "How Figma's multiplayer technology works", 2019).
   - **Cost:** of two edits to the same thing at the same moment, the follower's is undone. Edits to different
     things are never touched.
   - **Safety:** a full copy is never overwritten by an empty host — the follow says so in `di follows` instead.
   - The same check bootstraps a follower whose history is older than the host's retained window.
3. **A restart resumes where it was.** Cursors and the carried opIds are saved to
   `DATA_ROOT/follow-state/<space>.json` (temp file + rename) and reloaded; an old edit is never re-sent past the
   receiver's 500-op dedupe window and applied twice. A saved cursor past the end of a log (a rebuilt install)
   is reset.

Guards: `follower.test.js`, `followConverge.test.js`, `followIntegration.test.js` ("a followed space stays one
space") — each fails without its fix.

## Measured

- Loopback, two real servers (PROGRESS.md): ~25 ms host→follower, ~97 ms follower→host.
- aylmo (Arch, follower, 0.4.16-rigbuilder.14) ↔ ponyo (Windows, host, 0.4.16-connect.4) over Tailscale, 2026-10-01,
  space `sync-test-1001`: 3 edits each way through the API, aylmo→ponyo 202 / 877 / 109 ms, ponyo→aylmo 135 / 128 /
  119 ms; both ended at version 8 with the same 8 entities. One < 8 s "not answering" blip, self-recovered, cause
  not known. Measured before the 2026-10-01 fixes.

- **The internet case, 2026-10-04** — aylmo (follower, 0.4.16-dev.fc83b198, local.thedi.studio) ↔ dev.diiii.xyz (host, the same
  commit), space `hayfilm`, after the 2026-10-01 fixes. Start: the follower's history went up (out 313), dev's came down (in 73),
  two projects converged to the host's copy; all four shared projects then hash the same on both sides. One edit each way on
  `hayfilm-moct-2026-10-09`'s To do list (a row added on aylmo, removed on dev), three runs: aylmo→dev **652 / 21,389 / 21,482 ms**,
  dev→aylmo **20,789 / 20,676 / 20,697 ms**. ~21 s is the room log's 20 s park: a project edit on either side waits for the park to
  end. Neither a local edit (spec above: "wakes the loop at once") nor a host project edit cuts it short while it is parked. Owed below.
  Probe script: the session note `docs/ai/sessions/docs-follow-measured-dev-2026-10-04.md`.

## Not yet (owed)

- **A parked follow does not wake.** Measured 2026-10-04 (above): ~21 s per edit in both directions once the loop parks on the room
  log. The fix to look at: a local edit aborts the parked read; the host's park also returns on any project op in the space.
- **An empty project does not travel.** Projects with no ops (version 0) stayed on the follower only (six empty room projects in
  `hayfilm`, 2026-10-04).

- **Keeping both people's intent** on a same-field conflict (an op-based CRDT with per-field Lamport stamps,
  Kleppmann et al., "Local-first software", 2019). Today the host's value wins.
- **One remote per space, star only.** A third install follows the host; two followers do not talk to each other.
- **Not carried:** project deletion, slug renames, later visibility changes, shelf/collection membership, space
  meta, files placed in the room itself (not in a project).
- **No sync UI and no discovery:** peers are typed URLs (`--at <ip>` for Tailscale); `rig/discovery.js` is not
  wired to follows.
- **Saved state cost:** up to 5,000 opIds (~200 KB) rewritten after each tick that moved; fine for a room, not
  measured for a long show.
- Real-network runs still owed: large files, auth-on host with `--guests`, the internet case, and a run AFTER these
  fixes between two machines.
