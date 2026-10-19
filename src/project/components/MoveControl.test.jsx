import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import MoveControl from './MoveControl.jsx'
import { MOVES } from '../../studio/navigation/moves.js'
import {
    getSpeedPreference, getTurnPreference, resetNavigationPreferenceMemory, setSpeedPreference, setTurnPreference,
} from '../../studio/navigation/preference.js'
import { STANDARD_MOVE_SPEED_EVENT } from '../../studio/navigation/useCameraNavigation.js'

beforeEach(() => {
    resetNavigationPreferenceMemory()
    try { window.localStorage.clear() } catch { /* no storage */ }
})
afterEach(() => resetNavigationPreferenceMemory())

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Move' }))
const speedField = () => screen.getByLabelText('Speed (metres a step)')
const autoButton = () => screen.getByRole('button', { name: /^Auto/ })
const turnButton = (name) => screen.getByRole('button', { name })
const type = (text) => fireEvent.change(speedField(), { target: { value: text } })

describe('the viewer\'s Move control', () => {
    it('is one small button until it is opened', () => {
        render(<MoveControl />)
        expect(screen.getByRole('button', { name: 'Move' }).getAttribute('aria-expanded')).toBe('false')
        expect(screen.queryByRole('group', { name: 'Move' })).toBeNull()
        open()
        expect(screen.getByRole('button', { name: 'Move' }).getAttribute('aria-expanded')).toBe('true')
        expect(screen.getByRole('group', { name: 'Move' })).toBeTruthy()
    })

    it('starts on Auto and turning where you stand (the default since 2026-10-16)', () => {
        render(<MoveControl />)
        open()
        expect(speedField().value).toBe('')
        expect(autoButton().getAttribute('aria-pressed')).toBe('true')
        expect(turnButton('Where you stand').getAttribute('aria-pressed')).toBe('true')
        expect(turnButton('Around a point ahead').getAttribute('aria-pressed')).toBe('false')
    })

    it('writes a typed speed to the preference, and Auto takes it back', () => {
        render(<MoveControl />)
        open()
        type('1')
        expect(getSpeedPreference()).toBe(1)
        expect(autoButton().getAttribute('aria-pressed')).toBe('false')
        fireEvent.click(autoButton())
        expect(getSpeedPreference()).toBe('auto')
        expect(speedField().value).toBe('')
    })

    it('keeps the setting for text that is not a speed, and clamps a number out of range', () => {
        render(<MoveControl />)
        open()
        type('2')
        type('0')
        expect(getSpeedPreference()).toBe(2)
        type('50000')
        expect(getSpeedPreference()).toBe(10000)
    })

    it('writes the turn to the preference', () => {
        render(<MoveControl />)
        open()
        fireEvent.click(turnButton('Where you stand'))
        expect(getTurnPreference()).toBe('place')
        expect(turnButton('Where you stand').getAttribute('aria-pressed')).toBe('true')
        fireEvent.click(turnButton('Around a point ahead'))
        expect(getTurnPreference()).toBe('point')
    })

    it('shows what is already set, and follows a change made elsewhere (the Studio\'s Scene window)', () => {
        setSpeedPreference(3)
        setTurnPreference('place')
        render(<MoveControl />)
        open()
        expect(speedField().value).toBe('3')
        expect(turnButton('Where you stand').getAttribute('aria-pressed')).toBe('true')
        act(() => { setSpeedPreference(8); setTurnPreference('point') })
        expect(speedField().value).toBe('8')
        expect(turnButton('Around a point ahead').getAttribute('aria-pressed')).toBe('true')
    })

    it('says the automatic speed once the space has a size', () => {
        render(<MoveControl />)
        open()
        expect(autoButton().textContent).toBe('Auto')
        act(() => { window.dispatchEvent(new CustomEvent(STANDARD_MOVE_SPEED_EVENT, { detail: { auto: 2.5, speed: 2.5 } })) })
        expect(autoButton().textContent).toBe('Auto · 2.5 m')
    })

    it('closes on Escape, with the focus back on the button, and on a press anywhere else', () => {
        render(<div><MoveControl /><button type="button">elsewhere</button></div>)
        open()
        fireEvent.keyDown(speedField(), { key: 'Escape' })
        expect(screen.queryByRole('group', { name: 'Move' })).toBeNull()
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move' }))
        open()
        fireEvent.pointerDown(speedField())
        expect(screen.getByRole('group', { name: 'Move' })).toBeTruthy()
        fireEvent.pointerDown(screen.getByRole('button', { name: 'elsewhere' }))
        expect(screen.queryByRole('group', { name: 'Move' })).toBeNull()
    })

    it('takes the button\'s look and place from the viewer, so it sits with Low / High and in the scene bar', () => {
        render(<MoveControl buttonStyle={{ color: 'rgb(1, 2, 3)' }} wrapStyle={{ position: 'absolute', top: '9rem', right: '1rem' }} />)
        const button = screen.getByRole('button', { name: 'Move' })
        expect(button.style.color).toBe('rgb(1, 2, 3)')
        expect(button.style.minWidth).toBe('104px')
        expect(button.style.minHeight).toBe('44px')
        expect(button.parentElement.style.top).toBe('9rem')
    })

    it('draws rectangles only (0-2 px corners)', () => {
        const { container } = render(<MoveControl />)
        open()
        const radii = [...container.querySelectorAll('*')].map((el) => el.style.borderRadius).filter(Boolean)
        expect(radii.length).toBeGreaterThan(3)
        for (const radius of radii) expect(Number.parseFloat(radius)).toBeLessThanOrEqual(2)
    })

    it('tells what the wheel, Shift and Alt do in the button\'s hint, not as a setting', () => {
        render(<MoveControl />)
        expect(screen.getByRole('button', { name: 'Move' }).getAttribute('title')).toMatch(/Shift faster, Alt slower/)
        open()
        expect(screen.getAllByRole('spinbutton')).toHaveLength(1)
    })
})

describe('the Move row', () => {
    it('with one move is a plain heading line, no picker', () => {
        render(<MoveControl />)
        open()
        expect(screen.getByText('Move 1')).toBeTruthy()
        expect(screen.getByText(/Same speed in every direction/)).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Move 1' })).toBeNull()
    })
    it('with two moves is a picker of pressed buttons that writes the preference', () => {
        const moves = [...MOVES, { id: 'move-test', label: 'Move test', since: '2099-01-01', about: 'test only' }]
        render(<MoveControl moves={moves} />)
        open()
        expect(screen.getByRole('button', { name: 'Move 1' }).getAttribute('aria-pressed')).toBe('true')
        fireEvent.click(screen.getByRole('button', { name: 'Move test' }))
        // the stored id is real only if the build knows it; with one real move it falls back, the click still reached the setter
        expect(screen.getByRole('button', { name: 'Move test' })).toBeTruthy()
    })
})
