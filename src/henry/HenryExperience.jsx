import { useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import FilmOverlay from './FilmOverlay.jsx'
import FollowCamera from './FollowCamera.jsx'
import Girl from './Girl.jsx'
import Sky from './Sky.jsx'
import { HenryClockDriver, HenryClockProvider } from './dreamClock.jsx'
import DreamWorld from './world/DreamWorld.jsx'
import './henry.css'

// henry — a two-minute dream, walked through.
//
// A very small girl in a very large garden. She reaches a tree with deer under
// it, finds a plush bear the size of a hill and brushes its teeth, and then
// the dream quietly stops being kind. She takes off her glasses and the giant
// world turns out to be a room with houseplants in it. She puts them back on.
//
// Structure, in the order it runs:
//
//   timeline.js      the edit list — six beats, some timed, some waiting on
//                    the player. Pure, tested.
//   dreamClock.jsx    one playhead + the three dials (dream, strange, black)
//                    that every object in the scene reads each frame.
//   dual.js          the reveal, as data: every giant object and the ordinary
//                    object it turns out to be are one mesh at two scales.
//   world/           the objects, all procedural, all authored one unit tall.
//   materials/       flat painted toon shading — see toon.js for why not PBR.
//
// The piece is code, not a Studio project document, so the editor has nothing
// to open for this space — same arrangement as algovrithm.
//
// This is a screen piece, not a headset piece. The camera performs: it drops
// below her shoulder to make the world tower, and it pulls back and rises for
// the reveal. Moves like that are the whole language of the ending and they
// are exactly what you must never do to someone wearing a headset, so there is
// deliberately no XR entry here. A VR cut would need a different camera
// contract (the world moves, the viewer never does) and it would be a
// different edit, not a flag.

const CAMERA = { position: [0, 0.8, 4], fov: 55, near: 0.05, far: 400 }
const GL = { antialias: true, powerPreference: 'high-performance' }

// Long enough to be read once, short enough that it is gone before she gets
// anywhere. No key legend beyond this and no UI afterwards.
const HINT_SECONDS = 7

export default function HenryExperience() {
    const [hintVisible, setHintVisible] = useState(true)

    useEffect(() => {
        const timer = setTimeout(() => setHintVisible(false), HINT_SECONDS * 1000)
        return () => clearTimeout(timer)
    }, [])

    return (
        <div className="henry-root">
            <Canvas camera={CAMERA} gl={GL} dpr={[1, 2]} className="henry-canvas">
                {/* The provider lives INSIDE the canvas on purpose. R3F runs
                    its own reconciler root, so React context does not cross
                    the <Canvas> boundary — a provider outside would leave
                    every object in the scene throwing on first frame. */}
                <HenryClockProvider>
                    {/* First child, so the dials are written before anything
                        reads them this frame. See HenryClockDriver. */}
                    <HenryClockDriver />
                    <Sky />
                    <DreamWorld />
                    <Girl />
                    <FollowCamera />
                    <FilmOverlay />
                </HenryClockProvider>
            </Canvas>

            <div className={`henry-hint${hintVisible ? '' : ' henry-hint--gone'}`}>
                <p className="henry-hint__title">henry</p>
                <p className="henry-hint__line">walk with the arrows or wasd · drag to look · press e when something waits</p>
            </div>
        </div>
    )
}
