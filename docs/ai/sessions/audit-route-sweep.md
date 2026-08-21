## 2026-08-21 — the sweep, and the one defect that destroys work

Owner asked whether the routes were fixed and the interface checked. The honest answer was
no: recent work verified only what it touched. So: a browser sweep of every anonymous route
plus a five-lens code audit.

**The browser sweep** — 27 routes × desktop and phone, against production data. 40 of 54
renders clean. Of the 14 flagged, 8 were correct behaviour (403 on `/admin` for a stranger,
404 from `/api/resolve` on a name that does not exist), 2 were false positives (deliberate
ellipsis truncation with a title tooltip), and 4 were one real defect: **`algovrithm`'s
space-card preview points at an asset that 404s on production.** The space holds exactly one
asset, `algovrithm-preview.webp`, and staging's preview points at that same id — so the
pointer simply went stale. The repair is written
(`$CLAUDE_JOB_DIR/tmp/fixpreview.mjs`) but the production write is blocked by the local
permission classifier; it is a handover.

**The code audit** returned 27 confirmed defects. Fixed here, the worst of them:

### Silent sync death — the only one on the list that loses work

`useProjectDocumentSync` handles a 401 by keeping the queued edits, dispatching
`pendingSyncError` / `authExpired`, and **halting retries** (`clearTimeout`, `break`). The
state was correct. Nothing rendered it:

- `src/raw/` had **zero** references to either field — the node editor was silent on every
  device;
- Studio's only indicator was a 10px dot inside the control cluster, gated `!isMobile`, so
  a phone showed nothing at all;
- and that dot's tooltip read *"Sync failed, retrying — …"* on the exact path where retry is
  halted. The one existing signal said the opposite of the truth.

So an expired session kept accepting edits into a queue in memory and a reload dropped them,
with no warning anywhere. Now both lanes render the message the sync layer already wrote,
outside the zen and `uiHidden` gates — losing an hour of work is not furniture.

**Verified with a real 401**, not a mocked state: intercepted the document/ops writes,
placed a node, watched the banner appear reading *"Session expired — sign in again to keep
syncing."* Studio's copy was proven by forcing the condition and screenshotting at 1280 and
390, because a headless click could not drive an edit through Studio's viewport — that half
is render-verified, not 401-verified, and it is the same four lines as Raw's.

**A bug I introduced and caught:** both the alert and the toolbars are `position: fixed;
top: 0`, so the banner covered the toolbar — taking away "← Projects" exactly when someone
needs to leave and sign in again. Fixed with an adjacent-sibling offset. That exposed a
second one: `workspaceTop` is measured from the toolbar's rect via a `ResizeObserver`, which
never fires when the bar MOVES rather than resizes, so the scope pill landed on the toolbar.
The effect now re-measures on `pendingSyncError`. Both confirmed by looking.

### /spaces had no inbound links

My own loose end from the previous branch: `/spaces` shipped as a canonical address and
`buildSpacesPath` had zero callers — every "Spaces" control still minted the legacy
`/studio`. All five now point at it (`LandingPage`, `StudioHub`, `StudioCodeSpaceDirector`,
`RawEditor`'s ⋯ menu, the admin gate).

Four tests pinned `/studio`; their names state the intent ("sends 'Go to my spaces' to the
Spaces page"), which `/spaces` satisfies. One needed more than a string swap: the helper
matched hrefs by substring, and `/wiki#free-spaces` contains "spaces" — a false match my
rename created. Those two now select by link name.

**Not fixed, from the same audit** — 25 further confirmed defects, the heaviest being asset
imports failing silently (`StudioEditor.jsx` try/finally with no catch), publish and share
outcomes reaching only a collapsed activity log, and touch targets across Studio below the
44px floor Raw's own CSS enforces. Full ranked list in the session artifact.

### Carry into CURRENT.md's "Open" at land time

`land` writes only the "Last session" list, so these need a human hand on `dev`:

- **25 confirmed UX defects unfixed** — asset imports fail silently, publish and share
  outcomes reach only a collapsed activity log, Studio touch targets under the 44px floor
  Raw's own CSS enforces. Ranked list above.
- **`algovrithm`'s space-card preview 404s on prod** — data, not code; repair written, the
  production write is blocked by the local permission classifier.
- Two invite tokens were printed into a session log (`library`, `funding`) and are live for
  7 days — reusable keys, not single-use. Revoke them.

### The protocol has a deadlock, and it is currently firing

`check-agent-docs.mjs` enforces two rules that can contradict: **CURRENT.md must be ≤50
lines**, and **CURRENT.md must not differ from `origin/dev`** on any branch. When dev's own
copy goes over budget, no branch can trim it without tripping the second rule — the fix has
to be committed on `dev` directly.

That is live right now: dev's CURRENT.md went 53 lines at `fe2d4fc4` (land) and 59 at
`7e535e37` (a hand-written recap). `docs:ai:check` therefore fails on dev, on every open PR,
and in the staging deploy — PR #240's `build-and-test` is red for that line alone, with
nothing of its own failing. Trim the "Open" section on `dev` and everything goes green
together.
