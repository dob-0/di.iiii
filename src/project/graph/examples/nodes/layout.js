// layout.js — the pure grid layout for a family's push-node-examples page.
//
// docs/ai/audits/2026-09-14-raw-fix-plan.md round 2, "examples wave": a
// family's examples used to stack in ONE column, BLOCK_HEIGHT apart — for a
// 38-example family (numbers, 126 nodes) that is a tower the canvas cannot
// fit: at fit zoom (34%) you see three examples and no text is readable
// (docs/ai/audits/raw-audit-2026-09-14/walk/d-numbers.png,
// d-make.png). Instead, examples fill a grid, left-to-right then top-to-
// bottom, each cell sized to that example's OWN real bounding box (measured
// with cardGeometry.js's getCardBox/cardHeight — the same box the canvas
// actually draws, not a guess), and a family too big for one readable
// canvas splits into several projects ("examples · numbers 1/4", "2/4", …).
//
// Kept as pure functions with no network/process dependency so this module
// can be unit-tested directly (layout.test.js) and imported by both
// scripts/push-node-examples.mjs (the pusher) and, later, anything else
// that needs to know an example's on-canvas box.
import { getCardBox } from '../../../../raw/utils/cardGeometry.js'
import { WORKSPACE_TOP } from './helpers.js'

// A row of 4 keeps a dozen-example project inside roughly a 1440-wide
// canvas at a legible zoom (owner, 2026-09-14 fix plan item 6); pass --cols
// to widen or narrow it. Split threshold: 38-example families (numbers)
// become 4 projects of <=12 rather than one 38-cell wall.
export const GRID_COLS = 4
export const MAX_EXAMPLES_PER_PROJECT = 12
export const GUTTER_X = 64
export const GUTTER_Y = 96

/**
 * Split one family's examples into chunks of at most `maxPerProject`,
 * preserving order (the family file's own most-basic-first order). A
 * family that already fits keeps its plain slug/title (chunk.total === 1);
 * a split family numbers each project "<label> i/total".
 */
export const chunkFamily = (family, maxPerProject = MAX_EXAMPLES_PER_PROJECT) => {
    const total = Math.max(1, Math.ceil(family.examples.length / maxPerProject))
    const chunks = []
    for (let i = 0; i < total; i += 1) {
        chunks.push({
            familyId: family.id,
            label: family.label,
            examples: family.examples.slice(i * maxPerProject, (i + 1) * maxPerProject),
            index: i + 1,
            total
        })
    }
    return chunks
}

/** The project a chunk lands in — a stable, predictable slug. */
export const slugFor = (chunk) => (chunk.total > 1 ? `examples-${chunk.familyId}-${chunk.index}` : `examples-${chunk.familyId}`)
export const titleFor = (chunk) => (chunk.total > 1 ? `examples · ${chunk.label} ${chunk.index}/${chunk.total}` : `examples · ${chunk.label}`)

/** A short, plain-language caption for an example's first card. */
const MAX_CAPTION_LEN = 80
export const captionFor = (example) => {
    const story = (example.story || '').trim()
    const clipped = story.length > MAX_CAPTION_LEN ? `${story.slice(0, MAX_CAPTION_LEN - 1).trimEnd()}…` : story
    return clipped ? `${example.title} — ${clipped}` : example.title
}

/** Tiny stable string hash (FNV-1a) — keeps content-addressed opIds short. */
export const fnv1a = (str) => {
    let hash = 0x811c9dc5
    for (let i = 0; i < str.length; i += 1) {
        hash ^= str.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193)
    }
    return (hash >>> 0).toString(36)
}

/**
 * An example's own bounding box in graph units, measured from the nodes it
 * actually places at ROOT scope (a nested node — a doorway inside a Geo —
 * lives on that container's OWN inner canvas, a different view entirely,
 * so it contributes nothing to the cell this example occupies on the
 * shared family canvas; see room.js's port.in/port.out examples).
 */
export const exampleBBox = (nodes) => {
    const rootNodes = nodes.filter((node) => !node.parentId)
    const boxes = (rootNodes.length ? rootNodes : nodes).map((node) => getCardBox(node, nodes))
    const minX = Math.min(...boxes.map((box) => box.x))
    const minY = Math.min(...boxes.map((box) => box.y))
    const maxX = Math.max(...boxes.map((box) => box.x + box.width))
    const maxY = Math.max(...boxes.map((box) => box.y + box.height))
    return { minX, minY, width: maxX - minX, height: maxY - minY }
}

/** The example's first card by reading order (top row, then left column). */
export const firstCardId = (nodes) => {
    const rootNodes = nodes.filter((node) => !node.parentId)
    const sorted = [...rootNodes].sort((a, b) => (a.graphY - b.graphY) || (a.graphX - b.graphX))
    return sorted[0]?.id ?? null
}

const offsetNode = (node, dx, dy) => ({ ...node, graphX: node.graphX + dx, graphY: node.graphY + dy })

/**
 * Lay out one chunk's examples in a grid: `cols` per row, each column as
 * wide as its widest example, each row as tall as its tallest, gutters
 * between cells, reading order left-to-right then top-to-bottom. Returns,
 * per example, its already-offset nodes/edges plus the id of its first
 * (top-left) card so the caller can label it. Deterministic: the same
 * chunk and options always produce the same boxes (cardGeometry.js has no
 * randomness, and this function has none of its own).
 */
export const layoutChunk = (chunk, { cols = GRID_COLS, top = WORKSPACE_TOP } = {}) => {
    const built = chunk.examples.map((example) => ({ example, ...example.build() }))
    const bboxes = built.map(({ nodes }) => exampleBBox(nodes))
    const rows = Math.max(1, Math.ceil(built.length / cols))

    const colWidth = Array.from({ length: cols }, (_, col) => {
        const widths = bboxes.filter((_, i) => i % cols === col).map((box) => box.width)
        return widths.length ? Math.max(...widths) : 0
    })
    const rowHeight = Array.from({ length: rows }, (_, row) => {
        const heights = bboxes.filter((_, i) => Math.floor(i / cols) === row).map((box) => box.height)
        return heights.length ? Math.max(...heights) : 0
    })

    const colX = []
    for (let c = 0, x = 0; c < cols; c += 1) { colX.push(x); x += colWidth[c] + GUTTER_X }
    const rowY = []
    for (let r = 0, y = top; r < rows; r += 1) { rowY.push(y); y += rowHeight[r] + GUTTER_Y }

    return built.map(({ example, nodes, edges }, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const bbox = bboxes[i]
        const dx = colX[col] - bbox.minX
        const dy = rowY[row] - bbox.minY
        const starId = firstCardId(nodes)
        const placedNodes = nodes.map((node) => {
            const moved = offsetNode(node, dx, dy)
            return node.id === starId ? { ...moved, label: captionFor(example) } : moved
        })
        return { example, col, row, nodes: placedNodes, edges }
    })
}

/**
 * Every op for one chunk: createNode/createEdge (opId === the node/edge's
 * own id, unchanged across runs — first push only) followed by one
 * updateNode "move" op per node (opId content-addressed on its target
 * graphX/graphY/label — see moveOpId), so a later push whose layout
 * changed moves the node instead of duplicating or silently doing
 * nothing.
 */
export const moveOpId = (node) => `mv_${node.id}_${Math.round(node.graphX)}_${Math.round(node.graphY)}_${fnv1a(node.label || '')}`

export const buildChunkOps = (chunk, layoutOptions) => {
    const laidOut = layoutChunk(chunk, layoutOptions)
    const createNodeOps = []
    const createEdgeOps = []
    const moveOps = []
    for (const { nodes, edges } of laidOut) {
        for (const node of nodes) {
            createNodeOps.push({ opId: node.id, type: 'createNode', payload: { node } })
            moveOps.push({
                opId: moveOpId(node),
                type: 'updateNode',
                payload: { nodeId: node.id, patch: { graphX: node.graphX, graphY: node.graphY, label: node.label } }
            })
        }
        for (const edge of edges) {
            createEdgeOps.push({ opId: edge.id, type: 'createEdge', payload: { edge } })
        }
    }
    // createNode before createEdge (an edge needs both endpoint nodes to
    // already exist in the document — src/shared/projectSchema.js's
    // createEdge case) and before updateNode (same reason, node must exist
    // to be patched); order among examples within each phase doesn't matter.
    return [...createNodeOps, ...createEdgeOps, ...moveOps]
}
