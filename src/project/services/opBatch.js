// How many queued ops go in ONE POST /ops. The sync hook used to send the whole queue at once; a queue that grew while
// the server was away (a VJ deck writes its whole state on every fader move) passed the server's 10 MB JSON limit, got
// "request entity too large" (413) every retry and never saved again ("Not saved · 805 changes waiting", Platina deck,
// 2026-11-13). Batches are now cut at MAX_BATCH_BYTES of JSON: the same ops, in the same order, in several requests.
// A single op bigger than the limit still goes alone (the server decides about it).
export const MAX_BATCH_BYTES = 2 * 1024 * 1024
export const MAX_BATCH_OPS = 500

const sizeOf = (op) => {
    try { return JSON.stringify(op)?.length || 0 } catch { return 0 }
}

/** The number of ops from the head of `queue` to send in the next request: at least 1 when the queue has any. */
export const nextBatchSize = (queue, maxBytes = MAX_BATCH_BYTES, maxOps = MAX_BATCH_OPS) => {
    const ops = Array.isArray(queue) ? queue : []
    let bytes = 0
    let count = 0
    for (const op of ops) {
        const size = sizeOf(op)
        if (count > 0 && (bytes + size > maxBytes || count >= maxOps)) break
        bytes += size
        count += 1
    }
    return count
}

const valuesOnly = (op) => op?.type === 'updateNode' && typeof op.payload?.nodeId === 'string'
    && op.payload.patch && typeof op.payload.patch === 'object' && Object.keys(op.payload.patch).length === 1
    && op.payload.patch.values && typeof op.payload.patch.values === 'object'

/**
 * A batch without the node-value writes a later write in the SAME batch replaces. A VJ deck writes its whole `values`
 * on every fader step; while one request is on the wire dozens queue up, and sending them all made every other page
 * (the wall) replay each old state in order, a second late. An earlier op is dropped only when a later op in the batch
 * is a values-only updateNode of the same node carrying every key the earlier one set, and nothing but updateNode ops
 * sits between them, so the document the server ends with is the same. Order of the kept ops is unchanged.
 */
export const dropSuperseded = (batch) => {
    const ops = Array.isArray(batch) ? batch : []
    if (ops.length < 2) return ops
    const keep = new Array(ops.length).fill(true)
    const lastFor = new Map() // nodeId -> index of the latest values-only write in the current run of updateNode ops
    for (let i = ops.length - 1; i >= 0; i -= 1) {
        const op = ops[i]
        if (op?.type !== 'updateNode') { lastFor.clear(); continue }
        if (!valuesOnly(op)) { lastFor.delete(op.payload?.nodeId); continue }
        const later = lastFor.get(op.payload.nodeId)
        if (later !== undefined && Object.keys(op.payload.patch.values).every((key) => key in ops[later].payload.patch.values)) keep[i] = false
        else lastFor.set(op.payload.nodeId, i)
    }
    return ops.filter((_, index) => keep[index])
}
