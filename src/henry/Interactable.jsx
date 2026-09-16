import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGirl, useHenryClock } from './dreamClock.jsx'

// The entire interaction system.
//
// Proximity, one key, no UI. Walk close enough and a ring breathes on the
// ground; press anything reasonable and the beat happens. There is no prompt
// text, no button glyph and no tutorial, because the references have no
// interface in them and a floating "Press E" would be the single most
// destructive object in the scene.
//
// The ring IS the prompt. It only appears during the beat it belongs to, so at
// any moment there is exactly one thing in the world doing this, and doing it
// slowly enough to read as part of the dream rather than as a game affordance.
//
// A trigger fires once. Re-triggering would let a visitor brush the bear's
// teeth eleven times, which is funny for about four seconds and then makes the
// piece feel like a toy.

const TRIGGER_KEYS = new Set(['KeyE', 'Space', 'Enter'])

export default function Interactable({
    position = [0, 0, 0],
    radius = 4,
    gate,
    beat,
    onTrigger,
    // Arriving IS the interaction. Used for "she reaches the tree", where
    // asking the visitor to press a key to have walked somewhere would be
    // asking them to confirm the thing they just did.
    auto = false,
    ringColor = '#F7F0E4'
}) {
    const girl = useGirl()
    const { beatId, fireGate } = useHenryClock()
    const ringRef = useRef(null)
    const armed = useRef(false)
    const fired = useRef(false)
    const centre = useMemo(() => new THREE.Vector3(...position), [position])

    const material = useMemo(
        () =>
            new THREE.MeshBasicMaterial({
                color: ringColor,
                transparent: true,
                opacity: 0,
                depthWrite: false,
                side: THREE.DoubleSide
            }),
        [ringColor]
    )

    const trigger = useMemo(
        () => () => {
            if (!armed.current || fired.current) return
            fired.current = true
            fireGate(gate)
            onTrigger?.()
        },
        [fireGate, gate, onTrigger]
    )

    useEffect(() => {
        const onKey = (event) => {
            if (!TRIGGER_KEYS.has(event.code)) return
            // Only swallow the key when it is actually going to do something,
            // so Space still scrolls a page that has the canvas embedded.
            if (!armed.current || fired.current) return
            event.preventDefault()
            trigger()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [trigger])

    useFrame((state) => {
        // Arming happens before the ring is looked at, because an auto trigger
        // renders no ring at all and would otherwise never arm.
        const active = beatId === beat && !fired.current
        const distance = girl.current.position.distanceTo(centre)
        armed.current = active && distance < radius

        if (auto) {
            if (armed.current) trigger()
            return
        }

        const ring = ringRef.current
        if (!ring) return

        // Fade in over the outer third of the radius rather than popping on at
        // the boundary — a ring that appears at a hard edge tells you exactly
        // where the trigger volume is, and the illusion goes with it.
        const nearness = active ? THREE.MathUtils.clamp(1 - (distance - radius * 0.6) / (radius * 0.4), 0, 1) : 0
        const pulse = 0.55 + Math.sin(state.clock.elapsedTime * 2.1) * 0.2
        material.opacity = nearness * pulse * 0.5
        ring.visible = material.opacity > 0.004
        ring.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 2.1) * 0.03)
    })

    // An auto trigger has no ring: there is nothing to prompt.
    const showsRing = !auto

    useEffect(() => () => material.dispose(), [material])

    if (!showsRing) return null

    return (
        <group position={position}>
            <mesh
                ref={ringRef}
                material={material}
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, 0.03, 0]}
                onClick={trigger}
                visible={false}
            >
                <ringGeometry args={[radius * 0.62, radius * 0.72, 48]} />
            </mesh>
        </group>
    )
}
