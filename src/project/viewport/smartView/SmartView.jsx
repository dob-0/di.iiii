import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'
import { fitCameraToAspect } from '../../../utils/cameraFraming.js'
import { venueOf } from '../../../rigbuild/venuePlan.js'
import {
    approach,
    classifyArchitecture,
    computeRoomFrame,
    computeViewPresets,
    cutawayPlan,
    emptyBox,
    enclosingModelIds,
    firstDrawnHit,
    floorMaxPolar,
    fogOffset,
    isBoxEmpty,
    isLampEntity,
    isOccluding,
    isRigEntity,
    meshRole,
    orbitMaxDistance,
    outsideDistance,
    rigCore,
    sanitizeViewPresets,
    sphereCastOffsets,
    targetBoundary,
    unionBox
} from './smartViewGeometry.js'

// THE SMART VIEW, renderer side (inside the <Canvas>). The decisions are the pure
// functions in smartViewGeometry.js; this file only measures the scene and applies them.
// Method and sources: docs/architecture/SMART_VIEW.md.
//
//   occlusion fade   a raycast (three-mesh-bvh, 15 Hz, five rays ≈ a sphere-cast) decides
//                    whether the building stands between the camera and its target; when
//                    it does, the building's fragments inside a circle around the target and
//                    nearer than it are screen-door dithered away (≈ 85 % gone). Discard,
//                    not alpha: nothing is sorted, depth stays true, beams and haze behind
//                    draw exactly as before.
//   cutaway          six clip planes shared by every building material: the roof, the four
//                    walls, and a section plane a preset may bring. Parked far away when off,
//                    so turning one on is a uniform change, never a shader recompile.
//   x-ray            the building's surfaces at 7 % with its edges drawn; the rig untouched.
//   constraints      camera-controls' own maxPolarAngle (floor), maxDistance and
//                    setBoundary (target) — only where the surface asks (a visitor's view).
//
// Only the BUILDING is ever touched: entities that isArchitectureEntity names, or a big
// model that holds the room (enclosingModelIds). Lamps, beams, rig pieces never.

const RAYCAST_HZ = 15
const PARK = 1e5
const XRAY_OPACITY = 0.07
// The fade is a clean cut-out, not a stipple (2026-10-02: a 4x4 Bayer field read as dots on the crane bridge
// once the renderer lost its MSAA): fully gone where the fade strength x inside x nearer passes CUT_AT,
// dithered only across a narrow band of CUT_BAND below it so the rim is not aliased.
const CUT_AT = 0.55
const CUT_BAND = 0.1
const CIRCLE_FRACTION = 0.26

const SV_VERTEX_HEAD = 'varying float vSvDepth;\n'
const SV_FRAGMENT_HEAD = `
varying float vSvDepth;
uniform float uSvStrength;
uniform vec2 uSvCenter;
uniform float uSvRadius;
uniform float uSvDepth;
float svBayer4(vec2 p) {
    ivec2 i = ivec2(mod(floor(p), 4.0));
    int idx = i.x + i.y * 4;
    float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
    return (m[idx] + 0.5) / 16.0;
}
`
export const SV_FRAGMENT_BODY = `
if (uSvStrength > 0.001) {
    float svD = length(gl_FragCoord.xy - uSvCenter);
    float svInside = 1.0 - smoothstep(uSvRadius * 0.7, uSvRadius, svD);
    float svNearer = 1.0 - smoothstep(uSvDepth - 1.2, uSvDepth - 0.4, vSvDepth);
    float svK = uSvStrength * svInside * svNearer;
    if (svK > ${CUT_AT.toFixed(2)}) discard;
    if (svK > ${(CUT_AT - CUT_BAND).toFixed(2)} && svBayer4(gl_FragCoord.xy) < (svK - ${(CUT_AT - CUT_BAND).toFixed(2)}) / ${CUT_BAND.toFixed(2)}) discard;
}
`

function patchMaterial(material, uniforms, planes) {
    if (!material || material.userData.svPatched) return
    material.userData.svPatched = true
    material.userData.svOrig = {
        transparent: material.transparent,
        opacity: material.opacity,
        depthWrite: material.depthWrite,
        clippingPlanes: material.clippingPlanes,
        clipShadows: material.clipShadows,
        onBeforeCompile: material.onBeforeCompile,
        customProgramCacheKey: material.customProgramCacheKey
    }
    material.clippingPlanes = planes
    material.clipShadows = true
    const previous = material.onBeforeCompile
    material.onBeforeCompile = (shader, renderer) => {
        previous?.call(material, shader, renderer)
        Object.assign(shader.uniforms, uniforms)
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${SV_VERTEX_HEAD}`)
            .replace('#include <project_vertex>', '#include <project_vertex>\nvSvDepth = -mvPosition.z;')
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${SV_FRAGMENT_HEAD}`)
            .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${SV_FRAGMENT_BODY}`)
    }
    const previousKey = material.customProgramCacheKey?.bind(material)
    material.customProgramCacheKey = () => `smartview1|${previousKey ? previousKey() : ''}`
    material.needsUpdate = true
}

function setXray(material, on, role = 'wall') {
    const orig = material?.userData?.svOrig
    if (!orig) return
    // The roof is not drawn in x-ray (colour writes off, i.e. hidden): MOXIR's roof is a
    // 41k-triangle space frame, and ghosting it as a transparent surface over the whole
    // screen cost the frame rate (42.8 fps measured at the crane view against 74 without
    // x-ray). X-ray is for checking hanging and aiming, which a roof only covers.
    if (orig.visible === undefined) orig.visible = material.visible
    material.visible = on && role === 'roof' ? false : orig.visible
    const want = on ? { transparent: true, opacity: XRAY_OPACITY * (orig.opacity ?? 1), depthWrite: false } : orig
    if (material.transparent !== want.transparent) material.needsUpdate = true
    material.transparent = want.transparent
    material.opacity = want.opacity
    material.depthWrite = want.depthWrite
}

const EDGE_COLOR = 0x9fb4c8
// Edges are drawn only for meshes up to this many triangles: EdgesGeometry of a dense
// scan or lattice is itself tens of thousands of line segments (a cost, and noise).
const EDGE_MAX_TRIANGLES = 12000
const triangleCount = (geometry) => {
    const n = geometry?.index ? geometry.index.count : geometry?.attributes?.position?.count || 0
    return Math.floor(n / 3)
}

// X-ray on or off for the building: the surfaces ghosted, their edges drawn (made once,
// the first time x-ray is asked for, and kept hidden after).
function applyXray(state, on, planes) {
    for (const mesh of state.walls) {
        for (const material of materialsOf(mesh)) setXray(material, on, mesh.userData.svRole)
        if (on && !state.edges.has(mesh.uuid) && mesh.geometry && mesh.userData.svRole !== 'roof'
            && triangleCount(mesh.geometry) <= EDGE_MAX_TRIANGLES) {
            const lines = new THREE.LineSegments(
                new THREE.EdgesGeometry(mesh.geometry, 28),
                new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: 0.32, depthWrite: false, clippingPlanes: planes })
            )
            lines.userData.svEdge = true
            lines.raycast = () => {}
            mesh.add(lines)
            state.edges.set(mesh.uuid, lines)
        }
    }
    for (const lines of state.edges.values()) lines.visible = on
}

const materialsOf = (mesh) => (Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [])

const worldBox = (object) => {
    const box = new THREE.Box3().setFromObject(object)
    return box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() }
}

/**
 * @param {object}   props.document
 * @param {object}   props.controlsRef   camera-controls
 * @param {object}   props.fovRef        StudioOrbit's lerp target for the lens
 * @param {object}   props.command       { presetId, nonce } — go to a preset when nonce changes
 * @param {boolean}  props.xray
 * @param {boolean}  props.constraints   floor / distance / target limits (a visitor's view)
 * @param {object}   props.fogBase       { near, far } as authored, or null
 * @param {Function} props.onPresets     (presets | []) when the room is measured
 * @param {Function} props.onUserMove    the visitor took the camera (the preset lets go)
 */
export default function SmartView({
    document,
    controlsRef,
    fovRef,
    command,
    xray = false,
    constraints = false,
    fogBase = null,
    onPresets,
    onUserMove
}) {
    const { scene, camera, gl, size } = useThree()
    const entities = useMemo(() => document?.entities || [], [document?.entities])
    const classified = useMemo(() => classifyArchitecture(entities), [entities])
    const entityById = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities])
    const venueOutline = useMemo(() => venueOf(entities).plan?.outline || null, [entities])
    const authored = useMemo(() => sanitizeViewPresets(document?.presentationState?.viewPresets), [document?.presentationState?.viewPresets])
    const openingView = document?.presentationState?.fixedCamera?.position ? document.presentationState.fixedCamera : document?.worldState?.savedView || null
    const opening = openingView?.position || null
    const referenceDistance = useMemo(() => {
        const p = openingView?.position
        const t = openingView?.target
        return Array.isArray(p) && Array.isArray(t) ? Math.hypot(p[0] - t[0], p[1] - t[1], p[2] - t[2]) || 15 : 15
    }, [openingView])
    const walkableAreas = document?.worldState?.walkableAreas || null

    const uniforms = useMemo(() => ({
        uSvStrength: { value: 0 },
        uSvCenter: { value: new THREE.Vector2() },
        uSvRadius: { value: 200 },
        uSvDepth: { value: 10 }
    }), [])
    // roof, x+, x-, z+, z-, section
    const planes = useMemo(() => [
        new THREE.Plane(new THREE.Vector3(0, -1, 0), PARK),
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), PARK),
        new THREE.Plane(new THREE.Vector3(1, 0, 0), PARK),
        new THREE.Plane(new THREE.Vector3(0, 0, -1), PARK),
        new THREE.Plane(new THREE.Vector3(0, 0, 1), PARK),
        new THREE.Plane(new THREE.Vector3(0, 1, 0), PARK)
    ], [])

    const xrayRef = useRef(xray)
    const live = useRef({
        signature: '',
        occluders: [],
        walls: [],
        frame: null,
        presets: [],
        section: null,
        slots: [null, null, null, null, null],
        sectionValue: null,
        strength: 0,
        goal: 0,
        sinceRay: 0,
        sinceScan: 1,
        fogOffset: 0,
        presetDistance: 0,
        // true from the start: the landing view is composed too (no fade until the visitor takes the camera)
        atPreset: true,
        edges: new Map(),
        boundaryKey: ''
    })

    // Clip planes need the renderer's local clipping; give it back as found.
    useEffect(() => {
        const before = gl.localClippingEnabled
        gl.localClippingEnabled = true
        return () => { gl.localClippingEnabled = before }
    }, [gl])

    // Everything this component put on the scene comes off when it goes.
    useEffect(() => {
        const state = live.current
        return () => {
            for (const mesh of state.walls) {
                for (const material of materialsOf(mesh)) {
                    const orig = material.userData?.svOrig
                    if (!orig) continue
                    Object.assign(material, {
                        transparent: orig.transparent,
                        opacity: orig.opacity,
                        depthWrite: orig.depthWrite,
                        visible: orig.visible ?? true,
                        clippingPlanes: orig.clippingPlanes,
                        clipShadows: orig.clipShadows,
                        onBeforeCompile: orig.onBeforeCompile,
                        customProgramCacheKey: orig.customProgramCacheKey
                    })
                    delete material.userData.svPatched
                    delete material.userData.svOrig
                    material.needsUpdate = true
                }
            }
            for (const lines of state.edges.values()) {
                lines.parent?.remove(lines)
                lines.geometry.dispose()
                lines.material.dispose()
            }
            state.edges.clear()
            if (scene.fog && fogBase) {
                scene.fog.near = fogBase.near
                scene.fog.far = fogBase.far
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Measure the room: find the building's meshes, patch them, work out the frame and the
    // presets. Runs on a slow tick (models load late, and a document edit can swap them).
    const measure = () => {
        const state = live.current
        const groups = new Map()
        scene.traverse((object) => {
            const id = object.userData?.svEntityId
            if (id && !groups.has(id)) groups.set(id, object)
        })
        let archIds = classified.ids
        if (!archIds.size) {
            // The bounds fallback: a model that holds most of the room is the room.
            const models = []
            const points = []
            for (const [id, group] of groups) {
                const entity = entityById.get(id)
                if (!entity) continue
                if (entity.type === 'model' && !isRigEntity(entity)) {
                    const box = worldBox(group)
                    if (box) models.push({ id, box })
                } else {
                    points.push(group.getWorldPosition(new THREE.Vector3()).toArray())
                }
            }
            archIds = new Set(enclosingModelIds(models, points))
        }
        const walls = []
        const occluders = []
        let archBox = emptyBox()
        let roofMinY = Infinity
        const meshes = []
        for (const id of archIds) {
            const group = groups.get(id)
            if (!group) continue
            group.updateWorldMatrix(true, true)
            group.traverse((object) => {
                if (!object.isMesh || object.userData.svEdge) return
                meshes.push(object)
            })
        }
        for (const mesh of meshes) {
            const box = worldBox(mesh)
            if (box) archBox = unionBox(archBox, box)
        }
        const floorY = isBoxEmpty(archBox) ? 0 : archBox.min[1]
        for (const mesh of meshes) {
            const box = worldBox(mesh)
            const name = `${mesh.name || ''} ${materialsOf(mesh).map((m) => m.name || '').join(' ')}`
            const role = meshRole(name, box, floorY)
            mesh.userData.svRole = role
            if (role === 'floor') continue
            if (role === 'roof' && box) roofMinY = Math.min(roofMinY, box.min[1])
            walls.push(mesh)
            occluders.push(mesh)
        }
        const signature = walls.map((m) => `${m.uuid}:${materialsOf(m).map((x) => x.uuid).join(',')}`).join('|')
        if (signature === state.signature && state.frame) return
        state.signature = signature
        for (const mesh of walls) {
            for (const material of materialsOf(mesh)) patchMaterial(material, uniforms, planes)
            if (mesh.geometry && !mesh.geometry.boundsTree) {
                try { computeBoundsTree.call(mesh.geometry) } catch { /* no index / tiny: plain raycast */ }
            }
            mesh.raycast = acceleratedRaycast
        }
        state.walls = walls
        state.occluders = occluders
        if (xrayRef.current) applyXray(state, true, planes)

        // The rig: lamps by where they are, pieces (truss, riser) by their bodies, kept to
        // the rig's core (smartViewGeometry.rigCore) so lamps down the hall don't count.
        const lampPoints = []
        const pieceBoxes = []
        let stageBox = emptyBox()
        for (const [id, group] of groups) {
            const entity = entityById.get(id)
            if (!entity || archIds.has(id)) continue
            if (isLampEntity(entity)) {
                lampPoints.push(group.getWorldPosition(new THREE.Vector3()).toArray())
            } else if (isRigEntity(entity)) {
                const box = worldBox(group)
                if (box) pieceBoxes.push(box)
            }
            if (!isLampEntity(entity) && /\b(riser|stage|booth|deck)\b/i.test(String(entity.name || ''))) {
                const box = worldBox(group)
                if (box) stageBox = unionBox(stageBox, box)
            }
        }
        const { lampBox, rigBox } = rigCore(lampPoints, pieceBoxes)
        const frame = computeRoomFrame({
            archBox,
            roofMinY: Number.isFinite(roofMinY) ? roofMinY : null,
            outline: venueOutline,
            rigBox
        })
        state.frame = frame
        state.rigBox = rigBox
        state.lampBox = lampBox
        state.stageBox = isBoxEmpty(stageBox) ? null : stageBox
        publishPresets()
    }

    const publishPresets = () => {
        const state = live.current
        const presets = computeViewPresets(state.frame, {
            rigBox: state.rigBox,
            lampBox: state.lampBox,
            stageBox: state.stageBox,
            opening,
            aspect: size.width / Math.max(1, size.height),
            authored
        })
        state.presets = presets
        onPresets?.(presets)
    }

    // A new window shape reshapes the plan and the side views.
    useEffect(() => {
        if (live.current.frame) publishPresets()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [size.width, size.height, authored])

    // A new document: measure again on the next tick.
    useEffect(() => {
        live.current.signature = ''
        live.current.sinceScan = 1
    }, [entities])

    // Go to a preset.
    useEffect(() => {
        if (!command?.presetId) {
            live.current.section = null
            return
        }
        const state = live.current
        const cc = controlsRef?.current
        const preset = state.presets.find((p) => p.id === command.presetId)
        if (!cc || !preset) return
        const aspect = size.width / Math.max(1, size.height)
        const fitted = preset.interior
            ? fitCameraToAspect({ position: preset.position, target: preset.target, fov: preset.fov }, aspect, { walkableAreas })
            : { position: preset.position, target: preset.target, fov: preset.fov }
        const [px, py, pz] = fitted.position
        const [tx, ty, tz] = fitted.target
        const distance = Math.hypot(px - tx, py - ty, pz - tz)
        state.presetDistance = distance
        if (constraints) cc.maxDistance = Math.max(cc.maxDistance, orbitMaxDistance(state.frame, distance))
        if (camera.isPerspectiveCamera) {
            const needFar = distance + (state.frame?.radius || 0) * 2.2
            if (camera.far < needFar) {
                camera.far = needFar
                camera.updateProjectionMatrix()
            }
        }
        if (fovRef) fovRef.current = fitted.fov || preset.fov || 50
        state.section = preset.section || null
        // A preset is composed on purpose (on Crane the bridge IS the subject): no occlusion fade while the
        // camera sits at it; the fade is back once the visitor takes the camera (controlstart).
        state.atPreset = true
        cc.setLookAt(px, py, pz, tx, ty, tz, true)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [command?.nonce])

    // The visitor takes the camera: the preset (and its section) lets go. Bound from the
    // frame loop, because camera-controls mounts and remounts on its own schedule.
    const onUserMoveRef = useRef(onUserMove)
    useEffect(() => { onUserMoveRef.current = onUserMove }, [onUserMove])
    const bindControls = (cc) => {
        const state = live.current
        if (state.boundControls === cc) return
        if (state.boundControls && state.onControlStart) state.boundControls.removeEventListener('controlstart', state.onControlStart)
        state.boundControls = cc || null
        if (!cc) return
        state.onControlStart = () => {
            live.current.section = null
            live.current.atPreset = false
            onUserMoveRef.current?.()
        }
        cc.addEventListener('controlstart', state.onControlStart)
    }
    useEffect(() => () => bindControls(null), [])

    // X-ray on and off.
    useEffect(() => {
        xrayRef.current = xray
        applyXray(live.current, xray, planes)
    }, [xray, planes])

    const scratch = useMemo(() => ({
        target: new THREE.Vector3(),
        ndc: new THREE.Vector3(),
        dir: new THREE.Vector3(),
        right: new THREE.Vector3(),
        up: new THREE.Vector3(),
        end: new THREE.Vector3(),
        buffer: new THREE.Vector2(),
        view: new THREE.Vector3(),
        raycaster: new THREE.Raycaster(),
        boundary: new THREE.Box3()
    }), [])

    useFrame((_, delta) => {
        const state = live.current
        state.sinceScan += delta
        // Fast while a model may still be loading, slow once measured, and slower still in
        // a room that turns out to hold no building at all.
        if (state.sinceScan > (state.frame ? 2 : state.misses > 20 ? 3 : 0.4)) {
            state.sinceScan = 0
            measure()
            state.misses = state.frame ? 0 : (state.misses || 0) + 1
        }
        const frame = state.frame
        if (!frame) return
        const cc = controlsRef?.current
        bindControls(cc)
        const target = scratch.target
        if (cc?.getTarget) cc.getTarget(target)
        else target.set(...frame.center)
        const cam = camera.position

        // --- the cutaway ------------------------------------------------------------
        const plan = cutawayPlan(cam.toArray(), frame)
        const goals = [plan.roof, plan.xMax, plan.xMin, plan.zMax, plan.zMin]
        const edges = [frame.roofTop + 0.5, frame.bounds.max[0] + 0.5, frame.bounds.min[0] - 0.5, frame.bounds.max[2] + 0.5, frame.bounds.min[2] - 0.5]
        for (let i = 0; i < 5; i += 1) {
            const goal = goals[i]
            if (goal === null) {
                state.slots[i] = null
            } else {
                state.slots[i] = approach(state.slots[i] ?? edges[i], goal, delta, 0.1)
            }
        }
        const s = state.slots
        planes[0].constant = s[0] === null ? PARK : s[0]
        planes[1].constant = s[1] === null ? PARK : s[1]
        planes[2].constant = s[2] === null ? PARK : -s[2]
        planes[3].constant = s[3] === null ? PARK : s[3]
        planes[4].constant = s[4] === null ? PARK : -s[4]
        const section = state.section
        if (section) {
            planes[5].normal.set(...section.normal)
            planes[5].constant = section.constant
        } else {
            planes[5].normal.set(0, 1, 0)
            planes[5].constant = PARK
        }

        // --- the fog stands back (smartViewGeometry.fogOffset) --------------------------
        if (scene.fog && fogBase && Number.isFinite(fogBase.near) && Number.isFinite(fogBase.far)) {
            const goal = fogOffset(outsideDistance(cam.toArray(), frame.bounds), cam.distanceTo(target), referenceDistance)
            state.fogOffset = approach(state.fogOffset, goal, delta, 0.15)
            scene.fog.near = fogBase.near + state.fogOffset
            scene.fog.far = fogBase.far + state.fogOffset
        }

        // --- the occlusion fade ---------------------------------------------------------
        state.sinceRay += delta
        const toTarget = cam.distanceTo(target)
        if (state.sinceRay >= 1 / RAYCAST_HZ) {
            state.sinceRay = 0
            let blocked = false
            if (state.occluders.length && toTarget > 0.5) {
                const rc = scratch.raycaster
                rc.firstHitOnly = false
                scratch.dir.subVectors(target, cam).normalize()
                scratch.right.crossVectors(scratch.dir, camera.up).normalize()
                scratch.up.crossVectors(scratch.right, scratch.dir).normalize()
                const radius = Math.min(1.2, Math.max(0.35, toTarget * 0.03))
                for (const [ox, oy] of sphereCastOffsets(radius)) {
                    scratch.end.copy(target).addScaledVector(scratch.right, ox).addScaledVector(scratch.up, oy)
                    const dir = scratch.end.clone().sub(cam)
                    const length = dir.length()
                    rc.set(cam, dir.normalize())
                    rc.far = length
                    const hits = rc.intersectObjects(state.occluders, false)
                    const hit = firstDrawnHit(hits.map((h) => ({ distance: h.distance, point: h.point.toArray() })), plan, section)
                    if (hit && isOccluding(hit.distance, length)) { blocked = true; break }
                }
            }
            state.goal = blocked && !state.atPreset ? 1 : 0
        }
        state.strength = approach(state.strength, state.goal, delta, state.goal > state.strength ? 0.08 : 0.2)
        uniforms.uSvStrength.value = state.strength < 0.002 ? 0 : state.strength
        if (uniforms.uSvStrength.value > 0) {
            gl.getDrawingBufferSize(scratch.buffer)
            scratch.ndc.copy(target).project(camera)
            uniforms.uSvCenter.value.set((scratch.ndc.x + 1) * 0.5 * scratch.buffer.x, (scratch.ndc.y + 1) * 0.5 * scratch.buffer.y)
            uniforms.uSvRadius.value = CIRCLE_FRACTION * Math.min(scratch.buffer.x, scratch.buffer.y)
            scratch.view.copy(target).applyMatrix4(camera.matrixWorldInverse)
            uniforms.uSvDepth.value = -scratch.view.z
        }

        // --- the camera's limits (a visitor's view) -------------------------------------
        if (constraints && cc) {
            const distance = typeof cc.distance === 'number' ? cc.distance : toTarget
            cc.maxPolarAngle = floorMaxPolar(target.y, distance, frame.floorY, 0.3)
            cc.maxDistance = orbitMaxDistance(frame, state.presetDistance)
            const b = targetBoundary(frame)
            const key = `${b.min.join(',')}|${b.max.join(',')}`
            if (key !== state.boundaryKey && cc.setBoundary) {
                state.boundaryKey = key
                scratch.boundary.min.fromArray(b.min)
                scratch.boundary.max.fromArray(b.max)
                cc.setBoundary(scratch.boundary)
            }
        }
    })

    // Give BVH memory back with the geometry's owner — the model disposes geometry itself;
    // only the bounds tree is ours.
    useEffect(() => () => {
        for (const mesh of live.current.walls) {
            if (mesh.geometry?.boundsTree) {
                try { disposeBoundsTree.call(mesh.geometry) } catch { /* already gone */ }
            }
            mesh.raycast = THREE.Mesh.prototype.raycast
        }
    }, [])

    return null
}
