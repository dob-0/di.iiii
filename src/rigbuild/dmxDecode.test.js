import { describe, expect, it } from 'vitest'
import { decodeDmx, degFromHome, encodeDmx, rateAt, shutterAt, sixteen, wheelAt } from './dmxDecode.js'
import { ASSUMED_PROFILES, assumedModesOf } from './assumedProfiles.js'
import { TYPE_LIBRARY as TYPES } from './types/index.js'

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
            // Emitters: drawn at full (the colour's hue), normalised in LINEAR light (render audit B,
            // 2026-10-01: #c41c1a at full is #ff2626) — and since 2026-10-17 the colour's own darkness
            // is light too, so it rides in the level: 0.5 × lin(0xc4). A wheel: #c41c1a IS this
            // wheel's red slot, so the slot is drawn as it is and the level stays 0.5.
            const emitters = m.channels.some((c) => c.role === 'r')
            const lin = (c) => ((c / 255 + 0.055) / 1.055) ** 2.4
            expect(back.level).toBeCloseTo(emitters ? 0.5 * lin(0xc4) : 0.5, 2)
            expect(back.colour.toLowerCase()).toBe(emitters ? '#ff2626' : '#c41c1a')
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
    it('a neutral white on an RGBW lamp is the white emitter alone; a coloured light keeps W at 0', () => {
        // 2026-10-02 (the blade, emily-41 spec): the tested UP-PL5403 has a W LED. A white
        // look used to be R=G=B=255 with W 0; the lamp's own white is cleaner and cooler on the
        // truss. Only an exactly neutral colour changes — the cold-white palette tint and every
        // red stay as they were.
        const tested = mode('UP-PL5403', '8ch')
        expect(encodeDmx(tested.channels, { level: 1, colour: '#ffffff' }, type('UP-PL5403'))).toMatchObject({ dimmer: 255, r: 0, g: 0, b: 0, w: 255 })
        expect(encodeDmx(tested.channels, { level: 1, colour: '#ff0000' }, type('UP-PL5403'))).toMatchObject({ r: 255, g: 0, b: 0, w: 0 })
        expect(encodeDmx(tested.channels, { level: 1, colour: '#eef3ff' }, type('UP-PL5403'))).toMatchObject({ w: 0 })
        const four = mode('UP-PL5403', '4ch-assumed')
        expect(encodeDmx(four.channels, { level: 0.5, colour: '#ffffff' }, type('UP-PL5403'))).toEqual({ r: 0, g: 0, b: 0, w: 128 })
        const back = decodeDmx(tested.channels, valuesOf(tested, encodeDmx(tested.channels, { level: 1, colour: '#ffffff' }, type('UP-PL5403'))), type('UP-PL5403'))
        expect(back.colour.toLowerCase()).toBe('#ffffff')
    })
    it('a strobe asked at 10 Hz encodes as the capped 3 Hz the decode reads back', () => {
        const m = mode('EXT-STROBE', '4ch-assumed')
        const cell = encodeDmx(m.channels, { level: 1, strobeHz: 10 }, type('EXT-STROBE'))
        expect(decodeDmx(m.channels, valuesOf(m, cell), type('EXT-STROBE')).strobeHz).toBeCloseTo(3, 0)
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
    it('the real mode sits beside it, filled only from the tested unit (the assumed one stays a separate mode)', () => {
        // UP-B380F / UP-PL5403: the channel maps run on the rental units at the Sevan
        // festival (TESTED, 2026-10-01) fill the real mode; the assumed ones stay after it.
        const b = type('UP-B380F')
        const real16 = b.modes.find((m) => m.name === '16ch')
        expect(real16.channelsSource.basis).toBe('APPROVED')
        expect(real16.channels.map((c) => c.role).slice(0, 4)).toEqual(['pan', 'tilt', 'panFine', 'tiltFine']) // the printed manual (2026-10-16): pan first
        expect(b.defaultMode).toBe('16ch')
        expect(b.assumedMode).toBe('16ch-assumed')
        const par = type('UP-PL5403')
        expect(par.modesOwed).toBe(false)
        expect(par.defaultMode).toBe('8ch')
        expect(par.modes.find((m) => m.name === '8ch').channelsSource.basis).toBe('TESTED')
        expect(par.assumedMode).toBe('8ch-assumed')
        // no tested unit, no chart: still owed
        expect(type('UP-Q108S').modesOwed).toBe(true)
    })
})

describe('tunable white (UP-COB200, the cut 2026-09-29)', () => {
    const cob = [{ role: 'dimmer' }, { role: 'warm' }, { role: 'cool' }, { role: 'strobe', cap: { shutter: [{ from: 0, to: 4, open: true }, { from: 5, to: 255, strobe: [1, 25] }] } }]
    it('puts cold white all on the cold emitter and blinder warm white mostly on the warm one', () => {
        expect(encodeDmx(cob, { level: 1, colour: '#eef3ff' })).toMatchObject({ dimmer: 255, warm: 0, cool: 255 })
        const warm = encodeDmx(cob, { level: 0.5, colour: '#ffc58f' })
        expect(warm.dimmer).toBe(128)
        expect(warm.warm).toBe(255)
        expect(warm.cool).toBeLessThan(128)
    })
    it('reads a warm/cool mix back as a white between 3200 K and 5600 K at the dimmer\'s level', () => {
        const d = decodeDmx(cob, [255, 0, 255, 0])
        expect(d.colour).toBe('#ffeee3')
        expect(d.level).toBe(1)
        const w = decodeDmx(cob, [128, 255, 0, 0])
        expect(w.colour).toBe('#ffb46b')
        expect(w.level).toBeCloseTo(128 / 255, 3)
    })
})

describe('emitters are driven linearly (render audit B)', () => {
    it('R 255 + G 128 is half the green LIGHT: the colour code is sRGB-encoded from linear', () => {
        const channels = [{ role: 'dimmer' }, { role: 'r' }, { role: 'g' }, { role: 'b' }]
        const d = decodeDmx(channels, [255, 255, 128, 0], {})
        // linear (1, 0.502, 0) → sRGB code (255, 188, 0)
        expect(d.colour).toBe('#ffbc00')
    })
    it('encode inverts it: the code #ffbc00 drives green at half', () => {
        const channels = [{ role: 'dimmer' }, { role: 'r' }, { role: 'g' }, { role: 'b' }]
        const cell = encodeDmx(channels, { level: 1, colour: '#ffbc00' })
        expect(cell.r).toBe(255)
        expect(cell.g).toBeGreaterThanOrEqual(127)
        expect(cell.g).toBeLessThanOrEqual(129)
    })
})

// 2026-10-09: colour per emitter, in CIE XYZ, where the type carries emitter data — else the stand-in, labelled.
describe('per-emitter colour mixing (XYZ → linear Rec.709)', async () => {
    const { emitterMix } = await import('./dmxDecode.js')
    const rgbw = [{ role: 'dimmer' }, { role: 'r' }, { role: 'g' }, { role: 'b' }, { role: 'w' }]
    // TEST DATA, not a fixture's: typical RGBW LED chromaticities and a lumen split, to exercise the method
    const emitters = { r: { x: 0.700, y: 0.299, flux_lm: 200 }, g: { x: 0.170, y: 0.700, flux_lm: 700 }, b: { x: 0.140, y: 0.050, flux_lm: 100 }, w: { x: 0.313, y: 0.329, flux_lm: 1000 }, basis: 'TEST DATA' }
    it('makes a red-only lamp as bright as its red emitters\' share of the lumens, not sRGB red\'s 0.2126', () => {
        const d = decodeDmx(rgbw, [255, 255, 0, 0, 0], { emitters })
        expect(d.level).toBeCloseTo(200 / 2000, 4)
        expect(d.colourBasis).toMatch(/per-emitter XYZ \(TEST DATA/)
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(d.colour.slice(i, i + 2), 16))
        expect(r).toBe(255)
        expect(g).toBeLessThan(80)
        expect(b).toBeLessThan(80)
        // all on: the full lumens
        expect(decodeDmx(rgbw, [255, 255, 255, 255, 255], { emitters }).level).toBeCloseTo(1, 6)
    })
    it('says when it has no emitter data and uses the sRGB-primary stand-in', () => {
        const d = decodeDmx(rgbw, [255, 255, 0, 0, 0], {})
        expect(d.colourBasis).toMatch(/^ASSUMED/)
        expect(d.level).toBe(1)
        expect(emitterMix(null, { r: 255 })).toBe(null)
        expect(emitterMix({ r: emitters.r, g: emitters.g }, { r: 255 })).toBe(null)
    })
})

import { decodeDmx as decodeForLaser } from './dmxDecode.js'
import { TESTED_CHANNEL_LISTS as LISTS_FOR_LASER } from './fixtureTypes.js'
describe('a laser drawn in the colour the desk picked (MOXIR 2026-10-17)', () => {
    it('reads UP-LA40WF ch 5 as its colour slot', () => {
        const find = (o) => { if (Array.isArray(o)) { if (o.some((c) => c?.cap?.laserColour)) return o; for (const x of o) { const r = find(x); if (r) return r } } else if (o && typeof o === 'object') for (const v of Object.values(o)) { const r = find(v); if (r) return r } return null }
        const channels = find(LISTS_FOR_LASER['UP-LA40WF'])
        const values = channels.map((c) => (c.role === 'dimmer' ? 255 : c.cap?.laserColour ? 25 : 0))
        expect(decodeForLaser(channels, values).colour).toBe('#ff0000')
        const green = channels.map((c) => (c.role === 'dimmer' ? 255 : c.cap?.laserColour ? 42 : 0))
        expect(decodeForLaser(channels, green).colour).toBe('#00ff00')
    })
})

describe('a colour keeps its brightness on the wire and in the room (MOXIR 2026-10-17)', () => {
    const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
    const rgbw = [{ role: 'dimmer' }, { role: 'r' }, { role: 'g' }, { role: 'b' }, { role: 'w' }]
    const wheel = [{ role: 'dimmer' }, { role: 'color', cap: { wheel: [
        { from: 0, to: 4, name: 'open', colour: '#ffffff' }, { from: 10, to: 14, name: 'red', colour: '#ff2a0a' },
        { from: 20, to: 24, name: 'green', colour: '#00d12a' }, { from: 30, to: 34, name: 'lime', colour: '#8cff3a' }] } }]
    const at = (channels, byRole) => channels.map((c) => byRole[c.role] ?? 0)
    it('RGBW: a dark red puts its darkness in the dimmer, the emitters keep the hue at full', () => {
        const v = encodeDmx(rgbw, { level: 1, colour: '#a3200c' })
        expect(v.dimmer).toBe(Math.round(255 * lin(0xa3)))
        expect(v.r).toBe(255)
        const d = decodeDmx(rgbw, at(rgbw, v))
        expect(d.level).toBeCloseTo(lin(0xa3), 2)
    })
    it('RGBW: a colour at full is unchanged (dimmer = level)', () => {
        expect(encodeDmx(rgbw, { level: 0.5, colour: '#ff0000' }).dimmer).toBe(128)
    })
    it('wheel: the slot is picked by hue, the slot\'s own darkness is the filter\'s, the rest goes to the dimmer', () => {
        expect(encodeDmx(wheel, { level: 1, colour: '#00d12a' })).toMatchObject({ color: 22, dimmer: 255 })
        expect(encodeDmx(wheel, { level: 1, colour: '#00ff33' })).toMatchObject({ color: 22, dimmer: 255 })
        expect(encodeDmx(wheel, { level: 1, colour: '#ff2a0a' })).toMatchObject({ color: 12, dimmer: 255 })
        expect(encodeDmx(wheel, { level: 1, colour: '#a3200c' })).toMatchObject({ color: 12, dimmer: Math.round(255 * lin(0xa3)) })
    })
    it('wheel: the room draws a slot as it is, never stretched to full', () => {
        const d = decodeDmx(wheel, at(wheel, { dimmer: 255, color: 22 }))
        expect(d.colour).toBe('#00d12a')
        expect(d.level).toBe(1)
    })
})

describe('a laser the desk moves: X/Y read back (owner 2026-10-17: "add movement in 3d that i can sync that")', () => {
    const findAim = (o) => { if (Array.isArray(o)) { if (o.some((c) => c?.cap?.aim)) return o; for (const x of o) { const r = findAim(x); if (r) return r } } else if (o && typeof o === 'object') for (const v of Object.values(o)) { const r = findAim(v); if (r) return r } return null }
    const channels = findAim(LISTS_FOR_LASER['UP-LA40WF'])
    const bytes = ([x, y]) => channels.map((c) => (c.role === 'dimmer' ? 255 : c.cap?.aim?.axis === 'x' ? x : c.cap?.aim?.axis === 'y' ? y : c.default ?? 0))
    const half = channels.find((c) => c.cap?.aim?.axis === 'x').cap.aim.halfDeg
    it('centre is 0°, the by-hand ends are ±halfDeg, auto motion is drawn at centre and said', () => {
        expect(decodeForLaser(channels, bytes([64, 64])).aim).toEqual({ x: 0, y: 0 })
        expect(decodeForLaser(channels, bytes([125, 0])).aim).toEqual({ x: half, y: -half })
        const auto = decodeForLaser(channels, bytes([200, 64]))
        expect(auto.aim.x).toBe(0)
        expect(auto.notes.join(' ')).toMatch(/auto motion/)
    })
    it('undoes encodeDmx to within one byte', () => {
        for (const [pan, tilt] of [[0, 0], [10, -5], [-half, half], [3.3, 7.7]]) {
            const out = encodeDmx(channels, { pan, tilt })
            const back = decodeForLaser(channels, channels.map((c) => out[c.role] ?? (c.role === 'dimmer' ? 255 : c.default ?? 0))).aim
            expect(Math.abs(back.x - pan)).toBeLessThan(0.35)
            expect(Math.abs(back.y - tilt)).toBeLessThan(0.35)
        }
    })
})
