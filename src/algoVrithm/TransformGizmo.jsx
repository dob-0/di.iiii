import { useCallback, useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { TransformControls } from '@react-three/drei'
import { roundPlacement } from './sequenceTransform.js'
import { isLightName } from './worldLights.js'

// Drag handles for placing a sequence, from the outside view.
//
// Composing a scene by editing numbers means running the piece, deciding it is
// slightly too close, guessing a number, reloading, and doing it again. The
// gizmo turns that into dragging until it looks right — which is the only way
// anyone has ever judged where a thing should sit in a room.
//
// It writes back into the edit list, so what you drag is what "Copy edit list"
// emits. Nothing is persisted by the gizmo itself; the edit list stays the
// single source of truth, exactly as with timing.
//
// WHY IT FINDS ITS TARGET BY NAME: sequences mount and unmount as the playhead
// crosses their windows, so the group the gizmo is attached to can vanish
// mid-drag. Threading refs back out of a list that remounts itself is fragile;
// looking the group up by name and re-resolving when it goes stale is not.

export const GIZMO_MODES = [
    { id: 'translate', label: 'move' },
    { id: 'rotate', label: 'turn' },
    { id: 'scale', label: 'size' }
]

/**
 * What the handles can do for a given target.
 *
 * A point light is a POSITION and nothing else — it has no facing to turn and
 * no size to scale, and its `distance`/`radius` are numbers in the panel, not
 * geometry. Offering turn and size handles on one would be the interface
 * claiming a light has properties it does not have, and every drag of them
 * would silently do nothing.
 */
export const gizmoModesFor = (selectedId) => (
    isLightName(selectedId)
        ? GIZMO_MODES.filter((option) => option.id === 'translate')
        : GIZMO_MODES
)

export default function TransformGizmo({
    selectedId,
    mode: requestedMode,
    onChange,
    onDragStart,
    suppressOrbitRef
}) {
    // Enforced here rather than only in the toolbar: the mode is remembered
    // across selections, so picking a light while "size" was last used would
    // otherwise arrive here as a scale gizmo on something with no scale.
    const mode = isLightName(selectedId) ? 'translate' : requestedMode
    const scene = useThree((state) => state.scene)
    const [target, setTarget] = useState(null)
    const dragging = useRef(false)

    // Selection changed — drop the cached object so the next frame resolves the
    // new one rather than leaving the gizmo on the old sequence.
    useEffect(() => {
        setTarget(null)
    }, [selectedId])

    useFrame(() => {
        if (!selectedId) {
            if (target) setTarget(null)
            return
        }
        // `parent` going null is how an unmounted group announces itself. Cheap
        // to check every frame; the traverse below only runs when it fails.
        if (target && target.parent) return
        const found = scene.getObjectByName(selectedId) ?? null
        if (found !== target) setTarget(found)
    })

    const handleObjectChange = useCallback(() => {
        if (!target) return
        // Uniform scale on purpose. The gizmo offers a handle per axis, but a
        // sequence squashed on one axis is almost always a slip rather than an
        // intent — and for footage it means a stretched face. Averaging the
        // three turns any axis handle into a uniform resize, and the next
        // render writes all three back equal.
        const scale = (target.scale.x + target.scale.y + target.scale.z) / 3

        onChange({
            position: [
                roundPlacement(target.position.x),
                roundPlacement(target.position.y),
                roundPlacement(target.position.z)
            ],
            rotation: [
                roundPlacement(target.rotation.x),
                roundPlacement(target.rotation.y),
                roundPlacement(target.rotation.z)
            ],
            scale: roundPlacement(scale)
        })
    }, [target, onChange])

    // The orbit camera listens on the same canvas. Without this, every drag of
    // a gizmo arrow also swings the whole view.
    const setDragging = useCallback((isDragging) => {
        dragging.current = isDragging
        if (isDragging) {
            if (suppressOrbitRef) suppressOrbitRef.current = true
            // The scale handle reports a factor relative to where the drag
            // began, so the parent has to snapshot the row before the first
            // move lands.
            onDragStart?.()
            return
        }
        // Cleared a frame late, on purpose. The standpoint marker's click fires
        // during the same pointerup that ends this drag, and it reads this flag
        // to know the press was not meant for it. Clearing synchronously loses
        // that race and every drag of a handle over the marker teleports the
        // author inside the piece.
        requestAnimationFrame(() => {
            if (suppressOrbitRef) suppressOrbitRef.current = false
        })
    }, [suppressOrbitRef, onDragStart])

    useEffect(() => () => {
        // A selection change or a view toggle mid-drag would otherwise leave
        // the orbit camera suppressed forever.
        if (dragging.current && suppressOrbitRef) suppressOrbitRef.current = false
    }, [suppressOrbitRef])

    if (!target) return null

    return (
        <TransformControls
            object={target}
            mode={mode}
            // World space, not local: the author is placing things relative to
            // the room and the standpoint, not relative to a sequence's own
            // rotated axes.
            space="world"
            size={0.8}
            onMouseDown={() => setDragging(true)}
            onMouseUp={() => setDragging(false)}
            onObjectChange={handleObjectChange}
        />
    )
}
