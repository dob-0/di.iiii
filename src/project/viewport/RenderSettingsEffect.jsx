import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { atmosphereOf } from '../../objectComponents/beamAir.js'
import { setAtmosphere } from '../../objectComponents/atmosphereStore.js'

// The document's tone-mapping name → three.js's operator. ACES (Narkowicz's fit,
// three.js's ACESFilmic) stays the default; 'AgX' (T. Sobotka's AgX, three.js
// AgXToneMapping) and 'Neutral' (Khronos PBR Neutral) are for rooms whose light
// is saturated and bright — a deep red beam in ACES skews orange and holds its
// hue into clipping, where AgX runs it toward white the way film and a camera
// sensor do. 'none' = linear, clipped.
export const toneMappingOf = (name) => {
    if (name === 'none' || name === 'None') return THREE.NoToneMapping
    if (name === 'AgX') return THREE.AgXToneMapping
    if (name === 'Neutral') return THREE.NeutralToneMapping
    return THREE.ACESFilmicToneMapping
}

// `document.renderSettings` applied to the WebGL renderer, shared by the two
// surfaces that render the same document: the arrival view (StudioViewport, in
// orbit) and walk mode (LiveProjectScene). It lived in StudioViewport only, so
// an authored exposure or a tone-mapping of 'none' was obeyed on arrival and
// silently dropped one click later, in the mode the piece is actually walked in.
//
// Also the room's air (`renderSettings.atmosphere`, beamAir.js): handed to the
// beams drawn in this renderer through atmosphereStore.js.
//
// The Canvas-level half of renderSettings (shadows, antialias, dpr) cannot be
// set from inside the tree — each surface passes those to its own <Canvas>.
export default function RenderSettingsEffect({ renderSettings }) {
    const { gl } = useThree()
    useEffect(() => {
        gl.toneMapping = toneMappingOf(renderSettings?.toneMapping)
        gl.toneMappingExposure = renderSettings?.toneMappingExposure ?? 1
        gl.shadowMap.enabled = renderSettings?.shadows !== false
    }, [gl, renderSettings?.toneMapping, renderSettings?.toneMappingExposure, renderSettings?.shadows])
    const scattering = renderSettings?.atmosphere?.scattering
    const anisotropy = renderSettings?.atmosphere?.anisotropy
    useEffect(() => {
        setAtmosphere(gl, atmosphereOf({ atmosphere: { scattering, anisotropy } }))
    }, [gl, scattering, anisotropy])
    useEffect(() => () => setAtmosphere(gl, null), [gl])
    return null
}
