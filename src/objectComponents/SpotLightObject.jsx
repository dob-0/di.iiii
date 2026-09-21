import { useEffect, useRef } from 'react'
import { AdditiveBlending, DoubleSide } from 'three'
import { spotTargetOffset } from '../project/viewport/spotLightAim.js'
import { beamIsVisible, spotBeamShape } from './spotBeam.js'

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
// changes. `castShadow` comes from the room's render settings, not from the
// lamp: shadows are a decision about the whole stage.
export default function SpotLightObject({
    color = '#ffffff',
    intensity = 2,
    distance = 20,
    angle = 0.52,
    penumbra = 0.2,
    decay = 2,
    beam = null,
    castShadow = false,
    shadowMapSize = 1024
}) {
    const lightRef = useRef(null)
    const targetRef = useRef(null)
    const showBeam = beamIsVisible(beam)
    const throwShape = spotBeamShape({ distance, angle, intensity, haze: beam?.haze })
    // The shadow camera is the lamp's own throw: anything past its reach is
    // unlit anyway, and a far plane at the scene's scale wastes the whole depth
    // buffer on empty air and gives a blocky, self-shadowing mess up close.
    const shadowFar = Math.max(1, throwShape.length)

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
                color={color}
                intensity={intensity}
                distance={distance}
                angle={angle}
                penumbra={penumbra}
                decay={decay}
                castShadow={castShadow}
                shadow-mapSize-width={shadowMapSize}
                shadow-mapSize-height={shadowMapSize}
                shadow-camera-near={0.5}
                shadow-camera-far={shadowFar}
                shadow-bias={-0.0008}
                shadow-normalBias={0.02}
            />
            <object3D ref={targetRef} position={spotTargetOffset()} />
            {showBeam ? (
                <mesh
                    position={throwShape.position}
                    // Never in the way of a click: the cone is as wide as the
                    // throw, and a selectable one would swallow every pick in
                    // the Studio for whatever stands inside the beam.
                    raycast={() => null}
                >
                    <coneGeometry args={[throwShape.radius, throwShape.length, 24, 1, true]} />
                    <meshBasicMaterial
                        color={color}
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
