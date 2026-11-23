import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { HEAD_LIGHT } from './headLight.js'

const _pos = new THREE.Vector3()
const _dir = new THREE.Vector3()

/**
 * The head light, inside the Canvas: a SpotLight that sits at the camera's world
 * pose every frame, so it is the visitor's view.
 *
 * Attached to the scene itself (not as a child of whatever group this component
 * is mounted in), so its position is a world position. Mount it AFTER the Walker:
 * useFrame callbacks run in mount order, and the Walker moves the camera in its
 * own, so the light would otherwise follow the previous frame's view.
 *
 * `shadow`: the renderer allows shadows (headLightCastsShadow). The light opts out
 * of the room's shadow dressing (`noShadow`, shadowCasting.js) and keeps its own.
 *
 * Headset: not tested. The pose is the app camera's world pose, which the XR
 * session writes at render time, so in a headset the light is expected to follow
 * the head one frame late. There is no key and no on-screen button in immersive
 * mode, so nothing there can switch it on.
 */
export default function HeadLight({ on, shadow }) {
    const camera = useThree((state) => state.camera)
    const scene = useThree((state) => state.scene)

    const light = useMemo(() => {
        const l = new THREE.SpotLight(
            HEAD_LIGHT.color,
            HEAD_LIGHT.intensity,
            HEAD_LIGHT.range,
            THREE.MathUtils.degToRad(HEAD_LIGHT.coneDeg / 2),
            HEAD_LIGHT.penumbra,
            HEAD_LIGHT.decay
        )
        l.name = 'head-light'
        l.visible = false
        l.userData.noShadow = true
        l.shadow.mapSize.set(HEAD_LIGHT.shadowMapSize, HEAD_LIGHT.shadowMapSize)
        l.shadow.bias = -0.0008
        l.shadow.normalBias = 0.02
        l.shadow.camera.near = HEAD_LIGHT.shadowNear
        return l
    }, [])

    useEffect(() => {
        scene.add(light)
        scene.add(light.target)
        return () => {
            scene.remove(light)
            scene.remove(light.target)
            light.dispose()
        }
    }, [scene, light])

    useEffect(() => { light.visible = Boolean(on) }, [light, on])
    useEffect(() => { light.castShadow = Boolean(shadow) }, [light, shadow])

    useFrame(() => {
        camera.getWorldPosition(_pos)
        camera.getWorldDirection(_dir)
        light.position.copy(_pos)
        light.target.position.copy(_pos).addScaledVector(_dir, 1)
        light.target.updateMatrixWorld()
    })

    return null
}
