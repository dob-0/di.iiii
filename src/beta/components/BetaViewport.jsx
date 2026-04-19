import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Grid, Html, OrbitControls } from '@react-three/drei'
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
import { detectEntityTypeForAsset } from '../../utils/mediaAssetTypes.js'

function CameraControls({ savedView = {} }) {
    const controlsRef = useRef(null)
    const { camera } = useThree()
    const position = useMemo(
        () => savedView.position || [0, 2.4, 6.5],
        [savedView.position]
    )
    const target = useMemo(
        () => savedView.target || [0, 0.75, 0],
        [savedView.target]
    )

    useEffect(() => {
        camera.position.set(position[0], position[1], position[2])
        camera.updateProjectionMatrix()
        if (controlsRef.current?.target) {
            controlsRef.current.target.set(target[0], target[1], target[2])
            controlsRef.current.update()
        }
    }, [camera, position, target])

    return <OrbitControls ref={controlsRef} makeDefault target={target} />
}

function EntityVisual({ entity, assetMap, selected, onSelect }) {
    const transform = entity.components?.transform || {}
    const appearance = entity.components?.appearance || {}
    const media = entity.components?.media || {}
    const asset = media.assetId ? assetMap.get(media.assetId) : null
    const visualType = asset ? detectEntityTypeForAsset(asset, entity.type) : entity.type

    let content = null
    switch (visualType) {
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
            {selected ? (
                <Html position={[0, 1.8, 0]} center>
                    <span className="beta-selection-pill">{entity.name}</span>
                </Html>
            ) : null}
        </group>
    )
}

function NodeVisual({ node, selected, onSelect }) {
    if (node.definitionId === 'geom.cube') {
        return (
            <group
                position={node.spatial?.position || [0, 0, 0]}
                rotation={node.spatial?.rotation || [0, 0, 0]}
                scale={node.spatial?.scale || [1, 1, 1]}
                onClick={(event) => {
                    event.stopPropagation()
                    onSelect?.(node.id)
                }}
            >
                <BoxObject color={node.params?.color || '#5fa8ff'} boxSize={node.params?.size || [1, 1, 1]} />
                {selected ? (
                    <Html position={[0, 1.5, 0]} center>
                        <span className="beta-selection-pill">{node.label}</span>
                    </Html>
                ) : null}
            </group>
        )
    }

    if (node.definitionId === 'app.browser') {
        const width = Math.max(220, Number(node.params?.width) || 360)
        const height = Math.max(180, Number(node.params?.height) || 240)
        return (
            <group
                position={node.spatial?.position || [0, 1.2, 0]}
                rotation={node.spatial?.rotation || [0, 0, 0]}
                scale={node.spatial?.scale || [1, 1, 1]}
                onClick={(event) => {
                    event.stopPropagation()
                    onSelect?.(node.id)
                }}
            >
                <mesh>
                    <planeGeometry args={[width / 180, height / 180]} />
                    <meshBasicMaterial color="#ffffff" />
                </mesh>
                <Html transform position={[0, 0, 0.01]} distanceFactor={1.2}>
                    <div className="beta-world-browser-node" style={{ width: `${width}px`, height: `${height}px` }}>
                        <div className="beta-world-browser-node-bar">
                            <strong>{node.params?.title || node.label}</strong>
                            <span>{node.params?.url || 'https://example.com'}</span>
                        </div>
                        <iframe
                            title={node.params?.title || node.label}
                            src={node.params?.url || 'https://example.com'}
                            sandbox="allow-scripts allow-forms allow-popups allow-modals"
                        />
                    </div>
                </Html>
                {selected ? (
                    <Html position={[0, (height / 200) + 0.3, 0]} center>
                        <span className="beta-selection-pill">{node.label}</span>
                    </Html>
                ) : null}
            </group>
        )
    }

    return null
}

function SceneContent({
    document,
    selectedEntityId,
    selectedNodeId,
    onSelectEntity,
    onSelectNode,
    onWorldDoubleClick
}) {
    const assetMap = useMemo(() => new Map((document.assets || []).map((asset) => [asset.id, asset])), [document.assets])
    const renderableNodes = useMemo(
        () => (document.nodes || []).filter((node) => node.mount?.surface === 'world' && node.mount?.mode === 'spatial'),
        [document.nodes]
    )

    return (
        <>
            <color attach="background" args={[document.worldState?.backgroundColor || '#ffffff']} />
            <ambientLight
                color={document.worldState?.ambientLight?.color || '#ffffff'}
                intensity={document.worldState?.ambientLight?.intensity || 0.8}
            />
            <directionalLight
                color={document.worldState?.directionalLight?.color || '#fff7ea'}
                intensity={document.worldState?.directionalLight?.intensity || 1.05}
                position={document.worldState?.directionalLight?.position || [8, 12, 4]}
            />
            {document.worldState?.gridVisible ? (
                <Grid
                    args={[document.worldState?.gridSize || 24, document.worldState?.gridSize || 24]}
                    cellColor="#d0d0d0"
                    sectionColor="#ababab"
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
                    onWorldDoubleClick?.({
                        point: event.point?.toArray?.() || [0, 0, 0],
                        clientX: event.nativeEvent?.clientX || 0,
                        clientY: event.nativeEvent?.clientY || 0
                    })
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
                        node={node}
                        selected={node.id === selectedNodeId}
                        onSelect={onSelectNode}
                    />
                ))}
            </Suspense>
        </>
    )
}

export default function BetaViewport({
    document,
    selectedEntityId,
    selectedNodeId,
    onSelectEntity,
    onSelectNode,
    onClearSelection,
    onWorldDoubleClick,
    cursors = {},
    onCursorMove,
    onCursorLeave
}) {
    const viewportRef = useRef(null)
    const camera = document.worldState?.savedView || {}

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

    return (
        <div className="beta-viewport-shell" ref={viewportRef} onPointerMove={handlePointerMove} onPointerLeave={onCursorLeave}>
            <Canvas
                shadows
                camera={{
                    position: camera.position || [0, 2.4, 6.5],
                    fov: 50,
                    near: 0.1,
                    far: 200
                }}
                onPointerMissed={() => onClearSelection?.()}
            >
                <CameraControls savedView={camera} />
                <SceneContent
                    document={document}
                    selectedEntityId={selectedEntityId}
                    selectedNodeId={selectedNodeId}
                    onSelectEntity={onSelectEntity}
                    onSelectNode={onSelectNode}
                    onWorldDoubleClick={onWorldDoubleClick}
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
