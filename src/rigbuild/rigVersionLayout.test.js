import { describe, it, expect } from 'vitest'
import { rigChromeTops, CONTROL_LINE } from './rigVersionLayout.js'

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
