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
import { clientToNdc, fallbackPivot, pickPivot, selectionCenter } from './autoDepth.js'
import { wheelNotches } from '../../project/viewport/navMath.js'

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

// WHEEL ZOOM, the app's own (2026-10-12). Blender (view3d_navigate_view_zoom.cc): one wheel step scales the view distance by
// 1.2 (in: /1.2). The camera moves along the ray through the pointer when "zoom to mouse position" is on (Navigate, like
// Sketchfab) or along the view axis when it is off (Edit, the owner's Blender preference); the orbit point keeps the depth of
// what is under the pointer. Pure: numbers in, numbers out.
export const WHEEL_STEP_FACTOR = 1.2
// `viewDistance` is the orbit distance the view has now: a zoom-out never steps from a depth smaller than it (stress 2026-10-12:
// backing under the floor, the pointer grazed its underside at 1.6 m and 60 notches out shrank a 24 m view to 2 m).
// `zoomOutMaxDepth` bounds zoom-out only: a view that is already beyond it (a focus or a drag put it there) still zooms in
// (stress 2026-10-12, seed 11: both directions returned a zero step above the bound, and the wheel was dead for good).
export function wheelZoomPlan({ depth, notches, viewDistance = 0, zoomOutMaxDepth = Infinity }) {
    if (!(depth > 0) || !Number.isFinite(notches) || notches === 0) return null
    if (notches < 0 && Number.isFinite(viewDistance) && viewDistance > depth) depth = viewDistance
    const factor = Math.pow(WHEEL_STEP_FACTOR, -notches) // notches > 0 = in
    let newDepth = depth * factor
    if (notches < 0 && newDepth > zoomOutMaxDepth) newDepth = Math.max(depth, zoomOutMaxDepth)
    return { step: depth - newDepth, newDepth }
}

// Does this wheel event zoom in (toward the scene)? camera-controls: negative deltaY dollies in. Pure.
export const zoomsIn = (event) => Number(event?.deltaY) < 0

// A hit farther than `maxDepth` from the camera is brought back onto the ray at `maxDepth` (same direction). Pure.
export function capDepth(camera, point, maxDepth) {
    const d = camera.position.distanceTo(point)
    if (!(d > maxDepth)) return point
    return point.clone().sub(camera.position).multiplyScalar(maxDepth / d).add(camera.position)
}

// The depth to use when nothing is under the pointer. `remembered` is the last depth that came from a real surface or
// a framing; `viewDistance` is camera-controls' current orbit distance; `nearestDepth` the nearest surface around the
// camera (null in empty space). A larger view distance than remembered can only come from a framing or a zoom-out, so
// it is adopted; a smaller one may be the clamp, so it is not. The nearest surface is the floor of the answer.
export function resolveMissDepth(remembered, viewDistance, nearestDepth) {
    let depth = remembered ?? null
    if (Number.isFinite(viewDistance) && viewDistance > 0 && (depth == null || viewDistance > depth)) depth = viewDistance
    if (nearestDepth != null && (depth == null || nearestDepth > depth)) depth = nearestDepth
    return { depth, remembered: depth }
}

export function useCameraNavigation({
    controlsRef,
    presetId,
    ortho = false,
    orbitSelection = false,
    selectedEntityIds = null,
    getScene,
    // Re-run when the controls mount/unmount (Studio hides them in XR / when disabled).
    active = true,
}) {
    // Read at gesture time, so a new selection does not re-register listeners.
    const selectionRef = useRef(selectedEntityIds)
    useEffect(() => { selectionRef.current = selectedEntityIds }, [selectedEntityIds])
    const depthRef = useRef(null)
    useEffect(() => {
        const preset = getNavigationPreset(presetId)
        const cc = controlsRef.current
        if (!active || !cc || (preset.id === 'studio' && !preset.autoDepth)) return undefined
        const element = cc._domElement
        const doc = element?.ownerDocument
        if (!element || !doc) return undefined
        const unclamp = clampUpdates(cc)

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
            // Auto Depth serves PAN and ZOOM (distance-scaled gestures). ROTATE keeps the target it has: re-pivoting an orbit
            // onto a surface 50 m down a hall swept the camera 30 m in one frame (measured 2026-10-08, Inside).
            if (!preset.autoDepth || action === CC_ACTION.ROTATE) { trace({ action, gestureStart, why: 'rotate or no autoDepth' }); return }
            const ndc = clientToNdc(event.clientX, event.clientY, element.getBoundingClientRect())
            if (!ndc) { trace({ action, gestureStart, why: 'no ndc' }); return }
            const roots = entityRoots(scene)
            // A surface within the clamp distance is the one we are pressed against: look past it (autoDepth.js `beyond`).
            const beyond = import.meta.env?.DEV && window.__diNavBeyond != null ? window.__diNavBeyond : cc.minDistance * 1.5 // dev: measurement A/B
            let hit = pickPivot({ camera: cc.camera, ndc, objects: roots, beyond })
            // Going through a surface, the depth may at most double per wheel notch (walked through on 2026-10-12: the pick beyond
            // the floor landed 30 m away and one notch jumped 4.25 m after frames of 2 cm). A doubling depth is a smooth ramp.
            if (hit && action === CC_ACTION.DOLLY) hit = capDepth(cc.camera, hit, 2 * Math.max(cc.distance, cc.minDistance))
            // Nothing under the pointer (fog, open air): Blender keeps the depth the view had. We keep the depth the view
            // LAST HAD FROM A REAL SURFACE OR A FRAMING (resolveMissDepth), never the 0.35 m clamp camera-controls drags
            // the orbit point to while zooming into air; the nearest surface around the camera is its floor. The owner
            // (2026-10-12) found the nearest surface alone "slow": 1.1 m per 240 px drag 4 m above a 100 m hall's floor.
            let point = hit
            let fallback = null
            if (hit) {
                depthRef.current = cc.camera.position.distanceTo(hit)
            } else {
                const nearest = fallbackPivot({ camera: cc.camera, objects: roots })
                const nearestDepth = nearest ? cc.camera.position.distanceTo(nearest) : null
                const { depth, remembered } = resolveMissDepth(depthRef.current, cc.distance, nearestDepth)
                depthRef.current = remembered
                if (depth != null) {
                    fallback = cc.camera.getWorldDirection(new Vector3()).multiplyScalar(depth).add(cc.camera.position)
                    // Leaving a surface into empty space, the same ramp: the depth may at most double per wheel notch.
                    if (action === CC_ACTION.DOLLY) fallback = capDepth(cc.camera, fallback, 2 * Math.max(cc.distance, cc.minDistance))
                    point = fallback
                }
            }
            const applied = applyPivot(cc, point, { force: gestureStart })
            trace({ action, gestureStart, roots: roots.length, ndc: ndc.map((v) => +v.toFixed(3)), hit: hit ? [hit.x, hit.y, hit.z].map((v) => +v.toFixed(2)) : null, fallback: fallback ? [fallback.x, fallback.y, fallback.z].map((v) => +v.toFixed(2)) : null, remembered: depthRef.current == null ? null : +depthRef.current.toFixed(2), applied, active: cc.active, distance: +cc.distance.toFixed(3) })
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
            const scene = getScene?.()
            const roots = scene ? entityRoots(scene) : []
            const cam = cc.camera
            cam.getWorldPosition(camPos); cam.getWorldDirection(viewDir)
            const ndc = clientToNdc(event.clientX, event.clientY, element.getBoundingClientRect())
            // Depth under the pointer: the surface there (looking past the one we are pressed against), else the depth the view
            // last had from a surface or a framing; through a surface or into empty space it may at most double per notch.
            const beyond = cc.minDistance * 1.5
            const hit = ndc && roots.length ? pickPivot({ camera: cam, ndc, objects: roots, beyond }) : null
            let depth
            if (hit) depth = camPos.distanceTo(hit)
            else {
                const nearest = roots.length ? fallbackPivot({ camera: cam, objects: roots }) : null
                const r = resolveMissDepth(depthRef.current, cc.distance, nearest ? camPos.distanceTo(nearest) : null)
                depthRef.current = r.remembered
                depth = r.depth
            }
            if (depth == null) return
            if (notches > 0) depth = Math.min(depth, 2 * Math.max(cc.distance, cc.minDistance))
            if (hit) depthRef.current = depth
            const plan = wheelZoomPlan({ depth, notches, viewDistance: cc.distance, zoomOutMaxDepth: cam.far / 4 })
            if (!plan) return
            // the ray to move along: through the pointer (zoom to mouse position) or the view axis
            if (preset.dollyToCursor && ndc) rayDir.set(ndc[0], ndc[1], 0.5).unproject(cam).sub(camPos).normalize()
            else rayDir.copy(viewDir)
            newPos.copy(camPos).addScaledVector(rayDir, plan.step)
            newTarget.copy(newPos).addScaledVector(viewDir, plan.newDepth)
            // camera-controls' own wheel used to announce itself; drei invalidates the on-demand loop on 'update' and the Studio
            // saves the camera on 'controlend', so the app's wheel announces the same way (else nothing draws until the next move).
            cc.dispatchEvent({ type: 'controlstart', originalEvent: event })
            cc.setLookAt(newPos.x, newPos.y, newPos.z, newTarget.x, newTarget.y, newTarget.z, preset.draggingSmoothTime > 0)
            cc.dispatchEvent({ type: 'update' })
            cc.dispatchEvent({ type: 'controlend', originalEvent: event })
            trace({ action: 'wheel', notches, hit: hit ? [hit.x, hit.y, hit.z].map((v) => +v.toFixed(2)) : null, depth: +depth.toFixed(3), step: +plan.step.toFixed(3), remembered: depthRef.current == null ? null : +depthRef.current.toFixed(2) })
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
            if (point) { depthRef.current = cc.camera.position.distanceTo(point); const c = cc.camera.position; cc.setLookAt(c.x, c.y, c.z, point.x, point.y, point.z, true) }
            trace({ action: 'focus', hit: point ? [point.x, point.y, point.z].map((v) => +v.toFixed(2)) : null })
        }

        doc.addEventListener('pointerdown', onPointerDown, { capture: true })
        element.addEventListener('wheel', onWheel, { passive: false })
        doc.addEventListener('contextmenu', onContextMenu, { capture: true })
        doc.addEventListener('dblclick', onDoubleClick, { capture: true })
        return () => {
            unclamp()
            doc.removeEventListener('pointerdown', onPointerDown, { capture: true })
            element.removeEventListener('wheel', onWheel)
            doc.removeEventListener('contextmenu', onContextMenu, { capture: true })
            doc.removeEventListener('dblclick', onDoubleClick, { capture: true })
        }
    }, [active, controlsRef, presetId, ortho, orbitSelection, getScene])
}
