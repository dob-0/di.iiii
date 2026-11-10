import { describe, expect, it } from 'vitest'
import { stepCue } from './cueFiring.js'

const cues = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

describe('stepCue (setlist GO / BACK)', () => {
    it('GO with nothing live fires the first cue', () => {
        expect(stepCue(cues, null, 1)).toBe(cues[0])
    })
    it('GO moves to the next cue', () => {
        expect(stepCue(cues, 'a', 1)).toBe(cues[1])
    })
    it('BACK moves to the previous cue', () => {
        expect(stepCue(cues, 'c', -1)).toBe(cues[1])
    })
    it('stops at both ends instead of wrapping', () => {
        expect(stepCue(cues, 'c', 1)).toBeNull()
        expect(stepCue(cues, 'a', -1)).toBeNull()
    })
    it('BACK with nothing live and an empty list do nothing', () => {
        expect(stepCue(cues, null, -1)).toBeNull()
        expect(stepCue([], null, 1)).toBeNull()
    })
})
