import { describe, expect, it } from 'vitest'
import {
    BEATS,
    NOMINAL_DURATION_SEC,
    beatProgress,
    blackAmount,
    dreamAmount,
    isWaitingForGate,
    nextBeatId,
    shouldAdvance,
    strangeAmount
} from './timeline.js'

describe('the edit list', () => {
    it('runs about two minutes, which is the brief', () => {
        expect(NOMINAL_DURATION_SEC).toBeLessThanOrEqual(120)
        expect(NOMINAL_DURATION_SEC).toBeGreaterThan(100)
    })

    it('chains every beat to the next and then stops', () => {
        const visited = []
        let id = BEATS[0].id
        while (id) {
            visited.push(id)
            id = nextBeatId(id)
        }
        expect(visited).toEqual(BEATS.map((beat) => beat.id))
    })

    it('gives every gated beat a gate to wait on', () => {
        for (const beat of BEATS) {
            if (beat.advance === 'gate') expect(beat.gate).toBeTruthy()
        }
    })
})

describe('advancing', () => {
    const garden = BEATS[0]
    const turn = BEATS.find((beat) => beat.id === 'turn')

    it('holds a gated beat forever when the player never interacts', () => {
        expect(shouldAdvance(garden, 9999, new Set())).toBe(false)
        expect(isWaitingForGate(garden, 9999)).toBe(true)
    })

    it('will not let an early interaction cut the beat short', () => {
        expect(shouldAdvance(garden, 2, new Set(['reach-tree']))).toBe(false)
    })

    it('advances a gated beat once both the clock and the gate agree', () => {
        expect(shouldAdvance(garden, garden.sec, new Set(['reach-tree']))).toBe(true)
    })

    it('advances a timed beat on the clock alone', () => {
        expect(shouldAdvance(turn, turn.sec, new Set())).toBe(true)
    })

    it('clamps progress rather than running past the end', () => {
        expect(beatProgress(garden, garden.sec * 4)).toBe(1)
        expect(beatProgress(garden, -5)).toBe(0)
    })
})

describe('the two dials', () => {
    it('keeps the dream whole until the glasses come off', () => {
        expect(dreamAmount('garden', 0.5)).toBe(1)
        expect(dreamAmount('bear', 1)).toBe(1)
        expect(dreamAmount('turn', 1)).toBe(1)
        expect(dreamAmount('stop', 1)).toBe(1)
    })

    it('empties the dream across the reveal beat', () => {
        expect(dreamAmount('reveal', 0)).toBe(1)
        expect(dreamAmount('reveal', 1)).toBe(0)
        expect(dreamAmount('reveal', 0.5)).toBeLessThan(1)
        expect(dreamAmount('reveal', 0.5)).toBeGreaterThan(0)
    })

    it('lets the dream back in at the end, but not all the way', () => {
        expect(dreamAmount('ending', 0.3)).toBe(0)
        const returned = dreamAmount('ending', 1)
        expect(returned).toBeGreaterThan(0.5)
        expect(returned).toBeLessThan(1)
    })

    it('only turns strange from the turn onwards, and never turns back', () => {
        expect(strangeAmount('garden', 1)).toBe(0)
        expect(strangeAmount('bear', 1)).toBe(0)
        expect(strangeAmount('turn', 0)).toBe(0)
        expect(strangeAmount('turn', 1)).toBe(1)
        expect(strangeAmount('stop', 0.5)).toBe(1)
        expect(strangeAmount('ending', 0.5)).toBe(1)
    })

    it('fades to black only in the last tenth of the last beat', () => {
        expect(blackAmount('reveal', 1)).toBe(0)
        expect(blackAmount('ending', 0.5)).toBe(0)
        expect(blackAmount('ending', 1)).toBe(1)
    })
})
