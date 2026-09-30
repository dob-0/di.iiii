import { Suspense, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import FixtureBodies from './FixtureBodies.jsx'
import RigFlashes from './RigFlashes.jsx'
import DmxProbe from './DmxProbe.jsx'
import { TYPE_LIBRARY } from './types/index.js'
import { libraryWithShow } from './rental.js'
import { rigBodyLamps } from './rigBodyLamps.js'
import { bounceOf, bounceSpecOf } from './rigBounce.js'

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
            {bounce ? <ambientLight color={bounce.color} intensity={bounce.intensity} /> : null}
            {bounce ? <HazeGlow bounce={bounce} /> : null}
            {/* the visualiser's stopwatch: idle unless a page asked (visProbe.js) */}
            <DmxProbe entities={entities} />
        </>
    )
}

// The haze between the viewer and the far hall is lit by the same return: the room's
// fog, which stands for the haze's extinction (realism.mjs), takes the colour of the
// air's in-scattered light — in a uniform field of radiance L = E/π, a haze of
// transmittance T adds L·(1 − T), which is exactly three.js's fog mix with that colour
// (linear, before tone mapping). Black when the rig is dark; red in the red room.
const glowColour = new THREE.Color()
function HazeGlow({ bounce }) {
    useFrame(({ scene }) => {
        if (!scene.fog) return
        glowColour.set(bounce.color).multiplyScalar(bounce.intensity / Math.PI)
        scene.fog.color.copy(glowColour)
    })
    return null
}
