import { useEffect, useState } from 'react'

// Holding Ctrl/Cmd while dragging a gizmo snaps it: 0.5 world units, 15°,
// 0.1 scale steps — same increments as the modal G/R/S operators. One copy
// for every gizmo in Studio's room (an object's, a group's, a node's).
export const GIZMO_SNAP = { translation: 0.5, rotation: Math.PI / 12, scale: 0.1 }

export function useSnapModifier() {
    const [snapping, setSnapping] = useState(false)
    useEffect(() => {
        const update = (e) => setSnapping(e.ctrlKey || e.metaKey)
        window.addEventListener('keydown', update)
        window.addEventListener('keyup', update)
        return () => {
            window.removeEventListener('keydown', update)
            window.removeEventListener('keyup', update)
        }
    }, [])
    return snapping
}
