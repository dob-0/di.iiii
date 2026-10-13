// Applies a navigation preset to a camera-controls instance, per gesture.
//
// The 'studio' preset's BUTTONS are still the props StudioViewport passes (nothing is remapped here); this hook runs for it
// only to move the orbit point to the surface under the pointer (Auto Depth, which the studio preset now has on). Other presets add one capture-phase
// pointerdown listener (runs before camera-controls' own pointerdown on the
// element) that sets mouseButtons[button] from actionFor() for the gesture that
// is starting — camera-controls reads mouseButtons on every pointermove, so the
// choice holds until the next pointerdown — and, when Auto Depth is on, moves
// the orbit point to the surface under the pointer (pickPivot).
import { useEffect, useRef } from 'react'
import { CC_ACTION, actionFor, getNavigationPreset } from './mappings.js'
import { Vector3 } from 'three'
import { clientToNdc, pickPivot, selectionCenter } from './autoDepth.js'
import { wheelNotches } from '../../project/viewport/navMath.js'
import { createSceneDistance, nextSceneDistance } from './sceneDistance.js'

const BUTTON_NAME = { 0: 'left', 1: 'middle', 2: 'right' }
// A wheel burst is one gesture: pick once, after this much quiet.

// Content objects only: Studio tags every entity group with userData.svEntityId
// (StudioViewport.jsx); grid, gizmo and rig markers carry no such tag.
export function entityRoots(scene, ids = null) {
    const out = []
    scene?.traverse?.((object) => {
        const id = object.userData?.svEntityId
        if (id != null && (!ids || ids.has(id))) out.push(object)
    })
    return out
}

// camera-controls: setOrbitPoint "SHOULD NOT RUN DURING ANIMATIONS".
// `active` is true while it is still easing toward a goal.
export function applyPivot(cc, point, { force = false, onAxis = true } = {}) {
    if (!cc || !point || (cc.active && !force)) return false
    if (onAxis) {
        // Blender's Auto Depth sets the view DEPTH under the mouse, never a sideways pivot. camera-controls' setOrbitPoint does
        // the sideways version through a focal offset, and for a hit far off the view axis its next update() moved the camera
        // 6.94 m in one frame (walked through 2026-10-12; the maintainer calls the focal offset problematic, issue #424). So the
        // orbit point goes onto the view axis at the hit's depth: camera and aim stay exactly where they are.
        const cam = cc.camera
        const target = axisPointAtDepth(cam, point)
        cc.setLookAt(cam.position.x, cam.position.y, cam.position.z, target.x, target.y, target.z, false)
        return true
    }
    cc.setOrbitPoint(point.x, point.y, point.z)
    return true
}

// The point on the camera's view axis at the same depth as `point`. Pure.
export function axisPointAtDepth(camera, point) {
    const depth = camera.position.distanceTo(point)
    return camera.getWorldDirection(new Vector3()).multiplyScalar(depth).add(camera.position)
}

// A gesture is starting, so whatever the camera was easing toward (the slow turn a visitor who touches nothing is shown,
// a fly-to) is over: stop it, so the pivot below can be set. Measured 2026-10-08 on the public viewer (Inside and Free):
// camera-controls reported `active` at the start of EVERY gesture, applyPivot refused, Auto Depth never ran and a 240 px
// right-drag still moved the camera 0.11-0.64 m. applyPivot keeps its own refusal (setOrbitPoint must not run mid-ease).
export function settleForGesture(cc) {
    if (cc?.active) cc.stop()
}

// The frame delta camera-controls may ease over. With frameloop="demand" the first frame of a gesture after a pause carries the
// whole pause as its delta (walked through 2026-10-12: ~0.7 s), and SmoothDamp then finishes the ease in that one frame — a 6.9 m
// snap at the floor, a pop at the start of every gesture after a rest. Clamped to two frames at 30 Hz. Pure.
export const MAX_UPDATE_DT = 1 / 15
export const clampUpdateDt = (dt) => (Number.isFinite(dt) && dt > 0 ? Math.min(dt, MAX_UPDATE_DT) : 0)

// Installs the clamp on a camera-controls instance once (drei calls cc.update(delta) with R3F's raw delta). Returns the undo.
export function clampUpdates(cc) {
    if (!cc || typeof cc.update !== 'function' || cc.__diClampedUpdate) return () => {}
    const original = cc.update
    cc.update = function (dt) { return original.call(this, clampUpdateDt(dt)) }
    cc.__diClampedUpdate = true
    return () => { cc.update = original; delete cc.__diClampedUpdate }
}

// WHEEL ZOOM = Blender's (view3d_navigate_view_zoom.cc `view_zoom_apply_step`, v5.0.0; measured on the owner's Blender 5.2.2,
// 2026-10-13, scripts/nav/blender-wheel-probe.py: 20 notches = 1.2^20 exactly, the orbit point never moved, the pointer's place
// made no difference, zoom-out ran past clip end x 10, zoom-in stopped at the orbit point). One notch scales the ORBIT DISTANCE
// by 1.2 (in: /1.2). The wheel reads nothing under the pointer: the orbit point moves only when a drag starts (Auto Depth). Blender
// steps only while the distance is inside its soft range (ED_view3d_dist_soft_range_get: up to clip end x 10) and never clamps, so
// a view outside the range still comes back. Pure: numbers in, numbers out.
export const WHEEL_STEP_FACTOR = 1.2
export function wheelZoomPlan({ distance, notches, minDistance = 0, maxDistance = Infinity }) {
    if (!(distance > 0) || !Number.isFinite(notches) || notches === 0) return null
    if (notches > 0 && distance <= minDistance) return null
    if (notches < 0 && distance >= maxDistance) return null
    // notches > 0 = in; a notch out never leaves the range (review-892 F11: 450 m + one notch gave 540 m past the 500 m limit)
    const newDistance = notches < 0 ? Math.min(distance * Math.pow(WHEEL_STEP_FACTOR, -notches), maxDistance) : distance * Math.pow(WHEEL_STEP_FACTOR, -notches)
    return { step: distance - newDistance, newDistance }
}

// Does this wheel event zoom in (toward the scene)? camera-controls: negative deltaY dollies in. Pure.
export const zoomsIn = (event) => Number(event?.deltaY) < 0

export function useCameraNavigation({
    controlsRef,
    presetId,
    ortho = false,
    orbitSelection = false,
    selectedEntityIds = null,
    getScene,
    // The WebGLRenderer, for the scene-distance depth picture (sceneDistance.js). Read at gesture time.
    getGl,
    // Re-run when the controls mount/unmount (Studio hides them in XR / when disabled).
    active = true,
}) {
    // Read at gesture time, so a new selection does not re-register listeners.
    const selectionRef = useRef(selectedEntityIds)
    useEffect(() => { selectionRef.current = selectedEntityIds }, [selectedEntityIds])
    useEffect(() => {
        const preset = getNavigationPreset(presetId)
        const cc = controlsRef.current
        if (!active || !cc || (preset.id === 'studio' && !preset.autoDepth)) return undefined
        const element = cc._domElement
        const doc = element?.ownerDocument
        if (!element || !doc) return undefined
        const unclamp = clampUpdates(cc)
        // The Blender tool's moves take their speed from the scene distance (sceneDistance.js, owner's yes 2026-10-13).
        const sceneDistance = preset.speedFromView ? createSceneDistance() : null
        let lastWheel = null // { pos, distance }: where this wheel left the camera, so the next notch knows it is the same run
        // `near`: where the depth picture starts. The wheel's starts at the contact distance, so it goes through what it touches;
        // a drag's starts at the camera's own near plane, so it follows what the eye sees (review-892 F12).
        const measureView = (near) => {
            const scene = getScene?.()
            return sceneDistance?.measure({ gl: getGl?.(), scene, camera: cc.camera, roots: scene ? entityRoots(scene) : [], near }) ?? null
        }
        const viewRange = () => ({ min: cc.minDistance, max: Math.min(cc.maxDistance, cc.camera.far) })

        // `gestureStart`: the gesture's own pointerdown/wheel, after settleForGesture stopped any easing: camera-controls still
        // reports `active` for a frame after stop(), and a pivot that waits for it never lands (measured: the first gesture's pivot
        // was refused, the second's applied).
        // Dev-only trace of every pivot decision (window.__diNavTrace), read by scripts/nav/measure-pan-after-zoom.cjs
        // with NAV_TRACE=1: the 2026-10-12 measurement showed the fix changing nothing and this is how it was found.
        const trace = (entry) => { if (import.meta.env?.DEV) (window.__diNavTrace ||= []).push({ t: Math.round(performance.now()), ...entry }) }
        const pivotAt = (event, action, gestureStart = false) => {
            const scene = getScene?.()
            if (import.meta.env?.DEV) window.__diNavScene = scene
            if (!scene) { trace({ action, gestureStart, why: 'no scene' }); return }
            const selected = selectionRef.current
            if (action === CC_ACTION.ROTATE && orbitSelection && selected?.length) {
                const center = selectionCenter(entityRoots(scene, new Set(selected)))
                if (center) { applyPivot(cc, center, { force: gestureStart, onAxis: false }); return }
            }
            // The Blender tool: the orbit point goes onto the view axis at the scene distance, so orbit, pan and the drag zoom move
            // in proportion to what the view shows, never to the one object under the pointer (sceneDistance.js).
            if (preset.speedFromView) {
                lastWheel = null
                const measured = measureView(cc.camera.near)
                const d = nextSceneDistance({ measured, ...viewRange() })
                const applied = d ? applyPivot(cc, axisPointAtDepth(cc.camera, cc.camera.getWorldDirection(new Vector3()).multiplyScalar(d).add(cc.camera.position)), { force: gestureStart }) : false
                trace({ action, gestureStart, source: 'scene distance', measured: measured == null ? null : +measured.toFixed(3), distance: d == null ? null : +d.toFixed(3), applied })
                return
            }
            // Auto Depth (Blender view3d_navigate.cc `navigate_pivot_get`, v5.0.0): the orbit point goes to the depth of the surface
            // under the pointer when a drag starts; nothing there, and the view centre stays where it is (Blender's fallback_depth_pt
            // is -rv3d->ofs). Orbit, pan and the drag zoom all take it, as in Blender; the Sketchfab tool keeps its orbit centre on
            // a rotate (double-click moves it).
            if (!preset.autoDepth || (action === CC_ACTION.ROTATE && preset.id === 'studio')) { trace({ action, gestureStart, why: 'sketchfab orbit or no autoDepth' }); return }
            const ndc = clientToNdc(event.clientX, event.clientY, element.getBoundingClientRect())
            if (!ndc) { trace({ action, gestureStart, why: 'no ndc' }); return }
            const roots = entityRoots(scene)
            // A surface within the clamp distance is the one we are pressed against: look past it (autoDepth.js `beyond`).
            const beyond = import.meta.env?.DEV && window.__diNavBeyond != null ? window.__diNavBeyond : cc.minDistance * 1.5 // dev: measurement A/B
            const hit = pickPivot({ camera: cc.camera, ndc, objects: roots, beyond })
            const applied = hit ? applyPivot(cc, hit, { force: gestureStart }) : false
            trace({ action, gestureStart, roots: roots.length, ndc: ndc.map((v) => +v.toFixed(3)), hit: hit ? [hit.x, hit.y, hit.z].map((v) => +v.toFixed(2)) : null, applied, kept: !hit, active: cc.active, distance: +cc.distance.toFixed(3) })
        }

        const onPointerDown = (event) => {
            if (!element.contains(event.target)) { trace({ why: 'pointer outside controls element', target: event.target?.tagName, cls: String(event.target?.className || '').slice(0, 60) }); return }
            // pointerType is what the browser reports, not a guess: touch keeps
            // the touch gestures, only mouse/pen buttons are remapped.
            if (event.pointerType === 'touch') return
            const name = BUTTON_NAME[event.button]
            if (!name) return
            const action = actionFor(preset.id, event.button,
                { shift: event.shiftKey, ctrl: event.ctrlKey, alt: event.altKey }, { ortho })
            cc.mouseButtons[name] = action
            if (action !== CC_ACTION.NONE) { settleForGesture(cc); pivotAt(event, action, true) }
        }

        const rayDir = new Vector3(), viewDir = new Vector3(), camPos = new Vector3(), newPos = new Vector3(), newTarget = new Vector3()
        const onWheel = (event) => {
            if (!element.contains(event.target)) return
            event.preventDefault()
            const notches = wheelNotches(event)
            if (!notches) return
            const cam = cc.camera
            // camera-controls moves the camera object only in update() (2.10.1): a second notch in the same frame read the old place
            // and overwrote the first (review-892 F3: 1.00 m moved instead of 1.83 m). The Blender tool's moves are instant, so the
            // pending pose is written first; the Sketchfab tool eases, and where it is mid-ease is where it is.
            if (preset.speedFromView) cc.update(0)
            cam.getWorldPosition(camPos); cam.getWorldDirection(viewDir)
            // Blender's soft range: in to the near clip (ED_view3d_dist_soft_min_get, perspective: clip start x 1.5), out to clip end x 10,
            // and never past the controls' own maxDistance, which would pull the camera back (camera-controls clamps the radius).
            let range = { minDistance: cam.near * 1.5, maxDistance: Math.min(cc.maxDistance, cam.far * 10) }
            let hit = null, distance = cc.distance
            if (preset.dollyToCursor) {
                // The Sketchfab tool zooms toward what is under the pointer, through it when pressed against it (`beyond`),
                // along the ray through the pointer; nothing under it, and it is the orbit distance, as in Blender.
                const scene = getScene?.()
                const roots = scene ? entityRoots(scene) : []
                const ndc = clientToNdc(event.clientX, event.clientY, element.getBoundingClientRect())
                hit = ndc && roots.length ? pickPivot({ camera: cam, ndc, objects: roots, beyond: cc.minDistance * 1.5 }) : null
                if (hit) distance = camPos.distanceTo(hit)
                if (ndc) rayDir.set(ndc[0], ndc[1], 0.5).unproject(cam).sub(camPos).normalize()
                else rayDir.copy(viewDir)
            } else {
                // The Blender tool (Zoom to Mouse Position OFF, the owner's preference): along the view axis, by Blender's ratio of
                // the SCENE DISTANCE. Inside one run of notches it changes at most 1.2x per notch; a surface closer than the
                // contact distance is not in the depth picture, so the wheel goes through it and never stops at it.
                rayDir.copy(viewDir)
                const consecutive = Boolean(lastWheel) && camPos.distanceTo(lastWheel.pos) < 1e-3
                const measured = measureView(Math.max(cc.minDistance, cam.near))
                // 1.2 per notch of scroll, whatever one event carries (a trackpad's tenth, a fast wheel's three: review-892 F2)
                const ratio = Math.pow(WHEEL_STEP_FACTOR, Math.abs(notches))
                const d = nextSceneDistance({ measured, previous: consecutive ? lastWheel.distance : cc.distance, consecutive, ratio, ...viewRange() })
                if (d) distance = d
                range = { minDistance: 0, maxDistance: viewRange().max }
                trace({ action: 'wheel-measure', measured: measured == null ? null : +measured.toFixed(3), consecutive, distance: +distance.toFixed(3) })
            }
            const plan = wheelZoomPlan({ distance, notches, ...range })
            if (!plan) { trace({ action: 'wheel', notches, distance: +distance.toFixed(3), step: 0, why: 'outside the soft range' }); return }
            newPos.copy(camPos).addScaledVector(rayDir, plan.step)
            newTarget.copy(newPos).addScaledVector(viewDir, Math.max(plan.newDistance, cc.minDistance))
            // The distance this notch USED: keeping the post-step distance (d / 1.2) cancelled the 1.2 allowance, and a run could
            // never speed up again after passing a wall (review-892 F1: 40 notches at 0.07 m with 30 m measured behind it).
            if (preset.speedFromView) lastWheel = { pos: newPos.clone(), distance }
            // camera-controls' own wheel used to announce itself; drei invalidates the on-demand loop on 'update' and the Studio
            // saves the camera on 'controlend', so the app's wheel announces the same way (else nothing draws until the next move).
            cc.dispatchEvent({ type: 'controlstart', originalEvent: event })
            cc.setLookAt(newPos.x, newPos.y, newPos.z, newTarget.x, newTarget.y, newTarget.z, preset.draggingSmoothTime > 0)
            cc.dispatchEvent({ type: 'update' })
            cc.dispatchEvent({ type: 'controlend', originalEvent: event })
            trace({ action: 'wheel', notches, hit: hit ? [hit.x, hit.y, hit.z].map((v) => +v.toFixed(2)) : null, distance: +distance.toFixed(3), step: +plan.step.toFixed(3), newDistance: +plan.newDistance.toFixed(3) })
        }

        // Neither Blender nor Sketchfab ever shows the browser's menu over the view (owner, 2026-10-12: "save image as,
        // inspect… kidding me"): a right-click on the viewport is the app's.
        const onContextMenu = (event) => { if (element.contains(event.target)) event.preventDefault() }

        // Sketchfab: double-click a surface and the camera focuses on it (the orbit point moves there).
        const onDoubleClick = (event) => {
            if (!preset.focusOnDoubleClick || !element.contains(event.target)) return
            const scene = getScene?.()
            if (!scene) return
            const ndc = clientToNdc(event.clientX, event.clientY, element.getBoundingClientRect())
            if (!ndc) return
            settleForGesture(cc)
            const point = pickPivot({ camera: cc.camera, ndc, objects: entityRoots(scene) })
            if (point) { const c = cc.camera.position; cc.setLookAt(c.x, c.y, c.z, point.x, point.y, point.z, true) }
            trace({ action: 'focus', hit: point ? [point.x, point.y, point.z].map((v) => +v.toFixed(2)) : null })
        }

        doc.addEventListener('pointerdown', onPointerDown, { capture: true })
        element.addEventListener('wheel', onWheel, { passive: false })
        doc.addEventListener('contextmenu', onContextMenu, { capture: true })
        doc.addEventListener('dblclick', onDoubleClick, { capture: true })
        return () => {
            unclamp()
            sceneDistance?.dispose()
            doc.removeEventListener('pointerdown', onPointerDown, { capture: true })
            element.removeEventListener('wheel', onWheel)
            doc.removeEventListener('contextmenu', onContextMenu, { capture: true })
            doc.removeEventListener('dblclick', onDoubleClick, { capture: true })
        }
    }, [active, controlsRef, presetId, ortho, orbitSelection, getScene, getGl])
}
