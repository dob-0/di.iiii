import { useEffect, useState } from 'react'

export function useCameraControls({
    controlsRef,
    isLoading,
    cameraPosition,
    cameraTarget,
    setCameraPosition,
    setCameraTarget
} = {}) {
    const [controlsReady, setControlsReady] = useState(false)

    useEffect(() => {
        if (!controlsRef?.current) return
        const controls = controlsRef.current
        const handleChange = () => {
            const position = controls.object.position.toArray()
            const target = controls.target.toArray()
            setCameraPosition?.(position)
            setCameraTarget?.(target)
        }
        controls.addEventListener('change', handleChange)
        return () => controls.removeEventListener('change', handleChange)
    }, [controlsRef, setCameraPosition, setCameraTarget])

    useEffect(() => {
        let rafId = null
        const checkControls = () => {
            if (controlsRef?.current) {
                setControlsReady(true)
                return
            }
            rafId = requestAnimationFrame(checkControls)
        }
        checkControls()
        return () => {
            if (rafId) cancelAnimationFrame(rafId)
        }
    }, [controlsRef])

    useEffect(() => {
        if (!controlsReady || isLoading || !controlsRef?.current) return
        controlsRef.current.object.position.set(...cameraPosition)
        controlsRef.current.object.updateProjectionMatrix?.()
        controlsRef.current.update()
    }, [controlsReady, isLoading, cameraPosition, controlsRef])

    useEffect(() => {
        if (!controlsReady || isLoading || !controlsRef?.current) return
        controlsRef.current.target.set(...cameraTarget)
        controlsRef.current.update()
    }, [controlsReady, isLoading, cameraTarget, controlsRef])

    useEffect(() => {
        if (!controlsReady || !controlsRef?.current) return
        const controls = controlsRef.current
        const handleControlEnd = () => {
            const position = controls.object.position.toArray()
            const target = controls.target.toArray()
            setCameraPosition?.(position)
            setCameraTarget?.(target)
        }
        controls.addEventListener('end', handleControlEnd)
        return () => {
            controls.removeEventListener('end', handleControlEnd)
        }
    }, [controlsReady, controlsRef, setCameraPosition, setCameraTarget])

    return { controlsReady }
}

export default useCameraControls
