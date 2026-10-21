import { describe, expect, it } from 'vitest'
import { DI_HELP_LINES } from '../../src/kit/kitCatalogue.js'

// A space is a space (docs/ai/vocabulary.md). Until 2026-10-21 the di command
// called one a "room" in five lines, and the kit quoted one of them. "phones in
// the room" stays: that is the real room the phones are in (a place).
process.env.NO_COLOR = '1'
const { ui } = await import('./ui.mjs')

const ROOM = /\brooms?\b/i

describe('the di command calls a space a space', () => {
    it('di help: --guests says space', () => {
        const line = ui.help().split('\n').find((l) => l.includes('--guests'))
        expect(line).not.toMatch(ROOM)
        expect(line).toMatch(/their own space, not yours/)
    })

    it('the kit quotes the same --guests line', () => {
        const line = DI_HELP_LINES.find((l) => l.startsWith('--guests'))
        expect(line).not.toMatch(ROOM)
        expect(ui.help()).toContain(line)
    })

    it('di up: the tools door', () => {
        const line = ui.running('http://localhost:4000/', ['main']).split('\n').find((l) => l.includes('/tools'))
        expect(line).not.toMatch(ROOM)
    })

    it('di follow: what travels', () => {
        const text = ui.following('demo', 'https://dev.diiii.xyz/serverXR', true)
        expect(text).not.toMatch(ROOM)
        expect(text).toMatch(/the space and every project in it/)
    })

    it('di up --lan --guests: what a visitor gets', () => {
        const first = ui.guestsOn().split('\n')[0]
        expect(first).not.toMatch(ROOM)
        expect(first).toMatch(/their own space and the open space/)
    })
})
