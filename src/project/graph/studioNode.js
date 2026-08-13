// The Studio container node's interior.
//
// `studio` is one entry in the palette, exactly like `value.color` or
// `view.browser`. Placing it gives you a card; entering it reveals the subgraph
// it is assembled from. That is the TouchDesigner COMP / Nuke Group shape, and
// deliberately so: the same container-plus-subgraph mechanism is what a user
// would use to wrap their own patch into a reusable palette item later, so
// Studio gets no special case that a user-authored node could not also have.
//
// Nothing here is new machinery. Raw already has all of it:
//   - `parentId` nesting with no singleton restrictions anywhere
//     (product decision 2026-07-19, docs/architecture/RECURSIVE_NODE_CORE.md)
//   - generic scope entry via `onEnterNode` / `useNodeGraphScope`, which is not
//     special-cased per type
//   - `render: 'panel-2d'` types mounting as op-log-backed floating windows
//     whose frame lives in `node.values.frame`, so the layout is already
//     multiplayer-synced and undoable — unlike Studio's real panels, whose
//     layout is per-browser localStorage and shared with nobody
//
// WHAT IS AND IS NOT DONE
// The interior below is three panels: an outliner, an inspector, and a world.
// Those are the ones whose bodies already exist as working components in Raw.
// Studio's other panels (create/assets, files/code, share/publish, projects)
// are NOT here — their bodies take large callback prop sets (PublishPanel alone
// takes 17) and re-plumbing them is a separate piece of work, not something to
// fake with an empty window that looks shipped.
//
// TWO DECISIONS STILL OPEN, deliberately not pre-empted here:
//   1. Port promotion. Every prior-art system (TouchDesigner .tox, Nuke gizmos,
//      Houdini HDAs) makes the author declare which interior ports surface on
//      the container. Blender's node groups skipped it and that is the standard
//      criticism of them. `studio` currently exposes only `title`.
//   2. Live reference vs frozen snapshot. When a subgraph becomes a palette
//      item, do edits to the original propagate? Nuke made gizmo and group the
//      same object with a brittle seam between them — a caution, not a model.

import { createNode } from '../nodeRegistry.js'
import { buildNodeValues } from './nodeGraphAuthoring.js'

export const STUDIO_TYPE_ID = 'studio'

// What a Studio contains, in the order it reads on the canvas. Kept as data so
// the set is one list to change rather than a sequence of calls to edit.
export const STUDIO_INTERIOR = [
    {
        typeId: 'universe.world',
        label: 'Scene',
        column: 1,
        row: 0,
        values: { title: 'Scene' }
    },
    {
        typeId: 'view.outliner',
        label: 'Outliner',
        column: 0,
        row: 0,
        values: { title: 'Outliner' }
    },
    {
        typeId: 'view.inspector',
        label: 'Inspector',
        column: 2,
        row: 0,
        values: { title: 'Inspector' }
    }
]

const COLUMN = 260
const ROW = 150

/**
 * Build the nodes that live inside a Studio container.
 *
 * @param {object} options
 * @param {string} options.studioNodeId  the container's id — becomes each child's parentId
 * @param {number} options.workspaceTop  top inset so panel frames clear the topbar
 * @returns {Array} nodes to create alongside the container
 */
export function buildStudioInterior({ studioNodeId, workspaceTop = 64 } = {}) {
    if (!studioNodeId) return []

    return STUDIO_INTERIOR.map((spec, index) => {
        const graphX = spec.column * COLUMN
        const graphY = workspaceTop + spec.row * ROW
        const values = buildNodeValues(
            spec.typeId,
            spec.values,
            { clientX: 80 + spec.column * 60, clientY: 120 + index * 40 },
            { workspaceTop }
        )
        // Hidden on creation. Panel nodes mount as floating windows the instant
        // they exist, and three of them at their default sizes cover a phone
        // screen — you would enter the Studio node and find its own contents
        // blocking the subgraph you came to look at. The Windows menu opens them.
        if (values.frame) values.frame.visible = false
        return createNode(spec.typeId, {
            label: spec.label,
            graphX,
            graphY,
            values,
            parentId: studioNodeId
        })
    }).filter(Boolean)
}

/**
 * Build a Studio container node together with its interior, for callers that
 * place one outside the palette flow (e.g. RawHub's "open studio" shortcut,
 * which needs the pair before a RawEditor instance exists to run
 * `handlePaletteCreate`'s inline logic).
 *
 * @param {object} options
 * @param {number} options.graphX
 * @param {number} options.graphY
 * @param {number} options.workspaceTop
 * @returns {{ container: object|null, interior: Array }}
 */
export function buildStudioContainerWithInterior({ graphX = 0, graphY = 0, workspaceTop = 64 } = {}) {
    const values = buildNodeValues(STUDIO_TYPE_ID, {}, { clientX: graphX, clientY: graphY }, { workspaceTop })
    const container = createNode(STUDIO_TYPE_ID, { values, graphX, graphY })
    if (!container) return { container: null, interior: [] }
    return { container, interior: buildStudioInterior({ studioNodeId: container.id, workspaceTop }) }
}
