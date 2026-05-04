# Beta User Manual

Beta is the experimental node-first editor lane in di.i. The easiest way to learn it is to make one visible thing first, then connect a graph value into it.

## Two entry paths

### For visitors

Visitors should not need to understand node authoring first.

1. Open the public space or a prepared Beta project.
2. Look at `World` for the scene and `View` for the interface.
3. Open `Help` if you want the current surface explained in plain steps.

### For creators

Creators should start with one visible result and one connection.

1. Create a Beta project.
2. Start with a visible node like `Text`, `Image`, `Cube`, or `Sphere`.
3. Add one graph value node and wire it into that visible node.

## The three surfaces

### World

Use World to place visible scene nodes like cubes, spheres, planes, lights, and background controls.

Basic flow:

1. Open `World`.
2. Click `Add World Node` or double-click the scene.
3. Create a visible node such as `Cube`, `Sphere`, or `Background`.
4. Select the node and adjust its values in the inspector.

### View

Use View to create 2D panels like text notes, image panels, and browser panels.

Basic flow:

1. Open `View`.
2. Click `Add View Node` or double-click the surface.
3. Create `Text` or `Image`.
4. Select the panel and edit its content in the inspector.

### Graph

Use Graph to create value sources and math nodes that drive World and View.

Basic flow:

1. Open `Graph`.
2. Create a value node such as `Number`, `String`, or `Color`.
3. Drag from an output port into a compatible target input.
4. Change the source value and confirm the target updates.

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
4. Drag it in the viewport if you want to reposition it.

### First connection

1. Create a `Text` node in `View`.
2. Open `Graph`.
3. Create a `String` value node.
4. Connect the string output into the text node `content` input.
5. Edit the string value and confirm the text panel updates.

## What to do when something feels broken

- If you create a node and do not see anything, check whether it is a visible World or View node, or a hidden Graph node.
- If a wire does nothing, confirm the target node already supports that input in Beta runtime.
- If a panel disappears, inspect its frame visibility and size.
- If the layout feels crowded, use the size control in the top bar and the Help button for the current surface.

## Current Beta expectations

Beta is still an experimental lane. The visible workflow is improving, but not every node family has a full runtime yet. The safest starter set is:

- `view.text`
- `view.image`
- `geom.cube`
- `geom.sphere`
- `geom.plane`
- `world.background`
- `world.light`
- `world.grid`
- `value.*`
- supported `math.*`
