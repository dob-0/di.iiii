import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// The page, falling.
//
// Once a piece is a mesh in the room's own scene it is subject to the room:
// the doors pass in front of the ones behind them, the fog takes the far ones,
// and the floor stops them. That is the whole reason for leaving CSS3D behind
// — a DOM layer can do none of it.
//
// The physics is deliberately small and hand-written. A real engine is ~500KB
// on the one page whose load time is already on the defect list, and this
// needs three things an engine would give in exchange for that: weight, a
// floor, and rest. Anything that bounces or jitters would read as debris in a
// game; these are pages, and pages land flat and stay.

const GRAVITY = -9.8
const FLOOR_Y = 0.03
// A page does not bounce. It meets the floor, gives up, and lies there — so
// the vertical speed is killed rather than reflected, and what remains is a
// short slide that friction eats.
const LANDING_KEEP = 0.0
const FLOOR_FRICTION = 3.2
const AIR_DRAG = 0.35
const SETTLE_SPEED = 0.05
// How fast a landed page turns to lie flat. Slow enough to be seen, fast
// enough that nothing is still turning by the time a visitor looks at it.
const FLATTEN_RATE = 3.5

const _flat = new THREE.Quaternion()
const _axis = new THREE.Vector3()

// Deterministic scatter. `Math.random()` during render is impure — React's
// lint says so and it is right: a re-render would deal every piece a new
// tumble mid-fall. Seeding from the piece's own index gives the same varied
// throw every time, which also means the fall can be looked at twice and
// compared.
const jitter = (seed, salt) => {
    const x = Math.sin((seed + 1) * 127.1 + salt * 311.7) * 43758.5453
    return (x - Math.floor(x)) - 0.5
}

// Everything leaves the page in the direction the eye is going: forward, with
// the outer pieces carrying the sideways drift they already had. Nothing is
// thrown at the visitor — a piece that flies at the face is the one thing that
// reads as a fault rather than a transition.
const initialVelocity = (piece, forward, right, seed) => {
    const lateral = piece.position.clone().sub(piece.origin).setY(0)
    const sideways = lateral.lengthSq() > 1e-6 ? lateral.normalize() : right.clone()
    return forward.clone().multiplyScalar(2.05 + jitter(seed, 1) * 0.9)
        .addScaledVector(sideways, 0.9 + jitter(seed, 2) * 0.8)
        .add(new THREE.Vector3(0, 0.85 + jitter(seed, 3) * 0.5, 0))
}

export default function PageDebris({ pieces, cameraPose }) {
    const groupRef = useRef(null)
    const bodies = useMemo(() => {
        const from = new THREE.Vector3(...(cameraPose?.position || [0, 0, 0]))
        const to = new THREE.Vector3(...(cameraPose?.target || [0, 0, -1]))
        const forward = to.clone().sub(from).setY(0).normalize()
        const right = forward.clone().cross(new THREE.Vector3(0, 1, 0)).normalize()

        return pieces.map((piece, index) => {
            const seeded = { ...piece, origin: from }
            return {
                piece,
                position: piece.position.clone(),
                quaternion: piece.quaternion.clone(),
                velocity: initialVelocity(seeded, forward, right, index),
                spin: new THREE.Vector3(
                    jitter(index, 4) * 1.6,
                    jitter(index, 5) * 1.2,
                    jitter(index, 6) * 1.6
                ),
                // A page lands face up. The quaternion it settles into is the
                // same one the floor images already wear, so a fallen piece
                // reads as one more page on the floor and not as litter.
                resting: false
            }
        })
    }, [pieces, cameraPose])

    useFrame((state, rawDelta) => {
        const group = groupRef.current
        if (!group) return
        // A tab that was backgrounded hands back a delta of several seconds,
        // which would teleport every piece through the floor on one frame.
        const delta = Math.min(rawDelta, 1 / 20)

        bodies.forEach((body, index) => {
            const mesh = group.children[index]
            if (!mesh) return

            if (!body.resting) {
                body.velocity.y += GRAVITY * delta
                body.velocity.multiplyScalar(1 - Math.min(1, AIR_DRAG * delta))
                body.position.addScaledVector(body.velocity, delta)

                if (body.position.y <= FLOOR_Y) {
                    body.position.y = FLOOR_Y
                    body.velocity.y *= -LANDING_KEEP
                    body.velocity.x *= Math.max(0, 1 - FLOOR_FRICTION * delta)
                    body.velocity.z *= Math.max(0, 1 - FLOOR_FRICTION * delta)
                    body.spin.multiplyScalar(Math.max(0, 1 - FLOOR_FRICTION * delta))

                    // Lie flat, face up — the pose every page on this floor is
                    // already in.
                    _flat.setFromAxisAngle(_axis.set(1, 0, 0), -Math.PI / 2)
                    body.quaternion.slerp(_flat, Math.min(1, FLATTEN_RATE * delta))

                    if (body.velocity.lengthSq() < SETTLE_SPEED * SETTLE_SPEED
                        && body.quaternion.angleTo(_flat) < 0.02) {
                        body.resting = true
                        body.quaternion.copy(_flat)
                    }
                } else if (body.spin.lengthSq() > 1e-6) {
                    const angle = body.spin.length() * delta
                    _axis.copy(body.spin).normalize()
                    body.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(_axis, angle))
                }
            }

            mesh.position.copy(body.position)
            mesh.quaternion.copy(body.quaternion)
        })
    })

    return (
        <group ref={groupRef}>
            {bodies.map(({ piece }) => (
                <mesh key={piece.id} position={piece.position} quaternion={piece.quaternion}>
                    <planeGeometry args={[piece.width, piece.height]} />
                    <meshBasicMaterial
                        map={piece.texture}
                        transparent
                        side={THREE.DoubleSide}
                        depthWrite={false}
                        toneMapped={false}
                    />
                </mesh>
            ))}
        </group>
    )
}
