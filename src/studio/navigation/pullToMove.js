// PULL TO MOVE, the Studio's Edit mode (View | Edit, owner 2026-10-28: "it can be the edit mode and view mode"). In the UX audit of
// 2026-10-28 (finding F030) the child and the senior both pulled the box they had just added, the view turned instead and the box
// left the screen. In Edit a left drag (one finger on touch) that starts ON the selected thing moves it along the floor; every other
// drag is Move 1's, unchanged (useCameraNavigation.js). In View every drag is Move 1's: nothing moves by accident.
//
// The method is the ground-plane drag of three.js DragControls and of every scene editor's "move on the floor": cast the pointer's ray
// onto a horizontal plane through the point you grabbed, and move the thing by how far that hit has gone, so the grabbed point stays
// under the pointer and the height never changes (three.js examples/jsm/controls/DragControls.js; Ray.intersectPlane).
//   - Only the ONE selected thing moves, picked by the Studio's own click rule (pickPriority.js pickFromHits), never a thing in front.
//   - Never a locked thing, a hidden one or the place's own geometry (isPlaceGeometry: walls, floor, the imported hall, its steel
//     and its rig), nor anything inside one of those.
//   - A gizmo handle under the pointer is the gizmo's; Alt, Shift, Ctrl or Meta, any button but the left, a second finger: the camera.
//   - The release is ONE edit (the Studio's onTransformCommit: one op, one undo step); a pull under 3 px is a click, not an edit.
import { useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import { entityInfoOf, pickFromHits } from '../utils/pickPriority.js'
import { getEntityObject } from '../utils/entityObjectRegistry.js'
import { isArchitectureEntity } from '../../project/viewport/smartView/smartViewGeometry.js'
import { isSteelEntity } from '../../objectComponents/steelOccluder.js'
import { clientToNdc } from './autoDepth.js'

// R3F treats a press and release within 2 px as a click (pickPriority.js handlePickClick: e.delta > 2 is a drag), so a pull starts
// past that: the thing never moves under a click.
export const PULL_START_PX = 3
// The Studio tool a pull works in: Edit only (owner 2026-10-28, View | Edit). In View (Navigate) every pull turns the view, so
// nothing moves by accident; Walk and Fly keep the pointer for looking.
export const PULL_TOOLS = Object.freeze(['edit'])
// True when a press may start a pull in this Studio tool (StudioShell viewportEditMode). Pure.
export const pullPressAllowed = (mode) => PULL_TOOLS.includes(mode)

// True when this press belongs to the camera whatever is under it (Move 1's path). Pure.
export function pullGoesToCamera(event) {
    if (!event) return true
    if (event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return true
    if (event.pointerType === 'touch') return event.isPrimary === false
    return event.button !== 0
}

// The place's own things, which a pull never moves (the gizmo still can): its building (walls, floor, the imported hall: isArchitecture-
// Entity), its steel (truss, crane bridge: isSteelEntity) and its rig (a fixture, a rig piece, a beam). A light added from Create
// (components.light only) is the person's own thing and moves. Pure.
export function isPlaceGeometry(entity) {
    const c = entity?.components || {}
    return isArchitectureEntity(entity) || isSteelEntity(entity) || Boolean(c.fixture || c.piece || c.beam)
}

// The entity and every group it sits in: none locked, none hidden, none the place's own geometry. Pure.
export function movableForPull(entity, byId = new Map()) {
    let e = entity, depth = 0
    while (e && depth < 32) {
        const runtime = e.components?.runtime || {}
        if (runtime.locked === true || runtime.visible === false || isPlaceGeometry(e)) return false
        e = e.parentId ? byId.get(e.parentId) : null
        depth += 1
    }
    return Boolean(entity)
}

// The id a pull moves, or null: the picked thing is the one selected thing and it may move. Pure.
export function pullTargetId({ pickedId, selectedIds = [], entities = [] }) {
    if (!pickedId || selectedIds?.length !== 1 || selectedIds[0] !== pickedId) return null
    const byId = new Map((entities || []).map((e) => [e.id, e]))
    const entity = byId.get(pickedId)
    return entity && movableForPull(entity, byId) ? pickedId : null
}

// Where `ray` meets the horizontal plane at `height`, or null (parallel, behind, or farther than `maxDistance`). Pure.
const floorPlane = new Plane(new Vector3(0, 1, 0), 0)
export function planeHit(ray, height, out = new Vector3(), maxDistance = Infinity) {
    floorPlane.constant = -height
    const hit = ray.intersectPlane(floorPlane, out)
    if (!hit || hit.distanceTo(ray.origin) > maxDistance) return null
    return hit
}

// A ray that grazes the floor plane (the eye at the grabbed point's height) meets it far away or nowhere: the floor drag would throw
// the thing to the horizon. Below this slope (about 6 degrees) the pull uses the upright plane facing the camera through the grabbed
// point instead (DragControls' own camera-facing plane), and keeps only its sideways part, so the height still never changes.
export const GRAZING_SLOPE = 0.1
// The farthest a floor hit may be, in grab distances: past it the move of that frame is skipped.
export const MAX_PULL_REACH = 20
const facingPlane = new Plane()
export function facingHit(ray, through, out = new Vector3()) {
    const n = new Vector3(ray.direction.x, 0, ray.direction.z)
    if (n.lengthSq() < 1e-12) return null
    facingPlane.setFromNormalAndCoplanarPoint(n.normalize(), through)
    return ray.intersectPlane(facingPlane, out)
}

// The gizmos on screen (SelectableEntity registers its TransformControls while it is attached). A handle under the pointer wins:
// TransformControls' own pointerdown runs pointerHover then pointerDown, and pointerHover is what it would read, so it is asked here.
const gizmos = new Set()
export function registerPullGizmo(tc) {
    if (!tc) return () => {}
    gizmos.add(tc)
    return () => { gizmos.delete(tc) }
}
export function gizmoHasPointer(ndc) {
    for (const tc of gizmos) {
        if (!tc?.enabled || !tc.object) continue
        if (tc.dragging) return true
        try { tc.pointerHover({ x: ndc[0], y: ndc[1], button: 0 }) } catch { continue }
        if (tc.axis) return true
    }
    return false
}

// Which entity a pull is moving right now (the pose and the selection box read it, as they read a gizmo drag).
let pullingId = null
export const isPulling = (entityId) => pullingId != null && pullingId === entityId
export const pullInProgress = () => pullingId != null

// The pull itself. `getLive()` gives { enabled, entities, selectedIds, onCommit } at press time. Returns { begin, cancel }:
// begin(event, { onEnd }) takes the press when it is a pull (true) and then owns the drag until release; false leaves it to Move 1.
export function createPull({ element, getCamera, getScene, getLive, getObject = getEntityObject, invalidate = () => {} }) {
    const raycaster = new Raycaster(), ndcV = new Vector2()
    const hit = new Vector3(), world = new Vector3()
    let active = null
    const doc = element?.ownerDocument

    const rayAt = (clientX, clientY) => {
        const ndc = clientToNdc(clientX, clientY, element.getBoundingClientRect())
        const camera = getCamera?.()
        if (!ndc || !camera) return null
        camera.updateMatrixWorld()
        raycaster.setFromCamera(ndcV.set(ndc[0], ndc[1]), camera)
        return { ndc, camera }
    }

    const place = (object, worldPos) => {
        const local = worldPos.clone()
        if (object.parent) { object.parent.updateWorldMatrix(true, false); object.parent.worldToLocal(local) }
        object.position.copy(local)
        object.updateMatrixWorld(true)
        invalidate()
    }

    const finish = (commit) => {
        const a = active
        if (!a) return
        active = null
        pullingId = null
        doc?.removeEventListener('pointermove', onMove, true)
        doc?.removeEventListener('pointerup', onUp, true)
        doc?.removeEventListener('pointercancel', onCancel, true)
        window.removeEventListener('blur', onCancel)
        if (a.moved && commit) {
            const { position: p, rotation: r, scale: s } = a.object
            a.onCommit?.(a.id, { position: [p.x, p.y, p.z], rotation: [r.x, r.y, r.z], scale: [s.x, s.y, s.z] })
        } else if (a.moved) {
            place(a.object, a.startWorld) // cancelled: back where it was, nothing written
        }
        a.onEnd?.()
    }

    function onMove(event) {
        const a = active
        if (!a || event.pointerId !== a.pointerId) return
        if (event.pointerType !== 'touch' && (event.buttons & 1) === 0) { finish(true); return }
        if (!a.moved && Math.hypot(event.clientX - a.x, event.clientY - a.y) < PULL_START_PX) return
        const r = rayAt(event.clientX, event.clientY)
        if (!r) return
        const got = a.facing ? facingHit(raycaster.ray, a.startHit, hit) : planeHit(raycaster.ray, a.height, hit, a.reach)
        if (!got) return
        a.moved = true
        world.copy(a.startWorld).add(hit.sub(a.startHit).setY(0))
        place(a.object, world)
    }
    function onUp(event) { if (active && event.pointerId === active.pointerId) finish(true) }
    function onCancel(event) { if (active && (!event?.pointerId || event.pointerId === active.pointerId)) finish(false) }

    const begin = (event, { onEnd } = {}) => {
        if (active || !element || !doc || pullGoesToCamera(event)) return false
        const live = getLive?.() || {}
        if (!live.enabled || typeof live.onCommit !== 'function' || live.selectedIds?.length !== 1) return false
        const r = rayAt(event.clientX, event.clientY)
        const scene = getScene?.()
        if (!r || !scene) return false
        if (gizmoHasPointer(r.ndc)) return false
        const hits = raycaster.intersectObject(scene, true)
        const pickedId = pickFromHits(hits)
        const id = pullTargetId({ pickedId, selectedIds: live.selectedIds, entities: live.entities })
        const object = id ? getObject(id) : null
        if (!object) return false
        const grab = hits.find((h) => entityInfoOf(h.object, h)?.id === id && !h.object.userData?.beamPick)
        if (!grab) return false
        active = {
            id, object, onCommit: live.onCommit, onEnd, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
            height: grab.point.y, startHit: grab.point.clone(), startWorld: object.getWorldPosition(new Vector3()), moved: false,
            facing: Math.abs(raycaster.ray.direction.y) < GRAZING_SLOPE,
            reach: Math.min(r.camera.far, MAX_PULL_REACH * Math.max(grab.distance, 1)),
        }
        pullingId = id
        doc.addEventListener('pointermove', onMove, true)
        doc.addEventListener('pointerup', onUp, true)
        doc.addEventListener('pointercancel', onCancel, true)
        window.addEventListener('blur', onCancel)
        return true
    }

    return { begin, cancel: () => finish(false), isActive: () => active != null }
}

// The Studio's pull, for StudioOrbit (inside the Canvas). `onCommit` null (a viewer, a read-only room, Walk) = no pulls at all.
// Returns one stable { begin, cancel }: the camera-controls element is read at each press (the controls mount after the first render).
export function usePullToMove({ controlsRef, entities, selectedEntityIds, onCommit = null, enabled = true }) {
    const scene = useThree((state) => state.scene)
    const invalidate = useThree((state) => state.invalidate)
    const liveRef = useRef({})
    useEffect(() => {
        liveRef.current = { enabled: Boolean(enabled && onCommit), entities: entities || [], selectedIds: selectedEntityIds || [], onCommit, scene, invalidate }
    }, [enabled, onCommit, entities, selectedEntityIds, scene, invalidate])
    const pull = useMemo(() => {
        let held = null
        const controller = () => {
            const element = controlsRef?.current?._domElement
            if (!element) return null
            if (held?.element !== element) {
                held?.ctrl.cancel()
                held = { element, ctrl: createPull({
                    element,
                    getCamera: () => controlsRef.current?.camera,
                    getScene: () => liveRef.current.scene,
                    getLive: () => liveRef.current,
                    invalidate: () => liveRef.current.invalidate?.(),
                }) }
            }
            return held.ctrl
        }
        return {
            begin: (event, options) => controller()?.begin(event, options) ?? false,
            cancel: () => held?.ctrl.cancel(),
        }
    }, [controlsRef])
    useEffect(() => () => pull.cancel(), [pull])
    return pull
}
