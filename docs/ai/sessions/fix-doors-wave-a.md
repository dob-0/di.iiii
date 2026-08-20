## The doors point where they say

Wave A of the 2026-08-21 doors audit (links/naming/hierarchy, artifact in the
owner's gallery). Pure link fixes — no design decisions taken, no routes changed.

- `buildRawHubPath` → `buildRawCanvasPath`, `RAW_PAGE_HUB` → `RAW_PAGE_CANVAS`:
  the name now says the route renders the per-browser canvas, not a hub.
- Studio's "Nodes" button and admin's "Nodes"/"Node Editor Path" now open
  `/{space}/raw/projects` — the list their labels promise.
- `/admin`'s non-admin "Go to my spaces" goes to `/studio` (was `/main/studio`
  behind a second auth wall); gate copy says "the Spaces page", not "the hub".
- Raw's back button says "← Projects" in both mounts (was "Hub" in one).
- Wiki: the false claim that "Step inside" lands in the Open Space's shared
  build is rewritten to the truth (browser-local canvas); the node-editor
  article now names `/…/raw/projects` vs `/…/raw` correctly.

Known-fixes rows + regression guards added for both broken doors.
