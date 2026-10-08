import { describe, it, expect } from 'vitest'
import { rigChromeTops, rigRowMaxWidth, rigVersionPlacement, rigRightColumnLines, rigChipMaxWidth, WALK_HEADER_CLEAR, CONTROL_LINE } from './rigVersionLayout.js'

describe('rigChromeTops', () => {
    const top = 'calc(1rem)'

    it('leaves a room without a version row where it was, on a wide viewport', () => {
        expect(rigChromeTops(top, { rowShown: false, compact: false, rightControls: true }))
            .toEqual({ rowTop: top, chipTop: top })
    })

    // With no row the chip was the first line on the left and ran under Walk / Fly on a phone.
    it('puts the chip under the right column on a phone when there is no row', () => {
        expect(rigChromeTops(top, { rowShown: false, compact: true, rightControls: true }).chipTop)
            .toBe(`calc(${top} + ${CONTROL_LINE})`)
    })

    // 384x832, dev.diiii.xyz/moxir/v1-0, 2026-10-08: the column is Walk / Fly, Inside, Lite. The row on
    // line 2 covered Inside, the chip on line 3 covered Lite. Both now start under the third line.
    it('starts the row and the chip under a three-line column on a portrait phone', () => {
        const { rowTop, chipTop } = rigChromeTops(top, { rowShown: true, compact: true, rightControls: true, rightLines: 3 })
        expect(rowTop).toBe(`calc(${top} + 3 * ${CONTROL_LINE})`)
        expect(chipTop).toBe(`calc(${rowTop} + ${CONTROL_LINE})`)
    })

    it('keeps the wide layout whatever the column holds', () => {
        expect(rigChromeTops(top, { rowShown: true, compact: false, rightControls: true, rightLines: 3 }).rowTop).toBe(top)
    })

    it('keeps the row beside Walk / Fly on a wide viewport', () => {
        expect(rigChromeTops(top, { rowShown: true, compact: false, rightControls: true }))
            .toEqual({ rowTop: top, chipTop: `calc(${top} + ${CONTROL_LINE})` })
    })

    // 390x844: the row ran under Walk / Fly and only "ly" showed.
    it('gives the row its own line under Walk / Fly on a portrait phone', () => {
        const { rowTop, chipTop } = rigChromeTops(top, { rowShown: true, compact: true, rightControls: true })
        expect(rowTop).toBe(`calc(${top} + ${CONTROL_LINE})`)
        expect(chipTop).toBe(`calc(${rowTop} + ${CONTROL_LINE})`)
    })

    it('keeps the top line on a phone when nothing sits on the right', () => {
        expect(rigChromeTops(top, { rowShown: true, compact: true, rightControls: false }).rowTop).toBe(top)
    })
})

// Walk mode: the room's header is line one, the joystick and Fly are at the bottom, so the
// version control is one collapsed button on the free line under the header (owner: switch
// without pressing Esc). Orbit keeps the row where it was; a room that is no set has neither.
describe('rigVersionPlacement', () => {
    const top = 'calc(1rem)'
    it('orbit: the row, at the row top', () => {
        expect(rigVersionPlacement(top, { isRigSet: true, navMode: 'orbit', rowTop: 'X' })).toEqual({ mode: 'row', top: 'X' })
    })
    it('walk: the collapsed control under the room header', () => {
        expect(rigVersionPlacement(top, { isRigSet: true, navMode: 'walk' })).toEqual({ mode: 'walk', top: `calc(${top} + ${WALK_HEADER_CLEAR})` })
    })
    it('not a set: nothing in either mode', () => {
        expect(rigVersionPlacement(top, { isRigSet: false, navMode: 'walk' }).mode).toBe(null)
        expect(rigVersionPlacement(top, { isRigSet: false, navMode: 'orbit' }).mode).toBe(null)
    })
})

// Measured 2026-09-30 on the owner's install: ten live versions made the row 2216 px wide inside a
// 1799 px area, and it covered Walk / Fly (top right, same line). The row must stop before them.
describe('rigRowMaxWidth', () => {
    it('keeps the full width when nothing sits on the right', () => {
        expect(rigRowMaxWidth({ compact: false, walk: false, sound: false })).toBe('calc(100vw - 2rem)')
    })

    it('stops before Walk / Fly on a wide viewport', () => {
        expect(rigRowMaxWidth({ compact: false, walk: true, sound: false })).toBe('calc(100vw - 10.5rem)')
    })

    it('stops before Sound and Walk / Fly together', () => {
        expect(rigRowMaxWidth({ compact: false, walk: true, sound: true })).toBe('calc(100vw - 18.5rem)')
    })

    it('stops before Sound alone', () => {
        expect(rigRowMaxWidth({ compact: false, walk: false, sound: true })).toBe('calc(100vw - 10rem)')
    })

    it('keeps the full width on a compact phone, where the row has a line of its own', () => {
        expect(rigRowMaxWidth({ compact: true, walk: true, sound: true })).toBe('calc(100vw - 2rem)')
    })

    it('never leaves the reserve smaller than Walk / Fly (about 8.7 rem from the right edge)', () => {
        const rem = (v) => Number(String(v).match(/- ([\d.]+)rem\)$/)?.[1])
        expect(rem(rigRowMaxWidth({ walk: true }))).toBeGreaterThanOrEqual(8.7)
        expect(rem(rigRowMaxWidth({ walk: true, sound: true }))).toBeGreaterThanOrEqual(16)
    })
})

describe('rigRightColumnLines', () => {
    it('counts Walk / Fly, Inside where there is a building, and Lite', () => {
        expect(rigRightColumnLines({ walk: true, building: true })).toBe(3)
        expect(rigRightColumnLines({ walk: true, building: false })).toBe(2)
    })
    it('counts Sound alone as one line, and nothing as none', () => {
        expect(rigRightColumnLines({ walk: false, sound: true })).toBe(1)
        expect(rigRightColumnLines({})).toBe(0)
    })
})

// The chip had no width cap but the window's: on line 2 a long cue name ran under Inside / Lite.
describe('rigChipMaxWidth', () => {
    it('has the full width on a phone, where it sits under the column', () => {
        expect(rigChipMaxWidth({ compact: true, walk: true, rowShown: true })).toBe('calc(100vw - 2rem)')
    })
    it('stops before Inside / Lite under the row on a wide viewport', () => {
        expect(rigChipMaxWidth({ compact: false, walk: true, rowShown: true })).toBe('calc(100vw - 10.5rem)')
    })
    it('follows the row rule on the top line when there is no row', () => {
        expect(rigChipMaxWidth({ compact: false, walk: true, sound: true, rowShown: false })).toBe('calc(100vw - 18.5rem)')
    })
    it('keeps the full width when nothing sits on the right', () => {
        expect(rigChipMaxWidth({ compact: false, rowShown: true })).toBe('calc(100vw - 2rem)')
    })
})
