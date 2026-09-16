import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useDreamValues } from '../dreamClock.jsx'
import { toonRamp } from './toon.js'

// Every surface in henry is the same surface at three temperatures, so every
// surface uses this hook.
//
//   final = lerp( realColour, lerp(dreamColour, strangeColour, strange), dream )
//
// Read that inside out: the dream picks its own temperature first (warm
// storybook -> cold plastic), and only then does the whole thing dissolve
// toward the ordinary room. It has to be that order. Lerp to real first and
// beat 4's plastic tint would fight the reveal for the same channel, and the
// turn would look like the dream ending early.
//
// The colour is written straight onto the material in useFrame — no React
// state, no per-frame re-render, one allocation at mount.

const scratchA = new THREE.Color()
const scratchB = new THREE.Color()

export default function useTinted({
    dream,
    strange = dream,
    real = dream,
    roughness = 1,
    emissiveBoost = 0,
    flatShading = false,
    transparent = false,
    opacity = 1,
    side = THREE.FrontSide
}) {
    const values = useDreamValues()

    const colors = useMemo(
        () => ({
            dream: new THREE.Color(dream),
            strange: new THREE.Color(strange),
            real: new THREE.Color(real)
        }),
        [dream, strange, real]
    )

    const material = useMemo(() => {
        const created = new THREE.MeshToonMaterial({
            color: colors.dream,
            gradientMap: toonRamp(),
            transparent,
            opacity,
            side,
            flatShading
        })
        // Toon material has no roughness; carrying the argument anyway keeps
        // the call sites honest about what kind of surface they mean, and it
        // is what a later swap to a custom shader would read.
        created.userData.roughness = roughness
        return created
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transparent, opacity, side, flatShading])

    // emissiveBoost is closed over directly rather than mirrored into a ref:
    // R3F keeps the latest useFrame callback, so the closure is never stale.
    useFrame(() => {
        const { dream: d, strange: s } = values.current
        scratchA.copy(colors.dream).lerp(colors.strange, s)
        scratchB.copy(colors.real).lerp(scratchA, d)
        material.color.copy(scratchB)
        if (emissiveBoost > 0) {
            // Sparkle and the bear's throat glow from inside rather than being
            // lit; the references have no lamp anywhere in them.
            material.emissive.copy(scratchB).multiplyScalar(emissiveBoost * d)
        }
    })

    useEffect(() => () => material.dispose(), [material])

    return material
}
