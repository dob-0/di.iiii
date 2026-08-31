import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { fadeEnvelope, smoothstep } from '../../timeline/clock.js'
import { TUNNEL_WHITE } from '../palette.js'
import { hazeTexture } from '../LightHaze.jsx'

// Sequence 01 — the white tunnel.
//
// The opening image: a white corridor with strobing rings rushing past. It is
// the "pixels becoming space" beat — a flat white screen pulled into depth.
//
// CRITICAL VR RULE: never move the camera. In an XR session the headset owns
// the camera pose — moving it fights the visitor's own head and is a reliable
// way to make people sick. So the tunnel travels past a stationary viewer
// instead. Same visual result, no motion conflict.

const RING_COUNT = 52

// Pulled in from 3.2 on direction ("more immersive"). Enclosure is a ratio, not
// a distance: at 3.2m the walls sat outside the eye's comfortable read and the
// corridor was something being looked AT down its length. At 2.7 they are close
// enough to fill peripheral vision in a headset, which is where the feeling of
// being inside something actually comes from. Much tighter than this and the
// rings start clipping the near plane as they pass.
export const TUNNEL_RADIUS = 2.7
export const TUNNEL_LENGTH = 96

// How far the corridor continues BEHIND the viewer. Must exceed the scene's
// fog far plane (now 38, raised with the throat glow) or turning around shows
// the tunnel's open end as a hard rim floating in space. With look-around on a
// flat screen and a headset that can turn all the way, "behind" is now
// somewhere people actually look.
export const TUNNEL_BEHIND = 44
export const TUNNEL_AHEAD = TUNNEL_LENGTH - TUNNEL_BEHIND
const RING_SPACING = TUNNEL_LENGTH / RING_COUNT

// ---- the LED runs ----------------------------------------------------------
//
// Strips of light running ALONG the corridor, not around it. The rings alone
// give rhythm but no convergence: every one of them is a circle centred on the
// vanishing point, so nothing in the frame actually points into the distance.
// Lines running lengthwise are what perspective bites on — they converge, and
// that convergence is most of what reads as depth in a real LED tunnel.
//
// They are segmented rather than continuous so they travel with the rings. An
// unbroken line would be geometrically correct and completely static, and the
// corridor would lose the sense of being rushed through.
const STRIP_LINES = 8
const STRIP_SEGMENTS = 12
const STRIP_COUNT = STRIP_LINES * STRIP_SEGMENTS
const STRIP_LENGTH = 5
const STRIP_SPACING = TUNNEL_LENGTH / STRIP_SEGMENTS
const STRIP_THICKNESS = 0.05

// ---- the throats -----------------------------------------------------------
//
// THE FIX FOR THE BLACK HOLE. Fog blends the corridor toward the world colour
// with distance, and that colour is dark by necessity — the room's whole fill
// light is derived from it (ambientTint), so it cannot be lightened without
// flattening every surface in the sequence. Left alone, the result is a white
// room with a black disc at the end of it: the aperture reads as a hole rather
// than as distance.
//
// So the corridor's ends get actual lights in them. Additive sprites on the
// axis, unfogged, sitting where the corridor dissolves — it now recedes INTO
// light. The walls occlude them naturally: anything past the tube's radius at
// that depth is behind wall geometry that is nearer to the eye, so each glow is
// masked to exactly the shape of its opening without a mask being drawn.
//
// This also restores the value ladder the dark was providing. Bright near
// walls, falloff through the middle distance, luminous throat — two lit zones
// with shade between them reads as far more depth than white-to-black ever did.
//
// THERE ARE TWO, AND THAT IS THE POINT. This piece is 360 look-around from a
// fixed standpoint: the visitor's "forward" is wherever they happen to have
// turned, so the corridor has no front. Lighting only the -Z end does not
// remove the black hole, it relocates it to behind the viewer's head, where it
// is worse for being found by accident. Anything that closes off a direction
// has to close off both.
const THROAT_AHEAD_Z = -34
const THROAT_BEHIND_Z = 34
export const THROAT_DEPTH = 34
const THROAT_HAZE_SIZE = 18
const THROAT_CORE_SIZE = 6.5

// Master level for both throats. Kept at full: these are LIGHT, not background,
// and they survive the corridor going black for the same reason the rings do.
//
// Recorded because it was tested: turning them off was the first guess at the
// pale wash across the middle of the frame after the walls went black, and it
// changed nothing. The wash was the wall's own specular highlight — see the
// note on the shell material below.
const THROAT_GAIN = 1

// The corridor's axis has to sit at the viewer's eye height, not on the floor.
// Centred at y=0 the camera rides against the tunnel wall and the rings read
// as giant arcs sweeping past rather than a corridor you are standing inside.
const AXIS_HEIGHT = 1.6

// Pulse rate, in cycles per second. Was 3Hz with a hard-edged flash; softened
// to a slow swell on direction ("more smooth"), and because a strobe was
// pulling against the rest of the piece — the chamber breathes on a 26-second
// period and the opening was flashing three times a second.
//
// Still far below the 15-25Hz band associated with photosensitive seizures,
// and now further from it than before, which is a safety improvement as well
// as an aesthetic one.
// Exported: this rate IS the piece's pulse. The breath beats (Halo.jsx,
// LightRain.jsx) swell on the same clock so the whole work has one heartbeat
// rather than three — retune it here and every white beat retunes together.
export const STROBE_HZ = 0.85

// How hard the pulse peaks. 6 gave a near-square flash — sharp on, sharp off.
// At 2 it is a swell: the corridor brightens and dims continuously with no
// moment you could point at as "the flash". That continuity is most of what
// "smooth" means here.
export const STROBE_SHARPNESS = 2

// ---- the mouth -------------------------------------------------------------
//
// How the sequence ends: the dark far end of the corridor comes at you and
// swallows the frame. It reads as the tunnel's own opening approaching, so the
// piece arrives in the dark rather than fading to it.
//
// It is a flat disc capping the tunnel exactly, and it does not grow — it only
// travels. Perspective does the growing, which is why it reads as an object
// coming toward you rather than as a circle being scaled up. Scaling it in
// place is the version of this that looks like a title card.

// Where it waits. Well down the corridor, subtending only a few degrees, so it
// starts as the dark line at the end of the tunnel rather than as an arrival.
export const MOUTH_FAR = -48

// Where it stops. NOT past the camera: a flat disc crossing the eye goes
// edge-on for a frame and vanishes, punching a hole in the blackout at the
// exact moment it should be complete. At this distance a 2.7m disc subtends
// about 175 degrees, which covers a headset's field of view with room to spare.
const MOUTH_NEAR = -0.12

// When it starts moving, as a fraction of the sequence. The approach owns the
// back half of the tunnel.
const MOUTH_START = 0.42

// ---- the impact and the crush ----------------------------------------------
//
// On direction, 2026-07-30: "the circle in the end of tunnel want to zoom in
// and crush". Two changes, and they only work as a pair.
//
// ZOOM. The approach used to be a SQUARED SMOOTHSTEP, which is slow-in AND
// slow-out — the disc decelerated over the last metre and settled against the
// eye. Nothing that arrives gently can hit anything. A plain power curve on
// linear progress has velocity rising the whole way, so the last half-second is
// the fastest half-second, and the disc is still accelerating when it lands.
const MOUTH_EASE = 2.6

// Where it lands, as a fraction of the sequence. Contact is now an EVENT at a
// known moment rather than the last frame of the window: everything after this
// is the crush, and the sequence needs room for it.
const MOUTH_IMPACT = 0.86

// The crush itself. At contact the corridor is collapsed along its own axis —
// the rings, the LED runs and the throat glow are telescoped into the plane of
// the eye. It is one line (`corridor.scale.z`) and it does the thing the word
// asks for: the tunnel is not faded out, it is squashed flat.
//
// This is why the collapse is worth doing in a piece where a disc is already
// covering the view. The mouth covers FORWARD. In 360 from a fixed standpoint
// half the visitors are looking somewhere else at second seven, and for them the
// blackout has to happen to the corridor around them, not to a shape in front of
// a direction they are not facing.
//
// Clamped off zero: a zero scale is a non-invertible matrix, which three warns
// about once per frame.
const CRUSH_FLOOR = 0.001

// WHERE the corridor collapses to, and this is not a detail — it was a bug.
//
// Scaling z alone converges everything on the group's origin, which is the
// VIEWER'S OWN EYE. Seen in the running piece: at contact the 52 rings piled
// into one plane at z=0, half of them straddling the camera's near plane, and
// 52 semi-transparent rings stacked on top of each other summed into a bright
// bar across the middle of the frame. Worse, all of it sat NEARER than the
// mouth at -0.12, so the one thing that is supposed to be covering the view was
// behind the wreckage and the blackout never happened.
//
// So the collapse plane travels out in front of the eye as it closes. The
// corridor still gives way, but it gives way just behind the disc that is
// crushing it, which is the only place the geometry can go and still be
// eclipsed. -1.2m is far enough to clear any near plane a headset might use and
// close enough to read as the walls arriving.
const CRUSH_PLANE = -1.2

// How fast the corridor's light dies once contact is made. SQUARED, not linear:
// crushing the tube stacks every ring and every LED run into one plane, and
// coincident emissive surfaces sum. A linear fade leaves that pile-up brighter
// at mid-crush than the corridor ever was in normal running, which reads as an
// explosion of light rather than as a tunnel being put out.
const CRUSH_DIE = 2

// The bang. The disc flashes at contact and decays to black across the crush,
// so the corridor's light is not dimmed away — it is knocked out.
//
// CUBED decay, so the spike is over in about a fifth of the crush window
// (roughly 0.2s at the current timing) and the remaining 0.8s is the piece
// arriving in the dark. A linear decay here is a white screen you sit in.
const CRUSH_DECAY = 3

// How hot the flash goes, against a disc that fills essentially the whole field
// of view. NOT 1: this material is untone-mapped, the room around it is black,
// and the eye is dark-adapted by second seven — a full-white slam across a
// headset's FOV is painful rather than dramatic. It is a single event, nowhere
// near the 15-25Hz band that matters for photosensitivity.
const CRUSH_LEVEL = 0.75

// Pure black, and it has to track the world colour rather than sit just under
// it. This was #05070A back when the corridor fogged to a near-black with a
// cast; now that the world IS black, a mouth at #05070A would be LIGHTER than
// the distance behind it and the whole thing inverts — the opening reads as a
// pale disc hanging in the dark instead of as a hole in a lit corridor.
//
// It no longer starts as the visible dark line at the end of the tunnel, which
// is what it used to be: parked at MOUTH_FAR in air that is already black, it
// is simply not there yet. That is the better read now — it emerges out of the
// dark and eclipses the throat glow on its way in, so the arrival is something
// putting the light out rather than a shape that was always waiting.
const MOUTH_COLOR = '#000000'

// ---- the corridor's surface ------------------------------------------------
//
// BLACK, on direction ("i want tunnel be fully black background"), and this
// reverses the white-walls decision rather than adjusting it. Worth stating
// plainly so nobody re-derives the old rule from the comments above and quietly
// puts the grey back.
//
// The wall is a tube wrapped around the viewer's head, so it is not one surface
// among several — it IS the background, filling essentially the whole frame at
// every heading. Every earlier round of "less white" was tuning its VALUE
// (#FFFFFF → #C4D3DC); this takes it to zero. What is left is the light itself:
// the rings, the eight converging LED runs, and the lit throat at each end,
// standing in black.
//
// Consequence, accepted: the corridor no longer has a lit surface, so the two
// travelling strobe lamps light nothing and the pulse now lives entirely in the
// emissive rings and runs (which were already driven by `flash`, so the rhythm
// is unchanged). The lamps are kept rather than deleted — they cost almost
// nothing and they are what this needs back if the walls ever return.
//
// The shell itself is NOT removed. It still writes depth, which is what masks
// the throat sprites to the shape of the corridor's opening — delete it and the
// glows become two full discs floating in the dark, with the tunnel's aperture
// gone. Black geometry that occludes is doing real work here.
//
// One line to put the corridor back: TUNNEL_WHITE.wall.
const TUNNEL_SHELL = '#000000'

export default function WhiteTunnel({ progress }) {
    const ringsRef = useRef(null)
    const stripsRef = useRef(null)
    const shellRef = useRef(null)
    const strobeLightRef = useRef(null)
    const strobeBehindRef = useRef(null)
    const mouthRef = useRef(null)
    const throatsRef = useRef(null)
    const corridorRef = useRef(null)
    const dummy = useMemo(() => new THREE.Object3D(), [])
    const throatMap = useMemo(() => hazeTexture(), [])

    // The two ends of the mouth's colour ramp, built once. Constructing a
    // THREE.Color per frame inside the flash would allocate at 72-90Hz.
    const mouthDark = useMemo(() => new THREE.Color(MOUTH_COLOR), [])
    const mouthFlash = useMemo(() => new THREE.Color(TUNNEL_WHITE.ring), [])

    // Where each LED run sits on the wall, and how far along it starts. The
    // per-line offset staggers the segments into a shallow helix — without it
    // all eight lines break at the same z and the corridor reads as a stack of
    // hoops rather than as continuous runs of light.
    const strips = useMemo(() => (
        Array.from({ length: STRIP_COUNT }, (_, index) => {
            const line = index % STRIP_LINES
            const segment = Math.floor(index / STRIP_LINES)
            const angle = (line / STRIP_LINES) * Math.PI * 2
            return {
                // Just inside the wall. Sitting exactly ON it z-fights with the
                // shell, which flickers as a rash of dots across the corridor.
                x: Math.sin(angle) * (TUNNEL_RADIUS - 0.05),
                y: Math.cos(angle) * (TUNNEL_RADIUS - 0.05),
                offset: segment * STRIP_SPACING + (line / STRIP_LINES) * STRIP_SPACING
            }
        })
    ), [])

    // Fades UP, on direction ("the tunnel part needs to be started by fading").
    // This reverses the earlier rule, which was that the opening frame of the
    // piece must be at full strength or the work spends its first second on an
    // empty room — worth saying plainly so nobody restores the zero from the
    // reasoning that is still in fadeEnvelope's own comment.
    //
    // What makes it work now is that it is not the only fade at t=0. The veil
    // already bookends the piece with a 0.9s dip to the backdrop, and the
    // backdrop here is true black, so the corridor was being REVEALED at full
    // brightness behind a lifting curtain. Giving the tunnel its own ramp over
    // roughly the same second means the light arrives instead: the strobe comes
    // up out of the dark rather than being uncovered by it.
    //
    // Kept short. Longer than this and the first thing the piece does is wait.
    const FADE_IN = 0.14
    const envelope = fadeEnvelope(progress, FADE_IN, 0.4)

    // Travel accelerates through the sequence — the corridor speeds up as the
    // ritual takes hold.
    const speed = 6 + smoothstep(0, 1, progress) * 22

    // How far the mouth has come, 0..1, reaching 1 at CONTACT rather than at the
    // end of the window. Accelerating the whole way — see MOUTH_EASE.
    const approach = Math.pow(
        THREE.MathUtils.clamp((progress - MOUTH_START) / (MOUTH_IMPACT - MOUTH_START), 0, 1),
        MOUTH_EASE
    )

    // The crush: 0 until contact, 1 at the end of the window.
    const crush = smoothstep(MOUTH_IMPACT, 1, progress)

    // The corridor's light now dies with the CRUSH, not with the approach.
    //
    // It used to fade across the whole run-in, which meant the room was already
    // half dark by the time the disc arrived and the arrival had nothing left to
    // put out. Holding it lit until contact makes the eclipse geometric — the
    // disc covers a lit corridor — and then the crush takes the rest, so the
    // sequence still ends on true black and turning your head at the end still
    // finds nothing. That last property is the one to protect: it is the
    // difference between a blackout and an object in front of your face.
    const lit = envelope * Math.pow(1 - crush, CRUSH_DIE)

    useFrame(({ clock }) => {
        const time = clock.getElapsedTime()

        // A slow swell rather than a strobe. pow() on a sine shapes the peak
        // without branching per frame. See STROBE_SHARPNESS.
        const wave = Math.sin(time * Math.PI * 2 * STROBE_HZ) * 0.5 + 0.5
        const flash = Math.pow(wave, STROBE_SHARPNESS)

        // Split across the two lamps so the total energy in the room is what it
        // always was — this is a redistribution, not a brightening. The forward
        // view loses a little and the view behind gains a lot, which is the
        // trade a 360 piece has to make.
        const strobeIntensity = (3 + flash * 11) * lit * 0.5
        if (strobeLightRef.current) {
            strobeLightRef.current.intensity = strobeIntensity
        }
        if (strobeBehindRef.current) {
            strobeBehindRef.current.intensity = strobeIntensity
        }

        if (shellRef.current) {
            shellRef.current.material.opacity = lit * 0.9
            shellRef.current.material.emissiveIntensity = 0.05 + flash * 0.14
        }

        // The throats breathe with the corridor rather than sitting at a fixed
        // level — a static glow at the end of a pulsing tunnel reads as a
        // separate object hanging in the distance instead of as the same light
        // continuing. Driven by `lit`, so they die with everything else as the
        // mouth arrives and the sequence still ends on true black.
        //
        // Both ends are driven off the same number. Two glows allowed to drift
        // apart would give the corridor a brighter direction, which is a front
        // by another name.
        const throatPulse = 0.7 + flash * 0.3
        const throats = throatsRef.current
        if (throats) {
            throats.children.forEach((sprite) => {
                sprite.material.opacity = lit * sprite.userData.strength * throatPulse * THROAT_GAIN
            })
        }

        const stripMesh = stripsRef.current
        if (stripMesh) {
            for (let index = 0; index < STRIP_COUNT; index++) {
                const strip = strips[index]
                // Same treadmill as the rings, at the same speed: these are the
                // same corridor seen a different way, and any drift between the
                // two immediately reads as two things sliding past each other.
                const travelled = (strip.offset + time * speed) % TUNNEL_LENGTH
                dummy.position.set(strip.x, strip.y, travelled - TUNNEL_AHEAD)
                dummy.rotation.set(0, 0, 0)
                dummy.scale.setScalar(1)
                dummy.updateMatrix()
                stripMesh.setMatrixAt(index, dummy.matrix)
            }
            stripMesh.instanceMatrix.needsUpdate = true
            stripMesh.material.opacity = lit
            // Held under the rings. The rings are the event and the runs are the
            // architecture — pushed to the same brightness they compete, and the
            // corridor loses the pulse that the whole sequence is built on.
            stripMesh.material.emissiveIntensity = 0.6 + flash * 0.7
        }

        // The corridor collapsing into the plane of the eye at contact. One
        // scale, applied to everything that IS the tunnel — see CRUSH_FLOOR.
        //
        // The mouth is outside this group on purpose: it is the thing doing the
        // crushing, and scaling its z would drag it back off the eye at the
        // exact moment it has to be covering the view.
        if (corridorRef.current) {
            corridorRef.current.scale.z = Math.max(1 - crush, CRUSH_FLOOR)
            // Pushed out in front of the eye as it closes — see CRUSH_PLANE.
            corridorRef.current.position.z = CRUSH_PLANE * crush
        }

        // The mouth. Deliberately NOT multiplied by `envelope` like everything
        // else here: the rest of the sequence is fading out over its last 40%,
        // and the one thing that must not fade out is the darkness arriving.
        // It gets stronger exactly as the corridor gets weaker.
        const mouth = mouthRef.current
        if (mouth) {
            mouth.position.z = MOUTH_FAR + (MOUTH_NEAR - MOUTH_FAR) * approach
            // Faded up over the first sliver of the approach so it appears out
            // of the corridor's depth instead of popping into existence.
            mouth.material.opacity = smoothstep(MOUTH_START, MOUTH_START + 0.1, progress)
            mouth.visible = mouth.material.opacity > 0.001

            // The bang. Gated on contact rather than derived from `crush`
            // alone — (1 - crush) is 1 for the whole approach as well, so
            // without the gate the disc would fly in already white.
            const impact = progress < MOUTH_IMPACT ? 0 : Math.pow(1 - crush, CRUSH_DECAY)
            mouth.material.color.copy(mouthDark).lerp(mouthFlash, impact * CRUSH_LEVEL)
        }

        const mesh = ringsRef.current
        if (!mesh) return

        for (let index = 0; index < RING_COUNT; index++) {
            // Each ring marches toward the viewer and wraps around when it
            // passes — a treadmill, so 44 rings read as an endless corridor.
            const travelled = (index * RING_SPACING + time * speed) % TUNNEL_LENGTH
            const z = travelled - TUNNEL_AHEAD

            // Rings breathe slightly out of phase with the strobe so the
            // corridor never feels like a single flat pulse.
            const breathe = 1 + Math.sin(time * 2.2 + index * 0.4) * 0.04

            dummy.position.set(0, 0, z)
            dummy.rotation.set(Math.PI / 2, 0, 0)
            dummy.scale.setScalar(breathe)
            dummy.updateMatrix()
            mesh.setMatrixAt(index, dummy.matrix)
        }
        mesh.instanceMatrix.needsUpdate = true
        mesh.material.opacity = lit
        // Baseline above 1 so the rings clip past a white wall even between
        // flashes. Under 1 they sit BELOW a brightly lit white surface and the
        // corridor loses its rings entirely — which is what makes a white room
        // read as empty glare.
        mesh.material.emissiveIntensity = 0.9 + flash * 1.1
    })

    if (progress === null) return null

    return (
        <group position={[0, AXIS_HEIGHT, 0]}>
            {/* White-lit, but NOT evenly lit. The strobe lamp does almost all
                the work and ambient only keeps the walls from going black
                between flashes.

                This is the difference between a white room and a white void.
                Flood it with ambient and every surface renders the same value,
                which is exactly what made the earlier version read as glare —
                no shading, no falloff, nothing to judge distance by. Low
                ambient plus one strong travelling lamp gives the corridor
                form, and the strobe becomes something that happens TO the
                space rather than the space's constant colour.

                THE AMBIENT LEVEL IS NOT HERE ANY MORE. It is `ambient: 0.22`
                on this sequence's row (WORLD_PRESETS.tunnel), rendered once for
                the whole piece and blended across the handover like the colour
                and fog are — "how much unlit air can you see" is a property of
                the room, and it was a number buried in four different
                components. The travelling strobe below stays: it is animated
                per frame by this sequence, which is what a sequence's own code
                is for. */}
            {/* TWO lamps, mirrored about the standpoint. One lamp at -6 lights
                the corridor ahead and leaves the corridor behind to the ambient
                fill alone, so turning round drops you into a visibly dimmer
                half of the same tube — the piece acquires a front purely from
                where its light was parked. Mirroring costs one more light and
                makes every direction the same room.

                Not merged into a single lamp at the standpoint: a light at the
                eye removes the falloff between here and the wall, and that
                falloff is what gives the corridor its form. Two lamps keep the
                near-bright / far-dim structure and simply give it twice. */}
            {/* THE CORRIDOR ITSELF — everything the crush collapses.

                Grouped so contact is one scale on one object rather than a
                z-multiply threaded through the ring loop, the strip loop and the
                throat sprites, where the three could drift apart and the tunnel
                would come apart in pieces instead of being crushed.

                Squashing z also shortens the LED runs and flattens the ring
                tubes, because instance matrices are inside this transform. That
                is not a side effect to be corrected — it is the corridor's own
                geometry giving way. */}
            <group ref={corridorRef}>
                <pointLight ref={strobeLightRef} color={TUNNEL_WHITE.ring} position={[0, 0, -6]} distance={60} decay={1.4} />
                <pointLight ref={strobeBehindRef} color={TUNNEL_WHITE.ring} position={[0, 0, 6]} distance={60} decay={1.4} />

                {/* The corridor wall. BackSide so we see the inside of the tube —
                    a normal cylinder would be invisible from within. */}
                <mesh ref={shellRef} position={[0, 0, TUNNEL_BEHIND - TUNNEL_LENGTH / 2]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[TUNNEL_RADIUS, TUNNEL_RADIUS, TUNNEL_LENGTH, 48, 1, true]} />
                    {/* UNLIT, and that is the whole point — see TUNNEL_SHELL.
                        A black meshStandardMaterial is not black. Every dielectric
                        in a physically based renderer keeps about 4% specular
                        reflectance no matter how dark its albedo, and this tube has
                        two lamps inside it running up to intensity 14 at a radius
                        of 2.7m. The result was a pale band of highlight wrapped
                        round the corridor at its closest approach — view-dependent,
                        so it tracked the head, which is what made it read as a wash
                        smeared across the middle of the frame rather than as a
                        surface. Roughness 0.9 spreads that highlight out; it does
                        not remove it.
                        meshBasicMaterial ignores lights entirely, so the wall is
                        exactly its own colour and nothing in the scene can lift it.
                        It still writes depth, which is the shell's real job: masking
                        the throat glows to the shape of the corridor's opening. */}
                    <meshBasicMaterial
                        color={TUNNEL_SHELL}
                        side={THREE.BackSide}
                        transparent
                        opacity={0.95}
                    />
                </mesh>

                {/* The throats — light where the black hole was, at BOTH ends.

                    A wide haze and a tighter core at each end: additive, so the two
                    layers SUM into a near-white centre without either drawing an
                    edge. `fog={false}` because the entire point is that these do
                    not dissolve into the depth colour the way the corridor does.
                    depthWrite off — a depth-writing sprite punches its rectangle
                    out of whatever is behind it, which here would be the mouth
                    arriving.

                    Reuses LightHaze's shared falloff rather than rolling a second
                    soft dot: two subtly different glow profiles in one room is
                    visible as two kinds of light, and each copy is another 128x128
                    canvas rasterised on the main thread. */}
                <group ref={throatsRef}>
                    {[THROAT_AHEAD_Z, THROAT_BEHIND_Z].flatMap((z) => ([
                        <sprite
                            key={`throat-haze-${z}`}
                            position={[0, 0, z]}
                            scale={[THROAT_HAZE_SIZE, THROAT_HAZE_SIZE, 1]}
                            userData={{ strength: 0.55 }}
                        >
                            <spriteMaterial
                                map={throatMap}
                                color={TUNNEL_WHITE.ring}
                                transparent
                                opacity={0}
                                blending={THREE.AdditiveBlending}
                                depthWrite={false}
                                toneMapped={false}
                                fog={false}
                            />
                        </sprite>,
                        <sprite
                            key={`throat-core-${z}`}
                            position={[0, 0, z]}
                            scale={[THROAT_CORE_SIZE, THROAT_CORE_SIZE, 1]}
                            userData={{ strength: 0.75 }}
                        >
                            <spriteMaterial
                                map={throatMap}
                                color={TUNNEL_WHITE.ring}
                                transparent
                                opacity={0}
                                blending={THREE.AdditiveBlending}
                                depthWrite={false}
                                toneMapped={false}
                                fog={false}
                            />
                        </sprite>
                    ]))}
                </group>

            {/* The LED runs. Fogged on purpose, unlike the throat: they have to
                fade INTO the glow with distance, or eight hard lines converge on
                a bright point and the corridor turns into a wireframe drawing. */}
            <instancedMesh ref={stripsRef} args={[undefined, undefined, STRIP_COUNT]}>
                <boxGeometry args={[STRIP_THICKNESS, STRIP_THICKNESS, STRIP_LENGTH]} />
                <meshStandardMaterial
                    color={TUNNEL_WHITE.ring}
                    emissive={TUNNEL_WHITE.ring}
                    emissiveIntensity={0.6}
                    transparent
                    opacity={1}
                    toneMapped={false}
                />
            </instancedMesh>

            {/* The strobing rings. One instanced mesh: 52 separate meshes would
                be 52 draw calls a frame, which a standalone headset at 72-90Hz
                cannot spare. */}
            <instancedMesh ref={ringsRef} args={[undefined, undefined, RING_COUNT]}>
                {/* Thick, not hairline. A hairline ring is a drawn line — an
                    edge — where this wants a soft band of light. */}
                <torusGeometry args={[TUNNEL_RADIUS - 0.06, 0.06, 8, 64]} />
                {/* The only true white in the piece, and untone-mapped so the
                    emissive can push past 1.0. That overdrive is what lets a
                    white ring still read as brighter than a white room. */}
                <meshStandardMaterial
                    color={TUNNEL_WHITE.ring}
                    emissive={TUNNEL_WHITE.ring}
                    emissiveIntensity={1}
                    transparent
                    opacity={1}
                    toneMapped={false}
                />
            </instancedMesh>
            </group>

            {/* The mouth — the dark end of the corridor, on its way in, and
                then the flash at contact.

                OUTSIDE the collapse group: it is what does the crushing.

                Circle geometry faces +Z by default and the viewer looks down
                -Z, so it needs no rotation to face them, and it stays fixed in
                the world as they look around: it is somewhere in the corridor,
                not stuck to the camera.

                `fog={false}` is what makes it visible at all. Fog blends
                everything toward the backdrop with distance, and the backdrop
                here IS the corridor's dark — so a fogged dark disc 48m away is
                exactly the colour of the air it sits in and cannot be seen.
                Unfogged, it stays black and reads as a hole rather than as a
                surface, which is the point.

                Radius matches the tunnel exactly, so it caps the corridor
                instead of floating inside it. */}
            <mesh ref={mouthRef} position={[0, 0, MOUTH_FAR]} visible={false} renderOrder={2}>
                <circleGeometry args={[TUNNEL_RADIUS, 64]} />
                <meshBasicMaterial
                    color={MOUTH_COLOR}
                    transparent
                    opacity={0}
                    fog={false}
                    toneMapped={false}
                    side={THREE.DoubleSide}
                />
            </mesh>
        </group>
    )
}
