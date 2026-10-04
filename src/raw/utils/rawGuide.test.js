import { describe, expect, it } from 'vitest'
import { describeCanvas, getGuideManualPath, helpKeyRows, helpLines } from './rawGuide.js'
import { KEYMAP } from '../input/keymap.js'

describe('rawGuide: Help as one true sheet (audit row 8)', () => {
    it('speaks about the canvas that is open, and never says it starts empty over a full one', () => {
        expect(describeCanvas({ nodeCount: 5, wireCount: 0 })).toBe('5 nodes · nothing wired yet')
        expect(describeCanvas({ nodeCount: 1, wireCount: 1 })).toBe('1 node · 1 wire')
        expect(describeCanvas({ nodeCount: 4, wireCount: 3, thingCount: 2 })).toBe('4 nodes · 2 things · 3 wires')
        expect(describeCanvas({ nodeCount: 0, thingCount: 0 })).toMatch(/^Empty canvas/)
        // "nothing wired" is only said when no wire exists; "empty" only when it is
        for (const [nodeCount, wireCount] of [[1, 0], [2, 1], [7, 4]]) {
            const line = describeCanvas({ nodeCount, wireCount })
            expect(line).not.toMatch(/empty|starts empty/i)
            expect(/nothing wired/.test(line)).toBe(wireCount === 0)
        }
    })

    it('has exactly the seven lines Make, Wire, Open, Back, Move, Zoom, Delete', () => {
        expect(helpLines().map((l) => l.label)).toEqual(['Make', 'Wire', 'Open', 'Back', 'Move', 'Zoom', 'Delete'])
    })

    it('reads its keys from the keymap, so a line cannot name a key the canvas does not bind', () => {
        const byLabel = Object.fromEntries(helpLines().map((l) => [l.label, l]))
        const bound = new Set(KEYMAP.flatMap((r) => r.keys))
        expect(bound.has('/')).toBe(true)
        expect(byLabel.Make.key).toBe('/')
        expect(byLabel.Zoom.key.split(' · ').every((k) => bound.has(k))).toBe(true)
        expect(bound.has(byLabel.Delete.key)).toBe(true)
        expect(byLabel.Back.key).toBe('Esc')
    })

    it('lists every key and mouse row, from the table', () => {
        expect(helpKeyRows().map(([does]) => does)).toEqual(KEYMAP.map((r) => r.does))
    })

    it('teaches no retired surface', () => {
        const text = JSON.stringify([helpLines(), helpKeyRows()])
        expect(text).not.toMatch(/Switch View|builds the scene|builds the interface|starts empty/)
    })

    it('exposes the manual path', () => {
        expect(getGuideManualPath()).toBe('docs/raw/USER_MANUAL.md')
    })
})
