import { Suspense, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { Grid, Html, OrbitControls } from '@react-three/drei'
import { XR, useXR } from '@react-three/xr'
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

const AR_SCENE_POSITION = [0, 0, -1.2]
const DEFAULT_SCENE_POSITION = [0, 0, 0]

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
                    <span className="studio-selection-pill">{entity.name}</span>
                </Html>
            )}
        </group>
    )
}

function StudioOrbit({ controlsRef, cameraView, onCameraChange, enabled = true }) {
    const isXrPresenting = useXR((state) => state.session != null)

    if (isXrPresenting || !enabled) {
        return null
    }

    return (
        <OrbitControls
            ref={controlsRef}
            makeDefault
            enableDamping
            dampingFactor={0.08}
            minDistance={0.35}
            maxDistance={250}
            target={cameraView?.target || [0, 0.75, 0]}
            onEnd={() => {
                const camera = controlsRef.current?.object
                const target = controlsRef.current?.target
                if (!camera || !target) return
                onCameraChange?.({
                    position: camera.position.toArray(),
                    target: target.toArray()
                })
            }}
        />
    )
}

function StudioSceneContent({ document, selectedEntityId, onSelectEntity }) {
    const isArMode = useXR((state) => state.mode === 'immersive-ar')
    const assetMap = useMemo(() => new Map((document.assets || []).map((asset) => [asset.id, asset])), [document.assets])

    return (
        <>
            <color attach="background" args={[document.worldState?.backgroundColor || '#0a1118']} />
            <ambientLight
                color={document.worldState?.ambientLight?.color || '#ffffff'}
                intensity={document.worldState?.ambientLight?.intensity || 0.85}
            />
            <directionalLight
                color={document.worldState?.directionalLight?.color || '#fff7ea'}
                intensity={document.worldState?.directionalLight?.intensity || 1.15}
                position={document.worldState?.directionalLight?.position || [8, 12, 4]}
            />
            <group position={isArMode ? AR_SCENE_POSITION : DEFAULT_SCENE_POSITION}>
                {document.worldState?.gridVisible !== false && !isArMode && (
                    <Grid
                        args={[document.worldState?.gridSize || 24, document.worldState?.gridSize || 24]}
                        cellColor="#526070"
                        sectionColor="#7cccf1"
                        fadeDistance={80}
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
            </group>
        </>
    )
}

export default function StudioViewport({
    document,
    selectedEntityId,
    onSelectEntity,
    cursors = {},
    onCursorMove,
    onCursorLeave,
    cameraView,
    onCameraChange,
    controlsRef,
    xrStore,
    enableNavigation = true
}) {
    const viewportRef = useRef(null)
    const camera = cameraView || document.worldState?.savedView || {}

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
        <div
            ref={viewportRef}
            className="studio-viewport-shell"
            onPointerMove={handlePointerMove}
            onPointerLeave={onCursorLeave}
        >
            <Canvas
                shadows
                camera={{
                    position: camera.position || [0, 2.4, 6.5],
                    fov: camera.fov || 50,
                    zoom: camera.zoom || 1,
                    near: camera.near || 0.1,
                    far: camera.far || 200,
                    orthographic: camera.projection === 'orthographic'
                }}
                onPointerMissed={() => onSelectEntity?.(null)}
            >
                <XR store={xrStore}>
                    <StudioOrbit
                        controlsRef={controlsRef}
                        cameraView={camera}
                        onCameraChange={onCameraChange}
                        enabled={enableNavigation}
                    />
                    <StudioSceneContent
                        document={document}
                        selectedEntityId={selectedEntityId}
                        onSelectEntity={onSelectEntity}
                    />
                </XR>
            </Canvas>
            <div className="studio-cursor-layer">
                {Object.values(cursors).map((cursor) => (
                    <div
                        key={cursor.socketId || cursor.userId}
                        className="studio-cursor-marker"
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
