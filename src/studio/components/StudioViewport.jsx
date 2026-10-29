import { isDeselectingMiss, movableEntities, pickLampBody } from '../utils/selectionTools.js'
import { registerEntityObject } from '../utils/entityObjectRegistry.js'
import { gizmoSnapSteps, useSnapModifier } from '../utils/gizmoSnap.js'
import StudioGraphNodes from './StudioGraphNodes.jsx'
import { runViewCommand } from '../utils/viewCommands.js'
import { Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import Canvas from '../../components/GuardedCanvas.jsx'
import * as THREE from 'three'
import '../styles/studio.css'
import { CameraControls, Grid, Html, TransformControls } from '@react-three/drei'
import RigMirror from './RigMirror.jsx'
import { useLiveLightEntity } from '../../rigMirror/liveLight.js'
import { useRigLookEntities } from '../../rigbuild/useRigLook.js'
import { workLightEntities } from '../../rigbuild/workLight.js'
import { hasRigLamps } from '../../rigbuild/hasRigLamps.js'
import LiveScreens from './LiveScreens.jsx'
import { XR, useXR } from '@react-three/xr'
import ModalTransform from './ModalTransform.jsx'
import ScenePicker from './ScenePicker.jsx'
import ModelLoading from './ModelLoading.jsx'
import LaserTest from './LaserTest.jsx'
import { laserUnitsOf } from '../utils/laserTest.js'
import EntityContent from '../../project/viewport/EntityContent.jsx'
import EntityLink from '../../project/viewport/EntityLink.jsx'
import { EntityLinksContext } from '../../project/viewport/entityLinkContext.js'
import WorldEnvironment from '../../project/viewport/WorldEnvironment.jsx'
import RenderSettingsEffect from '../../project/viewport/RenderSettingsEffect.jsx'
import { ShadowsOnDemand } from '../../project/viewport/RenderSettingsEffect.jsx'
import '../../project/viewport/spotLightSkip.js'
import { bodyBounds } from '../utils/selectionBounds.js'
import { arrivalLightsOf } from '../../project/viewport/worldLights.js'
import ShadowCasting from '../../project/viewport/ShadowCasting.jsx'
import LaserView from '../../rigbuild/LaserView.jsx'
import ShaderWarmup from '../../project/viewport/ShaderWarmup.jsx'
import { resolveShadowCasting } from '../../project/viewport/shadowCasting.js'
import { buildAssetMap } from '../../project/viewport/buildAssetMap.js'
import { createPivotDrag, getSelectionCentroid } from '../utils/multiTransform.js'
import { sameTransform } from '../utils/transformDelta.js'
import { hasTimelineTracks, sampleTimeline, applyTimelinePose } from '../../project/viewport/timelinePlayback.js'
import { defaultWorldState } from '../../shared/projectSchema.js'
import { animationSeed, applyAnimation, authoredAnimation } from '../../project/viewport/entityAnimation.js'
import { applyProximity, resolveProximity } from '../../project/viewport/entityProximity.js'
import {
    advanceTimelinePreview,
    getTimelinePreview,
    isTimelinePreviewPosed,
    setTimelinePreview,
    subscribeTimelinePreview
} from '../utils/timelinePreview.js'
import StudioHelpDialog from './StudioHelpDialog.jsx'
import { controlBindingsFor, getNavigationPreset, mouseButtonsFor } from '../navigation/mappings.js'
import { MOVE_1_CAMERA } from '../navigation/freeMove.js'
import { useNavigationPreference } from '../navigation/preference.js'
import { useCameraNavigation } from '../navigation/useCameraNavigation.js'
import { isPulling, registerPullGizmo, usePullToMove } from '../navigation/pullToMove.js'
import { presetForTool, pullOnFor } from '../navigation/editMouse.js'
import { useWalkNavigation } from '../navigation/useWalkNavigation.js'
import { WebglContextLostOverlay, useWebglContextGuard } from '../../components/WebglContextGuard.jsx'
import SceneEntityErrorBoundary from '../../components/SceneEntityErrorBoundary.jsx'
import SmartViewBar from '../../project/viewport/smartView/SmartViewBar.jsx'
import useSmartViewState from '../../project/viewport/smartView/useSmartViewState.js'
import { classifyArchitecture, parseLayersParam } from '../../project/viewport/smartView/smartViewGeometry.js'
import { resolveViews } from '../../project/viewport/smartView/viewData.js'
import { tourDoors } from '../../project/viewport/autoFly.js'
import BoxSelect from './BoxSelect.jsx'
import { useViewportMode } from '../../hooks/useViewportMode.js'
import { KICK_AFTER_INPUT_MS, RenderDemandProvider, useHoldFrames, useFrameloopMode, useStableDemand } from '../utils/renderDemand.jsx'
import { handlePickClick, pickUserData } from '../utils/pickPriority.js'
import { isPlaying } from '../../project/play/playingFlag.js'

// The lamps' bodies (src/rigbuild/RigBodies.jsx): loaded only by a room that has a rig.
const RigBodies = lazy(() => import('../../rigbuild/RigBodies.jsx'))
// The smart view (docs/architecture/SMART_VIEW.md): loaded only by a room with a building
// in it — a place, or a model big enough to be one — so every other room pays nothing.
const SmartView = lazy(() => import('../../project/viewport/smartView/SmartView.jsx'))

const AR_SCENE_POSITION = [0, 0, -1.2]
const DEFAULT_SCENE_POSITION = [0, 0, 0]
const NO_SCENE_ENTITIES = Object.freeze([])


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
        if (isDraggingRef?.current === true || isPulling(entity.id)) return
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
    const invalidate = useThree((s) => s.invalidate)
    // A scrub or a stop changes the pose with no React render: draw it.
    useEffect(() => subscribeTimelinePreview(() => invalidate()), [invalidate])
    useFrame((frameState, delta) => {
        advanceTimelinePreview(delta)
        if (getTimelinePreview().playing) frameState.invalidate() // playing is continuous
    })
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

// Alt+click on a laser line selects its whole unit (pickPriority.js); provided inside the Canvas, read by the two entity kinds.
const UnitSelectContext = createContext(null)
// False while the Studio's Work light is on: a live desk's colour and level (rigMirror/liveLight.js) must not
// replace the white work light on a lamp with a fixture number (owner 2026-10-16: "still not all work lights works").
const DeskLightContext = createContext(true)

// Edit and Select both transform the selection; Navigate never does.
const canTransform = (editMode) => editMode === 'edit' || editMode === 'select'

function SelectableEntity({ entity, assetMap, screens = null, selected, selectedIdSet = null, isPrimary, editMode, gizmoMode, gizmoAxis = null, gizmoVisible = true, gizmoSpace = 'world', overrideTransform = null, onSelect, onToggleSelect, onTransformCommit, orbitRef }) {
    const groupRef = useRef()
    const tcRef = useRef()
    const highlightRef = useRef(null)
    const isDragging = useRef(false)
    const { scene } = useThree()
    const onSelectUnit = useContext(UnitSelectContext)
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
        // The box is the entity's body (selectionBounds.js), never its beam: a spot light's
        // subtree holds a cone as long as the throw, and BoxHelper took all of it (owner 2026-10-13).
        const helper = new THREE.Box3Helper(bodyBounds(groupRef.current), isPrimary ? 0xffa500 : 0x2ecc71)
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
            bodyBounds(groupRef.current, highlightRef.current.box)
        }
    }, [overrideTransform, entity.components?.transform, selected])

    useFrame(() => {
        if ((isDragging.current || isPulling(entity.id)) && highlightRef.current && groupRef.current) {
            bodyBounds(groupRef.current, highlightRef.current.box)
        }
    })

    // Edit AND Select move the selection (owner 2026-10-13 13:2x: "in Select I can't move there"): the gizmo
    // mounts in both; a box-select starts only where no gizmo handle took the pointer (BoxSelect.jsx).
    const gizmoActive = isPrimary && canTransform(editMode) && gizmoVisible && !isLocked
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
        // World axes by default (Blender's Global orientation); 'local' follows the object's own axes (owner 10-13: 'no way
        // to move an object in the world frame').
        tc.setSpace(gizmoSpace)
        // Edit's pull (View | Edit) leaves a press on a handle to the gizmo (pullToMove.js gizmoHasPointer).
        const unregister = registerPullGizmo(tc)
        return () => { unregister(); tc.detach() }
    }, [gizmoActive, gizmoSpace])

    const storedTransformRef = useRef(entity.components?.transform)
    useEffect(() => { storedTransformRef.current = entity.components?.transform }, [entity.components?.transform])

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
                const next = {
                    position: [position.x, position.y, position.z],
                    rotation: [rotation.x, rotation.y, rotation.z],
                    scale: [scale.x, scale.y, scale.z]
                }
                // A press and release with no motion is not an edit (transformDelta.js).
                if (!sameTransform(storedTransformRef.current, next)) onTransformCommit?.(entity.id, next)
            }
        }
        tc.addEventListener('dragging-changed', handleDraggingChanged)
        return () => tc.removeEventListener('dragging-changed', handleDraggingChanged)
    }, [gizmoActive, entity.id, onTransformCommit, orbitRef])

    const t = entity.components?.transform || {}

    // A lamp with a fixture number draws what the desk says it is emitting, while the
    // desk is here; the authored light otherwise (src/rigMirror/liveLight.js). The
    // document is untouched — only what reaches the renderer changes.
    const deskLight = useContext(DeskLightContext)
    const shown = useLiveLightEntity(entity, { enabled: deskLight })

    if (!isVisible) return null

    return (
        <>
            <group
                ref={groupRef}
                position={t.position || [0, 0, 0]}
                rotation={t.rotation || [0, 0, 0]}
                scale={t.scale || [1, 1, 1]}
                // How the smart view finds an entity's object (SmartView.jsx), and what a click weighs (pickPriority.js).
                userData={pickUserData(entity)}
                // Every hit under the pointer decides (pickPriority.js): a lamp body beats a beam in front of it, a
                // locked entity is picked (the lock stops moves), the one selected object clicked again deselects —
                // the same rule as a group entity's click below.
                onClick={(e) => handlePickClick(e, { onSelect, onToggleSelect, onSelectUnit, selectedIds: selectedIdSet })}
            >
                {/* Live only where the surface turned links on (a visitor's
                    view mode) — see entityLinkContext.js. */}
                <EntityLink entity={entity}>
                    <EntityContent entity={shown} assetMap={assetMap} screens={screens} />
                </EntityLink>
                {selected && isPrimary && (
                    <Html position={[0, 1.8, 0]} center zIndexRange={[900, 0]} style={{ pointerEvents: 'none' }}>
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
                    translationSnap={gizmoSnapSteps(snapping).translation}
                    rotationSnap={gizmoSnapSteps(snapping).rotation}
                    scaleSnap={gizmoSnapSteps(snapping).scale}
                />
            )}
        </>
    )
}

function SceneEntityNode({ entity, childMap, assetMap, screens = null, selectedIdSet, selectedEntityId, editMode, gizmoMode, gizmoAxis, gizmoVisible, gizmoSpace = 'world', overrideById, onSelectEntity, onToggleSelectEntity, onTransformCommit, orbitRef }) {
    const groupTimelineRef = useRef(null)
    const onSelectUnit = useContext(UnitSelectContext)
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
                userData={pickUserData(entity)}
                // Every hit under the pointer decides (pickPriority.js): a lamp body beats a beam in front of it, a beam
                // beats what is behind it; a locked entity is picked (the lock stops moves); the one selected object
                // clicked again deselects.
                onClick={(e) => handlePickClick(e, { onSelect: onSelectEntity, onToggleSelect: onToggleSelectEntity, onSelectUnit, selectedIds: selectedIdSet })}
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
                {selected && entity.id === selectedEntityId && (
                    <Html position={[0, 0.25, 0]} center zIndexRange={[900, 0]} style={{ pointerEvents: 'none' }}>
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
                        gizmoSpace={gizmoSpace}
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
            selectedIdSet={selectedIdSet}
            isPrimary={entity.id === selectedEntityId}
            editMode={editMode}
            gizmoMode={gizmoMode}
            gizmoAxis={gizmoAxis}
            gizmoVisible={gizmoVisible}
            gizmoSpace={gizmoSpace}
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
    const isDraggingRef = useRef(false)
    const centroid = useMemo(() => getSelectionCentroid(entities), [entities])
    const active = canTransform(editMode) && gizmoVisible && entities.length > 1
    const snapping = useSnapModifier()

    useEffect(() => {
        const pivot = pivotRef.current
        if (!pivot || isDraggingRef.current) return
        pivot.position.set(...centroid)
        pivot.rotation.set(0, 0, 0)
        pivot.scale.set(1, 1, 1)
    }, [centroid])

    // Read at the grab, so a document change never re-attaches the gizmo or reaches a commit.
    const entitiesRef = useRef(entities)
    useEffect(() => { entitiesRef.current = entities }, [entities])

    useEffect(() => {
        const controls = controlsRef.current
        const pivot = pivotRef.current
        if (!controls || !pivot || !active) return
        const orbitControls = orbitRef?.current
        controls.attach(pivot)
        controls.setSpace('world')

        const drag = createPivotDrag({
            readPivot: () => ({
                position: pivot.position.toArray(),
                rotation: [pivot.rotation.x, pivot.rotation.y, pivot.rotation.z],
                scale: pivot.scale.toArray()
            }),
            getEntities: () => entitiesRef.current,
            onPreview,
            onCommit
        })
        const handleDraggingChanged = (event) => {
            const dragging = Boolean(event.value)
            isDraggingRef.current = dragging
            if (orbitControls) orbitControls.enabled = !dragging
            drag.draggingChanged(dragging)
            // The pivot rests at identity between grabs; a rotation left on it made every next
            // grab's delta R·R⁻¹ — float noise the release then wrote back (scale 0.9999…).
            if (!dragging) {
                pivot.rotation.set(0, 0, 0)
                pivot.scale.set(1, 1, 1)
            }
        }
        const handleObjectChange = () => drag.objectChange()
        controls.addEventListener('dragging-changed', handleDraggingChanged)
        controls.addEventListener('objectChange', handleObjectChange)
        return () => {
            controls.removeEventListener('dragging-changed', handleDraggingChanged)
            controls.removeEventListener('objectChange', handleObjectChange)
            controls.detach()
            if (orbitControls) orbitControls.enabled = true
        }
    }, [active, onCommit, onPreview, orbitRef])

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
                    translationSnap={gizmoSnapSteps(snapping).translation}
                    rotationSnap={gizmoSnapSteps(snapping).rotation}
                    scaleSnap={gizmoSnapSteps(snapping).scale}
                />
            )}
        </>
    )
}

function StudioOrbit({ controlsRef, cameraView, onCameraChange, onRotateStart, enabled = true, fovRef = null, selectedEntityIds = null, editMode = 'navigate', entities = null, onPullCommit = null }) {
    const isXrPresenting = useXR((state) => state.session != null)
    useHoldFrames(isXrPresenting, 'xr') // a headset session is the headset's own loop
    const scene = useThree((state) => state.scene)
    const getScene = useCallback(() => scene, [scene])

    // Mouse navigation preset (Shift+? > Shortcuts). 'studio' is the default and
    // the bindings Studio always had; see src/studio/navigation/mappings.js.
    const navigation = useNavigationPreference()
    // The Edit mouse (editMouse.js, Scene -> Move): with Pull to move (default) the camera is Move 1 in View AND in Edit (owner
    // 2026-10-28, View | Edit: "a pull on empty space still turns the view") and Edit adds the pull on the selected thing; with
    // Like Blender, Edit is exactly 2026-10-12's "edit like blender" map ('blender'), no pull. View is always 'studio'.
    const preset = getNavigationPreset(presetForTool(editMode, navigation.editMouse))
    const pullOn = pullOnFor(editMode, navigation.editMouse)
    // Blender turns 0.4° per pixel (its Orbit Sensitivity default, the owner's value); camera-controls turns 360° per
    // viewport height, so the speed is scaled by the height to keep Blender's per-pixel feel in Edit.
    const viewportHeight = useThree((state) => state.size.height)
    const rotateSpeed = preset.id === 'blender' && viewportHeight > 0 ? viewportHeight / 900 : MOVE_1_CAMERA.rotateSpeed
    const isOrtho = (cameraView?.fov ?? 50) < 20
    // Blender's Walk (Shift+`): the camera is free of any orbit point while walking; frames are held while it lasts.
    const [walking, setWalking] = useState(false)
    useHoldFrames(walking, 'walk')
    useWalkNavigation({ controlsRef, active: enabled && !isXrPresenting, onWalkingChange: setWalking, onCameraChange })
    // Edit mode (View | Edit): a pull on the selected thing moves it; only where the Studio can write (onPullCommit) and only in
    // Edit (pullToMove.js PULL_TOOLS). In View every pull is Move 1's.
    const pull = usePullToMove({
        controlsRef,
        entities,
        selectedEntityIds,
        onCommit: onPullCommit,
        enabled: enabled && !isXrPresenting && !walking && pullOn,
    })
    useCameraNavigation({
        controlsRef,
        presetId: preset.id,
        ortho: isOrtho,
        orbitSelection: navigation.orbitSelection,
        selectedEntityIds,
        getScene,
        speed: navigation.speed,
        turn: navigation.turn,
        active: enabled && !isXrPresenting,
        mode: editMode,
        pull: pullOn ? pull : null,
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
    }, [cameraView?.fov, targetFovRef])

    // Writable copies for camera-controls, made once per preset (navigation/
    // mappings.js controlBindingsFor): it keeps the object it is given, and
    // this file and useCameraNavigation write into it.
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
    useFrame((frameState) => {
        const cc = controlsRef.current
        if (!cc) return
        const cam = cc._camera
        if (!cam?.isPerspectiveCamera) return
        const target = targetFovRef.current
        if (Math.abs(cam.fov - target) < 0.05) return
        cam.fov += (target - cam.fov) * 0.08
        cam.updateProjectionMatrix()
        frameState.invalidate() // on-demand loop: until the lens has arrived
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
            azimuthRotateSpeed={rotateSpeed}
            polarRotateSpeed={rotateSpeed}
            // Zoom never stops: at minDistance the wheel carries the target forward with the
            // camera instead of doing nothing (a room's Inside lock holds the camera ≥ 2 m from
            // its target, and the zoom used to die there). The target stays in its boundary.
            infinityDolly
            smoothTime={preset.smoothTime}
            draggingSmoothTime={preset.draggingSmoothTime}
            // The standard move (useCameraNavigation): no distance range bends a move; the public viewer's Inside lock sets its own.
            minDistance={MOVE_1_CAMERA.minDistance}
            maxDistance={MOVE_1_CAMERA.maxDistance}
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
    onSelectEntities = null,
    editMode,
    gizmoMode,
    gizmoAxis = null,
    gizmoVisible = true,
    gizmoSpace = 'world',
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
    laserTest = false,
    lookDrawn = false,
    smartView = null,
    graphRoom = null
}) {
    // Alt+click on a laser line: every line of its unit (the locked ones stay out), added to the selection with Shift.
    const onSelectUnit = useMemo(() => (onSelectEntities ? (unitKey, { additive = false } = {}) => {
        const locked = new Set((document.entities || []).filter((e) => e.components?.runtime?.locked === true).map((e) => e.id))
        const ids = (laserUnitsOf(document.entities).get(unitKey) || []).filter((id) => !locked.has(id))
        onSelectEntities(additive ? [...new Set([...selectedEntityIds, ...ids])] : ids)
    } : null), [document.entities, onSelectEntities, selectedEntityIds])
    const isArMode = useXR((state) => state.mode === 'immersive-ar')
    // Keyed on assets + project id so the map only rebuilds when assets change,
    // not on every document identity change from a sync tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const assetMap = useMemo(() => buildAssetMap(document), [document.assets, document.projectMeta?.id])
    // A room with designed looks draws its lamps posed by the look the desk is playing
    // (src/rigbuild/useRigLook.js — a view, the document is untouched); any other room
    // is exactly its document. A room handed here ALREADY drawn in its look (`lookDrawn`:
    // the public page, where RoomLookFollower posed, faded, desk-drove and pooled it) is
    // drawn as handed: posed a second time, every look level was drawn squared (MOXIR
    // 2026-10-09, docs/ai/known-fixes.md; src/rigbuild/lookLevel.test.jsx).
    const look = useRigLookEntities(lookDrawn ? null : document, { explicit: rigLook })
    // "Work light" in the Scenes panel ('' = no scene): every lamp white at its own strength (src/rigbuild/workLight.js).
    const workLit = useMemo(() => (rigLook === '' && !lookDrawn ? workLightEntities(look.entities) : look.entities), [rigLook, lookDrawn, look.entities])
    const sceneEntities = lookDrawn ? (document.entities || NO_SCENE_ENTITIES) : workLit
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
    const pickLamp = onSelectEntity ? (id, e) => pickLampBody(sceneEntities, id, e, { onSelect: onSelectEntity, onToggle: onToggleSelectEntity }) : undefined
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
    // What the modal transform may move: a locked or hidden object never moves, even when it was
    // selected before it was locked or hidden.
    const modalEntities = useMemo(
        () => movableEntities(selectedEntities),
        [selectedEntities]
    )
    // An op with nothing to move is cancelled HERE, not left for a modal that never mounts:
    // transformOp set with no ModalTransform meant every editor shortcut dead and the gizmo
    // gone until a reload (N581, 2026-10-15 — the editor refuses to arm such an op too; this
    // covers a selection that empties or locks while the op is set).
    useEffect(() => {
        if (transformOp && !modalEntities.length) onTransformCancel?.()
    }, [transformOp, modalEntities.length, onTransformCancel])

    // Same fog semantics as LiveProjectScene: colour falls back to the
    // background, `enabled: false` switches it off.
    const fog = document.worldState?.fog
    const arrivalLights = arrivalLightsOf(document.worldState)
    // Shadows from the room: off unless this space asked for them. The arrival
    // frame and walk mode read the same switch (shadowCasting.js).
    const shadowCasting = resolveShadowCasting(document.renderSettings)
    const fogAuthored = Boolean(fog) && fog.enabled !== false
    const fogColor = fog?.color || document.worldState?.backgroundColor || defaultWorldState.backgroundColor
    const fogNear = fog?.near ?? 8
    const fogFar = fog?.far ?? 50

    return (
        <LiveTimelineContext.Provider value={playTimelines}>
        <EntityLinksContext.Provider value={followLinks}>
        <UnitSelectContext.Provider value={onSelectUnit}>
        <DeskLightContext.Provider value={!(rigLook === '' && !lookDrawn)}>
            <LaserTest active={laserTest} entities={document.entities} />
            <RenderSettingsEffect renderSettings={document.renderSettings} />
            <ShadowsOnDemand live={Boolean(transformOp)} changeKey={document} />
            {/* MOXIR's LaserCubes: what the laser server is drawing, as beams (rigbuild/laserView.js) */}
            <LaserView entities={document.entities} />
            <ShaderWarmup />
            <ShadowCasting enabled={shadowCasting.enabled} mapSize={shadowCasting.mapSize} />
            <color attach="background" args={[document.worldState?.backgroundColor || defaultWorldState.backgroundColor]} />
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
                                gizmoSpace={gizmoSpace}
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
                                gizmoSpace={gizmoSpace}
                                orbitRef={controlsRef}
                            />
                        </Suspense>
                    ) : null}
                    {/* Its own boundary: the lazy chunk (and its models) suspending here
                        must never hide or remount every root entity and the gizmo with it
                        — the whole room blanked while the lamps' bodies loaded. */}
                    {hasRig && !insideGeo ? (
                        <Suspense fallback={null}>
                            <RigBodies entities={sceneEntities} onPick={pickLamp} />
                        </Suspense>
                    ) : null}
                    <MultiSelectionGizmo
                        entities={transformableSelectedEntities}
                        editMode={editMode}
                        gizmoMode={gizmoMode}
                        gizmoAxis={gizmoAxis}
                        gizmoVisible={gizmoVisibleEffective}
                        gizmoSpace={gizmoSpace}
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
                        layers={smartView.layers}
                        fogBase={fogAuthored ? { near: fogNear, far: fogFar } : null}
                        onPresets={smartView.onPresets}
                        onUserMove={smartView.onUserMove}
                        fly={smartView.fly}
                        onFlyEnd={smartView.onFlyEnd}
                    />
                </Suspense>
            ) : null}
            {transformOp && modalEntities.length > 0 && (
                <ModalTransform
                    op={transformOp}
                    // A locked or hidden object never moves, even when it was selected before it was locked or hidden.
                    selectedEntities={modalEntities}
                    controlsRef={controlsRef}
                    onPreview={setPreviewById}
                    onCommit={handleModalCommit}
                    onCancel={handleModalCancel}
                    onStatus={onTransformStatus}
                />
            )}
        </DeskLightContext.Provider>
        </UnitSelectContext.Provider>
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
    background: 'rgba(var(--di-surface-2-rgb),0.82)',
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
                background: 'rgba(var(--di-surface-2-rgb),0.55)',
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
                e.currentTarget.style.background = 'rgba(var(--di-surface-2-rgb),0.82)'
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(255,255,255,0.55)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                e.currentTarget.style.background = 'rgba(var(--di-surface-2-rgb),0.55)'
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
    background: 'rgba(var(--di-cyan-rgb),0.28)',
    borderColor: 'var(--di-cyan)',
    color: 'var(--di-cyan)',
    boxShadow: '0 0 8px rgba(var(--di-cyan-rgb),0.35)'
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
    onCameraChange,
    onRotateStart,
    controlsRef,
    xrStore,
    editMode = 'navigate',
    boxSelect = false,
    onSelectEntities,
    gizmoMode = 'translate',
    gizmoAxis = null,
    gizmoVisible = true,
    gizmoSpace = 'world',
    transformOp = null,
    setEditMode,
    viewBar = false,
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
    onRigLook = null,
    // The scene editor (ScenePicker): ops through the Studio's history, and the desk's GO on a scene.
    onSceneOps = null,
    onPlayScene = null,
    // The Studio's laser test (a work tool, nothing written to the document): every laser unit's field as a square.
    laserTest = false,
    onLaserTest = null,
    // The document's entities are the room ALREADY drawn in its look (the public page:
    // RoomLookFollower drew them): draw them as handed, never pose them again.
    lookDrawn = false,
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
    // A room without a building but with doors still flies (the tour, autoFly.js): the smart view comes on for the
    // flight and stays mounted after it, so it can hand the camera back where the flight left it.
    const hasDoors = useMemo(() => tourDoors(entitiesForView || []).length >= 2, [entitiesForView])
    const [flownOnce, setFlownOnce] = useState(false)
    const flyRequested = typeof smartView?.onFlyChange === 'function' && Boolean(smartView?.flyOn)
    useEffect(() => { if (flyRequested) setFlownOnce(true) }, [flyRequested])
    const smartOn = Boolean(smartView) && !lowPower && (hasBuilding || (hasDoors && (flyRequested || flownOnce)))
    const studioBar = smartView?.bar === 'studio'
    const cues = document.mappingState?.cues
    const reservedKeys = useMemo(() => (
        studioBar ? new Set((cues || []).map((c) => c?.key).filter(Boolean).map(String)) : null
    ), [studioBar, cues])
    // The project's own view list (viewData.js): the Studio bar has every view it keeps, marked live or work;
    // anywhere else (the visitor's page, the Studio's preview of it) only the live ones.
    const viewList = document.presentationState?.viewPresets
    const selectViews = useCallback((presets) => resolveViews(presets, viewList, studioBar ? 'studio' : 'visitor'), [viewList, studioBar])
    const sv = useSmartViewState({
        enabled: smartOn,
        deepLink: Boolean(smartView?.deepLink),
        keysLive: studioBar ? pointerOver : true,
        reservedKeys,
        select: selectViews
    })
    const { setPresets, release: releaseView } = sv
    // Auto fly: the room page's own button (PublicProjectViewer) controls it through smartView.onFlyChange; the Studio's bar does it here.
    const hostFly = typeof smartView?.onFlyChange === 'function'
    const flying = hostFly ? Boolean(smartView.flyOn) : sv.flying
    const setFlying = hostFly ? smartView.onFlyChange : sv.setFlying
    // The building switches of the Studio bar (Roof · Walls · Machines · Outside): null = everything shown; a host that
    // passes its own `smartView.layers` (the visitor page) keeps them.
    // The layer switches open from the address when it names them (?layers=, as the visitor's room reads it; 2026-10-15:
    // ?layers=roof,walls,machines,outside = the whole building, Cut off), else null = every switch on.
    const [studioLayers, setStudioLayers] = useState(() => (typeof window !== 'undefined' && /[?&]layers=/.test(window.location.search)) ? parseLayersParam(window.location.search) : null)
    const setStudioLayer = useCallback((id, shown) => setStudioLayers((prev) => ({ ...(prev || {}), [id]: shown })), [])
    const smartViewProps = useMemo(() => (smartOn ? {
        fovRef,
        command: sv.command,
        xray: sv.xray,
        constraints: Boolean(smartView?.constraints),
        lockInside: Boolean(smartView?.lockInside),
        onBuilding: smartView?.onBuilding,
        onLockPaused: smartView?.onLockPaused,
        layers: smartView?.layers || studioLayers,
        onPresets: setPresets,
        onUserMove: releaseView,
        fly: flying,
        onFlyEnd: () => setFlying(false)
    } : null), [smartOn, sv.command, sv.xray, flying, setFlying, smartView?.constraints, smartView?.lockInside, smartView?.onBuilding, smartView?.onLockPaused, smartView?.layers, studioLayers, setPresets, releaseView])
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

    // Render on demand (src/studio/utils/renderDemand.jsx): the loop draws frames only while
    // something is declared moving or for a short burst after an input or an edit. A published
    // viewer (playTimelines) and a card still booting keep the continuous loop they always had.
    const demand = useStableDemand()
    useEffect(() => {
        if (!playTimelines && !(lowPower && !settled)) return undefined
        return demand.hold(playTimelines ? 'published-viewer' : 'card-boot')
    }, [demand, playTimelines, lowPower, settled])
    const screenCount = screens?.size || 0
    useEffect(() => (screenCount > 0 ? demand.hold('live-screens') : undefined), [demand, screenCount])
    // Edits (the owner's, a collaborator's, a `di follow` carry), selection, tool and view changes:
    // one burst. Cards never see input and keep the one-frame-per-change behaviour.
    useEffect(() => {
        if (!lowPower) demand.kick()
    }, [demand, lowPower, document, selectedEntityId, selectedEntityIds, editMode, gizmoMode, gizmoAxis, gizmoVisible, transformOp, cameraView, enableNavigation, smartOn])
    // The window: resize, a tab coming back, any key (shortcuts move things).
    useEffect(() => {
        if (lowPower) return undefined
        const kick = () => demand.kick()
        const keyKick = () => { if (!isPlaying()) demand.kick() }
        const visible = () => { if (!window.document.hidden) kick() }
        // The pointer arriving over the view: frames start before the first drag, so the GPU clock is up when it begins
        // (measured 2026-10-12: after ~4 s idle the clock sat at 225 MHz and the first frames of a drag took 52–144 ms;
        // 300 ms of frames bring it back to 1680 MHz — docs/ai/research/render-smoothness-audit-2026-10-12.md).
        const over = (e) => { if (e.target?.tagName === 'CANVAS') kick() }
        window.addEventListener('resize', kick)
        window.addEventListener('keydown', keyKick, true)
        window.addEventListener('keyup', keyKick, true)
        window.addEventListener('pointerover', over, true)
        window.document.addEventListener('visibilitychange', visible)
        return () => {
            window.removeEventListener('resize', kick)
            window.removeEventListener('pointerover', over, true)
            window.removeEventListener('keydown', keyKick, true)
            window.removeEventListener('keyup', keyKick, true)
            window.document.removeEventListener('visibilitychange', visible)
        }
    }, [demand, lowPower])
    const frameloop = useFrameloopMode(demand, lowPower ? settled : true)
    const kickInput = lowPower ? undefined : () => demand.kick(KICK_AFTER_INPUT_MS)
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
            onPointerMove={(event) => { kickInput?.(); handlePointerMove(event) }}
            onPointerDownCapture={kickInput}
            onPointerUpCapture={kickInput}
            onWheelCapture={kickInput}
            onTouchStartCapture={kickInput}
            onTouchMoveCapture={kickInput}
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
                frameloop={frameloop}
                camera={{
                    position: camera.position || [0, 2.4, 6.5],
                    fov: camera.fov || 50,
                    zoom: camera.zoom || 1,
                    near: camera.near || 0.1,
                    far: camera.far || 1000,
                    orthographic: camera.projection === 'orthographic'
                }}
                // A primary click or a tap on nothing deselects. R3F also reports the
                // contextmenu event as a miss, and Linux fires that on the right button's
                // PRESS: every right-drag pan dropped the selection (N581, 2026-10-15).
                onPointerMissed={(event) => { if (isDeselectingMiss(event)) onSelectEntity?.(null) }}
            >
                <XR store={xrStore}>
                    <RenderDemandProvider demand={demand}>
                    <StudioOrbit
                        controlsRef={controlsRef}
                        cameraView={camera}
                        onCameraChange={onCameraChange}
                        onRotateStart={onRotateStart}
                        enabled={enableNavigation}
                        fovRef={smartOn ? fovRef : null}
                        selectedEntityIds={selectedEntityIds}
                        editMode={editMode}
                        entities={document.entities}
                        onPullCommit={!followLinks && !lookDrawn && !transformOp ? (onTransformCommit || null) : null}
                    />
                    {onSelectEntities && !lowPower ? (
                        <BoxSelect
                            active={boxSelect}
                            entities={document.entities}
                            selectedEntityIds={selectedEntityIds}
                            onSelectEntities={onSelectEntities}
                            controlsRef={controlsRef}
                        />
                    ) : null}
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
                        gizmoSpace={gizmoSpace}
                        transformOp={transformOp}
                        onTransformCommit={onTransformCommit}
                        onTransformCommitMany={onTransformCommitMany}
                        onTransformCancel={onTransformCancel}
                        onTransformStatus={setTransformStatus}
                        controlsRef={controlsRef}
                        playTimelines={playTimelines}
                        rigMirror={rigMirror}
                        rigLook={rigLook}
                        laserTest={laserTest}
                        onSelectEntities={onSelectEntities}
                        lookDrawn={lookDrawn}
                        screens={screens}
                        followLinks={followLinks}
                        smartView={smartViewProps}
                        graphRoom={graphRoom}
                    />
                    </RenderDemandProvider>
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

            {/* Mounted only where a surface asks for it (`viewBar`). Its gate used to be setEditMode,
                which no caller passes — so the bar was dead everywhere, the Studio included, while it
                looked wired (brief 2026-10-13 item 2). */}
            {viewBar && controlsRef && (
                <ViewCommandBar
                    onCommand={(command) => runViewCommand(controlsRef.current, command, {
                        entities: document.entities || [],
                        selectedEntities: (document.entities || []).filter((e) => (selectedEntityIds || []).includes(e.id))
                    })}
                />
            )}

            <ModelLoading />
            {onRigLook && (
                <ScenePicker document={document} current={rigLook} onPick={onRigLook} laserTest={laserTest} onLaserTest={onLaserTest} onApplyOps={onSceneOps} onPlay={onPlayScene} />
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
                    layers={studioBar ? (smartView?.layers || studioLayers) : null}
                    onLayer={studioBar && !smartView?.layers ? setStudioLayer : null}
                    flying={flying}
                    onFly={studioBar ? setFlying : null}
                />
            ) : null}
            {smartOn && flying ? (
                <div role="status" data-autofly-hint style={{ position: 'absolute', left: '50%', bottom: '1.2rem', transform: 'translateX(-50%)', zIndex: 20, padding: '0.5rem 0.9rem', borderRadius: 2, background: 'rgba(5,7,10,0.7)', border: '1px solid var(--di-cyan-border, rgba(77,249,255,0.3))', color: 'var(--di-text, #fff)', font: '12px/1.2 var(--di-font-mono, monospace)', letterSpacing: '0.04em', pointerEvents: 'none' }}>
                    flying · tap to take the controls
                </div>
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
                        background: 'rgba(var(--di-surface-2-rgb),0.55)',
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
                        e.currentTarget.style.color = 'var(--di-cyan)'
                        e.currentTarget.style.borderColor = 'rgba(var(--di-cyan-rgb),0.4)'
                        e.currentTarget.style.background = 'rgba(var(--di-surface-2-rgb),0.82)'
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'rgba(255,255,255,0.55)'
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                        e.currentTarget.style.background = 'rgba(var(--di-surface-2-rgb),0.55)'
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
