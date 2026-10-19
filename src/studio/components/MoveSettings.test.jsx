import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import MoveSettings from './MoveSettings.jsx'
import { MOVES } from '../navigation/moves.js'
import {
    SPEED_STORAGE_KEY, TURN_STORAGE_KEY, getSpeedPreference, getTurnPreference, resetNavigationPreferenceMemory, setSpeedPreference, setTurnPreference,
} from '../navigation/preference.js'
import { STANDARD_MOVE_SPEED_EVENT } from '../navigation/useCameraNavigation.js'

beforeEach(() => {
    resetNavigationPreferenceMemory()
    try { window.localStorage.clear() } catch { /* no storage */ }
})
afterEach(() => resetNavigationPreferenceMemory())

const speedField = () => screen.getByLabelText('Speed (metres a step)')
const autoButton = () => screen.getByRole('button', { name: /^Auto/ })
const turnSelect = () => screen.getByLabelText('Turn')
const type = (text) => fireEvent.change(speedField(), { target: { value: text } })

describe('the Move block (Scene window)', () => {
    it('starts on Auto and turning where you stand (the default since 2026-10-16)', () => {
        render(<MoveSettings />)
        expect(speedField().value).toBe('')
        expect(autoButton().getAttribute('aria-pressed')).toBe('true')
        expect(turnSelect().value).toBe('place')
        expect(screen.getByRole('option', { name: 'Around a point ahead' })).toBeTruthy()
        expect(screen.getByRole('option', { name: 'Where you stand' })).toBeTruthy()
    })

    it('writes a typed speed to the preference, in metres', () => {
        render(<MoveSettings />)
        type('1')
        expect(getSpeedPreference()).toBe(1)
        expect(window.localStorage.getItem(SPEED_STORAGE_KEY)).toBe('1')
        expect(autoButton().getAttribute('aria-pressed')).toBe('false')
        type('0.25')
        expect(getSpeedPreference()).toBe(0.25)
    })

    it('goes back to Auto from the button, and empties the field', () => {
        render(<MoveSettings />)
        type('7')
        fireEvent.click(autoButton())
        expect(getSpeedPreference()).toBe('auto')
        expect(speedField().value).toBe('')
        expect(autoButton().getAttribute('aria-pressed')).toBe('true')
    })

    it('treats an emptied field as Auto', () => {
        render(<MoveSettings />)
        type('3')
        type('')
        expect(getSpeedPreference()).toBe('auto')
    })

    it('keeps the setting for text that is not a speed, and clamps a number out of range', () => {
        render(<MoveSettings />)
        type('2')
        type('0')
        type('-5')
        expect(getSpeedPreference()).toBe(2)
        type('99999')
        expect(getSpeedPreference()).toBe(10000)
        type('0.00001')
        expect(getSpeedPreference()).toBe(0.001)
    })

    it('writes the turn to the preference', () => {
        render(<MoveSettings />)
        fireEvent.change(turnSelect(), { target: { value: 'place' } })
        expect(getTurnPreference()).toBe('place')
        expect(window.localStorage.getItem(TURN_STORAGE_KEY)).toBe('place')
        fireEvent.change(turnSelect(), { target: { value: 'point' } })
        expect(getTurnPreference()).toBe('point')
    })

    it('shows what is already set', () => {
        setSpeedPreference(3)
        setTurnPreference('place')
        render(<MoveSettings />)
        expect(speedField().value).toBe('3')
        expect(autoButton().getAttribute('aria-pressed')).toBe('false')
        expect(turnSelect().value).toBe('place')
    })

    it('follows a change made elsewhere (the viewer\'s Move control, another tab)', () => {
        render(<MoveSettings />)
        act(() => { setSpeedPreference(5); setTurnPreference('place') })
        expect(speedField().value).toBe('5')
        expect(turnSelect().value).toBe('place')
    })

    it('says the automatic speed once the space has a size', () => {
        render(<MoveSettings />)
        expect(autoButton().textContent).toBe('Auto')
        act(() => { window.dispatchEvent(new CustomEvent(STANDARD_MOVE_SPEED_EVENT, { detail: { auto: 2.5, speed: 2.5 } })) })
        expect(autoButton().textContent).toBe('Auto · 2.5 m')
        expect(speedField().getAttribute('placeholder')).toBe('2.5')
    })

    it('tells what the wheel, Shift, Alt and the flying keys do, without making them settings', () => {
        render(<MoveSettings />)
        expect(screen.getByText(/Wheel: forward and back\. Shift faster, Alt slower\./)).toBeTruthy()
        expect(screen.getByText(/W A S D Q E to fly/)).toBeTruthy()
        // two settings only: the speed and the turn
        expect(screen.getAllByRole('spinbutton')).toHaveLength(1)
        expect(screen.getAllByRole('combobox')).toHaveLength(1)
    })
})

describe('the Move row', () => {
    it('with one move is a plain heading line, no picker', () => {
        render(<MoveSettings />)
        expect(screen.getByText('Move 1')).toBeTruthy()
        expect(screen.getByText(/Auto speed from the size of the place/)).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Move 1' })).toBeNull()
    })
    it('with two moves is a picker of pressed buttons', () => {
        const moves = [...MOVES, { id: 'move-test', label: 'Move test', since: '2099-01-01', about: 'test only' }]
        render(<MoveSettings moves={moves} />)
        expect(screen.getByRole('button', { name: 'Move 1' }).getAttribute('aria-pressed')).toBe('true')
        expect(screen.getByRole('button', { name: 'Move test' }).getAttribute('aria-pressed')).toBe('false')
    })
})
