// Where a card's picture goes. A node card registers its small 2D canvas
// here under its node id; whichever network runner is live on the page copies
// that operator's output into it. A module-level map rather than props, because
// the cards are drawn by the graph surface and the runner lives in the editor,
// and threading a canvas through both would touch every card in the graph.
//
// One id can have several canvases at once — a VJ deck's master shows on its
// card and in its window side by side — so each id holds a list, newest last.
const targets = new Map()

export const registerTopThumbnail = (nodeId, context) => {
    if (!nodeId || !context) return () => {}
    const list = targets.get(nodeId) || []
    if (!list.includes(context)) list.push(context)
    targets.set(nodeId, list)
    return () => {
        const current = targets.get(nodeId)
        if (!current) return
        const next = current.filter((item) => item !== context)
        if (next.length) targets.set(nodeId, next)
        else targets.delete(nodeId)
    }
}

/** nodeId → its newest canvas context. */
export const topThumbnailTargets = () => new Map([...targets].map(([nodeId, list]) => [nodeId, list[list.length - 1]]))

/** Every canvas context registered for one node id. */
export const topThumbnailsFor = (nodeId) => [...(targets.get(nodeId) || [])]

/**
 * Every registration as a list of maps (nodeId → context), each map holding an
 * id at most once: the first map has every id, the next only ids with a second
 * canvas, and so on. Usually one map.
 */
export const topThumbnailGroups = () => {
    const groups = []
    for (const [nodeId, list] of targets) {
        list.forEach((context, index) => {
            if (!groups[index]) groups[index] = new Map()
            groups[index].set(nodeId, context)
        })
    }
    return groups
}
