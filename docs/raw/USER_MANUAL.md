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

## The three surfaces

### World

Use World to place visible scene nodes like cubes, spheres, planes, lights, and
background controls.

1. Open `World`.
2. Double-click the scene, or use the top action.
3. Create a visible node such as `Cube`, `Sphere`, or `Background`.
4. Select the node and adjust its values in the inspector.

### View

Use View to create 2D panels — text notes, image panels, browser panels.

1. Open `View`.
2. Double-click the surface.
3. Create `Text` or `Image`.
4. Select the panel and edit its content in the inspector.

### Graph

Use Graph to create value sources and math nodes that drive World and View.

1. Open `Graph`.
2. Create a value node such as `Number`, `String`, or `Color`.
3. Drag from an output port into a compatible target input.
4. Change the source value and confirm the target updates.

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

The palette shows only node types that actually do something (**37 of 56 declared,
as of 2026-08-11** — re-derive rather than trust that number, see
`docs/roadmaps/NODE_BACKLOG.md`). The rest were declarations with no runtime behind
them — capture, device I/O, streaming, and some structural types — and are withheld
from the palette rather than shown as dead options. The queue for
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
