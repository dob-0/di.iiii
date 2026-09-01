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
// Coplanar transparent planes z-fight. A few millimetres of separation per
// piece costs nothing and stops two overlapping pages flickering through each
// other as the walker moves.
const STACK_STEP = 0.004
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

const _axis = new THREE.Vector3()

// Deterministic scatter. `Math.random()` during render is impure — React's
// lint says so and it is right: a re-render would deal every piece a new
// tumble mid-fall. Seeding from the piece's own index gives the same varied
// throw every time, which also means the fall can be looked at twice and
// compared.
// A real integer hash, not `sin` of a nearly-linear input: the sine trick is
// only well distributed over large or irregular inputs, and for eight
// consecutive indices with one salt it returned the SAME SIGN seven times —
// so every centred page fell to the same side of the room. Measured, then
// replaced.
const hash = (n) => {
    let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
    h ^= h >>> 13
    h = Math.imul(h, 0xc2b2ae35)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
}

const jitter = (seed, salt) => hash(seed * 977 + salt * 131) - 0.5

// Everything leaves the page in the direction the eye is going: forward, with
// the outer pieces carrying the sideways drift they already had. Nothing is
// thrown at the visitor — a piece that flies at the face is the one thing that
// reads as a fault rather than a transition.
const initialVelocity = (piece, forward, right, seed) => {
    // The piece's own offset from the eye, with the FORWARD part removed —
    // otherwise "sideways" is dominated by how far away the piece is and every
    // page is thrown straight down the middle. Measured: every piece came to
    // rest at x = 0 before this line existed.
    const offset = piece.position.clone().sub(piece.origin)
    offset.addScaledVector(forward, -offset.dot(forward))
    offset.y = 0
    // Centred elements — the wordmark, the line, the button — have no side to
    // drift to, and every one of them fell to the same side of the room on the
    // fallback. Alternating the sign scatters them left and right instead.
    const side = jitter(seed, 8) > 0 ? 1 : -1
    // The sign is applied ONCE, on the scale below. Putting it on this vector
    // too squared it, so every centred piece went the same way again.
    const sideways = offset.lengthSq() > 1e-4 ? offset.normalize() : right.clone()

    // Depth is already spread by where each piece hangs, so the throw only has
    // to carry it a little further out and apart.
    return forward.clone().multiplyScalar(1.5 + jitter(seed, 1) * 1.1)
        .addScaledVector(sideways, (1.8 + jitter(seed, 2) * 1.6) * side)
        .add(new THREE.Vector3(0, 1.0 + jitter(seed, 3) * 0.6, 0))
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
                // Each page lies at its own angle. One shared resting pose put
                // every piece down in the same direction, which reads as a
                // printed pattern rather than as paper that fell.
                rest: new THREE.Quaternion()
                    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), jitter(index, 7) * Math.PI * 1.4)
                    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)),
                restY: FLOOR_Y + index * STACK_STEP,
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

    // Dev-only observability, the same shape as the walker's `__diiWalkerRef`:
    // where a page actually comes to rest is a number, and tuning a throw by
    // squinting at screenshots is how it ended up flung past the doors.
    if (import.meta.env.DEV && typeof window !== 'undefined') window.__diiPageDebris = bodies

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

                if (body.position.y <= body.restY) {
                    body.position.y = body.restY
                    body.velocity.y *= -LANDING_KEEP
                    body.velocity.x *= Math.max(0, 1 - FLOOR_FRICTION * delta)
                    body.velocity.z *= Math.max(0, 1 - FLOOR_FRICTION * delta)
                    body.spin.multiplyScalar(Math.max(0, 1 - FLOOR_FRICTION * delta))

                    // Lie flat, face up, at its own angle — the pose every page
                    // on this floor is already in.
                    body.quaternion.slerp(body.rest, Math.min(1, FLATTEN_RATE * delta))

                    if (body.velocity.lengthSq() < SETTLE_SPEED * SETTLE_SPEED
                        && body.quaternion.angleTo(body.rest) < 0.02) {
                        body.resting = true
                        body.quaternion.copy(body.rest)
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
