import { PULSE_WIDTH } from '../../../shared/waves.js'
import { readAnalysis, readGridAt, bandAt } from './beatGrid.js'

// Beat Grid: music to wires from a BAKED analysis (beat times and three
// bands, docs/ai/decisions/2026-10-21-beat-bake-method.md), never a live
// analyser, so the same second of the track always gives the same numbers
// and a piece built on it can be seeked.
//
// Time is seconds into the track: wire the playing position in, or leave it
// bare to read the document clock (context.now) as the track's own clock.
// With no analysis every number reads 0 and Status says why.
const BAND_PORTS = new Set(['low', 'mid', 'high'])

const secondsOf = (input, asNumber, context) => {
    const wired = input('time')
    return wired === undefined || wired === null || wired === ''
        ? asNumber(context?.now, 0) / 1000
        : asNumber(wired, 0)
}

export const computeOutput = (node, portId, { input, asNumber, context }) => {
    const analysis = readAnalysis(input('analysis'))
    if (portId === 'status') {
        if (!analysis) return 'no analysis: paste or wire a baked beat analysis'
        return `${analysis.beats.length} beats · ${analysis.beatsPerBar} a bar${analysis.bands ? ' · bands' : ' · no bands'}`
    }
    const t = secondsOf(input, asNumber, context)
    if (BAND_PORTS.has(portId)) return bandAt(analysis, portId, t)
    if (!analysis) {
        if (portId === 'pulse' || portId === 'strong') return false
        // null, not undefined: "no clock", so an Oscillator wired to it
        // follows the master clock (resolveClock).
        if (portId === 'clock') return null
        return 0
    }
    const grid = readGridAt(analysis, t)
    // Pulse and Strong are true for the first tenth of a beat (as Beat's Pulse).
    const onBeat = grid.index >= 0 && grid.bpm > 0 && grid.age < (60 / grid.bpm) * PULSE_WIDTH
    if (portId === 'pulse') return onBeat
    if (portId === 'strong') return onBeat && grid.strong
    if (portId === 'clock') {
        // A clock an Oscillator can follow: the local tempo, with beat 0 put
        // where this beat's phase says, in document-clock ms.
        if (!(grid.bpm > 0)) return null
        const beatMs = 60000 / grid.bpm
        const now = asNumber(context?.now, 0)
        return {
            kind: 'clock', id: node.id, bpm: grid.bpm,
            epoch: now - (grid.index + grid.phase) * beatMs,
            beatsPerBar: analysis.beatsPerBar, master: false, source: 'track'
        }
    }
    if (portId in grid) return grid[portId]
    return undefined
}
