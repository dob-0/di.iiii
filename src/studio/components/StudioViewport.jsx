import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import '../styles/studio.css'
import { CameraControls, Grid, Html, TransformControls } from '@react-three/drei'
import { XR, useXR } from '@react-three/xr'
import ModalTransform from './ModalTransform.jsx'
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
import { applyPivotTransform, getSelectionCentroid } from '../utils/multiTransform.js'
import { buildProjectAssetUrl } from '../../project/services/projectsApi.js'

const AR_SCENE_POSITION = [0, 0, -1.2]
const DEFAULT_SCENE_POSITION = [0, 0, 0]

function EntityContent({ entity, assetMap }) {
    const appearance = entity.components?.appearance || {}
    const media = entity.components?.media || {}
    const asset = media.assetId ? assetMap.get(media.assetId) : null
    const visualType = entity.type

    switch (visualType) {
    case 'box':
        return (
            <BoxObject
                color={appearance.color}
                boxSize={entity.components?.primitive?.size}
                wireframe={Boolean(appearance.wireframe)}
                opacity={appearance.opacity}
            />
        )
    case 'sphere':
        return (
            <SphereObject
                color={appearance.color}
                sphereRadius={entity.components?.primitive?.radius}
                wireframe={Boolean(appearance.wireframe)}
                opacity={appearance.opacity}
            />
        )
    case 'cone':
        return (
            <ConeObject
                color={appearance.color}
                coneRadius={entity.components?.primitive?.radius}
                coneHeight={entity.components?.primitive?.height}
                wireframe={Boolean(appearance.wireframe)}
                opacity={appearance.opacity}
            />
        )
    case 'cylinder':
        return (
            <CylinderObject
                color={appearance.color}
                cylinderRadiusTop={entity.components?.primitive?.radiusTop}
                cylinderRadiusBottom={entity.components?.primitive?.radiusBottom}
                cylinderHeight={entity.components?.primitive?.height}
                wireframe={Boolean(appearance.wireframe)}
                opacity={appearance.opacity}
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

function SelectableEntity({ entity, assetMap, selected, isPrimary, editMode, gizmoMode, gizmoAxis = null, gizmoVisible = true, overrideTransform = null, onSelect, onToggleSelect, onTransformCommit, orbitRef }) {
    const groupRef = useRef()
    const tcRef = useRef()
    const highlightRef = useRef(null)
    const isDragging = useRef(false)
    const { scene } = useThree()
    const runtime = entity.components?.runtime || {}
    const isVisible = runtime.visible !== false
    const isLocked = runtime.locked === true

    // Sync Three.js group from entity data (or live modal-transform preview) when not dragging
    useEffect(() => {
        if (!groupRef.current || isDragging.current) return
        const t = overrideTransform || entity.components?.transform || {}
        groupRef.current.position.set(...(t.position || [0, 0, 0]))
        groupRef.current.rotation.set(...(t.rotation || [0, 0, 0]))
        groupRef.current.scale.set(...(t.scale || [1, 1, 1]))
    }, [overrideTransform, entity.components?.transform])

    useEffect(() => {
        if (!selected || !isVisible || !groupRef.current) return undefined
        const helper = new THREE.BoxHelper(groupRef.current, isPrimary ? 0xffa500 : 0x2ecc71)
        helper.material.depthTest = false
        helper.material.transparent = true
        helper.material.opacity = 0.95
        helper.renderOrder = 999
        highlightRef.current = helper
        scene.add(helper)
        return () => {
            scene.remove(helper)
            helper.geometry?.dispose?.()
            helper.material?.dispose?.()
            highlightRef.current = null
        }
    }, [isPrimary, isVisible, scene, selected])

    useFrame(() => {
        if (highlightRef.current && groupRef.current) {
            highlightRef.current.setFromObject(groupRef.current)
        }
    })

    const gizmoActive = isPrimary && editMode === 'edit' && gizmoVisible && !isLocked

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

    if (!isVisible) return null

    return (
        <>
            <group
                ref={groupRef}
                position={t.position || [0, 0, 0]}
                rotation={t.rotation || [0, 0, 0]}
                scale={t.scale || [1, 1, 1]}
                onClick={(e) => {
                    e.stopPropagation()
                    const additive = e.nativeEvent?.ctrlKey || e.nativeEvent?.metaKey || e.nativeEvent?.shiftKey
                    if (additive) onToggleSelect?.(entity.id)
                    else onSelect?.(entity.id)
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
                <TransformControls
                    ref={tcRef}
                    mode={gizmoMode}
                    showX={!gizmoAxis || gizmoAxis === 'x'}
                    showY={!gizmoAxis || gizmoAxis === 'y'}
                    showZ={!gizmoAxis || gizmoAxis === 'z'}
                />
            )}
        </>
    )
}

function SceneEntityNode({ entity, childMap, assetMap, selectedIdSet, selectedEntityId, editMode, gizmoMode, gizmoAxis, gizmoVisible, overrideById, onSelectEntity, onToggleSelectEntity, onTransformCommit, orbitRef }) {
    const t = entity.components?.transform || {}
    if (entity.type === 'group') {
        const children = childMap.get(entity.id) || []
        const selected = selectedIdSet.has(entity.id)
        return (
            <group
                position={t.position || [0, 0, 0]}
                rotation={t.rotation || [0, 0, 0]}
                scale={t.scale || [1, 1, 1]}
                onClick={(e) => {
                    if (e.delta > 2) return
                    e.stopPropagation()
                    const additive = e.nativeEvent?.ctrlKey || e.nativeEvent?.metaKey || e.nativeEvent?.shiftKey
                    if (additive) onToggleSelectEntity?.(entity.id)
                    else onSelectEntity?.(entity.id)
                }}
            >
                {/* Pivot dot — clickable hit target + visual marker for the group origin */}
                <mesh>
                    <sphereGeometry args={[0.06, 8, 8]} />
                    <meshBasicMaterial
                        color={selected ? '#4df9ff' : '#ffffff'}
                        transparent
                        opacity={selected ? 0.9 : 0.35}
                    />
                </mesh>
                {editMode === 'edit' && <axesHelper args={[0.4]} />}
                {selected && (
                    <Html position={[0, 0.25, 0]} center>
                        <span className="studio-selection-pill">{entity.name}</span>
                    </Html>
                )}
                {children.map((child) => (
                    <SceneEntityNode
                        key={child.id}
                        entity={child}
                        childMap={childMap}
                        assetMap={assetMap}
                        selectedIdSet={selectedIdSet}
                        selectedEntityId={selectedEntityId}
                        editMode={editMode}
                        gizmoMode={gizmoMode}
                        gizmoAxis={gizmoAxis}
                        gizmoVisible={gizmoVisible}
                        overrideById={overrideById}
                        onSelectEntity={onSelectEntity}
                        onToggleSelectEntity={onToggleSelectEntity}
                        onTransformCommit={onTransformCommit}
                        orbitRef={orbitRef}
                    />
                ))}
            </group>
        )
    }
    return (
        <SelectableEntity
            entity={entity}
            assetMap={assetMap}
            selected={selectedIdSet.has(entity.id)}
            isPrimary={entity.id === selectedEntityId}
            editMode={editMode}
            gizmoMode={gizmoMode}
            gizmoAxis={gizmoAxis}
            gizmoVisible={gizmoVisible}
            overrideTransform={overrideById[entity.id] || null}
            onSelect={onSelectEntity}
            onToggleSelect={onToggleSelectEntity}
            onTransformCommit={onTransformCommit}
            orbitRef={orbitRef}
        />
    )
}

function MultiSelectionGizmo({ entities, editMode, gizmoMode, gizmoAxis, gizmoVisible, onPreview, onCommit, orbitRef }) {
    const pivotRef = useRef()
    const controlsRef = useRef()
    const initialPivotRef = useRef(null)
    const isDraggingRef = useRef(false)
    const centroid = useMemo(() => getSelectionCentroid(entities), [entities])
    const active = editMode === 'edit' && gizmoVisible && entities.length > 1

    useEffect(() => {
        const pivot = pivotRef.current
        if (!pivot || isDraggingRef.current) return
        pivot.position.set(...centroid)
        pivot.rotation.set(0, 0, 0)
        pivot.scale.set(1, 1, 1)
    }, [centroid])

    useEffect(() => {
        const controls = controlsRef.current
        const pivot = pivotRef.current
        if (!controls || !pivot || !active) return
        const orbitControls = orbitRef?.current
        controls.attach(pivot)
        controls.setSpace('world')

        const pivotTransform = () => ({
            position: pivot.position.toArray(),
            rotation: [pivot.rotation.x, pivot.rotation.y, pivot.rotation.z],
            scale: pivot.scale.toArray()
        })
        const preview = () => {
            if (!initialPivotRef.current) return []
            const updates = applyPivotTransform(entities, initialPivotRef.current, pivotTransform())
            onPreview(Object.fromEntries(updates.map((entry) => [entry.id, entry.transform])))
            return updates
        }
        const handleDraggingChanged = (event) => {
            const dragging = Boolean(event.value)
            isDraggingRef.current = dragging
            if (orbitControls) orbitControls.enabled = !dragging
            if (dragging) {
                initialPivotRef.current = pivotTransform()
            } else if (initialPivotRef.current) {
                const updates = preview()
                initialPivotRef.current = null
                onPreview({})
                onCommit(updates)
            }
        }
        const handleObjectChange = () => {
            if (isDraggingRef.current) preview()
        }
        controls.addEventListener('dragging-changed', handleDraggingChanged)
        controls.addEventListener('objectChange', handleObjectChange)
        return () => {
            controls.removeEventListener('dragging-changed', handleDraggingChanged)
            controls.removeEventListener('objectChange', handleObjectChange)
            controls.detach()
            if (orbitControls) orbitControls.enabled = true
        }
    }, [active, entities, onCommit, onPreview, orbitRef])

    return (
        <>
            <group ref={pivotRef} />
            {active && (
                <TransformControls
                    ref={controlsRef}
                    mode={gizmoMode}
                    showX={!gizmoAxis || gizmoAxis === 'x'}
                    showY={!gizmoAxis || gizmoAxis === 'y'}
                    showZ={!gizmoAxis || gizmoAxis === 'z'}
                />
            )}
        </>
    )
}

function RenderSettingsEffect({ renderSettings }) {
    const { gl } = useThree()
    useEffect(() => {
        gl.toneMapping = renderSettings?.toneMapping === 'none' ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = renderSettings?.toneMappingExposure ?? 1
        gl.shadowMap.enabled = renderSettings?.shadows !== false
    }, [gl, renderSettings?.toneMapping, renderSettings?.toneMappingExposure, renderSettings?.shadows])
    return null
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

function StudioSceneContent({
    document,
    selectedEntityId,
    selectedEntityIds = [],
    onSelectEntity,
    onToggleSelectEntity,
    editMode,
    gizmoMode,
    gizmoAxis = null,
    gizmoVisible = true,
    transformOp = null,
    onTransformCommit,
    onTransformCommitMany,
    onTransformCancel,
    onTransformStatus,
    controlsRef
}) {
    const isArMode = useXR((state) => state.mode === 'immersive-ar')
    const assetMap = useMemo(() => {
        const projectId = document.projectMeta?.id
        // Some imported projects never got a real asset URL written (legacy
        // import gap) — fall back to the standard project asset endpoint
        // instead of silently failing to render.
        return new Map((document.assets || []).map((asset) => [
            asset.id,
            asset.url || !projectId ? asset : { ...asset, url: buildProjectAssetUrl(projectId, asset.id) }
        ]))
    }, [document.assets, document.projectMeta?.id])
    const childMap = useMemo(() => {
        const map = new Map()
        for (const entity of (document.entities || [])) {
            if (entity.parentId) {
                if (!map.has(entity.parentId)) map.set(entity.parentId, [])
                map.get(entity.parentId).push(entity)
            }
        }
        return map
    }, [document.entities])
    const rootEntities = useMemo(() => (document.entities || []).filter((e) => !e.parentId), [document.entities])
    const [previewById, setPreviewById] = useState({})

    const selectedIdSet = useMemo(() => new Set(selectedEntityIds), [selectedEntityIds])
    const selectedEntities = useMemo(
        () => (document.entities || []).filter((entity) => selectedIdSet.has(entity.id)),
        [document.entities, selectedIdSet]
    )
    const transformableSelectedEntities = useMemo(
        () => selectedEntities.filter((entity) => (
            entity.components?.runtime?.visible !== false
            && entity.components?.runtime?.locked !== true
            && !entity.parentId
        )),
        [selectedEntities]
    )

    const handleModalCommit = (list) => {
        setPreviewById({})
        onTransformCommitMany?.(list)
    }
    const handleModalCancel = () => {
        setPreviewById({})
        onTransformCancel?.()
    }
    // Hide the drag-handle gizmo while the V1-parity modal transform is running.
    const gizmoVisibleEffective = gizmoVisible && !transformOp

    return (
        <>
            <RenderSettingsEffect renderSettings={document.renderSettings} />
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
                        position={[0, -(document.worldState?.gridOffset ?? 0.015), 0]}
                        args={[document.worldState?.gridSize || 24, document.worldState?.gridSize || 24]}
                        cellSize={document.worldState?.gridCellSize ?? 0.75}
                        cellThickness={document.worldState?.gridCellThickness ?? 0.3}
                        color={document.worldState?.gridCellColor || '#2a6e73'}
                        sectionSize={document.worldState?.gridSectionSize ?? 6}
                        sectionThickness={document.worldState?.gridSectionThickness ?? 0.65}
                        sectionColor={document.worldState?.gridSectionColor || '#4df9ff'}
                        fadeDistance={document.worldState?.gridFadeDistance ?? 80}
                        fadeStrength={document.worldState?.gridFadeStrength ?? 1}
                    />
                )}
                <Suspense fallback={null}>
                    {rootEntities.map((entity) => (
                        <SceneEntityNode
                            key={entity.id}
                            entity={entity}
                            childMap={childMap}
                            assetMap={assetMap}
                            selectedIdSet={selectedIdSet}
                            selectedEntityId={selectedEntityId}
                            editMode={editMode}
                            gizmoMode={gizmoMode}
                            gizmoAxis={gizmoAxis}
                            gizmoVisible={gizmoVisibleEffective && transformableSelectedEntities.length === 1}
                            overrideById={previewById}
                            onSelectEntity={onSelectEntity}
                            onToggleSelectEntity={onToggleSelectEntity}
                            onTransformCommit={onTransformCommit}
                            orbitRef={controlsRef}
                        />
                    ))}
                    <MultiSelectionGizmo
                        entities={transformableSelectedEntities}
                        editMode={editMode}
                        gizmoMode={gizmoMode}
                        gizmoAxis={gizmoAxis}
                        gizmoVisible={gizmoVisibleEffective}
                        onPreview={setPreviewById}
                        onCommit={onTransformCommitMany}
                        orbitRef={controlsRef}
                    />
                </Suspense>
            </group>
            {transformOp && selectedEntities.length > 0 && (
                <ModalTransform
                    op={transformOp}
                    selectedEntities={selectedEntities}
                    controlsRef={controlsRef}
                    onPreview={setPreviewById}
                    onCommit={handleModalCommit}
                    onCancel={handleModalCancel}
                    onStatus={onTransformStatus}
                />
            )}
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

const TOOLBAR_BTN_ACTIVE_STRONG = {
    background: 'rgba(79,214,255,0.28)',
    borderColor: '#4fd6ff',
    color: '#4fd6ff',
    boxShadow: '0 0 8px rgba(79,214,255,0.35)'
}

const SHORTCUT_SECTIONS = [
    {
        title: 'Selection',
        rows: [
            ['Click', 'Select entity'],
            ['Ctrl / Shift + Click', 'Multi-select'],
            ['A', 'Select all'],
            ['Alt+A', 'Deselect all'],
            ['Esc', 'Deselect'],
        ]
    },
    {
        title: 'Transform',
        rows: [
            ['G', 'Move (grab) mode'],
            ['R', 'Rotate mode'],
            ['S', 'Scale mode'],
            ['→ X / Y / Z', 'Constrain axis + start drag'],
            ['→ A', 'All axes (uniform)'],
            ['Shift + drag', 'Fine / slow adjustment'],
            ['Click · Enter · Space', 'Confirm'],
            ['Esc', 'Cancel'],
        ]
    },
    {
        title: 'Edit',
        rows: [
            ['Ctrl+C / X / V', 'Copy / Cut / Paste'],
            ['Shift+D / Ctrl+D', 'Duplicate'],
            ['Del / Backspace', 'Delete selected'],
            ['Ctrl+G', 'Group selection'],
            ['Ctrl+Shift+G', 'Ungroup'],
            ['F', 'Frame selection'],
            ['Ctrl+Z', 'Undo'],
            ['Ctrl+Shift+Z / Ctrl+Y', 'Redo'],
        ]
    },
    {
        title: 'View',
        rows: [
            ['Tab / E', 'Toggle Navigate ↔ Edit'],
            ['T', 'Toggle gizmo visibility'],
            ['H', 'Hide / show UI'],
            ['Scroll', 'Zoom'],
            ['Middle drag', 'Orbit'],
            ['Right drag', 'Pan'],
        ]
    },
    {
        title: 'UI',
        rows: [
            ['Double-click viewport', 'Quick insert'],
            ['Shift+A', 'Tile panels'],
            ['Shift+R', 'Reset layout'],
            ['Shift+?', 'Show this help'],
        ]
    }
]

function HotkeyHelp({ onClose }) {
    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(6,10,16,0.82)', backdropFilter: 'blur(6px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 24
            }}
        >
            <div
                style={{
                    background: 'rgba(14,20,30,0.97)', border: '1px solid rgba(79,214,255,0.25)',
                    borderRadius: 12, padding: '28px 32px', maxWidth: 860, width: '100%',
                    boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
                    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px 36px'
                }}
            >
                <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ color: '#4fd6ff', fontWeight: 700, fontSize: 14, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Keyboard Shortcuts</span>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>×</button>
                </div>
                {SHORTCUT_SECTIONS.map((section) => (
                    <div key={section.title}>
                        <div style={{ color: 'rgba(79,214,255,0.7)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>{section.title}</div>
                        {section.rows.map(([key, desc]) => (
                            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 7 }}>
                                <code style={{ color: '#4fd6ff', background: 'rgba(79,214,255,0.1)', border: '1px solid rgba(79,214,255,0.2)', borderRadius: 4, padding: '1px 6px', fontSize: 11, whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace' }}>{key}</code>
                                <span style={{ color: 'rgba(200,216,232,0.8)', fontSize: 12, textAlign: 'right' }}>{desc}</span>
                            </div>
                        ))}
                    </div>
                ))}
                <div style={{ gridColumn: '1/-1', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14, color: 'rgba(255,255,255,0.3)', fontSize: 11, textAlign: 'center' }}>
                    Press <code style={{ color: 'rgba(79,214,255,0.6)', background: 'rgba(79,214,255,0.08)', borderRadius: 3, padding: '0 4px' }}>Shift+?</code> or <code style={{ color: 'rgba(79,214,255,0.6)', background: 'rgba(79,214,255,0.08)', borderRadius: 3, padding: '0 4px' }}>Esc</code> to close
                </div>
            </div>
        </div>
    )
}

function ViewportToolbar({ editMode, setEditMode, gizmoMode, setGizmoMode }) {
    const btn = (label, isActive, onClick) => (
        <button
            type="button"
            style={isActive ? { ...TOOLBAR_BTN, ...TOOLBAR_BTN_ACTIVE_STRONG } : TOOLBAR_BTN}
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
            <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.15)', margin: '0 2px' }} />
            {btn('Move', gizmoMode === 'translate', () => setGizmoMode('translate'))}
            {btn('Rotate', gizmoMode === 'rotate', () => setGizmoMode('rotate'))}
            {btn('Scale', gizmoMode === 'scale', () => setGizmoMode('scale'))}
        </div>
    )
}

export default function StudioViewport({
    document,
    selectedEntityId,
    selectedEntityIds = [],
    onSelectEntity,
    onToggleSelectEntity,
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
    gizmoAxis = null,
    gizmoVisible = true,
    transformOp = null,
    setEditMode,
    setGizmoMode,
    onTransformCommit,
    onTransformCommitMany,
    onTransformCancel,
    enableNavigation = true,
    showHelp = false,
    onCloseHelp,
    onShowHelp,
}) {
    const viewportRef = useRef(null)
    const [transformStatus, setTransformStatus] = useState(null)
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
                shadows={document.renderSettings?.shadows !== false}
                gl={{ antialias: document.renderSettings?.antialias !== false }}
                dpr={[document.renderSettings?.dprMin ?? 1, document.renderSettings?.dprMax ?? 2]}
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
                        selectedEntityIds={selectedEntityIds}
                        onSelectEntity={onSelectEntity}
                        onToggleSelectEntity={onToggleSelectEntity}
                        editMode={editMode}
                        gizmoMode={gizmoMode}
                        gizmoAxis={gizmoAxis}
                        gizmoVisible={gizmoVisible}
                        transformOp={transformOp}
                        onTransformCommit={onTransformCommit}
                        onTransformCommitMany={onTransformCommitMany}
                        onTransformCancel={onTransformCancel}
                        onTransformStatus={setTransformStatus}
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

            {transformStatus && (
                <div className="studio-transform-hud">{transformStatus.text}</div>
            )}

            <FullscreenButton />
            {onShowHelp && (
                <button
                    type="button"
                    onClick={onShowHelp}
                    title="Keyboard shortcuts (Shift+?)"
                    style={{
                        position: 'absolute',
                        bottom: 48,
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
                        fontSize: 13,
                        fontWeight: 700,
                        padding: 0,
                        transition: 'color 0.12s, border-color 0.12s, background 0.12s',
                        pointerEvents: 'auto'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#4fd6ff'
                        e.currentTarget.style.borderColor = 'rgba(79,214,255,0.4)'
                        e.currentTarget.style.background = 'rgba(15,23,34,0.82)'
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'rgba(255,255,255,0.55)'
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                        e.currentTarget.style.background = 'rgba(15,23,34,0.55)'
                    }}
                >
                    ?
                </button>
            )}

            {showHelp && <HotkeyHelp onClose={onCloseHelp} />}

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
