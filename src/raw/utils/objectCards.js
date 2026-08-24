import { LIGHTS, PRIMITIVES } from '../../project/entityPalette.js'

// OBJECTS, AS THE GRAPH SEES THEM.
//
// A project carries work in two lanes and the canvas only ever drew one, so a
// room with twelve objects in it opened in the node editor as an empty canvas.
// Nothing was broken — the canvas simply had no idea objects existed, which is
// the same thing from where a person is standing.
//
// These cards are a VIEW of the objects, never a second copy of them:
//
// - The layout is DERIVED, not stored. An object has no `graphX`, and giving it
//   one would mean writing to somebody's document to open a window on it — an
//   edit nobody asked for, on content, just for looking. So the position comes
//   from the object's index, which is stable for as long as the list is.
// - A card carries no ports and no wires, because an object has neither. The
//   card is deliberately plainer than a node's for that reason: a card that
//   looked wirable and was not would be a worse lie than the blank canvas.
// - Selecting one selects the OBJECT — the same selection Studio's outliner and
//   the room itself use, so the inspector that opens is the one that already
//   knows how to edit it.

const TYPE_LABELS = new Map([
    ...PRIMITIVES.map(({ key, label }) => [key, label]),
    ...LIGHTS.map(({ key, label }) => [key, `${label} light`]),
    ['model', 'model'],
    ['image', 'image'],
    ['video', 'video'],
    ['audio', 'audio']
])

// One hue for the whole lane. Objects are not a node family and must not borrow
// a family's colour — a person reading the canvas has to be able to tell "made
// of nodes" from "made as an object" at a glance, and family hues already mean
// something else. Sits clear of the accent cyan, which means interaction only.
export const OBJECT_CARD_COLOR = '#c8a2ff'

const COLUMN = 200
const ROW = 108

/**
 * Where the objects sit relative to the nodes: a band BELOW the lowest node
 * card, in reading order. Below rather than beside, because the two lanes are
 * not peers on this canvas — the graph is what the canvas is for, and the
 * objects are what the room is holding. Same reason a contact sheet goes under
 * the edit, not through it.
 */
export function buildObjectCards(entities = [], { nodes = [], perRow = 4, gap = 140 } = {}) {
    const roots = entities.filter((entity) => entity && !entity.parentId)
    if (!roots.length) return []

    const nodeBottom = nodes.length
        ? Math.max(...nodes.map((node) => (node.graphY ?? 0) + 140))
        : 0
    const originX = nodes.length ? Math.min(...nodes.map((node) => node.graphX ?? 0)) : 0
    const originY = nodeBottom + (nodes.length ? gap : 0)

    return roots.map((entity, index) => ({
        // Namespaced so an object id can never be mistaken for a node id by any
        // caller that holds both — the two lanes mint ids independently.
        id: `object:${entity.id}`,
        entityId: entity.id,
        label: entity.name || TYPE_LABELS.get(entity.type) || entity.type || 'object',
        typeLabel: TYPE_LABELS.get(entity.type) || entity.type || 'object',
        familyColor: OBJECT_CARD_COLOR,
        graphX: originX + (index % perRow) * COLUMN,
        graphY: originY + Math.floor(index / perRow) * ROW
    }))
}

/**
 * The outliner's list: everything standing in this scope, both lanes, in one
 * list. Objects are root-scope citizens, the same rule the room draws by, so
 * they appear at root and nowhere else.
 */
export function buildScopeItems({ nodes = [], entities = [], scopeId = null } = {}) {
    const nodeItems = nodes.map((node) => ({ kind: 'node', id: node.id, node }))
    if (scopeId) return nodeItems
    const objectItems = entities
        .filter((entity) => entity && !entity.parentId)
        .map((entity) => ({
            kind: 'object',
            id: entity.id,
            label: entity.name || entity.type || 'object',
            typeLabel: TYPE_LABELS.get(entity.type) || entity.type || 'object',
            color: OBJECT_CARD_COLOR
        }))
    return [...nodeItems, ...objectItems]
}
