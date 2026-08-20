# Chrome sweep + one room, one sky (plan PR 1.6)

## What changed

- Escape at the top of the stack exits the fullscreen room (it used to die
  silently there); deeper down, scope-popping keeps priority so fullscreen
  survives the walk as designed.
- The topbar count is THIS room's card count, not the whole document; the
  Outliner palette hint stops claiming "this scope" for a project-wide list.
- The ⋯ menu no longer offers "Streaming Prototype" — one click built nine
  nodes of which eight are unimplemented shells; handler deleted.
- WINDOW_DEFAULT_POSITIONS lost its six phantoms (view.assets/activity/
  project, legacy-world.*) and is exported with a guard test: every key must
  name a registered type.
- One room, one sky: WorldPanelWindow now passes the scope's ●-resolved
  world to its viewport (was its own node), so two open Scene windows in one
  room can no longer show two different skies. A non-live window's Sky field
  is inert until ● marks it — that is what ● means.

## Verified

By eye (screenshots read): two Scene windows with different stored skies
render ONE sky (the ●-marked one, its ● lit); Escape closes the fullscreen
room; ⋯ menu clean; topbar shows the scope count. Full suite 2457/2457,
lint at baseline, build/anatomy/wiki green.
