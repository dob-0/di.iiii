import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { clipProgress, smoothstep } from './ritualClock.js'
import { totalVeil } from './transitions.js'
import { armAudioUnlock, unlockAudio } from './reelPlayers.js'
import { attachLimiter } from './audioBus.js'
import { keepAudioAwake, resumeAudio } from './audioWake.js'
import { createRandom } from './random.js'
import { tickGate, stutterGate, ringPosition, scoreHash } from './spatialScore.js'
import { STROBE_HZ, STROBE_SHARPNESS } from './sequences/WhiteTunnel.jsx'
import {
    COLUMNS, STROBE_WINDOW, STROBE_RUNS, STROBE_DECAY, SPHERE_Z, sphereHeight
} from './sequences/DispersionSphere.jsx'
import { DISPERSION_DEFAULTS } from './dispersionControls.js'

// The spatial score — sound for every beat that has none, synthesized and
// placed in the room (2026-07-31, her ask: "do you can create spatial
// audio??", then "sound more glitchy and noisy, also metaballs scene bubble
// sound").
//
// No audio files. Every voice is oscillators or noise, built once at mount
// and shaped per frame by the same playhead that drives the visuals — so the
// score can never drift against the picture, and scrubbing the timeline
// scrubs the sound. Each beat's voice is derived from what its scene IS:
//
//   tunnel    a rush of low air ahead of the visitor, rising and brightening
//             with the corridor's acceleration, dead at the crush
//   scan      the 6Hz machine tick as CRUSHED digital chirps circling the
//             visitor on the shells' radius — the sound of being read
//   pattern   the 2.6Hz step as two tick voices, one above the head, one
//             below, alternating — the halves of the lattice stepping
//   metaball  three low hums on the pairs' orbit ring (detuned sine pairs,
//             the beating is the merge cycle audible) plus BUBBLES — rising
//             sine blips blooping off the ring, denser and deeper as the
//             blobs close in and weld
//   halo      the breath: a soft lowpass swell ON the strobe's own clock,
//             head-centred because a wavefront leaving you in every
//             direction has no direction to come from
//   rain      thin crushed stutter overhead — many small digital events
//             arriving from where the streaks are born
//   globe     nothing here — it carries its own 31 positional reel voices
//   sphere    a mass of crushed-noise gravel at the monument with one deep
//             detuned pair buried inside it, the grit growing across the
//             beat and rising to meet the colonnade's crushed flashes —
//             the epilogue keeps the piece's dirty voice instead of
//             resolving into hi-fi
//             — plus the colonnade itself: a clean bright flash on one panner
//             that snaps to whichever column is lit, so the pulse walks
//             outward into the room the way the light does
//   veil      head-locked digital garbage that stutters up exactly when the
//             glitch strips cover the view, jumping pitch on every stutter
//             tick — the transitions are HEARD tearing
//
// THE NOISE IS DELIBERATELY DIRTY. The buffers are sample-and-hold noise —
// white noise frozen for a handful of samples at a time — which is the sound
// of a too-low sample rate: aliased, steppy, digital. Clean hiss says "air
// conditioning"; held noise says "data". Same reasoning as the shaders'
// quantised ticks, applied to the ear. (Amplitude gates here run at whatever
// rate sounds right — the 15-25Hz photosensitive band is a VISUAL hazard;
// audio has no such ceiling.)
//
// Voices look their rows up BY ID in the live edit list every frame: a beat
// that is retimed moves its sound with it, and a beat that is cut falls
// silent — the score can never play a scene that is not there.
//
// THE TWO RULES, learned the hard way in the reel globe:
//   - a PositionalAudio must be IN the scene graph or it silently plays from
//     the origin (see the primitives at the bottom);
//   - uncorrelated sources sum in POWER, so per-voice levels here are set for
//     the whole choir, not soloed — and both listener paths end in a limiter
//     (audioBus.js) for the peaks levels cannot promise anything about.

// Per-voice levels. The glitch was the loudest thing in the score on purpose
// — it was the transition, and she asked for it to bite.
const TUNNEL_LEVEL = 0.3
const SCAN_LEVEL = 0.28
const PATTERN_LEVEL = 0.18
const HUM_LEVEL = 0.14
const BUBBLE_LEVEL = 0.2
// Zero since 2026-08-04, because the strips it belonged to are out of the
// render tree (see AlgoVrithmExperience.jsx). The number is what to restore —
// it was 0.55 — and this stays a level rather than a deleted voice so the
// sound comes back with the picture in one edit. Silencing it is not optional
// tidiness: this voice is head-locked digital garbage that says "the display
// is failing", and with nothing failing on screen it is the loudest sound in
// the piece attached to nothing the visitor can see.
const GLITCH_LEVEL = 0
const HALO_LEVEL = 0.16
const RAIN_LEVEL = 0.13
const SPHERE_LEVEL = 0.12

// The breaths swell on the piece's one heartbeat — STROBE_HZ, imported from
// the tunnel now that it is exported, so the ears and the rings can never
// drift apart the way a mirrored constant would let them.
//
// The rain's patter is a stutter, not a metronome: drops, not a clock.
const RAIN_PATTER_HZ = 13

// The sphere's drone — a detuned pair like the metaball hums but deeper and
// alone: one monument, one mass. The detune beats at 0.35Hz, slower than any
// other voice, which is the sphere's indifference audible.
const SPHERE_PITCH = 44
const SPHERE_DETUNE = 0.35
// The grit under the drone, and deliberately ABOVE it: on the closing beat
// the noise is the body and the tone is what is buried in it ("more noisy
// sound for last one"). It also GROWS across the beat — see the gate.
const SPHERE_NOISE_LEVEL = 0.17

// The colonnade's flash, heard. Louder than the drone it sits on because it is
// the one EVENT in the closing beat — the drone is the room, this is what
// happens in it.
const STROBE_COLUMN_LEVEL = 0.26

// A flash is bright, so its voice is high and narrow. CLEAN noise, not crushed,
// and that is the same argument the tunnel's rush is built on: crushed noise is
// the sound of damage, and this pulse is the piece's bookend rather than one of
// its glitches. The colonnade fires in TUNNEL_WHITE for exactly that reason.
const STROBE_COLUMN_HZ = 2100
const STROBE_COLUMN_Q = 1.8
// The drone's swell tracks the colonnade, and these are now DERIVED from the
// scene's own window rather than mirrored — STROBE_WINDOW is exported, so a
// retune there moves the swell with it. (The metaball mirrors above are the
// remaining copy-paste pair and still have to be retuned in two places.)
const [SPHERE_AMBER_IN, SPHERE_AMBER_OUT] = STROBE_WINDOW

// The scan beat's tick — matches the 6Hz wedge-switch tick in ScanField.jsx,
// and circles at the shells' distance.
const SCAN_TICK_HZ = 6
const SCAN_RING_RADIUS = 2.5
const SCAN_CIRCLE_RATE = 1.9

// The test pattern's step — matches the 2.6Hz half-lattice tick in
// TestPattern.jsx. One voice well above the head, one below the floor line,
// half a cycle apart.
const PATTERN_TICK_HZ = 2.6
const PATTERN_HIGH = 4.2
const PATTERN_LOW = -1.0

// The metaball hums sit on the pairs' ring and drift the way the ring does.
// Radii and the approach window mirror MetaballField.jsx (ORBIT_RADIUS 2.9,
// APPROACH_RADIUS 1.55, APPROACH_START 0.62) — those constants are not
// exported, so a retune there needs a retune here.
const HUM_COUNT = 3
const HUM_RADIUS = 2.9
const HUM_APPROACH_RADIUS = 1.55
const HUM_APPROACH_START = 0.62
const HUM_DRIFT_RATE = 0.12
// Root pitches, low enough to be felt as mass rather than heard as notes,
// with detunes slow enough that each pair audibly breathes (0.4-0.7Hz beats).
const HUM_PITCHES = [52, 65, 78]
const HUM_DETUNES = [0.45, 0.6, 0.7]

// THE BUBBLES. Each hum voice bloops on its own staggered period — a short
// sine blip whose pitch sweeps UP, which is what a bubble is: the resonance
// of a shrinking air cavity. Every blip's pitch, length and exact feel roll
// from the piece's shared hash, so the boil is organic but identical on
// every load. As the approach closes, the periods SHRINK (the boil
// quickens) and the pitches DROP (the bubbles grow) — the weld into the
// wall is heard as water coming to the boil in reverse.
const BUBBLE_PERIODS = [0.9, 1.15, 1.45]
const BUBBLE_QUICKEN = 0.45
const BUBBLE_DEEPEN = 0.35
const BUBBLE_SWEEP = 2.3

// The veil static stutters on the SAME tick rate as its strips re-roll
// (GLITCH_TICK_HZ in TransitionVeil.jsx), with a faster second gate
// multiplied in for chop, and a pitch jump on every stutter tick — held
// noise replayed at 0.4x is a growl and at 2x a shriek, and jumping between
// them is what "digital garbage" is.
const VEIL_STUTTER_HZ = 11
const VEIL_CHOP_HZ = 37

// Everything is smoothed onto the audio clock with short time constants —
// clickless, but fast enough that a gate still sounds like a tick, not a
// swell.
const GATE_SMOOTHING = 0.004
const SWELL_SMOOTHING = 0.03

// Seeded noise — the same noise on every load, the piece's standing rule.
const NOISE_SEED = 20260731
const NOISE_SECONDS = 2

// Sample-and-hold: 1 = white noise; larger freezes each value for that many
// samples, which aliases the spectrum into digital grit. 16 at 48kHz is a
// 3kHz hold rate — the crunch lives right where the ear is most sensitive.
const CRUSH_HOLD = 16

const makeNoiseBuffer = (context, holdSamples = 1) => {
    const length = Math.floor(context.sampleRate * NOISE_SECONDS)
    const buffer = context.createBuffer(1, length, context.sampleRate)
    const channel = buffer.getChannelData(0)
    const random = createRandom(NOISE_SEED + holdSamples)
    let held = 0
    for (let i = 0; i < length; i++) {
        if (i % holdSamples === 0) held = random() * 2 - 1
        channel[i] = held
    }
    return buffer
}

// A looping noise source through a filter into a gain. The gain starts at
// zero: silence is the resting state of every voice.
const makeNoiseVoice = (context, buffer, { filterType, frequency, q = 1 }) => {
    const source = context.createBufferSource()
    source.buffer = buffer
    source.loop = true
    const filter = context.createBiquadFilter()
    filter.type = filterType
    filter.frequency.value = frequency
    filter.Q.value = q
    const gain = context.createGain()
    gain.gain.value = 0
    source.connect(filter)
    filter.connect(gain)
    source.start(0)
    return { source, filter, gain }
}

const rowLocal = (sequences, id, playheadSec) => {
    const row = sequences.find((sequence) => sequence.id === id)
    if (!row) return null
    return clipProgress(playheadSec, row.startSec, row.endSec)
}

export default function SpatialScore({ sequences, playheadSec, durationSec }) {
    const camera = useThree((state) => state.camera)
    // The renderer, only for its XR event target — see the session effect below.
    const gl = useThree((state) => state.gl)

    // The listener rides the camera — in XR that is the headset, and the
    // visitor's head turning against the placed voices IS the spatial audio.
    const listener = useMemo(() => {
        const built = new THREE.AudioListener()
        // Safety limiter on the path's master gain — see audioBus.js.
        attachLimiter(built)
        return built
    }, [])
    useEffect(() => {
        camera.add(listener)
        return () => { camera.remove(listener) }
    }, [camera, listener])

    // Browsers gate audio behind a user gesture; the shared unlock arms on
    // the first pointer/key/touch and resumes the context then.
    useEffect(() => armAudioUnlock(() => {
        const context = listener.context
        if (context && context.state === 'suspended') context.resume()
    }), [listener])

    // ...and that unlock only ever fires ONCE, which is the other half of the
    // problem. A context suspended later — by the tab backgrounding, or by the
    // headset switching audio device as an immersive session starts — had
    // nothing left to wake it, and the piece went silent for good.
    //
    // Registered HERE, once, rather than in every sequence that makes a sound:
    // three's AudioContext is a module singleton, so both listeners in the
    // piece (this score and the reel globe's) are the same context, and waking
    // it revives both paths. See audioWake.js.
    useEffect(() => keepAudioAwake(listener.context), [listener])

    // Entering XR is the case worth wiring by hand, for two reasons at once:
    // the session start is a user activation that may never appear as a DOM
    // event on this window (so the reels need the imperative unlock), and it is
    // the moment most likely to have suspended the context in the first place.
    //
    // Both are cheap and idempotent, so this asks no questions about which of
    // the two went wrong on any given device — it just does both.
    useEffect(() => {
        const xr = gl?.xr
        if (typeof xr?.addEventListener !== 'function') return undefined

        const onSessionStart = () => {
            unlockAudio()
            resumeAudio()
        }
        xr.addEventListener('sessionstart', onSessionStart)
        // Leaving a session switches the device back, so it needs the same
        // treatment — otherwise taking the headset off is its own silent page.
        xr.addEventListener('sessionend', resumeAudio)

        return () => {
            xr.removeEventListener('sessionstart', onSessionStart)
            xr.removeEventListener('sessionend', resumeAudio)
        }
    }, [gl])

    const voices = useMemo(() => {
        const context = listener.context
        const white = makeNoiseBuffer(context)
        const crushed = makeNoiseBuffer(context, CRUSH_HOLD)

        const positional = (voice, refDistance) => {
            const audio = new THREE.PositionalAudio(listener)
            audio.setRefDistance(refDistance)
            audio.setNodeSource(voice.gain)
            return { ...voice, audio }
        }

        // 01 — the tunnel's rush: low air ahead, opened up by a sweeping
        // lowpass as the corridor accelerates. The one voice on CLEAN noise:
        // the tunnel is the beat before anything has gone wrong.
        const tunnel = positional(
            makeNoiseVoice(context, white, { filterType: 'lowpass', frequency: 220 }),
            3
        )
        tunnel.audio.position.set(0, 1.6, -8)

        // 02 — the machine tick, circling. Crushed noise: a scanner reads in
        // samples, and its voice should sound like samples.
        const scanTick = positional(
            makeNoiseVoice(context, crushed, { filterType: 'bandpass', frequency: 2400, q: 3 }),
            1.6
        )

        // 03 — the lattice steps, above and below. Crushed too — the pattern
        // is quantisation made visible, so its ticks are quantisation made
        // audible.
        const patternHigh = positional(
            makeNoiseVoice(context, crushed, { filterType: 'bandpass', frequency: 1500, q: 4 }),
            2
        )
        patternHigh.audio.position.set(0, PATTERN_HIGH, 0)
        const patternLow = positional(
            makeNoiseVoice(context, crushed, { filterType: 'bandpass', frequency: 640, q: 4 }),
            2
        )
        patternLow.audio.position.set(0, PATTERN_LOW, 0)

        // 04 — the metaball voices: a hum (two detuned sines) and a bubble
        // oscillator per ring position, both feeding one bus so the pair
        // shares one positional panner.
        const hums = Array.from({ length: HUM_COUNT }, (unused, index) => {
            const bus = context.createGain()
            bus.gain.value = 1

            const oscA = context.createOscillator()
            const oscB = context.createOscillator()
            oscA.type = 'sine'
            oscB.type = 'sine'
            oscA.frequency.value = HUM_PITCHES[index]
            oscB.frequency.value = HUM_PITCHES[index] + HUM_DETUNES[index]
            const gain = context.createGain()
            gain.gain.value = 0
            oscA.connect(gain)
            oscB.connect(gain)
            gain.connect(bus)
            oscA.start(0)
            oscB.start(0)

            const bubbleOsc = context.createOscillator()
            bubbleOsc.type = 'sine'
            bubbleOsc.frequency.value = 300
            const bubbleGain = context.createGain()
            bubbleGain.gain.value = 0
            bubbleOsc.connect(bubbleGain)
            bubbleGain.connect(bus)
            bubbleOsc.start(0)

            const audio = new THREE.PositionalAudio(listener)
            audio.setRefDistance(1.8)
            audio.setNodeSource(bus)
            return {
                audio,
                gain,
                bus,
                oscillators: [oscA, oscB, bubbleOsc],
                bubbleOsc,
                bubbleGain,
                lastBubbleCycle: -1,
                bearing: (index / HUM_COUNT) * Math.PI * 2
            }
        })

        // 01b — the halo's breath. Clean noise, like the tunnel and for the
        // tunnel's reason: the breaths are the beats where nothing has gone
        // wrong. NOT positional, and that is the visual made audible — a
        // wavefront leaving the visitor equally in all directions has no
        // direction to come from, the same argument as the glitch's
        // head-lock but for the opposite mood.
        const haloVoice = makeNoiseVoice(context, white, {
            filterType: 'lowpass', frequency: 420
        })
        const halo = { ...haloVoice, audio: new THREE.Audio(listener) }
        halo.audio.setNodeSource(halo.gain)

        // 02b — the rain, overhead. Crushed noise in a thin high band,
        // stuttering: many small digital events arriving from above, which is
        // where the streaks are born.
        const rain = positional(
            makeNoiseVoice(context, crushed, { filterType: 'bandpass', frequency: 3200, q: 2.5 }),
            2.4
        )
        rain.audio.position.set(0, 4.6, 0)

        // 07 — the sphere's drone. One deep detuned pair at the monument —
        // plus GRIT (2026-08-01, her ask: "we need more noisy sound for last
        // one"). A crushed-noise rumble rides the same bus, so the monument
        // is heard as a mass of static with a tone inside it rather than as
        // a clean note: the epilogue keeps the piece's dirty voice instead
        // of resolving into hi-fi. Sharing the bus shares the panner — the
        // metaball trick (hum + bubbles, one source position).
        const sphereBus = context.createGain()
        sphereBus.gain.value = 1
        const sphereOscA = context.createOscillator()
        const sphereOscB = context.createOscillator()
        sphereOscA.type = 'sine'
        sphereOscB.type = 'sine'
        sphereOscA.frequency.value = SPHERE_PITCH
        sphereOscB.frequency.value = SPHERE_PITCH + SPHERE_DETUNE
        const sphereGain = context.createGain()
        sphereGain.gain.value = 0
        sphereOscA.connect(sphereGain)
        sphereOscB.connect(sphereGain)
        sphereGain.connect(sphereBus)
        sphereOscA.start(0)
        sphereOscB.start(0)

        // The rumble. Lowpass rather than bandpass: sample-and-hold noise
        // through a low filter is gravel, not hiss, and gravel is what a
        // monument would be made of. Gained separately from the drone so
        // the two can be balanced per frame (the grit grows across the
        // beat; the drone does not).
        const sphereNoise = makeNoiseVoice(context, crushed, {
            filterType: 'lowpass', frequency: 240, q: 0.7
        })
        sphereNoise.gain.connect(sphereBus)

        const sphereAudio = new THREE.PositionalAudio(listener)
        // Where the sphere hangs, taken from the scene rather than copied —
        // the same seat the reel globe's step-out lands on (EXIT_SEAT in
        // ReelGlobe.jsx).
        const sphereSeatY = sphereHeight(DISPERSION_DEFAULTS.sphereSize)
        const sphereDistance = Math.hypot(sphereSeatY, SPHERE_Z)
        // refDistance IS the distance to the monument, and that is not a
        // fudge. Every other positional voice in the score sits within about
        // 5m of the standpoint, so its level is heard roughly as authored;
        // this one hangs 17m out, where the inverse distance model would take
        // a refDistance of 6 down to 6/(6+11) — a third of the level the
        // number in SPHERE_LEVEL says, on the closing beat. Seating
        // refDistance at the source's own distance makes the constant mean the
        // same thing here as everywhere else: the level AT the standpoint.
        // Falloff still works normally for a listener who moves off it.
        sphereAudio.setRefDistance(sphereDistance)
        sphereAudio.setNodeSource(sphereBus)
        sphereAudio.position.set(0, sphereSeatY, SPHERE_Z)
        const sphere = {
            audio: sphereAudio,
            gain: sphereGain,
            noise: sphereNoise,
            // The noise's BufferSource rides in `oscillators` so the existing
            // teardown stops it — .stop() is the same call on both node types.
            oscillators: [sphereOscA, sphereOscB, sphereNoise.source]
        }

        // 07 — the colonnade's flash. ONE voice snapped to whichever column is
        // currently brightest, which is exactly the cheat the scene plays with
        // its light (see "ONE travelling lamp, not eight" in
        // DispersionSphere.jsx) and it holds for the same reason: only one
        // column is really lit at a time, so a single panner stepping between
        // their positions is indistinguishable from eight sources firing in
        // turn — and eight more panners on the closing beat is a cost with
        // nothing to show for it.
        //
        // The columns step OUTWARD, alternating sides, from z = -7 to z = -34.
        // So the pulse genuinely walks away from the visitor and across them:
        // the one moment in the piece where a sound recedes into depth, which
        // is what the light is already doing and what the ear is best at.
        // CRUSHED since the noisy pass (2026-08-01) — the flashes were on
        // clean noise and read as polite next to the rest of the score; the
        // last beat's hits should be made of the same broken material as
        // everything after the tunnel.
        const strobeColumn = positional(
            makeNoiseVoice(context, crushed, {
                filterType: 'bandpass',
                frequency: STROBE_COLUMN_HZ,
                q: STROBE_COLUMN_Q
            }),
            4
        )

        // The veil's garbage is deliberately NOT positional: the glitch is
        // display damage, locked to the view, and its sound sits in the head
        // the same way the strips sit on the eye. Wide-open highpass — this
        // voice is allowed to be ugly.
        const glitchVoice = makeNoiseVoice(context, crushed, {
            filterType: 'highpass', frequency: 300
        })
        const glitch = {
            ...glitchVoice,
            audio: new THREE.Audio(listener),
            lastTick: -1
        }
        glitch.audio.setNodeSource(glitch.gain)

        return {
            tunnel, halo, scanTick, rain, patternHigh, patternLow, hums,
            sphere, strobeColumn, glitch
        }
    }, [listener])

    useEffect(() => () => {
        const all = [
            voices.tunnel, voices.halo, voices.scanTick, voices.rain,
            voices.patternHigh, voices.patternLow, ...voices.hums,
            voices.sphere, voices.strobeColumn, voices.glitch
        ]
        all.forEach((voice) => {
            try {
                voice.source?.stop()
                voice.oscillators?.forEach((oscillator) => oscillator.stop())
            } catch {
                // Already stopped — stopping twice throws and there is nothing
                // to do about it at teardown.
            }
            voice.gain.disconnect()
            voice.audio.disconnect()
        })
    }, [voices])

    useFrame((state) => {
        const context = listener.context
        const now = context.currentTime
        const time = state.clock.elapsedTime
        const set = (voice, target, smoothing = GATE_SMOOTHING) => {
            voice.gain.gain.setTargetAtTime(target, now, smoothing)
        }

        // 01 — rises with the corridor, dies AT the crush (contact is 86% of
        // the tunnel's window) rather than fading politely through it.
        const tunnelLocal = rowLocal(sequences, 's01-white-tunnel', playheadSec)
        if (tunnelLocal === null) {
            set(voices.tunnel, 0, SWELL_SMOOTHING)
        } else {
            const rush = smoothstep(0, 0.25, tunnelLocal) * (1 - smoothstep(0.82, 0.88, tunnelLocal))
            set(voices.tunnel, TUNNEL_LEVEL * (0.4 + 0.6 * tunnelLocal) * rush, SWELL_SMOOTHING)
            voices.tunnel.filter.frequency.setTargetAtTime(
                220 + 1500 * tunnelLocal * tunnelLocal, now, SWELL_SMOOTHING
            )
        }

        // 01b — the halo breathing. The gain IS the strobe swell, shaped
        // exactly as the rings shape their brightness, so what the eye sees
        // pulse is what the ear hears swell.
        const haloLocal = rowLocal(sequences, 's01b-halo', playheadSec)
        if (haloLocal === null) {
            set(voices.halo, 0, SWELL_SMOOTHING)
        } else {
            const envelope = smoothstep(0, 0.14, haloLocal) * smoothstep(1, 0.86, haloLocal)
            const wave = Math.sin(time * Math.PI * 2 * STROBE_HZ) * 0.5 + 0.5
            const swell = Math.pow(wave, STROBE_SHARPNESS)
            set(voices.halo, HALO_LEVEL * envelope * (0.25 + 0.75 * swell), SWELL_SMOOTHING)
        }

        // 02 — ticking digital chirps that circle the visitor.
        const scanLocal = rowLocal(sequences, 's02-scan', playheadSec)
        if (scanLocal === null) {
            set(voices.scanTick, 0)
        } else {
            const envelope = smoothstep(0, 0.1, scanLocal) * smoothstep(1, 0.9, scanLocal)
            set(voices.scanTick, SCAN_LEVEL * envelope * tickGate(time, SCAN_TICK_HZ, 0.22))
            const bearing = time * SCAN_CIRCLE_RATE
            voices.scanTick.audio.position.set(...ringPosition(bearing, SCAN_RING_RADIUS, 1.6))
        }

        // 02b — the rain pattering overhead, breathing on the same pulse.
        const rainLocal = rowLocal(sequences, 's02b-light-rain', playheadSec)
        if (rainLocal === null) {
            set(voices.rain, 0)
        } else {
            const envelope = smoothstep(0, 0.12, rainLocal) * smoothstep(1, 0.88, rainLocal)
            const wave = Math.sin(time * Math.PI * 2 * STROBE_HZ) * 0.5 + 0.5
            const swell = Math.pow(wave, STROBE_SHARPNESS)
            set(voices.rain, RAIN_LEVEL * envelope * (0.55 + 0.45 * swell)
                * stutterGate(time, RAIN_PATTER_HZ, 0.5))
        }

        // 03 — the two halves stepping against each other, half a cycle apart.
        const patternLocal = rowLocal(sequences, 's03-test-pattern', playheadSec)
        if (patternLocal === null) {
            set(voices.patternHigh, 0)
            set(voices.patternLow, 0)
        } else {
            const envelope = smoothstep(0, 0.1, patternLocal) * smoothstep(1, 0.9, patternLocal)
            set(voices.patternHigh, PATTERN_LEVEL * envelope * tickGate(time, PATTERN_TICK_HZ, 0.14))
            set(voices.patternLow, PATTERN_LEVEL * envelope
                * tickGate(time + 0.5 / PATTERN_TICK_HZ, PATTERN_TICK_HZ, 0.14))
        }

        // 04 — hums drifting on the ring, closing in and swelling with the
        // approach, held (like the ink wall) right up to the portal — and
        // blooping.
        const metaLocal = rowLocal(sequences, 's05-metaball-field', playheadSec)
        const approach = metaLocal === null ? 0 : smoothstep(HUM_APPROACH_START, 1, metaLocal)
        voices.hums.forEach((hum, index) => {
            if (metaLocal === null) {
                set(hum, 0, SWELL_SMOOTHING)
                return
            }
            const envelope = smoothstep(0, 0.12, metaLocal)
                * Math.max(smoothstep(1, 0.88, metaLocal), approach)
            set(hum, HUM_LEVEL * envelope * (1 + 0.8 * approach), SWELL_SMOOTHING)
            const bearing = hum.bearing + time * HUM_DRIFT_RATE
            const radius = HUM_RADIUS + (HUM_APPROACH_RADIUS - HUM_RADIUS) * approach
            hum.audio.position.set(...ringPosition(bearing, radius, 1.6 + (index - 1) * 0.4))

            // THE BUBBLES. One per period per voice, scheduled whole on the
            // audio clock the moment its cycle begins — sample-accurate
            // attack and sweep, however coarse the frame rate. Pitch and
            // length roll from the shared hash per cycle, so the boil never
            // repeats a pattern and always replays identically.
            const period = BUBBLE_PERIODS[index] * (1 - BUBBLE_QUICKEN * approach)
            const cycle = Math.floor(time / period)
            if (cycle !== hum.lastBubbleCycle && envelope > 0.05) {
                hum.lastBubbleCycle = cycle
                const roll = scoreHash(cycle * 7.3 + index * 13.7)
                const start = (170 + roll * 240) * (1 - BUBBLE_DEEPEN * approach)
                const length = 0.09 + roll * 0.08
                const peak = BUBBLE_LEVEL * envelope * (0.6 + 0.4 * roll)
                const gainParam = hum.bubbleGain.gain
                const freqParam = hum.bubbleOsc.frequency
                gainParam.cancelScheduledValues(now)
                freqParam.cancelScheduledValues(now)
                gainParam.setValueAtTime(0.0001, now)
                gainParam.linearRampToValueAtTime(peak, now + 0.012)
                gainParam.exponentialRampToValueAtTime(0.0005, now + length)
                gainParam.setValueAtTime(0, now + length + 0.01)
                freqParam.setValueAtTime(start, now)
                freqParam.exponentialRampToValueAtTime(start * BUBBLE_SWEEP, now + length)
            }
        })

        // 07 — the sphere's drone, swelling while the colonnade fires. The
        // fade-in is the longest in the score: the globe before it ends in
        // noise, and the drone should be noticed as already-there rather
        // than heard arriving.
        const sphereLocal = rowLocal(sequences, 's07-dispersion-sphere', playheadSec)
        if (sphereLocal === null) {
            set(voices.sphere, 0, SWELL_SMOOTHING)
            set(voices.sphere.noise, 0, SWELL_SMOOTHING)
            set(voices.strobeColumn, 0)
        } else {
            const envelope = smoothstep(0, 0.22, sphereLocal) * smoothstep(1, 0.9, sphereLocal)
            const amber = smoothstep(SPHERE_AMBER_IN, SPHERE_AMBER_IN + 0.08, sphereLocal)
                * smoothstep(SPHERE_AMBER_OUT, SPHERE_AMBER_OUT - 0.08, sphereLocal)
            set(voices.sphere, SPHERE_LEVEL * envelope * (1 + 0.6 * amber), SWELL_SMOOTHING)

            // The grit. Grows across the beat (0.5 → 1) so the monument gets
            // rougher as the piece ends rather than arriving at full gravel,
            // and leans harder into the strobe window than the drone does —
            // the flashes are the noisiest thing in the room, and the bed
            // underneath them should rise to meet them.
            set(voices.sphere.noise,
                SPHERE_NOISE_LEVEL * envelope * (0.5 + 0.5 * sphereLocal) * (1 + 0.9 * amber),
                SWELL_SMOOTHING)

            // The colonnade, heard. This repeats DispersionSphere's head/behind
            // maths verbatim off the SAME imported constants, so the flash the
            // ear gets is the flash the eye gets — not a rhythm tuned to look
            // similar. Wrapping per column rather than tracking an index is
            // the scene's own trick: no column can be skipped on a frame dip.
            const [strobeIn, strobeOut] = STROBE_WINDOW
            const running = sphereLocal > strobeIn && sphereLocal < strobeOut
            if (!running) {
                set(voices.strobeColumn, 0)
            } else {
                const head = ((sphereLocal - strobeIn) / (strobeOut - strobeIn))
                    * STROBE_RUNS * COLUMNS.length
                let leadIndex = 0
                let leadFlash = 0
                for (let index = 0; index < COLUMNS.length; index++) {
                    let behind = (head - index) % COLUMNS.length
                    if (behind < 0) behind += COLUMNS.length
                    const flash = Math.exp(-behind * STROBE_DECAY)
                    if (flash > leadFlash) {
                        leadFlash = flash
                        leadIndex = index
                    }
                }
                // Snapping the panner is what makes the pulse travel. The
                // decay is the scene's, so the tail is percussive rather than
                // a swell — a strobe that fades is a lamp, and the ear reads
                // that difference as readily as the eye.
                const lead = COLUMNS[leadIndex].position
                voices.strobeColumn.audio.position.set(lead[0], lead[1], lead[2])
                set(voices.strobeColumn, STROBE_COLUMN_LEVEL * leadFlash * envelope)
            }
        }

        // The veil — digital garbage stuttering up wherever the strips are.
        // Squared so the sound arrives with the full tears, not the first
        // sparse ones; double-gated for chop; pitch-jumped per stutter tick.
        const veil = totalVeil(sequences, playheadSec, durationSec)
        const gate = stutterGate(time, VEIL_STUTTER_HZ, 0.7)
            * stutterGate(time, VEIL_CHOP_HZ, 0.8)
        set(voices.glitch, GLITCH_LEVEL * veil * veil * gate)
        const glitchTick = Math.floor(time * VEIL_STUTTER_HZ)
        if (glitchTick !== voices.glitch.lastTick) {
            voices.glitch.lastTick = glitchTick
            // 0.4x is a growl, 2.2x a shriek; the jump between them per tick
            // is the sound the torn strips look like.
            voices.glitch.source.playbackRate.setValueAtTime(
                0.4 + scoreHash(glitchTick * 3.9) * 1.8, now
            )
        }
    })

    // Every positional voice mounted, because an unmounted Object3D never gets
    // updateMatrixWorld() and its panner silently stays at the origin — the
    // reel globe's audio bug, not repeated.
    return (
        <group>
            <primitive object={voices.tunnel.audio} />
            <primitive object={voices.scanTick.audio} />
            <primitive object={voices.rain.audio} />
            <primitive object={voices.sphere.audio} />
            <primitive object={voices.strobeColumn.audio} />
            <primitive object={voices.patternHigh.audio} />
            <primitive object={voices.patternLow.audio} />
            {voices.hums.map((hum) => (
                <primitive key={hum.audio.uuid} object={hum.audio} />
            ))}
        </group>
    )
}
