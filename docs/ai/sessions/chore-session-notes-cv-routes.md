## 2026-09-03 — the network rooms carry a CV, and the landing names its three routes

Both pieces of work below already merged into `dev` without a note of their own; this
file is the record for the next `land`.

### The network rooms (#352)

- The owner corrected his own entry — "im Gevorg Aram Grigoryan dob_0 … XR director
  developer" — so `people.json` now reads `Gevorg Aram Grigoryan` / `XR director,
  developer`, not the deck's older "Gevorg Grigoryan / head of di.iiii, development".
- `people.json` entries take an optional `resume` (`focus[]`, `timeline[{year, items}]`,
  `cvUrl`), rendered by a new `resumeHTML()` in `lib/room-content.mjs` as focus chips
  plus a year-by-year `<details>` accordion; five team rooms have one (gevorg, emilya,
  syuzi, yeva, taron), condensed from each person's master CV in the studio Drive.
- `<details>` rather than any scripted accordion because `network-pages.test.js` fails
  any room page containing `<script>`, and every new font-size had to clear the same
  file's 12px floor.
- **The actual PDF is linked, not hosted, and that is still open.** `space-sync.mjs`
  reads `include` globs as utf8, so a binary pushed that way is corrupted; the CVs point
  at their Drive documents until the PDFs get a real home on the platform.
- Verified on staging as an anonymous visitor after a first push silently shipped stale
  content: `space-sync --tier <t>` sends whatever is on disk in the invoking worktree, and
  reports "document updated" either way — a `git reset --hard` before the sync is enough
  to publish the pre-fix files. Pull the merge, grep the page for the change, then sync.
- The repo's own `Deploy space code files` job fails on `dev` with `LIVE_API_TOKEN
  (staging) is not configured` — a missing GitHub secret, so this data push stays manual.

### The landing (#353)

- Three named routes, weighted as the owner names them: Step inside (primary), **The
  Spaces** — his "2nd main part", now a cyan-wash treatment rather than a ghost link —
  and Open Jam, which he could not find on the page at all before.
- The four exhibition chips moved out of that decision row under a "Featured exhibitions"
  label, so they read as specific work instead of a fourth competing route.
- New `crackTransition.js`: the inverse of `enterFlight.js`'s glide, for the Spaces route.
  The screen splits into shards from a random point and flies apart before the real
  navigation. Origin, shard count and each shard's angle/distance/rotation are re-rolled
  per call — "not the same play twice" was explicit in the brief.
- Two things that cost a rebuild and are worth not rediscovering: a shard filled with the
  page's own ground colour is invisible against it (they carry a cyan gradient now), and
  `translate()` placed inside `scale()` has its distance multiplied by the scale, which
  flung every shard off-screen before the first visible frame.
- `mainSpaceId` and the "Look around" / "Enter Space" pair it drove are gone — Spaces is
  unconditionally that destination now. The two tests tied to the old button were
  rewritten to assert the three-route hierarchy instead.
- **Still open:** on a laptop, "Open Jam" now sits where one of the room's stray flat
  white planes shows through, and its muted label goes low-contrast there (phone is
  fine). The fix belongs to the front-room redesign that removes those planes, not to
  the button.

### Not done, deliberately

- The front-room redesign is built in two grounds on the LOCAL tier only and still waits
  on the owner's pick; nothing was applied to `main`.
