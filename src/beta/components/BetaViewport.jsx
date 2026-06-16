import { Suspense, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Grid, Html, OrbitControls, useTexture } from '@react-three/drei'
import BoxObject from '../../objectComponents/BoxObject.jsx'
import SphereObject from '../../objectComponents/SphereObject.jsx'
import ConeObject from '../../objectComponents/ConeObject.jsx'
import CylinderObject from '../../objectComponents/CylinderObject.jsx'
import Text2DObject from '../../objectComponents/Text2DObject.jsx'
import Text3DObject from '../../objectComponents/Text3DObject.jsx'
import ImageObject from '../../objectComponents/ImageObject.jsx'
import VideoObject from '../../objectComponents/VideoObject.jsx'
import AudioObject from '../../objectComponents/AudioObject.jsx'
import ModelObject from '../../objectComponents/ModelObject.jsx'
import { getNodeType } from '../../project/nodeRegistry.js'
import { getBetaWorldBackgroundColor } from '../utils/viewportWorldState.js'
import { createNodeGraphContext, evaluateNodeInputs } from '../utils/nodeGraphRuntime.js'

const isSpatialNode = (node) => getNodeType(node?.typeId)?.render === 'spatial-3d'

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


function EntityVisual({ entity, assetMap, selected, onSelect }) {
    const transform = entity.components?.transform || {}
    const appearance = entity.components?.appearance || {}
    const media = entity.components?.media || {}
    const asset = media.assetId ? assetMap.get(media.assetId) : null

    let content = null
    switch (entity.type) {
        case 'box':
            content = <BoxObject color={appearance.color} boxSize={entity.components?.primitive?.size} />
            break
        case 'sphere':
            content = <SphereObject color={appearance.color} sphereRadius={entity.components?.primitive?.radius} />
            break
        case 'cone':
            content = <ConeObject color={appearance.color} coneRadius={entity.components?.primitive?.radius} coneHeight={entity.components?.primitive?.height} />
            break
        case 'cylinder':
            content = (
                <CylinderObject
                    color={appearance.color}
                    cylinderRadiusTop={entity.components?.primitive?.radiusTop}
                    cylinderRadiusBottom={entity.components?.primitive?.radiusBottom}
                    cylinderHeight={entity.components?.primitive?.height}
                />
            )
            break
        case 'text':
            content = entity.components?.text?.variant === '3d'
                ? (
                    <Text3DObject
                        data={entity.components?.text?.value}
                        color={appearance.color}
                        fontFamily={entity.components?.text?.fontFamily}
                        fontWeight={entity.components?.text?.fontWeight}
                        fontStyle={entity.components?.text?.fontStyle}
                        fontSize3D={entity.components?.text?.fontSize3D}
                        depth3D={entity.components?.text?.depth3D}
                    />
                )
                : (
                    <Text2DObject
                        data={entity.components?.text?.value}
                        color={appearance.color}
                        fontFamily={entity.components?.text?.fontFamily}
                        fontWeight={entity.components?.text?.fontWeight}
                        fontStyle={entity.components?.text?.fontStyle}
                    />
                )
            break
        case 'image':
            content = <ImageObject assetRef={asset || null} data={asset?.url || null} opacity={appearance.opacity} />
            break
        case 'video':
            content = <VideoObject assetRef={asset || null} data={asset?.url || null} opacity={appearance.opacity} />
            break
        case 'audio':
            content = (
                <AudioObject
                    assetRef={asset || null}
                    data={asset?.url || null}
                    color={appearance.color}
                    audioVolume={media.volume}
                    audioDistance={media.distance}
                    audioLoop={media.loop}
                    audioAutoplay={media.autoplay}
                    audioPaused={false}
                />
            )
            break
        case 'model':
            content = <ModelObject assetRef={asset || null} data={asset?.url || null} modelColor={appearance.color} applyModelColor={false} opacity={appearance.opacity} />
            break
        default:
            content = <BoxObject color={appearance.color} boxSize={[1, 1, 1]} />
            break
    }

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
            {selected && (
                <Html position={[0, 1.8, 0]} center>
                    <span className="beta-selection-pill">{entity.name}</span>
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

function renderNodeBody(node, values) {
    switch (node.typeId) {
        case 'geom.cube':
            return <BoxObject color={values.color || '#5fa8ff'} boxSize={asPositiveVec3(values.size, [1, 1, 1])} />
        case 'geom.sphere':
            return <SphereObject color={values.color || '#5fa8ff'} sphereRadius={Math.min(100, Math.max(0.001, Math.abs(asFiniteNumber(values.radius, 0.6))))} />
        case 'geom.plane': {
            const w = Math.min(100, Math.max(0.001, Math.abs(asFiniteNumber(values.width, 1))))
            const h = Math.min(100, Math.max(0.001, Math.abs(asFiniteNumber(values.height, 1))))
            if (values.textureUrl) {
                return <PlaneWithTexture w={w} h={h} textureUrl={values.textureUrl} />
            }
            return (
                <mesh>
                    <planeGeometry args={[w, h]} />
                    <meshStandardMaterial color={values.color || '#5fa8ff'} side={2} />
                </mesh>
            )
        }
        default:
            return null
    }
}

function NodeVisual({ node, selected, onSelect, onPointerDown, nodeScale = 1 }) {
    const values = node.values || {}
    const scale = asPositiveVec3(values.scale, [1, 1, 1], 0.001, 20)
    const safeNodeScale = Math.min(4, Math.max(0.25, asFiniteNumber(nodeScale, 1)))
    const nodeScaleFactor = [
        scale[0] * safeNodeScale,
        scale[1] * safeNodeScale,
        scale[2] * safeNodeScale
    ]
    const body = renderNodeBody(node, values)
    if (!body) return null

    return (
        <group
            position={asVec3(values.position, [0, 0, 0])}
            rotation={asVec3(values.rotation, [0, 0, 0])}
            scale={nodeScaleFactor}
            onPointerDown={onPointerDown}
            onClick={(event) => {
                event.stopPropagation()
                onSelect?.(node.id)
            }}
        >
            {body}
            {selected ? (
                <Html position={[0, 1.5, 0]} center>
                    <span className="beta-selection-pill">{node.label}</span>
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
    onWorldDoubleClick,
    onMoveNode,
    nodeScale = 1
}) {
    const assetMap = useMemo(() => new Map((document.assets || []).map((asset) => [asset.id, asset])), [document.assets])
    const graphContext = useMemo(() => createNodeGraphContext(document), [document])
    const renderableNodes = useMemo(
        () => (document.nodes || []).filter(isSpatialNode),
        [document.nodes]
    )
    const lightNode = useMemo(() => (document.nodes || []).find((node) => node?.typeId === 'world.light') || null, [document.nodes])
    const gridNode = useMemo(() => (document.nodes || []).find((node) => node?.typeId === 'world.grid') || null, [document.nodes])
    const resolvedLight = lightNode ? evaluateNodeInputs(lightNode, graphContext) : null
    const resolvedGrid = gridNode ? evaluateNodeInputs(gridNode, graphContext) : null
    const [draggingNodeId, setDraggingNodeId] = useState(null)
    const dragNodeYRef = useRef(0)

    return (
        <>
            <color attach="background" args={[getBetaWorldBackgroundColor(document, graphContext)]} />
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
                onDoubleClick={(event) => {
                    event.stopPropagation()
                    if (draggingNodeId) return
                    onWorldDoubleClick?.({
                        point: event.point?.toArray?.() || [0, 0, 0],
                        clientX: event.nativeEvent?.clientX || 0,
                        clientY: event.nativeEvent?.clientY || 0
                    })
                }}
                onPointerMove={(event) => {
                    if (!draggingNodeId) return
                    event.stopPropagation()
                    const point = event.point?.toArray?.() || [0, 0, 0]
                    onMoveNode?.(draggingNodeId, [point[0], dragNodeYRef.current, point[2]])
                }}
                onPointerUp={(event) => {
                    if (!draggingNodeId) return
                    event.stopPropagation()
                    setDraggingNodeId(null)
                }}
            >
                <planeGeometry args={[400, 400]} />
                <meshBasicMaterial transparent opacity={0} />
            </mesh>
            <Suspense fallback={null}>
                {(document.entities || []).map((entity) => (
                    <EntityVisual
                        key={entity.id}
                        entity={entity}
                        assetMap={assetMap}
                        selected={entity.id === selectedEntityId}
                        onSelect={onSelectEntity}
                    />
                ))}
                {renderableNodes.map((node) => (
                    <NodeVisual
                        key={node.id}
                        node={{ ...node, values: evaluateNodeInputs(node, graphContext) }}
                        selected={node.id === selectedNodeId}
                        onSelect={onSelectNode}
                        nodeScale={nodeScale}
                        onPointerDown={(event) => {
                            if (event.button !== 0) return
                            event.stopPropagation()
                            dragNodeYRef.current = node.values?.position?.[1] || 0
                            setDraggingNodeId(node.id)
                            onSelectNode?.(node.id)
                        }}
                    />
                ))}
            </Suspense>
        </>
    )
}

export default function BetaViewport({
    topInset = 0,
    document,
    selectedEntityId,
    onSelectEntity,
    onSelectNode,
    onClearSelection,
    onWorldDoubleClick,
    onMoveNode,
    cursors = {},
    onCursorMove,
    onCursorLeave,
    nodeScale = 1,
    showEmptyHint = true
}) {
    const viewportRef = useRef(null)
    const camera = document.worldState?.savedView || {}
    const spatialNodes = useMemo(
        () => (document.nodes || []).filter(isSpatialNode),
        [document.nodes]
    )
    const isEmpty = spatialNodes.length === 0 && (document.entities || []).length === 0

    const handleViewportDoubleClick = (event) => {
        if (event.target?.closest?.('.beta-cursor-layer, .beta-cursor-marker, .beta-selection-pill')) return
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
            className="beta-viewport-shell"
            ref={viewportRef}
            style={{ top: `${topInset}px` }}
            role="button"
            tabIndex={0}
            aria-label="World surface — double-click to place a node"
            onPointerMove={handlePointerMove}
            onPointerLeave={onCursorLeave}
            onDoubleClick={handleViewportDoubleClick}
            onKeyDown={handleViewportKeyDown}
        >
            {showEmptyHint && isEmpty ? (
                <div className="beta-viewport-empty-hint">
                    <div className="beta-viewport-empty-stage" aria-hidden="true">
                        <div className="beta-viewport-empty-grid" />
                        <div className="beta-viewport-empty-crosshair" />
                    </div>
                    <div className="beta-viewport-empty-panel">
                        <span className="beta-window-kicker">World</span>
                        <strong>Cursor is material.</strong>
                        <p>Double-click anywhere to place a node, or use the button below.</p>
                        <button type="button" onClick={openWorldCreateAtCenter}>
                            Place Node
                        </button>
                    </div>
                </div>
            ) : null}
            <Canvas
                shadows
                camera={{
                    position: camera.position || [0, 2.4, 6.5],
                    fov: 50,
                    near: 0.1,
                    far: 200
                }}
                onPointerMissed={() => onSelectEntity?.(null)}
            >
                <OrbitControls makeDefault target={camera.target || [0, 0.75, 0]} />
                <SceneContent
                    document={document}
                    selectedEntityId={selectedEntityId}
                    onSelectEntity={onSelectEntity}
                    onSelectNode={onSelectNode}
                    onWorldDoubleClick={onWorldDoubleClick}
                    onMoveNode={onMoveNode}
                    nodeScale={nodeScale}
                />
            </Canvas>
            <div className="beta-cursor-layer">
                {Object.values(cursors).map((cursor) => (
                    <div
                        key={cursor.socketId || cursor.userId}
                        className="beta-cursor-marker"
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
