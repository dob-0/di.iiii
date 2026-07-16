import { evaluateNodeInputs } from '../../project/graph/nodeGraphRuntime.js'

// scopeId undefined = unscoped (old behavior, matches any world.background node
// anywhere). scopeId null or a real id = only match a world.background node that's
// a sibling of the given scope (parentId === scopeId) — root scope is `null`, not
// "unset", so this is intentionally distinct from omitting the option entirely.
// worldNode's own values.bgColor is the fallback once a world.background sibling
// isn't found — makes the World node's own field load-bearing instead of inert.
export function getBetaWorldBackgroundColor(document, graphContext = null, { scopeId, worldNode } = {}) {
    const backgroundNode = (document?.nodes || []).find((node) =>
        node?.typeId === 'world.background' && (scopeId === undefined || (node.parentId || null) === scopeId)
    )
    const resolvedValues = backgroundNode ? evaluateNodeInputs(backgroundNode, graphContext) : null
    const nodeColor = resolvedValues?.color ?? backgroundNode?.values?.color
    if (typeof nodeColor === 'string' && nodeColor.trim()) return nodeColor
    const worldColor = worldNode?.values?.bgColor
    if (typeof worldColor === 'string' && worldColor.trim()) return worldColor
    return document?.worldState?.backgroundColor || '#0a0e16'
}
