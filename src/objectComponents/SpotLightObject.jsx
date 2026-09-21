import { useEffect, useRef } from 'react'
import { spotTargetOffset } from '../project/viewport/spotLightAim.js'

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
export default function SpotLightObject({
    color = '#ffffff',
    intensity = 2,
    distance = 20,
    angle = 0.52,
    penumbra = 0.2,
    decay = 2
}) {
    const lightRef = useRef(null)
    const targetRef = useRef(null)

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
            />
            <object3D ref={targetRef} position={spotTargetOffset()} />
        </>
    )
}
