// Which card is selected belongs to the person looking, not to the project.
//
// Raw used to keep `workspaceState.selectedNodeId` in the shared document, so a
// plain click on a card POSTed a setWorkspaceState op to the project's op log:
// every viewer's documentVersion moved, and one person's click moved another
// person's selection (NOPA audit F4, 2026-10-02). Studio's graph already kept
// its selection in component state (StudioGraphSurface.jsx).
//
// The editor still SPEAKS in selection ops — create-and-select, undo of a
// delete, entering a scope — so rather than rewrite every call site, the batch
// is split on its way to the sync layer: the selection is handed back to be
// held locally and only what is truly shared travels.
//
// Returns { ops, selection }: `selection` is undefined when the batch says
// nothing about it, else the id (or null for a clear). The last one wins.
export function splitSelectionOps(input) {
    const listed = (Array.isArray(input) ? input : [input]).filter(Boolean)
    let selection
    const ops = []
    for (const op of listed) {
        const patch = op?.type === 'setWorkspaceState' ? op.payload?.patch : null
        if (!patch || !Object.prototype.hasOwnProperty.call(patch, 'selectedNodeId')) {
            ops.push(op)
            continue
        }
        selection = patch.selectedNodeId || null
        const { selectedNodeId: _dropped, ...rest } = patch
        if (Object.keys(rest).length) {
            ops.push({ ...op, payload: { ...op.payload, patch: rest } })
        }
    }
    return { ops, selection }
}
