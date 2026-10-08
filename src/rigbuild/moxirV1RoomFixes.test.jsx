// MOXIR v1.0 in the room, 2026-10-08 — the regressions behind "a white blob, a flat brown hall, no lasers, no SHOW chip".
// Each guard here failed before its fix (seen failing, then passing):
//   1. a laser of 6 cubes x 2 beams is 6 units on the rental card, not "12 placed · 6 over the order";
//   2. the desk's looks carry DMX values (deskLooksWithValues), never the empty shells the cards page used to send — an
//      empty look left every patched lamp at the desk's idle full white, and the room draws patched lamps FROM the desk;
//   3. where the desk drives the room, the room says so (the SHOW chip, desk side), for this project's list only.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rentalCounts } from './rental.js'
import { TYPE_LIBRARY } from './types/index.js'
import { deskShowWords } from './RoomLookFollower.jsx'

const here = path.dirname(fileURLToPath(import.meta.url))

const beam = (cube, k) => ({
    id: `rig-laser-${cube}${k}`, type: 'spotLight',
    components: { fixture: { type: 'ext-lc-ultra-mk2', unit: cube, dmx: false, position: `named v1 laser-${cube}${k}` }, light: { intensity: 1 } }
})

describe('MOXIR v1.0 room fixes', () => {
    it('counts a laser cube once, however many beams it draws', () => {
        const entities = [1, 2, 3, 4, 5, 6].flatMap((n) => [beam(n, 'a'), beam(n, 'b')])
        const list = { items: [{ code: 'EXT-LC-ULTRA-MK2', type: 'ext-lc-ultra-mk2', ordered: 6 }] }
        const item = rentalCounts({ entities, library: TYPE_LIBRARY, list }).items.find((i) => i.type === 'ext-lc-ultra-mk2')
        expect(item.placed).toBe(6)
        expect(item.over).toBe(0)
    })

    it('still counts every lamp of a non-laser type, unit numbers or not', () => {
        const par = (i) => ({ id: `p${i}`, type: 'spotLight', components: { fixture: { type: 'up-pl5403', unit: 1 } } })
        const list = { items: [{ code: 'UP-PL5403', type: 'up-pl5403', ordered: 50 }] }
        const item = rentalCounts({ entities: [par(1), par(2), par(3)], library: TYPE_LIBRARY, list }).items.find((i) => i.type === 'up-pl5403')
        expect(item.placed).toBe(3)
    })

    it('sends the desk its looks WITH their DMX from the cards page (no empty shells)', () => {
        const src = fs.readFileSync(path.join(here, 'CardsSurface.jsx'), 'utf8')
        expect(src).toMatch(/deskLooksWithValues\(looks, rig\.fixtures/)
        expect(src).not.toMatch(/\bdeskLooks\(looks/)
    })

    it('words the desk runner for this project only', () => {
        const cues = { project: 'moxir-v1-0', index: 2, n: 13, name: 'Act 1 · the silhouette', running: true, nextInMs: 9000, loop: true }
        expect(deskShowWords(cues, 'moxir-v1-0')).toBe('3 / 13 · Act 1 · the silhouette · next in 9 s · loop')
        expect(deskShowWords(cues, 'another-room')).toBe('')
        expect(deskShowWords(null, 'moxir-v1-0')).toBe('')
        expect(deskShowWords({ ...cues, index: -1 }, 'moxir-v1-0')).toBe('')
    })
})
