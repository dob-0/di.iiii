import { useEffect, useState } from 'react'

// Holding Ctrl/Cmd while dragging a gizmo snaps it: 0.5 world units, 15°,
// 0.1 scale steps — same increments as the modal G/R/S operators. Ctrl+Shift
// snaps to a tenth (5 cm, 1.5°, 0.01), Blender's precision snap, as in the
// modal (modalMotion.js snapStepFor). One copy for every gizmo in Studio's
// room (an object's, a group's, a node's).
export const GIZMO_SNAP = { translation: 0.5, rotation: Math.PI / 12, scale: 0.1 }

/** The three steps TransformControls takes for a snap state: false = none (nulls), 'fine' = a tenth. */
export const gizmoSnapSteps = (snapping) => {
    if (!snapping) return { translation: null, rotation: null, scale: null }
    const k = snapping === 'fine' ? 0.1 : 1
    return { translation: GIZMO_SNAP.translation * k, rotation: GIZMO_SNAP.rotation * k, scale: GIZMO_SNAP.scale * k }
}

/** false | 'coarse' | 'fine' from a key event's modifiers. */
export const snapStateOf = (e) => ((e.ctrlKey || e.metaKey) ? (e.shiftKey ? 'fine' : 'coarse') : false)

export function useSnapModifier() {
    const [snapping, setSnapping] = useState(false)
    useEffect(() => {
        const update = (e) => setSnapping(snapStateOf(e))
        window.addEventListener('keydown', update)
        window.addEventListener('keyup', update)
        return () => {
            window.removeEventListener('keydown', update)
            window.removeEventListener('keyup', update)
        }
    }, [])
    return snapping
}
