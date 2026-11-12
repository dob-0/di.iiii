import { cloneValue, normalizeProjectNode } from '../../shared/projectSchema.js'

// THE SHORT WAY for a batch that only writes node values.
//
// applyProjectOps normalizes the whole document before and after every batch, and invertProjectOps does it three
// times more. That is right for an edit, and it is what a played instrument cannot afford: a VJ deck writes its
// `values` thirty times a second, and on a show project (534 KB, 131 room objects) each write walked and cloned the
// whole document seven times on the main thread before the picture moved (Platina, 2026-11-13: "MIDI lags").
//
// A batch made ONLY of `updateNode` ops whose patch is ONLY `values`, on nodes that exist, cannot change anything but
// those nodes. For such a batch these two functions give what the long way gives (nodeValueOps.test.js holds them to
// it), touching just those nodes, and every other entity, node, asset and edge keeps its identity, so nothing that
// reads them has to run again. Anything else returns null and the caller takes the long way.
//
// `document` must be a normalized document (the project store's always is).

const valuesPatch = (op) => {
    if (op?.type !== 'updateNode') return null
    const payload = op.payload
    const patch = payload?.patch
    if (typeof payload?.nodeId !== 'string' || !payload.nodeId) return null
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return null
    const keys = Object.keys(patch)
    if (keys.length !== 1 || keys[0] !== 'values') return null
    const values = patch.values
    return values && typeof values === 'object' && !Array.isArray(values) ? values : null
}

/** The document after a values-only batch, or null when the batch is anything else (take applyProjectOps). */
export const applyNodeValueOps = (document, ops) => {
    if (!document || !Array.isArray(document.nodes) || !Array.isArray(ops) || !ops.length) return null
    let nodes = document.nodes
    for (const op of ops) {
        const values = valuesPatch(op)
        if (!values) return null
        const index = nodes.findIndex((node) => node?.id === op.payload.nodeId)
        if (index < 0) return null
        const existing = nodes[index]
        const normalized = normalizeProjectNode({ ...existing, values: { ...existing.values, ...cloneValue(values) } })
        if (!normalized) continue // applyProjectOps leaves the node as it was, too
        if (nodes === document.nodes) nodes = nodes.slice()
        nodes[index] = normalized
    }
    return { ...document, nodes, projectMeta: { ...document.projectMeta, updatedAt: Date.now() } }
}

/** The inverse of a values-only batch (what invertProjectOps returns for it), or null when it is anything else. */
export const invertNodeValueOps = (document, ops) => {
    if (!document || !Array.isArray(document.nodes) || !Array.isArray(ops) || !ops.length) return null
    const current = new Map() // nodeId -> its values as the batch goes
    const groups = []
    for (const op of ops) {
        const values = valuesPatch(op)
        if (!values) return null
        const nodeId = op.payload.nodeId
        if (!current.has(nodeId)) {
            const node = document.nodes.find((item) => item?.id === nodeId)
            if (!node) return null
            current.set(nodeId, node.values || {})
        }
        const existing = current.get(nodeId)
        groups.push({
            type: 'updateNode',
            payload: {
                nodeId,
                patch: { values: Object.fromEntries(Object.keys(values).map((key) => [key, key in existing ? cloneValue(existing[key]) : null])) }
            }
        })
        const node = document.nodes.find((item) => item?.id === nodeId)
        const normalized = normalizeProjectNode({ ...node, values: { ...existing, ...cloneValue(values) } })
        if (normalized) current.set(nodeId, normalized.values || {})
    }
    return groups.reverse()
}
