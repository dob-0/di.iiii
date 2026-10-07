import { useEffect, useMemo } from 'react'
import { PMREMGenerator } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { useThree } from '@react-three/fiber'
import { environmentIntensityFor, useViewLook } from './viewLook.js'

// The Form look's dim environment fill (viewLook.js). In the Current look it draws nothing and touches nothing.
// A room with its own authored environment (WorldEnvironment) keeps it: `skip`.
export default function FormLight({ skip = false }) {
    const { gl, scene } = useThree()
    const { look, light } = useViewLook()
    const intensity = environmentIntensityFor(look, light)
    const active = !skip && intensity > 0
    // built once, only when the Form look is first on: a neutral studio, blurred (sigma 0.04, three.js's own example value)
    const texture = useMemo(() => {
        if (!active) return null
        const pmrem = new PMREMGenerator(gl)
        const target = pmrem.fromScene(new RoomEnvironment(), 0.04)
        pmrem.dispose()
        return target.texture
    }, [gl, active])
    useEffect(() => {
        if (!texture) return undefined
        const previous = { environment: scene.environment, intensity: scene.environmentIntensity }
        scene.environment = texture
        scene.environmentIntensity = intensity
        return () => {
            scene.environment = previous.environment
            scene.environmentIntensity = previous.intensity
        }
    }, [scene, texture, intensity])
    useEffect(() => () => texture?.dispose?.(), [texture])
    return null
}
