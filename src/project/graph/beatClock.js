import { sanitizeBpm } from '../../timeline/showClock.js'

// Clocks for the graph (owner 2026-10-14, decision 3 of
// docs/ai/decisions/2026-10-14-raw-laser-workflow.md: "TD-style: one master
// clock loop runs, LFOs follow it, extra clocks can be added").
//
// A clock is a loop that counts beats at a tempo: { kind: 'clock', bpm, epoch }
// where epoch is the document-clock millisecond (context.now) at which beat 0
// landed. Beats at `now` are (now - epoch) / (60000 / bpm); an epoch may be
// negative or far in the past, only the phase it sets matters.
//
// The MASTER clock always runs. It is the first Beat node in the project set
// to Master; with no such node it is 120 bpm with beat 0 at the document
// clock's origin. Every other Beat is an extra clock, and an Oscillator picks
// one by wiring its Clock output in. The /light desk is a SOURCE a Beat may
// choose for its tempo and phase, never the leader of the graph.

export const BEAT_TYPE_ID = 'signal.beat'
export const DEFAULT_BEATS_PER_BAR = 4
export const DEFAULT_MASTER_CLOCK = Object.freeze({
    kind: 'clock', id: null, bpm: 120, epoch: 0, beatsPerBar: DEFAULT_BEATS_PER_BAR, master: true, source: 'own'
})

export const isClock = (value) => Boolean(value && typeof value === 'object' && value.kind === 'clock'
    && Number.isFinite(value.bpm) && Number.isFinite(value.epoch))

export const clockBeatMs = (clock) => 60000 / sanitizeBpm(clock?.bpm)

// Fractional beats since the clock's epoch at document-clock `now`.
export const clockBeats = (clock, now) => {
    const epoch = Number.isFinite(clock?.epoch) ? clock.epoch : 0
    return (now - epoch) / clockBeatMs(clock)
}

// The Beat node that IS the master clock, or null. A Beat's role is a
// setting (node.values.role), not a wire: which clock leads the project must
// not change because a number on a wire did. First in document order wins,
// so two Beats both set to Master never fight; the later one runs as an extra
// clock and says so. Memoised per pass (nodesById is rebuilt every pass).
const masterByNodes = new WeakMap()
export const findMasterBeatNode = (context) => {
    const nodes = context?.nodesById
    if (!nodes) return null
    if (masterByNodes.has(nodes)) return masterByNodes.get(nodes)
    let found = null
    for (const node of nodes.values()) {
        if (node?.typeId === BEAT_TYPE_ID && node.values?.role !== 'extra') { found = node; break }
    }
    masterByNodes.set(nodes, found)
    return found
}

// The clock an Oscillator follows: the one wired into it, else the master.
// `output(node, port)` evaluates another node's output inside this pass.
export const resolveClock = (wired, context, output) => {
    if (isClock(wired)) return wired
    const master = findMasterBeatNode(context)
    if (master && typeof output === 'function') {
        const clock = output(master, 'clock')
        if (isClock(clock)) return clock
    }
    return DEFAULT_MASTER_CLOCK
}

// The desk's clock as a Beat reads it: { bpm, epoch } in document-clock ms,
// put on liveOutputs as `${nodeId}:light` by BeatFeed. Anything else is "no
// desk", and the Beat keeps its own tempo.
export const readDeskClock = (context, nodeId) => {
    const reading = context?.liveOutputs?.get?.(`${nodeId}:light`)
    return reading && Number.isFinite(reading.bpm) && reading.bpm > 0 && Number.isFinite(reading.epoch) ? reading : null
}

// Wall-clock ms (Date.now, the desk's timeline) to document-clock ms
// (context.now, see useDocumentClock): the document clock is wall time minus
// the stamped showState.clockEpoch, or performance.now() before the stamp.
export const wallToDocumentMs = (wallMs, clockEpoch, timeOrigin = globalThis.performance?.timeOrigin || 0) => (
    clockEpoch > 0 ? wallMs - clockEpoch : wallMs - timeOrigin
)
