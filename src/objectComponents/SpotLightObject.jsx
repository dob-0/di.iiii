import { useContext, useEffect, useMemo, useRef } from 'react'
import { context as fiberContext, useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, ConeGeometry, DoubleSide } from 'three'
import { spotTargetOffset } from '../project/viewport/spotLightAim.js'
import { beamCastsLight, beamFadeColors, beamIsVisible, edgeForExponent, fieldRatioOf, profileExponentForRatio, spotBeamShape, spotLightCone } from './spotBeam.js'
import { strobeEnvelope } from '../rigbuild/rigFlash.js'
import { DEFAULT_APERTURE } from './beamAir.js'
import { beamAirBeforeRender, beamAirGeometry, createBeamAirMaterial, setBeamAirUniforms } from './beamAirMaterial.js'
import { registerBeamMesh, registerGlareMesh, useAtmosphere } from './atmosphereStore.js'
import { hazeUniformsFor } from './hazeUniforms.js'
import { beamOpticsOf } from './beamOptics.js'
import { driveOfHex, laserColourFlux, laserOf, scanLines } from './laserLine.js'
import { createLaserLineMaterial, laserLineBeforeRender, laserLineGeometry } from './laserLineMaterial.js'

// A spot light that actually points where the entity is turned.
//
// three.js aims a SpotLight at `light.target`, and the default target is a bare
// Object3D at the origin of the light's parent space. Mounting `<spotLight/>`
// on its own -- which both renderers did -- therefore aimed every spot light in
// every room at (0,0,0), and rotating one changed nothing at all.
//
// The target here is a sibling of the light INSIDE the entity's transform
// group. That is the whole trick:
//   - it is part of the scene graph, which three.js requires (a detached
//     Object3D never gets its matrixWorld updated, so the light reads a stale
//     or identity matrix and points at the origin again);
//   - the group's own position/rotation/scale carry it, so no code has to
//     recompute anything when the entity is dragged, turned or animated;
//   - it stays correct for an entity nested inside a parent group, where the
//     entity's `transform` is local and a world-space calculation would be
//     wrong;
//   - React unmounts it with the light, so an edit cannot leak Object3Ds --
//     the failure mode of adding the target to the scene root by hand.
//
// Shared by both renderers on purpose: EntityContent (editor viewport, Raw,
// portals) and LiveProjectScene (published rooms, walk mode) keep separate
// entity switches, and that duplication has shipped drift twice already.
// The marker mesh is NOT here -- only the editor draws one.
// `beam` is the entity's `components.beam` -- absent in every room published
// before this existed, and absent means no cone, so nothing already out there
// changes. Shadows are NOT a prop here: they are a decision about the whole
// stage (`renderSettings.shadowCasting`), and the scene walk in
// src/project/viewport/shadowCasting.js sets them on every lamp and every solid
// thing at once, including the ones that arrive late from a model file.
export default function SpotLightObject({
    color = '#ffffff',
    intensity = 2,
    distance = 20,
    angle = 0.52,
    penumbra = 0.2,
    decay = 2,
    beam = null,
    // A rig fixture (the entity carries components.fixture): its `angle` is half its BEAM
    // angle, the datasheet's 50 % point, so its real light is fitted to it (spotBeam.js
    // spotLightCone). An authored spot's angle is its cutoff, as three reads it.
    fitted = false
}) {
    const lightRef = useRef(null)
    const targetRef = useRef(null)
    const coneRef = useRef(null)
    // A shutter strobing (`beam.strobeHz`, set only while a lighting desk drives the lamp —
    // src/rigbuild/dmxPose.js): the light and the cone flash at that rate on the wall
    // clock, so every screen flashes together. No strobe: nothing runs per frame.
    const strobeHz = Number(beam?.strobeHz) > 0 ? Number(beam.strobeHz) : 0
    // The room's air (renderSettings.atmosphere, via RenderSettingsEffect): with one,
    // the beam is drawn physically (beamAir.js) — its brightness from the lamp's own
    // candela, the haze and the camera's exposure; without one, the old flat cone.
    // Read through the Canvas's own store (not useThree, which throws outside a Canvas —
    // the lamp is also rendered to markup in tests).
    const gl = useContext(fiberContext)?.getState?.().gl || null
    const atmosphere = useAtmosphere(gl)
    // `beam.only`: the cone and no light (spotBeam.js, beamCastsLight). The
    // light is not mounted at all rather than mounted at zero — three.js pays
    // for a light in every shader whatever its intensity.
    const castsLight = beamCastsLight(beam)
    const cone = fitted ? spotLightCone({ angle, penumbra }) : { angle, penumbra }
    // the drawn beam's length: its own field (beam.length) when the lamp has one — a rig lamp's light has
    // no cutoff (distance 0) since 2026-10-09 — else the light's distance, as before
    const throwShape = spotBeamShape({ distance: Number(beam?.length) > 0 ? Number(beam.length) : distance, angle, intensity, haze: beam?.haze })
    // a laser drawn as a line source (laserLine.js), not a cone
    const laser = laserOf(beam)
    // A cone that would draw at opacity 0 (haze 0, or a lamp held at 0) is not
    // mounted at all: an additive mesh at 0 adds nothing to the picture and
    // still costs a draw call and fill over the whole throw. It is how a strobe
    // draws NO cone in the room (looks.js flashEntities, RIG_BUILD.md §15.6).
    const showBeam = beamIsVisible(beam) && throwShape.opacity > 0
    const physical = Boolean(atmosphere) && showBeam && !laser
    const laserLines = Boolean(atmosphere) && showBeam && Boolean(laser)

    // The cone is built by hand rather than as <coneGeometry> so the fade along
    // the throw can ride on it as vertex colours. Rebuilt only when the lamp's
    // reach or angle changes, and thrown away with the entity.
    const beamGeometry = useMemo(() => {
        if (!showBeam || physical || laserLines) return null
        const geometry = new ConeGeometry(throwShape.radius, throwShape.length, 28, 12, true)
        const positions = geometry.getAttribute('position')
        geometry.setAttribute('color', new BufferAttribute(beamFadeColors(positions.array, throwShape.length), 3))
        return geometry
    }, [showBeam, physical, laserLines, throwShape.radius, throwShape.length])
    useEffect(() => () => beamGeometry?.dispose(), [beamGeometry])

    // The lamp's steady intensity, for whoever ranks lamps by their light (shadowCasting.js
    // shadowScore): a strobe flashes light.intensity per frame, this does not move.
    useEffect(() => {
        if (lightRef.current) lightRef.current.userData.nominalIntensity = intensity
    }, [intensity, castsLight])

    useEffect(() => {
        const light = lightRef.current
        const target = targetRef.current
        if (!light || !target) return undefined
        const previous = light.target
        light.target = target
        // The renderer refreshes the whole graph each frame; this is only so
        // the very first frame is already aimed rather than snapping.
        target.updateMatrixWorld()
        return () => {
            light.target = previous
        }
    }, [castsLight])

    return (
        <>
            {strobeHz > 0 ? <StrobeDriver hz={strobeHz} lightRef={lightRef} coneRef={coneRef} intensity={intensity} opacity={throwShape.opacity} /> : null}
            {castsLight ? (
                <>
                    <spotLight
                        ref={lightRef}
                        // A three.js SpotLight is NOT born at its own origin: the
                        // constructor does `this.position.copy(Object3D.DEFAULT_UP)`,
                        // so an unpositioned one sits a metre up its own local +Y --
                        // which, for an entity that has been tilted, is a metre
                        // BACKWARDS along its beam. Every spot light in di.iiii was
                        // therefore emitting from a metre behind where the author hung
                        // it (found 2026-09-21: the editor's little marker cone, drawn
                        // at the true entity position, was landing inside the lamp's
                        // own shadow frustum and printing an octagon on the wall). The
                        // aim was never wrong -- direction is target minus position and
                        // both moved together -- but the lamp's place, its throw and
                        // its falloff all were.
                        position={[0, 0, 0]}
                        color={color}
                        intensity={intensity}
                        distance={distance}
                        angle={cone.angle}
                        penumbra={cone.penumbra}
                        decay={decay}
                    />
                    <object3D ref={targetRef} position={spotTargetOffset()} />
                </>
            ) : null}
            {laserLines ? (
                <LaserLines gl={gl} laser={laser} color={color} level={beam?.haze} length={throwShape.length} anisotropy={atmosphere.anisotropy} />
            ) : null}
            {physical ? (
                <BeamInAir
                    gl={gl}
                    color={color}
                    intensity={intensity}
                    angle={angle}
                    // a rig lamp's profile in the air: its class equivalent's field/beam ratio (spotBeam.js)
                    penumbra={fitted ? edgeForExponent(profileExponentForRatio(fieldRatioOf(penumbra))) : penumbra}
                    length={throwShape.length}
                    aperture={beam?.aperture}
                    opticsKey={JSON.stringify(beam?.optics ?? null)}
                    atmosphere={atmosphere}
                    strobeHz={strobeHz}
                />
            ) : null}
            {showBeam && beamGeometry ? (
                <mesh
                    ref={coneRef}
                    geometry={beamGeometry}
                    position={throwShape.position}
                    // Never in the way of a click: the cone is as wide as the
                    // throw, and a selectable one would swallow every pick in
                    // the Studio for whatever stands inside the beam.
                    raycast={() => null}
                >
                    <meshBasicMaterial
                        color={color}
                        vertexColors
                        transparent
                        opacity={throwShape.opacity}
                        blending={AdditiveBlending}
                        depthWrite={false}
                        side={DoubleSide}
                        toneMapped={false}
                        fog={false}
                    />
                </mesh>
            ) : null}
        </>
    )
}

// The per-frame half of a strobing shutter, mounted only while one strobes.
function StrobeDriver({ hz, lightRef, coneRef, intensity, opacity }) {
    useFrame((frameState) => {
        frameState.invalidate() // a strobe is continuous: keeps an on-demand loop running
        const env = strobeEnvelope(Date.now() / 1000, hz)
        if (lightRef.current) lightRef.current.intensity = intensity * env
        const mat = coneRef.current?.material
        if (mat) mat.opacity = opacity * env
    })
    useEffect(() => () => {
        // Back to steady when the strobe stops (React re-applies the props on the next render).
        if (lightRef.current) lightRef.current.intensity = intensity
        if (coneRef.current?.material) coneRef.current.material.opacity = opacity
    }, [lightRef, coneRef, intensity, opacity])
    return null
}

// The beam drawn physically (beamAir.js, beamAirMaterial.js). Its brightness is
// the lamp's intensity in candela — the number that lights the room's surfaces —
// so the beam and the wall it lands on answer to the same exposure. `haze` on the
// lamp is not a brightness here (the lamp's level already scales its intensity);
// 0 still means "no beam" (a strobe draws a flash instead, looks.js flashEntities).
function BeamInAir({ gl, color, intensity, angle, penumbra, length, aperture, opticsKey = 'null', atmosphere, strobeHz = 0 }) {
    const tanHalf = Math.tan(Math.min(Math.max(Number(angle) || 0.52, 0.001), Math.PI / 2 - 0.01))
    const a = Number(aperture) > 0 ? Number(aperture) : DEFAULT_APERTURE
    // A beam's edge: the lamp's penumbra picks its cross-section (beamAir.js beamProfile:
    // hard → a beam fixture's steep-shouldered rod, soft → a wash's Gaussian). Never
    // harder than 0.2 (a real beam's edge is soft even through a sharp gobo, in haze).
    // (up to EDGE_MAX for a rig lamp whose class equivalent is softer than a Gaussian — beamAir.js)
    const edge = Math.min(1.2, Math.max(0.2, Number(penumbra) || 0))
    // prism, honeycomb, frost, gobo (beamOptics.js) — keyed by value, so a re-render with
    // the same optics keeps the same hull
    const optics = useMemo(() => beamOpticsOf({ optics: JSON.parse(opticsKey) }), [opticsKey])
    const values = { color, intensity, tanHalf, aperture: a, length, edge, atmosphere, strobeHz, optics }
    return (
        <>
            <BeamPart gl={gl} part="core" values={values} />
            <BeamPart gl={gl} part="glare" values={values} />
        </>
    )
}

// three.js calls onBeforeRender as a method of the mesh, so `this` is the mesh.
function beforeBeamRender(renderer, scene, camera) {
    beamAirBeforeRender(this, camera)
}

function BeamPart({ gl, part, values }) {
    const { aperture, tanHalf, length, edge, optics } = values
    const geometry = useMemo(() => beamAirGeometry({ aperture, tanHalf, length, edge, optics }, part), [aperture, tanHalf, length, edge, optics, part])
    // the room's haze field: this renderer's shared uniforms (hazeUniforms.js)
    const material = useMemo(() => createBeamAirMaterial(part, hazeUniformsFor(gl)), [part, gl])
    useEffect(() => () => geometry.dispose(), [geometry])
    useEffect(() => () => material.dispose(), [material])
    // the glare hull steps aside, undrawn, while the room has real bloom (atmosphereStore.js)
    const meshRef = useRef(null)
    // the glare hull steps aside under bloom; the core is known to the floor's reflection (beamMirror.js)
    useEffect(() => (part === 'glare' ? registerGlareMesh(gl, meshRef.current) : registerBeamMesh(gl, meshRef.current)), [gl, part])
    setBeamAirUniforms(material, values)
    return (
        <>
            <mesh ref={meshRef} geometry={geometry} material={material} raycast={() => null} onBeforeRender={beforeBeamRender} />
            {values.strobeHz > 0 ? <BeamAirStrobe material={material} values={values} /> : null}
        </>
    )
}

// A strobing shutter on a beam drawn in the air: the same wall-clock envelope as the
// flat cone's (StrobeDriver above), on the beam's own intensity. Mounted only while
// the desk strobes the lamp; nothing runs per frame otherwise.
function BeamAirStrobe({ material, values }) {
    useFrame((frameState) => {
        frameState.invalidate() // continuous while strobing
        material.uniforms.uIntensity.value = Math.max(0, Number(values.intensity) || 0) * strobeEnvelope(Date.now() / 1000, values.strobeHz)
    })
    useEffect(() => () => setBeamAirUniforms(material, values), [material, values])
    return null
}

// A LASER IN HAZE (laserLine.js): its lines — one static beam, or a scanned frame's sub-lines by duty share —
// each a ribbon whose luminance is the line-source law. `level` is the look's level (the laser's beam.haze,
// 1 = full); the colour is the cube's drive per diode (the lamp's colour read as r, g, b drive, as a frame
// carries it), the flux Km·V(λ)·P per diode, in linear Rec.709 with the out-of-gamut lines desaturated at
// constant luminance (stated in laserLine.js).
function LaserLines({ gl, laser, color, level = 1, length, anisotropy }) {
    const key = JSON.stringify([laser, color, level, length])
    const geometry = useMemo(() => {
        const lvl = Math.min(1, Math.max(0, Number(level ?? 1)))
        const lines = scanLines(laser.frame, { fieldHalfDeg: laser.fieldHalfDeg, drive: driveOfHex(color) }).map((l) => {
            const { rgb } = laserColourFlux({ mW: laser.mW, nm: laser.nm, drive: l.drive })
            return { dir: l.dir, flux: rgb.map((c) => c * l.duty * lvl * laser.sceneScale) }
        })
        return laserLineGeometry(lines, Math.max(Number(length) || 20, 0.5))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key])
    const material = useMemo(() => createLaserLineMaterial(hazeUniformsFor(gl)), [gl])
    useEffect(() => () => geometry.dispose(), [geometry])
    useEffect(() => () => material.dispose(), [material])
    material.uniforms.uDiam.value = laser.diameter_mm / 1000
    material.uniforms.uDiv.value = laser.divergence_mrad / 1000
    material.uniforms.uG.value = Number.isFinite(Number(anisotropy)) ? Number(anisotropy) : 0.74
    return <mesh geometry={geometry} material={material} raycast={() => null} frustumCulled={false} onBeforeRender={beforeLaserRender} />
}

function beforeLaserRender(renderer, scene, camera) {
    laserLineBeforeRender(this, renderer, camera)
}
