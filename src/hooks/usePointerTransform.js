import { useEffect } from 'react'

export function usePointerTransform({ axisConstraint, freeTransformRef, applyFreeTransformDelta }) {
    useEffect(() => {
        const handlePointerMove = (event) => {
            const { mode, axis } = freeTransformRef.current
            if (!mode || !axis || axisConstraint !== axis) return
            const sensitivity = event.shiftKey ? 0.002 : 0.02
            const delta = ((event.movementX || 0) + (event.movementY || 0)) * sensitivity
            if (delta === 0) return
            applyFreeTransformDelta(mode, axis, delta)
        }
        window.addEventListener('pointermove', handlePointerMove)
        return () => window.removeEventListener('pointermove', handlePointerMove)
    }, [applyFreeTransformDelta, axisConstraint, freeTransformRef])
}

export default usePointerTransform
