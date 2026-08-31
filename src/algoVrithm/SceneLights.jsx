import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { AMBIENT_VALUE } from './palette.js'
import { fadeEnvelope } from '../timeline/clock.js'
import { hazeTexture } from './LightHaze.jsx'
import { DEFAULT_AMBIENT, LIGHT_INTENSITIES, lightObjectName, resolveAmbient, resolveLight, rowLights } from '../timeline/worldLights.js'

// One row's lamps, mounted for as long as that row is on screen.
//
// The lights are DATA on the edit-list row (see worldLights.js) rather than
// JSX inside a sequence, which is what makes them placeable: the director panel
// edits the same numbers the drag handles write, and "Copy edit list" emits
// them. A sequence still owns any light it ANIMATES — the tunnel's travelling
// strobe is per-frame code and stays where it is.
//
// Mounted at the stage level, NOT inside the sequence's transform group. Two
// reasons: a light is a property of the room rather than of the content, so
// nudging a sequence's placement must not drag its lighting along with it; and
// the gizmo writes back whatever `position` it finds on the object, which is
// only the authored world position while the parent is the scene itself.

/**
 * Fade width for a light's own envelope.
 *
 * 0.15 — the house default, the same shape a sequence fades its visuals on —
 * and deliberately NOT the room's 0.34. The room's number is a cross-blend
 * between normalised shares, so a wide fade costs nothing; this one scales an
 * ABSOLUTE intensity, and at 0.34 a lamp would only reach its authored value
 * for a third of the clip. The author would then tune against a number the
 * light almost never actually renders at.
 */
const LIGHT_FADE = 0.15

/**
 * How opaque a `glow`'s visible volume is at full intensity.
 *
 * Quiet, for the reason LightHaze's clouds are quiet: this is an ADDITIVE
 * sprite, so it sums with the haze already in the room and with any other glow
 * near it. It is meant to read as the air around a lamp being lit, not as a
 * disc hanging in front of one.
 */
const GLOW_ALPHA = 0.22

/**
 * Lift a room colour to its fill light, writing into `target` in place.
 *
 * The allocation-free form of palette.js's `ambientTint`, and deliberately the
 * same three calls with the same constant rather than a second derivation:
 * a test asserts the two agree exactly for every world swatch, so this cannot
 * drift into being a different rule.
 *
 * In place because this is a per-frame path. `ambientTint` takes and returns a
 * hex string and builds a THREE.Color to do it — correct for authoring, three
 * allocations per frame at 90Hz in a headset for the same answer.
 */
export const applyAmbientTint = (target, room, hsl = { h: 0, s: 0, l: 0 }) => {
    // sRGB on both ends: `room` is held in the linear working space, and every
    // constant in the palette was measured in sRGB, so reading the hue and
    // writing the value back linearly would mean something else entirely.
    room.getHSL(hsl, THREE.SRGBColorSpace)
    return target.setHSL(hsl.h, hsl.s, AMBIENT_VALUE, THREE.SRGBColorSpace)
}

/**
 * The room's fill light — ONE ambient light for the whole piece.
 *
 * Per-row ambients would SUM: four overlapping rows would be four times the
 * fill and a flat white-out at exactly the moment a handover most needs to read
 * as one room becoming another.
 *
 * IT IS NOT WHITE. An untinted ambient is white light landing on every surface
 * at once, which is rule 4 of the palette running backwards — white used as a
 * brightener, greying everything out simultaneously and in the one way no
 * single sequence can be blamed for. The air in a room is the colour of that
 * room, so the fill is the world's own hue and chroma lifted to a light value.
 * It needs no field of its own: see ambientTint in palette.js, which recovers
 * the tunnel's hand-tuned #C4D3DC to within three values of 255.
 *
 * THE COLOUR IS READ FROM THE ROOM, not recomputed from the edit list. Backdrop
 * maintains `scene.background` as the blended, eased world colour, so taking it
 * from there means the fill tracks every cross-fade for free — including
 * mid-handover and mid-scrub — and cannot disagree with the room the eye is
 * actually seeing. LightHaze reads the room the same way and for the same
 * reason. It also keeps the blend at one computation per frame instead of two.
 */
export function AmbientFill({ playheadSec, sequences }) {
    const lightRef = useRef(null)
    const scene = useThree((state) => state.scene)
    // Reused, not rebuilt: getHSL fills a target object, and a fresh literal
    // per frame is garbage at 90Hz for a value that lives one line.
    const hsl = useRef({ h: 0, s: 0, l: 0 })

    useFrame(() => {
        const light = lightRef.current
        if (!light) return
        light.intensity = resolveAmbient(playheadSec, sequences)
        // Absent only before Backdrop's first layout effect has run, or in a
        // list where nothing declares a world at all.
        const room = scene.background
        if (room) applyAmbientTint(light.color, room, hsl.current)
    })

    // Mutated from the frame loop above rather than driven by props — the
    // playhead ticks 90 times a second and a re-render per value would churn
    // the reconciler for a number three.js reads directly off the object.
    return <ambientLight ref={lightRef} intensity={DEFAULT_AMBIENT} />
}

export default function SceneLights({ rowId, lights, progress }) {
    const resolved = useMemo(() => rowLights({ lights }).map(resolveLight), [lights])

    // Only paid for when a glow is actually in the room — the texture is
    // rasterised pixel by pixel the first time anything asks for it.
    const texture = useMemo(
        () => (resolved.some((light) => light.kind === 'glow') ? hazeTexture() : null),
        [resolved]
    )

    if (progress === null || !resolved.length) return null

    // THE REASON THIS COMPONENT TAKES `progress` AT ALL. A light that switches
    // on at full strength as the playhead crosses a boundary is the hard cut
    // Backdrop.jsx exists to prevent, and a lamp is worse than a colour: in a
    // headset it lands as a flash across the whole field of view, with the
    // pupil response to match. Every intensity in here is multiplied by the
    // row's own envelope, so a lamp arrives and leaves with its sequence.
    const fade = fadeEnvelope(progress, LIGHT_FADE)

    return (
        <>
            {resolved.map((light) => (
                // Named so the gizmo can find it by name the way it finds a
                // sequence group — lights unmount when their row's window
                // closes, which a threaded ref does not survive.
                <group
                    key={light.id}
                    name={lightObjectName(rowId, light.id)}
                    position={light.position}
                >
                    <pointLight
                        color={light.color}
                        intensity={light.intensity * fade}
                        distance={light.distance}
                        decay={light.decay}
                    />
                    {light.kind === 'glow' && texture && (
                        // The Turrell move: the light itself is a thing in the
                        // room, not only something you see the effect of. Same
                        // falloff and the same blending rules as the
                        // atmosphere, so a glow reads as a bright patch of the
                        // air that is already there rather than as a new kind
                        // of object.
                        <sprite scale={[light.radius * 2, light.radius * 2, 1]}>
                            <spriteMaterial
                                map={texture}
                                color={light.color}
                                transparent
                                // Tied to intensity, capped at the "lit" stop:
                                // turning a lamp up should make its glow
                                // brighter too, but the strobe stop is four
                                // times "soft" and would otherwise render a
                                // flat white disc.
                                opacity={GLOW_ALPHA * fade * Math.min(1, light.intensity / LIGHT_INTENSITIES.lit)}
                                blending={THREE.AdditiveBlending}
                                // Must not write depth: this is a volume of
                                // light, and a depth-writing sprite punches a
                                // hole in whatever is behind it — which on a
                                // transparent cloud looks like a rectangular
                                // bite out of the scene. See LightHaze.jsx.
                                depthWrite={false}
                                // Unlit and untone-mapped — a light source, not
                                // a surface being lit.
                                toneMapped={false}
                                fog={false}
                            />
                        </sprite>
                    )}
                </group>
            ))}
        </>
    )
}
