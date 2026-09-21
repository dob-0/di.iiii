import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, ConeGeometry, DoubleSide } from 'three'
import { spotTargetOffset } from '../project/viewport/spotLightAim.js'
import { beamFadeColors, beamIsVisible, spotBeamShape } from './spotBeam.js'

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
    beam = null
}) {
    const lightRef = useRef(null)
    const targetRef = useRef(null)
    const showBeam = beamIsVisible(beam)
    const throwShape = spotBeamShape({ distance, angle, intensity, haze: beam?.haze })

    // The cone is built by hand rather than as <coneGeometry> so the fade along
    // the throw can ride on it as vertex colours. Rebuilt only when the lamp's
    // reach or angle changes, and thrown away with the entity.
    const beamGeometry = useMemo(() => {
        if (!showBeam) return null
        const geometry = new ConeGeometry(throwShape.radius, throwShape.length, 28, 12, true)
        const positions = geometry.getAttribute('position')
        geometry.setAttribute('color', new BufferAttribute(beamFadeColors(positions.array, throwShape.length), 3))
        return geometry
    }, [showBeam, throwShape.radius, throwShape.length])
    useEffect(() => () => beamGeometry?.dispose(), [beamGeometry])

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
    }, [])

    return (
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
                angle={angle}
                penumbra={penumbra}
                decay={decay}
            />
            <object3D ref={targetRef} position={spotTargetOffset()} />
            {showBeam && beamGeometry ? (
                <mesh
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
