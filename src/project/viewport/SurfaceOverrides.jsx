import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { overriddenMaterial, stencilClearingMaterial } from './surfaces.js'

// `renderSettings.surfaces` applied to the room as it is drawn (surfaces.js has the why).
// A scene walk, like ShadowCasting.jsx: models arrive late (a GLB loads after the room),
// so the walk repeats about once a second until nothing new is found for a while, and a
// mesh is patched once (its own material is kept to put back when the room leaves).
const WALK_EVERY_FRAMES = 60

export default function SurfaceOverrides({ surfaces }) {
    const { scene } = useThree()
    const patched = useRef(new Map()) // mesh → its original material
    const frames = useRef(0)
    const key = JSON.stringify(surfaces)

    useFrame(() => {
        frames.current += 1
        if (frames.current % WALK_EVERY_FRAMES !== 1) return
        scene.traverse((o) => {
            if (!o.isMesh || patched.current.has(o)) return
            const mats = Array.isArray(o.material) ? o.material : [o.material]
            if (!mats.some((m) => m && surfaces[m.name])) return
            patched.current.set(o, { material: o.material, renderOrder: o.renderOrder })
            const reflects = mats.some((m) => m && surfaces[m.name]?.reflect > 0)
            const next = mats.map((m) => (m && surfaces[m.name] ? overriddenMaterial(m, surfaces[m.name]) : m && reflects ? stencilClearingMaterial(m) : m))
            o.material = Array.isArray(o.material) ? next : next[0]
            // a surface that marks the stencil for reflections is drawn last of the opaque room
            if (next.some((m) => m?.userData?.surfaceOverride?.reflect > 0)) o.renderOrder = 1e6
        })
    })

    // The settings changed, or the room leaves: every patched mesh gets its own material back.
    useEffect(() => () => {
        for (const [mesh, original] of patched.current) {
            const now = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            for (const m of now) if (m?.userData?.surfaceOverride) m.dispose()
            mesh.material = original.material
            mesh.renderOrder = original.renderOrder
        }
        patched.current.clear()
        frames.current = 0
    }, [key, scene])
    return null
}
