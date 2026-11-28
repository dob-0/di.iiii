import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { FRAME_RELAY_SCRIPT, injectFrameRelay } = require('./frameRelay.js')

describe('frame relay injection', () => {
    it('goes in just before the last </body>', () => {
        const out = injectFrameRelay('<html><body><canvas></canvas></BODY></html>')
        expect(out).toBe(`<html><body><canvas></canvas>${FRAME_RELAY_SCRIPT}</BODY></html>`)
    })
    it('goes at the end when there is no </body>', () => {
        expect(injectFrameRelay('<canvas></canvas>')).toBe(`<canvas></canvas>${FRAME_RELAY_SCRIPT}`)
    })
    it('is never added twice', () => {
        const once = injectFrameRelay('<body></body>')
        expect(injectFrameRelay(once)).toBe(once)
    })
    it('is a script that parses', () => {
        const source = FRAME_RELAY_SCRIPT.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')
        expect(() => new Function(source)).not.toThrow()
    })
})
