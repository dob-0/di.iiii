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
   wakes the follower and the space's waiters, so it crosses in about a second. Trash, restore, rename and move: see
   "A project trashed, restored, renamed or moved" below.
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

5. **A new key reaches the running follow (2026-10-05).** `di follow SPACE --from … --key -` on a follow that exists
   rewrites its entry in `follows.json`; the server watches that file and now restarts the follower whenever the
   entry's remote, key, address or start changed (before: only a new direction did, so the old key stayed in use until
   the whole install restarted — 11 of 15 spaces on the owner's install). It resumes from its saved cursors, so a
   restart loses nothing. Chosen over "the CLI tells the running server" because the file is already the one place
   the CLI and the server agree on, it works when the install is down, and it needs no second route to guard.
6. **A remote is stored only when it answers as a di.iiii (2026-10-05).** `resolveBase` accepts an address only if
   `/api/health` answers JSON with `ok: true` (it asks the `/serverXR` mount twice before trying the bare address), and
   `checkFollowable` only if the op log answers as an op log. dev.diiii.xyz answers `/api/health` with its web page
   (200), which used to pass for a di.iiii, so one dropped answer stored the remote WITHOUT `/serverXR` and every stream
   said "could not read both copies". Now it is refused (`unreachable`) with nothing written.
7. **A project only the follower holds fills the host's new copy (2026-10-05).** The follow makes the missing project on
   the host from the listing, empty. Content that is not a stream of ops a follow carries (an import, a restored
   document, anything written as a whole-work op) never arrived, and the comparison then refused "the host's copy is
   empty and this one is not". A copy the follow itself just made on the host is remembered (saved in
   `follow-state`, so a restart does not forget it) and its first comparison writes this copy into it as one
   `replaceDocument`, once, with no refusal. An empty host the follow did NOT make is still refused (a host that lost its
   disk). The follow looks again at once after any such write.
8. **Space settings, host to follower (2026-10-05, `followSettings.js`).** `label`, `isPublic` and `publishedProjectId`
   (the front door) are compared each pass and every 5 s at most, and the host's are taken through this install's own
   space PATCH. Host to follower only: the host's PATCH is owner-or-admin-gated (`requireSpaceOwnerOrAdminWrite`) and a
   sync key is an editor key (SPEC_space_sync_keys.md T2), so a follower does not reach for it; the host is the order of
   the follow. `isPublic: false` wins on either side: a private host makes this copy private, a public host does NOT
   make a copy kept private public (`di follows` says so). The front door is set only onto a project that is here and not
   private (the PATCH route refuses a private one; so do we) and waits until the project arrives. A host's space PATCH
   now ends the follower's held read (it notes the space's change mark, on the approval-gated path too).
9. **Files owed after a restart (2026-10-05).** The files chase now starts right after the project lists, BEFORE the
   room's held read (it used to start after it: a restarted follow owed every unfinished file for up to 20 s, and a di
   restarted twice in that time never got to them — di.laser: 101 listed, 79 coming, 29 on the host, no line). Every
   project's document is compared with what each machine holds every 10 min for as long as the follow runs (files settled
   earlier are asked about again), half-received `.part` files from a killed install are cleared after an hour, and
   `di follows` prints "N files still coming, of M listed". Not reproduced as one single cause: a two-server restart
   already resumed on the base; the late start and the once-per-run comparison are the faults found.

Guards: `follower.test.js`, `followConverge.test.js`, `followSettings.test.js`, `index.test.js` (new key),
`assets.test.js`, `scripts/di/followRemote.test.js` (remote), `followIntegration.test.js` ("a followed space stays one
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

## A project trashed, restored, renamed or moved (2026-10-07, `followProjects.js`)

Before this a follow carried what is IN a project (its ops) and a project's birth, nothing about its life after:
a project trashed on the host stayed live here, a renamed one kept its old title here, a project moved to another
space on the host made the follow fail on it (the space's key cannot read the project in its new space: 403 every
tick). The rule the owner set on 2026-10-04 — every install follows dev, dev and local stay one — needs all four.

**Method: a base (the last agreed state), as a file synchroniser keeps one.** A follow cannot tell "trashed there"
from "made here" or "renamed there" from "renamed here" by looking at the two sides now; it needs the state they last
agreed on. This is Unison's archive (B. Pierce, J. Vouillon, "What's in Unison? A Formal Specification and Reference
Implementation of a File Synchronizer", U. Penn MS-CIS-03-36, 2004): a replica that differs from the archive changed;
one that equals it did not. The base is saved with the follow's state (`follow-state/<space>.json`, `base`): for each
project both sides held live in this space, its `title`, `slug` and `visibility` as last agreed. A follow that starts
with no base takes the projects live on both sides as its base, with the host's values (host wins, as everywhere).

**What travels, and which side wins**

| change | host to this install | this install to host | when both changed |
|---|---|---|---|
| title, slug (rename) | yes, PATCH here | yes, PATCH there (an editor may; the sync key is one) | host wins |
| project made private | yes | no — making a project private or public is the space owner's (host gate); said | private wins |
| project made public | no — never more public; said | no; said | — |
| trashed | yes, as a MOVE TO TRASH here (`DELETE /api/projects/:id`, the soft delete; 30 days to restore) | no — deleting is owner-or-admin on the host; the sync key is an editor. Said: "trashed here; the host still has it" | — |
| restored from the trash | yes, when this follow saw it trashed on both sides | no; said | — |
| moved to another space | see below | no — a move needs the owner of both spaces; said | — |

Never a hard delete: the follow only ever uses this install's own trash route, and a trashed project keeps its files
and its op log until the trash sweep (30 days). Restore it the usual way (`POST /api/projects/:id/restore`).

**The guards**

1. **A trash row, never an absence.** A project is trashed here only if the host's trash lists THAT id in THIS space
   and the project was in the base (both held it live). A project merely missing from the host's list (an empty or
   unread list, a host that lost its disk, a key that cannot see it) trashes nothing.
2. **All four lists or nothing.** Both project lists and both trashes must answer 200 with a list, or the pass carries
   no trash, no restore, no rename and no move.
3. **Never empties this copy (the "empty host" rule, extended).** A pass that would trash every live project this
   copy holds (when it holds more than one), or more than 5 at once (`MAX_TRASH_PER_PASS`, the same idea as rsync's
   `--max-delete`), trashes none. `di follows` says so ("the host trashed N projects at once — not carried; trash them
   here yourself if that was meant"), and the log says it once.
4. **Departed is never re-made.** A project in the base that is gone from one side's space without a trash row (moved
   to another space, or purged after 30 days) is marked departed: it is never made again on the other side and its op
   stream is no longer read (that read answered 403 for a moved project). Said in `di follows`, named. Live on both
   sides again, or on neither, clears it.
5. **A trash or rename that fails** keeps the old base for that project, so the next pass tries again; the refusal is
   said once.

**A project moved to another space.** The project id is global, so the host's move (`POST /api/projects/:id/move`)
keeps the id and the op log; on the host it leaves space A and appears in space B.
- **This install follows both A and B from the same host:** the follow of A marks it departed and waits; the follow of
  B finds it live on the host's B, not in this B and never paired in B, and here in A, which this install follows from
  the same host — it moves it here the same way (`POST /api/projects/:id/move`, this install's own route and its own rules: a
  project that is still A's front door here waits until the host's front door reaches A). Its stream in B then starts from now: both copies already
  hold the same ops (they were carried under A), and re-sending them past the 500-op dedupe window would apply them twice.
- **Only A is followed here:** the project is kept in A here (safe: nothing leaves the person's machine). `di follows`
  says "left this space on the host (moved, or purged from its trash) — kept here". Follow its new space, or trash it
  here, to make them one.
- **Only B is followed here, and the project is here in an unfollowed space:** not moved (that space may be a different
  space by the same name); said. Not here at all: made in B as any project only the host holds.
- **Moved on this install:** the host keeps it where it was (a sync key cannot move); both follows say so.

**Waking.** A project PATCH, trash, restore and move now wake this install's follower and release a held read on the
space (`nudgeFollow`, `noteChange`), like a project made empty does, so a change crosses in about a second instead of
waiting out a park (20 s).

Guards: `followProjects.test.js` (the rules, no I/O), `followIntegration.test.js` "a project's life crosses a follow"
(two servers, the host with auth on and a real sync key).

## Not yet (owed)

- **Keeping both people's intent** on a same-field conflict (an op-based CRDT with per-field Lamport stamps,
  Kleppmann et al., "Local-first software", 2019). Today the host's value wins.
- **One remote per space, star only.** A third install follows the host; two followers do not talk to each other.
- **Not carried:** a trash, move or visibility change made on the FOLLOWER (the host's gates are owner-or-admin; a sync
  key is an editor), a project made public again, a space trashed, shelf/collection membership, space meta other than label / isPublic / front door (host to follower only: slug, kind, preview image,
  owner and trusted users are not), follower to host settings, files placed in the room itself (not in a project).
- **No sync UI and no discovery:** peers are typed URLs (`--at <ip>` for Tailscale); `rig/discovery.js` is not
  wired to follows.
- **Saved state cost:** up to 5,000 opIds (~200 KB) rewritten after each tick that moved; fine for a room, not
  measured for a long show.
- Real-network runs still owed: large files, auth-on host with `--guests`, the internet case, and a run AFTER these
  fixes between two machines.
