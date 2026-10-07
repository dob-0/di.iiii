import { registerEntityObject } from '../utils/entityObjectRegistry.js'
import { GIZMO_SNAP, useSnapModifier } from '../utils/gizmoSnap.js'
import StudioGraphNodes from './StudioGraphNodes.jsx'
import { runViewCommand } from '../utils/viewCommands.js'
import { Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import '../styles/studio.css'
import { CameraControls, Grid, Html, TransformControls } from '@react-three/drei'
import RigMirror from './RigMirror.jsx'
import { useLiveLightEntity } from '../../rigMirror/liveLight.js'
import { useRigLookEntities } from '../../rigbuild/useRigLook.js'
import { hasRigLamps } from '../../rigbuild/hasRigLamps.js'
import LiveScreens from './LiveScreens.jsx'
import { XR, useXR } from '@react-three/xr'
import ModalTransform from './ModalTransform.jsx'
import EntityContent from '../../project/viewport/EntityContent.jsx'
import EntityLink from '../../project/viewport/EntityLink.jsx'
import { EntityLinksContext } from '../../project/viewport/entityLinkContext.js'
import WorldEnvironment from '../../project/viewport/WorldEnvironment.jsx'
import RenderSettingsEffect from '../../project/viewport/RenderSettingsEffect.jsx'
import '../../project/viewport/spotLightSkip.js'
import { arrivalLightsOf } from '../../project/viewport/worldLights.js'
import ShadowCasting from '../../project/viewport/ShadowCasting.jsx'
import ShaderWarmup from '../../project/viewport/ShaderWarmup.jsx'
import { resolveShadowCasting } from '../../project/viewport/shadowCasting.js'
import { buildAssetMap } from '../../project/viewport/buildAssetMap.js'
import { applyPivotTransform, getSelectionCentroid } from '../utils/multiTransform.js'
import { hasTimelineTracks, sampleTimeline, applyTimelinePose } from '../../project/viewport/timelinePlayback.js'
import { animationSeed, applyAnimation, authoredAnimation } from '../../project/viewport/entityAnimation.js'
import { applyProximity, resolveProximity } from '../../project/viewport/entityProximity.js'
import {
    advanceTimelinePreview,
    getTimelinePreview,
    isTimelinePreviewPosed,
    setTimelinePreview
} from '../utils/timelinePreview.js'
import StudioHelpDialog from './StudioHelpDialog.jsx'
import { controlBindingsFor, getNavigationPreset, mouseButtonsFor } from '../navigation/mappings.js'
import { useNavigationPreference } from '../navigation/preference.js'
import { useCameraNavigation, entityRoots } from '../navigation/useCameraNavigation.js'
import { contentBoundary } from '../navigation/autoDepth.js'
import { useFocusUnderPointer } from '../navigation/useFocusUnderPointer.js'
import { clipPlanesFor, controlSpeedsFor, maxPolarAboveFloor, useCameraSettings } from '../navigation/cameraSettings.js'
import { WebglContextLostOverlay, useWebglContextGuard } from '../../components/WebglContextGuard.jsx'
import SceneEntityErrorBoundary from '../../components/SceneEntityErrorBoundary.jsx'
import SmartViewBar from '../../project/viewport/smartView/SmartViewBar.jsx'
import useSmartViewState from '../../project/viewport/smartView/useSmartViewState.js'
import { classifyArchitecture } from '../../project/viewport/smartView/smartViewGeometry.js'
import { useViewportMode } from '../../hooks/useViewportMode.js'

// The lamps' bodies (src/rigbuild/RigBodies.jsx): loaded only by a room that has a rig.
const RigBodies = lazy(() => import('../../rigbuild/RigBodies.jsx'))
// The smart view (docs/architecture/SMART_VIEW.md): loaded only by a room with a building
// in it — a place, or a model big enough to be one — so every other room pays nothing.
const SmartView = lazy(() => import('../../project/viewport/smartView/SmartView.jsx'))

const AR_SCENE_POSITION = [0, 0, -1.2]
const DEFAULT_SCENE_POSITION = [0, 0, 0]


// True when this viewport is showing a finished piece rather than hosting an
// edit session: authored timelines then play continuously off the render clock,
// with no scrubber to drive them. StudioViewport is BOTH the editor viewport and
// the published viewer's default (orbit) view — without this, keyframes only ever
// moved while someone dragged the Timeline scrubber, so every published scene sat
// frozen on its authored pose.
const LiveTimelineContext = createContext(false)

// Pose driver for one entity group.
//
// Timeline preview: pose the group from the sampled timeline while the Scene
// window's Timeline section is playing or scrubbing this entity, restore the
// authored pose (and touched material opacities) the moment it stops. In a
// published viewer there is no scrubber, so the render clock drives it instead.
//
// Authored motion (`components.animation`) and proximity dimming
// (`components.proximity`) ride along, but ONLY in a published viewer
// (LiveTimelineContext, i.e. the `playTimelines` surface). Walk mode has always
// applied both, so a visitor's arrival frame was a still life of the room they
// were about to see moving; the editor must stay still, because objects that
// drift under the gizmo cannot be placed.
//
// `authoredAnimation`, NOT `resolveAnimation`: the arrival frame shows motion
// someone chose, never the imported-scene fallback that floats models and sways
// images when no animation component exists. Walk keeps that fallback — see the
// note on `authoredAnimation` for why the first frame is not the place for it.
function useEntityPose(entity, groupRef, isDraggingRef = null) {
    const playLive = useContext(LiveTimelineContext)
    const wasPosed = useRef(false)
    const opacityBackup = useRef(null)
    const timeline = entity.components?.timeline
    const anim = useMemo(() => authoredAnimation(entity), [entity])
    const prox = useMemo(() => resolveProximity(entity), [entity])
    const seed = useMemo(() => animationSeed(entity.id), [entity.id])
    const proxPoint = useRef(new THREE.Vector3())
    useFrame((state) => {
        const group = groupRef.current
        if (!group) return
        // Mid-drag the gizmo owns the group — neither pose nor restore may touch it.
        if (isDraggingRef?.current === true) return
        // Dimming is independent of the pose, so it runs before the early
        // return the timeline branch takes — same order as walk mode.
        if (playLive && prox) applyProximity(group, prox, state.camera.position, proxPoint.current)
        // The scrubber wins when it is driving: an author scrubbing in a viewport
        // that also plays live must see the frame they asked for, not the clock's.
        const scrubbing = isTimelinePreviewPosed(entity.id)
        if ((scrubbing || playLive) && hasTimelineTracks(timeline)) {
            const at = scrubbing ? getTimelinePreview().time : state.clock.getElapsedTime()
            const pose = sampleTimeline(timeline, at)
            if (pose?.opacity !== undefined && !opacityBackup.current) {
                const backup = new Map()
                group.traverse((object) => {
                    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : []
                    materials.forEach((material) => backup.set(material, { opacity: material.opacity, transparent: material.transparent }))
                })
                opacityBackup.current = backup
            }
            const t = entity.components?.transform || {}
            applyTimelinePose(group, pose, {
                position: t.position || [0, 0, 0],
                rotation: t.rotation || [0, 0, 0],
                scale: t.scale || [1, 1, 1]
            })
            wasPosed.current = true
            return
        }
        // Authored keyframes replace authored motion, exactly as in walk mode.
        if (playLive && anim) {
            const t = entity.components?.transform || {}
            applyAnimation(
                group,
                anim,
                t.position || [0, 0, 0],
                t.rotation || [0, 0, 0],
                state.clock.getElapsedTime() + seed
            )
            wasPosed.current = true
            return
        }
        if (wasPosed.current) {
            wasPosed.current = false
            const t = entity.components?.transform || {}
            group.position.set(...(t.position || [0, 0, 0]))
            group.rotation.set(...(t.rotation || [0, 0, 0]))
            group.scale.set(...(t.scale || [1, 1, 1]))
            if (opacityBackup.current) {
                opacityBackup.current.forEach((original, material) => {
                    material.opacity = original.opacity
                    material.transparent = original.transparent
                })
                opacityBackup.current = null
            }
        }
    })
}

function TimelinePreviewDriver() {
    useFrame((_, delta) => advanceTimelinePreview(delta))
    return null
}

// Published-viewer showreel: stand the camera at one point inside the piece and
// turn it slowly on the spot, so a visitor who touches nothing is still shown
// the whole room. Only ever runs in a published viewer (playTimelines), and
// yields permanently the first time the visitor grabs the controls — an
// auto-turn that fights the mouse is worse than no auto-turn at all.
const AUTO_LOOK_REACH = 6
function AutoLookAround({ controlsRef, config }) {
    const startedAt = useRef(null)
    const surrendered = useRef(false)

    useEffect(() => {
        const cc = controlsRef?.current
        if (!cc) return undefined
        const yield_ = () => { surrendered.current = true }
        cc.addEventListener('controlstart', yield_)
        return () => cc.removeEventListener('controlstart', yield_)
    }, [controlsRef])

    useFrame((state) => {
        const cc = controlsRef?.current
        if (!cc || surrendered.current) return
        const now = state.clock.getElapsedTime()
        if (startedAt.current === null) startedAt.current = now
        // The camera takes its place immediately — only the TURN waits, so an
        // intro title placed for this viewpoint is on screen from frame one
        // rather than playing out behind the visitor.
        const t = Math.max(0, now - startedAt.current - (config.delay || 0))
        const [cx, cy, cz] = config.center || [0, 1.6, 0]
        const angle = (config.startAngle || 0) + t * (config.speed ?? 0.18)
        cc.setLookAt(
            cx, cy, cz,
            cx + Math.sin(angle) * AUTO_LOOK_REACH,
            cy + (config.pitch || 0),
            cz + Math.cos(angle) * AUTO_LOOK_REACH,
            false
        )
    })
    return null
}

function SelectableEntity({ entity, assetMap, screens = null, selected, isPrimary, editMode, gizmoMode, gizmoAxis = null, gizmoVisible = true, overrideTransform = null, onSelect, onToggleSelect, onTransformCommit, orbitRef }) {
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

    // setFromObject does a full subtree traverse + bbox recompute -- only
    // worth paying every frame while the object is actually moving (an
    // active drag/gizmo transform); otherwise the position-sync effect
    // above already re-renders on every real transform change, so a single
    // sync there keeps the box correct without a per-frame cost for a
    // selected-but-static entity (2026-07-17 perf audit).
    useEffect(() => {
        if (highlightRef.current && groupRef.current) {
            highlightRef.current.setFromObject(groupRef.current)
        }
    }, [overrideTransform, entity.components?.transform, selected])

    useFrame(() => {
        if (isDragging.current && highlightRef.current && groupRef.current) {
            highlightRef.current.setFromObject(groupRef.current)
        }
    })

    const gizmoActive = isPrimary && editMode === 'edit' && gizmoVisible && !isLocked
    const snapping = useSnapModifier()
    useEntityPose(entity, groupRef, isDragging)

    // Real extents for View Selected / View All (viewCommands.js).
    useEffect(() => registerEntityObject(entity.id, groupRef.current), [entity.id, isVisible])

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
            // Grabbing the gizmo mid-preview hands the previewed pose to the drag:
            // preview stops holding, the release commits where the user dropped it.
            if (e.value && isTimelinePreviewPosed(entity.id)) {
                setTimelinePreview({ playing: false, hold: false })
            }
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

    // A lamp with a fixture number draws what the desk says it is emitting, while the
    // desk is here; the authored light otherwise (src/rigMirror/liveLight.js). The
    // document is untouched — only what reaches the renderer changes.
    const shown = useLiveLightEntity(entity)

    if (!isVisible) return null

    return (
        <>
            <group
                ref={groupRef}
                position={t.position || [0, 0, 0]}
                rotation={t.rotation || [0, 0, 0]}
                scale={t.scale || [1, 1, 1]}
                // How the smart view finds an entity's object (SmartView.jsx).
                userData={{ svEntityId: entity.id }}
                onClick={(e) => {
                    e.stopPropagation()
                    const additive = e.nativeEvent?.ctrlKey || e.nativeEvent?.metaKey || e.nativeEvent?.shiftKey
                    if (additive) onToggleSelect?.(entity.id)
                    else onSelect?.(entity.id)
                }}
            >
                {/* Live only where the surface turned links on (a visitor's
                    view mode) — see entityLinkContext.js. */}
                <EntityLink entity={entity}>
                    <EntityContent entity={shown} assetMap={assetMap} screens={screens} />
                </EntityLink>
                {selected && (
                    <Html position={[0, 1.8, 0]} center zIndexRange={[900, 0]}>
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
                    translationSnap={snapping ? GIZMO_SNAP.translation : null}
                    rotationSnap={snapping ? GIZMO_SNAP.rotation : null}
                    scaleSnap={snapping ? GIZMO_SNAP.scale : null}
                />
            )}
        </>
    )
}

function SceneEntityNode({ entity, childMap, assetMap, screens = null, selectedIdSet, selectedEntityId, editMode, gizmoMode, gizmoAxis, gizmoVisible, overrideById, onSelectEntity, onToggleSelectEntity, onTransformCommit, orbitRef }) {
    const groupTimelineRef = useRef(null)
    useEntityPose(entity, groupTimelineRef)
    const t = entity.components?.transform || {}
    if (entity.type === 'group') {
        const children = childMap.get(entity.id) || []
        const selected = selectedIdSet.has(entity.id)
        return (
            <group
                ref={groupTimelineRef}
                position={t.position || [0, 0, 0]}
                rotation={t.rotation || [0, 0, 0]}
                scale={t.scale || [1, 1, 1]}
                userData={{ svEntityId: entity.id }}
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
                    <Html position={[0, 0.25, 0]} center zIndexRange={[900, 0]}>
                        <span className="studio-selection-pill">{entity.name}</span>
                    </Html>
                )}
                {children.map((child) => (
                    <SceneEntityNode
                        key={child.id}
                        entity={child}
                        childMap={childMap}
                        assetMap={assetMap}
                        screens={screens}
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
            screens={screens}
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
    const snapping = useSnapModifier()

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
                    translationSnap={snapping ? GIZMO_SNAP.translation : null}
                    rotationSnap={snapping ? GIZMO_SNAP.rotation : null}
                    scaleSnap={snapping ? GIZMO_SNAP.scale : null}
                />
            )}
        </>
    )
}

function StudioOrbit({ controlsRef, cameraView, lensFov = null, onCameraChange, onRotateStart, enabled = true, fovRef = null, selectedEntityIds = null }) {
    const isXrPresenting = useXR((state) => state.session != null)
    const scene = useThree((state) => state.scene)
    const getScene = useCallback(() => scene, [scene])

    // Mouse navigation preset (Shift+? > Shortcuts). 'studio' is the default and
    // the bindings Studio always had; see src/studio/navigation/mappings.js.
    const navigation = useNavigationPreference()
    const preset = getNavigationPreset(navigation.preset)
    const isOrtho = (cameraView?.fov ?? 50) < 20
    const { settings: camSettings } = useCameraSettings()
    const speeds = useMemo(() => controlSpeedsFor(camSettings), [camSettings])
    useFocusUnderPointer({ controlsRef, getScene, selectedEntityIds, active: enabled && !isXrPresenting })
    const authoredFar = useRef(cameraView?.far || 0)
    const boundaryTick = useRef(0)
    useCameraNavigation({
        controlsRef,
        presetId: preset.id,
        ortho: isOrtho,
        orbitSelection: navigation.orbitSelection,
        pointerPivot: camSettings.pointerPivot,
        selectedEntityIds,
        getScene,
        active: enabled && !isXrPresenting,
    })

    // The lens the camera eases toward. Shared with the smart view when there is one
    // (a preset changes the lens as well as the place), else this component's own.
    const ownFovRef = useRef(cameraView?.fov || 50)
    const targetFovRef = fovRef || ownFovRef

    // Wheel always dollies (zooms) — never rotates. A plain mouse wheel and a
    // trackpad two-finger swipe both arrive as wheel events with ctrlKey:false,
    // so there is no reliable way to tell them apart (see golden rule "Input
    // handling never guesses the device"); a prior version routed non-ctrl
    // wheel to ROTATE for trackpad swipe-to-look, which broke normal mouse
    // wheel zoom for everyone. `mouseButtons.wheel` is already DOLLY by
    // default below; ctrlKey (trackpad pinch) also dollies, redundantly.

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
        // The camera panel's lens wins over the view's own (a fixed opening shot has one).
        if (lensFov != null) targetFovRef.current = lensFov
    }, [cameraView?.fov, lensFov, targetFovRef])

    // Writable copies for camera-controls, made once per preset (navigation/
    // mappings.js controlBindingsFor): it keeps the object it is given, and
    // this file and useCameraNavigation write into it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const bindings = useMemo(() => controlBindingsFor(preset.id), [preset.id])

    // In ortho views (small FOV), left drag pans instead of rotating so you can
    // navigate the locked view and arrange objects — same as Blender's ortho behavior
    // (Also restores the preset's resting bindings when the preset changes.)
    useEffect(() => {
        const cc = controlsRef.current
        if (!cc) return
        Object.assign(cc.mouseButtons, mouseButtonsFor(preset.id, { ortho: isOrtho }))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOrtho, preset.id])

    // Smooth FOV lerp — runs every frame inside the R3F canvas
    useFrame(() => {
        const cc = controlsRef.current
        if (!cc) return
        const cam = cc._camera
        if (!cam?.isPerspectiveCamera) return
        // Clip planes follow the distance, so zooming out never leaves the room behind
        // the far plane (cameraSettings.js clipPlanesFor).
        // The orbit point stays near the content: re-measured every two seconds, so a
        // moved or added object is in the box without a listener.
        boundaryTick.current += 1
        if (boundaryTick.current % 120 === 1) {
            cc.boundaryEnclosesCamera = false
            const box = contentBoundary(entityRoots(scene))
            if (box) cc.setBoundary(box)
        }
        const { near, far } = clipPlanesFor(cc.distance, authoredFar.current)
        let dirty = false
        if (Math.abs(cam.near - near) > near * 0.05) { cam.near = near; dirty = true }
        if (Math.abs(cam.far - far) > far * 0.05) { cam.far = far; dirty = true }
        // Zooming out glides up, never through the floor (a camera below the target would
        // otherwise end up under the room). Ortho views look straight down/up on purpose.
        if (camSettings.keepAboveFloor && !isOrtho) {
            const limit = maxPolarAboveFloor(cc._target.y, cc.distance)
            cc.maxPolarAngle = limit
            // camera-controls only applies the limit when you rotate; a zoom-out changes the
            // distance and leaves the angle, so lift it here (a few degrees per frame at most
            // would feel like a hand; one step keeps the camera exactly on the limit).
            if (cc.polarAngle > limit + 1e-3) cc.rotatePolarTo(limit, false)
        } else {
            cc.maxPolarAngle = Math.PI
        }
        const target = targetFovRef.current
        if (Math.abs(cam.fov - target) >= 0.05) {
            cam.fov += (target - cam.fov) * 0.08
            dirty = true
        }
        if (dirty) cam.updateProjectionMatrix()
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
            dollyToCursor={preset.dollyToCursor}
            smoothTime={0.15}
            draggingSmoothTime={0.0}
            // Past the minimum the wheel carries the pivot forward instead of stopping
            // dead (owner, Cascade club, 2026-09-02; branch fix/orbit-infinity-dolly).
            infinityDolly
            minDistance={0.05}
            maxDistance={800}
            dollySpeed={speeds.dollySpeed}
            truckSpeed={speeds.truckSpeed}
            azimuthRotateSpeed={speeds.azimuthRotateSpeed}
            polarRotateSpeed={speeds.polarRotateSpeed}
            mouseButtons={bindings.mouseButtons}
            touches={bindings.touches}
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
    controlsRef,
    playTimelines = false,
    rigMirror = false,
    screens = null,
    followLinks = false,
    rigLook = undefined,
    smartView = null,
    graphRoom = null
}) {
    const isArMode = useXR((state) => state.mode === 'immersive-ar')
    // Keyed on assets + project id so the map only rebuilds when assets change,
    // not on every document identity change from a sync tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const assetMap = useMemo(() => buildAssetMap(document), [document.assets, document.projectMeta?.id])
    // A room with designed looks draws its lamps posed by the look the desk is playing
    // (src/rigbuild/useRigLook.js — a view, the document is untouched); any other room
    // is exactly its document.
    const { entities: sceneEntities } = useRigLookEntities(document, { explicit: rigLook })
    const childMap = useMemo(() => {
        const map = new Map()
        for (const entity of sceneEntities) {
            if (entity.parentId) {
                if (!map.has(entity.parentId)) map.set(entity.parentId, [])
                map.get(entity.parentId).push(entity)
            }
        }
        return map
    }, [sceneEntities])
    // Inside a Geo the room IS the Geo's inside, as in Nodes after "›": Studio's
    // own objects stand in the top room and are not drawn there.
    const insideGeo = Boolean(graphRoom?.editable)
    const rootEntities = useMemo(
        () => (insideGeo ? [] : sceneEntities.filter((e) => !e.parentId)),
        [sceneEntities, insideGeo]
    )
    const hasRig = useMemo(() => hasRigLamps(sceneEntities), [sceneEntities])
    const [previewById, setPreviewById] = useState({})

    const selectedIdSet = useMemo(() => new Set(selectedEntityIds), [selectedEntityIds])
    const selectedEntities = useMemo(
        () => sceneEntities.filter((entity) => selectedIdSet.has(entity.id)),
        [sceneEntities, selectedIdSet]
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

    // Same fog semantics as LiveProjectScene: colour falls back to the
    // background, `enabled: false` switches it off.
    const fog = document.worldState?.fog
    const arrivalLights = arrivalLightsOf(document.worldState)
    // Shadows from the room: off unless this space asked for them. The arrival
    // frame and walk mode read the same switch (shadowCasting.js).
    const shadowCasting = resolveShadowCasting(document.renderSettings)
    const fogAuthored = Boolean(fog) && fog.enabled !== false
    const fogColor = fog?.color || document.worldState?.backgroundColor || '#0a1118'
    const fogNear = fog?.near ?? 8
    const fogFar = fog?.far ?? 50

    return (
        <LiveTimelineContext.Provider value={playTimelines}>
        <EntityLinksContext.Provider value={followLinks}>
            <RenderSettingsEffect renderSettings={document.renderSettings} />
            <ShaderWarmup />
            <ShadowCasting enabled={shadowCasting.enabled} mapSize={shadowCasting.mapSize} />
            <color attach="background" args={[document.worldState?.backgroundColor || '#0a1118']} />
            {/* Authored fog reached walk mode only. A room composed with
                atmosphere therefore had none in the frame a visitor ARRIVES on
                and gained it a click later — the same document, two answers.
                Only an AUTHORED fog is honoured here: walk mode's implicit
                8..50m default is composed for a camera standing inside the room
                at eye height, and an orbit camera that frames a large scene from
                40m outside would wash the whole arrival to the fog colour. */}
            {fogAuthored && (
                <fog attach="fog" args={[fogColor, fogNear, fogFar]} />
            )}
            {document.worldState?.environmentAssetId && (
                <WorldEnvironment
                    environmentAsset={assetMap?.get(document.worldState.environmentAssetId) || null}
                    intensity={document.worldState?.environmentIntensity}
                />
            )}
            {/* an authored 0 is dark (worldLights.js) */}
            <ambientLight color={arrivalLights.ambient.color} intensity={arrivalLights.ambient.intensity} />
            <directionalLight
                color={arrivalLights.directional.color}
                intensity={arrivalLights.directional.intensity}
                position={arrivalLights.directional.position}
            />
            <TimelinePreviewDriver />
            {playTimelines && document.worldState?.autoLook?.enabled ? (
                <AutoLookAround controlsRef={controlsRef} config={document.worldState.autoLook} />
            ) : null}
            {/* The real lighting rig, mirrored read-only. Editor furniture: outside the
                objects group, never in a published viewer, never in AR. */}
            {rigMirror && !playTimelines && !isArMode ? (
                <Suspense fallback={null}>
                    <RigMirror />
                </Suspense>
            ) : null}
            <group position={isArMode ? AR_SCENE_POSITION : DEFAULT_SCENE_POSITION}>
                {/* drei's Grid takes `cellColor`, not `color`: the prop name was
                    wrong here, so the Studio's "Grid cell colour" picker wrote a
                    field nothing read and every grid drew its cells in drei's
                    default black. */}
                {document.worldState?.gridVisible !== false && !isArMode && (
                    <Grid
                        // Furniture, not scenery — see LiveProjectScene's grid.
                        userData={{ noShadow: true }}
                        position={[0, -(document.worldState?.gridOffset ?? 0.015), 0]}
                        args={[document.worldState?.gridSize || 24, document.worldState?.gridSize || 24]}
                        cellSize={document.worldState?.gridCellSize ?? 0.75}
                        cellThickness={document.worldState?.gridCellThickness ?? 0.3}
                        cellColor={document.worldState?.gridCellColor || '#2a6e73'}
                        sectionSize={document.worldState?.gridSectionSize ?? 6}
                        sectionThickness={document.worldState?.gridSectionThickness ?? 0.65}
                        sectionColor={document.worldState?.gridSectionColor || '#4df9ff'}
                        fadeDistance={document.worldState?.gridFadeDistance ?? 80}
                        fadeStrength={document.worldState?.gridFadeStrength ?? 1}
                    />
                )}
                <Suspense fallback={null}>
                    {rootEntities.map((entity) => (
                        <SceneEntityErrorBoundary key={entity.id} resetKey={entity.id}>
                            <SceneEntityNode
                                entity={entity}
                                childMap={childMap}
                                assetMap={assetMap}
                                screens={screens}
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
                        </SceneEntityErrorBoundary>
                    ))}
                    {/* What Nodes made: the top room's Geos and things, read-only,
                        or — inside a Geo — what stands in it, editable. Its own
                        boundary, so a model loading there never blanks the
                        objects beside it. */}
                    {graphRoom ? (
                        <Suspense fallback={null}>
                            <StudioGraphNodes
                                document={document}
                                graphRoom={graphRoom}
                                editMode={editMode}
                                gizmoMode={gizmoMode}
                                gizmoAxis={gizmoAxis}
                                gizmoVisible={gizmoVisibleEffective}
                                orbitRef={controlsRef}
                            />
                        </Suspense>
                    ) : null}
                    {/* Its own boundary: the lazy chunk (and its models) suspending here
                        must never hide or remount every root entity and the gizmo with it
                        — the whole room blanked while the lamps' bodies loaded. */}
                    {hasRig && !insideGeo ? (
                        <Suspense fallback={null}>
                            <RigBodies entities={sceneEntities} />
                        </Suspense>
                    ) : null}
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
            {smartView && !isArMode ? (
                <Suspense fallback={null}>
                    <SmartView
                        document={document}
                        controlsRef={controlsRef}
                        fovRef={smartView.fovRef}
                        command={smartView.command}
                        xray={smartView.xray}
                        constraints={smartView.constraints}
                        lockInside={smartView.lockInside}
                        onBuilding={smartView.onBuilding}
                        onLockPaused={smartView.onLockPaused}
                        fogBase={fogAuthored ? { near: fogNear, far: fogFar } : null}
                        onPresets={smartView.onPresets}
                        onUserMove={smartView.onUserMove}
                    />
                </Suspense>
            ) : null}
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
        </EntityLinksContext.Provider>
        </LiveTimelineContext.Provider>
    )
}

const TOOLBAR_BTN = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '5px 11px',
    borderRadius: '2px',
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
                borderRadius: 2,
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

// Every Blender numpad view command as a visible, labelled 44 px button, so a laptop
// without a numpad (WCAG 2.1.1) and a touch screen (2.5.1) reach the same commands.
const VIEW_BUTTONS = [
    ['Front', 'View from the front (Numpad 1, Shift+1)', { kind: 'axis', axis: 'front', back: false }],
    ['Back', 'View from the back (Ctrl+Numpad 1, Ctrl+Shift+1)', { kind: 'axis', axis: 'front', back: true }],
    ['Right', 'View from the right (Numpad 3, Shift+3)', { kind: 'axis', axis: 'right', back: false }],
    ['Left', 'View from the left (Ctrl+Numpad 3, Ctrl+Shift+3)', { kind: 'axis', axis: 'right', back: true }],
    ['Top', 'View from the top (Numpad 7, Shift+7)', { kind: 'axis', axis: 'top', back: false }],
    ['Bottom', 'View from the bottom (Ctrl+Numpad 7, Ctrl+Shift+7)', { kind: 'axis', axis: 'top', back: true }],
    ['Frame', 'Frame the selection (F, Numpad .)', { kind: 'frame-selected' }],
    ['All', 'Frame the whole room (Home)', { kind: 'frame-all' }]
]

function ViewCommandBar({ onCommand }) {
    return (
        <div
            role="toolbar"
            aria-label="View commands"
            style={{
                position: 'absolute',
                bottom: 14 + 44 + 6,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: 4,
                maxWidth: 'calc(100% - 20px)',
                zIndex: 10,
                pointerEvents: 'auto'
            }}
        >
            {VIEW_BUTTONS.map(([label, title, command]) => (
                <button
                    key={label}
                    type="button"
                    title={title}
                    aria-label={title}
                    style={{ ...TOOLBAR_BTN, minHeight: 44, minWidth: 44, justifyContent: 'center' }}
                    onClick={() => onCommand(command)}
                >
                    {label}
                </button>
            ))}
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
    lensFov = null,
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
    showChrome = true,
    lowPower = false,
    showHelp = false,
    onCloseHelp,
    onShowHelp,
    playTimelines = false,
    rigMirror = false,
    // A visitor's view of a published room: an object's link opens on click
    // (src/project/viewport/EntityLink.jsx). Never in an editor.
    followLinks = false,
    // A designed look to pose the room by ('' none), overriding the desk's (view C's GO
    // with no desk here). Undefined: follow the desk.
    rigLook = undefined,
    // The smart view (docs/architecture/SMART_VIEW.md): occlusion fade, cutaway from
    // outside, the six view presets, x-ray. Off unless the surface asks:
    //   { bar: 'visitor' | 'studio' | false, constraints: bool, deepLink: bool }
    // It then runs only where the room has a building in it.
    smartView = null,
    // What Nodes made, drawn in this room (StudioGraphNodes.jsx). Null for every
    // caller but the editor, so the published viewer and the rig plot are
    // exactly what they were.
    graphRoom = null,
}) {
    const viewportRef = useRef(null)
    const fovRef = useRef(cameraView?.fov || document.worldState?.savedView?.fov || 50)
    const [pointerOver, setPointerOver] = useState(false)
    const { isPhoneCompact } = useViewportMode()
    const entitiesForView = document.entities
    const hasBuilding = useMemo(() => (
        classifyArchitecture(entitiesForView || []).ids.size > 0
        || (entitiesForView || []).some((e) => e?.type === 'model')
    ), [entitiesForView])
    const smartOn = Boolean(smartView) && !lowPower && hasBuilding
    const studioBar = smartView?.bar === 'studio'
    const cues = document.mappingState?.cues
    const reservedKeys = useMemo(() => (
        studioBar ? new Set((cues || []).map((c) => c?.key).filter(Boolean).map(String)) : null
    ), [studioBar, cues])
    const sv = useSmartViewState({
        enabled: smartOn,
        deepLink: Boolean(smartView?.deepLink),
        keysLive: studioBar ? pointerOver : true,
        reservedKeys
    })
    const { setPresets, release: releaseView } = sv
    const smartViewProps = useMemo(() => (smartOn ? {
        fovRef,
        command: sv.command,
        xray: sv.xray,
        constraints: Boolean(smartView?.constraints),
        lockInside: Boolean(smartView?.lockInside),
        onBuilding: smartView?.onBuilding,
        onLockPaused: smartView?.onLockPaused,
        onPresets: setPresets,
        onUserMove: releaseView
    } : null), [smartOn, sv.command, sv.xray, smartView?.constraints, smartView?.lockInside, smartView?.onBuilding, smartView?.onLockPaused, setPresets, releaseView])
    const [transformStatus, setTransformStatus] = useState(null)
    // What each screen in the room draws, by mapping surface id — filled by
    // LiveScreens (the DOM sources beside the canvas), read by EntityContent.
    const [screens, setScreens] = useState(null)
    const { canvasKey, contextLost, bindContextGuard, restoreContext } = useWebglContextGuard()
    // Low-power mode (space-card previews): render at full rate while the
    // scene boots and assets stream in, then drop to on-demand frames —
    // live-sync document updates re-render through React, which invalidates
    // demand mode, so the thumbnail keeps tracking edits at ~zero idle cost.
    const [settled, setSettled] = useState(false)
    useEffect(() => {
        if (!lowPower) return undefined
        const timer = setTimeout(() => setSettled(true), 8000)
        return () => clearTimeout(timer)
    }, [lowPower])
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
            onPointerEnter={() => setPointerOver(true)}
            onPointerLeave={(event) => {
                setPointerOver(false)
                onCursorLeave?.(event)
            }}
        >
            <Canvas
                key={canvasKey}
                style={{ height: '100%' }}
                onCreated={({ gl }) => bindContextGuard(gl)}
                shadows={document.renderSettings?.shadows !== false ? 'percentage' : false}
                gl={{
                    antialias: document.renderSettings?.antialias !== false,
                    powerPreference: lowPower ? 'low-power' : 'default'
                }}
                dpr={lowPower ? 1 : [document.renderSettings?.dprMin ?? 1, document.renderSettings?.dprMax ?? 2]}
                frameloop={lowPower && settled ? 'demand' : 'always'}
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
                        lensFov={lensFov}
                        onCameraChange={onCameraChange}
                        onRotateStart={onRotateStart}
                        enabled={enableNavigation}
                        fovRef={smartOn ? fovRef : null}
                        selectedEntityIds={selectedEntityIds}
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
                        playTimelines={playTimelines}
                        rigMirror={rigMirror}
                        rigLook={rigLook}
                        screens={screens}
                        followLinks={followLinks}
                        smartView={smartViewProps}
                        graphRoom={graphRoom}
                    />
                </XR>
            </Canvas>

            {/* The sources behind the room's screens. Not in a low-power preview
                card: thirteen cards each running a video would be the cost the
                cards exist to avoid; there a screen draws its dim plate. */}
            {!lowPower && <LiveScreens document={document} onScreens={setScreens} />}

            {contextLost && <WebglContextLostOverlay onRestore={restoreContext} />}

            {setEditMode && (
                <ViewportToolbar
                    editMode={editMode}
                    setEditMode={setEditMode}
                    gizmoMode={gizmoMode}
                    setGizmoMode={setGizmoMode}
                />
            )}

            {setEditMode && controlsRef && (
                <ViewCommandBar
                    onCommand={(command) => runViewCommand(controlsRef.current, command, {
                        entities: document.entities || [],
                        selectedEntities: (document.entities || []).filter((e) => (selectedEntityIds || []).includes(e.id))
                    })}
                />
            )}

            {transformStatus && (
                <div className="studio-transform-hud">{transformStatus.text}</div>
            )}

            {smartOn && smartView?.bar ? (
                <SmartViewBar
                    presets={sv.presets}
                    activeId={sv.activeId}
                    xray={sv.xray}
                    onPreset={sv.choose}
                    onXray={sv.setXray}
                    variant={studioBar ? 'studio' : 'visitor'}
                    compact={isPhoneCompact}
                />
            ) : null}

            {showChrome && <FullscreenButton />}
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
                        borderRadius: 2,
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

            <StudioHelpDialog open={showHelp} onClose={onCloseHelp} />

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
