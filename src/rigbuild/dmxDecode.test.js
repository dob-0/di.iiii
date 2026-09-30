import { describe, expect, it } from 'vitest'
import { decodeDmx, degFromHome, encodeDmx, rateAt, shutterAt, sixteen, wheelAt } from './dmxDecode.js'
import { ASSUMED_PROFILES, assumedModesOf } from './assumedProfiles.js'
import TYPES from './types/moxir.json'

const type = (code) => TYPES.types.find((t) => t.code === code)
const mode = (code, name) => type(code).modes.find((m) => m.name === name)
// The fixture's values from { role: value } in its channel order.
const valuesOf = (m, byRole) => m.channels.map((c) => byRole[c.role] ?? c.default ?? 0)

describe('16-bit and pan/tilt maths', () => {
    it('coarse × 256 + fine over 65535', () => {
        expect(sixteen(0, 0)).toBe(0)
        expect(sixteen(255, 255)).toBe(1)
        expect(sixteen(128, 0)).toBeCloseTo(32768 / 65535, 10)
        expect(sixteen(51, null)).toBeCloseTo(0.2, 10) // 8-bit: 255 = full
    })
    it('DMX centre is home; the ends are ± half the range (540° pan → ±270°)', () => {
        expect(degFromHome(0, 540)).toBe(-270)
        expect(degFromHome(1, 540)).toBe(270)
        expect(degFromHome(0.5, 270)).toBe(0)
    })
    it('the fine channel moves a 540° pan by 540/65535° a step', () => {
        const m = mode('UP-B380F', '16ch-assumed')
        const a = decodeDmx(m.channels, valuesOf(m, { pan: 128, panFine: 0 }), type('UP-B380F'))
        const b = decodeDmx(m.channels, valuesOf(m, { pan: 128, panFine: 1 }), type('UP-B380F'))
        expect(b.pan - a.pan).toBeCloseTo(540 / 65535, 2)
        expect(a.pan).toBeCloseTo(0.004, 2) // 32768 is a hair past exact centre
    })
    it('a UP-HK1915 tilts over its own 230°, not a default', () => {
        const m = mode('UP-HK1915', '21ch-assumed')
        const d = decodeDmx(m.channels, valuesOf(m, { tilt: 255, tiltFine: 255 }), type('UP-HK1915'))
        expect(d.tilt).toBe(115)
    })
})

describe('colour', () => {
    it('a wheel slot is its colour; a half position mixes the two; a spin is noted and drawn open', () => {
        const wheel = mode('UP-B380F', '16ch-assumed').channels[0].cap.wheel
        expect(wheelAt(wheel, 0)).toMatchObject({ colour: '#ffffff' })
        expect(wheelAt(wheel, 12)).toMatchObject({ name: 'Red', colour: '#c41c1a' })
        expect(wheelAt(wheel, 7).half).toEqual(['Open (white)', 'Red'])
        expect(wheelAt(wheel, 150)).toEqual({ spin: 'forward' })
        const m = mode('UP-B380F', '16ch-assumed')
        const d = decodeDmx(m.channels, valuesOf(m, { color: 150, dimmer: 255 }), type('UP-B380F'))
        expect(d.colour).toBe('#ffffff')
        expect(d.wheelSpin).toBe('forward')
    })
    it('RGBW: the colour at full, the level from the dimmer', () => {
        const m = mode('UP-PL5403', '8ch-assumed')
        const d = decodeDmx(m.channels, valuesOf(m, { dimmer: 128, r: 255, g: 0, b: 0, w: 0 }), type('UP-PL5403'))
        expect(d.colour).toBe('#ff0000')
        expect(d.level).toBeCloseTo(128 / 255, 3)
    })
    it('4ch RGBW with no dimmer is as bright as its brightest emitter', () => {
        const m = mode('UP-PL5403', '4ch-assumed')
        const d = decodeDmx(m.channels, [0, 0, 102, 0], type('UP-PL5403'))
        expect(d.colour).toBe('#0000ff')
        expect(d.level).toBeCloseTo(0.4, 3)
    })
    it('CTO warms white toward 3200 K', () => {
        const m = mode('UP-HK1915', '21ch-assumed')
        const cold = decodeDmx(m.channels, valuesOf(m, { r: 255, g: 255, b: 255, aux5: 0, dimmer: 255 }), type('UP-HK1915'))
        const warm = decodeDmx(m.channels, valuesOf(m, { r: 255, g: 255, b: 255, aux5: 255, dimmer: 255 }), type('UP-HK1915'))
        expect(cold.colour).toBe('#ffffff')
        expect(warm.colour).toBe('#ffb46b')
    })
})

describe('shutter, strobe, zoom', () => {
    it('B380F: 0 closed (dark), 1–50 open, 51–240 strobe 1→25 Hz, 255 open', () => {
        const s = mode('UP-B380F', '16ch-assumed').channels[1].cap.shutter
        expect(shutterAt(s, 0)).toEqual({ shutter: 'closed', strobeHz: 0 })
        expect(shutterAt(s, 3).shutter).toBe('open')
        expect(shutterAt(s, 51)).toEqual({ shutter: 'strobe', strobeHz: 1 })
        expect(shutterAt(s, 240)).toEqual({ shutter: 'strobe', strobeHz: 25 })
        expect(shutterAt(s, 255).shutter).toBe('open')
        const m = mode('UP-B380F', '16ch-assumed')
        expect(decodeDmx(m.channels, valuesOf(m, { strobe: 0, dimmer: 255 }), type('UP-B380F')).level).toBe(0)
    })
    it('a strobe fixture reads its rate channel (Atomic 3000 4ch: 6–255 = 0.5–25 Hz)', () => {
        const r = mode('EXT-STROBE', '4ch-assumed').channels[2].cap.rate
        expect(rateAt(r, 0)).toBe(0)
        expect(rateAt(r, 6)).toBe(0.5)
        expect(rateAt(r, 255)).toBe(25)
        const m = mode('EXT-STROBE', '4ch-assumed')
        const d = decodeDmx(m.channels, [255, 0, 255, 0], type('EXT-STROBE'))
        expect(d).toMatchObject({ shutter: 'strobe', strobeHz: 25, level: 1 })
        expect(decodeDmx(m.channels, [255, 0, 0, 0], type('EXT-STROBE')).level).toBe(0)
    })
    it('zoom maps over the type\'s published range', () => {
        const m = mode('UP-HK1915', '21ch-assumed')
        expect(decodeDmx(m.channels, valuesOf(m, { zoom: 0 }), type('UP-HK1915')).zoomDeg).toBe(4)
        expect(decodeDmx(m.channels, valuesOf(m, { zoom: 255 }), type('UP-HK1915')).zoomDeg).toBe(60)
    })
    it('gobo and prism are noted, not drawn', () => {
        const m = mode('UP-B380F', '16ch-assumed')
        const d = decodeDmx(m.channels, valuesOf(m, { gobo: 12, prism: 70 }), type('UP-B380F'))
        expect(d.gobo).toBe(12)
        expect(d.prism).toBe(70)
        expect(d.notes.join(' ')).toMatch(/not drawn/)
    })
})

describe('encode is decode\'s inverse where it speaks', () => {
    it('pan/tilt, level, colour on RGBW and on a wheel survive the round trip', () => {
        for (const [code, name] of [['UP-B380F', '16ch-assumed'], ['UP-HK1915', '21ch-assumed'], ['UP-250BSW', '17ch-assumed']]) {
            const m = mode(code, name)
            const cell = encodeDmx(m.channels, { level: 0.5, colour: '#c41c1a', pan: 100, tilt: -40 }, type(code))
            const back = decodeDmx(m.channels, valuesOf(m, cell), type(code))
            expect(back.pan).toBeCloseTo(100, 1)
            expect(back.tilt).toBeCloseTo(-40, 1)
            expect(back.level).toBeCloseTo(0.5, 1)
            // drawn at full: the colour's hue, its brightness is the level
            expect(back.colour.toLowerCase()).toBe('#ff2422')
        }
    })
    it('a lamp OUT on a colour-only mode (RGBW, no dimmer) is sent all zeros, not nothing', () => {
        // 2026-09-29: MOXIR's PARs patched in 4ch RGBW. A look that names them at level 0
        // (or not at all) must still put them out — with no dimmer channel and no colour,
        // encode used to return {}, and the desk kept the last look's red.
        const m = mode('UP-PL5403', '4ch-assumed')
        expect(encodeDmx(m.channels, { level: 0 }, type('UP-PL5403'))).toEqual({ r: 0, g: 0, b: 0, w: 0 })
        expect(encodeDmx(m.channels, { level: 0, colour: '#ff1408' }, type('UP-PL5403'))).toEqual({ r: 0, g: 0, b: 0, w: 0 })
        const eight = mode('UP-PL5403', '8ch-assumed')
        expect(encodeDmx(eight.channels, { level: 0 }, type('UP-PL5403')).dimmer).toBe(0)
    })
    it('a strobe at 10 Hz encodes as a rate the decode reads back', () => {
        const m = mode('EXT-STROBE', '4ch-assumed')
        const cell = encodeDmx(m.channels, { level: 1, strobeHz: 10 }, type('EXT-STROBE'))
        expect(decodeDmx(m.channels, valuesOf(m, cell), type('EXT-STROBE')).strobeHz).toBeCloseTo(10, 0)
    })
})

describe('the assumed profiles', () => {
    it('every one is a separate *-assumed mode with a source, a page and the words, and unique desk roles', () => {
        for (const [code, entry] of Object.entries(ASSUMED_PROFILES)) {
            expect(entry.assumed).toMatch(/^ASSUMED from .+ — verify on the rental unit$/)
            expect(entry.manual.url).toMatch(/^https:\/\//)
            expect(entry.manual.pages).toBeTruthy()
            for (const m of assumedModesOf(code)) {
                expect(m.name).toMatch(/-assumed$/)
                expect(m.basis).toBe('ASSUMED')
                const roles = m.channels.map((c) => c.role)
                expect(new Set(roles.map((r) => r.toLowerCase())).size, `${code} ${m.name}`).toBe(roles.length)
                for (const r of roles) expect(r).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/)
            }
        }
    })
    it('every one says how close its stand-in is — EQUIVALENT (same OEM body) or STILL ASSUMED — and why', () => {
        for (const [code, entry] of Object.entries(ASSUMED_PROFILES)) {
            expect(['EQUIVALENT', 'STILL ASSUMED'], code).toContain(entry.grade)
            expect(entry.gradeWhy, code).toMatch(/2026-\d\d-\d\d/)
            for (const m of assumedModesOf(code)) expect(m.channelsSource.grade).toBe(entry.grade)
        }
        expect(ASSUMED_PROFILES['UP-HK1915'].grade).toBe('EQUIVALENT')
    })
    it('the real mode stays owed beside it (the rental chart replaces the assumed one cleanly)', () => {
        const b = type('UP-B380F')
        expect(b.modes.find((m) => m.name === '16ch').channels).toBeNull()
        expect(b.defaultMode).toBe('16ch')
        expect(b.assumedMode).toBe('16ch-assumed')
        // UP-PL5403: the maker lists one mode, 8ch (uplight.com.cn, 2026-09-29) — its list is owed
        const par = type('UP-PL5403')
        expect(par.modesOwed).toBe(false)
        expect(par.defaultMode).toBe('8ch')
        expect(par.modes.find((m) => m.name === '8ch').channels).toBeNull()
        expect(par.assumedMode).toBe('8ch-assumed')
        expect(type('UP-Q108S').modesOwed).toBe(true)
    })
})
