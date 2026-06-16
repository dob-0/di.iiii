import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { CameraControls, Grid, Html, TransformControls } from '@react-three/drei'
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
import { detectEntityTypeForAsset } from '../../utils/mediaAssetTypes.js'

const AR_SCENE_POSITION = [0, 0, -1.2]
const DEFAULT_SCENE_POSITION = [0, 0, 0]

function EntityContent({ entity, assetMap }) {
    const transform = entity.components?.transform || {}
    const appearance = entity.components?.appearance || {}
    const media = entity.components?.media || {}
    const asset = media.assetId ? assetMap.get(media.assetId) : null
    const visualType = asset ? detectEntityTypeForAsset(asset, entity.type) : entity.type

    switch (visualType) {
    case 'box':
        return <BoxObject color={appearance.color} boxSize={entity.components?.primitive?.size} />
    case 'sphere':
        return <SphereObject color={appearance.color} sphereRadius={entity.components?.primitive?.radius} />
    case 'cone':
        return <ConeObject color={appearance.color} coneRadius={entity.components?.primitive?.radius} coneHeight={entity.components?.primitive?.height} />
    case 'cylinder':
        return (
            <CylinderObject
                color={appearance.color}
                cylinderRadiusTop={entity.components?.primitive?.radiusTop}
                cylinderRadiusBottom={entity.components?.primitive?.radiusBottom}
                cylinderHeight={entity.components?.primitive?.height}
            />
        )
    case 'text':
        return entity.components?.text?.variant === '3d'
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
    case 'image':
        return <ImageObject assetRef={asset || null} data={asset?.url || null} opacity={appearance.opacity} />
    case 'video':
        return <VideoObject assetRef={asset || null} data={asset?.url || null} opacity={appearance.opacity} />
    case 'audio':
        return (
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
    case 'model':
        return <ModelObject assetRef={asset || null} data={asset?.url || null} modelColor={appearance.color} applyModelColor={false} opacity={appearance.opacity} />
    case 'pointLight': {
        const l = entity.components?.light || {}
        return (
            <>
                <pointLight color={l.color || '#ffffff'} intensity={l.intensity ?? 1} distance={l.distance ?? 10} decay={l.decay ?? 2} />
                <mesh>
                    <sphereGeometry args={[0.08, 8, 8]} />
                    <meshStandardMaterial color={l.color || '#ffffff'} emissive={l.color || '#ffffff'} emissiveIntensity={1} />
                </mesh>
            </>
        )
    }
    case 'spotLight': {
        const l = entity.components?.light || {}
        return (
            <>
                <spotLight color={l.color || '#ffffff'} intensity={l.intensity ?? 2} distance={l.distance ?? 20} angle={l.angle ?? 0.52} penumbra={l.penumbra ?? 0.2} decay={l.decay ?? 2} />
                <mesh>
                    <coneGeometry args={[0.07, 0.2, 8]} />
                    <meshStandardMaterial color={l.color || '#ffffff'} emissive={l.color || '#ffffff'} emissiveIntensity={0.8} />
                </mesh>
            </>
        )
    }
    case 'directionalLight': {
        const l = entity.components?.light || {}
        return (
            <>
                <directionalLight color={l.color || '#fff7ea'} intensity={l.intensity ?? 1.5} />
                <mesh>
                    <boxGeometry args={[0.15, 0.15, 0.15]} />
                    <meshStandardMaterial color={l.color || '#fff7ea'} emissive={l.color || '#fff7ea'} emissiveIntensity={0.8} />
                </mesh>
            </>
        )
    }
    case 'ambientLight': {
        const l = entity.components?.light || {}
        return (
            <>
                <ambientLight color={l.color || '#ffffff'} intensity={l.intensity ?? 0.5} />
                <mesh>
                    <sphereGeometry args={[0.12, 12, 12]} />
                    <meshStandardMaterial color={l.color || '#ffffff'} emissive={l.color || '#ffffff'} emissiveIntensity={0.4} wireframe />
                </mesh>
            </>
        )
    }
    default:
        return <BoxObject color={appearance.color} boxSize={[1, 1, 1]} />
    }
}

function SelectableEntity({ entity, assetMap, selected, editMode, gizmoMode, onSelect, onTransformCommit, orbitRef }) {
    const groupRef = useRef()
    const tcRef = useRef()
    const isDragging = useRef(false)

    // Sync Three.js group from entity data only when not dragging
    useEffect(() => {
        if (!groupRef.current || isDragging.current) return
        const t = entity.components?.transform || {}
        groupRef.current.position.set(...(t.position || [0, 0, 0]))
        groupRef.current.rotation.set(...(t.rotation || [0, 0, 0]))
        groupRef.current.scale.set(...(t.scale || [1, 1, 1]))
    }, [entity.components?.transform])

    const gizmoActive = selected && editMode === 'edit'

    // Attach TransformControls to the group
    useEffect(() => {
        const tc = tcRef.current
        const group = groupRef.current
        if (!tc || !group || !gizmoActive) return
        tc.attach(group)
        tc.setSpace('local')
        return () => { tc.detach() }
    }, [gizmoActive])

    // Drag events: disable orbit during drag, commit on release
    useEffect(() => {
        const tc = tcRef.current
        if (!tc || !gizmoActive) return

        const handleDraggingChanged = (e) => {
            isDragging.current = e.value
            if (orbitRef?.current) orbitRef.current.enabled = !e.value
            if (!e.value && groupRef.current) {
                const { position, rotation, scale } = groupRef.current
                onTransformCommit?.(entity.id, {
                    position: [position.x, position.y, position.z],
                    rotation: [rotation.x, rotation.y, rotation.z],
                    scale: [scale.x, scale.y, scale.z]
                })
            }
        }
        tc.addEventListener('dragging-changed', handleDraggingChanged)
        return () => tc.removeEventListener('dragging-changed', handleDraggingChanged)
    }, [gizmoActive, entity.id, onTransformCommit, orbitRef])

    const t = entity.components?.transform || {}

    return (
        <>
            <group
                ref={groupRef}
                position={t.position || [0, 0, 0]}
                rotation={t.rotation || [0, 0, 0]}
                scale={t.scale || [1, 1, 1]}
                onClick={(e) => {
                    e.stopPropagation()
                    onSelect?.(entity.id)
                }}
            >
                <EntityContent entity={entity} assetMap={assetMap} />
                {selected && (
                    <Html position={[0, 1.8, 0]} center>
                        <span className="studio-selection-pill">{entity.name}</span>
                    </Html>
                )}
            </group>
            {gizmoActive && (
                <TransformControls ref={tcRef} mode={gizmoMode} />
            )}
        </>
    )
}

// ACTION values from camera-controls (binary flags):
const CC_ACTION = { NONE: 0, ROTATE: 1, TRUCK: 2, SCREEN_PAN: 4, OFFSET: 8, DOLLY: 16, ZOOM: 32,
    TOUCH_DOLLY_TRUCK: 4096 }

function StudioOrbit({ controlsRef, cameraView, onCameraChange, onRotateStart, enabled = true }) {
    const isXrPresenting = useXR((state) => state.session != null)

    const targetFovRef = useRef(cameraView?.fov || 50)

    // Set initial position+target once the controls mount
    useEffect(() => {
        const cc = controlsRef.current
        if (!cc || !cameraView) return
        const [px, py, pz] = cameraView.position || [0, 2.4, 6.5]
        const [tx, ty, tz] = cameraView.target || [0, 0.75, 0]
        cc.setLookAt(px, py, pz, tx, ty, tz, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Track target FOV when the view changes
    useEffect(() => {
        if (cameraView?.fov != null) targetFovRef.current = cameraView.fov
    }, [cameraView?.fov])

    // In ortho views (small FOV), left drag pans instead of rotating so you can
    // navigate the locked view and arrange objects — same as Blender's ortho behavior
    useEffect(() => {
        const cc = controlsRef.current
        if (!cc) return
        const isOrtho = (cameraView?.fov ?? 50) < 20
        cc.mouseButtons.left = isOrtho ? CC_ACTION.TRUCK : CC_ACTION.ROTATE
    }, [cameraView?.fov])

    // Smooth FOV lerp — runs every frame inside the R3F canvas
    useFrame(() => {
        const cc = controlsRef.current
        if (!cc) return
        const cam = cc._camera
        if (!cam?.isPerspectiveCamera) return
        const target = targetFovRef.current
        if (Math.abs(cam.fov - target) < 0.05) return
        cam.fov += (target - cam.fov) * 0.08
        cam.updateProjectionMatrix()
    })

    // Break out of ortho when the user starts rotating
    useEffect(() => {
        const cc = controlsRef.current
        if (!cc || !onRotateStart) return
        const handleStart = () => {
            if (cc._state === 1 /* ACTION.ROTATE */) onRotateStart()
        }
        cc.addEventListener('controlstart', handleStart)
        return () => cc.removeEventListener('controlstart', handleStart)
    }, [onRotateStart])

    if (isXrPresenting || !enabled) return null

    return (
        <CameraControls
            ref={controlsRef}
            makeDefault
            dollyToCursor
            smoothTime={0.15}
            draggingSmoothTime={0.0}
            minDistance={0.35}
            maxDistance={500}
            mouseButtons={{
                left: CC_ACTION.ROTATE,
                middle: CC_ACTION.DOLLY,
                right: CC_ACTION.TRUCK,
                wheel: CC_ACTION.DOLLY,
            }}
            touches={{
                one: CC_ACTION.ROTATE,
                two: CC_ACTION.TOUCH_DOLLY_TRUCK,
            }}
            onControlEnd={() => {
                const cc = controlsRef.current
                if (!cc || !onCameraChange) return
                onCameraChange({
                    position: cc._camera.position.toArray(),
                    target: cc._target.toArray(),
                })
            }}
        />
    )
}

function StudioSceneContent({ document, selectedEntityId, onSelectEntity, editMode, gizmoMode, onTransformCommit, controlsRef }) {
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
                        <SelectableEntity
                            key={entity.id}
                            entity={entity}
                            assetMap={assetMap}
                            selected={entity.id === selectedEntityId}
                            editMode={editMode}
                            gizmoMode={gizmoMode}
                            onSelect={onSelectEntity}
                            onTransformCommit={onTransformCommit}
                            orbitRef={controlsRef}
                        />
                    ))}
                </Suspense>
            </group>
        </>
    )
}

const TOOLBAR_BTN = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '5px 11px',
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(15,23,34,0.82)',
    color: '#c8d8e8',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    backdropFilter: 'blur(8px)',
    transition: 'background 0.12s, border-color 0.12s, color 0.12s',
    userSelect: 'none',
    whiteSpace: 'nowrap'
}

const TOOLBAR_BTN_ACTIVE = {
    background: 'rgba(79,214,255,0.18)',
    borderColor: '#4fd6ff',
    color: '#4fd6ff'
}

function FullscreenButton() {
    const [isFs, setIsFs] = useState(Boolean(document.fullscreenElement))

    useEffect(() => {
        const handler = () => setIsFs(Boolean(document.fullscreenElement))
        document.addEventListener('fullscreenchange', handler)
        return () => document.removeEventListener('fullscreenchange', handler)
    }, [])

    const toggle = () => {
        if (document.fullscreenElement) {
            document.exitFullscreen()
        } else {
            document.documentElement.requestFullscreen()
        }
    }

    return (
        <button
            type="button"
            onClick={toggle}
            title={isFs ? 'Exit fullscreen' : 'Fullscreen'}
            style={{
                position: 'absolute',
                bottom: 14,
                right: 14,
                zIndex: 10,
                width: 30,
                height: 30,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(15,23,34,0.55)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                color: 'rgba(255,255,255,0.55)',
                cursor: 'pointer',
                backdropFilter: 'blur(6px)',
                padding: 0,
                transition: 'color 0.12s, border-color 0.12s, background 0.12s',
                pointerEvents: 'auto'
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.color = '#fff'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)'
                e.currentTarget.style.background = 'rgba(15,23,34,0.82)'
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(255,255,255,0.55)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                e.currentTarget.style.background = 'rgba(15,23,34,0.55)'
            }}
        >
            {isFs ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M5 1H1v4M9 1h4v4M5 13H1V9M9 13h4V9" />
                </svg>
            ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" />
                </svg>
            )}
        </button>
    )
}

function ViewportToolbar({ editMode, setEditMode, gizmoMode, setGizmoMode }) {
    const btn = (label, isActive, onClick) => (
        <button
            type="button"
            style={isActive ? { ...TOOLBAR_BTN, ...TOOLBAR_BTN_ACTIVE } : TOOLBAR_BTN}
            onClick={onClick}
        >
            {label}
        </button>
    )

    return (
        <div
            style={{
                position: 'absolute',
                bottom: 14,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                zIndex: 10,
                pointerEvents: 'auto'
            }}
        >
            {btn('Navigate', editMode === 'navigate', () => setEditMode('navigate'))}
            {btn('Edit', editMode === 'edit', () => setEditMode('edit'))}
            {editMode === 'edit' && (
                <>
                    <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.15)', margin: '0 2px' }} />
                    {btn('Move', gizmoMode === 'translate', () => setGizmoMode('translate'))}
                    {btn('Rotate', gizmoMode === 'rotate', () => setGizmoMode('rotate'))}
                    {btn('Scale', gizmoMode === 'scale', () => setGizmoMode('scale'))}
                </>
            )}
        </div>
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
    onRotateStart,
    controlsRef,
    xrStore,
    editMode = 'navigate',
    gizmoMode = 'translate',
    setEditMode,
    setGizmoMode,
    onTransformCommit,
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
                style={{ height: '100%' }}
                shadows
                camera={{
                    position: camera.position || [0, 2.4, 6.5],
                    fov: camera.fov || 50,
                    zoom: camera.zoom || 1,
                    near: camera.near || 0.1,
                    far: camera.far || 1000,
                    orthographic: camera.projection === 'orthographic'
                }}
                onPointerMissed={() => onSelectEntity?.(null)}
            >
                <XR store={xrStore}>
                    <StudioOrbit
                        controlsRef={controlsRef}
                        cameraView={camera}
                        onCameraChange={onCameraChange}
                        onRotateStart={onRotateStart}
                        enabled={enableNavigation}
                    />
                    <StudioSceneContent
                        document={document}
                        selectedEntityId={selectedEntityId}
                        onSelectEntity={onSelectEntity}
                        editMode={editMode}
                        gizmoMode={gizmoMode}
                        onTransformCommit={onTransformCommit}
                        controlsRef={controlsRef}
                    />
                </XR>
            </Canvas>

            {setEditMode && (
                <ViewportToolbar
                    editMode={editMode}
                    setEditMode={setEditMode}
                    gizmoMode={gizmoMode}
                    setGizmoMode={setGizmoMode}
                />
            )}

            <FullscreenButton />

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
