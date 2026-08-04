import { useCallback, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { STANDPOINT } from './stageView.js'

// The standpoint marker — visible only from the outside view.
//
// It answers the one question the outside view otherwise cannot: where will my
// head actually be? A ring on the floor is where you stand, the floating ring
// at 1.6m is where the headset hangs, and the stub pointing at -Z is the
// direction you face on the first frame.
//
// Click it to drop inside. That is the whole interaction: the marker IS the
// button, so there is nothing to find in a corner of the screen.
//
// WHY IT IS AUTHOR-ONLY: the piece's rule is that a visitor sees no interface
// and no apparatus. A marker showing the machinery of the installation is the
// opposite of that, so it never mounts outside the director view.

const RING_COLOR = '#4df9ff'
// Cyan, not white. The opening sequence is a near-white tunnel and a white
// wireframe head against it is simply not there.
const HEAD_COLOR = '#4df9ff'

// Where the head goes, measured from the floor ring.
const HEAD_HEIGHT = STANDPOINT.y

// Radius of the floor ring — roughly a person's footprint plus room to turn.
const FOOT_RADIUS = 0.42
const HEAD_RADIUS = 0.13

export default function Standpoint({ onEnter, dragRef, suppressRef, travel }) {
    const hovered = useRef(false)
    const headRef = useRef(null)
    const footRef = useRef(null)

    useFrame(({ clock }) => {
        // A slow breath so the marker reads as live UI rather than scene
        // geometry the author might mistake for part of the piece.
        const pulse = 0.75 + Math.sin(clock.getElapsedTime() * 2) * 0.25
        const opacity = hovered.current ? 1 : pulse
        if (headRef.current) headRef.current.material.opacity = opacity
        if (footRef.current) footRef.current.material.opacity = opacity * 0.8
    })

    // Two stable handlers rather than a setHover(bool) factory: a factory is
    // *called* during render, which trips the refs lint even though only the
    // closure it returns touches the ref.
    const handlePointerOver = useCallback((event) => {
        event.stopPropagation()
        hovered.current = true
        document.body.style.cursor = 'pointer'
    }, [])

    const handlePointerOut = useCallback((event) => {
        event.stopPropagation()
        hovered.current = false
        document.body.style.cursor = ''
    }, [])

    const handleClick = (event) => {
        event.stopPropagation()
        // The outside camera orbits on the same pointer drag that would land
        // here on release. Without this check, every orbit that happens to
        // finish over the marker teleports the author inside — see OrbitView,
        // which owns the flag and clears it on each fresh press.
        if (dragRef?.current?.moved) return
        // Same problem from the other direction: a drag on a transform handle
        // suppresses OrbitView, so `dragRef` is never updated and the release
        // looks like a fresh click. TransformGizmo holds this flag one frame
        // past the end of its drag precisely so this check can see it.
        if (suppressRef?.current) return
        document.body.style.cursor = ''
        onEnter()
    }

    return (
        <group
            // Follows the passive travel offset. A marker pinned to the
            // origin while the viewer is carried away from it would be
            // actively lying about where the head ends up.
            position={[
                STANDPOINT.x + (travel?.[0] ?? 0),
                travel?.[1] ?? 0,
                STANDPOINT.z + (travel?.[2] ?? 0)
            ]}
            onClick={handleClick}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
        >
            {/* Floor ring — where you stand. Laid flat, so rotated off the
                default vertical plane a ring geometry is born in. */}
            <mesh ref={footRef} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[FOOT_RADIUS, FOOT_RADIUS + 0.035, 48]} />
                <meshBasicMaterial color={RING_COLOR} transparent opacity={0.8} depthWrite={false} depthTest={false} />
            </mesh>

            {/* Head marker — where the headset hangs. */}
            <mesh ref={headRef} position={[0, HEAD_HEIGHT, 0]}>
                <sphereGeometry args={[HEAD_RADIUS, 20, 14]} />
                <meshBasicMaterial
                    color={HEAD_COLOR}
                    transparent
                    opacity={0.9}
                    wireframe
                    depthWrite={false}
                    // Always drawn on top. The marker is a tool, not scenery —
                    // buried inside the tunnel geometry it is useless.
                    depthTest={false}
                />
            </mesh>

            {/* The mast joining the two, so the floating head reads as attached
                to the floor position rather than hovering somewhere vague. */}
            <mesh position={[0, HEAD_HEIGHT / 2, 0]}>
                <cylinderGeometry args={[0.006, 0.006, HEAD_HEIGHT, 6]} />
                <meshBasicMaterial color={RING_COLOR} transparent opacity={0.35} depthWrite={false} depthTest={false} />
            </mesh>

            {/* Facing stub: -Z is forward, matching the camera's default
                rotation. Tells the author which way the viewer is looking
                before they commit a sequence to that direction. */}
            <mesh position={[0, 0.01, -(FOOT_RADIUS + 0.22)]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[0.07, 0.34]} />
                <meshBasicMaterial color={RING_COLOR} transparent opacity={0.7} depthWrite={false} depthTest={false} />
            </mesh>

            {/* Invisible click target. The rings and stub are thin geometry that
                is genuinely hard to hit with a pointer; this gives the marker a
                body-sized hitbox without drawing one. */}
            <mesh position={[0, HEAD_HEIGHT / 2, 0]} visible={false}>
                <cylinderGeometry args={[FOOT_RADIUS, FOOT_RADIUS, HEAD_HEIGHT + 0.3, 8]} />
            </mesh>
        </group>
    )
}
