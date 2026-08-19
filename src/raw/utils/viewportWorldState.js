import { evaluateNodeInput, evaluateNodeInputs } from '../../project/graph/nodeGraphRuntime.js'

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

// Which world node is "the" world for viewport/panel purposes in a scope:
// standing *inside* a world node, the world is the scope itself (regression
// 2026-08-01: without this, entering a world via "Enter ›" left no world in
// scope and RawEditor's no-world effect instantly cancelled the fullscreen
// the enter handler had just requested). Otherwise pick among the scope's
// world children — the one marked live (workspaceState.liveWorldNodeIdByScope,
// set via the World panel's live toggle), defaulting to first-created.
export function resolveScopeWorldNode(nodes, scopeId, liveWorldNodeIdByScope) {
    const list = nodes || []
    const scopeNode = scopeId ? list.find((node) => node?.id === scopeId) : null
    if (scopeNode?.typeId === 'universe.world') return scopeNode

    const pickAt = (id) => {
        const candidates = list.filter((node) =>
            node?.typeId === 'universe.world' && (node.parentId || null) === (id || null)
        )
        if (!candidates.length) return null
        const liveId = (liveWorldNodeIdByScope || {})[id || '']
        return candidates.find((node) => node.id === liveId) || candidates[0]
    }

    // Walk up to the nearest ancestor that has one. A scope with no World of
    // its own — a 3D Desk, a Studio — is still somewhere you stand and look
    // around; without this the 3D is gated off entirely and entering a desk
    // blanks the stage. The guard bounds a parentId cycle in a damaged
    // document rather than trusting the data.
    const seen = new Set()
    let cursor = scopeId || null
    for (;;) {
        const found = pickAt(cursor)
        if (found) return found
        if (!cursor || seen.has(cursor)) return null
        seen.add(cursor)
        cursor = list.find((node) => node?.id === cursor)?.parentId || null
    }
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
    const worldColor = worldNode ? evaluateNodeInput(worldNode, 'bgColor', graphContext) : null
    if (typeof worldColor === 'string' && worldColor.trim()) return worldColor
    return document?.worldState?.backgroundColor || '#0a0e16'
}
