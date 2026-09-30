# MOXIR light scenes UI - two sketches, one data model (2026-09-30)

Sketch: `sketch.html` (static, inline, 2D canvas only, no WebGL). Tabs A and B; nothing about people (no names, roles, audit, proposals; option C is dropped). Rectangles only (2 px), targets >= 44 px, keyboard reachable, strobe preview capped at 3 Hz and off under reduced motion. Mock scenes are the five real cues of `moxir-2026-10-17-minimal-cut-movers.show.json` (12+16+16+12+4 = 60 s).
Demo buttons at the bottom: CHANGE THERE (edits the other copy), GO OFFLINE / COME BACK ONLINE. The page starts with all four marks visible: same, changed here (Red room), changed there (Slow sweep), changed on both (White cathedral).
Seen headless (Playwright, GPU/WebGL off) at 390 and 1440, both tabs, sync flow clicked through (keep both, offline, sync now): no page errors, no horizontal scroll, no control under 44 px (timeline cue blocks excepted, they have full-size list rows beside them). NOT yet seen on the owner's phone or screen (rule 3 owed). Pointer drag on the timeline was coded, not exercised.

## A and B are one data model
A scene = one look + its cue timing = one entry of the project document's cue list (`mappingState.cues`: `{name, lightLook:'rig-<look>', fade, hold}` plus `rigLooks`), four look parameters (intensity, colour, speed, strobe). The deck (A) and the timeline (B) read and write the same list through the same ops; B is a view over A's data (it adds only a retime, which edits `hold` of two neighbours so the loop stays 60 s). Playback stays `showClock.js` (wall clock, no desk on hosted tiers). Build A first; B is a second view on it. Owed: the four parameters are not fields yet (§ RIG_BUILD 11.4/15.3 has `levels` per group only); DMX channel lists (§9) are missing, so the desk gets no values yet. Strobe needs a photosensitivity review (<= 3 flashes/s in any preview, WCAG 2.3.1).
- Option A: S-M on top of the fields. Option B on top of A: M (timeline drawing, drag + keyboard, retime as one write).
- Undo = field-level inverse of the last change here; restore last good = a named snapshot of the cues + looks, one batch op.

## Sync between two organizers ("here" and "there")
Owner's need: a second organizer runs the same night from their own copy on their own install, sometimes offline. Unit of sync = the scene, never the whole show. Never overwrite silently.

### 1. What exists today, to reuse
- `docs/architecture/SPEC_di_sync.md`: `di sync` is a directional mirror with a mandatory diff that refuses what it cannot prove. Two facts it states: scene ops have no inverse (no op-level three-way merge) and `version` is a per-install counter with no origin. Its ledger `~/.di/data/sync/<remote>/<space>.json` (installId, cursors, opIdsSent/Received, assetIdRemap) is the right home for a per-scene last-synced record. `--push/--pull` over ops and `--replace-*` over bundles are later PRs: not built.
- `docs/architecture/SPEC_follow_files.md`: Follow carries a space between installs including files, hash-pinned (bytes must hash to the id, `422` otherwise) with a stated permission rule. Reuse its hashing and its "refuse rather than guess" reporting.
- Op log (memory `reference_dii_op_log_is_upstream`): clients rebuild by replaying `/ops?since=0`; a change that is not an op is invisible. So a synced scene must arrive as real ops at the current `baseVersion`, not a document write.
- Memory `feedback_sync_direction_is_per_project` and `reference_dii_sync_desk`: `documentVersion` is a per-tier counter and `updatedAt` is stamped by the receiving side, so neither can say which side is newer (measured 2026-09-03: prod was ahead of staging on two pages). The only reliable test is comparing content. The sync desk and `tier-sync` already compare body hashes; `tier-sync --changed` keeps a baseline file (`--rebuild-baseline`), i.e. the same last-agreed idea at project level.
- `scripts/space-bundle.mjs` and the `.diiii` file (LIGHTING_SHOW_PORTABILITY.md): a whole space, projects included, travels as a file (bundle v2, secrets stripped, `--force` keeps what the file lacks). That is the carried-on-a-stick route, but at whole-space granularity.
- `show-cues.mjs` / `show-clock.mjs`: the exact op shape for writing cues (`setMappingState`, `baseVersion`, `opId`).

### 2. The smallest design that fits
- Per scene, a content hash: SHA-256 (the sketch uses a short FNV only as a stand-in) over a canonical form of {name, hold, fade, look id, the four parameters, the look's own data}. No timestamps, no counters.
- Each side stores per scene: `base` = the hash both sides agreed at the last sync (last common ancestor). It is stored on both sides, in the sync ledger, keyed by scene id (ids are minted once and never reused).
- Three-way decision per scene, from (here hash h, there hash t, base a): h == t: same (advance base). t == a, h != a: changed here (send). h == a, t != a: changed there (take, restore point first). all three differ: changed on both, stop and ask. Actions: take theirs (restore point first, then apply their scene as ops), keep mine (their side gets mine), keep both (theirs becomes a labelled copy, `<name> (there <time>)`, kept outside the loop so the 60 s does not change; mine stays; both sides then hold both).
- New scene on one side = "changed here/there" with no base. A scene deleted on one side and changed on the other is "changed on both" (asked, never dropped).
- Offline: changes are kept here as ordinary ops; the "waiting to send" list is just the scenes whose hash differs from base. Nothing is queued separately. On reconnect the compare runs again from the current hashes, so a queue can never go stale. The UI says so in words: "Offline. Changes are kept here and will sync when the other copy is reachable."
- Network vs file: with a network, each install exchanges {scene id, hash} lists first (a few hundred bytes), then only the scenes that differ. With no network, a carried file holds the scenes plus their hashes and the base hashes it was made from; reading it runs the same compare. It changes nothing until the person acts (sketch: SYNC FROM A FILE). Same code both ways; only the transport differs.
- Guards: restore point before any take-theirs (the sketch keeps "restore before sync"); a synced retime can change the loop length, so the timeline says "loop is N s, not 60" instead of hiding it; assets a scene points to are chased by hash (Follow's route).

### 3. What is missing
1. A per-scene hash and canonical form (does not exist; today's hashes are per project body). Per-scene ids that are stable across installs.
2. The last-synced base per scene in the ledger (the ledger has cursors and opIds, no per-scene base); `di sync --push/--pull` for ops is not built, and tier sync does not carry a light show at all (LIGHTING_SHOW_PORTABILITY, owed item 4).
3. A sync route between two installs (each is a local install, usually not reachable from the other; needs a hosted rendezvous or a tailnet peer, and the trust/keys rule of SPEC_space_sync_keys.md).
4. A carried file at scene granularity (the `.diiii` bundle is whole space; needs a "scenes" export with hashes and base).
5. The four scene parameters as document fields, and the DMX channel lists; strobe safety review.
6. Ops from the other organizer carry no origin; the decision does not need one (it uses hashes), but a display line "changed there" needs to know which ops came from the sync.
7. Nothing here has been measured or seen on a real pair of machines.

### 4. Size and cheapest first layer
- Sync overall: **L** (hash + ledger base + compare + apply as ops + transport + file + UI marks). Deck A alone: S-M. Timeline B alone: M.
- Cheapest first layer: **a carried file, one direction at a time, compare only.** Export scenes with hashes from one copy, read on the other, and show the four marks and the three buttons with restore point; no network, no live queue. It needs only items 1, 2 (base in a local file) and 4, is fully testable on one machine with two data dirs, and the same compare is what the network route calls later. Then the network transport; then B.
- Recommendation unchanged in spirit: build A on the shared cue/look model first, with undo + restore last good + the file-based sync layer; B is a view over the same data afterwards.
