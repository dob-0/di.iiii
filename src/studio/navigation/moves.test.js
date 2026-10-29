import { beforeEach, describe, expect, it } from 'vitest'
import { MOVES, moveFor, normalizeMoveId } from './moves.js'
import { MOVE_STORAGE_KEY, getMovePreference, resetNavigationPreferenceMemory, setMovePreference } from './preference.js'

const TWO = [...MOVES, { id: 'move-test', label: 'Move test', since: '2099-01-01', about: 'test only' }]

beforeEach(() => {
    resetNavigationPreferenceMemory()
    try { window.localStorage.clear() } catch { /* no storage */ }
})

describe('moves', () => {
    it('a list with a second move knows it; junk is still the default', () => {
        expect(normalizeMoveId('move-test', TWO)).toBe('move-test')
        expect(normalizeMoveId('move-test')).toBe('move-1')
        expect(moveFor('move-test', TWO).label).toBe('Move test')
        expect(moveFor('nope', TWO).id).toBe('move-1')
    })
    it('the preference is read and written like speed and turn', () => {
        expect(getMovePreference()).toBe('move-1')
        window.localStorage.setItem(MOVE_STORAGE_KEY, 'garbage')
        expect(getMovePreference()).toBe('move-1')
        expect(setMovePreference('move-1')).toBe('move-1')
        expect(window.localStorage.getItem(MOVE_STORAGE_KEY)).toBe('move-1')
    })
    it('blocked storage gives the default and the choice holds for the page', () => {
        const real = Object.getOwnPropertyDescriptor(window, 'localStorage')
        Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked') } })
        try {
            expect(getMovePreference()).toBe('move-1')
            expect(setMovePreference('move-1')).toBe('move-1')
        } finally { Object.defineProperty(window, 'localStorage', real) }
    })
})
