import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useDreamValues } from '../dreamClock.jsx'
import { makeTaperGeometry } from '../geometry.js'
import { toonRamp } from '../materials/toon.js'
import { DREAM, REAL, STRANGE } from '../palette.js'

// The garden she walks through: everything that is scenery rather than a
// character.
//
// Every reference that shows ground shows it FULL — reference 3 and reference
// 4 have no bare earth anywhere, the whole surface is packed with overlapping
// stems and heads all the way to the edge of the frame. So the count here is
// high and the geometry per item is tiny, which is the opposite of the usual
// trade and the only way to get that density at sixty frames.
//
// Two instanced meshes carry the entire field. Colour varies per instance from
// the palette rather than per material, so a thousand objects still cost two
// draw calls.
//
// The field belongs to the dream. It shrinks away with everything else at the
// reveal and leaves the floor of the room behind it — which is why the ground
// disc it stands on is NOT part of this component.

const BLADE_COUNT = 520
const BLOSSOM_COUNT = 180
const FIELD_RADIUS = 105
const CLEARING_RADIUS = 5

const BLOSSOM_HUES = ['blush', 'rose', 'hotPink', 'amber', 'acidGreen', 'cream']

// Deterministic scatter. A random layout that changes per reload would move
// the composition out from under the beats, which are framed against it.
const scatter = (count, seed) => {
    const items = []
    let value = seed
    const next = () => {
        value = (value * 1664525 + 1013904223) % 4294967296
        return value / 4294967296
    }
    for (let i = 0; i < count; i++) {
        // Square-rooted radius, or everything piles up in the middle.
        const radius = CLEARING_RADIUS + Math.sqrt(next()) * (FIELD_RADIUS - CLEARING_RADIUS)
        const angle = next() * Math.PI * 2
        items.push({
            x: Math.cos(angle) * radius,
            z: Math.sin(angle) * radius,
            scale: 0.55 + next() * 0.9,
            lean: (next() - 0.5) * 0.5,
            phase: next() * Math.PI * 2,
            hue: Math.floor(next() * BLOSSOM_HUES.length)
        })
    }
    return items
}

export default function GardenField() {
    const values = useDreamValues()
    const bladeRef = useRef(null)
    const blossomRef = useRef(null)

    const blades = useMemo(() => scatter(BLADE_COUNT, 9781), [])
    const blossoms = useMemo(() => scatter(BLOSSOM_COUNT, 20461), [])

    const bladeGeometry = useMemo(
        () => makeTaperGeometry({ length: 3.2, radius: 0.16, tipRadius: 0.01, bend: 0.55, uSegments: 5, vSegments: 4 }),
        []
    )

    const bladeMaterial = useMemo(
        () => new THREE.MeshToonMaterial({ gradientMap: toonRamp(), vertexColors: true }),
        []
    )
    const blossomMaterial = useMemo(
        () => new THREE.MeshToonMaterial({ gradientMap: toonRamp(), vertexColors: true }),
        []
    )

    const palettes = useMemo(() => {
        const build = (source, keys) => keys.map((key) => new THREE.Color(source[key]))
        return {
            bladeDream: build(DREAM, ['seafoam', 'teal', 'acidGreen', 'mint']),
            bladeStrange: build(STRANGE, ['seafoam', 'teal', 'acidGreen', 'mint']),
            bladeReal: build(REAL, ['leaf', 'leaf', 'leaf', 'leaf']),
            blossomDream: build(DREAM, BLOSSOM_HUES),
            blossomStrange: build(STRANGE, BLOSSOM_HUES),
            blossomReal: build(REAL, BLOSSOM_HUES.map(() => 'leaf'))
        }
    }, [])

    const matrix = useMemo(() => new THREE.Matrix4(), [])
    const quaternion = useMemo(() => new THREE.Quaternion(), [])
    const euler = useMemo(() => new THREE.Euler(), [])
    const position = useMemo(() => new THREE.Vector3(), [])
    const scaleVector = useMemo(() => new THREE.Vector3(), [])
    const colorA = useMemo(() => new THREE.Color(), [])
    const colorB = useMemo(() => new THREE.Color(), [])

    // Colours are written once per frame per instance only while they are
    // actually changing. Outside the two transitions this is a no-op, which
    // matters: 700 setColorAt calls a frame for a colour that is not moving is
    // the kind of cost that only shows up on somebody else's laptop.
    const lastTint = useRef({ dream: -1, strange: -1 })

    useEffect(() => {
        const applyColors = (mesh, items, dreamSet, strangeSet, realSet, dream, strange) => {
            if (!mesh) return
            for (let i = 0; i < items.length; i++) {
                const index = items[i].hue % dreamSet.length
                colorA.copy(dreamSet[index]).lerp(strangeSet[index], strange)
                colorB.copy(realSet[index]).lerp(colorA, dream)
                mesh.setColorAt(i, colorB)
            }
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
        }
        applyColors(bladeRef.current, blades, palettes.bladeDream, palettes.bladeStrange, palettes.bladeReal, 1, 0)
        applyColors(blossomRef.current, blossoms, palettes.blossomDream, palettes.blossomStrange, palettes.blossomReal, 1, 0)
    }, [blades, blossoms, palettes, colorA, colorB])

    useFrame((state) => {
        const time = state.clock.elapsedTime
        const { dream, strange } = values.current
        const blade = bladeRef.current
        const blossom = blossomRef.current
        if (!blade || !blossom) return

        const shrink = Math.pow(Math.max(0, dream), 1.4)
        blade.visible = shrink > 0.002
        blossom.visible = shrink > 0.002
        if (!blade.visible) return

        for (let i = 0; i < blades.length; i++) {
            const item = blades[i]
            const smooth = Math.sin(time * 0.7 + item.phase)
            const stepped = Math.round(smooth * 3) / 3
            const sway = THREE.MathUtils.lerp(smooth, stepped, strange) * 0.13
            position.set(item.x * shrink, 0, item.z * shrink)
            euler.set(sway, item.phase, item.lean + sway)
            quaternion.setFromEuler(euler)
            scaleVector.setScalar(item.scale * shrink)
            matrix.compose(position, quaternion, scaleVector)
            blade.setMatrixAt(i, matrix)
        }
        blade.instanceMatrix.needsUpdate = true

        for (let i = 0; i < blossoms.length; i++) {
            const item = blossoms[i]
            const bob = Math.sin(time * 0.9 + item.phase) * 0.12
            position.set(item.x * shrink, (1.5 + bob) * item.scale * shrink, item.z * shrink)
            euler.set(0, time * 0.1 + item.phase, item.lean)
            quaternion.setFromEuler(euler)
            scaleVector.setScalar(item.scale * shrink)
            matrix.compose(position, quaternion, scaleVector)
            blossom.setMatrixAt(i, matrix)
        }
        blossom.instanceMatrix.needsUpdate = true

        if (Math.abs(dream - lastTint.current.dream) > 0.002 || Math.abs(strange - lastTint.current.strange) > 0.002) {
            lastTint.current = { dream, strange }
            for (let i = 0; i < blades.length; i++) {
                const index = blades[i].hue % palettes.bladeDream.length
                colorA.copy(palettes.bladeDream[index]).lerp(palettes.bladeStrange[index], strange)
                colorB.copy(palettes.bladeReal[index]).lerp(colorA, dream)
                blade.setColorAt(i, colorB)
            }
            for (let i = 0; i < blossoms.length; i++) {
                const index = blossoms[i].hue % palettes.blossomDream.length
                colorA.copy(palettes.blossomDream[index]).lerp(palettes.blossomStrange[index], strange)
                colorB.copy(palettes.blossomReal[index]).lerp(colorA, dream)
                blossom.setColorAt(i, colorB)
            }
            if (blade.instanceColor) blade.instanceColor.needsUpdate = true
            if (blossom.instanceColor) blossom.instanceColor.needsUpdate = true
        }
    })

    useEffect(
        () => () => {
            bladeGeometry.dispose()
            bladeMaterial.dispose()
            blossomMaterial.dispose()
        },
        [bladeGeometry, bladeMaterial, blossomMaterial]
    )

    return (
        <group>
            <instancedMesh
                ref={bladeRef}
                args={[bladeGeometry, bladeMaterial, BLADE_COUNT]}
                frustumCulled={false}
            />
            <instancedMesh ref={blossomRef} args={[undefined, blossomMaterial, BLOSSOM_COUNT]} frustumCulled={false}>
                <icosahedronGeometry args={[0.9, 0]} />
            </instancedMesh>
        </group>
    )
}
