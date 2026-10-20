import { Suspense, useEffect, useMemo, useState } from 'react'
import { buildAssetMap } from '../../project/viewport/buildAssetMap.js'
import { createFrameMemory, createNodeGraphContext } from '../../project/graph/nodeGraphRuntime.js'
import { useDocumentClock } from '../../project/graph/useDocumentClock.js'
import SceneEntityErrorBoundary from '../../components/SceneEntityErrorBoundary.jsx'
import {
    NodeVisual,
    buildSpatialChildMap,
    isSpatialNode,
    pickAuthoredCameraNode,
    resolveSpatialValues
} from './RawViewport.jsx'

// The things Nodes made, drawn inside SOMEONE ELSE'S Canvas — Studio's room.
//
// Not a second renderer. Every body is Nodes' own NodeVisual/renderNodeBody,
// the graph is evaluated by the same runtime, and what a container shows is
// the same buildSpatialChildMap Nodes' room uses — so a Geo of two cubes
// stands in Studio exactly as it stands in Nodes' Scene window. (The idea is
// the one origin/worktree-connect-graph-walk had in GraphSceneBodies.jsx,
// redone slim on today's RawViewport rather than merged.)
//
// `scopeId`: null is the top room — what Nodes' room shows at Home; a Geo's id
// is that Geo's inside, the same room Nodes shows after "›" into it. Things
// inside it stand at their own values, local to the Geo.
//
// Read-only by absence, as /out is: with no onSelectNode nothing here takes a
// click. Given one, a click on a thing standing in this scope selects it (a
// click on something nested inside it bubbles up to it, as in Nodes' room),
// and `registerGroup(id, object3d)` hands the host each top-level group so it
// can hang its own gizmo on the selected one.
//
// The host keeps its own sky and lights: this adds bodies only. A lamp node
// is a real point light wherever it stands, as it is in Nodes.
export default function GraphRoomNodes({
    document,
    scopeId = null,
    selectedNodeId = null,
    onSelectNode = null,
    registerGroup = null,
    liveOutputs = null
}) {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const assetMap = useMemo(() => buildAssetMap(document), [document.assets, document.projectMeta?.id])
    const clockNow = useDocumentClock(document)
    const [frameMemory] = useState(() => createFrameMemory())
    useEffect(() => { frameMemory.clear() }, [frameMemory, document.projectMeta?.id])
    const graphContext = useMemo(
        () => createNodeGraphContext(document, { now: clockNow, liveOutputs, frameMemory }),
        [document, clockNow, liveOutputs, frameMemory]
    )
    const childMap = useMemo(() => buildSpatialChildMap(document.nodes, graphContext), [document.nodes, graphContext])
    // The scope's active Camera is the eye in Nodes, never a body in the room.
    const authoredCameraId = useMemo(
        () => pickAuthoredCameraNode(document.nodes, scopeId, document.workspaceState?.activeNodeIdByTypeScope)?.id || null,
        [document.nodes, document.workspaceState?.activeNodeIdByTypeScope, scopeId]
    )
    const standing = useMemo(
        () => (document.nodes || []).filter((node) => isSpatialNode(node)
            && (node.parentId || null) === (scopeId || null)
            && node.id !== authoredCameraId),
        [document.nodes, scopeId, authoredCameraId]
    )
    if (!standing.length) return null

    return (
        <Suspense fallback={null}>
            {standing.map((node) => (
                <SceneEntityErrorBoundary key={node.id} resetKey={node.id}>
                    <NodeVisual
                        node={{ ...node, values: resolveSpatialValues(node, graphContext, document.nodes) }}
                        selected={node.id === selectedNodeId}
                        onSelect={onSelectNode}
                        onSelectNode={onSelectNode}
                        selectedNodeId={selectedNodeId}
                        childMap={childMap}
                        assetMap={assetMap}
                        // The host draws its own selection (Studio's outline and
                        // name pill); Nodes' pill is Nodes' language.
                        showSelectionPills={false}
                        groupRef={registerGroup ? (object) => registerGroup(node.id, object) : null}
                    />
                </SceneEntityErrorBoundary>
            ))}
        </Suspense>
    )
}
