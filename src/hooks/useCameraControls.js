import { useEffect, useState } from 'react'

export function useCameraControls({
    controlsRef,
    isLoading,
    cameraSettings,
    cameraPosition,
    cameraTarget,
    setCameraPosition,
    setCameraTarget,
    captureCameraChanges = true
} = {}) {
    const [controlsReady, setControlsReady] = useState(false)

    useEffect(() => {
        if (!controlsRef?.current || !captureCameraChanges) return
        const controls = controlsRef.current
        const handleChange = () => {
            const position = controls.object.position.toArray()
            const target = controls.target.toArray()
            setCameraPosition?.(position)
            setCameraTarget?.(target)
        }
        controls.addEventListener('change', handleChange)
        return () => controls.removeEventListener('change', handleChange)
    }, [captureCameraChanges, controlsRef, setCameraPosition, setCameraTarget])

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
        const camera = controlsRef.current.object
        camera.position.set(...cameraPosition)
        if (Number.isFinite(cameraSettings?.fov) && 'fov' in camera) {
            camera.fov = cameraSettings.fov
        }
        if (Number.isFinite(cameraSettings?.zoom) && 'zoom' in camera) {
            camera.zoom = cameraSettings.zoom
        }
        if (Number.isFinite(cameraSettings?.near)) {
            camera.near = cameraSettings.near
        }
        if (Number.isFinite(cameraSettings?.far)) {
            camera.far = cameraSettings.far
        }
        camera.updateProjectionMatrix?.()
        controlsRef.current.update()
    }, [cameraPosition, cameraSettings, controlsReady, controlsRef, isLoading])

    useEffect(() => {
        if (!controlsReady || isLoading || !controlsRef?.current) return
        controlsRef.current.target.set(...cameraTarget)
        controlsRef.current.update()
    }, [controlsReady, isLoading, cameraTarget, controlsRef])

    useEffect(() => {
        if (!controlsReady || !controlsRef?.current || !captureCameraChanges) return
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
    }, [captureCameraChanges, controlsReady, controlsRef, setCameraPosition, setCameraTarget])

    return { controlsReady }
}

export default useCameraControls
