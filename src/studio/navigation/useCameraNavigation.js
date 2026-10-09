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
import { clientToNdc, pickPivot, selectionCenter } from './autoDepth.js'

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

// Auto Depth picks the surface under the pointer, which in the Inside mode can be a wall 50 m away: camera-controls then clamps that
// pivot into the interior target box and drags the camera with it. Measured on the RTX 3080 (2026-10-08, Inside): a 160 px pan moved the
// grabbed surface point 432 px off the pointer and the first zoom notch multiplied the distance by 4.7. So the pivot is kept inside what
// the controls allow: never farther than 90 % of maxDistance along the ray, and inside the target boundary when there is one.
export function limitPivot(cc, point) {
    if (!cc || !point) return point
    const cam = (cc.camera || cc._camera)?.position
    const out = point.clone ? point.clone() : { ...point }
    const max = Number.isFinite(cc.maxDistance) ? cc.maxDistance * 0.9 : Infinity
    if (cam && Number.isFinite(max) && out.sub && out.distanceTo) {
        const d = out.distanceTo(cam)
        if (d > max && d > 0) out.sub(cam).multiplyScalar(max / d).add(cam)
    }
    const box = cc._boundary
    if (box && box.clampPoint && !(box.isEmpty && box.isEmpty())) box.clampPoint(out, out)
    return out
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
    // The viewer's own switch (viewSettings.js 'autoDepth'); undefined = the preset's.
    autoDepth,
    // "Dolly through" (viewSettings.js unlimitedZoom): a wheel notch that zooms IN keeps moving through the scene at the closest distance;
    // a notch that zooms out never pushes the target away. undefined = leave infinityDolly alone. `invertWheel` flips what counts as in.
    dollyThrough,
    invertWheel = false,
}) {
    // Read at gesture time, so a new selection does not re-register listeners.
    const selectionRef = useRef(selectedEntityIds)
    useEffect(() => { selectionRef.current = selectedEntityIds }, [selectedEntityIds])
    useEffect(() => {
        const preset = getNavigationPreset(presetId)
        const cc = controlsRef.current
        const wantsAutoDepth = autoDepth ?? preset.autoDepth
        if (!active || !cc || (preset.id === 'studio' && !wantsAutoDepth && dollyThrough === undefined)) return undefined
        const element = cc._domElement
        const doc = element?.ownerDocument
        if (!element || !doc) return undefined

        // `gestureStart`: the gesture's own pointerdown/wheel, after settleForGesture stopped any easing: camera-controls still
        // reports `active` for a frame after stop(), and a pivot that waits for it never lands (measured: the first gesture's pivot
        // was refused, the second's applied).
        const pivotAt = (event, action, gestureStart = false) => {
            const scene = getScene?.()
            if (!scene) return
            const selected = selectionRef.current
            if (action === CC_ACTION.ROTATE && orbitSelection && selected?.length) {
                const center = selectionCenter(entityRoots(scene, new Set(selected)))
                if (center) { applyPivot(cc, center, { force: gestureStart }); return }
            }
            // Auto Depth serves PAN and ZOOM (distance-scaled gestures). ROTATE keeps the target it has: re-pivoting an orbit
            // onto a surface 50 m down a hall swept the camera 30 m in one frame (measured 2026-10-08, Inside).
            if (!wantsAutoDepth || action === CC_ACTION.ROTATE) return
            const ndc = clientToNdc(event.clientX, event.clientY, element.getBoundingClientRect())
            if (!ndc) return
            applyPivot(cc, limitPivot(cc, pickPivot({ camera: cc.camera, ndc, objects: entityRoots(scene) })), { force: gestureStart })
        }

        const onPointerDown = (event) => {
            if (!element.contains(event.target)) return
            // pointerType is what the browser reports, not a guess: touch keeps
            // the touch gestures, only mouse/pen buttons are remapped.
            if (event.pointerType === 'touch') return
            const name = BUTTON_NAME[event.button]
            if (!name) return
            const action = actionFor(preset.id, event.button,
                { shift: event.shiftKey, ctrl: event.ctrlKey, alt: event.altKey }, { ortho })
            cc.mouseButtons[name] = action
            // Shift-Ctrl-MMB is Blender's Dolly View: the zoom keeps going past where it stops (camera-controls infinityDolly) for this gesture
            if (preset.modifierGestures && name === 'middle' && event.shiftKey && event.ctrlKey) {
                const before = cc.infinityDolly
                cc.infinityDolly = true
                doc.addEventListener('pointerup', () => { cc.infinityDolly = before }, { once: true, capture: true })
            }
            if (action !== CC_ACTION.NONE) { settleForGesture(cc); pivotAt(event, action, true) }
        }

        let lastWheel = 0
        const onWheel = (event) => {
            if (!element.contains(event.target)) return
            const now = performance.now()
            const quiet = now - lastWheel > WHEEL_PICK_QUIET_MS
            lastWheel = now
            if (dollyThrough !== undefined) cc.infinityDolly = Boolean(dollyThrough) && ((event.deltaY < 0) !== Boolean(invertWheel))
            // Blender 5.2 manual: Shift-Wheel pans (vertically; sideways with a horizontal wheel), the plain wheel zooms
            if (preset.modifierGestures) cc.mouseButtons.wheel = event.shiftKey ? CC_ACTION.TRUCK : CC_ACTION.DOLLY
            if (quiet && !event.shiftKey) { settleForGesture(cc); pivotAt(event, CC_ACTION.DOLLY, true) }
        }

        doc.addEventListener('pointerdown', onPointerDown, { capture: true })
        doc.addEventListener('wheel', onWheel, { capture: true, passive: true })
        return () => {
            doc.removeEventListener('pointerdown', onPointerDown, { capture: true })
            doc.removeEventListener('wheel', onWheel, { capture: true })
        }
    }, [active, controlsRef, presetId, ortho, orbitSelection, getScene, autoDepth, dollyThrough, invertWheel])
}
