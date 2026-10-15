// The U-Plus profiles (2026-10-15): the PAR's 8-ch map, the 40 W laser's 32-ch STATIC BEAM, the B380F stays the
// TESTED map, and the maker charts (scripts/place/fixtures/charts/) agree with what the desk sends.
// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { encodeDmx } from './dmxDecode.js'
import TYPES from './types/moxir.json'

const type = (code) => TYPES.types.find((t) => t.code === code)
const mode = (code, name) => type(code).modes.find((m) => m.name === name)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const chart = (code) => JSON.parse(readFileSync(path.join(ROOT, 'scripts/place/fixtures/charts', `${code.toLowerCase()}.json`), 'utf8'))
// the bytes in channel order: the channel's resting value, replaced by what encodeDmx wrote
const bytes = (m, want, type) => {
    const out = encodeDmx(m.channels, want, type)
    return m.channels.map((c) => out[c.role] ?? c.default ?? 0)
}

describe('UP-PL5403 8ch (U-Plus IP PAR-54X3)', () => {
    const m = mode('UP-PL5403', '8ch')
    it('is 8 channels: dimmer, R, G, B, W, strobe, function 0, speed 0', () => {
        expect(m.channels).toHaveLength(8)
        expect(m.channels.slice(0, 6).map((c) => c.role)).toEqual(['dimmer', 'r', 'g', 'b', 'w', 'strobe'])
        expect([m.channels[6].default, m.channels[7].default]).toEqual([0, 0])
    })
    it('a known look → the exact bytes (full amber-red at 50 %, the program channels stay 0)', () => {
        expect(bytes(m, { level: 0.5, colour: '#ff0000' })).toEqual([128, 255, 0, 0, 0, 0, 0, 0])
        expect(bytes(m, { level: 0 })).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    })
    it('the maker chart holds the 4-ch and 8-ch maps, CANDIDATE, with the function ranges', () => {
        const c = chart('UP-PL5403')
        expect(c.maker).toBe('U-Plus Lighting')
        expect(c.modes['8'].channels).toHaveLength(8)
        expect(c.modes['4'].channels).toHaveLength(4)
        expect(c.modes['8'].status).toBe('CANDIDATE')
        expect(c.modes['8'].channels[6].ranges.map((r) => r[0])).toEqual([0, 51, 101, 151, 201, 251])
    })
})

describe('UP-LA40WF 32ch static beam (U-Plus IP-LL40, manual IP-LL30)', () => {
    const m = mode('UP-LA40WF', '32ch')
    it('is 32 channels; at rest only ch 1 is 0 of the beam-defining channels: 2=200, 4=192, 5=8, 6/7=64', () => {
        expect(m.channels).toHaveLength(32)
        const rest = bytes(m, {})
        expect(rest.slice(0, 7)).toEqual([0, 200, 0, 192, 8, 64, 64])
        expect(rest.slice(7)).toEqual(Array(25).fill(0)) // 16-18 RGB 0 = brightest, 20-32 the second graphic off
    })
    it('a known look → the exact bytes: level 1, red, aimed +9.25° / −18.5° → X 95, Y 0', () => {
        const b = bytes(m, { level: 1, colour: '#ff0000', pan: 9.25, tilt: -18.5 })
        expect(b.slice(0, 7)).toEqual([255, 200, 0, 192, 25, 95, 0])
        expect(b.slice(7)).toEqual(Array(25).fill(0))
    })
    it('the aim is clamped to the scan field and 0° is the centre', () => {
        expect(bytes(m, { pan: 0, tilt: 0 }).slice(5, 7)).toEqual([64, 64])
        expect(bytes(m, { pan: 90, tilt: -90 }).slice(5, 7)).toEqual([125, 0])
    })
    it('the maker chart holds 19 and 32 ch; the 32-ch second graphic is ch 20-32', () => {
        const c = chart('UP-LA40WF')
        expect(c.modes['19'].channels).toHaveLength(19)
        expect(c.modes['32'].channels.map((x) => x.ch)).toEqual(Array.from({ length: 13 }, (_, i) => 20 + i))
        expect(c.modes['32'].same_as).toBe('19')
    })
    it('every colour slot the desk sends sits inside the chart\'s range for that colour', () => {
        const ch5 = chart('UP-LA40WF').modes['19'].channels[4].ranges
        for (const [hex, word] of [['#ffffff', 'white'], ['#ff0000', 'red'], ['#00ff00', 'green'], ['#0000ff', 'blue'], ['#ffff00', 'yellow'], ['#ff00ff', 'purple'], ['#00ffff', 'cyan']]) {
            const v = bytes(m, { colour: hex })[4]
            const hit = ch5.find((r) => v >= r[0] && v <= r[1])
            expect(hit[2], hex).toBe(word)
        }
    })
})

describe('UP-B380F stays the TESTED map; the U-Plus 380 Beam chart sits beside it', () => {
    it('16 ch, pan first (tested order), basis TESTED', () => {
        const m = mode('UP-B380F', '16ch')
        expect(m.channels.map((c) => c.role).slice(0, 4)).toEqual(['pan', 'tilt', 'panFine', 'tiltFine'])
        expect(m.channelsSource.basis).toBe('TESTED')
    })
    it('the maker chart is stored, marked as a different order, and never the desk\'s', () => {
        const c = chart('UP-B380F')
        expect(c.modes['16'].order_differs_from_tested).toBe(true)
        expect(c.modes['16'].channels.map((x) => x.function).slice(0, 3)).toEqual(['Colour', 'Strobe', 'Dimmer'])
        expect(c.modes['20'].channels).toHaveLength(20)
        expect(type('UP-B380F').makerChart.modes).toEqual({ '16': 'CANDIDATE', '20': 'CANDIDATE' })
    })
})

describe('makers', () => {
    it('the four U-Plus kinds name U-Plus Lighting with their manual; the cube is not U-Plus; every ASSUMED stays ASSUMED', () => {
        for (const code of ['UP-PL5403', 'UP-B380F', 'UP-LA40WF', 'UP-YZ31P']) expect(type(code).maker, code).toBe('U-Plus Lighting')
        expect(type('UP-PL5403').manual.basis).toBe('CANDIDATE')
        expect(type('UP-YZ31P').manual).toBeUndefined()
        expect(chart('UP-YZ31P').modes['1'].status).toBe('ASSUMED')
        expect(type('EXT-LC-ULTRA-MK2').maker).toBe(null)
    })
})
