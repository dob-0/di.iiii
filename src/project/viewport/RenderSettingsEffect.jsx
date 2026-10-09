import { Suspense, lazy, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { atmosphereOf } from '../../objectComponents/beamAir.js'
import { getHazeField, hazeFogBase, setAtmosphere, subscribeHazeField } from '../../objectComponents/atmosphereStore.js'
import { hazeUniformsFor } from '../../objectComponents/hazeUniforms.js'
import { bloomOf } from './bloom.js'
import { useHoldFrames } from '../../studio/utils/renderDemand.jsx'
import { surfacesOf } from './surfaces.js'
import SurfaceOverrides from './SurfaceOverrides.jsx'
import BeamMirrors from './BeamMirrors.jsx'
import NightOutside from './NightOutside.jsx'
import useMeasureRequest from './measure/useMeasureRequest.js'

// The room in high dynamic range with bloom (HdrBloom.jsx): loaded only by a room that asks.
const HdrBloom = lazy(() => import('./HdrBloom.jsx'))
// The frame-rate governor (qualityGovernor.js): in a room drawn with a physical haze.
const QualityGovernor = lazy(() => import('./QualityGovernor.jsx'))
// The measurement mode (measure/MeasurementMode.jsx): loaded only when asked for (?measure, Alt+Shift+M).
const MeasurementMode = lazy(() => import('./measure/MeasurementMode.jsx'))

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
    // the haze worked out from the room's machines (hazeField.js), compared by value:
    // a document re-read with the same settings must not wake every beam
    const hazeKey = JSON.stringify(renderSettings?.atmosphere?.haze ?? null)
    useEffect(() => {
        setAtmosphere(gl, atmosphereOf({ atmosphere: { scattering, anisotropy, haze: JSON.parse(hazeKey) } }))
    }, [gl, scattering, anisotropy, hazeKey])
    // The haze's eddies drift with the hall's air: one clock for every beam (the shared
    // uniform), ticking only while the room's haze is uneven.
    useFrame(({ clock }) => {
        const field = getHazeField(gl)
        if (field && field.patchiness > 0) hazeUniformsFor(gl).uHazeTime.value = clock.elapsedTime
    })
    // And the hall's haze dims the surfaces as it dims the beams: the fog's resting
    // distances become the haze's (atmosphereStore.js hazeFogBase), set when the haze
    // changes — not every frame, which would fight SmartView, the one that moves the fog
    // at run time (it adds its offset to the same base). A room with one hand-set haze
    // keeps the fog it was authored with.
    const { scene } = useThree()
    useEffect(() => {
        const apply = () => {
            const base = hazeFogBase(gl)
            if (base && scene.fog?.isFog) {
                scene.fog.near = base.near
                scene.fog.far = base.far
            }
        }
        apply()
        return subscribeHazeField(gl, apply)
    }, [gl, scene])
    useEffect(() => () => setAtmosphere(gl, null), [gl])
    // Mounted only while the room asks for bloom: once it is mounted it draws every
    // frame itself (a priority frame callback stops R3F's own render).
    const governed = Boolean(atmosphereOf({ atmosphere: renderSettings?.atmosphere })) && renderSettings?.quality?.adaptive !== false
    // the room's surfaces corrected at load (surfaces.js): e.g. the hall's floor finish
    const surfaces = surfacesOf(renderSettings)
    // a room with a physical haze: what its openings show takes the haze's veil (NightOutside.jsx)
    const hazy = Boolean(renderSettings?.atmosphere?.haze)
    const heavyRoom = Boolean(bloomOf(renderSettings) || governed || surfaces || hazy)
    // Under Studio's on-demand loop a bloom or haze scene is still when its haze is even:
    // HdrBloom draws its own frame each time one is asked for, the governor only rates the
    // continuous bursts (it ignores an on-demand loop), and the scene walks poll during the
    // burst after a load. Only the drifting eddies (uHazeTime, patchiness > 0) move by
    // themselves, so only an uneven haze holds the loop.
    const [patchy, setPatchy] = useState(() => (getHazeField(gl)?.patchiness || 0) > 0)
    useEffect(() => {
        const read = () => setPatchy((getHazeField(gl)?.patchiness || 0) > 0)
        read()
        return subscribeHazeField(gl, read)
    }, [gl])
    useHoldFrames(heavyRoom && patchy, 'haze-eddies')
    // fixed EV100, no auto exposure / bloom / veil / work light, probes (MEASUREMENT_MODE.md)
    const measureRequest = useMeasureRequest()
    const measure = measureRequest ? (
        <MeasurementMode renderSettings={renderSettings} request={measureRequest} toneMapping={toneMappingOf(renderSettings?.toneMapping)} />
    ) : null
    if (!heavyRoom) return measure ? <Suspense fallback={null}>{measure}</Suspense> : null
    return (
        <Suspense fallback={null}>
            {measure}
            {bloomOf(renderSettings) ? <HdrBloom renderSettings={renderSettings} /> : null}
            {governed ? <QualityGovernor renderSettings={renderSettings} /> : null}
            {surfaces ? <SurfaceOverrides surfaces={surfaces} /> : null}
            {hazy ? <NightOutside /> : null}
            {/* the beams reflected in the floor: needs the HDR path's stencil (HdrBloom.jsx) */}
            {surfaces?.floor?.reflect > 0 && bloomOf(renderSettings) ? <BeamMirrors floor={surfaces.floor} /> : null}
        </Suspense>
    )
}
