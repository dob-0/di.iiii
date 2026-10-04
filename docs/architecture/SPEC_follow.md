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

## Not yet (owed)

- **Keeping both people's intent** on a same-field conflict (an op-based CRDT with per-field Lamport stamps,
  Kleppmann et al., "Local-first software", 2019). Today the host's value wins.
- **One remote per space, star only.** A third install follows the host; two followers do not talk to each other.
- **Not carried:** project deletion, slug renames, later visibility changes, shelf/collection membership, space
  meta, files placed in the room itself (not in a project).
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
