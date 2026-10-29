import { beforeAll, describe, expect, it } from 'vitest'
import { FULL_INTENSITY, lampModeOf, lampPicture, lampTypeKnown, lampTypeOf, lampTypes, loadLampType, onLampTypeLoaded, UNTYPED_BEAM_DEG } from './lampType.js'

const DEG = Math.PI / 180

const IDS = ['up-b380f', 'up-cob200', 'up-pl5403', 'up-250bsw']
beforeAll(() => Promise.all(IDS.map(loadLampType)))

describe('the lamp type, loaded on demand', () => {
    it('is not there until its file is in, then loaded once and cached', async () => {
        expect(lampTypeKnown('up-yz31p')).toBe(true)
        expect(lampTypeKnown('no-such-lamp')).toBe(false)
        expect(lampTypeOf('up-yz31p')).toBeNull() // asks for it; not in yet
        const seen = []
        const off = onLampTypeLoaded((id) => seen.push(id))
        const first = await loadLampType('up-yz31p')
        expect(first?.id).toBe('up-yz31p')
        expect(lampTypeOf('up-yz31p')).toBe(first)
        expect(await loadLampType('up-yz31p')).toBe(first)
        expect(seen).toEqual(['up-yz31p']) // one load, announced once
        off()
        expect(await loadLampType('no-such-lamp')).toBeNull()
    })
})

describe('the lamp type, read from the fixture library', () => {
    it('finds a type by id, and nothing for an empty or unknown one', () => {
        expect(lampTypes().length).toBeGreaterThanOrEqual(IDS.length)
        expect(lampTypeOf('up-b380f')?.code).toBe('UP-B380F')
        expect(lampTypeOf('')).toBeNull()
        expect(lampTypeOf('no-such-lamp')).toBeNull()
    })

    it('takes the mode asked for, else the default, else the first', () => {
        const head = lampTypeOf('up-b380f')
        expect(lampModeOf(head, 'walk-2026-10-09').name).toBe('walk-2026-10-09')
        expect(lampModeOf(head, '').name).toBe(head.defaultMode)
        expect(lampModeOf(head, 'no such mode').name).toBe(head.defaultMode)
        const noDefault = lampTypeOf('up-cob200')
        expect(noDefault.defaultMode).toBeNull()
        expect(lampModeOf(noDefault, '').name).toBe(noDefault.modes[0].name)
    })
})

describe('the picture', () => {
    it('a lamp with no type: a 25° beam, home at pan and tilt 0.5, full at dimmer 1', () => {
        const look = lampPicture(null, null, { dimmer: 1, pan: 0.5, tilt: 0.5, color: '#ff0000' })
        expect(look.angle).toBeCloseTo(UNTYPED_BEAM_DEG / 2 * DEG, 10)
        expect(look.pan).toBe(0)
        expect(look.tilt).toBe(0)
        expect(look.intensity).toBe(FULL_INTENSITY)
        expect(look.color).toBe('#ff0000')
        expect(look.fitted).toBe(false)
    })

    it("turns over the type's published range: 540° pan, 270° tilt", () => {
        const head = lampTypeOf('up-b380f')
        const look = lampPicture(head, lampModeOf(head), { pan: 1, tilt: 0 })
        expect(look.pan).toBeCloseTo(270 * DEG, 10)
        expect(look.tilt).toBeCloseTo(-135 * DEG, 10)
    })

    it("draws the type's beam angle and size, fitted", () => {
        const head = lampTypeOf('up-b380f')
        const look = lampPicture(head, lampModeOf(head), { dimmer: 0.5 })
        expect(look.angle).toBeCloseTo(0.9 * DEG, 10)
        expect(look.size).toEqual([0.46, 0.31, 0.69])
        expect(look.intensity).toBe(FULL_INTENSITY / 2)
        expect(look.fitted).toBe(true)
    })

    it('a fixed lamp (no pan/tilt published) does not turn', () => {
        const par = lampTypeOf('up-pl5403')
        const look = lampPicture(par, lampModeOf(par), { pan: 1, tilt: 1 })
        expect(look.pan).toBe(0)
        expect(look.tilt).toBe(0)
    })

    it('shows a colour only where the mode can send one (red, green and blue channels)', () => {
        const par = lampTypeOf('up-pl5403')
        expect(lampPicture(par, lampModeOf(par), { color: '#00ff00' }).color).toBe('#00ff00')
        const head = lampTypeOf('up-b380f')
        expect(lampPicture(head, lampModeOf(head), { color: '#00ff00' }).color).toBe('#ffffff')
    })

    it('Zoom opens the beam where a range is known, from 10° to 50° on a lamp with no type', () => {
        expect(lampPicture(null, null, { zoom: 0 }).angle).toBeCloseTo(5 * DEG, 10)
        expect(lampPicture(null, null, { zoom: 1 }).angle).toBeCloseTo(25 * DEG, 10)
        // the library publishes no zoom range for this head: Zoom changes its channel, not its picture
        const head = lampTypeOf('up-b380f')
        expect(lampPicture(head, lampModeOf(head), { zoom: 1 }).angle).toBeCloseTo(0.9 * DEG, 10)
    })
})
