// Cards placed on a grid overlap when a card is taller than its grid row: a
// Cylinder's twelve ports ran under the Cone placed one row below it, so its
// lower ports, and the wires landing on them, disappeared under another card
// (measured 2026-10-02: 53 overlapping pairs in the All Nodes Example at
// 2560×1340). This settles each column top to bottom, using the card's REAL
// height (cardHeight), pushing a card down only as far as the one above it
// needs. Nothing moves sideways, no card moves up, and a column with room to
// spare is left exactly as it was.
//
// A column is the cards of one scope that share a left edge — the grid every
// generated graph here is built on. Hand-placed cards sit wherever the person
// put them, and this is only applied to generated layouts.
export const CARD_STACK_GAP = 16

export const settleCardStacks = (nodes, measure, gap = CARD_STACK_GAP) => {
    const columns = new Map()
    for (const node of nodes) {
        if (!Number.isFinite(node?.graphX) || !Number.isFinite(node?.graphY)) continue
        const key = `${node.parentId || ''}|${node.graphX}`
        if (!columns.has(key)) columns.set(key, [])
        columns.get(key).push(node)
    }
    const moved = new Map()
    for (const column of columns.values()) {
        column.sort((a, b) => a.graphY - b.graphY)
        let floor = -Infinity
        for (const node of column) {
            const y = Math.max(node.graphY, floor)
            if (y !== node.graphY) moved.set(node.id, y)
            floor = y + measure(node) + gap
        }
    }
    if (!moved.size) return nodes
    return nodes.map((node) => (moved.has(node.id) ? { ...node, graphY: moved.get(node.id) } : node))
}
