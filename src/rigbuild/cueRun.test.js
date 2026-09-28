import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { cueClockWords, cueListSignature, deskCueList, nextCueIndex } from './cueRun.js'

// The cards page's side of the desk's cue runner (serverXR/src/lighting/cuerun.js;
// the runner itself is held by serverXR/src/lighting/tests/test-cues.js).
const here = path.dirname(fileURLToPath(import.meta.url))

describe('the cue list on the desk', () => {
    it('hands the desk the cues that name a look, with their hold and fade', () => {
        const list = deskCueList([
            { id: 'c1', name: 'One beam', lightLook: 'rig-one-beam', hold: 12, fade: 3 },
            { id: 'c2', name: 'map only', lightLook: '', hold: 5 },
            { id: 'c3', lightLook: 'rig-red-room', hold: '16', fade: undefined }
        ])
        expect(list).toEqual([
            { id: 'c1', name: 'One beam', lookId: 'rig-one-beam', hold: 12, fade: 3 },
            { id: 'c3', name: 'rig-red-room', lookId: 'rig-red-room', hold: 16, fade: 0 }
        ])
        expect(cueListSignature([{ id: 'a', lightLook: 'x', hold: 1 }])).not.toBe(cueListSignature([{ id: 'a', lightLook: 'x', hold: 2 }]))
    })

    it('GO after the last cue is cue 1 while looping, and nothing when not', () => {
        expect(nextCueIndex(-1, 5, false)).toBe(0)
        expect(nextCueIndex(2, 5, false)).toBe(3)
        expect(nextCueIndex(4, 5, true)).toBe(0)
        expect(nextCueIndex(4, 5, false)).toBe(-1)
        expect(nextCueIndex(0, 0, true)).toBe(-1)
    })

    it('says where the desk is in words', () => {
        expect(cueClockWords({ running: true, nextInMs: 11200, loop: true, missing: [] })).toBe('next in 12 s · loop')
        expect(cueClockWords({ running: false, loop: false, missing: ['rig-x'] })).toBe('stopped · 1 look not on the desk')
    })

    it('the cards page runs no timer of its own while a desk is here — one clock, the desk\'s', () => {
        const src = readFileSync(path.join(here, 'CardsSurface.jsx'), 'utf8')
        // the only setTimeout in the page is the no-desk preview, guarded by deskHere
        const timers = src.match(/setTimeout\(/g) || []
        expect(timers).toHaveLength(1)
        expect(src).toMatch(/if \(deskHere \|\| !localRunning\) return undefined[\s\S]{0,300}setTimeout\(/)
        // and GO with a desk here goes to the desk's runner, not to fireCue's own recall
        expect(src).toMatch(/await deskCues\.go\(i\)/)
        expect(src).toMatch(/type: 'setMappingState', payload: \{ patch: \{ loop: next \} \}/)
        expect(src).toMatch(/aria-pressed=\{loop\}/)
    })
})
