import { Suspense, useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import FixtureBodies from './FixtureBodies.jsx'
import RigFlashes from './RigFlashes.jsx'
import DmxProbe from './DmxProbe.jsx'
import { TYPE_LIBRARY } from './types/index.js'
import { libraryWithShow } from './rental.js'
import { rigBodyLamps } from './rigBodyLamps.js'
import { bounceOf, bounceSpecOf, hazeGlowFactor } from './rigBounce.js'
import { typeById } from './fixtureTypes.js'
import { hazeMachinesOf } from '../objectComponents/hazeField.js'
import { getAtmosphere, getHazeField, setHazeMachines } from '../objectComponents/atmosphereStore.js'

// THE LAMPS' BODIES IN ANY ROOM — the space view (LiveProjectScene), the Studio and the
// rooms beside the plot and the cards (StudioViewport). RIG_BUILD.md §12.4.
//
// Owner, 2026-09-28, on /moxir after the plot migration took the baked body mesh away:
// "i can't see the models of the lights now … when we see device 3d model it better".
// View A already drew a body per lamp; the other rooms drew only the beam. This is the
// same FixtureBodies (one InstancedMesh per kind × part × material, ~40 draw calls for a
// hundred lamps, no light of its own), fed from the document by rigBodyLamps.
//
// Lazy-loaded by the rooms and mounted only when the document has a typed lamp, so a
// space with no rig pays nothing — not even the fixture models' download.

export default function RigBodies({ entities, library = TYPE_LIBRARY }) {
    const shownLibrary = useMemo(() => libraryWithShow(library, entities), [library, entities])
    const lamps = useMemo(() => rigBodyLamps(entities, shownLibrary), [entities, shownLibrary])
    // The rig's own light coming back off the hall (rigBounce.js): only in a room whose
    // show carries the hall's enclosure (components.rigBounce); every other room unchanged.
    const bounce = useMemo(() => bounceOf(entities, bounceSpecOf(entities)), [entities])
    if (!lamps.length) return null
    return (
        <>
            <Suspense fallback={null}>
                <FixtureBodies lamps={lamps} library={shownLibrary} />
            </Suspense>
            {/* strobes and blinders: their face and their flash (looks.js flashEntities) */}
            <RigFlashes entities={entities} />
            {/* the visualiser's stopwatch: idle unless a page asked (visProbe.js) */}
            <DmxProbe entities={entities} />
            {/* the hazers and fog machines, for the room's haze field (hazeField.js) */}
            <HazeMachines entities={entities} library={shownLibrary} />
            {bounce ? <ambientLight color={bounce.color} intensity={bounce.intensity} /> : null}
            {bounce ? <HazeGlow bounce={bounce} spec={bounceSpecOf(entities)} /> : null}
        </>
    )
}

// The room's hazers and fog machines handed to the beams' haze (atmosphereStore.js):
// where each stands, which way it blows and how much fluid it turns into haze. They are
// the rig's own entities (the off-DMX effects of the Known versions), typed by the same
// library the bodies are — no second list of machines.
function HazeMachines({ entities, library }) {
    const { gl } = useThree()
    const machines = useMemo(() => hazeMachinesOf(entities, (id) => typeById(library, id)), [entities, library])
    useEffect(() => {
        setHazeMachines(gl, machines)
    }, [gl, machines])
    useEffect(() => () => setHazeMachines(gl, []), [gl])
    return null
}

// The haze between the viewer and the far hall is lit by the same return: the room's
// fog, which stands for the haze's extinction (realism.mjs), takes the colour of the
// air's in-scattered light — in a uniform field of radiance L = E/π, a haze of
// transmittance T adds L·(1 − T), which is exactly three.js's fog mix with that colour
// (linear, before tone mapping). Black when the rig is dark; red in the red room.
const glowColour = new THREE.Color()
function HazeGlow({ bounce, spec }) {
    useFrame(({ scene, gl }) => {
        if (!scene.fog) return
        // the haze's own scatter on top of the walls' return (rigBounce.js hazeGlowFactor),
        // with the haze the beams are drawn in: the field's fill, else the room's scattering
        const sigma = getHazeField(gl)?.fill ?? getAtmosphere(gl)?.scattering ?? 0
        glowColour.set(bounce.color).multiplyScalar((bounce.intensity / Math.PI) * hazeGlowFactor(spec, sigma))
        scene.fog.color.copy(glowColour)
    })
    return null
}
