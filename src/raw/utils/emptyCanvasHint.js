// What the ROOT of an empty graph says. Pulled out of RawEditor because the
// document for a server project arrives through sync, which every test mocks —
// so the one sentence that decides whether a crossing from Studio reads as
// "your project is here" or "your project is gone" was unreachable from a test.

export const describeRootEmptyCanvas = ({ isLocalWorkspace = false, entityCount = 0, pointerVerb = 'Double-click' } = {}) => {
    // Which canvas this is, before what to do in it: an empty workspace opens in
    // zen, which hides the topbar, so nothing else on screen tells a first-time
    // visitor that this surface keeps nothing.
    if (isLocalWorkspace) {
        return `A canvas in this browser — nothing here is saved to a space yet. ${pointerVerb} to place your first node.`
    }
    // A project authored in Studio has objects and no nodes. The graph is
    // honestly empty; "place your first node" is not — it reads as "this project
    // is empty" about work standing in the room next door.
    if (entityCount > 0) {
        const count = `${entityCount} object${entityCount === 1 ? '' : 's'}`
        return `Built in Studio — ${count} in the room, no nodes yet. See the room, or ${pointerVerb} to add the first node to it.`
    }
    return `${pointerVerb} to place your first node.`
}
