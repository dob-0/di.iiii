import { risingEdge } from '../edge.js'
import { clockBeatMs, resolveClock } from '../../graph/beatClock.js'
import { seedOf, waveUnit } from '../../../shared/waves.js'

// Four waveforms of one phase, all -1..1, driven by the document clock so
// every window oscillates together. Wire the shape you mean from those four.
// Phase offsets in cycles (0.25 turns a sine into a cosine).
//
// Oscillator v2 (laser Phase 2): Wave picks the shape the Out output draws,
// from the module the /light desk's LFOs run (src/shared/waves.js). Beats
// > 0 sets the cycle in beats of a clock instead of Frequency in Hz: the clock
// wired into Clock, else the project's master clock. Amplitude and Offset
// scale every output; Bias leans Out's cycle; Reset restarts it now (per window,
// it lives in frameMemory). With all of these unwired the four old outputs are
// the old ones to the last bit — an existing document does not move.
const LEGACY = {
    sine: (t) => Math.sin(t * Math.PI * 2),
    square: (t, cycle) => (cycle < 0.5 ? 1 : -1),
    triangle: (t, cycle) => 1 - 4 * Math.abs(cycle - 0.5),
    saw: (t, cycle) => cycle * 2 - 1
}
const MIN_BEATS = 0.25
const MAX_BEATS = 64

export const computeOutput = (node, portId, { input, asNumber, context, output }) => {
    if (!LEGACY[portId] && portId !== 'out') return undefined
    const now = asNumber(context?.now, 0)
    const memory = context?.frameMemory
    const resetKey = `${node.id}:resetAt`
    if (risingEdge(memory, `${node.id}:reset`, input('reset'))) memory.set(resetKey, now)
    const resetAt = memory?.get(resetKey)
    const phase = asNumber(input('phase'), 0)
    const beats = asNumber(input('beats'), 0)
    let t
    if (beats > 0) {
        const clock = resolveClock(input('clock'), context, output)
        const start = resetAt ?? clock.epoch
        t = (now - start) / (Math.min(MAX_BEATS, Math.max(MIN_BEATS, beats)) * clockBeatMs(clock)) + phase
    } else {
        const frequency = asNumber(input('frequency'), 1)
        t = ((resetAt === undefined ? now : now - resetAt) / 1000) * frequency + phase
    }
    const amplitude = asNumber(input('amplitude'), 1)
    const offset = asNumber(input('offset'), 0)
    if (portId === 'out') {
        const unit = waveUnit(input('wave') || 'sine', t, seedOf(node.id), asNumber(input('bias'), 0))
        return offset + amplitude * (unit * 2 - 1)
    }
    const cycle = t - Math.floor(t)
    return offset + amplitude * LEGACY[portId](t, cycle)
}
