# Raw User Manual

Raw is the node-first experimental lane in di.iiii, forked from Beta on
2026-07-19 and renamed from "Seed" on 2026-07-30. Old `/seed` links still work —
they rewrite themselves to `/raw`.

The fastest way to learn Raw is to make one visible thing first, then connect a
graph value into it.

## Two entry paths

### For visitors

Visitors should not need to understand node authoring first.

1. Open the public space or a prepared project.
2. Drag to look around the scene; tap panels to read them.
3. Open `Help` for the moves in plain steps.

### For creators

Creators should start with one visible result and one connection.

1. Create a Raw project from the hub (`/{space}/raw`).
2. Start with a visible node like `Text`, `Image`, `Cube`, or `Sphere`.
3. Add one graph value node and wire it into that visible node.

## The canvas and the scene

The desk is clear — always. Cards on flat paper, nothing behind them. The
room is a view you open, three ways:

- **The Scene window** — a room floating over the desk. Drag the corner glyph
  (bottom-right) to make it any size.
- **The Room button** (topbar), or type `Room` in the palette — the current
  level's room, fullscreen. That is where clicking and dragging objects
  lives. Every container has its own room, and walking through a door swaps
  which room fills the screen.
- **`/out`** — a whole display (see "Putting it on a projector").

Scene nodes (Cube, Sphere, Plane, Geo, a Light inside a place) stand in the
room; panels open as floating windows; value and math nodes drive both,
through wires.

## Three rules the node editor lives by

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

One more withholding, in the other direction: the **Create** window (which makes
objects — things with no card, no ports and no wires) is no longer offered by
the node palette. Objects belong to the Studio side; documents that already have
a Create window keep it, and objects always stand in the TOP room — a container's
inside shows only what you placed in that container.

## Recommended first exercises

### First text panel

1. Double-click the canvas and type `Text`.
2. Enter text in the `Content` field — the panel window shows it live.

### First scene object

1. Double-click the canvas and type `Cube`.
2. Change its colour and size in the inspector.
3. Open the scene (type `Full screen` in the palette, or place a `Scene`
   node) and drag the cube to reposition it.

### First connection

1. Make a `Text` node and a `String` node.
2. Drag the string's output port onto the text node's `Content` input.
3. Edit the string value and watch the panel follow.

### First animation

1. Make a `Time` node and wire `sin` into something visible — a cube's
   position, a colour channel.
2. It moves on its own; delete the Time node and the clock stops.

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
as void. When in doubt, build in a Geo.

A Geo stands **on the floor**, and in the room a click picks up **the Geo as a
whole** — click anything standing in it and the pill says Geo; drag to move
the place with everything on it, or set its Position in the inspector to part
two geos exactly. To handle one thing INSIDE — the cube, not its place —
enter the Geo: in there, the click picks the cube.

The Geo also **gives out what it collects**: its Geometry socket carries
everything standing in it as one shape. Wire two Geos through a **Merge** into
a Constructor's door and the Constructor wears both scenes as one object; a
Geo standing inside a Geo carries through the chain. Empty, the socket
carries nothing — an empty place is not an invisible shape.

Light and Environment are two nodes, because they were always two things. A
**Light** is a lamp: a real point light standing wherever you put it — top
level or inside a container. An **Environment** is the scene's settings: the
ambient wash and one sun, one per level, ● picking the active one. Projects
made before the split keep their old Light nodes and light exactly as they
did.

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
An honest limit, today: webcam/mic/MIDI feeds live in the window that owns
them — capture on the output machine itself, or drive numbers only.
Time-driven motion is shared: the first time a Time node exists the document
stamps one show clock, and every window — this page included — reads the
same elapsed time from it.

## The Monitor — watch a wire

Place a **Monitor** and wire any texture into its Source — a Webcam's Frame,
or a Video's. The window shows the feed live while you keep wiring — the viewer
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
