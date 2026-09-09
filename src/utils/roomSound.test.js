import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    __resetSoundForTests, armVisitorSound, isSoundAllowed, isSoundGated, isSoundLocked, isSoundOn,
    roomHasSound, setSoundOn, subscribeSound, toggleSound
} from './roomSound.js'

const setSearch = (search) => {
    window.history.replaceState({}, '', `/${search}`)
}

describe('the room sound switch', () => {
    beforeEach(() => {
        __resetSoundForTests()
        window.localStorage.clear()
        setSearch('')
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    // The whole point. A visitor lands on /spaces, or opens a room, and hears
    // nothing until they ask.
    it('is off before anyone asks for it', () => {
        expect(isSoundOn()).toBe(false)
    })

    it('turns on, and remembers on this machine', () => {
        setSoundOn(true)
        expect(isSoundOn()).toBe(true)
        expect(window.localStorage.getItem('dii:sound-on')).toBe('1')

        // A fresh page load reads the stored answer back.
        __resetSoundForTests()
        expect(isSoundOn()).toBe(true)
    })

    it('toggles', () => {
        expect(toggleSound()).toBe(true)
        expect(toggleSound()).toBe(false)
        expect(isSoundOn()).toBe(false)
    })

    it('tells every subscriber, and survives one that throws', () => {
        const bad = vi.fn(() => { throw new Error('nope') })
        const good = vi.fn()
        subscribeSound(bad)
        subscribeSound(good)
        setSoundOn(true)
        expect(bad).toHaveBeenCalledWith(true)
        expect(good).toHaveBeenCalledWith(true)
    })

    it('does not tell subscribers when the value has not changed', () => {
        const seen = vi.fn()
        subscribeSound(seen)
        setSoundOn(false)
        expect(seen).not.toHaveBeenCalled()
    })

    it('unsubscribes', () => {
        const seen = vi.fn()
        const off = subscribeSound(seen)
        off()
        setSoundOn(true)
        expect(seen).not.toHaveBeenCalled()
    })

    // A card on /spaces is a picture of a room, not the room. Twelve of them
    // singing at once was the bug that started this.
    describe('in a preview', () => {
        beforeEach(() => {
            __resetSoundForTests()
            setSearch('?preview=1')
        })

        it('is locked silent', () => {
            expect(isSoundLocked()).toBe(true)
            expect(isSoundOn()).toBe(false)
        })

        it('cannot be turned on, even by a stored yes from the real page', () => {
            window.localStorage.setItem('dii:sound-on', '1')
            expect(isSoundOn()).toBe(false)
            setSoundOn(true)
            expect(isSoundOn()).toBe(false)
        })
    })

    // Private windows and "block site data" throw on READ, not only on write.
    it('is silent, not broken, when storage refuses to answer', () => {
        vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
            throw new Error('SecurityError')
        })
        __resetSoundForTests()
        expect(isSoundOn()).toBe(false)
    })

    it('still works this session when storage refuses to write', () => {
        vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError')
        })
        setSoundOn(true)
        expect(isSoundOn()).toBe(true)
    })
})

describe('whether a room has anything to hear', () => {
    const video = (muted) => ({ type: 'video', components: { media: { muted } } })

    it('says no for an empty or unreadable room', () => {
        expect(roomHasSound([])).toBe(false)
        expect(roomHasSound(null)).toBe(false)
        expect(roomHasSound([{ type: 'image' }, { type: 'model' }])).toBe(false)
    })

    it('says yes for an audio entity', () => {
        expect(roomHasSound([{ type: 'image' }, { type: 'audio' }])).toBe(true)
    })

    // media.muted defaults to true across the product: a video is a moving
    // picture unless its author said otherwise.
    it('counts a video only when its author asked for sound', () => {
        expect(roomHasSound([video(true)])).toBe(false)
        expect(roomHasSound([{ type: 'video', components: {} }])).toBe(false)
        expect(roomHasSound([video(false)])).toBe(true)
    })

    it('does not count a hidden entity', () => {
        expect(roomHasSound([
            { type: 'audio', components: { runtime: { visible: false } } }
        ])).toBe(false)
    })
})

describe('the gate', () => {
    beforeEach(() => {
        __resetSoundForTests()
        window.localStorage.clear()
        window.history.replaceState({}, '', '/')
    })

    // An author placing an audio object has to hear it. Nothing about this
    // change may reach the editor, which never arms the gate.
    it('lets an ungated page play exactly as before', () => {
        expect(isSoundGated()).toBe(false)
        expect(isSoundAllowed()).toBe(true)
        expect(isSoundOn()).toBe(false)
    })

    it('silences a page that arms it, until the visitor asks', () => {
        const disarm = armVisitorSound()
        expect(isSoundGated()).toBe(true)
        expect(isSoundAllowed()).toBe(false)
        setSoundOn(true)
        expect(isSoundAllowed()).toBe(true)
        disarm()
        expect(isSoundGated()).toBe(false)
    })

    // Two viewers on one page (a room inside a room) must not disarm each
    // other on the first unmount.
    it('counts arms rather than flipping a flag', () => {
        const a = armVisitorSound()
        const b = armVisitorSound()
        a()
        expect(isSoundGated()).toBe(true)
        b()
        expect(isSoundGated()).toBe(false)
    })

    it('is gated in a preview whether or not anything armed it', () => {
        window.history.replaceState({}, '', '/?preview=1')
        expect(isSoundGated()).toBe(true)
        expect(isSoundAllowed()).toBe(false)
    })
})
