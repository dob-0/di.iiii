import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { MeshLambertMaterial } from 'three'

// RENDER TECH: the room's textured surfaces as plain grey faces (decision 2026-10-15-studio-tech-show-render.md; owner:
// "looks where lasers and lights are just the shapes, not other things"). Mounted by RenderSettingsEffect only while the
// render-time copy says `renderSettings.look === 'schematic'` (src/shared/renderPlan.js). A mesh whose material carries a
// texture is drawn with one shared grey material; on unmount every swapped mesh gets its own material back. Beams and
// laser lines (userData.beamPick) and shader materials are never touched. Models load late, so the scene is looked at
// again every second (a traverse, no per-frame cost), and a swap asks the on-demand loop for one frame.

export const SCHEMATIC_GREY = '#8a8d91'
const TEXTURE_SLOTS = ['map', 'emissiveMap', 'aoMap', 'lightMap', 'normalMap', 'roughnessMap', 'metalnessMap']

/** Does this material draw a texture? Pure. */
export const isTextured = (material) => Boolean(material) && !material.isShaderMaterial && TEXTURE_SLOTS.some((k) => Boolean(material[k]))

export default function SchematicSurfaces() {
    const { scene, invalidate } = useThree()
    useEffect(() => {
        const grey = new MeshLambertMaterial({ color: SCHEMATIC_GREY })
        const greyDouble = new MeshLambertMaterial({ color: SCHEMATIC_GREY, side: 2 })
        const swapped = new Map()
        const sweep = () => {
            let changed = false
            scene.traverse((o) => {
                if (!o.isMesh || swapped.has(o) || o.userData?.beamPick) return
                const list = Array.isArray(o.material) ? o.material : [o.material]
                if (!list.some(isTextured)) return
                swapped.set(o, o.material)
                o.material = list.some((m) => m?.side === 2) ? greyDouble : grey
                changed = true
            })
            if (changed) invalidate()
        }
        sweep()
        const timer = setInterval(sweep, 1000)
        return () => {
            clearInterval(timer)
            for (const [mesh, material] of swapped) mesh.material = material
            grey.dispose()
            greyDouble.dispose()
            invalidate()
        }
    }, [scene, invalidate])
    return null
}
