import { useEffect, useMemo, useState } from 'react'
import { buildAssetMap } from '../../project/viewport/buildAssetMap.js'
import { getNodeType } from '../../project/nodeRegistry.js'
import { resolveSceneLighting, getRawWorldBackgroundColor, pickActiveTypeNode } from '../utils/viewportWorldState.js'
import { createFrameMemory, createNodeGraphContext, evaluateNodeInputs } from '../../project/graph/nodeGraphRuntime.js'
import { wearConstructorGeometry } from '../../project/graph/constructorGeometry.js'
import { useDocumentClock } from '../../project/graph/useDocumentClock.js'

// One evaluation of a document's spatial graph, shared by every renderer that
// has to show it.
//
// It was lifted out of RawViewport's SceneContent unchanged, for a reason worth
// keeping: walk mode renders the same room the orbit view renders, and until
// now the two were separate components with no shared arithmetic — which is
// exactly why a project made of nodes published as a room you could look at
// but never step into. A second copy of this maths is the thing that would let
// them drift apart again, so there is deliberately only one.
//
// `scopeId` keeps its three-valued meaning from viewportWorldState.js:
// `undefined` = unscoped (every spatial node, minus constructor parts),
// `null` = the root room, an id = that container's inside. It is NOT given a
// default here — a default would collapse `undefined` into `null` and silently
// change which nodes a legacy caller sees.

export const isSpatialNode = (node) => getNodeType(node?.typeId)?.render === 'spatial-3d'

// The authored eye is EXPLICIT-ONLY: unlike Light/Background/Grid (additive,
// safe to default to first-created), an active camera hijacks the view — so
// placing a Camera must never steal the shot. Seen 2026-08-20: the palette
// drops spatial nodes at the click point, and the first-created fallback cut
// the room to an accidental floor-level close-up the moment the card landed.
// Only the ● toggle makes a camera the eye.
export const pickAuthoredCameraNode = (nodes, scopeId, activeMap) => {
    const markedId = (activeMap || {})[`world.camera::${scopeId || ''}`]
    if (!markedId) return null
    return (nodes || []).find((node) =>
        node.id === markedId && node.typeId === 'world.camera' && (node.parentId || null) === (scopeId || null)
    ) || null
}

// evaluateNodeInputs plus the one value no input carries: what a Constructor
// is wearing, read off its own Out doors. Computed HERE, where the whole
// document and the running context both exist, because renderNodeBody gets
// only (node, values, assetMap) and threading a context through every call
// site for one type's sake would put the plumbing in eleven files.
export const resolveSpatialValues = (node, graphContext, allNodes) => {
    const values = evaluateNodeInputs(node, graphContext)
    if (node.typeId === 'geom.constructor') {
        values.wornGeometry = wearConstructorGeometry(node, allNodes, graphContext)
    }
    return values
}

export function useGraphSceneModel(document, { scopeId, worldNode = null, liveOutputs = null } = {}) {
    // Keyed on assets + project id so the map only rebuilds when assets change,
    // not on every document identity change from a sync tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const assetMap = useMemo(() => buildAssetMap(document), [document.assets, document.projectMeta?.id])
    // Rebuilt every frame while a Time node exists — the per-pass outputCache
    // must not survive a tick or the clock would freeze at its first sample.
    const clockNow = useDocumentClock(document)
    // Between-pass node state (a Lag's last answer) — this window's own,
    // never React state, dropped whole when the document changes.
    const [frameMemory] = useState(() => createFrameMemory())
    useEffect(() => { frameMemory.clear() }, [frameMemory, document.projectMeta?.id])
    const graphContext = useMemo(
        () => createNodeGraphContext(document, { now: clockNow, liveOutputs, frameMemory }),
        [document, clockNow, liveOutputs, frameMemory]
    )
    // With one carve-out either way: a constructor's parts are its DEFINITION,
    // not standing objects, and the unscoped mode admitted every spatial node
    // flat — so a legacy caller drew the snowman AND its loose spheres side by
    // side, the exact double the childMap rule below exists to prevent.
    const constructorIds = useMemo(
        () => new Set((document.nodes || []).filter((node) => node.typeId === 'geom.constructor').map((node) => node.id)),
        [document.nodes]
    )
    const renderableNodes = useMemo(
        () => (document.nodes || []).filter((node) => (
            isSpatialNode(node)
            && (scopeId === undefined
                ? !constructorIds.has(node.parentId || null)
                : (node.parentId || null) === scopeId)
        )),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [document.nodes, scopeId]
    )
    // Everything standing inside a container, keyed by the container it stands
    // in. Descent stops at a nested universe.world: a World is its own stage,
    // and seeing through one into another would be a different feature.
    //
    // Values are resolved for the WHOLE subtree here, not only the top row —
    // NodeVisual reads node.values directly, so a nested node whose position is
    // wired to a Time node would otherwise freeze the moment it went inside
    // something. That would be the "can't connect" complaint, newly caused by
    // the fix for the other one.
    const childMap = useMemo(() => {
        const spatial = (document.nodes || []).filter(isSpatialNode)
        const byParent = new Map()
        for (const node of spatial) {
            const parentId = node.parentId || null
            if (!parentId) continue
            if (!byParent.has(parentId)) byParent.set(parentId, [])
            byParent.get(parentId).push({ ...node, values: resolveSpatialValues(node, graphContext, document.nodes) })
        }
        for (const [parentId, kids] of byParent) {
            const parent = spatial.find((node) => node.id === parentId)
            // A World is its own stage. A Constructor's inside is a WORKSHOP:
            // the parts standing in it are its definition, and only what
            // reaches a door is its result — drawing both would show a snowman
            // AND its three loose spheres. Same split TouchDesigner draws
            // between a COMP's network and its output.
            if (parent?.typeId === 'universe.world' || parent?.typeId === 'geom.constructor') byParent.set(parentId, [])
            else byParent.set(parentId, kids)
        }
        return byParent
    }, [document.nodes, graphContext])
    const resolvedLight = useMemo(
        () => resolveSceneLighting(document, graphContext, { scopeId }),
        [document, graphContext, scopeId]
    )
    const authoredCameraNode = useMemo(
        () => pickAuthoredCameraNode(document.nodes, scopeId, document.workspaceState?.activeNodeIdByTypeScope),
        [document.nodes, document.workspaceState?.activeNodeIdByTypeScope, scopeId]
    )
    const gridNode = useMemo(
        () => pickActiveTypeNode(document.nodes, 'world.grid', { scopeId, activeMap: document.workspaceState?.activeNodeIdByTypeScope }),
        [document.nodes, document.workspaceState?.activeNodeIdByTypeScope, scopeId]
    )
    const resolvedGrid = gridNode ? evaluateNodeInputs(gridNode, graphContext) : null
    const backgroundColor = getRawWorldBackgroundColor(document, graphContext, { scopeId, worldNode })
    // The same question asked narrowly: null unless the NODES authored a sky.
    // A renderer composing this world over a host that already has one needs to
    // know the difference between "the author chose black" and "nobody chose".
    const authoredBackgroundColor = getRawWorldBackgroundColor(
        document, graphContext, { scopeId, worldNode, fallback: null }
    )

    return {
        assetMap,
        graphContext,
        renderableNodes,
        childMap,
        resolvedLight,
        resolvedGrid,
        authoredCameraNode,
        backgroundColor,
        authoredBackgroundColor,
        // Bound to this pass's context so a caller never has to hold the
        // context and the node list together to ask what a node currently is.
        resolveValues: (node) => resolveSpatialValues(node, graphContext, document.nodes)
    }
}
