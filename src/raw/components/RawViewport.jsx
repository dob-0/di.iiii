import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, Html, OrbitControls, useTexture } from '@react-three/drei'
import BoxObject from '../../objectComponents/BoxObject.jsx'
import SphereObject from '../../objectComponents/SphereObject.jsx'
import ModelObject from '../../objectComponents/ModelObject.jsx'
import VideoObject from '../../objectComponents/VideoObject.jsx'
import AudioObject from '../../objectComponents/AudioObject.jsx'
import { detectModelFormatFromMeta } from '../../utils/modelFormats.js'
import EntityContent from '../../project/viewport/EntityContent.jsx'
import { buildAssetMap } from '../../project/viewport/buildAssetMap.js'
import { getNodeType } from '../../project/nodeRegistry.js'
import { resolveSceneLighting, getRawWorldBackgroundColor, pickActiveTypeNode } from '../utils/viewportWorldState.js'
import { createNodeGraphContext, evaluateNodeInputs } from '../../project/graph/nodeGraphRuntime.js'
import { wearConstructorGeometry } from '../../project/graph/constructorGeometry.js'
import { pruneGeometryDescriptor } from '../../project/graph/geometryDescriptor.js'
import { createTapTracker } from '../utils/useDoubleTap.js'
import { hasClockNode, useGraphClock } from '../../project/graph/useGraphClock.js'
import { WebglContextLostOverlay, useWebglContextGuard } from '../../components/WebglContextGuard.jsx'
import { asColor } from '../../utils/colorValue.js'
import SceneEntityErrorBoundary from '../../components/SceneEntityErrorBoundary.jsx'

const isSpatialNode = (node) => getNodeType(node?.typeId)?.render === 'spatial-3d'

// The authored eye is EXPLICIT-ONLY: unlike Light/Background/Grid (additive,
// safe to default to first-created), an active camera hijacks the view — so
// placing a Camera must never steal the shot. Seen 2026-08-20: the palette
// drops spatial nodes at the click point, and the first-created fallback cut
// the room to an accidental floor-level close-up the moment the card landed.
// Only the ● toggle makes a camera the eye.
const pickAuthoredCameraNode = (nodes, scopeId, activeMap) => {
    const markedId = (activeMap || {})[`world.camera::${scopeId || ''}`]
    if (!markedId) return null
    return (nodes || []).find((node) =>
        node.id === markedId && node.typeId === 'world.camera' && (node.parentId || null) === (scopeId || null)
    ) || null
}

// A mesh that is drawn but never picked.
const NO_RAYCAST = () => null

const asFiniteNumber = (value, fallback = 0) => {
    const next = Number(value)
    return Number.isFinite(next) ? next : fallback
}

const asVec3 = (value, fallback = [0, 0, 0]) => {
    if (!Array.isArray(value)) return fallback
    return [
        asFiniteNumber(value[0], fallback[0]),
        asFiniteNumber(value[1], fallback[1]),
        asFiniteNumber(value[2], fallback[2])
    ]
}

const asPositiveVec3 = (value, fallback = [1, 1, 1], min = 0.001, max = 100) => {
    const vec = asVec3(value, fallback)
    return vec.map((entry, index) => {
        const next = Math.abs(asFiniteNumber(entry, fallback[index]))
        return Math.min(max, Math.max(min, next))
    })
}


function EntityVisual({ entity, assetMap, selected, onSelect, showSelectionPills = true }) {
    const transform = entity.components?.transform || {}
    const content = <EntityContent entity={entity} assetMap={assetMap} />

    return (
        <group
            position={transform.position || [0, 0, 0]}
            rotation={transform.rotation || [0, 0, 0]}
            scale={transform.scale || [1, 1, 1]}
            onClick={(event) => {
                event.stopPropagation()
                onSelect?.(entity.id)
            }}
        >
            {content}
            {selected && showSelectionPills && (
                <Html position={[0, 1.8, 0]} center>
                    <span className="raw-selection-pill">{entity.name}</span>
                </Html>
            )}
        </group>
    )
}

function PlaneWithTexture({ w, h, textureUrl }) {
    const texture = useTexture(textureUrl)
    return (
        <mesh>
            <planeGeometry args={[w, h]} />
            <meshStandardMaterial map={texture} color="#ffffff" side={2} />
        </mesh>
    )
}

// assetMap is optional so the pre-existing two-argument calls (and tests) keep
// working; only the file-backed cases below need it. Without it those nodes
// render nothing rather than throwing — a node with no file chosen yet is a
// normal state, not an error.
// Turns a geometry descriptor — plain data off a wire — into meshes. The
// counterpart of renderNodeBody's per-type cases, for shapes that arrived by
// value instead of by standing in the room. Same components as the standing
// versions (BoxObject, SphereObject), so a cube worn by a Constructor and a
// cube standing beside it are pixel-identical by construction.
//
// The caps live in pruneGeometryDescriptor — a pure pass that hands this
// component a tree already inside MAX_GEOMETRY_PIECES/DEPTH. The render walk
// itself holds no budget: the old shared mutable countdown was safe only
// while R3F v8 kept StrictMode out of the Canvas, and a double-invoked render
// would have silently halved the cap on the v9 upgrade.
function GeometryPieces({ descriptor, pruned = false }) {
    const shaped = pruned ? descriptor : pruneGeometryDescriptor(descriptor)
    if (!shaped) return null
    if (shaped.kind === 'group') {
        return (
            <group
                position={asVec3(shaped.position, [0, 0, 0])}
                rotation={asVec3(shaped.rotation, [0, 0, 0])}
                scale={asPositiveVec3(shaped.scale, [1, 1, 1], 0.001, 20)}
            >
                {shaped.children.map((child, index) => (
                    <GeometryPieces key={index} descriptor={child} pruned />
                ))}
            </group>
        )
    }
    const descriptorLeaf = shaped
    const place = {
        position: asVec3(descriptorLeaf.position, [0, 0, 0]),
        rotation: asVec3(descriptorLeaf.rotation, [0, 0, 0])
    }
    switch (descriptorLeaf.kind) {
        case 'box':
            return (
                <group {...place}>
                    <BoxObject color={asColor(descriptorLeaf.color, '#5fa8ff')} boxSize={asPositiveVec3(descriptorLeaf.size, [1, 1, 1])} />
                </group>
            )
        case 'sphere':
            return (
                <group {...place}>
                    <SphereObject
                        color={asColor(descriptorLeaf.color, '#5fa8ff')}
                        sphereRadius={Math.min(100, Math.max(0.001, Math.abs(asFiniteNumber(descriptorLeaf.radius, 0.5))))}
                    />
                </group>
            )
        case 'plane':
            return (
                <mesh {...place}>
                    <planeGeometry args={[
                        Math.min(100, Math.max(0.001, Math.abs(asFiniteNumber(descriptorLeaf.width, 2)))),
                        Math.min(100, Math.max(0.001, Math.abs(asFiniteNumber(descriptorLeaf.height, 2))))
                    ]} />
                    <meshStandardMaterial color={asColor(descriptorLeaf.color, '#ffffff')} side={2} />
                </mesh>
            )
        default:
            return null
    }
}

// evaluateNodeInputs plus the one value no input carries: what a Constructor
// is wearing, read off its own Out doors. Computed HERE, where the whole
// document and the running context both exist, because renderNodeBody gets
// only (node, values, assetMap) and threading a context through every call
// site for one type's sake would put the plumbing in eleven files.
const resolveSpatialValues = (node, graphContext, allNodes) => {
    const values = evaluateNodeInputs(node, graphContext)
    if (node.typeId === 'geom.constructor') {
        values.wornGeometry = wearConstructorGeometry(node, allNodes, graphContext)
    }
    return values
}

export function renderNodeBody(node, values, assetMap = null) {
    switch (node.typeId) {
        case 'geom.model': {
            const asset = values.src ? assetMap?.get(values.src) : null
            if (!asset) return null
            return (
                <ModelObject
                    assetRef={asset}
                    data={asset.url || null}
                    modelFormat={detectModelFormatFromMeta(asset)}
                    applyModelColor={false}
                    playAnimations={values.playAnimations !== false}
                    animationSpeed={asFiniteNumber(values.animationSpeed, 1)}
                    animationClip={values.animationClip || ''}
                />
            )
        }
        case 'media.video': {
            const asset = values.src ? assetMap?.get(values.src) : null
            if (!asset) return null
            return (
                <VideoObject
                    assetRef={asset}
                    data={asset.url || null}
                    muted={values.muted !== false}
                    volume={Math.min(1, Math.max(0, asFiniteNumber(values.volume, 1)))}
                    loop={values.loop !== false}
                />
            )
        }
        case 'media.audio': {
            const asset = values.src ? assetMap?.get(values.src) : null
            if (!asset) return null
            return (
                <AudioObject
                    assetRef={asset}
                    data={asset.url || null}
                    audioVolume={Math.min(1, Math.max(0, asFiniteNumber(values.volume, 1)))}
                    audioDistance={Math.max(0, asFiniteNumber(values.distance, 10))}
                    audioLoop={values.loop !== false}
                    audioAutoplay={values.autoplay !== false}
                    audioPaused={false}
                />
            )
        }
        case 'geom.cube':
            return <BoxObject color={values.color || '#5fa8ff'} boxSize={asPositiveVec3(values.size, [1, 1, 1])} />
        case 'geom.sphere':
            return <SphereObject color={values.color || '#5fa8ff'} sphereRadius={Math.min(100, Math.max(0.001, Math.abs(asFiniteNumber(values.radius, 0.6))))} />
        case 'geom.plane': {
            const w = Math.min(100, Math.max(0.001, Math.abs(asFiniteNumber(values.width, 1))))
            const h = Math.min(100, Math.max(0.001, Math.abs(asFiniteNumber(values.height, 1))))
            // A live texture (source.webcam.frame etc.) wins over textureUrl —
            // it's a THREE.Texture instance from the graph's liveOutputs, not
            // a loadable URL, so it renders directly instead of via useTexture.
            if (values.texture?.isTexture) {
                return (
                    <mesh>
                        <planeGeometry args={[w, h]} />
                        <meshStandardMaterial map={values.texture} color="#ffffff" side={2} />
                    </mesh>
                )
            }
            if (values.textureUrl) {
                return <PlaneWithTexture w={w} h={h} textureUrl={values.textureUrl} />
            }
            return (
                <mesh>
                    <planeGeometry args={[w, h]} />
                    <meshStandardMaterial color={asColor(values.color, '#5fa8ff')} side={2} />
                </mesh>
            )
        }
        // A registered node type with no case here silently rendered
        // nothing when placed in World (it's category:'universe',
        // render:'spatial-3d', so it IS eligible for World's palette) -
        // audit finding #22. Represented as a translucent boundary box
        // tinted by its own bgColor field, with a small floor grid when
        // gridVisible is on - values.scale already sizes it via the outer
        // group transform (see NodeVisual), so this only needs a unit body.
        case 'geom.constructor':
            // Wearing something: the doors' geometry IS the body. Wearing
            // nothing: a wireframe placeholder in the geometry port's own hue,
            // so "not wired yet" and "wired to something invisible" cannot be
            // confused — an unwired door carries undefined and draws nothing,
            // this draws a frame saying "shape goes here".
            if (values.wornGeometry) {
                return <GeometryPieces descriptor={values.wornGeometry} />
            }
            return (
                <group>
                    <mesh>
                        <boxGeometry args={[1, 1, 1]} />
                        <meshStandardMaterial color="#bd93f9" transparent opacity={0.08} />
                    </mesh>
                    <mesh>
                        <boxGeometry args={[1, 1, 1]} />
                        <meshBasicMaterial color="#bd93f9" wireframe />
                    </mesh>
                </group>
            )
        case 'geom.geo':
            // A PLACE, visibly, even empty. The faint floor tile is the geo's
            // footprint — "no even grid, nothing in it" was the owner's exact
            // report of an empty container reading as void. Children render
            // through the childMap like any spatial parent's; this body adds
            // nothing else, which is the whole point of the type.
            return (
                <group>
                    {/* the pickable ground of the place — near-invisible but
                        clickable, so an empty geo can still be selected and
                        dragged in the room */}
                    <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[2, 2]} />
                        <meshBasicMaterial color="#4df9ff" transparent opacity={0.05} side={2} />
                    </mesh>
                    <Grid
                        args={[2, 2]}
                        position={[0, 0.02, 0]}
                        cellSize={0.25}
                        sectionSize={1}
                        cellColor="rgba(77,249,255,0.35)"
                        sectionColor="rgba(77,249,255,0.6)"
                        fadeDistance={14}
                        infiniteGrid={false}
                    />
                </group>
            )
        case 'world.light':
            // Standing INSIDE a container, a Light is a real point light plus
            // a small glowing marker — "collect what you need: object,
            // light…". Unparented at root it draws nothing, so every existing
            // document keeps exactly the look it had (there, Light is the
            // per-scope ambient/directional settings card it always was).
            if (!node.parentId) return null
            return (
                <group>
                    <pointLight
                        color={asColor(values.color, '#ffe9c4')}
                        intensity={Math.max(0, asFiniteNumber(values.intensity, 6))}
                        distance={0}
                        decay={2}
                    />
                    <mesh>
                        <sphereGeometry args={[0.07, 12, 12]} />
                        <meshStandardMaterial
                            color={asColor(values.color, '#ffe9c4')}
                            emissive={asColor(values.color, '#ffe9c4')}
                            emissiveIntensity={2}
                        />
                    </mesh>
                </group>
            )
        case 'light.point':
            // The lamp half of the old dual Light, standing on its own two
            // feet: a real point light wherever it is — root included, which
            // is exactly what the legacy node refused to be.
            return (
                <group>
                    <pointLight
                        color={asColor(values.color, '#ffe9c4')}
                        intensity={Math.max(0, asFiniteNumber(values.intensity, 6))}
                        distance={0}
                        decay={2}
                    />
                    <mesh>
                        <sphereGeometry args={[0.07, 12, 12]} />
                        <meshStandardMaterial
                            color={asColor(values.color, '#ffe9c4')}
                            emissive={asColor(values.color, '#ffe9c4')}
                            emissiveIntensity={2}
                        />
                    </mesh>
                </group>
            )
        case 'world.camera': {
            // The eye you can pick up: a small housing with a lens cone aimed
            // at its Look At. Only INACTIVE cameras are drawn — the active one
            // is what the room is seen through (SceneContent filters it out;
            // a housing centred on the near plane would only shed clipped
            // fragments).
            const camPos = asVec3(values.position, [0, 2.4, 6.5])
            const camLook = asVec3(values.lookAt, [0, 0.75, 0])
            const dx = camLook[0] - camPos[0]
            const dy = camLook[1] - camPos[1]
            const dz = camLook[2] - camPos[2]
            const yaw = Math.atan2(dx, dz)
            const pitch = -Math.atan2(dy, Math.sqrt(dx * dx + dz * dz) || 1)
            return (
                <group rotation={[0, yaw, 0]}>
                    <group rotation={[pitch, 0, 0]}>
                        <mesh>
                            <boxGeometry args={[0.22, 0.16, 0.28]} />
                            <meshStandardMaterial color="#9aa7ff" />
                        </mesh>
                        <mesh position={[0, 0, 0.24]} rotation={[Math.PI / 2, 0, 0]}>
                            <coneGeometry args={[0.09, 0.16, 12, 1, true]} />
                            <meshStandardMaterial color="#dfe6ff" wireframe />
                        </mesh>
                    </group>
                </group>
            )
        }
        case 'universe.desk.3d':
            // The shell takes no clicks: it wraps whatever stands inside it, so
            // a pickable skin would swallow every pointer aimed at its contents
            // and nothing in the desk could be selected or dragged.
            return (
                <group>
                    <mesh raycast={NO_RAYCAST}>
                        <boxGeometry args={[1, 1, 1]} />
                        <meshStandardMaterial color={asColor(values.bgColor, '#0a0e16')} transparent opacity={0.35} />
                    </mesh>
                    <mesh raycast={NO_RAYCAST}>
                        <boxGeometry args={[1, 1, 1]} />
                        <meshBasicMaterial color={asColor(values.bgColor, '#0a0e16')} wireframe />
                    </mesh>
                    {values.gridVisible !== false && (
                        <Grid args={[1, 1]} position={[0, -0.5, 0]} cellSize={0.1} sectionSize={0.5} fadeDistance={2} infiniteGrid={false} />
                    )}
                </group>
            )
        default:
            return null
    }
}

// A node and everything standing on it. A container's children render INSIDE
// its own <group>, so moving, turning or scaling the container carries its
// contents with it — the geo-COMP behaviour, and the reason a table can have
// props on it.
//
// nodeScale is the workspace's own zoom and belongs to the whole scene, not to
// each object: applied per level it would compound with depth, so it is folded
// in at the roots only and passed down as 1.
function NodeVisual({
    node,
    selected,
    onSelect,
    onPointerDown,
    nodeScale = 1,
    assetMap = null,
    childMap = null,
    selectedNodeId = null,
    onSelectNode = null,
    depth = 0,
    showSelectionPills = true
}) {
    const values = node.values || {}
    const scale = asPositiveVec3(values.scale, [1, 1, 1], 0.001, 20)
    const safeNodeScale = Math.min(4, Math.max(0.25, asFiniteNumber(nodeScale, 1)))
    const nodeScaleFactor = [
        scale[0] * safeNodeScale,
        scale[1] * safeNodeScale,
        scale[2] * safeNodeScale
    ]
    const body = renderNodeBody(node, values, assetMap)
    const children = childMap?.get(node.id) || []
    // A container with no body of its own is still a place. Returning null on
    // an empty body used to be right; now it would swallow everything standing
    // inside it.
    if (!body && !children.length) return null

    return (
        <group
            position={asVec3(values.position, [0, 0, 0])}
            rotation={asVec3(values.rotation, [0, 0, 0])}
            scale={nodeScaleFactor}
            onPointerDown={onPointerDown}
            // The room selects what stands in THIS room. A nested node gets no
            // click of its own (onSelect null) so the click bubbles to the
            // scope-level node — clicking a cube inside a Geo picks up the GEO,
            // the thing this room can actually move. Enter the Geo and the cube
            // is scope-level there, selectable again. While the child also
            // self-selected, the pill said "Cube", the inspector edited the
            // cube, and the Geo was unreachable from the room entirely.
            onClick={onSelect ? (event) => {
                event.stopPropagation()
                onSelect(node.id)
            } : undefined}
        >
            {body}
            {children.map((child) => (
                <SceneEntityErrorBoundary key={child.id} resetKey={child.id}>
                    <NodeVisual
                        node={child}
                        selected={child.id === selectedNodeId}
                        onSelect={null}
                        onSelectNode={onSelectNode}
                        selectedNodeId={selectedNodeId}
                        assetMap={assetMap}
                        childMap={childMap}
                        depth={depth + 1}
                        showSelectionPills={showSelectionPills}
                        // Deliberately no onPointerDown below the top level.
                        // The drag writes a world-space raycast point into
                        // values.position, which is read as a position LOCAL to
                        // the parent — so dragging a nested node would teleport
                        // it by the parent's transform, silently. StudioViewport
                        // refuses the same move for the same reason
                        // (`!entity.parentId`). Nested position is editable in
                        // the inspector until there is a real gizmo.
                        nodeScale={1}
                    />
                </SceneEntityErrorBoundary>
            ))}
            {selected && showSelectionPills ? (
                <Html position={[0, 1.5, 0]} center>
                    <span className="raw-selection-pill">{node.label}</span>
                </Html>
            ) : null}
        </group>
    )
}

function SceneContent({
    document,
    selectedEntityId,
    selectedNodeId,
    onSelectEntity,
    onSelectNode,
    onClearSelection = null,
    onWorldDoubleClick,
    onMoveNode,
    nodeScale = 1,
    scopeId,
    worldNode,
    liveOutputs = null,
    showSelectionPills = true,
    // false = a pure LOOK: no picking, no dragging, no double-click placing.
    // The /out projector view passes false — "handlers simply not passed" was
    // not enough, because OrbitControls mounts its own DOM listeners.
    interactive = true
}) {
    // Keyed on assets + project id so the map only rebuilds when assets change,
    // not on every document identity change from a sync tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const assetMap = useMemo(() => buildAssetMap(document), [document.assets, document.projectMeta?.id])
    // Rebuilt every frame while a Time node exists — the per-pass outputCache
    // must not survive a tick or the clock would freeze at its first sample.
    const clockNow = useGraphClock(hasClockNode(document.nodes))
    const graphContext = useMemo(
        () => createNodeGraphContext(document, { now: clockNow, liveOutputs }),
        [document, clockNow, liveOutputs]
    )
    // scopeId undefined = unscoped, matches the old document-wide behavior; a real
    // scope (including root, `null`) only renders/uses siblings of that scope — see
    // the identical comment in viewportWorldState.js.
    //
    // With one carve-out either way: a constructor's parts are its DEFINITION,
    // not standing objects, and the unscoped mode admitted every spatial node
    // flat — so a legacy caller drew the snowman AND its loose spheres side by
    // side, the exact double the childMap rule below exists to prevent.
    const constructorIds = useMemo(
        () => new Set((document.nodes || []).filter((node) => node.typeId === 'geom.constructor').map((node) => node.id)),
        [document.nodes]
    )
    const inScope = (node) => (
        scopeId === undefined
            ? !constructorIds.has(node.parentId || null)
            : (node.parentId || null) === scopeId
    )
    const renderableNodes = useMemo(
        () => (document.nodes || []).filter((node) => isSpatialNode(node) && inScope(node)),
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
    // The authored eye: the scope's active Camera node drives the view every
    // frame (position, Look At, FOV — all wireable, so a Time→Sin dolly works
    // with no further machinery). The active camera's own body is filtered out
    // below: the room is seen THROUGH it, and a housing centred on the near
    // plane would only shed clipped fragments.
    const authoredCameraNode = useMemo(
        () => pickAuthoredCameraNode(document.nodes, scopeId, document.workspaceState?.activeNodeIdByTypeScope),
        [document.nodes, document.workspaceState?.activeNodeIdByTypeScope, scopeId]
    )
    useFrame(({ camera }) => {
        if (!authoredCameraNode) return
        const values = resolveSpatialValues(authoredCameraNode, graphContext, document.nodes)
        const pos = asVec3(values.position, [0, 2.4, 6.5])
        const look = asVec3(values.lookAt, [0, 0.75, 0])
        const fov = asFiniteNumber(values.fov, 50)
        camera.position.set(pos[0], pos[1], pos[2])
        if (camera.fov !== fov) {
            camera.fov = fov
            camera.updateProjectionMatrix()
        }
        camera.lookAt(look[0], look[1], look[2])
    })
    const gridNode = useMemo(
        () => pickActiveTypeNode(document.nodes, 'world.grid', { scopeId, activeMap: document.workspaceState?.activeNodeIdByTypeScope }),
        [document.nodes, document.workspaceState?.activeNodeIdByTypeScope, scopeId]
    )
    const resolvedGrid = gridNode ? evaluateNodeInputs(gridNode, graphContext) : null
    const [draggingNodeId, setDraggingNodeId] = useState(null)
    // Orbit yields while a node is being dragged: the controls listen on the
    // DOM canvas, which R3F stopPropagation never reaches, so without this
    // every drag moved the object AND spun the camera under it (measured —
    // the second half of the teleport).
    const controls = useThree((state) => state.controls)
    useEffect(() => {
        if (!controls) return undefined
        controls.enabled = !draggingNodeId
        return () => { controls.enabled = true }
    }, [controls, draggingNodeId])
    const dragNodeYRef = useRef(0)
    // Where on the ground the grab STARTED, relative to the object — subtracted
    // on every move. Without it the raw plane-hit was written straight into
    // position, and a 160px drag MEASURED as a teleport from [0,1.2,0] to
    // [13.8,1.2,-9.9]: the pointer ray meets the y=0 plane far behind an
    // elevated object, and that far point became the object's new home.
    const dragGrabRef = useRef({ offX: 0, offZ: 0, x0: 0, z0: 0 })
    // rAF-gated (2026-07-17 perf audit): R3F's pointer events fire on every
    // raw DOM pointermove, which can exceed the display refresh rate on
    // high-poll-rate input devices -- each call was committing a document op
    // + re-evaluating the whole node graph. Capping to one commit per
    // animation frame is a real, safe win with no change in drag feel.
    const dragRafRef = useRef(null)
    const dragPendingRef = useRef(null)
    // Touch double-tap on the floor = place here, same as double-click. The
    // browser cannot be trusted to synthesize dblclick from touch (dead on
    // the 08-20 real-phone test); the tracker also guards Chromium's double
    // fire. R3F pointer events carry pointerType/clientX/clientY and the
    // floor raycast point, which is all the tracker and the palette need.
    const roomTap = useMemo(() => createTapTracker(), [])
    useEffect(() => () => {
        if (dragRafRef.current !== null) cancelAnimationFrame(dragRafRef.current)
    }, [])

    return (
        <>
            <color attach="background" args={[getRawWorldBackgroundColor(document, graphContext, { scopeId, worldNode })]} />
            <ambientLight
                color={resolvedLight?.ambientColor ?? document.worldState?.ambientLight?.color ?? '#ffffff'}
                intensity={resolvedLight?.ambientIntensity ?? document.worldState?.ambientLight?.intensity ?? 0.8}
            />
            <directionalLight
                color={resolvedLight?.directionalColor ?? document.worldState?.directionalLight?.color ?? '#fff7ea'}
                intensity={resolvedLight?.directionalIntensity ?? document.worldState?.directionalLight?.intensity ?? 1.05}
                position={resolvedLight?.directionalPosition ?? document.worldState?.directionalLight?.position ?? [8, 12, 4]}
            />
            {(resolvedGrid?.visible ?? document.worldState?.gridVisible) !== false ? (
                <Grid
                    args={[resolvedGrid?.size ?? document.worldState?.gridSize ?? 24, resolvedGrid?.size ?? document.worldState?.gridSize ?? 24]}
                    cellColor={resolvedGrid?.color ?? 'rgba(255,255,255,0.10)'}
                    sectionColor={resolvedGrid?.color ?? 'rgba(255,255,255,0.22)'}
                    position={[0, 0, 0]}
                    fadeDistance={60}
                    fadeStrength={1}
                />
            ) : null}
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, 0, 0]}
                onClick={interactive ? (event) => {
                    if (draggingNodeId) return
                    if ((event.delta ?? 0) > 4) return
                    onClearSelection?.()
                } : undefined}
                onDoubleClick={interactive ? (event) => {
                    event.stopPropagation()
                    if (draggingNodeId) return
                    if (roomTap.justFired()) return
                    onWorldDoubleClick?.({
                        point: event.point?.toArray?.() || [0, 0, 0],
                        clientX: event.nativeEvent?.clientX || 0,
                        clientY: event.nativeEvent?.clientY || 0
                    })
                } : undefined}
                onPointerDown={interactive ? (event) => {
                    roomTap.down(event)
                } : undefined}
                onPointerMove={interactive ? (event) => {
                    if (!draggingNodeId) return
                    event.stopPropagation()
                    // Same plane the grab measured on — the object's height —
                    // computed from the ray, not from where the floor mesh was
                    // hit (the mesh is only the event source).
                    const { origin: rayOrigin, direction: rayDirection } = event.ray
                    const th = Math.abs(rayDirection.y) > 1e-6
                        ? (dragNodeYRef.current - rayOrigin.y) / rayDirection.y
                        : -1
                    const point = th > 0
                        ? [rayOrigin.x + rayDirection.x * th, dragNodeYRef.current, rayOrigin.z + rayDirection.z * th]
                        : (event.point?.toArray?.() || [0, 0, 0])
                    const { offX, offZ, x0, z0 } = dragGrabRef.current
                    if (event.nativeEvent?.shiftKey) {
                        // Shift lifts. The ray is intersected with a vertical,
                        // camera-facing plane through the object, so the object
                        // tracks the pointer up and down the screen at any
                        // orbit angle — the audit's ask, arranging needs height.
                        // Anchored to where the drag STARTED, never to the
                        // pointer: a lift that began with Shift already held
                        // used to bake a sideways step into its anchor
                        // (measured: z drifted −1.5 during a pure lift).
                        const held = dragPendingRef.current || [x0 ?? point[0] + offX, dragNodeYRef.current, z0 ?? point[2] + offZ]
                        const { origin, direction } = event.ray
                        const camera = event.camera
                        let nx = camera ? camera.position.x - held[0] : 0
                        let nz = camera ? camera.position.z - held[2] : 1
                        const len = Math.hypot(nx, nz) || 1
                        nx /= len; nz /= len
                        const denom = nx * direction.x + nz * direction.z
                        if (Math.abs(denom) > 1e-6) {
                            const t = (nx * (held[0] - origin.x) + nz * (held[2] - origin.z)) / denom
                            if (t > 0) {
                                dragNodeYRef.current = Math.max(0, Math.min(40, origin.y + direction.y * t))
                                dragPendingRef.current = [held[0], dragNodeYRef.current, held[2]]
                            }
                        }
                    } else {
                        // Near the drag plane's horizon the depth axis explodes
                        // (measured: an 80px downward move threw a geo from z=0
                        // to z=13.8 — off past the camera). The room is the
                        // grid; nothing dragged by hand should leave it.
                        const clampXZ = (value) => Math.max(-40, Math.min(40, value))
                        dragPendingRef.current = [clampXZ(point[0] + offX), dragNodeYRef.current, clampXZ(point[2] + offZ)]
                    }
                    if (dragRafRef.current === null) {
                        dragRafRef.current = requestAnimationFrame(() => {
                            dragRafRef.current = null
                            if (dragPendingRef.current) onMoveNode?.(draggingNodeId, dragPendingRef.current)
                        })
                    }
                } : undefined}
                onPointerUp={interactive ? (event) => {
                    if (roomTap.up(event) && !draggingNodeId) {
                        onWorldDoubleClick?.({
                            point: event.point?.toArray?.() || [0, 0, 0],
                            clientX: event.nativeEvent?.clientX ?? 0,
                            clientY: event.nativeEvent?.clientY ?? 0
                        })
                        return
                    }
                    if (!draggingNodeId) return
                    event.stopPropagation()
                    if (dragRafRef.current !== null) {
                        cancelAnimationFrame(dragRafRef.current)
                        dragRafRef.current = null
                        if (dragPendingRef.current) onMoveNode?.(draggingNodeId, dragPendingRef.current)
                    }
                    dragPendingRef.current = null
                    setDraggingNodeId(null)
                } : undefined}
            >
                <planeGeometry args={[400, 400]} />
                <meshBasicMaterial transparent opacity={0} />
            </mesh>
            <Suspense fallback={null}>
                {/* Objects (document.entities) are ROOT-scope citizens: they
                    have no parent concept, so they stand in the top room and
                    only there. They used to render unscoped — every object
                    haunted every interior at every depth. */}
                {(scopeId ? [] : (document.entities || [])).map((entity) => (
                    <SceneEntityErrorBoundary key={entity.id} resetKey={entity.id}>
                        <EntityVisual
                            entity={entity}
                            assetMap={assetMap}
                            selected={entity.id === selectedEntityId}
                            onSelect={onSelectEntity}
                            showSelectionPills={showSelectionPills}
                        />
                    </SceneEntityErrorBoundary>
                ))}
                {/* Boundaried like entities are: a node can now load an
                    arbitrary file off someone's disk, and a corrupt mesh must
                    cost that one node, not the whole scene. */}
                {renderableNodes.filter((node) => node.id !== authoredCameraNode?.id).map((node) => (
                    <SceneEntityErrorBoundary key={node.id} resetKey={node.id}>
                        <NodeVisual
                            node={{ ...node, values: resolveSpatialValues(node, graphContext, document.nodes) }}
                            selected={node.id === selectedNodeId}
                            onSelect={onSelectNode}
                            onSelectNode={onSelectNode}
                            selectedNodeId={selectedNodeId}
                            childMap={childMap}
                            nodeScale={nodeScale}
                            assetMap={assetMap}
                            showSelectionPills={showSelectionPills}
                            onPointerDown={interactive ? (event) => {
                                if (event.button !== 0) return
                                event.stopPropagation()
                                const position = node.values?.position || [0, 0, 0]
                                dragNodeYRef.current = position[1] || 0
                                // The pointer ray's own ground hit, at grab
                                // time — the same intersection the move
                                // handler will keep computing, so the offset
                                // between it and the object is exactly what
                                // must be added back on every move.
                                // Grab on the plane at the OBJECT's height,
                                // not the floor: an elevated object's ray hits
                                // the floor far behind it, and that lever arm
                                // made a 180px drag move it four units
                                // (measured). At its own height, hand and
                                // object move one-to-one.
                                const { origin, direction } = event.ray
                                const t = Math.abs(direction.y) > 1e-6
                                    ? (position[1] - origin.y) / direction.y
                                    : 0
                                dragGrabRef.current = {
                                    x0: position[0],
                                    z0: position[2],
                                    ...(t > 0
                                        ? { offX: position[0] - (origin.x + direction.x * t), offZ: position[2] - (origin.z + direction.z * t) }
                                        : { offX: 0, offZ: 0 })
                                }
                                setDraggingNodeId(node.id)
                                onSelectNode?.(node.id)
                            } : undefined}
                        />
                    </SceneEntityErrorBoundary>
                ))}
            </Suspense>
        </>
    )
}

export default function RawViewport({
    topInset = 0,
    document,
    selectedEntityId,
    selectedNodeId,
    onSelectEntity,
    onSelectNode,
    onClearSelection,
    onWorldDoubleClick,
    onMoveNode,
    cursors = {},
    onCursorMove,
    onCursorLeave,
    nodeScale = 1,
    showEmptyHint = true,
    scopeId,
    worldNode,
    liveOutputs = null,
    // In the backdrop the graph card IS the selection feedback; a floating
    // name pill duplicated it in the room's sky, detached from its object
    // (the "GEO" chip the audit photographed). Fullscreen keeps pills — the
    // cards are gone there.
    showSelectionPills = true,
    interactive = true
}) {
    const viewportRef = useRef(null)
    const { canvasKey, contextLost, bindContextGuard, restoreContext } = useWebglContextGuard()
    const camera = document.worldState?.savedView || {}
    const spatialNodes = useMemo(
        () => (document.nodes || []).filter((node) => isSpatialNode(node) && (scopeId === undefined || (node.parentId || null) === scopeId)),
        [document.nodes, scopeId]
    )
    // An active Camera node owns the view: orbit stays unmounted while one
    // exists in this scope, or the two would fight over the same eye every
    // frame. Deactivate (or delete) the Camera to orbit freely again.
    const hasAuthoredCamera = useMemo(
        () => Boolean(pickAuthoredCameraNode(document.nodes, scopeId, document.workspaceState?.activeNodeIdByTypeScope)),
        [document.nodes, document.workspaceState?.activeNodeIdByTypeScope, scopeId]
    )
    const isEmpty = spatialNodes.length === 0 && (document.entities || []).length === 0

    const handleViewportDoubleClick = (event) => {
        if (event.target?.closest?.('.raw-cursor-layer, .raw-cursor-marker, .raw-selection-pill')) return
        onWorldDoubleClick?.({
            point: [0, 0, 0],
            clientX: event.clientX,
            clientY: event.clientY
        })
    }

    const handleViewportKeyDown = (event) => {
        if (event.key !== 'Enter' || event.target !== event.currentTarget) return
        const rect = viewportRef.current?.getBoundingClientRect?.()
        if (!rect) return
        event.preventDefault()
        onWorldDoubleClick?.({
            point: [0, 0, 0],
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2
        })
    }

    const handlePointerMove = (event) => {
        const rect = viewportRef.current?.getBoundingClientRect?.()
        if (!rect || !rect.width || !rect.height) return
        const x = (event.clientX - rect.left) / rect.width
        const y = (event.clientY - rect.top) / rect.height
        onCursorMove?.({
            x: Math.max(0, Math.min(1, x)),
            y: Math.max(0, Math.min(1, y))
        })
    }

    const openWorldCreateAtCenter = () => {
        const rect = viewportRef.current?.getBoundingClientRect?.()
        if (!rect) return
        onWorldDoubleClick?.({
            point: [0, 0, 0],
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2
        })
    }

    return (
        <div
            className="raw-viewport-shell"
            ref={viewportRef}
            style={{ top: `${topInset}px` }}
            role="button"
            tabIndex={0}
            aria-label="Room — double-click to place a node"
            onPointerMove={handlePointerMove}
            onPointerLeave={onCursorLeave}
            onDoubleClick={handleViewportDoubleClick}
            onKeyDown={handleViewportKeyDown}
        >
            {showEmptyHint && isEmpty ? (
                <div className="raw-viewport-empty-hint">
                    <div className="raw-viewport-empty-stage" aria-hidden="true">
                        <div className="raw-viewport-empty-grid" />
                        <div className="raw-viewport-empty-crosshair" />
                    </div>
                    <div className="raw-viewport-empty-panel">
                        <span className="raw-window-kicker">Room</span>
                        <strong>Cursor is material.</strong>
                        <p>Double-click anywhere to place a node, or use the button below.</p>
                        <button type="button" onClick={openWorldCreateAtCenter}>
                            Place Node
                        </button>
                    </div>
                </div>
            ) : null}
            <Canvas
                key={canvasKey}
                shadows
                onCreated={({ gl }) => bindContextGuard(gl)}
                camera={{
                    position: camera.position || [0, 2.4, 6.5],
                    fov: 50,
                    near: 0.1,
                    far: 200
                }}
                onPointerMissed={interactive ? () => {
                    // A node selection lives in the shared workspace state, so
                    // clearing it costs an op — only pay that when a node is
                    // actually selected; otherwise keep the cheap local clear.
                    if (selectedNodeId && onClearSelection) onClearSelection()
                    else onSelectEntity?.(null)
                } : undefined}
            >
                {interactive && !hasAuthoredCamera && <OrbitControls makeDefault target={camera.target || [0, 0.75, 0]} />}
                <SceneContent
                    showSelectionPills={showSelectionPills}
                    interactive={interactive}
                    document={document}
                    selectedEntityId={selectedEntityId}
                    selectedNodeId={selectedNodeId}
                    onSelectEntity={onSelectEntity}
                    onSelectNode={onSelectNode}
                    onClearSelection={onClearSelection}
                    onWorldDoubleClick={onWorldDoubleClick}
                    onMoveNode={onMoveNode}
                    nodeScale={nodeScale}
                    scopeId={scopeId}
                    worldNode={worldNode}
                    liveOutputs={liveOutputs}
                />
            </Canvas>
            {contextLost && <WebglContextLostOverlay onRestore={restoreContext} />}
            <div className="raw-cursor-layer">
                {Object.values(cursors).map((cursor) => (
                    <div
                        key={cursor.socketId || cursor.userId}
                        className="raw-cursor-marker"
                        style={{
                            left: `${(cursor.cursor?.x || 0) * 100}%`,
                            top: `${(cursor.cursor?.y || 0) * 100}%`
                        }}
                    >
                        <span>{cursor.userName || cursor.userId}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
