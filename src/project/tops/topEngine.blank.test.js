import { describe, expect, it } from 'vitest'
import { blankRule } from './topEngine.js'

// GUARD for "a camera clip whose camera gives no picture shows NOTHING" (2026-11-11, N3682).
// The rule is what the engine applies each frame; flip any line of blankRule and one of these goes red.
describe('blankRule: a camera with no picture is transparent, never a helper picture', () => {
    const blank = new Set(['cam'])
    it('a Blend whose b is blank passes a through (the layers below stay visible)', () => {
        expect(blankRule({ type: 'top.blend', inputs: { a: 'file', b: 'cam' }, blank })).toEqual({ pass: true, blank: false })
    })
    it('a Blend with nothing below and a blank b is blank itself and draws black', () => {
        expect(blankRule({ type: 'top.blend', inputs: { b: 'cam' }, blank })).toEqual({ pass: true, blank: true })
        expect(blankRule({ type: 'top.blend', inputs: { a: 'cam2', b: 'cam' }, blank: new Set(['cam', 'cam2']) })).toEqual({ pass: true, blank: true })
    })
    it('an effect (Body, anything with a) on a blank picture is blank, not painted', () => {
        expect(blankRule({ type: 'top.matte', inputs: { a: 'cam', b: 'cam' }, blank })).toEqual({ pass: false, blank: true })
        expect(blankRule({ type: 'top.level', inputs: { a: 'cam' }, blank })).toEqual({ pass: false, blank: true })
    })
    it('a Blend with a real b is drawn as usual, and so is everything not fed by a blank picture', () => {
        expect(blankRule({ type: 'top.blend', inputs: { a: 'file', b: 'clip' }, blank })).toBeNull()
        expect(blankRule({ type: 'top.level', inputs: { a: 'file' }, blank })).toBeNull()
    })
    it('a source is never ruled by this: its own picture decides (camera unplugged = no video element = blank, set by the engine)', () => {
        expect(blankRule({ type: 'top.camera', source: true, inputs: {}, blank })).toBeNull()
    })
})
