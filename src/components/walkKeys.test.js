import { describe, expect, it } from 'vitest'
import { HEAD_LIGHT_KEY, isHeadLightKey } from './headLight.js'
import { FLY_KEY, HINT_SEPARATOR, isFlyKey, walkKeyHintText } from './walkKeys.js'

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
