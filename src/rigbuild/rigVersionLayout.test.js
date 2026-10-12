import { describe, it, expect } from 'vitest'
import { rigChromeTops, rigRowMaxWidth, rigVersionPlacement, WALK_HEADER_CLEAR, CONTROL_LINE } from './rigVersionLayout.js'

describe('rigChromeTops', () => {
    const top = 'calc(1rem)'

    it('leaves a room without a version row where it was', () => {
        expect(rigChromeTops(top, { rowShown: false, compact: true, rightControls: true }))
            .toEqual({ rowTop: top, chipTop: top })
    })

    it('keeps the row beside Walk / Fly on a wide viewport', () => {
        expect(rigChromeTops(top, { rowShown: true, compact: false, rightControls: true }))
            .toEqual({ rowTop: top, chipTop: `calc(${top} + ${CONTROL_LINE})` })
    })

    // 390x844: the row ran under Walk / Fly and only "ly" showed.
    it('gives the row its own line under Walk / Fly on a portrait phone', () => {
        const { rowTop, chipTop } = rigChromeTops(top, { rowShown: true, compact: true, rightControls: true })
        expect(rowTop).toBe(`calc(${top} + 1 * ${CONTROL_LINE})`)
        expect(chipTop).toBe(`calc(${rowTop} + ${CONTROL_LINE})`)
    })

    // MOXIR v1.1 at 390x844: Walk / Fly + Inside + Lite are three lines; the show chip sat on Lite.
    it('puts the show chip under the whole right-hand stack on a portrait phone', () => {
        expect(rigChromeTops(top, { rowShown: false, compact: true, rightLines: 3 }).chipTop).toBe(`calc(${top} + 3 * ${CONTROL_LINE})`)
        expect(rigChromeTops(top, { rowShown: true, compact: true, rightLines: 3 }).rowTop).toBe(`calc(${top} + 3 * ${CONTROL_LINE})`)
        expect(rigChromeTops(top, { rowShown: false, compact: false, rightLines: 3 }).chipTop).toBe(top)
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
