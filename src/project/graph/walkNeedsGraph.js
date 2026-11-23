// The one question the walk asks before it pays for the node graph: does this
// project have something the graph makes that a visitor sees? Today that is a
// Text node with a wire into `content` (a Text with no wire is a note, as in
// Raw, and stays unseen). Later slices add their case HERE — play.* nodes, a
// light a node drives — and nowhere else; the layer mounts only when this is true.
export const walkNeedsGraph = (document) => {
    const edges = document?.edges || []
    return (document?.nodes || []).some((node) =>
        node.typeId === 'view.text' && edges.some((e) => e.toNodeId === node.id && e.toPort === 'content'))
}
