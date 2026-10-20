import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_SPEED, MIN_SPEED } from './freeMove.js'
import { getSpeedPreference, getTurnPreference, resetNavigationPreferenceMemory, setSpeedPreference, setTurnPreference } from './preference.js'
import { STANDARD_MOVE_SPEED_EVENT } from './useCameraNavigation.js'
import {
    MOVE_HINT, TURN_LABELS, autoLabel, formatMetres, metresText, parseSpeedText, useMoveSettings, useSpeedField, useStandardMoveReading,
} from './useMoveSettings.js'

beforeEach(() => {
    resetNavigationPreferenceMemory()
    try { window.localStorage.clear() } catch { /* no storage */ }
})
afterEach(() => resetNavigationPreferenceMemory())

describe('what typed text means as a speed', () => {
    it('is metres in range, or null when it is not a usable number', () => {
        expect(parseSpeedText('2.5')).toBe(2.5)
        expect(parseSpeedText(' 1 ')).toBe(1)
        expect(parseSpeedText('2,5')).toBe(2.5)
        expect(parseSpeedText('')).toBeNull()
        expect(parseSpeedText('   ')).toBeNull()
        expect(parseSpeedText('0')).toBeNull()
        expect(parseSpeedText('-3')).toBeNull()
        expect(parseSpeedText('abc')).toBeNull()
        expect(parseSpeedText(null)).toBeNull()
        expect(parseSpeedText('Infinity')).toBeNull()
    })
    it('clamps to the range the preference allows (0.001 to 10000 m)', () => {
        expect(parseSpeedText('0.0001')).toBe(MIN_SPEED)
        expect(parseSpeedText('20000')).toBe(MAX_SPEED)
    })
})

describe('the words for a speed', () => {
    it('says metres short: three figures, whole metres from 100 up', () => {
        expect(metresText(2.5)).toBe('2.5')
        expect(metresText(0.925)).toBe('0.925')
        expect(metresText(12.3456)).toBe('12.3')
        expect(metresText(1234.5)).toBe('1235')
        expect(metresText(0)).toBe('')
        expect(metresText(null)).toBe('')
        expect(metresText(NaN)).toBe('')
        expect(formatMetres(2.5)).toBe('2.5 m')
        expect(formatMetres(undefined)).toBe('')
    })
    it('labels the Auto button with the reading once there is one', () => {
        expect(autoLabel(null)).toBe('Auto')
        expect(autoLabel(2.5)).toBe('Auto · 2.5 m')
    })
    it('keeps the turn words and the hint the lead decided', () => {
        expect(TURN_LABELS).toEqual({ point: 'Around a point ahead', place: 'Where you stand' })
        expect(MOVE_HINT).toMatch(/Shift faster, Alt slower/)
        expect(MOVE_HINT).toMatch(/W\u00a0A\u00a0S\u00a0D\u00a0Q\u00a0E/) // no-break spaces: a line never ends inside the keys
    })
})

describe('the automatic speed reading', () => {
    it('follows the move\'s own announcement', () => {
        const { result } = renderHook(() => useStandardMoveReading())
        expect(result.current.auto).toBeNull()
        act(() => { window.dispatchEvent(new CustomEvent(STANDARD_MOVE_SPEED_EVENT, { detail: { auto: 2.5, speed: 2.5 } })) })
        expect(result.current).toEqual({ auto: 2.5, speed: 2.5 })
    })
    it('stops listening when the control goes away', () => {
        const { result, unmount } = renderHook(() => useStandardMoveReading())
        unmount()
        expect(() => act(() => { window.dispatchEvent(new CustomEvent(STANDARD_MOVE_SPEED_EVENT, { detail: { auto: 9, speed: 9 } })) })).not.toThrow()
        expect(result.current.auto).toBeNull()
    })
})

describe('the settings hook', () => {
    it('reads the preference and writes it back', () => {
        const { result } = renderHook(() => useMoveSettings())
        expect(result.current).toMatchObject({ speed: 'auto', turn: 'place', isAuto: true })
        act(() => { result.current.setSpeed(1) })
        expect(result.current).toMatchObject({ speed: 1, isAuto: false })
        expect(getSpeedPreference()).toBe(1)
        act(() => { result.current.setTurn('place') })
        expect(result.current.turn).toBe('place')
        expect(getTurnPreference()).toBe('place')
    })
    it('follows a change made somewhere else on the page', () => {
        const { result } = renderHook(() => useMoveSettings())
        act(() => { setSpeedPreference(4); setTurnPreference('place') })
        expect(result.current).toMatchObject({ speed: 4, turn: 'place' })
    })
})

describe('the speed field', () => {
    const hook = () => renderHook(() => {
        const settings = useMoveSettings()
        return { settings, field: useSpeedField(settings) }
    })
    it('is empty on Auto and shows the stored number otherwise', () => {
        const { result } = hook()
        expect(result.current.field.value).toBe('')
        act(() => { setSpeedPreference(0.5) })
        expect(result.current.field.value).toBe('0.5')
    })
    it('writes a typed number at once and keeps the typed text while it has focus', () => {
        const { result } = hook()
        act(() => { result.current.field.onChange({ target: { value: '20000' } }) })
        expect(getSpeedPreference()).toBe(MAX_SPEED)
        expect(result.current.field.value).toBe('20000')
        act(() => { result.current.field.onBlur() })
        expect(result.current.field.value).toBe('10000')
        expect(result.current.settings.speed).toBe(MAX_SPEED)
    })
    it('treats an empty field as Auto, but half-typed text in a number field as nothing yet', () => {
        const { result } = hook()
        act(() => { setSpeedPreference(3) })
        act(() => { result.current.field.onChange({ target: { value: '', validity: { badInput: true } } }) })
        expect(getSpeedPreference()).toBe(3)
        act(() => { result.current.field.onChange({ target: { value: '' } }) })
        expect(getSpeedPreference()).toBe('auto')
    })
    it('leaves the setting alone for text that is not a speed', () => {
        const { result } = hook()
        act(() => { setSpeedPreference(3) })
        for (const text of ['0', '-2', 'x']) act(() => { result.current.field.onChange({ target: { value: text } }) })
        expect(getSpeedPreference()).toBe(3)
        act(() => { result.current.field.onBlur() })
        expect(result.current.field.value).toBe('3')
    })
    it('resets to Auto and empties the field', () => {
        const { result } = hook()
        act(() => { setSpeedPreference(3) })
        act(() => { result.current.field.reset() })
        expect(getSpeedPreference()).toBe('auto')
        expect(result.current.field.value).toBe('')
    })
})
