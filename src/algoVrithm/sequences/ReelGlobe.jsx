import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { smoothstep } from '../ritualClock.js'
import { createRandom } from '../random.js'
import { attachLimiter } from '../audioBus.js'
import {
    reelPlayers,
    playReels,
    advanceReels,
    armAudioUnlock,
    reelAudioSource
} from '../reelPlayers.js'

// Sequence — the reel globe.
//
// On direction, replacing the reel storm: "not chaotic floating in space — a
// square globe, videos connected, and you are inside of them".
//
// So the footage stops being a swarm and becomes a SHELL. One closed globe of
// video panels, tiled edge to edge with no gaps anywhere, and the standpoint is
// at its centre. There is no outside to it and nothing floats: every direction
// the visitor can turn is another reel, and the reels touch.
//
// ---- WHY THIS IS THE STRONGER VERSION --------------------------------------
//
// The storm was excess as CHAOS — too many, tilted, drifting, cutting in and
// out. This is excess as ENCLOSURE, which is a colder and more accurate picture
// of the same thing. A feed is not a mess of screens floating past you; it is a
// seamless surface with no edge, and the reason you cannot get out of it is not
// that it is chaotic but that it is complete. You are not looking at it. You are
// standing in it, and it goes all the way round.
//
// It is also the beat the piece has been building toward since the tunnel: every
// other sequence is the medium — light, noise, measurement, pattern, fluid — and
// this is the medium closed into a room.
//
// ---- THE TILING ------------------------------------------------------------
//
// A latitude/longitude grid, and the cell proportions are the whole reason for
// choosing it over the obvious alternatives.
//
// The material is vertical 9:16 phone video. A cube subdivided into squares, or
// an icosphere, gives cells that are square or triangular, and a portrait clip
// in a square cell has to be either stretched or cropped in half. A lat/long
// grid lets the cell aspect be CHOSEN: cell width is 2πR/COLS and cell height is
// πR/ROWS, so COLS ≈ 3.56 × ROWS makes every cell at the equator a 9:16 frame.
// The tiling matches the footage instead of fighting it.
//
// Adjacent cells share their corner positions exactly — they are computed from
// the same latitude and longitude values — so the shell is watertight. That is
// what "connected" has to mean here: not panels placed next to each other and
// hoped to line up, but one surface cut into frames.
//
// The cost is the poles, where cells narrow to slivers and the meridians
// converge. That is left visible rather than capped: it reads as a globe, which
// is what it is, and the visitor's eye line is the equator where the cells are
// exactly the reels they were shot as.
//
// ---- WHAT DELIBERATELY DOES NOT HAPPEN -------------------------------------
//
// THE GLOBE STILL DOES NOT ROTATE. Not slowly, not at all. A rotating surround
// is the most reliable way to make somebody sick in VR — rotational vection is
// far worse than linear, and vertical rotation is the worst axis of the three,
// which is why viewerTravel.js has no rotation field either.
//
// The SWIPE does not break this rule, and that distinction is the whole design.
// The shell is bolted still; what moves is what is inside each frame. See THE
// SWIPE below. Moving texture across stationary geometry at fixed depth reads as
// "the pictures changed"; moving the geometry reads as "I moved". Only the
// second one makes people ill.
//
// This was got wrong once, on 2026-07-30, by building the scroll as a slow
// rotation of the whole shell. It was wrong on comfort AND wrong on the brief:
// the direction was "how instagram is scrolling — in frame of video", and a
// turning room is not a gesture inside a frame, it is the room being spun.
//
// Nothing else drifts, tilts, or blinks in and out. All of that was the
// storm's vocabulary and the note was that it should not be chaotic.

// Latitude bands and longitude columns. COLS ≈ 3.56 × ROWS keeps the equator
// cells at 9:16 — see the tiling note.
//
// 8 × 28 = 224 frames, up in size from 9 × 32 = 288 on direction ("make the
// reels bigger"). A cell is now 12.9° wide by 22.5° tall instead of 11.25° by
// 20°, so each reel is about 14% larger in the eye.
//
// THIS IS ALSO THE ONLY KNOB THAT AFFECTS REPETITION, which is not obvious.
// How often you see the same reel twice is governed by how many cells fit in
// your field of view, not by how many clips are in the folder — a headset sees
// roughly 100° × 90°, which is about 31 cells at this grid and was about 40 at
// the old one. Adding clips cannot beat that: the pool caps at MAX_PLAYERS
// (32) no matter how full the folder is, so the number of DISTINCT reels on
// screen at once is capped too. Fewer, bigger cells is the lever. See the note
// on MAX_PLAYERS in reelPlayers.js.
//
// Keep COLS ≈ 3.56 × ROWS when changing these or the cells stop being 9:16 and
// the footage gets letterboxed into them. Clean pairs: 9×32, 8×28, 7×25, 6×21,
// 5×18, 4×14.
const ROWS = 8
const COLS = 28

// How far away the shell sits. Enclosing without being oppressive: at 7m a cell
// is about 1.4m wide and 2.4m tall, which subtends roughly the same angle as a
// cinema screen seen from the middle of the room. Closer and the curvature
// becomes obvious on every panel; further and the globe stops being a room and
// becomes a planetarium seen from the stalls.
const RADIUS = 7

// ---- THE MIX ---------------------------------------------------------------
//
// On direction: "use all reels in the folder, and mix them — not one reel ten
// times one by one".
//
// This replaces the patch layout, which was the previous round's answer to
// spatial audio: each clip owned a contiguous block of the shell so its sound
// had somewhere to be. It worked for the ears and it was wrong for the eyes —
// a block of the same reel repeated is exactly the "one by one" the note is
// about, and it made the globe read as nine posters rather than a feed.
//
// So cells are SCATTERED again, across every clip in the folder, with one extra
// rule: NO CELL MAY SHARE ITS CLIP WITH THE CELL TO ITS LEFT OR THE CELL ABOVE
// IT. Pure random assignment is not actually mixed — over 288 cells it produces
// visible pairs and triples by chance, and a repeat touching itself is the one
// arrangement the eye reads instantly as "the same video twice". Rejecting the
// two neighbours that are already placed costs nothing and removes every
// adjacency in one pass.
//
// The longitude seam is checked too: column 0 is the left-hand neighbour of the
// last column, and without that the globe has one visible join where the rule
// stops applying.
//
// WHAT THIS COSTS THE SOUND. A scattered clip has no single position, so each
// clip's audio is now parked at ONE of its own cells — a real place where that
// reel genuinely is, picked at build time. Turn toward that cell and it comes
// up. Its other copies are silent. That is an honest compromise rather than the
// exact one the patch layout gave, and it is the only version that can be both
// mixed and positioned.
const SEAM_SAFE = true

// Fixed, so the arrangement of 288 frames is the same on every load — what gets
// approved is what the audience sees, the same rule as the rest of the piece's
// noise. Change it to reshuffle the globe.
const MIX_SEED = 20260730

// Per-source gain, and it was wrong by a factor of two once the pool grew.
//
// 0.34 was set for NINE streams. The pool is now as large as the folder, capped
// at 32, so 31 unrelated phone videos play at once. Uncorrelated sources sum in
// POWER rather than amplitude, so holding the same total level means scaling by
// the square root of the ratio: 0.34 × √(9/31) = 0.18. Left at a third each,
// the mix was heading for roughly twice the level it was tuned at, which on 31
// summed sources is clipping rather than loudness.
//
// This mattered more than it looks, because it was masked: with the panners
// never mounted (see the note further down) every source was playing at the
// origin at full level anyway, so nothing about the mix was being heard as
// designed. Both bugs had to go together.
const SOURCE_GAIN = 0.18

// The original reasoning, kept because it is still the argument for the number
// being small: nine streams playing at once sum, and nine unrelated phone
// videos at full volume is not a wall of sound, it is clipping. A third each is
// roughly unity when three are near the visitor's heading and the rest are
// attenuated behind them — the same argument, rescaled above.

// How the sound falls off. refDistance is just inside the shell so a patch the
// visitor is facing is at full level, and an inverse model with a rolloff above
// 1 makes the ones behind them drop away fast enough to be individually
// pickable — which is the experience the note is describing: a room where you
// can single one out by looking at it.
const AUDIO_REF_DISTANCE = 5.5
const AUDIO_ROLLOFF = 1.8

// ---- THE SWIPE -------------------------------------------------------------
//
// On direction: "how instagram is scrolling — in frame of video, scrolling,
// swiping". So nothing in the room moves. The SHELL IS STILL. What moves is
// what is inside each frame: the clip slides up and off the top of its own cell
// while the next one arrives from underneath, exactly the way a reel is
// dismissed on a phone.
//
// This is the version that should have been built first. The globe-rotation
// version was wrong on the brief and would have been wrong on comfort too:
// turning a surround is rotational vection, the worst kind, and it makes the
// whole ROOM move when the thing being described is a gesture inside a frame.
// A swipe moves texture across stationary geometry at fixed depth, which reads
// as "the pictures changed", not as "I moved". No vection at all.
//
// EVERY CELL SWIPES AT ONCE. It is one feed, not 224 independent phones — the
// whole room dismisses a reel together, which is the ritual the piece is about.
//
// WHERE THE INCOMING CLIP COMES FROM, and this is the part that keeps it cheap:
// a swipe needs two clips decoding per cell, which would double an already
// expensive decoder count. It does not have to. Slot i's next clip is slot
// i+1's CURRENT clip — already decoding, already on screen elsewhere on the
// globe. Each swipe just advances every slot by one, so the arrangement rotates
// through the folder and no extra decoder is ever created.

// When the first swipe happens, as a fraction of this row's window. The row is
// 22.2s (21s of screen time plus the 1.2s handover), so 0.225 is five seconds
// in — the globe closes, holds still long enough to be read as a room, and only
// then starts moving. On direction.
//
// RETIMED 2026-08-02 (her ask: make the reels beat longer to watch) from a
// 16.2s window. Every constant below is a fraction, so a naive retime would
// have stretched the whole beat proportionally — including the runaway and the
// step out, which are the two parts that were already the right length. So all
// four event fractions were recomputed to hold their ABSOLUTE seconds, and the
// six new seconds land entirely in the calm feed between the first swipe and
// the acceleration: 5s of readable scrolling became 11s. That is the part she
// asked for more of. Divide by the window when retiming this row again.
const SWIPE_START = 0.225

// How long one swipe takes, in seconds. 0.42 is about the length of a real
// thumb flick; much slower and it is a dissolve, much faster and the incoming
// frame is never seen arriving.
const SWIPE_DURATION = 0.42

// How long a clip is held before the next swipe, in seconds. Short — the point
// is compulsive dismissal, not viewing.
const SWIPE_HOLD = 1.15

const SWIPE_CYCLE = SWIPE_HOLD + SWIPE_DURATION

// What fraction of a cycle is spent holding rather than moving. At the calm
// pace this is most of it; the acceleration below drives it to zero, which is
// what turns a series of flicks into one continuous scroll.
const HOLD_FRACTION = SWIPE_HOLD / SWIPE_CYCLE

// ---- THE ACCELERATION ------------------------------------------------------
//
// On direction: "after 10 sec it starts, every sec speed and duration getting
// higher, until videos just not getting glitch and noise".
//
// This is the argument the whole piece has been building toward. The room holds,
// then dismisses one reel at a time at a human pace, then the pace runs away
// from the human until the footage stops being footage and becomes texture. The
// scroll consumes what it is scrolling.
//
// WHY IT BECOMES A CONTINUOUS SCROLL RATHER THAN FASTER CUTS, and this is a
// safety decision as much as an aesthetic one. Holding the flick-and-snap shape
// while shrinking the cycle would drive the whole visual field into hard cuts at
// 10, 20, 30 a second — straight through the 15–25Hz band that is the worst case
// for photosensitive epilepsy, full-field, high contrast. Instead HOLD_FRACTION
// is driven to zero as the cycle shrinks, so the feed stops snapping and starts
// sliding: by the time it is fast enough to read as noise it is a smear, not a
// strobe. Same picture at the end, no flash.
//
// IT IS STILL A FAST-MOVING HIGH-CONTRAST FIELD. If this is ever exhibited,
// that is worth a sign at the door. Nothing in the code can make an accelerating
// full-surround feed a neutral thing to look at.

// When it begins, as a fraction of this row's window — 16.0s into a 22.2s row.
// Anchored to the END of the beat, not the start: the runaway needs a fixed
// number of seconds to halve its way down to the floor, so it keeps the 6.2s
// it had before the row was lengthened. Moving it later is the whole point of
// the retime — the calm feed now runs for eleven seconds before this fires.
const ACCEL_START = 0.721

// Seconds for the cycle to halve. Over the six seconds between ACCEL_START and
// the end of the beat this takes 1.57s per reel down to about 0.03s — from one
// flick a second to a blur.
const ACCEL_HALVING = 0.9

// How long the runaway takes to reach full incoherence, as a fraction of the
// window — 3.24s, scaled with ACCEL_START so full chaos still lands just after
// the step out begins rather than drifting toward the end of the beat. Was an
// inline 0.2 against the old window.
const ACCEL_CHAOS_SPAN = 0.146

// Floor on the cycle, so it cannot divide toward zero and start skipping whole
// clips per frame. At 0.03s the feed is already unreadable; below it the maths
// just gets less stable.
const MIN_CYCLE = 0.03

// How far the slots drift out of step at full speed, in cycles. The calm feed
// swipes in perfect unison because it is one feed; as it runs away, the cells
// stop agreeing, which is the difference between fast and broken. Zero here
// would give a very fast but very tidy feed, which is not what noise looks like.
const CHAOS_SPREAD = 1

// This row's length in seconds, mirrored from the edit list so the timings above
// can be written in seconds. `progress` only ever gives a 0..1, and "after 10
// sec" has to mean ten seconds — see the note on the row in sequences/index.js
// about why the pace of this beat must not scale with its window.
const REEL_WINDOW_SEC = 22.2

// ---- the step out -----------------------------------------------------------
//
// How the beat ends (2026-08-01, her ask: "smooth transition like you were in
// the sphere and here's outside... step out animation, go out from reels globe
// and see another sphere"). Over the last fifth of the window the whole globe
// — shell, cells, sound, one group — pulls away from the visitor, shrinks,
// and settles exactly on the dispersion sphere's seat. The camera never moves
// (the piece's standing rule): the WORLD leaves, and the back wall of reels
// sweeping past the eye is the moment you are outside it. You were inside a
// sphere of footage; now it is an object ahead of you, dissolving into noise
// where the monument fades in. Two spheres, one sightline.
//
// The seat mirrors DispersionSphere.jsx: sphere radius 5.5 (sphereSize
// default), centre at z = -15, height = radius * 1.25 + 1 = 7.875. Those
// constants are not exported — a retune there needs a retune here (the same
// standing note as the spatial score's metaball mirrors).
//
// Written as a FRACTION of the window, like the tunnel's mouth (contact at
// 86%), so the choreography survives a retime of the row — but note the exit
// then changes in absolute seconds, and it overlaps the sphere row's fade-in
// by design: the handover carries `veil: false`, this movement IS the
// transition.
// 0.854 of a 22.2s window — the last 3.24s, which is exactly the number of
// seconds the step out took at 0.8 of the old 16.2s row. Held absolute rather
// than proportional on purpose: this is a coherent visual surround translating,
// which the inner ear reads as self-motion, and stretching it to four seconds
// would have been a slower, longer dose of the one moment in the piece with a
// real vection budget. The exit is finished; the retime is not about it.
const EXIT_START = 0.854
const EXIT_SEAT = { x: 0, y: 7.875, z: -15 }
const EXIT_SCALE = 5.5 / 7

// The exit runs on a TRAPEZOID, not a smoothstep — viewerTravel.js's lesson,
// and it applies with more force here, not less: this is a full visual
// surround translating coherently, which the inner ear reads as self-motion.
// A smoothstep accelerates at every instant; a trapezoid accelerates once,
// cruises, and brakes once. Ramp fraction 0.3 of the exit each side.
const EXIT_RAMP = 0.3
const exitTravel = (u) => {
    if (u <= 0) return 0
    if (u >= 1) return 1
    const a = EXIT_RAMP
    const total = 1 - a
    if (u < a) return (u * u) / (2 * a) / total
    if (u <= 1 - a) return (a / 2 + (u - a)) / total
    return 1 - ((1 - u) * (1 - u)) / (2 * a) / total
}

const SWIPE_VERTEX_SHADER = /* glsl */`
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

// The swipe itself. The outgoing clip is translated up by uSwipe, so a point at
// height v in the cell shows that clip at v - uSwipe; once that falls below the
// clip's own bottom edge the cell is showing empty space, which is where the
// incoming clip is — one frame further down, hence the + 1.0.
const SWIPE_FRAGMENT_SHADER = /* glsl */`
uniform sampler2D uCurrent;
uniform sampler2D uNext;
uniform float uSwipe;
uniform float uOpacity;

varying vec2 vUv;

void main() {
    float v = vUv.y - uSwipe;
    vec4 frame = v >= 0.0
        ? texture2D(uCurrent, vec2(vUv.x, v))
        : texture2D(uNext, vec2(vUv.x, v + 1.0));

    gl_FragColor = vec4(frame.rgb, frame.a * uOpacity);
}
`

/**
 * Which clip each cell shows, as a ROWS × COLS grid of player indices.
 *
 * Scattered, seeded, and with no clip adjacent to itself — see the mix note.
 * Built once and reused for the geometry and for placing the sound, so the two
 * can never disagree about where a given reel is.
 */
const mixCells = (playerCount) => {
    const random = createRandom(MIX_SEED)
    const grid = []

    for (let row = 0; row < ROWS; row++) {
        const line = []
        for (let col = 0; col < COLS; col++) {
            // No left neighbour in column 0 — its real left neighbour is the
            // last column, which does not exist yet. The seam is fixed up in one
            // pass below instead.
            const left = col > 0 ? line[col - 1] : undefined
            const above = row > 0 ? grid[row - 1][col] : undefined

            // Reject-and-retry rather than shuffling a deck: with 31 clips and
            // at most two forbidden values the expected number of retries is
            // under a tenth of a draw, and it stays correct if the folder ever
            // shrinks to three clips where a deck-based scheme would deadlock.
            let pick = Math.floor(random() * playerCount) % playerCount
            for (let attempt = 0; attempt < 12; attempt++) {
                if (pick !== left && pick !== above) break
                pick = Math.floor(random() * playerCount) % playerCount
            }
            line.push(pick)
        }
        grid.push(line)
    }

    // The longitude seam. Column 0 and the last column are neighbours on a
    // closed shell, and nothing above has checked that pair — without this the
    // globe has exactly one join where two identical reels can touch.
    if (SEAM_SAFE && COLS > 2 && playerCount > 2) {
        for (let row = 0; row < ROWS; row++) {
            const line = grid[row]
            let guard = 0
            while (line[COLS - 1] === line[0] && guard < 12) {
                line[COLS - 1] = Math.floor(random() * playerCount) % playerCount
                if (line[COLS - 1] === line[COLS - 2]) line[COLS - 1] = -1
                guard++
            }
            if (line[COLS - 1] < 0) line[COLS - 1] = (line[0] + 1) % playerCount
        }
    }

    return grid
}

/**
 * Where each clip's sound sits: one of the cells actually showing it.
 *
 * A scattered clip has no centre worth speaking of — averaging its cells would
 * put the source somewhere it mostly is not, and on a closed shell the mean of
 * evenly-spread directions lands near the visitor's own head, which is the worst
 * possible answer. So the source goes at ONE real instance of the clip, chosen
 * as the first one found. What you hear is coming from somewhere that reel
 * genuinely is.
 */
const mixCentres = (grid, playerCount) => {
    const centres = Array.from({ length: playerCount }, () => null)

    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            const player = grid[row][col]
            if (centres[player]) continue
            const polar = ((row + 0.5) / ROWS) * Math.PI
            const azimuth = ((col + 0.5) / COLS) * Math.PI * 2
            centres[player] = new THREE.Vector3(
                Math.sin(polar) * Math.sin(azimuth),
                Math.cos(polar),
                Math.sin(polar) * Math.cos(azimuth)
            ).multiplyScalar(RADIUS)
        }
    }

    // A clip that drew no cell at all still needs somewhere to be, or its
    // PositionalAudio sits at the origin — i.e. inside the visitor's head, at
    // full volume, with no falloff.
    return centres.map((centre) => centre ?? new THREE.Vector3(0, 0, -RADIUS))
}
/**
 * A vertex on the shell.
 *
 * Polar angle from +Y, azimuth around it. Adjacent cells call this with
 * identical arguments for their shared corners, so the seams are exact by
 * construction rather than by tolerance.
 */
const vertexAt = (polar, azimuth, target) => target.set(
    RADIUS * Math.sin(polar) * Math.sin(azimuth),
    RADIUS * Math.cos(polar),
    RADIUS * Math.sin(polar) * Math.cos(azimuth)
)

/**
 * One merged geometry per player.
 *
 * Merged rather than instanced because every cell has its own UV rect and its
 * own four corners on the sphere — there is no repeated unit to instance. The
 * whole globe is then nine draw calls of static geometry, uploaded once, with
 * nothing recomputed per frame. The only per-frame work in this sequence is one
 * opacity value per player.
 */
const buildGlobe = (playerCount, grid) => {
    if (playerCount <= 0 || !grid) return []

    const corner = new THREE.Vector3()

    const cells = Array.from({ length: playerCount }, () => ({
        positions: [],
        uvs: [],
        indices: [],
        count: 0
    }))

    for (let row = 0; row < ROWS; row++) {
        const polar0 = (row / ROWS) * Math.PI
        const polar1 = ((row + 1) / ROWS) * Math.PI

        for (let col = 0; col < COLS; col++) {
            const azimuth0 = (col / COLS) * Math.PI * 2
            const azimuth1 = ((col + 1) / COLS) * Math.PI * 2

            // Which reel this frame shows — scattered, with no clip touching
            // itself. See the mix note above. The grid is passed in rather than
            // built here so the sound placement reads the SAME arrangement.
            const bucket = cells[grid[row][col]]
            const base = bucket.count * 4

            // Corners, in reading order from the INSIDE: top-left, top-right,
            // bottom-right, bottom-left. Polar 0 is +Y, so polar0 is the upper
            // edge of the cell.
            vertexAt(polar0, azimuth0, corner)
            bucket.positions.push(corner.x, corner.y, corner.z)
            vertexAt(polar0, azimuth1, corner)
            bucket.positions.push(corner.x, corner.y, corner.z)
            vertexAt(polar1, azimuth1, corner)
            bucket.positions.push(corner.x, corner.y, corner.z)
            vertexAt(polar1, azimuth0, corner)
            bucket.positions.push(corner.x, corner.y, corner.z)

            // U runs the opposite way to the azimuth. Seen from OUTSIDE a
            // sphere the surface reads left to right; seen from inside it is
            // reversed, so mapping u with the azimuth would show every reel
            // mirrored — text backwards, faces on the wrong side. This is the
            // single easiest thing to get wrong here and the hardest to notice
            // if the footage has no writing in it.
            bucket.uvs.push(1, 1, 0, 1, 0, 0, 1, 0)

            bucket.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
            bucket.count++
        }
    }

    return cells.map((bucket) => {
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3))
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uvs, 2))
        geometry.setIndex(bucket.indices)
        return geometry
    })
}

// ---- the ears ---------------------------------------------------------------
//
// The listener rides the CAMERA, which in an XR session is the headset. That
// is the whole mechanism: the visitor's head turns, the listener turns with
// it, and the patches move around them in the mix without a single line of
// panning code.
//
// ONE listener and one set of positional sources for the life of the page,
// same contract as reelPlayers(). They used to be built per mount, and the
// piece loops: a THREE.AudioListener wires its master gain into
// context.destination the moment it is constructed, and unmounting only ever
// removed it from the camera — so every ~53s pass of an exhibition day left
// one more listener, one more limiter and thirty-odd dead panner chains
// permanently connected into the audio graph. Silent in both senses: nothing
// crackled and nothing threw, the graph just grew all day. The shared media
// sources also fan out one extra connection per mount, and a
// MediaElementAudioSourceNode can never be rebuilt, so the only shape that
// stays clean over a long run is the one where the whole chain is built once.
//
// The sources are MOUNTED as primitives inside the shell group (not merely
// constructed): a PositionalAudio's panner is positioned from
// updateMatrixWorld(), which three only runs for objects in the scene graph.
// Constructed-but-unparented sources all sit at the origin — inside the
// visitor's head, at full level, with no falloff and no error to show for it.
let sharedEars = null

const reelEars = (pool, centres) => {
    if (!sharedEars) {
        const listener = new THREE.AudioListener()
        // Safety limiter on this path's master gain: 31 uncorrelated reels
        // summing is exactly the case levels alone cannot promise anything
        // about. See audioBus.js.
        attachLimiter(listener)

        const audios = pool.map((player, index) => {
            const audio = new THREE.PositionalAudio(listener)
            audio.position.copy(centres[index] ?? new THREE.Vector3(0, 0, -RADIUS))
            audio.setRefDistance(AUDIO_REF_DISTANCE)
            audio.setRolloffFactor(AUDIO_ROLLOFF)
            audio.setDistanceModel('inverse')
            audio.setVolume(0)

            const source = reelAudioSource(player, listener)
            if (source) audio.setNodeSource(source)
            return audio
        })

        sharedEars = { listener, audios }
    }
    return sharedEars
}

export default function ReelGlobe({ progress }) {
    const pool = useMemo(() => reelPlayers(), [])
    // One arrangement, built once, read by both the picture and the sound — the
    // guarantee the mixCells docblock makes. Building it twice would be
    // harmless today (it is seeded and pure) and would silently stop being
    // harmless the moment anyone made the seed depend on anything.
    const grid = useMemo(() => mixCells(pool.length), [pool])
    const geometries = useMemo(() => buildGlobe(pool.length, grid), [pool, grid])
    // A ShaderMaterial rather than MeshBasicMaterial, and only because of the
    // swipe: a basic material can show one texture, and a swipe is by definition
    // two frames on screen at once — the one leaving and the one arriving. The
    // shader is nine lines and does nothing else.
    const materials = useMemo(() => pool.map((player, index) => new THREE.ShaderMaterial({
        uniforms: {
            uCurrent: { value: player.texture },
            uNext: { value: pool[(index + 1) % pool.length].texture },
            uSwipe: { value: 0 },
            uOpacity: { value: 0 }
        },
        vertexShader: SWIPE_VERTEX_SHADER,
        fragmentShader: SWIPE_FRAGMENT_SHADER,
        transparent: true,
        // FrontSide, and this was a real bug worth recording: the comment here
        // used to say BackSide, on the assumption that a sphere's cells are
        // wound for its outside and a viewer inside therefore sees their backs.
        // They are not. Work the cross product through for an equator cell —
        // corners at (polar0, az0), (polar0, az1), (polar1, az1) — and the face
        // normal comes out pointing at the ORIGIN, because azimuth increases
        // clockwise seen from +Y. So the cells already face the standpoint, and
        // BackSide culled the entire globe: the sequence mounted, built nine
        // geometries, decoded nine videos and drew absolutely nothing.
        //
        // Diagnosed by logging pool.length rather than by reading the code
        // again — the pool was fine, which is what ruled out every other
        // hypothesis and left the winding.
        //
        // DoubleSide since the step out (2026-08-01), not a return of the bug:
        // FrontSide was correct while the globe was only ever seen from
        // inside, but the exit puts the visitor OUTSIDE it, where front-face
        // culling erased the near wall and the receding globe read as a
        // hollow ring around a black core instead of as a ball of footage.
        // The outside skin shows each reel mirrored (u runs against azimuth,
        // chosen for the inside view) — accepted: by the time the outside is
        // visible the feed is deep in its chaos phase and dissolving into
        // noise, and a mirrored reel in a storm of them is not a legible
        // defect. The interior view is pixel-identical to what FrontSide drew.
        side: THREE.DoubleSide,
        // Unlit, unfogged and untone-mapped, as before: these are screens, not
        // surfaces being lit, every cell is exactly RADIUS away so fog could
        // only apply one flat tint to the whole globe, and the footage should
        // arrive at the values it was shot at.
        depthWrite: true,
        fog: false
    })), [pool])

    const centres = useMemo(() => mixCentres(grid, pool.length), [grid, pool])
    const camera = useThree((state) => state.camera)

    // The ears, shared for the life of the page like the player pool — see
    // reelEars below for why building them per mount leaked a listener into
    // the audio graph on every loop of the piece.
    const { listener, audios } = useMemo(() => reelEars(pool, centres), [pool, centres])

    // Seconds elapsed since the first swipe was due. Resets on mount, which is
    // once per loop of the piece, so every play-through opens on a held frame
    // rather than mid-flick.
    const swipeClockRef = useRef(0)
    const lastLocalRef = useRef(null)
    const shellRef = useRef(null)

    // The feed's position in whole reels. See the note in the frame loop for why
    // this is accumulated rather than taken from a modulo of the clock.
    const feedRef = useRef(0)

    // The row's length in seconds, so the acceleration can be expressed in real
    // seconds ("after 10 sec") while `progress` only ever hands over a 0..1.
    // Falls back to the authored 16.2s if the row is ever retimed without this
    // being updated — the acceleration would then run early or late rather than
    // not at all.
    const windowSec = REEL_WINDOW_SEC

    // A fixed per-slot offset, seeded so the noise at the end of the beat is the
    // same noise every performance.
    const slotJitter = useMemo(() => {
        const random = createRandom(MIX_SEED + 1)
        return pool.map(() => random())
    }, [pool])

    // Free the GPU-side buffers when the sequence is finally torn down. The
    // player pool deliberately outlives this component; its geometries and
    // materials do not.
    useEffect(() => () => {
        geometries.forEach((geometry) => geometry.dispose())
        materials.forEach((material) => material.dispose())
    }, [geometries, materials])

    useEffect(() => {
        camera.add(listener)
        return () => { camera.remove(listener) }
    }, [camera, listener])

    // Arm the unlock, and resume the context when it fires. An AudioContext
    // created before any gesture starts suspended, and resuming it is the other
    // half of unmuting — do one without the other and the scene is still silent.
    useEffect(() => armAudioUnlock(() => {
        const context = listener.context
        if (context && context.state === 'suspended') context.resume()
    }), [listener])

    // A source that could not be created at build time (the audio context was
    // not usable yet) gets another try on every mount — the retry the old
    // per-mount construction provided, kept.
    useEffect(() => {
        audios.forEach((audio, index) => {
            if (audio.source) return
            const source = reelAudioSource(pool[index], listener)
            if (source) audio.setNodeSource(source)
        })
        // Silenced rather than torn down on unmount: the whole chain is shared
        // for the life of the page, and the envelope drives the volume back up
        // on the next pass.
        return () => audios.forEach((audio) => audio.setVolume(0))
    }, [audios, pool, listener])

    // Play on mount, pause on unmount — and shift the pool onto the next nine
    // clips as the beat ends, so a looping installation works through the whole
    // folder instead of showing the same nine all day. See advanceReels.
    useEffect(() => {
        const stop = playReels(pool)
        return () => {
            stop()
            advanceReels()
        }
    }, [pool])

    useFrame((state, delta) => {
        const local = progress
        if (local === null) return

        // ---- the swipe clock ------------------------------------------------
        //
        // Runs on the frame delta rather than on `local`, and only while the
        // playhead is actually advancing. Two reasons, and they are the same two
        // that apply to any timing the body reads as a gesture:
        //
        //   - a swipe is 0.42 SECONDS. Derive it from progress and a director
        //     shortening this row from fifteen seconds to eight turns every
        //     swipe into a flicker, which is a different gesture entirely.
        //   - integrating on wall clock alone would keep the feed swiping while
        //     the director is paused, so the author could never hold a frame to
        //     look at it.
        const advancing = lastLocalRef.current !== null && local > lastLocalRef.current
        lastLocalRef.current = local

        if (advancing && local >= SWIPE_START) {
            swipeClockRef.current += delta
        }

        // How long one hold-and-flick takes RIGHT NOW. Constant until the tenth
        // second, then halving every ACCEL_HALVING seconds.
        const accelSeconds = Math.max(0, (local - ACCEL_START) * windowSec)
        const cycle = Math.max(
            MIN_CYCLE,
            SWIPE_CYCLE * Math.pow(0.5, accelSeconds / ACCEL_HALVING)
        )

        // The feed's position, in whole reels. Integrated rather than derived
        // from a modulo of the clock, because the cycle LENGTH is changing —
        // `clock % cycle` with a shrinking cycle makes the phase jump backwards
        // every frame, which reads as the feed stuttering rather than speeding
        // up. Accumulating position is the only version that stays smooth
        // through an acceleration.
        if (advancing && local >= SWIPE_START) {
            feedRef.current += delta / cycle
        }

        // How much of the cycle is a hold. Driven to zero as the pace runs away,
        // so flick-and-snap becomes one continuous slide — see THE ACCELERATION
        // for why that is a safety property and not just a look.
        const chaos = smoothstep(ACCEL_START, Math.min(1, ACCEL_START + ACCEL_CHAOS_SPAN), local)
        const holdFraction = HOLD_FRACTION * (1 - chaos)

        const step = Math.floor(feedRef.current)
        const phase = feedRef.current - step
        const swipe = phase <= holdFraction
            ? 0
            : smoothstep(holdFraction, 1, phase)

        for (let index = 0; index < materials.length; index++) {
            const uniforms = materials[index].uniforms

            // Per-slot drift, zero while the feed is calm. Each slot carries its
            // own offset so the unison comes apart into noise rather than
            // staying a very fast but perfectly tidy feed.
            const drift = chaos * CHAOS_SPREAD * slotJitter[index]
            const position = feedRef.current + drift
            const slotStep = Math.floor(position)
            const slotPhase = position - slotStep

            uniforms.uCurrent.value = pool[(index + slotStep) % pool.length].texture
            uniforms.uNext.value = pool[(index + slotStep + 1) % pool.length].texture
            uniforms.uSwipe.value = chaos > 0
                ? (slotPhase <= holdFraction ? 0 : smoothstep(holdFraction, 1, slotPhase))
                : swipe
        }

        // The globe arrives as one surface rather than frame by frame. A
        // staggered per-cell arrival was the storm's gesture — here the whole
        // shell fading up at once is what says it is a single thing that has
        // closed around the visitor.
        //
        // Full strength by local 0.12 — 25.9s on the 22.2s row — because the
        // metaball portal starts opening at 28.8s and the first thing seen
        // through the hole has to be footage, not footage still fading up.
        // 0.22 looked fine on a monitor and wrong through the portal: the hole
        // opened onto cells at a third of their brightness against near-black,
        // which read as a dim room rather than a reveal. The longer window only
        // buys more margin here, so the fraction is left alone.
        //
        // The fade OUT is not left alone: 0.898 keeps it 2.27s long, the length
        // it was at 0.86 of the old window, and therefore still starting about
        // a third of the way into the step out. Left at 0.86 it would have
        // begun dissolving the globe almost the instant it started moving, and
        // the whole point of the exit is watching it land on the sphere's seat.
        const envelope = smoothstep(0.02, 0.12, local) * smoothstep(1, 0.898, local)

        // Sound rides the same envelope as the picture, so the room does not
        // arrive silent or leave still talking. Every source comes up together —
        // all of them at once was the note, and the spatial falloff is what
        // keeps that from being a single undifferentiated wall.
        for (let index = 0; index < audios.length; index++) {
            audios[index].setVolume(envelope * SOURCE_GAIN)
        }

        for (let index = 0; index < materials.length; index++) {
            materials[index].uniforms.uOpacity.value = envelope
        }

        // The step out — see the note above exitTravel. One transform on the
        // one group, so cells, panners and geometry leave together; scaling
        // the group scales the audio positions with it, which is the sound of
        // the room becoming an object.
        const shell = shellRef.current
        if (shell) {
            const exit = exitTravel((local - EXIT_START) / (1 - EXIT_START))
            shell.position.set(
                EXIT_SEAT.x * exit,
                1.6 + (EXIT_SEAT.y - 1.6) * exit,
                EXIT_SEAT.z * exit
            )
            shell.scale.setScalar(1 + (EXIT_SCALE - 1) * exit)
        }
    })

    if (progress === null) return null

    if (pool.length === 0) {
        // No video in src/algoVrithm/assets/. Renders nothing rather than
        // throwing — a missing-media crash at an exhibition is worse than a
        // quiet beat, and the director panel's bin already shows the folder is
        // empty.
        return null
    }

    // Centred on the standpoint's eye height, so the equator — where the cells
    // are true 9:16 and the tiling is at its cleanest — runs across the
    // visitor's own eye line. The ref is the step out's handle: position and
    // scale are overwritten per frame once the exit begins.
    return (
        <group ref={shellRef} position={[0, 1.6, 0]}>
            {pool.map((player, index) => (
                <mesh
                    key={player.asset.id}
                    geometry={geometries[index]}
                    material={materials[index]}
                    // The shell surrounds the camera, so its bounding sphere
                    // contains the frustum origin and three's culling test is
                    // meaningless here anyway.
                    frustumCulled={false}
                />
            ))}
            {/* The sources, mounted rather than merely constructed — see the
                note above the useMemo. Being in the scene graph is what makes
                three update their panners, and without it the whole spatial mix
                collapses to the origin without any error to show for it. */}
            {audios.map((audio) => (
                <primitive key={audio.uuid} object={audio} />
            ))}
        </group>
    )
}
