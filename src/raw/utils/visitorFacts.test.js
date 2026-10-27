import { beforeEach, describe, expect, it } from 'vitest'
import {
    VISITOR_STORAGE_KEY,
    loadVisitorMemory,
    readVisitorFacts,
    rememberVisitorName,
    resetVisitorMemoryForTests
} from './visitorFacts.js'

const memoryStorage = () => {
    const store = new Map()
    return {
        store,
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
    }
}

// A window built by hand: the tests say exactly which facts it reports.
const fakeWindow = ({ width = 1440, height = 900, coarse = false, reduce = false, language = 'en-GB', search = '', framed = false, storage = memoryStorage() } = {}) => {
    const win = {
        innerWidth: width,
        innerHeight: height,
        navigator: { language },
        location: { search },
        matchMedia: (query) => ({
            matches: (query === '(pointer: coarse)' && coarse) || (query === '(prefers-reduced-motion: reduce)' && reduce),
        }),
        crypto: { randomUUID: () => 'id-0001' },
    }
    win.self = win
    win.top = framed ? {} : win
    Object.defineProperty(win, 'localStorage', { get: () => (typeof storage === 'function' ? storage() : storage) })
    return win
}

const throwingStorage = () => ({
    getItem: () => { throw new Error('SecurityError: storage denied') },
    setItem: () => { throw new Error('QuotaExceededError') },
    removeItem: () => { throw new Error('SecurityError: storage denied') },
})

beforeEach(() => resetVisitorMemoryForTests())

describe('readVisitorFacts', () => {
    it('a desktop window: wide, still, not a phone, not embedded', () => {
        expect(readVisitorFacts(fakeWindow())).toEqual({
            phone: false, reducedMotion: false, portrait: false,
            width: 1440, height: 900, language: 'en', embedded: false,
        })
    })

    it('a 390x844 phone in portrait asking for reduced motion, in Armenian', () => {
        const facts = readVisitorFacts(fakeWindow({ width: 390, height: 844, coarse: true, reduce: true, language: 'hy-AM' }))
        expect(facts).toMatchObject({ phone: true, reducedMotion: true, portrait: true, width: 390, height: 844, language: 'hy' })
    })

    it('a 768x1024 tablet is touch but not a phone; the same phone in landscape still is', () => {
        expect(readVisitorFacts(fakeWindow({ width: 768, height: 1024, coarse: true })).phone).toBe(false)
        expect(readVisitorFacts(fakeWindow({ width: 844, height: 390, coarse: true })).phone).toBe(true)
        expect(readVisitorFacts(fakeWindow({ width: 844, height: 390, coarse: true })).portrait).toBe(false)
    })

    it('embedded by ?embed=1, ?preview=1 or a frame; a frame whose top throws counts', () => {
        expect(readVisitorFacts(fakeWindow({ search: '?embed=1' })).embedded).toBe(true)
        expect(readVisitorFacts(fakeWindow({ search: '?preview=1' })).embedded).toBe(true)
        expect(readVisitorFacts(fakeWindow({ framed: true })).embedded).toBe(true)
        const crossOrigin = fakeWindow()
        Object.defineProperty(crossOrigin, 'top', { get: () => { throw new Error('cross-origin') } })
        expect(readVisitorFacts(crossOrigin).embedded).toBe(true)
    })

    it('a window with no matchMedia and no navigator still answers', () => {
        const win = fakeWindow()
        delete win.matchMedia
        delete win.navigator
        expect(readVisitorFacts(win)).toMatchObject({ phone: false, reducedMotion: false, language: '' })
    })
})

describe('the visitor memory', () => {
    it('makes an Id and a Hue once and keeps them in this browser', () => {
        const win = fakeWindow()
        const first = loadVisitorMemory(win, () => 0.5)
        expect(first).toEqual({ id: 'id-0001', hue: 0.5, name: '' })
        expect(JSON.parse(win.localStorage.getItem(VISITOR_STORAGE_KEY))).toEqual(first)
        // a reload: a fresh page memory finds what the browser kept
        resetVisitorMemoryForTests()
        win.crypto.randomUUID = () => 'id-other'
        expect(loadVisitorMemory(win, () => 0.9)).toEqual(first)
    })

    it('keeps a wired name; an empty one leaves the old name alone', () => {
        const win = fakeWindow()
        loadVisitorMemory(win, () => 0.25)
        expect(rememberVisitorName('  Ani  ', win).name).toBe('Ani')
        expect(rememberVisitorName('', win).name).toBe('Ani')
        resetVisitorMemoryForTests()
        expect(loadVisitorMemory(win).name).toBe('Ani')
    })

    it('ignores a stored value it cannot trust and makes a new one', () => {
        const storage = memoryStorage()
        storage.setItem(VISITOR_STORAGE_KEY, '{"id":"x","hue":7}')
        expect(loadVisitorMemory(fakeWindow({ storage }), () => 0).hue).toBe(0)
        resetVisitorMemoryForTests()
        storage.setItem(VISITOR_STORAGE_KEY, 'not json')
        expect(loadVisitorMemory(fakeWindow({ storage }), () => 0).id).toBe('id-0001')
    })

    it('storage that throws on every call: same Id all visit, name kept for the visit', () => {
        const win = fakeWindow({ storage: throwingStorage() })
        const first = loadVisitorMemory(win, () => 0.75)
        expect(first).toEqual({ id: 'id-0001', hue: 0.75, name: '' })
        expect(loadVisitorMemory(win)).toBe(first)
        expect(rememberVisitorName('Ani', win).name).toBe('Ani')
        expect(loadVisitorMemory(win).name).toBe('Ani')
    })

    it('a localStorage getter that throws (an opaque frame) is the same as no storage', () => {
        const win = fakeWindow({ storage: () => { throw new Error('SecurityError: The operation is insecure.') } })
        expect(() => loadVisitorMemory(win, () => 0.1)).not.toThrow()
        expect(loadVisitorMemory(win).id).toBe('id-0001')
        expect(() => rememberVisitorName('Ani', win)).not.toThrow()
    })

    it('no randomUUID: still an Id', () => {
        const win = fakeWindow()
        win.crypto = undefined
        expect(loadVisitorMemory(win).id).toMatch(/^v-[a-z0-9]+$/)
    })
})
