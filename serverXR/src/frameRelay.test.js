import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { FRAME_RELAY_SCRIPT, injectFrameRelay, injectFrameRelayBuffer } = require('./frameRelay.js')

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
    it('finds the real </body> when earlier text lowercases to a different length (U+0130)', () => {
        const out = injectFrameRelay('<html><body><h1>\u0130\u0130\u0130\u0130\u0130</h1></body></html>')
        expect(out).toBe(`<html><body><h1>\u0130\u0130\u0130\u0130\u0130</h1>${FRAME_RELAY_SCRIPT}</body></html>`)
    })
    it('skips a </body> that is JS text inside a script', () => {
        const page = "<canvas></canvas><script>document.write('</body>')</script>"
        expect(injectFrameRelay(page)).toBe(`${page}${FRAME_RELAY_SCRIPT}`)
    })
    it('adds the script to raw bytes without touching the page bytes', () => {
        const head = Buffer.from('<html><body>', 'latin1')
        const bad = Buffer.from([0xe9, 0xff, 0xc3]) // latin-1 / invalid utf-8
        const tail = Buffer.from('</body></html>', 'latin1')
        const out = injectFrameRelayBuffer(Buffer.concat([head, bad, tail]))
        const expected = Buffer.concat([head, bad, Buffer.from(FRAME_RELAY_SCRIPT), tail])
        expect(out.equals(expected)).toBe(true)
    })
})
