import { Suspense, useMemo } from 'react'
import { Grid } from '@react-three/drei'
import { NodeVisual } from './RawViewport.jsx'
import { useGraphSceneModel } from './useGraphSceneModel.js'
import { resolveScopeWorldNode } from '../utils/viewportWorldState.js'
import SceneEntityErrorBoundary from '../../components/SceneEntityErrorBoundary.jsx'

// A document's spatial nodes, rendered inside SOMEONE ELSE'S Canvas.
//
// This is the piece that was missing between the two lanes. `RawViewport`
// could always draw a node room, but it owns a Canvas and an OrbitControls, so
// the only way to see one was to look at it from outside. Walk mode
// (`LiveProjectScene`) owns the walker, the collision bounds and the whole of
// XR — and rendered `entities` and nothing else. So a project made of nodes
// published as a room a visitor could look at and never step into, and since
// Enter VR/AR live inside walk mode, it had no headset door at all.
//
// Mounting this in that Canvas closes it. Nothing here is a second renderer:
// the node bodies are `NodeVisual`, the same component the editor viewport
// draws, and the graph is evaluated by the same hook — see the note in
// useGraphSceneModel.js about why there is deliberately only one copy.
//
// READ-ONLY BY ABSENCE, the way /out is. No selection, no drag handlers, no
// double-click to place: every pointer is a no-op because the handler is not
// there, not because a guard turned it away. That also keeps `raw.css` out of
// this path — the only DOM `<Html>` in NodeVisual is the selection pill, which
// needs a selection to exist, and there is never one here. (PublicGraphSurface
// pays that stylesheet cost for a reason it documents; this does not have to.)
//
// THE WORLD IS COMPOSED, NOT REPLACED. The host already lights and colours its
// own room. This adds the node lane's sky, light and grid ONLY where the node
// lane actually authors one, and stays silent otherwise — so a mixed room whose
// world was set in Studio keeps exactly the world it had, and a room whose
// Scene node names a sky gets that sky in walk mode too, matching what the
// visitor was just looking at in orbit.
export default function GraphSceneBodies({
    document,
    scopeId = null,
    liveOutputs = null,
    // The host's own world stays unless the nodes speak. Pass false where this
    // is the only thing in the Canvas and the node lane's defaults should win
    // outright.
    composeWorld = true
}) {
    const worldNode = useMemo(
        () => resolveScopeWorldNode(document?.nodes, scopeId, document?.workspaceState?.liveWorldNodeIdByScope),
        [document?.nodes, document?.workspaceState?.liveWorldNodeIdByScope, scopeId]
    )
    const {
        assetMap,
        renderableNodes,
        childMap,
        resolvedLight,
        resolvedGrid,
        authoredCameraNode,
        authoredBackgroundColor,
        resolveValues
    } = useGraphSceneModel(document, { scopeId, worldNode, liveOutputs })

    // The active camera's body is dropped for the same reason the editor drops
    // it: in orbit the room is seen THROUGH it. In walk mode the visitor is the
    // eye and the housing could safely be drawn — but then stepping in would
    // ADD an object that was not there a moment ago, and the whole point of
    // this component is that both views show one room.
    const bodies = renderableNodes.filter((node) => node.id !== authoredCameraNode?.id)

    return (
        <>
            {composeWorld && authoredBackgroundColor ? (
                <color attach="background" args={[authoredBackgroundColor]} />
            ) : null}
            {composeWorld && resolvedLight ? (
                <>
                    <ambientLight
                        color={resolvedLight.ambientColor ?? '#ffffff'}
                        intensity={resolvedLight.ambientIntensity ?? 0.8}
                    />
                    <directionalLight
                        color={resolvedLight.directionalColor ?? '#fff7ea'}
                        intensity={resolvedLight.directionalIntensity ?? 1.05}
                        position={resolvedLight.directionalPosition ?? [8, 12, 4]}
                    />
                </>
            ) : null}
            {composeWorld && resolvedGrid && resolvedGrid.visible !== false ? (
                <Grid
                    args={[resolvedGrid.size ?? 24, resolvedGrid.size ?? 24]}
                    cellColor={resolvedGrid.color ?? 'rgba(255,255,255,0.10)'}
                    sectionColor={resolvedGrid.color ?? 'rgba(255,255,255,0.22)'}
                    position={[0, 0, 0]}
                    fadeDistance={60}
                    fadeStrength={1}
                />
            ) : null}
            <Suspense fallback={null}>
                {/* Boundaried per node, like the editor's: a node can load an
                    arbitrary file off someone's disk, and a corrupt mesh must
                    cost that one node, not the room a visitor is standing in. */}
                {bodies.map((node) => (
                    <SceneEntityErrorBoundary key={node.id} resetKey={node.id}>
                        <NodeVisual
                            node={{ ...node, values: resolveValues(node) }}
                            selected={false}
                            onSelect={null}
                            childMap={childMap}
                            assetMap={assetMap}
                            showSelectionPills={false}
                        />
                    </SceneEntityErrorBoundary>
                ))}
            </Suspense>
        </>
    )
}
