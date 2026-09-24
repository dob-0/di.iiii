import { LIGHTS, PRIMITIVES } from '../../project/entityPalette.js'
import { walkEntityTree } from '../../project/entityTree.js'
import { CARD_WIDTH } from './cardGeometry.js'

// THINGS, AS THE NODES CANVAS SEES THEM.
//
// A project holds two kinds of thing side by side: the objects Studio (and the
// palette's "things" group) make, and the nodes this canvas makes. The canvas
// used to draw only nodes, so a project of twelve Studio objects opened here as
// an empty grid saying "Built in Studio". Every thing in the room is a card now,
// and a row in the outliner, grouped things under their group.
//
// These cards are a VIEW of the things, never a second copy of them:
//
// - The layout is WORKED OUT, never stored. A thing has no graphX, and giving
//   it one would mean writing to somebody's project just to look at it. The
//   position comes from the thing's place in the tree, which is stable for as
//   long as the list is.
// - A card carries no ports and no wires, because a thing has neither (wiring
//   one is unit 9 of the layers decision, not this). The card is plainer than a
//   node's for that reason: a card that looked wirable and was not would be a
//   worse lie than the blank canvas it replaces.
// - Selecting one selects the THING — the same selection the room and the
//   inspector already use.
//
// First built on the unmerged branch worktree-connect-graph-walk (8c58c29a,
// 2026-08-24), which left grouped things out; brought onto dev with them kept
// (decisions/2026-09-23-layers-what-inside-what.md, unit 6).

const TYPE_LABELS = new Map([
    ...PRIMITIVES.map(({ key, label }) => [key, label]),
    ...LIGHTS.map(({ key, label }) => [key, `${label} light`]),
    ['model', 'model'],
    ['image', 'image'],
    ['video', 'video'],
    ['audio', 'audio']
])

export const thingTypeLabel = (entity) => TYPE_LABELS.get(entity?.type) || entity?.type || 'thing'

// One hue for every thing. A thing is not a node family and must not borrow a
// family's colour — a person reading the canvas has to tell "made of nodes"
// from "a thing in the room" at a glance. Clear of the accent cyan, which
// means interaction only (src/raw/styles/colourRoles.test.js).
export const OBJECT_CARD_COLOR = '#c8a2ff'

// A thing card's box. Height matches a one-row node card (cardGeometry.js:
// header 44 + one row 22 + foot 8), so the two kinds line up on the grid.
export const THING_CARD_HEIGHT = 74
// How far a grouped thing's card steps in from its group's.
export const THING_INDENT = 24
const ROW = THING_CARD_HEIGHT + 18
const COLUMN_GAP = 40

/**
 * Where the things sit: a band of cards. Each top-level thing starts a column;
 * what stands in a group stacks under the group's card, one step in per level,
 * so the canvas reads as the same tree the outliner shows.
 *
 * The band stands at the canvas origin and STAYS there while no node card
 * overlaps it. The branch this came from always put it below the lowest node,
 * and seen on 2026-09-23 that moved every thing card off-screen the moment a
 * first node was placed — a layout worked out from the nodes jumps whenever
 * the nodes change. Only when a node really stands on the band (an older
 * project that already had nodes there) does the band move below the nodes,
 * so a card is never drawn through a node. New nodes step aside from the band
 * where they are created (RawEditor's handlePaletteCreate).
 */
export function buildObjectCards(entities = [], { nodes = [], perRow = 4, gap = 140, heightOf = () => 140 } = {}) {
    const walk = walkEntityTree(entities)
    if (!walk.length) return []

    // Split the walk into blocks: one top-level thing and everything under it.
    const blocks = []
    for (const step of walk) {
        if (step.depth === 0) blocks.push([])
        blocks[blocks.length - 1].push(step)
    }
    const maxDepth = Math.max(0, ...walk.map((step) => step.depth))
    const column = CARD_WIDTH + THING_INDENT * maxDepth + COLUMN_GAP
    const childCount = new Map()
    for (const step of walk) {
        if (step.parentId) childCount.set(step.parentId, (childCount.get(step.parentId) || 0) + 1)
    }

    const cards = []
    let rowTop = 0
    for (let start = 0; start < blocks.length; start += perRow) {
        const row = blocks.slice(start, start + perRow)
        row.forEach((block, columnIndex) => {
            block.forEach(({ entity, depth, parentId }, index) => {
                const holds = childCount.get(entity.id) || 0
                cards.push({
                    // Namespaced so a thing's id can never be mistaken for a
                    // node's by any caller that holds both — the two kinds mint
                    // ids independently.
                    id: `object:${entity.id}`,
                    entityId: entity.id,
                    parentEntityId: parentId,
                    depth,
                    label: entity.name || thingTypeLabel(entity),
                    typeLabel: thingTypeLabel(entity),
                    holds,
                    familyColor: OBJECT_CARD_COLOR,
                    graphX: columnIndex * column + depth * THING_INDENT,
                    graphY: rowTop + index * ROW
                })
            })
        })
        rowTop += Math.max(...row.map((block) => block.length)) * ROW + COLUMN_GAP
    }

    // Does any node stand on the band where it is? `heightOf` is the node
    // card's real height (cardGeometry's cardHeight) in the editor; a picture
    // operator's card is far taller than 140.
    const band = thingBandBounds(cards)
    const onBand = nodes.some((node) => boxesOverlap(band, {
        minX: node.graphX ?? 0,
        minY: node.graphY ?? 0,
        maxX: (node.graphX ?? 0) + CARD_WIDTH,
        maxY: (node.graphY ?? 0) + heightOf(node)
    }))
    if (!onBand) return cards
    const offsetX = Math.min(...nodes.map((node) => node.graphX ?? 0))
    const offsetY = Math.max(...nodes.map((node) => (node.graphY ?? 0) + heightOf(node))) + gap
    return cards.map((card) => ({ ...card, graphX: card.graphX + offsetX, graphY: card.graphY + offsetY }))
}

// A margin around the band, so a node that only grazes it still counts.
const BAND_MARGIN = 24

const boxesOverlap = (a, b) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY

/** The rectangle the thing cards cover, plus a margin — for stepping a new node aside. */
export function thingBandBounds(cards = []) {
    if (!cards.length) return null
    return {
        minX: Math.min(...cards.map((card) => card.graphX)) - BAND_MARGIN,
        minY: Math.min(...cards.map((card) => card.graphY)) - BAND_MARGIN,
        maxX: Math.max(...cards.map((card) => card.graphX + CARD_WIDTH)) + BAND_MARGIN,
        maxY: Math.max(...cards.map((card) => card.graphY + THING_CARD_HEIGHT)) + BAND_MARGIN
    }
}

/**
 * The outliner's list: everything standing in this scope, both kinds, in one
 * list — things as a tree, each row carrying its depth. Things stand in the top
 * room only (a thing cannot stand inside a node until question 2 of the layers
 * decision is answered), so inside a node the list is nodes alone.
 */
export function buildScopeItems({ nodes = [], entities = [], scopeId = null } = {}) {
    const nodeItems = nodes.map((node) => ({ kind: 'node', id: node.id, node }))
    if (scopeId) return nodeItems
    const objectItems = walkEntityTree(entities).map(({ entity, depth }) => ({
        kind: 'object',
        id: entity.id,
        depth,
        label: entity.name || thingTypeLabel(entity),
        typeLabel: thingTypeLabel(entity),
        color: OBJECT_CARD_COLOR
    }))
    return [...nodeItems, ...objectItems]
}
