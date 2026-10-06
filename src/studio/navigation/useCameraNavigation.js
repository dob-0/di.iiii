// Applies a navigation preset to a camera-controls instance, per gesture.
//
// The 'studio' preset installs nothing here: StudioViewport keeps passing its
// bindings as props exactly as before. Other presets add one capture-phase
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
export function applyPivot(cc, point) {
    if (!cc || !point || cc.active) return false
    cc.setOrbitPoint(point.x, point.y, point.z)
    return true
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
    useEffect(() => {
        const preset = getNavigationPreset(presetId)
        const cc = controlsRef.current
        if (!active || !cc || preset.id === 'studio') return undefined
        const element = cc._domElement
        const doc = element?.ownerDocument
        if (!element || !doc) return undefined

        const pivotAt = (event, action) => {
            const scene = getScene?.()
            if (!scene) return
            const selected = selectionRef.current
            if (action === CC_ACTION.ROTATE && orbitSelection && selected?.length) {
                const center = selectionCenter(entityRoots(scene, new Set(selected)))
                if (center) { applyPivot(cc, center); return }
            }
            if (!preset.autoDepth) return
            const ndc = clientToNdc(event.clientX, event.clientY, element.getBoundingClientRect())
            if (!ndc) return
            applyPivot(cc, pickPivot({ camera: cc.camera, ndc, objects: entityRoots(scene) }))
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
            if (action !== CC_ACTION.NONE) pivotAt(event, action)
        }

        let lastWheel = 0
        const onWheel = (event) => {
            if (!element.contains(event.target)) return
            const now = performance.now()
            const quiet = now - lastWheel > WHEEL_PICK_QUIET_MS
            lastWheel = now
            if (quiet) pivotAt(event, CC_ACTION.DOLLY)
        }

        doc.addEventListener('pointerdown', onPointerDown, { capture: true })
        doc.addEventListener('wheel', onWheel, { capture: true, passive: true })
        return () => {
            doc.removeEventListener('pointerdown', onPointerDown, { capture: true })
            doc.removeEventListener('wheel', onWheel, { capture: true })
        }
    }, [active, controlsRef, presetId, ortho, orbitSelection, getScene])
}
