import { sanitizeBpm } from '../../../timeline/showClock.js'
import { DEFAULT_BEATS_PER_BAR, clockBeats, findMasterBeatNode, readDeskClock } from '../../graph/beatClock.js'
import { PULSE_WIDTH } from '../../../shared/waves.js'

// A clock (TouchDesigner's Beat CHOP). Its tempo is its own BPM, or the /light
// desk's when Tempo from says so and the desk answers (BeatFeed puts the
// desk's reading on liveOutputs). Tap and Reset are handled by BeatFeed, which
// writes the tapped tempo into node.values (bpm, epoch) so every window agrees,
// or forwards the tap to the desk. Here everything is a function of `now`.
//
// Period is in beats (fractions allowed): Ramp climbs 0..1 over one period,
// Pulse is true for its first tenth, Count is periods since beat 0.
const clockOf = (node, input, asNumber, context) => {
    const desk = input('source') === 'light' ? readDeskClock(context, node.id) : null
    const master = findMasterBeatNode(context)?.id === node.id
    return {
        kind: 'clock',
        id: node.id,
        bpm: sanitizeBpm(desk ? desk.bpm : asNumber(input('bpm'), 120)),
        epoch: desk ? desk.epoch : asNumber(node.values?.epoch, 0),
        beatsPerBar: DEFAULT_BEATS_PER_BAR,
        master,
        source: desk ? 'light' : 'own'
    }
}

const statusOf = (node, clock, input) => {
    const role = clock.master ? 'master clock' : 'extra clock'
    const note = !clock.master && node.values?.role !== 'extra' ? ' (another Beat is the master)' : ''
    const tempo = clock.source === 'light' ? `${clock.bpm} bpm from the Light desk`
        : input('source') === 'light' ? `${clock.bpm} bpm (no Light desk answers)` : `${clock.bpm} bpm`
    return `${role}${note} · ${tempo}`
}

export const computeOutput = (node, portId, { input, asNumber, context }) => {
    const clock = clockOf(node, input, asNumber, context)
    if (portId === 'clock') return clock
    if (portId === 'bpm') return clock.bpm
    if (portId === 'status') return statusOf(node, clock, input)
    const beats = clockBeats(clock, asNumber(context?.now, 0))
    const period = Math.max(1 / 64, asNumber(input('period'), 1))
    const periods = beats / period
    const ramp = periods - Math.floor(periods)
    if (portId === 'ramp') return ramp
    if (portId === 'pulse') return ramp < PULSE_WIDTH
    if (portId === 'count') return Math.floor(periods)
    const bars = beats / clock.beatsPerBar
    if (portId === 'bar') return Math.floor(bars)
    if (portId === 'rampBar') return bars - Math.floor(bars)
    // 1..beatsPerBar, the beat a musician counts.
    if (portId === 'beat') return (((Math.floor(beats) % clock.beatsPerBar) + clock.beatsPerBar) % clock.beatsPerBar) + 1
    return undefined
}
