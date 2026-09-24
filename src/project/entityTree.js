// WHAT STANDS UNDER WHAT, among the things in a project.
//
// Studio's groups are a tree: a grouped thing keeps its place RELATIVE to its
// group (StudioEditor's handleGroupSelected subtracts the group's centre), and
// Studio draws it inside the group's transform (StudioViewport.jsx,
// SceneEntityNode). Nodes' room drew every thing from the room's centre, so a
// grouped box stood somewhere else there than in Studio — seen 2026-09-23: a
// group moved 2.5 units right in Studio, its two boxes stayed in the middle of
// Nodes' room, sunk into the floor.
//
// One reading of the tree, shared by the room that draws things and the canvas
// that lists them, so the two can never disagree about where a thing stands.
//
// A thing whose parent is not in the project is a ROOT here, not dropped: the
// room drew it before this tree existed, and a thing that vanishes because a
// field points nowhere is worse than one that stands in the top room.

export function buildEntityTree(entities = []) {
    const list = (Array.isArray(entities) ? entities : []).filter((entity) => entity && entity.id)
    const ids = new Set(list.map((entity) => entity.id))
    const childrenOf = new Map()
    const roots = []
    for (const entity of list) {
        const parentId = entity.parentId || null
        if (parentId && parentId !== entity.id && ids.has(parentId)) {
            if (!childrenOf.has(parentId)) childrenOf.set(parentId, [])
            childrenOf.get(parentId).push(entity)
        } else {
            roots.push(entity)
        }
    }
    return { roots, childrenOf }
}

/**
 * Every thing in tree order — each root, then what stands under it, depth
 * first — with its depth. A parent cycle (a→b→a) is unreachable from any root
 * and so is never walked, the same as Studio, which draws from its roots too.
 */
export function walkEntityTree(entities = []) {
    const { roots, childrenOf } = buildEntityTree(entities)
    const out = []
    const seen = new Set()
    const visit = (entity, depth, parentId) => {
        if (seen.has(entity.id)) return
        seen.add(entity.id)
        out.push({ entity, depth, parentId })
        for (const child of childrenOf.get(entity.id) || []) visit(child, depth + 1, entity.id)
    }
    for (const root of roots) visit(root, 0, null)
    return out
}
