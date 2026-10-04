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
- A read parks on the other side for up to 20 s (`?wait=`), so a quiet space costs one held request and an edit
  arrives as soon as it lands. A local edit wakes the loop at once.
- Both wakes are **latched**, so one that comes between a tick's reads and its park is not lost (2026-10-04). A
  local `wake()` that comes mid-tick keeps that tick from parking. The park carries the space's change mark
  (`&mark=`, from the last answer's `changeMark`), and the host answers at once if the space (scene or any
  project) was written since. This is the same rule as a blocking query's index (Consul `?index=`). Before this,
  the edit made right after another had crossed waited the whole 20 s, in both directions.

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
   - **Safety, follower ahead (2026-10-04, audit F4):** when the copies differ and this copy holds entities, nodes,
     assets (or scene objects) the host lacks, nothing is written. `di follows` shows `lastError` ("this copy holds
     3 entities, 1 asset the host lacks — not overwriting it. Choose: di follow SPACE --take-host or --take-mine"),
     the log carries a `warn` naming the project and the counts, and the refusal stays said until that stream agrees.
     The person answers with `di follow SPACE --from … --take-host` (the host wins; a restore point is taken on this
     install first) or `--take-mine` (this copy is written to the host; a restore point is taken on the host first).
     Both ride the receiving server's own write route, which always takes a restore point for a whole-work op
     (reason `before-whole-replace-op`); the follower logs the newest restore point id when it can read it. The
     direction is saved in `follows.json`, applies to each stream's first comparison only, and is then cleared.
   - The same check bootstraps a follower whose history is older than the host's retained window.
3. **A project made on either side appears on both, even empty.** Each tick the follower compares the two project
   lists and makes a missing project on the side that lacks it, through that side's own `POST /spaces/:id/projects`
   with the same id, the title as made, and private when private at the source. An empty project (version 0, no ops)
   has no ops to carry it, so before 2026-10-04 it never left the machine it was made on. Making a project also
   wakes the follower and the space's waiters, so it crosses in about a second. Deletion is still not carried.
3. **A restart resumes where it was.** Cursors and the carried opIds are saved to
   `DATA_ROOT/follow-state/<space>.json` (temp file + rename) and reloaded; an old edit is never re-sent past the
   receiver's 500-op dedupe window and applied twice. A saved cursor past the end of a log (a rebuilt install)
   is reset.
4. **A first start begins from now (2026-10-04, audit F4).** A follow with no saved state used to start both cursors
   at null, reading each side's whole log: this install's history was replayed onto the host and the host's onto
   this one (measured need: `moxir` 876 / 2378 ops already on dev). Now each stream (the scene and every project
   that exists on BOTH sides at that moment) starts at the latest version on both sides, nothing from the past is
   replayed, and the two documents are compared once. `di follow … --from-now` says it out loud (it is the
   default); `--replay` is the old start, for history the other side has never seen. A project on one side only
   still replays from the start — its history is new to the other side. Limit: decided at the first tick, so a
   follow that crashed before saving state starts from now again (no harm: the comparison still protects).

Guards: `follower.test.js`, `followConverge.test.js`, `followIntegration.test.js` ("a followed space stays one
space"; "a follow starts from now and never silently erases work only the follower has") — each fails without its fix.

## Measured

- Loopback, two real servers (PROGRESS.md): ~25 ms host→follower, ~97 ms follower→host.
- Through an 80 ms-each-way delay proxy, follow running inside the following server, edits alternating as soon as
  the last one landed (2026-10-04, `followIntegration.test.js` "edit after edit"): before the latches every crossing
  but the first 20.7–21.1 s, after 745–1090 ms. Not yet re-measured on aylmo ↔ dev.diiii.xyz.
- aylmo (Arch, follower, 0.4.16-rigbuilder.14) ↔ ponyo (Windows, host, 0.4.16-connect.4) over Tailscale, 2026-10-01,
  space `sync-test-1001`: 3 edits each way through the API, aylmo→ponyo 202 / 877 / 109 ms, ponyo→aylmo 135 / 128 /
  119 ms; both ended at version 8 with the same 8 entities. One < 8 s "not answering" blip, self-recovered, cause
  not known. Measured before the 2026-10-01 fixes.

## Whole-work ops (done 2026-10-04)

A `replaceDocument` / `replaceScene` is never carried (a follow carries edits; replacing the whole work is `di sync`).
The cursor steps over such an op like any op it has accounted for, with or without an opId (older logs have ops with
none). When one is seen, the follower compares the two copies: equal, and nothing is said; different, and
`di follows` names the stream (`project:<id>`) and says so until they agree. Nothing is overwritten; the host-wins
converge rule above is unchanged. Measured: `followIntegration.test.js` (two servers), both ways, edits cross
in under 5 s past a whole-work op and the error clears. Not covered: the `PUT /api/projects/:id/document` route does
not wake a follow, so a replacement made there is noticed at the next park end (up to 20 s).

## Not yet (owed)

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
