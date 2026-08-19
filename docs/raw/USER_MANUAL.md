# Raw User Manual

Raw is the node-first experimental lane in di.iiii, forked from Beta on
2026-07-19 and renamed from "Seed" on 2026-07-30. Old `/seed` links still work —
they rewrite themselves to `/raw`.

The fastest way to learn Raw is to make one visible thing first, then connect a
graph value into it.

## Two entry paths

### For visitors

Visitors should not need to understand node authoring first.

1. Open the public space or a prepared Raw project.
2. Look at `World` for the scene and `View` for the interface.
3. Open `Help` if you want the current surface explained in plain steps.

### For creators

Creators should start with one visible result and one connection.

1. Create a Raw project from the hub (`/{space}/raw`).
2. Start with a visible node like `Text`, `Image`, `Cube`, or `Sphere`.
3. Add one graph value node and wire it into that visible node.

## The desk and the room

The desk is one surface: a flat graph of cards on a grid. The room lives
behind it — from the moment something stands in it. Place a **Geo** or a
**Cube** and the current level's room appears behind your cards; a clear desk,
or a desk of pure code (values, math, containers of code), stays flat paper.

- Scene nodes (Cube, Sphere, Plane, Geo, a Light inside a place) stand in the
  room.
- Panels (Text, Image, Browser, Timeline) open as floating windows over the
  desk.
- Value and math nodes drive both, through wires.

The **Room** button (or ⤢) takes the room fullscreen for arranging — that is
where clicking and dragging objects lives. Every container has its own room,
and walking through a door swaps which room fills the screen. The backdrop
room behind the cards shows consequences; it takes no clicks of its own.

## What is different in Raw (vs Beta)

Raw and Beta are independent forks, not shared components. A fix in one does not
appear in the other.

- **No singletons anywhere.** Every node type nests freely — you can put a world
  inside a world inside a world. There is no "you already have one of these"
  restriction, and Node 0 is an ordinary node you can place, enter, and delete
  like any other.
- **Active-marker toggle.** For node types that can repeat inside a scope, a
  small ● on the graph card marks which one is live for that scope. Hierarchy is
  the connection.
- **View as code.** Every node type has a universal inspector section showing its
  current state as data.

## The node palette shows only what works

Raw offers **27 node types**. Another 22 were declarations with no runtime behind
them — capture, device I/O, streaming, and some structural types — and are
withheld from the palette rather than shown as dead options. The queue for
building them out is `docs/roadmaps/NODE_BACKLOG.md`; implementing one means
deleting its line from `UNIMPLEMENTED_NODE_TYPES` in `src/project/nodeRegistry.js`.

`time` was the first built off that queue: it emits `elapsed`, `sin`, `cos`, and
`beat`, and its clock only runs when a Time node actually exists in the document.

## Recommended first exercises

### First text panel

1. Open `View`.
2. Create a `Text` node.
3. Enter text in the `Content` field.
4. Confirm the panel appears in View.

### First world object

1. Open `World`.
2. Create a `Cube` node.
3. Change its color and size in the inspector.
4. Drag it in the viewport to reposition it.

### First connection

1. Create a `Text` node in `View`.
2. Open `Graph`.
3. Create a `String` value node.
4. Connect the string output into the text node's `content` input.
5. Edit the string value and confirm the text panel updates.

### First animation

1. Open `Graph`.
2. Create a `Time` node and a `Number` or math node.
3. Wire `sin` into something visible — a cube's position, a color channel.
4. It moves on its own; delete the Time node and the clock stops.

## Finding out what a node is

Standing inside any node, press **what is it made of** — it sits beside the
"inside X" label, and appears on the canvas itself when the node you are in
holds nothing.

It reads the node you are standing in, and asks the same four questions of every
node there is:

1. **What it takes and gives** — every port, its type, the value on it right
   now, and where that value came from: down a wire (naming the card, with a way
   to jump to it), typed here, or left at its default.
2. **What works it out** — code, its own window, or an Out door standing inside
   it. Containers usually answer two ways at once.
3. **What puts it on screen** — the room, a window, or nowhere.
4. **What is inside it** — nothing, for anything made of code; a count, for a
   container.

Two readings you cannot get anywhere else: a wire that is connected but carrying
nothing says so (the node falls back to its own value in that case), and a
doorway placed but never wired reads "nothing wired in".

Where a node is worked out or drawn by code, the sheet names the file and the
exact lines, and **Show the lines** opens them — real, unedited, and refused
outright if the running page and its code ever disagree.

It only reads. Changing a value is still the inspector's job.

## The Geo — collect a scene in a place

The **Geo** is the plain container. Place one, enter it, and collect what you
need — cubes, spheres, models, **Lights** — each appears in the room as you
place it, and from outside the Geo carries them all as one thing you can move,
lift and duplicate. Empty, it shows a faint floor tile so a place never reads
as void. No wiring, no rules: when in doubt, build in a Geo.

A Light placed inside any container is a real point light (colour, intensity,
position). At the top level it stays what it was: the room's light settings.

## Building a node out of nodes

The **Constructor** (palette, with the other "make" nodes) is a container that
wears whatever shape the nodes inside it build. Empty, it stands as a violet
wireframe.

1. Enter it. Place a Cube (or Sphere, or Plane) — it appears in the room behind
   your cards as you place it.
2. Walk out — the Constructor is already wearing it. Nothing to wire.

Everything spatial you place inside contributes automatically. For exact
control, place an `Out` door and wire shapes into it (through a **Merge** for
several): the moment a door exists, only what reaches a door is worn.
Everything stays live — wire a colour into a part's Colour, or the clock's Sin
into a Sphere's Radius, and the worn shape follows.

## The Camera — the authored eye

Place a **Camera** and it stands in the room as a small housing — placing one
never changes your view. The ● toggle on its card marks it as the eye for
this level; marked, the room is seen through it and its housing disappears.
Position, Look At and FOV are inputs like any other — type them, or wire them
(a `Time → Sin → Position` wire is a camera move).

While a camera is marked, orbit is off: the shot is authored. Unmark or
delete the Camera to look around freely again. A Camera inside a Geo frames
that Geo's room, not the one outside.

## Arranging in the room

Click an object to select it; click empty floor to deselect. Drag moves it —
the camera holds still while you do. Hold **Shift** while dragging to lift it.
**Ctrl/Cmd+D** duplicates whatever is selected, stepped slightly aside.

## Putting it on a projector — /out

`/out` is the projector cable: a URL that renders just-the-room, read-only,
zero chrome. Open it on the output machine (or a second window), press F11,
and never touch it — the desk stays your control room.

- A project: `/{space}/raw/projects/{id}/out` — follows every edit live over
  the same sync the desk uses, across machines. Works signed-out on public
  spaces.
- A space's local canvas: `/{space}/raw/out` (e.g. `/open/raw/out`) — follows
  the desk live across windows of the SAME browser (a local canvas lives in
  that browser; another machine cannot see it — use a project for that).
- Aim it at a container's room with `?scope=<nodeId>`; mark a Camera ● inside
  that scope and the output holds the authored shot.

The page asks the screen to stay awake, and nothing on it takes a click.
Honest limits, today: webcam/mic/MIDI feeds live in the window that owns
them — capture on the output machine itself, or drive numbers only; and
Time-driven motion runs on each window's own clock, so two windows can be
offset. Both are known and on the list.

## The Monitor — watch a wire

Place a **Monitor** and wire any texture into its Source (a Webcam's Frame,
for now). The window shows the feed live while you keep wiring — the viewer
TouchDesigner puts on every tile, as one window you place where you want it.
It only watches: rooms have the World window, the Room button, and `/out`.

## What to do when something feels broken

- Created a node and see nothing? Check whether it is a visible World/View node
  or a hidden Graph node.
- Wire does nothing? Confirm the target input is supported by the Raw runtime.
- Panel disappeared? Check its frame visibility and size in the inspector.
- Nested deep and the viewport went black? That is a WebGL context limit —
  browsers cap around 16 live contexts. Back out a level.
- Layout crowded? Use the size control in the top bar, and `Help` for the
  current surface.

## Starter set that is safe today

- `view.text`, `view.image`, `view.browser`
- `geom.cube`, `geom.sphere`, `geom.plane`
- `world.background`, `world.light`, `world.grid`
- `universe.world` (nest freely)
- `value.*`
- supported `math.*`
- `time`
