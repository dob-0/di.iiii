## 2026-09-22 — a lamp can be aimed, and a place can be scanned: #530, #531 and #533 land together

- Batch branch off `dev`, merging three green PRs in one CI round rather than three:
  `feat/lights-on-a-place` (#530), `feat/place-pipeline` (#531), `feat/place-scan` (#533).
  All three were BEHIND `dev`, so landing them one at a time would have invalidated the
  others in turn.
- **Why these three now.** Walking the install on 2026-09-22 asking "how do I set the
  lights here", the answer was: you cannot. A light's TRANSFORM offered Position only, the
  renderer passed `SpotLightObject` no target so three.js aimed every spot at the world
  origin, and adding a lamp changed nothing you could see. The fix already existed, tested,
  in #530 — it had simply never left its branch. #531 and #533 are the lane the same walk
  found doors missing for: the scan surface works and nothing linked to it.
- Two conflicts, both "keep both sides", both resolved by hand:
  - `docs/ai/known-fixes.md` — #530 and #531 each append rows to the same table; kept every
    row from both.
  - `src/wiki/wikiContent.js` — `WIKI_HIGHLIGHT_IDS` gained `lights-on-a-place` on one side
    and `scan-a-place` on the other. Written as the union, both near the front; both ids
    were checked to resolve to real wiki pages in the merged file.
- The combined tree is what no CI run had ever seen: each PR was green alone, none of them
  green together. The suite was run on the batch before it was pushed.
- Known and deliberately not addressed here: the tools room still has no door to the scan
  surface, `di stage` or NDI, and its Desk card links to `localhost:4748` with no indication
  when that is down. Platform chrome is still below every touch-target minimum — the top nav
  is 27px tall on a phone, the front door's footer links 16px. Both are their own pass.

## What the pre-land review found, and what was done about it

Nine independent reviews (three lenses × three PRs) plus three adversarial
verifiers per blocking claim. Four claims were raised; three survived 3/3 and one
was dismissed 0/3. All four were in #533.

**Fixed before landing** (each with a guard test, each checked to fail without the fix):

- The first phone capture into an already-filled footage room hung on top of a
  picture already there. `hung` was counting only `scan-` ids.
- A space reached by its slug collected footage into a room the build route
  could never find.
- An asset id was joined straight onto a filesystem path with no
  `isValidAssetId` — the guard every sibling route in `projectRoutes.js` has.
  The verifiers dismissed this 0/3 **on reachability**, and they were right about
  the route as it stands: it is behind `requireLocalRuntime`, which is loopback-only.
  The guard went in anyway, because the moment `DI_ALLOW_LAN_DEVICES=1` is set —
  which is exactly what scanning from a phone requires — the route is reachable
  by anyone on the wifi, and `di up --lan` has auth off.

**LANDED AS IT IS, and it is a real trap — say it out loud before anyone scans
from a dev checkout.** `placeRoutes.js` spawns `place.mjs` with no `--api`, so
`import.mjs` falls back to its hard-coded `DEFAULT_API` of
`https://local.thedi.studio/serverXR`, with a token `readToken` prefers out of
`~/.di/di.env`. On the owner's own install that is the same server and the
behaviour is correct. From a dev checkout on another port it is not: an hour of
reconstruction is written into the INSTALLED tier, and `PATCH /api/spaces/<name>`
can repoint an existing space's published front door at a hall built from another
tier's footage. Not fixed here because the fix is a decision, not a line: this
server has no canonical notion of its own address (`OAUTH_CALLBACK_BASE_URL` is
the closest thing and is not set on a local install), and inventing one inside a
merge is the wrong place for it.

## Two things that are true of the install, not of the code

- `scripts/place/` is **not packed into a runtime build** — `pack-runtime.mjs`
  copies an explicit two-script allowlist. A plain install answers 501 on the
  build route. The owner's box works because `~/.di/di.env` sets `PLACE_SCRIPT`
  at a checkout; that pointer is load-bearing and needs to survive worktree
  cleanup.
- The build route is **loopback-only** unless `DI_ALLOW_LAN_DEVICES=1`. The scan
  page is a phone page and a phone is not loopback, so without that flag the
  phone gets 403 and — because `placeBuildApi.js` and `ScanSurface.jsx` only
  special-case 404 — prints "local runtime is loopback-only" instead of the
  honest "the copy is built on the studio machine".
