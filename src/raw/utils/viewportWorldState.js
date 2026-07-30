import { evaluateNodeInputs } from '../../project/graph/nodeGraphRuntime.js'

// Hierarchy-as-connection active-node pick (Kantan Mapper pattern) for
// scope-repeatable types where exactly one "active" result is wanted
// (world.light/world.background/world.grid — see workspaceState.
// activeNodeIdByTypeScope, set via the graph card's own ● toggle in
// RawGraphSurface.jsx). scopeId undefined = unscoped, matches every
// candidate regardless of parentId (used when the caller doesn't have a
// scope concept at all); scopeId null or a real id only matches siblings of
// that scope. Falls back to the first candidate (stable creation order) when
// nothing's been explicitly marked active yet.
export function pickActiveTypeNode(nodes, typeId, { scopeId, activeMap } = {}) {
    const candidates = (nodes || []).filter((node) =>
        node?.typeId === typeId && (scopeId === undefined || (node.parentId || null) === scopeId)
    )
    if (!candidates.length) return null
    if (scopeId === undefined) return candidates[0]
    const key = `${typeId}::${scopeId || ''}`
    const markedId = (activeMap || {})[key]
    return candidates.find((node) => node.id === markedId) || candidates[0]
}

// scopeId undefined = unscoped (old behavior, matches any world.background node
// anywhere). scopeId null or a real id = only match a world.background node that's
// a sibling of the given scope (parentId === scopeId) — root scope is `null`, not
// "unset", so this is intentionally distinct from omitting the option entirely.
// worldNode's own values.bgColor is the fallback once a world.background sibling
// isn't found — makes the World node's own field load-bearing instead of inert.
export function getRawWorldBackgroundColor(document, graphContext = null, { scopeId, worldNode } = {}) {
    const backgroundNode = pickActiveTypeNode(document?.nodes, 'world.background', {
        scopeId,
        activeMap: document?.workspaceState?.activeNodeIdByTypeScope
    })
    const resolvedValues = backgroundNode ? evaluateNodeInputs(backgroundNode, graphContext) : null
    const nodeColor = resolvedValues?.color ?? backgroundNode?.values?.color
    if (typeof nodeColor === 'string' && nodeColor.trim()) return nodeColor
    const worldColor = worldNode?.values?.bgColor
    if (typeof worldColor === 'string' && worldColor.trim()) return worldColor
    return document?.worldState?.backgroundColor || '#0a0e16'
}
