// Shared scaffolding for the per-node examples in this directory.
//
// One example per palette node type (see docs/ai/audits/2026-09-14-raw-nodes.md
// and docs/ai/audits/2026-09-14-raw-fix-plan.md, item 6): a small, honest,
// working graph that shows what a person can actually do with that node
// today — including what it can NOT do yet, said plainly in `story`. This
// file is the one place that decides layout and id scheme, so every family
// file (numbers.js, make.js, …) reads the same and an AI reading the source
// later learns one pattern, not eight.
import { createEdge, createNode } from '../../../nodeRegistry.js'
import { buildNodeValues } from '../../nodeGraphAuthoring.js'

// A generous grid — wide enough that a ten-port card and a floating window
// frame never collide, the same idea as allNodesExample's COL/ROW but sized
// for graphs of 2-6 nodes rather than all 95 at once.
// ROW has to clear the tallest real card in any example: a spatial node with
// a live preview (TOP_PICTURE_HEIGHT ~107px) and up to 11 declared inputs
// (geom.plane) runs to ~400px (cardGeometry.js's HEADER_HEIGHT + rows *
// PORT_ROW_HEIGHT + the preview block) — checked directly, not guessed, by
// nodeExamples.test.js's "no overlapping cards" test against every example.
export const COL = 260
export const ROW = 420
export const WORKSPACE_TOP = 64

const sanitize = (value) => String(value).replace(/[^a-zA-Z0-9]+/g, '_')

/**
 * A tiny node/edge factory scoped to ONE example. IDs are deterministic —
 * `ex_<owner typeId>_<key>` for nodes, `ex_<owner typeId>_e_<...>` for edges
 * — so building the same example twice (a re-run of the generator, a second
 * push to the same space) always produces the SAME ids: re-running is
 * idempotent, never a pile of duplicates. Because the owner typeId is
 * unique per example (exactly one example per palette type), ids never
 * collide across different examples either, with no coordination needed.
 *
 * @param {string} ownerTypeId  the example's own typeId (== entry.typeId)
 * @param {object} [options]
 * @param {number} [options.top] workspace top inset (keeps panel frames
 *   clear of the topbar, same convention as allNodesExample.js)
 */
export const exampleBuilder = (ownerTypeId, { top = WORKSPACE_TOP } = {}) => {
    const owner = sanitize(ownerTypeId)
    const made = new Map()
    const edges = []

    /**
     * Place a node on the grid at (col, row). Values are seeded through
     * buildNodeValues, exactly as the palette and allNodesExample.js do, so
     * a spatial node gets a sane default position and a panel node gets a
     * properly sized frame. Panel windows default HIDDEN — visible:false —
     * the same reason allNodesExample keeps every window closed: an open
     * window is a floating screen-space box, cards are graph-space, and the
     * two coordinate systems do not agree about where "over the cards"
     * is. A hidden window can never cover a card; the Windows menu opens it.
     */
    const place = (typeId, key, col, row, { label, values = {}, parentKey = null, hidden = true, ...rest } = {}) => {
        const graphX = col * COL
        const graphY = top + row * ROW
        const seeded = buildNodeValues(
            typeId,
            values,
            { clientX: 120 + col * 60, clientY: 120 + row * 40 },
            { workspaceTop: top }
        )
        const node = createNode(typeId, {
            id: `ex_${owner}_${sanitize(key)}`,
            label,
            graphX,
            graphY,
            values: seeded,
            parentId: parentKey ? (made.get(parentKey)?.id || null) : null,
            ...rest
        })
        if (node?.values?.frame && hidden) node.values.frame.visible = false
        made.set(key, node)
        return node
    }

    /** Wire two already-placed nodes by their local keys. */
    const link = (fromKey, fromPort, toKey, toPort) => {
        const from = made.get(fromKey)
        const to = made.get(toKey)
        if (!from || !to) {
            throw new Error(`example "${ownerTypeId}": unknown node "${!from ? fromKey : toKey}"`)
        }
        const edge = createEdge(from.id, fromPort, to.id, toPort, {
            id: `ex_${owner}_e_${sanitize(fromKey)}_${sanitize(fromPort)}_${sanitize(toKey)}_${sanitize(toPort)}`
        })
        edges.push(edge)
        return edge
    }

    const get = (key) => made.get(key)

    const result = () => ({ nodes: [...made.values()], edges: [...edges] })

    return { place, link, get, result }
}

// --- expect helpers ---------------------------------------------------------
//
// Every example's `expect` is a list of small claims nodeExamples.test.js
// can check without a browser. Two shapes:
//
//   computed(port, kind, at?)   — a pure/wired output: evaluateNodeOutput at
//                                  clock `at` (ms) must be a defined value of
//                                  the declared `kind`.
//   live(port, kind, sample?)   — an output that only exists through
//                                  context.liveOutputs while a real device or
//                                  browser feed is running (webcam, mic, MIDI,
//                                  DMX, agents, button/keyboard/video/sound).
//                                  The test injects `sample` as if the feed
//                                  had published it and checks the node reads
//                                  it back — proving the WIRING is correct —
//                                  without needing a camera or a network.
//   edge(port, kind, {before,after,atBefore,atAfter}) — a stateful node
//                                  (frameMemory-backed: Counter, Toggle,
//                                  Trigger, Timer, Speed, Hold, Lag) proven by
//                                  two evaluations sharing one frameMemory:
//                                  a rising edge, then a check.
//
// A node with no live/computable output at all (Model with no asset chosen,
// a shell with `outputs: []`) gets an empty `expect` — the placement and
// wiring tests still run.
//
// `onId`, when given, evaluates against a DIFFERENT node than the example's
// own star — the one case that needs it is a doorway (port.out): the door
// itself declares no outputs at all, what it feeds is its CONTAINER's
// promoted socket, named by the door node's own id. Pass
// `onId: nodeIdFor(ownerTypeId, containerKey)` and `port:
// nodeIdFor(ownerTypeId, doorKey)` to check that socket directly.
export const computed = (port, kind, at = 0, { onId } = {}) => ({ mode: 'computed', port, kind, at, onId })
export const live = (port, kind, sample = true, { onId } = {}) => ({ mode: 'live', port, kind, sample, onId })
export const edgeCheck = (port, kind, { before = {}, after = {}, atBefore = 0, atAfter = 16, onId } = {}) => (
    { mode: 'edge', port, kind, before, after, atBefore, atAfter, onId }
)

/**
 * The deterministic node id `exampleBuilder(ownerTypeId).place(...)` would
 * give a node placed with local key `key` — computable WITHOUT calling
 * build(), so an `expect` entry can name a doorway's socket (which is keyed
 * by the door node's own id, not a fixed port name) ahead of time.
 */
export const nodeIdFor = (ownerTypeId, key) => `ex_${sanitize(ownerTypeId)}_${sanitize(key)}`
