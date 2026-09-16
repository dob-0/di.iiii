import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useDreamValues, useGirl, useHenryClock } from './dreamClock.jsx'
import { GIRL_HEIGHT } from './dual.js'
import { makeBlobGeometry, makeTaperGeometry } from './geometry.js'
import useTinted from './materials/useTinted.js'
import { DREAM, REAL, STRANGE } from './palette.js'

// The girl, and the only thing the visitor controls.
//
// She has no face. That is from the references, not a saving: the figure on
// the giant lip in reference 1 and the girl on the lily in reference 5 are
// both read entirely as silhouette — pale body, dark hair, a posture — and
// giving her features would make the piece about her expression instead of
// about how small she is. The glasses are the exception, and they are the one
// detail that has to be legible from the first second, because the whole
// ending is about taking them off.
//
// She is GIRL_HEIGHT tall and never changes size. See dual.js for why.
//
// The controller lives here rather than in its own file because her animation
// and her movement are the same state — legs swing from `speed`, and there is
// nothing to be gained by making two files agree about it every frame.

const WALK_SPEED = 3.4
const TURN_RATE = 9
const ACCELERATION = 12
const WORLD_RADIUS = 120

const KEY_VECTORS = {
    KeyW: [0, -1],
    ArrowUp: [0, -1],
    KeyS: [0, 1],
    ArrowDown: [0, 1],
    KeyA: [-1, 0],
    ArrowLeft: [-1, 0],
    KeyD: [1, 0],
    ArrowRight: [1, 0]
}

export default function Girl() {
    const values = useDreamValues()
    const girl = useGirl()
    const { beatId } = useHenryClock()

    const rootRef = useRef(null)
    const bodyRef = useRef(null)
    const legRefs = useRef([])
    const armRefs = useRef([])
    const glassesRef = useRef(null)

    const keys = useRef(new Set())
    const velocity = useMemo(() => new THREE.Vector2(0, 0), [])
    const input = useMemo(() => new THREE.Vector2(0, 0), [])

    const geometry = useMemo(
        () => ({
            head: makeBlobGeometry({ radius: 0.115, detail: 2, wobble: 0.04, seed: 61 }),
            hair: makeBlobGeometry({ radius: 0.135, detail: 2, wobble: 0.07, seed: 67 }),
            limb: makeTaperGeometry({ length: 0.42, radius: 0.035, tipRadius: 0.028, bend: 0.05 }),
            dress: makeTaperGeometry({ length: 0.42, radius: 0.075, tipRadius: 0.17, bend: 0 })
        }),
        []
    )

    const skinMaterial = useTinted({ dream: DREAM.cream, strange: STRANGE.cream, real: REAL.skin })
    const dressMaterial = useTinted({ dream: DREAM.cream, strange: STRANGE.cream, real: REAL.dress })
    const hairMaterial = useTinted({ dream: DREAM.deepTeal, strange: STRANGE.deepTeal, real: '#3A3330' })
    const frameMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#2E2A28' }), [])
    const lensMaterial = useMemo(
        () =>
            new THREE.MeshBasicMaterial({
                color: '#CFF0E8',
                transparent: true,
                opacity: 0.35,
                side: THREE.DoubleSide
            }),
        []
    )

    useEffect(() => {
        const down = (event) => {
            if (KEY_VECTORS[event.code]) {
                keys.current.add(event.code)
                event.preventDefault()
            }
        }
        const up = (event) => keys.current.delete(event.code)
        const blur = () => keys.current.clear()
        window.addEventListener('keydown', down)
        window.addEventListener('keyup', up)
        // Without this, alt-tabbing mid-stride leaves a key latched down and
        // she walks off across the garden on her own.
        window.addEventListener('blur', blur)
        return () => {
            window.removeEventListener('keydown', down)
            window.removeEventListener('keyup', up)
            window.removeEventListener('blur', blur)
        }
    }, [])

    // She stops being a player character once the glasses come off: the last
    // twenty-four seconds are hers, not the visitor's.
    const seated = beatId === 'stop' || beatId === 'reveal' || beatId === 'ending'

    useFrame((state, delta) => {
        const root = rootRef.current
        if (!root) return
        const step = Math.min(delta, 0.05)
        const time = state.clock.elapsedTime

        input.set(0, 0)
        if (!seated) {
            for (const code of keys.current) {
                const vector = KEY_VECTORS[code]
                if (vector) input.x += vector[0]
                if (vector) input.y += vector[1]
            }
            if (input.lengthSq() > 1) input.normalize()
        }

        // Rotate the input by the camera's yaw so "forward" is always away
        // from the viewer.
        const yaw = girl.current.cameraYaw
        const targetX = (input.x * Math.cos(yaw) + input.y * Math.sin(yaw)) * WALK_SPEED
        const targetZ = (-input.x * Math.sin(yaw) + input.y * Math.cos(yaw)) * WALK_SPEED

        // Damped rather than instant: at her scale, snapping to full speed
        // looks like a sprite being dragged, and a short ramp is most of what
        // makes a walk read as weight.
        const blend = 1 - Math.exp(-ACCELERATION * step)
        velocity.x += (targetX - velocity.x) * blend
        velocity.y += (targetZ - velocity.y) * blend

        root.position.x += velocity.x * step
        root.position.z += velocity.y * step

        // A soft bound so nobody walks out of the composition into empty sky.
        const distance = Math.hypot(root.position.x, root.position.z)
        if (distance > WORLD_RADIUS) {
            root.position.x *= WORLD_RADIUS / distance
            root.position.z *= WORLD_RADIUS / distance
        }

        const speed = Math.hypot(velocity.x, velocity.y)
        if (speed > 0.05) {
            const facing = Math.atan2(velocity.x, velocity.y)
            // Shortest-arc turn, or she spins the long way round at the
            // -pi/+pi seam every time the visitor reverses.
            let difference = facing - root.rotation.y
            while (difference > Math.PI) difference -= Math.PI * 2
            while (difference < -Math.PI) difference += Math.PI * 2
            root.rotation.y += difference * Math.min(1, TURN_RATE * step)
        }

        // Publish. Everything else in the piece reads her from here.
        girl.current.position.copy(root.position)
        girl.current.facing = root.rotation.y
        girl.current.speed = speed
        girl.current.seated = seated

        // --- animation ---
        const stride = time * 9
        const swing = Math.min(1, speed / WALK_SPEED)
        for (let i = 0; i < legRefs.current.length; i++) {
            const leg = legRefs.current[i]
            if (!leg) continue
            const sign = i === 0 ? 1 : -1
            leg.rotation.x = seated ? -1.35 : Math.sin(stride) * 0.7 * swing * sign
        }
        for (let i = 0; i < armRefs.current.length; i++) {
            const arm = armRefs.current[i]
            if (!arm) continue
            const sign = i === 0 ? -1 : 1
            arm.rotation.x = seated ? -0.5 : Math.sin(stride) * 0.5 * swing * sign
        }
        if (bodyRef.current) {
            // Bob on every second step, and settle down onto the floor when
            // she sits.
            const bob = Math.abs(Math.sin(stride)) * 0.02 * swing
            const sit = seated ? 1 : 0
            bodyRef.current.position.y = THREE.MathUtils.lerp(bodyRef.current.position.y, bob - sit * 0.3, blend)
        }

        // The glasses come off during 'stop' and stay off. `glassesOff` is
        // driven by the gate, not by the beat clock, so the lift is caused by
        // the interaction and the reveal follows it rather than racing it.
        const goal = girl.current.glassesOff
        if (glassesRef.current) {
            const lifted = goal
            glassesRef.current.position.y = 0.02 + lifted * 0.42
            glassesRef.current.position.z = 0.1 + lifted * 0.16
            glassesRef.current.rotation.x = lifted * -0.9
            glassesRef.current.visible = values.current.dream > 0.02 || lifted < 0.98
        }
    })

    return (
        <group ref={rootRef}>
            <group ref={bodyRef}>
                {[0, 1].map((index) => (
                    <group
                        key={index}
                        ref={(node) => {
                            legRefs.current[index] = node
                        }}
                        position={[index === 0 ? 0.06 : -0.06, 0.42, 0]}
                        rotation={[Math.PI, 0, 0]}
                    >
                        <mesh geometry={geometry.limb} material={skinMaterial} />
                    </group>
                ))}

                <mesh
                    geometry={geometry.dress}
                    material={dressMaterial}
                    position={[0, 0.42, 0]}
                    rotation={[Math.PI, 0, 0]}
                />

                {[0, 1].map((index) => (
                    <group
                        key={index}
                        ref={(node) => {
                            armRefs.current[index] = node
                        }}
                        position={[index === 0 ? 0.13 : -0.13, 0.78, 0]}
                        rotation={[Math.PI, 0, index === 0 ? 0.12 : -0.12]}
                    >
                        <mesh geometry={geometry.limb} material={skinMaterial} scale={[0.8, 0.75, 0.8]} />
                    </group>
                ))}

                <group position={[0, 0.94, 0]}>
                    <mesh geometry={geometry.head} material={skinMaterial} scale={[0.92, 1, 0.92]} />
                    {/* the bob: one blob pushed back and down, which is all a
                        haircut is at this scale */}
                    <mesh
                        geometry={geometry.hair}
                        material={hairMaterial}
                        position={[0, 0.025, -0.022]}
                        scale={[0.98, 0.92, 1]}
                    />
                    <mesh geometry={geometry.hair} material={hairMaterial} position={[0, -0.05, -0.06]} scale={[0.92, 0.6, 0.7]} />

                    <group ref={glassesRef} position={[0, 0.02, 0.1]}>
                        {[-1, 1].map((sideSign) => (
                            <group key={sideSign} position={[sideSign * 0.045, 0, 0]}>
                                <mesh material={frameMaterial} rotation={[Math.PI / 2, 0, 0]}>
                                    <torusGeometry args={[0.042, 0.006, 6, 16]} />
                                </mesh>
                                <mesh material={lensMaterial} rotation={[Math.PI / 2, 0, 0]}>
                                    <circleGeometry args={[0.04, 16]} />
                                </mesh>
                            </group>
                        ))}
                        <mesh material={frameMaterial}>
                            <boxGeometry args={[0.03, 0.006, 0.006]} />
                        </mesh>
                    </group>
                </group>
            </group>
        </group>
    )
}

export { GIRL_HEIGHT }
