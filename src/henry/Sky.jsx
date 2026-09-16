import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useDreamValues } from './dreamClock.jsx'
import { SKY } from './palette.js'

// Reference 1 is a mint face against a flat field of hot pink, and the pink is
// not an accent — it is the ground the whole image sits on. So the sky here is
// a colour the piece is played *inside*, and it carries as much of the mood as
// the objects do.
//
// A shader on a back-side sphere rather than a texture: the gradient has to
// re-mix between three palettes every frame during the reveal, and swapping
// generated textures at 60fps would be absurd for what is two colours and a
// smoothstep.

const VERTEX = /* glsl */ `
    varying vec3 vWorld;
    void main() {
        vWorld = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`

const FRAGMENT = /* glsl */ `
    uniform vec3 uTop;
    uniform vec3 uBottom;
    varying vec3 vWorld;

    void main() {
        // Normalised height up the sphere, eased so the horizon band is wide
        // and soft — a linear ramp puts the colour change at eye level, where
        // it reads as a seam rather than as weather.
        float h = normalize(vWorld).y * 0.5 + 0.5;
        h = smoothstep(0.08, 0.92, h);
        gl_FragColor = vec4(mix(uBottom, uTop, h), 1.0);
        #include <colorspace_fragment>
    }
`

export default function Sky() {
    const values = useDreamValues()

    const palette = useMemo(
        () => ({
            dreamTop: new THREE.Color(SKY.dream.top),
            dreamBottom: new THREE.Color(SKY.dream.bottom),
            strangeTop: new THREE.Color(SKY.strange.top),
            strangeBottom: new THREE.Color(SKY.strange.bottom),
            realTop: new THREE.Color(SKY.real.top),
            realBottom: new THREE.Color(SKY.real.bottom)
        }),
        []
    )

    const material = useMemo(
        () =>
            new THREE.ShaderMaterial({
                vertexShader: VERTEX,
                fragmentShader: FRAGMENT,
                side: THREE.BackSide,
                depthWrite: false,
                fog: false,
                uniforms: {
                    uTop: { value: new THREE.Color(SKY.dream.top) },
                    uBottom: { value: new THREE.Color(SKY.dream.bottom) }
                }
            }),
        []
    )

    const scratch = useRef(new THREE.Color())

    useFrame(() => {
        const { dream, strange } = values.current
        const top = material.uniforms.uTop.value
        const bottom = material.uniforms.uBottom.value

        scratch.current.copy(palette.dreamTop).lerp(palette.strangeTop, strange)
        top.copy(palette.realTop).lerp(scratch.current, dream)

        scratch.current.copy(palette.dreamBottom).lerp(palette.strangeBottom, strange)
        bottom.copy(palette.realBottom).lerp(scratch.current, dream)
    })

    useEffect(() => () => material.dispose(), [material])

    // Radius sits inside the camera's far plane so the sphere is never clipped
    // by the reveal's long pull-back.
    return (
        <mesh material={material} frustumCulled={false} renderOrder={-1000}>
            <sphereGeometry args={[320, 24, 16]} />
        </mesh>
    )
}
