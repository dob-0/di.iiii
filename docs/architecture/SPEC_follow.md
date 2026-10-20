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

## Not yet (owed)

- **Keeping both people's intent** on a same-field conflict (an op-based CRDT with per-field Lamport stamps,
  Kleppmann et al., "Local-first software", 2019). Today the host's value wins.
- **One remote per space, star only.** A third install follows the host; two followers do not talk to each other.
- **Not carried:** project deletion, slug renames, later visibility changes of a project, shelf/collection
  membership, space meta other than label / isPublic / front door (host to follower only: slug, kind, preview image,
  owner and trusted users are not), follower to host settings, files placed in the room itself (not in a project).
- **No discovery:** peers are typed addresses (`--at <ip>` for Tailscale); `rig/discovery.js` is not wired to
  follows. The UI is below ("The sync light and joining with four words").
- **Saved state cost:** up to 5,000 opIds (~200 KB) rewritten after each tick that moved; fine for a room, not
  measured for a long show.
- Real-network runs still owed: large files, auth-on host with `--guests`, the internet case, and a run AFTER these
  fixes between two machines.

## The sync light and joining with four words (2026-10-01)

Owner-approved sketches A + C (`/home/dob/Downloads/di-sync-ui/sketches.html`, 2026-10-01). Code: `src/sync/`
(light, panel, invite, join form), `serverXR/src/routes/followRoutes.js`, `serverXR/src/joinCodeStore.js`,
`serverXR/src/follow/{join,syncStatus}.js`.

### A. The light

- In the space's bar (`SurfaceBar`) whenever the bar knows a space. It is drawn only when this install follows the
  space or has been called in on by a follower; otherwise it renders nothing, and a visitor is told nothing.
- Facts come from `GET /api/spaces/:spaceId/sync`; the words are made in the browser by `src/sync/syncLight.js`.
  Follower: `SYNCED · PONYO · 0.1 S`, `PONYO NOT ANSWERING · 2 MIN`, `SYNCING · PONYO · 3 FILES COMING`,
  `2 FILES FAILED · PONYO`, `CONNECTING · PONYO`, `PONYO REFUSED THIS MACHINE` (a revoked key), `PONYO · NEEDS A LOOK`.
  **"SYNCED" is said in exactly one case** — the host answered, no file is pending or failed, the follower is
  `following`, and nothing is in `lastError`. `syncLight.test.js` walks all 1,152 combinations of those inputs.
  Host: `SHARED · NAME · LIVE` / `NAME NOT ANSWERING · 2 MIN`. The host cannot know about files or clashes, so it
  never says "synced".
- What "answered" and "0.1 S" mean (follower.js): the host answered when any HTTP response came back from the small
  project-list read each tick makes; the speed is that read's round trip. A parked read's duration is the room's
  quiet, not the wire, and is never used. State is published before a parked read as well as after the tick, so a
  quiet room is not "connecting" for the 20 s of the park. A refusal (401/403) is "refused", not "not answering".
- The host hears a follower through the machine link (`POST /machines/sync`, every ~3 s; `hub.noteFollower` keeps
  name and last-seen, never on a guest's word). It is in memory: a host restart forgets followers until they call in.
- "Clashes today" is the follower's `converged` count — each is a time the host's version was kept — counted from
  `convergedAt` timestamps (last 100) on the viewer's calendar day. Held in memory; a restart starts it again.
- Access: the space's owner or an admin when auth is on (the sync-key routes' rule); with auth off, only the person
  at the machine (loopback or one of the machine's own addresses, never through a proxy header) — every caller is
  the "admin" sentinel there and these routes name other machines. A key never appears in the response.
- Phone (390 px): the chip takes a second row of the bar, 44 px tall; the bar keeps `--sbar-h` equal to its real
  height while it is there, so what sits under it still clears.

### C. Join with four words

- **Invite a machine** (`POST /api/spaces/:spaceId/join-codes`, owner/admin): four words from `joinCodeWords.js`
  (EFF Short Wordlist #1, CC BY, 1,257 words after our cuts, 41.2 bits). Valid 10 minutes, one space, single use,
  revocable (`DELETE .../join-codes/:id`). A space has one live code: a new one revokes the unused old one.
  Offered under the light and on the space's card in the Manage row (so the first invite has a door before
  anything is shared).
- **Storage:** only `sha256("di.join-code.v1:" + words)` is stored (table `space_join_codes`), never the words and
  never a key. **The key is minted when the code is redeemed**, by `syncKeyStore.mintSyncKey` with the same owner and
  the same 1-year ttl as `POST /sync-keys`, and is returned in that one response. A code nobody uses never becomes a
  credential. After use the key is the existing thing: `di invite --revoke` or `DELETE .../sync-keys/:id` ends it.
- **The door** is two anonymous routes (`/api/join-codes/peek`, `/redeem`) registered before the blanket write gate.
  Wrong, used, expired and revoked answer the same 404. Guesses are counted in `joinCodeStore.createAttemptLimiter`
  (8 wrong per client per 10 min, 60 overall) and are **not** exempt on a local install, where `rateLimit.js` counts
  nobody — joinIntegration.test.js proves a `DI_LOCAL=1` host still answers 429.
- **Join** (`POST /api/follows/join/preview`, `/join`, install admin): this install's server reaches the host
  (`follow/join.js`) — a browser cannot (https vs http). Refusals before the code is spent: unreachable, wrong code,
  itself (machine id), space already followed, same-named space here (needs `into: true`). Then spend, check the key
  reads the space, make the space, write `follows.json`; the running install starts the follower at once.
- Limits: with four words the code is a hand-over between two people in a room, not a password; the two machines
  still have to reach each other (same network or Tailscale). The server makes an outbound request to an address an
  admin typed (as `di follow` does from the CLI).

### Measured

- Two real installs on loopback (`joinIntegration.test.js`, 2026-10-01): join to `SYNCED` in ~150 ms; host
  round trip 2-3 ms, shown as "<0.1 S". Real Tailscale numbers are owed — the 2026-10-01 aylmo<->ponyo run
  (above) measured 109-877 ms for edits, which this light does not claim to reproduce.

### Not done (owed)

- The sketch's QR code (needs a QR library; `qrcode-generator`, MIT, is the candidate).
- The sketch's "2.5 GB" in Join's "found" line (the size of a space is not computed anywhere cheap).
- Host side: no per-follower "stop sharing" button (use `di invite --revoke`), and no list of past joins.
- The sketch's "Edits made here wait and cross … Nothing is lost" is true while the host's op log still holds the
  gap; a follower offline past the retained window is resynced by the converge pass, and no warning says so yet.
