import { useCallback, useEffect, useMemo, useState } from 'react'

// Node-graph "scope" navigation: a breadcrumb stack of node ids, where
// entering a node makes its interior the current authoring surface (nodes
// created next are children of it). Lane-agnostic — Raw's floating-window
// shell and (eventually) a Studio graph panel both need the same concept.
// UI-shell side effects that ride along with navigation (e.g. Raw's
// world-fullscreen toggle when entering a world node) stay in the caller;
// this hook only owns the stack itself.
// Where a selection is allowed to be VISIBLE: only in the scope where the
// node actually stands. The root scope is null; a node's home is its
// parentId. Everything the editor shows about a selection — inspector,
// Delete, pills — hangs off this one predicate.
export const isNodeInScope = (node, scopeId) =>
    Boolean(node) && (node.parentId || null) === (scopeId || null)

export function useNodeGraphScope({ nodes, rootTypeId = null }) {
    const [navStack, setNavStack] = useState([null])

    const hasRootNode = useMemo(
        () => Boolean(rootTypeId) && nodes.some((node) => node.typeId === rootTypeId),
        [nodes, rootTypeId]
    )

    // Auto-enter the root node's scope on load or when it first appears.
    useEffect(() => {
        if (!hasRootNode) return
        const rootNode = nodes.find((node) => node.typeId === rootTypeId)
        if (rootNode) setNavStack((prev) => (prev.includes(rootNode.id) ? prev : [null, rootNode.id]))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasRootNode])

    // Truncate the stack when a scoped node is deleted — prevents a ghost scope.
    useEffect(() => {
        const nodeIds = new Set(nodes.map((node) => node.id))
        setNavStack((prev) => {
            const cutAt = prev.findIndex((id) => id !== null && !nodeIds.has(id))
            if (cutAt === -1) return prev
            const next = prev.slice(0, cutAt)
            return next.length > 0 ? next : [null]
        })
    }, [nodes])

    const currentScopeId = navStack[navStack.length - 1]

    const enterNode = useCallback((nodeId) => {
        setNavStack((prev) => [...prev, nodeId])
    }, [])

    const navigateToScope = useCallback((targetIndex) => {
        setNavStack((prev) => prev.slice(0, targetIndex + 1))
    }, [])

    // Jump directly to a top-level node's interior, replacing the whole
    // stack rather than pushing onto it (e.g. "start from the root node"
    // shortcuts that don't care what scope the user was previously in).
    const goToRoot = useCallback((nodeId) => setNavStack([null, nodeId]), [])

    const reset = useCallback(() => setNavStack([null]), [])

    return { navStack, currentScopeId, enterNode, navigateToScope, goToRoot, reset }
}
