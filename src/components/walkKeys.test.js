import { describe, expect, it } from 'vitest'
import { HEAD_LIGHT_KEY, isHeadLightKey } from './headLight.js'
import { FLY_KEY, HINT_SEPARATOR, isFlyKey, walkKeyHintText, ALTITUDE_KEYS, LEGACY_ALTITUDE_KEYS, ALTITUDE_HINT_TEXT } from './walkKeys.js'
import { physicalKey } from './physicalKey.js'

const plain = (text) => text.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ')

describe('the walk keys: Fly is F in every project, the head light is L', () => {
    it('Fly answers F, either case, and nothing else', () => {
        expect(FLY_KEY).toBe('f')
        expect(isFlyKey({ key: 'f' })).toBe(true)
        expect(isFlyKey({ key: 'F' })).toBe(true)
        for (const key of ['l', 'L', 'g', 'G', 'q', 'e', 'c', ' ', 'w', 'Escape']) expect(isFlyKey({ key })).toBe(false)
        expect(isFlyKey(null)).toBe(false)
        expect(isFlyKey({})).toBe(false)
    })

    it('the head light answers L, never F; Fly answers F, never L', () => {
        expect(HEAD_LIGHT_KEY).toBe('l')
        expect(HEAD_LIGHT_KEY).not.toBe(FLY_KEY)
        expect(isHeadLightKey({ key: 'f' })).toBe(false)
        expect(isFlyKey({ key: 'l' })).toBe(false)
        for (const key of 'abcdefghijklmnopqrstuvwxyz') {
            expect(isFlyKey({ key }) && isHeadLightKey({ key }), key).toBe(false)
        }
    })
})

describe('the walk hint words', () => {
    it('a project without a head light says only Fly, exactly as it always did', () => {
        expect(walkKeyHintText()).toBe('F · fly')
        expect(walkKeyHintText({})).toBe('F · fly')
        expect(walkKeyHintText({ headLight: false, flying: true })).toBe('F · walk')
    })

    it('a project with a head light says L · head light and F · fly, the light first', () => {
        expect(plain(walkKeyHintText({ headLight: true }))).toBe('L · head light · F · fly')
        expect(plain(walkKeyHintText({ headLight: true, flying: true }))).toBe('L · head light · F · walk')
    })

    it('never names a key that does something else, and never says "Light" with a capital (the lighting desk)', () => {
        for (const headLight of [false, true]) {
            for (const flying of [false, true]) {
                expect(plain(walkKeyHintText({ headLight, flying })), `headLight ${headLight}, flying ${flying}`).not.toMatch(/\bG\b|F · (head )?light|\bLight\b/)
            }
        }
    })

    it('keeps the separator the hint line was always written with', () => {
        expect(walkKeyHintText({ headLight: true })).toContain(HINT_SEPARATOR)
    })
})


describe('physical keys and the altitude pair (2026-10-29, N1445.1)', () => {
    it('reads the place of the key: an Armenian "ց" on KeyW is W', () => {
        expect(physicalKey({ key: 'ց', code: 'KeyW' })).toBe('w')
        expect(physicalKey({ key: 'ы', code: 'KeyS' })).toBe('s')
        expect(physicalKey({ key: ' ', code: 'Space' })).toBe(' ')
        expect(physicalKey({ key: 'ArrowUp', code: 'ArrowUp' })).toBe('arrowup')
    })
    it('falls back to key when there is no code, and to "" for no event', () => {
        expect(physicalKey({ key: 'W' })).toBe('w')
        expect(physicalKey(null)).toBe('')
    })
    it('F flies and L lights on any layout; F stays F', () => {
        expect(isFlyKey({ key: 'ա', code: 'KeyF' })).toBe(true)
        expect(isFlyKey({ key: 'f' })).toBe(true)
        expect(isFlyKey({ key: 'f', code: 'KeyG' })).toBe(false)
        expect(isHeadLightKey({ key: 'լ', code: 'KeyL' })).toBe(true)
    })
    it('E is up and Q is down while flying; Space and C still work; the old pair is kept as an archive', () => {
        expect(ALTITUDE_KEYS.up).toEqual([' ', 'e'])
        expect(ALTITUDE_KEYS.down).toEqual(['q', 'c'])
        expect(LEGACY_ALTITUDE_KEYS).toEqual({ up: [' ', 'q'], down: ['e', 'c'] })
        expect(ALTITUDE_HINT_TEXT).toContain('Space/E')
        expect(ALTITUDE_HINT_TEXT).toContain('C/Q')
    })
})
