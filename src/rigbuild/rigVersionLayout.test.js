import { describe, it, expect } from 'vitest'
import { rigChromeTops, rigVersionPlacement, WALK_HEADER_CLEAR, CONTROL_LINE } from './rigVersionLayout.js'

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
