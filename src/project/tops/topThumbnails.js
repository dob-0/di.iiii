// Where a card's picture goes. A node card registers its small 2D canvas
// here under its node id; whichever network runner is live on the page copies
// that operator's output into it. A module-level map rather than props, because
// the cards are drawn by the graph surface and the runner lives in the editor,
// and threading a canvas through both would touch every card in the graph.
const targets = new Map()

export const registerTopThumbnail = (nodeId, context) => {
    if (!nodeId || !context) return () => {}
    targets.set(nodeId, context)
    return () => {
        if (targets.get(nodeId) === context) targets.delete(nodeId)
    }
}

export const topThumbnailTargets = () => targets
