import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// The sparkle the brief asks for at the end of the brushing.
//
// Four-pointed stars, not round dots. Reference 2 draws its highlights as
// little crossed stars — in the tiger's eyes, on the clean teeth — and that
// shape is doing a specific job: a round particle reads as dust or bokeh, a
// star reads as *drawn*, which keeps the effect inside the illustration rather
// than on top of it. An octahedron viewed head-on is a four-pointed star for
// free, so there is no sprite, no texture and no billboarding to get wrong.
//
// Driven by an external progress ref (0..1, one shot). The emitter owns
// nothing about when it happens — the interaction does — so the same component
// can be reused anywhere later without inheriting the bear's timing.

const COUNT = 34

export default function Sparkles({ progressRef, radius = 0.3, color = '#FFFFFF', ...props }) {
    const meshRef = useRef(null)

    const seeds = useMemo(
        () =>
            Array.from({ length: COUNT }, (_, index) => {
                // Deterministic spherical scatter, biased upward: sparkle
                // falling downward looks like debris.
                const angle = index * 2.399963
                const height = 0.15 + (index / COUNT) * 0.85
                const ring = Math.sqrt(1 - height * height)
                return {
                    direction: new THREE.Vector3(Math.cos(angle) * ring, height, Math.sin(angle) * ring),
                    delay: (index % 7) / 7,
                    spin: 1 + (index % 5) * 0.4,
                    size: 0.5 + ((index * 37) % 10) / 10
                }
            }),
        []
    )

    const material = useMemo(
        () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false }),
        [color]
    )

    const matrix = useMemo(() => new THREE.Matrix4(), [])
    const quaternion = useMemo(() => new THREE.Quaternion(), [])
    const euler = useMemo(() => new THREE.Euler(), [])
    const position = useMemo(() => new THREE.Vector3(), [])
    const scaleVector = useMemo(() => new THREE.Vector3(), [])

    useFrame((state) => {
        const mesh = meshRef.current
        if (!mesh) return
        const progress = progressRef?.current ?? 0
        mesh.visible = progress > 0.001 && progress < 0.999
        if (!mesh.visible) return

        const time = state.clock.elapsedTime
        for (let i = 0; i < seeds.length; i++) {
            const seed = seeds[i]
            // Each star has its own start, so the burst arrives as a shower
            // rather than as a single expanding shell.
            const local = THREE.MathUtils.clamp((progress - seed.delay * 0.35) / 0.65, 0, 1)
            const travel = Math.sqrt(local) * radius
            // Grow fast, shrink slow, gone by the end.
            const life = Math.sin(local * Math.PI)
            position.copy(seed.direction).multiplyScalar(travel)
            euler.set(time * seed.spin, time * seed.spin * 0.7, 0)
            quaternion.setFromEuler(euler)
            scaleVector.setScalar(radius * 0.09 * seed.size * life)
            matrix.compose(position, quaternion, scaleVector)
            mesh.setMatrixAt(i, matrix)
        }
        mesh.instanceMatrix.needsUpdate = true
        material.opacity = Math.sin(progress * Math.PI)
    })

    useEffect(() => () => material.dispose(), [material])

    return (
        <group {...props}>
            <instancedMesh ref={meshRef} args={[undefined, material, COUNT]} frustumCulled={false} visible={false}>
                <octahedronGeometry args={[1, 0]} />
            </instancedMesh>
        </group>
    )
}
