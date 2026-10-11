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
import { WORLD_MOVE, dragToTruck, resolveMoveStep } from './worldMove.js'

const BUTTON_NAME = { 0: 'left', 1: 'middle', 2: 'right' }
// A wheel burst is one gesture: pick once, after this much quiet.
export const WHEEL_PICK_QUIET_MS = 200

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
export function applyPivot(cc, point, { force = false } = {}) {
    if (!cc || !point || (cc.active && !force)) return false
    cc.setOrbitPoint(point.x, point.y, point.z)
    return true
}

// A gesture is starting, so whatever the camera was easing toward (the slow turn a visitor who touches nothing is shown,
// a fly-to) is over: stop it, so the pivot below can be set. Measured 2026-10-08 on the public viewer (Inside and Free):
// camera-controls reported `active` at the start of EVERY gesture, applyPivot refused, Auto Depth never ran and a 240 px
// right-drag still moved the camera 0.11-0.64 m. applyPivot keeps its own refusal (setOrbitPoint must not run mid-ease).
export function settleForGesture(cc) {
    if (cc?.active) cc.stop()
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
    // The owner's move step in metres per 100 px (null = auto from the scene), for presets with worldMove.
    moveStep = null,
    // Re-run when the controls mount/unmount (Studio hides them in XR / when disabled).
    active = true,
}) {
    const moveStepRef = useRef(moveStep)
    useEffect(() => { moveStepRef.current = moveStep }, [moveStep])
    // Read at gesture time, so a new selection does not re-register listeners.
    const selectionRef = useRef(selectedEntityIds)
    useEffect(() => { selectionRef.current = selectedEntityIds }, [selectedEntityIds])
    const depthRef = useRef(null)
    useEffect(() => {
        const preset = getNavigationPreset(presetId)
        const cc = controlsRef.current
        if (!active || !cc || (preset.id === 'studio' && !preset.autoDepth && !preset.worldMove)) return undefined
        const element = cc._domElement
        const doc = element?.ownerDocument
        if (!element || !doc) return undefined

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
                if (center) { applyPivot(cc, center, { force: gestureStart }); return }
            }
            // Auto Depth serves PAN and ZOOM (distance-scaled gestures). ROTATE keeps the target it has: re-pivoting an orbit
            // onto a surface 50 m down a hall swept the camera 30 m in one frame (measured 2026-10-08, Inside).
            if (!preset.autoDepth || action === CC_ACTION.ROTATE) { trace({ action, gestureStart, why: 'rotate or no autoDepth' }); return }
            const ndc = clientToNdc(event.clientX, event.clientY, element.getBoundingClientRect())
            if (!ndc) { trace({ action, gestureStart, why: 'no ndc' }); return }
            const roots = entityRoots(scene)
            const hit = pickPivot({ camera: cc.camera, ndc, objects: roots })
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
                    point = fallback
                }
            }
            const applied = applyPivot(cc, point, { force: gestureStart })
            trace({ action, gestureStart, roots: roots.length, ndc: ndc.map((v) => +v.toFixed(3)), hit: hit ? [hit.x, hit.y, hit.z].map((v) => +v.toFixed(2)) : null, fallback: fallback ? [fallback.x, fallback.y, fallback.z].map((v) => +v.toFixed(2)) : null, remembered: depthRef.current == null ? null : +depthRef.current.toFixed(2), applied, active: cc.active, distance: +cc.distance.toFixed(3) })
        }

        // The world move (worldMove.js): right-drag moves camera and orbit point together by a fixed step per pixel,
        // whatever the zoom. camera-controls holds NONE for that button; this is the whole gesture.
        let move = null
        const onMoveMove = (event) => {
            if (!move || event.pointerId !== move.pointerId) return
            const { x, y } = dragToTruck(event.clientX - move.x, event.clientY - move.y, move.step)
            move.x = event.clientX; move.y = event.clientY
            cc.truck(x, y, false)
        }
        const endMove = (event) => {
            if (!move || (event && event.pointerId !== move.pointerId)) return
            move = null
            doc.removeEventListener('pointermove', onMoveMove, { capture: true })
            doc.removeEventListener('pointerup', endMove, { capture: true })
            doc.removeEventListener('pointercancel', endMove, { capture: true })
            cc.dispatchEvent({ type: 'controlend' })
        }
        const startMove = (event) => {
            const scene = getScene?.()
            const step = resolveMoveStep(moveStepRef.current, scene ? entityRoots(scene) : [])
            move = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, step }
            trace({ action: WORLD_MOVE, step: +step.toFixed(3) })
            doc.addEventListener('pointermove', onMoveMove, { capture: true })
            doc.addEventListener('pointerup', endMove, { capture: true })
            doc.addEventListener('pointercancel', endMove, { capture: true })
            cc.dispatchEvent({ type: 'controlstart' })
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
            if (action === WORLD_MOVE) { cc.mouseButtons[name] = CC_ACTION.NONE; settleForGesture(cc); startMove(event); return }
            cc.mouseButtons[name] = action
            if (action !== CC_ACTION.NONE) { settleForGesture(cc); pivotAt(event, action, true) }
        }

        let lastWheel = 0
        const onWheel = (event) => {
            if (!element.contains(event.target)) return
            const now = performance.now()
            const quiet = now - lastWheel > WHEEL_PICK_QUIET_MS
            lastWheel = now
            if (quiet) { settleForGesture(cc); pivotAt(event, CC_ACTION.DOLLY, true) }
        }

        // The right button is ours in a worldMove preset: the browser's context menu must not open over the viewport.
        // camera-controls used to suppress it while it owned the button (owner, 2026-10-12: "save image as, inspect… kidding me").
        const onContextMenu = (event) => {
            if (preset.worldMove && element.contains(event.target)) event.preventDefault()
        }

        doc.addEventListener('pointerdown', onPointerDown, { capture: true })
        doc.addEventListener('wheel', onWheel, { capture: true, passive: true })
        doc.addEventListener('contextmenu', onContextMenu, { capture: true })
        return () => {
            endMove()
            doc.removeEventListener('pointerdown', onPointerDown, { capture: true })
            doc.removeEventListener('wheel', onWheel, { capture: true })
            doc.removeEventListener('contextmenu', onContextMenu, { capture: true })
        }
    }, [active, controlsRef, presetId, ortho, orbitSelection, getScene])
}
