import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    JAM_MINE_LIMIT,
    JAM_MINE_STORAGE_KEY,
    forgetMineId,
    isMine,
    loadMineIds,
    rememberMineId
} from './jamOwnership.js'

afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
})

describe('which objects this phone added', () => {
    it('starts with nothing', () => {
        expect(loadMineIds()).toEqual([])
    })

    it('remembers what was added, in order, and survives a reload', () => {
        rememberMineId('a')
        rememberMineId('b')
        expect(loadMineIds()).toEqual(['a', 'b'])
    })

    it('does not record the same object twice', () => {
        rememberMineId('a')
        const after = rememberMineId('a')
        expect(after).toEqual(['a'])
        expect(loadMineIds()).toEqual(['a'])
    })

    it('forgets one when it is removed', () => {
        rememberMineId('a')
        rememberMineId('b')
        forgetMineId('a')
        expect(loadMineIds()).toEqual(['b'])
    })

    it('caps the list so a browser that never clears storage cannot grow it forever', () => {
        let ids = []
        for (let i = 0; i < JAM_MINE_LIMIT + 25; i += 1) {
            ids = rememberMineId(`object-${i}`, ids)
        }
        expect(ids.length).toBe(JAM_MINE_LIMIT)
        expect(ids.at(-1)).toBe(`object-${JAM_MINE_LIMIT + 24}`)
    })

    it('ignores rubbish in storage instead of throwing at the visitor', () => {
        window.localStorage.setItem(JAM_MINE_STORAGE_KEY, 'not json at all')
        expect(loadMineIds()).toEqual([])
        window.localStorage.setItem(JAM_MINE_STORAGE_KEY, '{"nope":1}')
        expect(loadMineIds()).toEqual([])
        window.localStorage.setItem(JAM_MINE_STORAGE_KEY, '[1, null, "keeper"]')
        expect(loadMineIds()).toEqual(['keeper'])
    })

    it('keeps working when storage throws, as it does in private browsing', () => {
        vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
            throw new Error('denied')
        })
        vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
            throw new Error('denied')
        })
        expect(loadMineIds()).toEqual([])
        expect(() => rememberMineId('a')).not.toThrow()
    })
})

describe('isMine', () => {
    it('answers only for an object on the list', () => {
        expect(isMine('a', ['a', 'b'])).toBe(true)
        expect(isMine('c', ['a', 'b'])).toBe(false)
    })

    it('says no to nothing at all', () => {
        expect(isMine('', ['a'])).toBe(false)
        expect(isMine(null, ['a'])).toBe(false)
        expect(isMine('a', null)).toBe(false)
    })

    // The comment at the top of jamOwnership.js says this in words; this says
    // it in code. If anyone ever reaches for this module to decide whether a
    // WRITE is permitted, the shape of it should make plain that it cannot:
    // it knows only what this browser chose to remember.
    it('is a record of what this browser did, not a permission', () => {
        window.localStorage.setItem(JAM_MINE_STORAGE_KEY, JSON.stringify(['someone-elses-object']))
        expect(isMine('someone-elses-object', loadMineIds())).toBe(true)
    })
})
