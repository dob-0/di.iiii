# Recursive Node Core

This document is the product and engineering north star for the next version of the editor.

The short rule:

> Everything is a node.

That includes the desk, the world, the camera, the background color, imported media, browser surfaces, code blocks, floating UI, and eventually a whole project running inside another project.

## Core Concept

The editor is not separate from the project model. The editor is one possible view of the same recursive graph the user is authoring.

The canonical shape is:

```text
root node
  child graph
    world.root
      world-mounted nodes
    view.root
      2D UI nodes
    graph-only nodes
    assets
    templates
```

The root desk is a `core.project` node. The user is editing inside that node.

Every node can carry some combination of:

- identity: stable id, definition id, label, family
- params: editable user-facing values
- ports: inputs and outputs for graph wiring
- runtime: how the node runs or renders
- mount: `world`, `view`, or `graph`
- spatial state: 3D position, rotation, scale, bounds
- frame state: 2D x, y, width, height, z-index, visible/minimized/pinned
- asset bindings: links to shared assets
- child graph: recursive contents for containers/projects

## Root Surfaces

Every project starts with two root surface nodes:

- `world.root`
- `view.root`

The world surface is the 3D authored space.

The view surface is the 2D authored UI layer.

Both are graph surfaces. Neither is special permanent chrome.

## Blank White Start

The default project starts from:

- white world
- white view layer
- no authored geometry
- no authored panels
- no starter layout pretending to be user content

Only a small host scaffold remains outside the authored project so the user can survive:

- surface switch
- open/create node
- reset
- saved project entry

The scaffold is not the long-term authored UI model. The long-term UI model is `view.*` nodes.

## Authoring Gesture

Double-click is the main creation gesture.

- Double-click in the world creates a world node.
- Double-click in the view creates a 2D view node.
- Add buttons in the host scaffold are accessibility and discoverability shortcuts for the same operation.

The OP Create dialog is a live staging surface:

- search definitions
- choose a family
- preview the node/template
- edit initial params
- create into the active surface
- optionally jump into graph view

## Node Families

The first node vocabulary should stay small and clear.

World nodes:

- `world.color`
- `world.grid`
- `world.light`
- `world.camera`

Geometry and content:

- `geom.cube`
- `asset.image`
- `asset.video`
- `asset.audio`
- `asset.model`

View nodes:

- `view.panel`
- `view.text`
- `view.inspector`
- `view.assets`
- `view.outliner`
- `view.browser`

Runtime/app/code:

- `app.browser`
- `script.js`
- `script.py`

Recursive/container:

- `core.container`
- `core.space`
- `core.project`

## Persistence Model

The canonical project document is node-first:

```text
rootNodeId
nodes[]
edges[]
assets[]
templates[]
workspaceState
```

Legacy fields such as `worldState`, `windowLayout`, and V1 `entities[]` may remain while migration is active, but they should be treated as compatibility mirrors.

New feature work should prefer:

- node definitions
- node ops
- asset graph records
- runtime adapters
- template instances

New feature work should avoid adding permanent behavior to:

- V1 object-only creation
- legacy window layout as the source of truth
- ad hoc scene asset refs

## Asset Direction

Assets are shared graph resources, not object-owned files.

The long-term asset model is:

- asset id is stable
- objects/nodes reference assets by id
- files live in named slots such as `original`, `poster`, `materials`, `preview`, or `source`
- locators describe where bytes come from: package, local IndexedDB, server, or external provider

Local package import should preserve the package as a source of truth instead of exploding files into fragile fallback URLs.

Publishing should append server locators without replacing asset identity.

## Recursive Runtime

Recursive nodes are first-class.

A node can contain a child graph. A `core.project` node can eventually run a whole project inside itself.

Rules:

- entering a container switches the active graph context
- parent and child communicate through explicit params/ports
- nested runtimes are isolated by default
- active nested depth must be limited
- inactive deep runtimes should suspend

The goal is self-hosting without hidden global access.

## Current Implementation Status

Implemented now:

- project schema version 3 with node fields
- root nodes: `core.project`, `world.root`, `view.root`
- blank white workspace on `/`
- blank node workspace fallback for `/<space>` when no project is published
- first OP Create flow for world and view nodes
- local blank workspace persistence through local storage
- first world nodes: cube, color, grid, light, camera, browser
- first view nodes: panel, text, inspector, assets, browser
- compatibility mirrors for `worldState` and `windowLayout`

Still bridge/compatibility:

- Studio is not fully node-native
- V1 is not fully removed
- legacy entities still render beside node instances
- local asset/package storage is not yet the final shared asset core
- graph edges are stored but not fully authorable
- container/project recursion is schema-first, not runtime-complete

## Future Work Plan

### 1. Stabilize The Blank Workspace

- Make world and view node creation reliable across mouse, touch, and keyboard.
- Add proper empty-state affordances for world, view, and graph.
- Add inline node selection feedback for hidden world nodes like color/grid/light/camera.
- Add undo/redo around node ops.
- Add keyboard shortcuts for create, delete, duplicate, focus, and surface switch.

### 2. Finish Local Asset Core

- Add a local IndexedDB binary store for blank workspace uploads.
- Store asset records in the document without persisting `blob:` URLs.
- Rehydrate local asset object URLs per session.
- Support package-backed imported project zips.
- Move OBJ/MTL and media variants into asset file slots.

### 3. Make Nodes Replace Legacy Entities

- Add `asset.image`, `asset.video`, `asset.audio`, and `asset.model` node renderers.
- Migrate existing entity primitives into `geom.*` nodes.
- Migrate V1 object media refs into canonical asset bindings.
- Stop creating legacy entities from new Beta/blank workspace actions.

### 4. Build Graph Authoring

- Render actual edges and ports.
- Allow node-to-node connections.
- Add promoted params on templates.
- Add graph fragments and template save/instantiate.
- Add graph-only nodes such as `logic.bit`, `system.time`, and `system.input`.

### 5. Make View UI Fully Authored

- Convert current floating panels into `view.*` template nodes.
- Persist movement, resize, minimize, and visibility only on node `frame`.
- Add authored toolbars, docks, overlays, and inspectors.
- Keep only tiny non-authored survival controls outside the graph.

### 6. Add Runtime Adapters

- `world-render`
- `view-render`
- `browser-surface`
- `js-worker`
- `python-worker`
- `project-runtime`

Each adapter should consume node params/ports and return declared outputs. Runtime state should not mutate the project document directly.

### 7. Implement Recursive Containers

- Add `core.container` renderer and entry behavior.
- Add breadcrumbs/back stack for entered graph contexts.
- Let containers own their own `world.root` and `view.root`.
- Add runtime depth limits and suspension.
- Add explicit parent-child ports.

### 8. Publish And Collaboration

- Project ops remain authoritative.
- Asset ops and node ops should be separate operation families.
- Publishing uploads missing asset slots and appends server locators.
- Public viewer renders the same node graph without editor-only scaffolding.
- Collaboration cursors and presence should be surface-aware: world, view, graph, and nested context.

## Engineering Rules

- Prefer the shared project schema and node registry over one-off UI state.
- Preserve legacy compatibility, but do not expand legacy as the future model.
- Keep the blank workspace honest: if a feature is not persistent or runtime-complete, label it clearly.
- New UI creation should start from OP Create, not from scattered add-object menus.
- New file behavior should enter through the asset core, not object-local refs.
