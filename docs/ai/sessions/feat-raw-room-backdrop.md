## 2026-08-19 — the room behind the graph

The owner's verdict on the constructor work: "IT JUST INFO. I NEED FULL USABLE
DESK WHERE I CAN CREATE FULL SCENES." A four-agent UX audit (driving the real
UI as a first-timer) plus a TouchDesigner COMP-model deep-dive found why, and
this change is the first of three answers.

**The diagnosis, measured**: geometry-in-geometry already WORKED in the
renderer — a sphere placed inside a cube renders and travels with it — but the
UI (a) gave no 3D view inside any non-World scope, so every build was blind,
(b) actively taught the wrong belief ("made of code — there is nothing inside
it to see"), and (c) demanded Merge-and-door plumbing before a Constructor
showed anything: sixteen blind actions for a two-part shape. The owner never
found the working feature because the interface denied having it.

**This change** (TouchDesigner's backdrop model — its own answer to "watch the
result while editing the graph", the network floating over the output):

- The current scope's room renders BEHIND the graph, always, in every scope —
  cards float on top, and placing something shows it behind your cards the
  moment it lands. The old opt-in overlay was also broken (it painted OVER the
  graph — a later positioned sibling — and its canvas ate every pointer, so
  cards went unreachable the moment it was on); the backdrop mounts as the
  shell's FIRST child and refuses all pointer events, killing both failure
  modes structurally. `isWorldOverlay` state retired.
- Fullscreen is scope-generic and SURVIVES walking through doors: each door
  swaps which room fills the screen. The topbar button is now "Room"/"← Graph"
  and works in every scope (the old one toggled the root World window's frame —
  a silent no-op anywhere else, measured by the audit). Fullscreen carries its
  own on-surface exit (`.raw-room-exit`), because zen has no topbar and the
  audit measured the old ⤢ as a trap; the zen dead-strip (`top: workspaceTop`
  with no topbar) is gone too.
- The empty-scope sentence for a code-made node no longer teaches the wrong
  belief: a spatial node says "What you place here becomes part of it"; only a
  non-spatial code node says it has no room.
- **The Constructor wears its spatial children automatically when it has no
  doors** — the TD flag model: everything inside contributes, wires carry
  data. A door still means "exactly this, nothing else" and suppresses the
  automatic path. Wiki + manual rewritten around place-not-plumb.

### Verified

Seen at 1440×900: the root room (snowman + violet placeholder) as the canvas
itself with all cards hit-testing reachable; inside the Snowman, the workshop
room behind the wires with a just-placed cube appearing the instant the palette
closed. Phone 390×664 looked at too: cards behind the seeded World window there
— PRE-EXISTING (window-over-cards, unchanged by this diff) and on the Phase C
cut list, where the backdrop makes that window redundant anyway.

### The other two answers, still ahead (audit-ranked)

- **Touch**: click an object in the room to select it (today it never selects),
  drag moves it with the grab offset (today it teleports AND orbits), Shift-drag
  lifts, Ctrl+D duplicates, gizmo for rotate/scale.
- **The cut list**: kill the starter seed (empty canvas first visit), CODE box
  only when code exists, title-bar text buttons → icons, palette exact-match
  first ("Out" summons an Outliner today), collision-free card placement,
  explainers into ⋯. Full inventory in the audit (audit-shots/ + four reports
  in the workflow journal wf_9b0100a1-048).
