import { useEffect, useSyncExternalStore } from 'react'
import { useThree } from '@react-three/fiber'
import { getLookFov, subscribeLookSettings } from './lookSettings.js'

// Applies the viewer's walk-mode field of view (Look panel, lookSettings.js)
// to the scene camera while walking, and puts the camera's own value back when
// walking ends — view mode and authored cameras keep theirs. Outside the
// Walker's frame loop on purpose: FOV changes only when the setting does.
export default function LookFov() {
    const camera = useThree((state) => state.camera)
    const fov = useSyncExternalStore(subscribeLookSettings, getLookFov, getLookFov)

    useEffect(() => {
        if (!camera?.isPerspectiveCamera) return undefined
        const before = camera.fov
        return () => {
            camera.fov = before
            camera.updateProjectionMatrix()
        }
    }, [camera])

    useEffect(() => {
        if (!camera?.isPerspectiveCamera || camera.fov === fov) return
        camera.fov = fov
        camera.updateProjectionMatrix()
    }, [camera, fov])

    return null
}
