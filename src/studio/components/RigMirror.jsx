import { Suspense } from 'react'
import { Billboard, Text } from '@react-three/drei'
import { TROIKA_FONT_URL } from '../../project/viewport/troikaFont.js'
import { useLightingMirror } from '../../rigMirror/useLightingMirror.js'
import { RIG_FLOOR, rigFloorPosition } from '../../rigMirror/rigFloor.js'

// THE REAL RIG, MIRRORED INTO THE ROOM. Read-only editor furniture.
//
// One small glowing marker per patched fixture, showing the colour and level that
// fixture is emitting right now (src/rigMirror/useLightingMirror.js). Step 2 of "one
// project is one stage" (di-atlas/decisions/2026-09-20-one-project-one-stage.md).
//
// What this is NOT: the markers are not objects. They are not in the project, cannot
// be selected, are never saved, and are never drawn for a visitor — only the Studio
// editor passes `rigMirror`, and only while its Rig switch is on.

// Where the plan lies on the floor: src/rigMirror/rigFloor.js, shared with the
// sender that walks the same mapping back. Re-exported so nothing that reads the
// markers' constants has to know they moved.
export { RIG_FLOOR, rigFloorPosition } from '../../rigMirror/rigFloor.js'

// A rig that is dark is still a rig: a dim neutral marker, so blackout reads as
// "the lamps are here and off", not as "nothing is patched".
const DARK_COLOUR = '#5c6166'
const DARK_GLOW = 0.18

// The marker carries HUE in its colour and BRIGHTNESS in its glow, so a lamp at 10%
// is a faint amber, not a muddy brown. `colour` arrives already dimmed; divide the
// level back out to get the hue at full.
export const rigMarkerLook = (fixture) => {
    const level = Math.max(0, Math.min(1, Number(fixture?.level) || 0))
    const { r = 0, g = 0, b = 0 } = fixture?.colour || {}
    const peak = Math.max(r, g, b)
    if (level <= 0.004 || peak <= 0) return { lit: false, colour: DARK_COLOUR, glow: DARK_GLOW }
    const to = (n) => Math.round(Math.max(0, Math.min(255, (n / peak) * 255)))
    return {
        lit: true,
        colour: `rgb(${to(r)}, ${to(g)}, ${to(b)})`,
        // Never above 1: the material is not tone-mapped, so a glow past 1 would clip
        // channel by channel and turn a deep orange yellow. The curve undoes the
        // display's own: without it a lamp at 15% drew as a bright marker (seen), since
        // the renderer brightens a linear 0.37 to roughly two-thirds grey on screen.
        glow: Math.pow(0.25 + level * 0.75, 2.2)
    }
}

const ignorePointer = () => null

export function RigMirrorMarkers({ fixtures = [] }) {
    if (!fixtures.length) return null
    return (
        <group name="rig-mirror" userData={{ rigMirror: true }}>
            {fixtures.map((fixture) => {
                const position = rigFloorPosition(fixture)
                const look = rigMarkerLook(fixture)
                const label = `${fixture.index ?? ''}.${fixture.name ?? ''}`
                return (
                    <group key={fixture.id} position={position}>
                        {/* raycast off: a marker can never be clicked, hovered or
                            selected, and never steals a click from an object behind it */}
                        <mesh name="rig-mirror-marker" raycast={ignorePointer} userData={{ fixtureId: fixture.id, lit: look.lit }}>
                            <sphereGeometry args={[RIG_FLOOR.radius, 20, 14]} />
                            <meshStandardMaterial
                                color={look.lit ? '#0b0c0e' : DARK_COLOUR}
                                emissive={look.colour}
                                emissiveIntensity={look.glow}
                                roughness={0.6}
                                metalness={0}
                                toneMapped={false}
                            />
                        </mesh>
                        {/* The label waits for its font on its own. Sharing one boundary with
                            the marker kept the whole rig undrawn for the first seconds. */}
                        <Suspense fallback={null}>
                            <Billboard position={[0, RIG_FLOOR.radius + 0.16, 0]}>
                                <Text
                                    font={TROIKA_FONT_URL}
                                    fontSize={0.11}
                                    color="#c8d8e8"
                                    anchorX="center"
                                    anchorY="middle"
                                    outlineWidth={0.01}
                                    outlineColor="#05070a"
                                    raycast={ignorePointer}
                                >
                                    {label}
                                </Text>
                            </Billboard>
                        </Suspense>
                    </group>
                )
            })}
        </group>
    )
}

// Mounted only while the Rig switch is on, so the 10 Hz read starts and stops with it.
export default function RigMirror({ mirror } = {}) {
    const rig = useLightingMirror({ enabled: true, mirror })
    if (!rig.present) return null
    return <RigMirrorMarkers fixtures={rig.fixtures} />
}
