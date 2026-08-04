import WhiteTunnel from './WhiteTunnel.jsx'
import Halo from './Halo.jsx'
import ScanField from './ScanField.jsx'
import TestPattern from './TestPattern.jsx'
import MetaballField from './MetaballField.jsx'
import ReelGlobe from './ReelGlobe.jsx'
import DispersionSphere from './DispersionSphere.jsx'
import { WORLD_PRESETS } from '../palette.js'

// ---- THE SIX-BEAT CUT (2026-07-30) -----------------------------------------
//
// Read the history before retiming anything, because the length of a beat in
// this file has been argued about all day and the reasons are not guessable:
//
//   1. 59 seconds across five unequal sequences became six beats of five, on
//      "6 immersive scenes describing that idea, each 5 sec".
//   2. The dispersion sphere came back as a seventh beat at EIGHT seconds, not
//      five — see WHY THE SPHERE IS THE ONE EXCEPTION below.
//   3. The data field, the light chamber and the body came out, and the
//      metaball field replaced the test pattern. Four beats.
//   4. The test pattern and the light chamber came back. Six beats, and the
//      five-second grammar of (1) with the one exception of (2).
//   5. The reel globe went on the end — the footage beat, at last.
//   6. The light chamber came out again, on direction. Six beats, 37.4s.
//   7. The dispersion sphere was EXTRACTED on 2026-07-31 — asked for as code
//      and removed from the piece, so unlike everything else on this list its
//      files are gone from the repo rather than parked. The complete scene
//      (DispersionSphere.jsx, dispersionControls.js and its test, and
//      DispersionPanel.jsx) was copied out first. Five beats, 35.6s.
//   8. The photogrammetry scan came IN as a sixth beat and went OUT the same
//      day (2026-07-31), after four forms in a row: walk-in room, orbiting
//      shards, point cloud on a turntable, glitching mesh. "no i dont like
//      scan scene" — cut whole, all versions parked (ScanRoom.jsx,
//      ScanShardRoom.jsx, ScanCloudRoom.jsx). Five beats, 35.6s again.
//   9. THE BREATHS came in on 2026-08-01, on direction ("more scenes in the
//      beginning scene's style", placement "spread through the piece" — her
//      explicit call, made knowing the two-white-worlds risk was raised).
//      Two 5s beats in the tunnel's grammar — white light in black air,
//      pulsing at the tunnel's own STROBE_HZ: the halo (rings rippling out
//      of the crushed corridor) after beat 01, the light rain (the measured
//      material precipitating) between the scan and the test pattern. The
//      metaball→globe seam was left alone — that handover is choreographed
//      (the portal) and nothing may sit inside it. Seven beats, 43.2s. Every
//      pre-existing window kept its exact WIDTH and every seam its exact
//      overlap; later rows only shifted.
//  10. The dispersion sphere came BACK the same day ("the scene with amber
//      light and columns — can we have it back, and last scene"), restored
//      from the extraction copy on the Desktop (algovrithm-dispersion-sphere/
//      — the piece was never committed, so git had nothing). Placed as the
//      CLOSE, after the globe, at its defended 8.8s width. Eight beats,
//      50.8s.
//
// The data field, the body, the light chamber and the scan are the scenes cut
// on their own merits rather than for time. All are still in the folder.
//
// The arc, which is the argument the work is making:
//
//   01 tunnel   light, and nothing in it yet — the medium before the message
//   01b halo    the first breath. The corridor is crushed flat — and its pulse
//               survives it: each strobe swell emits a ring, born at the
//               tunnel's own bore, rippling out through the dark
//   02 scan     code as MEASURED material. Hairline bars on exact shells, one
//               machine tick, a scan plane reading the volume
//   02b rain    the second breath. The measured material precipitates — white
//               streaks falling all around, on the same pulse — before the
//               piece stands it up as something you can walk through
//   03 pattern  the measurement becomes ARCHITECTURE and the visitor walks
//               through it — black bars standing in a white void
//   04 metaball the material goes FLUID and surrounds you: black blobs merging
//               and parting on every side of a white room — then closing in,
//               welding into one wall, and opening a portal in it
//   05 globe    the footage, arriving THROUGH that portal rather than after it.
//               A closed shell of reels with the visitor inside it:
//               what the medium is actually full of, as a room — held still,
//               then swiped, then accelerating into noise
//   06 sphere   the epilogue. The reel globe recedes, shrinks and settles on
//               this sphere's exact seat — you step out of one sphere and
//               find another — monumental, fluid, indifferent, with the
//               colonnade strobing in the piece's own white (2026-08-01;
//               it opened amber-from-the-sphere's-hue, changed on direction).
//               The work opens and closes on the same white pulse
//
// THE TWO WHITE ROOMS TOUCH AGAIN, knowingly. This file carried a note saying
// beats 03 and 05 (now 03 and 04) must not sit back to back — two white worlds
// with black content read as one long white passage with a costume change. The
// light chamber separated them and was cut; the scan separated them and was
// cut. What has changed since the note was written is the TRANSITION: the veil
// is no longer a soft dip but a full-coverage glitch burst (TransitionVeil.jsx),
// so the handover between the whites is a hard wall of noise, not a blend —
// the two rooms are punctuated rather than smeared together. If they still
// read as one place in the headset, the fix is a dark separator beat: the data
// field is parked and was written for the job.
//
// WHY THE BEATS ARE NOT ALL THE SAME LENGTH, recorded so nobody "regularises"
// them. A sequence's internal timings are FRACTIONS of its own window, so
// shortening a window shortens every event inside it:
//   - the tunnel keeps its original 5.6s because its ending is choreographed
//     against that window, contact at 86%.
//   - the reel globe gets 22.2s because its acceleration is written in real
//     seconds ("after 10 sec") and read from a constant in its own file. That
//     one does NOT scale with the row — see REEL_WINDOW_SEC in ReelGlobe.jsx,
//     and retime this row only together with it. It was 16.2s until 2026-08-02
//     ("make the reels scene longer to watch"), and lengthening it meant
//     recomputing four fractions inside that file, not dragging this edge:
//     every event in the sequence is a fraction of the window, so the naive
//     retime would have stretched the runaway and the step out too. Both were
//     already the right length and were pinned to their absolute seconds, so
//     the whole +6s landed in the calm feed. Do the same next time.
//
// This is the same class of mistake as Assembly's `travel` was, and that one
// could actually hurt somebody: a distance tuned against a long window becomes
// a velocity nobody agreed to in a short one.
//
// WHAT FIVE SECONDS COSTS THE REST, recorded because it is not free:
//   - the metaball pairs swing on a 2.67s oscillator, so each one merges and
//     parts about twice per beat. Staggered across five pairs that is plenty;
//     it was briefly given eight seconds and did not need them.
//   - the test pattern's walk is eased in and out INSIDE the sequence for the
//     same reason: a velocity ramp tuned to a window has to move with it.
//
// PARKED, not deleted — still in this folder, still working, one import and one
// row away from being back: LightRain.jsx (cut 2026-08-01, one day after it was
// built — the piece kept the halo as its one breath and the rain was the second
// of the same idea), LightChamber.jsx, DataField.jsx, GlyphBody.jsx,
// Assembly.jsx (the only sequence that ever carried a `travel` value; read its
// note before building anything that moves the visitor), GrainField.jsx,
// PixelField.jsx, and the scan in all three of its forms — ScanRoom.jsx
// (glitching mesh), ScanShardRoom.jsx (orbiting shards), ScanCloudRoom.jsx
// (dissolving point cloud).
// Being absent from SEQUENCES is the only thing that makes a scene "not in the
// piece".

// The edit list, in seconds — the same thing a video editor's timeline shows.
// `startSec`/`endSec` are absolute positions in the piece, so retiming means
// editing numbers here and never touching a sequence's code. The piece's total
// run time is derived from these (see ritualDurationSec), not declared: adding
// a sequence at the end makes the work longer instead of squeezing the rest.
//
// Each sequence still receives a LOCAL 0..1 progress, so a sequence's own code
// is unaware of where it sits or how long the piece is. Stretch a clip and its
// animation stretches with it.
//
// Windows OVERLAP by 1.2s on purpose. Where two overlap, both are mounted and
// each fades on its own envelope, so the handover is a cross-fade, not a cut.
// Butt two windows exactly end-to-end and you get a hard edit instead; leave a
// hole between them and the piece plays to an empty room (the director panel
// flags both — see editList.js).
//
// `backdrop` is the sequence's WORLD — colour, fog range, and `ambient`, the
// fill level that says how much unlit air you can see. Backdrop.jsx blends the
// active sequences' values, so the room itself transitions with the scene
// rather than snapping at the boundary; worldLights.js blends `ambient` on the
// same curve and the experience renders it as one ambient light for the whole
// piece (N rows each adding their own would sum into a white-out).
//
// `lights` is optional and absent everywhere below: a row can carry
// `[{ id, kind, color, intensity, position, distance, decay, radius }]` and
// those lamps mount for as long as the row is on screen, fading in and out with
// it. Add them in the director panel and paste the result back here. A light a
// sequence ANIMATES stays that sequence's own code — the tunnel's travelling
// strobe is not authorable and is not meant to be.
export const SEQUENCES = [
    {
        id: 's01-white-tunnel',
        title: 'White tunnel',
        note: 'Flat white pulled into depth. Strobe rings rush the viewer, fading up out of the dark. It ends on the corridor mouth accelerating into the eye — contact at 86% of the window, then the tunnel is crushed flat and flashes out.',
        startSec: 0,
        endSec: 5.6,
        backdrop: WORLD_PRESETS.tunnel,
        Component: WhiteTunnel
    },
    {
        id: 's01b-halo',
        title: 'Halo',
        note: 'The first breath. The corridor has just been crushed against the eye, and its pulse survives it: every swell of the strobe emits one white ring, born at the tunnel’s own radius, expanding away from the visitor and dissolving into the dark. The tunnel is gone; its heartbeat keeps rippling through the space where it stood.',
        startSec: 4.4,
        endSec: 9.4,
        // Black air, no fill: like the scan, this beat has no surfaces at all
        // — the rings are emissive and unlit by construction, so ambient would
        // land on nothing and only lift the black. Fog closer than the
        // tunnel's 38 because the falloff has to swallow a ring's far arc
        // while it is still alive; the rings' own life-fade covers what fog
        // cannot (their birth at 2.7m and death at 20m).
        backdrop: { color: '#000000', fogNear: 6, fogFar: 26, ambient: 0 },
        Component: Halo
    },
    {
        id: 's02-scan',
        title: 'Scan',
        note: 'Code as measured material. Hairline bars on four cylindrical shells around the standpoint, quantised to three widths like a barcode, switching in contiguous wedges on one 6Hz machine tick. A scan plane sweeps the volume three times as though something were reading it.',
        startSec: 8.2,
        endSec: 14.4,
        // Was written to follow the data field and to share its world, as the
        // same room with the material sorted. The field is out, so this beat
        // now introduces the black rather than resolving it — the world is
        // unchanged because it is still the right one: a measured thing needs
        // unlit air around it, not a lit room.
        backdrop: WORLD_PRESETS.field,
        Component: ScanField
    },
    {
        id: 's03-test-pattern',
        title: 'Test pattern',
        note: 'White. Black slabs on one cell grid in every direction — 26 ranks running from 32m ahead of the standpoint to 30m behind it, so the pattern surrounds the visitor rather than facing them. A fifth of the cells are lit and adjacent ones merge into wide bars; the upper and lower halves step in opposite directions on a 2.6Hz tick while the grid re-rolls between fine and chunky. The lattice streams past at 0.9 m/s, the nearest bars clearing the visitor by 0.7m, and the ranks slide into moiré against each other. The only walk in the piece.',
        startSec: 13.2,
        endSec: 19.4,
        // WHITE — a deliberate exception to rule 1 the same way TUNNEL_WHITE is,
        // and inline rather than a WORLD_PRESETS entry so it can never reach the
        // director panel's swatches (which are dark-only, and test-guarded that
        // way). The metaball field at beat 05 is the other one.
        //
        // The fog is what actually builds the room. This sequence's content is
        // DARK, so distance washing the slabs toward the world colour is the
        // falloff — near bars true black, the tenth rank a grey, no horizon
        // anywhere.
        //
        // fogFar 26 and NOT the 34 it was when this beat was a corridor. The
        // lattice now runs from 32m ahead of the standpoint to 30m behind, and
        // both of those are where ranks are born and retire — the fog has to
        // close before either, or the visitor watches a whole rank appear. See
        // RANKS_BEHIND in TestPattern.jsx: the fog and the lattice's extents are
        // one setting in two files and have to move together.
        //
        // Ambient 0.12 and not more: every slab is an unlit basic material, so
        // fill light lands on nothing here — but this value blends across the
        // handovers into the scan before and the chamber after, and a white
        // room's fill is derived from its own hue (ambientTint), so anything
        // higher pours white into both neighbours.
        backdrop: { color: '#FFFFFF', fogNear: 7, fogFar: 26, ambient: 0.12 },
        // No `travel` row. The corridor comes to the viewer instead — same rule
        // as the tunnel, since the headset owns the camera in XR, and it keeps
        // the walk inside this sequence's own code where its ease-in and
        // ease-out can be tuned against the pattern rather than against the
        // edit list.
        Component: TestPattern
    },
    {
        id: 's05-metaball-field',
        title: 'Metaball field',
        note: 'White. Nine pairs of black metaballs orbiting the standpoint, each pair attracting and repelling on a real oscillator so the two fuse into one form, hold, and pull apart again — kynd\'s exponential smooth minimum, in three dimensions and all the way around the visitor. Over the last third they close in, swell, and weld into a single black wall, which then opens a circular portal with the reel globe already visible through it. Raymarched as a silhouette, because the reference has no light in it at all.',
        startSec: 18.2,
        endSec: 26.4,
        // The second white world, and `color` here MUST match
        // MetaballField.jsx's own WORLD constant. The shader washes the ink
        // toward that colour with distance rather than using scene fog — it is
        // drawn on a fixed-radius shell, so scene fog would tint it by the
        // shell's distance instead of the blob's — and if the two whites
        // disagree the far blobs fade to a grey that is visibly not the
        // background.
        //
        // fogNear/fogFar are what the room does to everything ELSE mounted
        // across the handovers; the blobs carry their own. Ambient as the test
        // pattern has it, and for the same reasons.
        backdrop: { color: '#FFFFFF', fogNear: 7, fogFar: 34, ambient: 0.12 },
        Component: MetaballField
    },
    {
        id: 's06-reel-globe',
        title: 'Reel globe',
        note: 'The footage, finally, and as a room rather than a swarm. A closed globe of 288 video frames tiled edge to edge on a latitude/longitude grid — the columns chosen so every cell at the equator is a true 9:16 reel — with the standpoint at its centre. Every clip in the folder is scattered across it, no reel ever touching itself, which is what a feed is. It does not rotate: the visitor turns, the globe does not.',
        // PLACED LAST, and that is an argument rather than a convenience. Every
        // other beat is the MEDIUM — light, noise, measurement, pattern, fluid,
        // monument. This is what the medium is actually full of, so it reads as
        // the answer to the scenes before it rather than as a clip reel dropped
        // into an abstract piece. It is also the closest thing the work has to
        // the 'scroll' and 'entering' beats parked on 2026-07-26 for want of
        // footage, which is now shot — and the globe is nearer to 'entering'
        // than the swarm ever was, because the footage encloses the visitor
        // instead of passing them.
        //
        // TWENTY-ONE seconds of screen time on a 22.2s window, on direction
        // (2026-08-02: "make the reels scene longer to watch"), and four times
        // the length of any abstract beat. Two reasons it earns it: this is the
        // only sequence with anything to READ in it, and the scroll does not
        // begin until five seconds in — so a shorter row would be a still globe
        // with a scroll bolted onto its exit rather than a room that holds,
        // then moves.
        //
        // THE SCROLL RATE DOES NOT SCALE WITH THIS NUMBER. It is integrated per
        // second inside the sequence, deliberately, because it is a velocity the
        // inner ear responds to — see THE SCROLL in ReelGlobe.jsx. Shortening
        // this row shortens how far the globe travels; it does not speed it up.
        // That is the opposite of how every other beat behaves and it is the
        // safe direction for the exception to run in.
        //
        // Which is also why the +6s was not a drag of this edge alone. Every
        // event INSIDE the sequence is a fraction of the window, so the naive
        // retime would have stretched the runaway and the step out too — both
        // already the right length. ReelGlobe's four event fractions were
        // recomputed to hold their absolute seconds, so all six seconds land in
        // the calm readable feed (5s of scrolling became 11s) and nothing else
        // in the beat moved. Retiming this row again means redoing that.
        startSec: 23.2,
        endSec: 45.4,
        // Near-black, and the fog values do not matter to the globe itself —
        // ReelGlobe turns fog off, because every cell sits at exactly the same
        // radius and fog would apply one flat grey wash to the whole shell
        // rather than giving it depth. They still matter to the CROSS-FADE: this
        // row's world blends with the sphere's across the handover, so the
        // numbers are kept close to that sequence's own.
        //
        // Ambient 0: every cell is an unlit basic material showing video, so
        // fill light lands on nothing at all and would only lift the black
        // behind the shell.
        backdrop: { color: '#04050A', fogNear: 6, fogFar: 24, ambient: 0 },
        // NO VEIL on this arrival. The metaball field opens a portal with this
        // globe already visible through it, and then irises the wall out past
        // the visitor — that IS the transition, choreographed in the sequence
        // itself. The generic grey dip used to land at the exact middle of the
        // 3.2s overlap (29.0s), on top of the reveal. See transitions.js.
        veil: false,
        Component: ReelGlobe
    },
    {
        id: 's07-dispersion-sphere',
        title: 'Dispersion sphere',
        note: 'The monument, restored as the close (2026-08-01, her ask: the amber-columns scene back, as the last scene). A vast floating sphere in a dark colonnade, its surface a procedural fluid — iridescent colour welling out of three wandering sources — while the eight columns strobe outward in sequence, in the piece’s own strobe white (her call, same day: the work opens and closes on the same white pulse). The reel globe does not cut to it: it recedes, shrinks and settles exactly where this sphere hangs — you step out of one sphere and find another.',
        // 8.8 seconds of screen time, the width this scene had before it was
        // extracted and the width its README defends: the colonnade fires
        // between 0.42 and 0.74 of LOCAL progress, so a shorter window fires
        // the amber before the sphere has established itself (the exact
        // failure the 5s grammar caused it once already).
        //
        // This also amends the globe's PLACED LAST note above, on direction.
        // The globe is still the answer to the abstract beats; the sphere is
        // now the epilogue after it — the noise ends and something monumental
        // and indifferent is still there.
        //
        // Rippled +6.0s on 2026-08-02 when the globe was lengthened. The WIDTH
        // is untouched and the 1.2s overlap with the globe is preserved — shift
        // both numbers by the delta, never butt the rows together.
        startSec: 44.2,
        endSec: 53.0,
        // Authored fresh — the old row did not survive the extraction. Values
        // derived from the scene's own geometry: near-black with a slight cool
        // cast (the colonnade is lit stone, so unlike the emissive beats a
        // cast has something to sit under), fog clearing the farthest columns
        // (z ≈ -34) and swallowing the back wall (z = -41), a low fill so the
        // stone reads between strobes. Retune by eye in the director panel.
        backdrop: { color: '#0D1114', fogNear: 4, fogFar: 44, ambient: 0.16 },
        // NO VEIL on this arrival either — the second row to earn the flag.
        // The reel globe's last fifth IS the transition (see EXIT_START in
        // ReelGlobe.jsx): the globe pulls away from the visitor, shrinks, and
        // lands on this sphere's exact seat while this scene fades up around
        // it. A glitch wall over that handover would hide the one continuous
        // movement the ending is built on ("smooth transition — you were in
        // the sphere and here's outside", 2026-08-01).
        veil: false,
        Component: DispersionSphere
    }
]


// Total run time = the last frame anyone is on screen. Derived, so the clock
// can never disagree with the edit list.
export const ritualDurationSec = (sequences = SEQUENCES) =>
    sequences.reduce((longest, sequence) => Math.max(longest, sequence.endSec), 0)
