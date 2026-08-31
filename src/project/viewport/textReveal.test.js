import { describe, it, expect } from 'vitest'
import { typewriterState, typewriterDuration, TEXT_REVEAL_DEFAULTS } from './textReveal.js'

// 10 chars at 10/sec = 1s per line, plus a 0.5s pause = 1.5s per line.
const CONFIG = { speed: 10, delay: 1, lineDelay: 0.5, hold: 2 }
const LINES = [10, 10, 10]

describe('typewriterState', () => {
    it('reveals nothing before the delay, without flashing the first line', () => {
        expect(typewriterState(0, LINES, CONFIG)).toEqual({ line: -1, chars: 0, done: false })
        expect(typewriterState(0.99, LINES, CONFIG)).toEqual({ line: -1, chars: 0, done: false })
    })

    it('types the first line one character at a time', () => {
        expect(typewriterState(1, LINES, CONFIG)).toMatchObject({ line: 0, chars: 0 })
        expect(typewriterState(1.5, LINES, CONFIG)).toMatchObject({ line: 0, chars: 5 })
        expect(typewriterState(1.9, LINES, CONFIG)).toMatchObject({ line: 0, chars: 9 })
    })

    it('holds a completed line through its trailing pause instead of overrunning', () => {
        // 1s of typing done; the 0.5s lineDelay must not reveal an 11th char.
        expect(typewriterState(2.2, LINES, CONFIG)).toMatchObject({ line: 0, chars: 10 })
        expect(typewriterState(2.49, LINES, CONFIG)).toMatchObject({ line: 0, chars: 10 })
    })

    it('moves to the next line after the pause', () => {
        expect(typewriterState(2.5, LINES, CONFIG)).toMatchObject({ line: 1, chars: 0 })
        expect(typewriterState(3.0, LINES, CONFIG)).toMatchObject({ line: 1, chars: 5 })
    })

    it('finishes on the last line and reports done', () => {
        const end = typewriterState(99, LINES, CONFIG)
        expect(end).toEqual({ line: 2, chars: 10, done: true })
    })

    it('never reports done while looping, and restarts after the hold', () => {
        const cycle = typewriterDuration(LINES, CONFIG) + CONFIG.hold // 4.5 + 2
        const looping = { ...CONFIG, loop: true }
        expect(typewriterState(1 + cycle + 0.5, LINES, looping)).toMatchObject({ line: 0, chars: 5 })
        expect(typewriterState(1 + cycle + 0.5, LINES, looping).done).toBe(false)
    })

    it('treats blank lines as a pure pause, not a stall', () => {
        const withBlank = [4, 0, 4]
        // line 0 types in 0.4s and its pause ends at 0.9s; the blank line then
        // costs only its own pause. 2.0 rather than 1.9 keeps the assertion off
        // the exact line boundary, where float error decides the answer.
        expect(typewriterState(2.0, withBlank, CONFIG)).toMatchObject({ line: 1, chars: 0 })
        expect(typewriterState(2.5, withBlank, CONFIG)).toMatchObject({ line: 2 })
    })

    it('handles an empty text without dividing by zero', () => {
        expect(typewriterState(5, [], CONFIG)).toEqual({ line: -1, chars: 0, done: true })
    })

    it('guards against a zero or negative speed', () => {
        expect(() => typewriterState(2, LINES, { ...CONFIG, speed: 0 })).not.toThrow()
        expect(typewriterState(99, LINES, { ...CONFIG, speed: 0 }).done).toBe(true)
    })

    it('defaults to no reveal so existing text is unaffected', () => {
        expect(TEXT_REVEAL_DEFAULTS.mode).toBe('none')
    })
})
