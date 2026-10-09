// Paint order of cards. A card that was moved is raised: its graphZ is one
// above the highest graphZ in the project. Cards with no graphZ keep the
// document's order, underneath every raised card (stable sort).
export const nextRaiseOf = (nodes, nodeId) => {
    let top = 0
    for (const node of nodes || []) {
        if (node.id !== nodeId && Number.isFinite(node.graphZ) && node.graphZ > top) top = node.graphZ
    }
    return top + 1
}

export const paintOrder = (nodes) => {
    if (!nodes.some((node) => node.graphZ)) return nodes
    return nodes
        .map((node, index) => ({ node, index }))
        .sort((a, b) => ((a.node.graphZ || 0) - (b.node.graphZ || 0)) || (a.index - b.index))
        .map((entry) => entry.node)
}
