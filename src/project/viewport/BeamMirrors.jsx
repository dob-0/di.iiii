import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Matrix4, Mesh } from 'three'
import { beamMeshesOf } from '../../objectComponents/atmosphereStore.js'
import { beamAirBeforeRender, createBeamMirrorMaterial, mirrorMatrix, setBeamMirrorFloor } from '../../objectComponents/beamAirMaterial.js'
import { WEAR_GLSL } from './surfaces.js'

// THE BEAMS REFLECTED IN THE FLOOR — in a club photo most of what reads as "reflection" is
// the bright things mirrored in the concrete: beam cones and lenses (research note
// 2026-10-01). Each beam's core is drawn a second time, mirrored through the floor plane,
// only on the pixels where the floor is the visible surface (the floor marks them: stencil
// ref 1, SurfaceOverrides.jsx), weighted by the floor's Fresnel and blurred by its
// roughness where each ray lands, wear and all (beamAirMaterial.js, mirrorBlur).
// No second render of the room: one extra draw per beam, of the same hull.
//
// Only in the half-float path (the composer's target carries the stencil, HdrBloom.jsx);
// not in a headset yet (the plain path's canvas has no stencil buffer).
const scratch = new Matrix4()

function beforeMirrorRender(renderer, scene, camera) {
    beamAirBeforeRender(this, camera)
}

export default function BeamMirrors({ floor }) {
    const { gl, scene } = useThree()
    const mirrors = useRef(new Map()) // source mesh → mirror mesh

    useFrame(() => {
        const sources = beamMeshesOf(gl)
        // new beams get a reflection; gone ones lose theirs
        for (const src of sources) {
            if (mirrors.current.has(src) || !src.material?.uniforms) continue
            const m = new Mesh(src.geometry, createBeamMirrorMaterial(src.material, floor, WEAR_GLSL))
            m.matrixAutoUpdate = false
            m.matrixWorldAutoUpdate = false // its world matrix is the beam's, mirrored, set below
            m.frustumCulled = false
            m.raycast = () => null
            m.onBeforeRender = beforeMirrorRender
            m.renderOrder = 1
            scene.add(m)
            mirrors.current.set(src, m)
        }
        for (const [src, m] of mirrors.current) {
            if (!sources.has(src)) {
                scene.remove(m)
                m.material.dispose()
                mirrors.current.delete(src)
                continue
            }
            // follow the beam: its place, its hull (zoom rebuilds it), whether it shows
            // In a headset the frame is drawn straight to the XR layer, which has no stencil
            // buffer: a stencil test there passes everywhere and the mirrored beams would
            // stand over the whole room. Hidden until the XR path has a mask of its own.
            let shown = src.visible && !gl.xr.isPresenting
            for (let p = src.parent; p && shown; p = p.parent) shown = p.visible
            m.visible = shown
            if (m.geometry !== src.geometry) m.geometry = src.geometry
            m.matrixWorld.copy(mirrorMatrix(scratch, src.matrixWorld))
            setBeamMirrorFloor(m.material, floor)
        }
    })

    useEffect(() => () => {
        for (const m of mirrors.current.values()) {
            scene.remove(m)
            m.material.dispose()
        }
        mirrors.current.clear()
    }, [scene])
    return null
}
