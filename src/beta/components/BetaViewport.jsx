import { Suspense, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
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
            content = <ImageObject data={asset?.url || null} opacity={appearance.opacity} />
            break
        case 'video':
            content = <VideoObject data={asset?.url || null} opacity={appearance.opacity} />
            break
        case 'audio':
            content = (
                <AudioObject
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
            content = <ModelObject data={asset?.url || null} modelColor={appearance.color} applyModelColor={false} opacity={appearance.opacity} />
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

function SceneContent({ document, selectedEntityId, onSelectEntity }) {
    const assetMap = useMemo(() => new Map((document.assets || []).map((asset) => [asset.id, asset])), [document.assets])
    return (
        <>
            <color attach="background" args={[document.worldState?.backgroundColor || '#ebe7df']} />
            <ambientLight
                color={document.worldState?.ambientLight?.color || '#ffffff'}
                intensity={document.worldState?.ambientLight?.intensity || 0.85}
            />
            <directionalLight
                color={document.worldState?.directionalLight?.color || '#fff7ea'}
                intensity={document.worldState?.directionalLight?.intensity || 1.15}
                position={document.worldState?.directionalLight?.position || [8, 12, 4]}
            />
            {document.worldState?.gridVisible !== false && (
                <Grid
                    args={[document.worldState?.gridSize || 24, document.worldState?.gridSize || 24]}
                    cellColor="#8b8577"
                    sectionColor="#4a4742"
                    position={[0, 0, 0]}
                    fadeDistance={60}
                    fadeStrength={1}
                />
            )}
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
            </Suspense>
        </>
    )
}

export default function BetaViewport({
    document,
    selectedEntityId,
    onSelectEntity,
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
                onPointerMissed={() => onSelectEntity?.(null)}
            >
                <OrbitControls makeDefault target={camera.target || [0, 0.75, 0]} />
                <SceneContent
                    document={document}
                    selectedEntityId={selectedEntityId}
                    onSelectEntity={onSelectEntity}
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
