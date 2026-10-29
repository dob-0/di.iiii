import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DEFAULT_FLY_KEYS, altitudeHintTextFor, altitudeKeysFor, normalizeFlyKeys } from './flyKeys.js'
import { FLY_KEYS_STORAGE_KEY, getFlyKeysPreference, resetNavigationPreferenceMemory, setFlyKeysPreference } from './preference.js'
import MoveSettings from '../components/MoveSettings.jsx'
import { layoutLabel, moveKeysText } from '../../components/layoutLabels.js'
import { physicalKey, shortcutLetter } from '../../components/physicalKey.js'

beforeEach(() => { resetNavigationPreferenceMemory(); try { window.localStorage.clear() } catch { /* none */ } })
afterEach(() => resetNavigationPreferenceMemory())

describe('the fly keys choice', () => {
    it('defaults to E up, Q down; junk is the default', () => {
        expect(DEFAULT_FLY_KEYS).toBe('standard')
        expect(normalizeFlyKeys('x')).toBe('standard')
        expect(getFlyKeysPreference()).toBe('standard')
        expect(altitudeKeysFor('standard')).toEqual({ up: [' ', 'e'], down: ['q', 'c'] })
        expect(altitudeHintTextFor('standard')).toContain('Space/E')
        expect(altitudeHintTextFor('standard')).toContain('C/Q')
    })
    it('classic is Q up, E down, and the hint follows', () => {
        expect(altitudeKeysFor('classic')).toEqual({ up: [' ', 'q'], down: ['e', 'c'] })
        expect(altitudeHintTextFor('classic')).toContain('Space/Q')
        expect(altitudeHintTextFor('classic')).toContain('C/E')
    })
    it('is saved like Mouse in Edit', () => {
        expect(setFlyKeysPreference('classic')).toBe('classic')
        expect(window.localStorage.getItem(FLY_KEYS_STORAGE_KEY)).toBe('classic')
        resetNavigationPreferenceMemory()
        expect(getFlyKeysPreference()).toBe('classic')
    })
    it('the Scene window shows both beside Mouse in Edit and a click picks one', () => {
        render(<MoveSettings />)
        expect(screen.getByTestId('fly-keys-row')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'E up, Q down' }).getAttribute('aria-pressed')).toBe('true')
        fireEvent.click(screen.getByRole('button', { name: 'Q up, E down' }))
        expect(getFlyKeysPreference()).toBe('classic')
        expect(screen.getByRole('button', { name: 'Q up, E down' }).getAttribute('aria-pressed')).toBe('true')
    })
})

describe('shortcuts follow the letter, movement follows the place', () => {
    it('Ctrl + the key that types z on a German layout (code KeyY) is z; movement still reads the place', () => {
        const german = { key: 'z', code: 'KeyY', ctrlKey: true }
        expect(shortcutLetter(german)).toBe('z')
        expect(physicalKey(german)).toBe('y')
    })
    it('an Armenian layout falls back to the place', () => {
        expect(shortcutLetter({ key: 'զ', code: 'KeyZ' })).toBe('z')
        expect(shortcutLetter(null)).toBe('')
    })
})

describe('the hint shows the visitor\'s own letters', () => {
    const azerty = new Map([['KeyW', 'z'], ['KeyA', 'q'], ['KeyS', 's'], ['KeyD', 'd'], ['KeyE', 'e'], ['KeyQ', 'a']])
    it('uses the layout map where the browser tells', () => {
        expect(moveKeysText(azerty)).toBe('ZQSD')
        expect(altitudeHintTextFor('standard', (code, fb) => layoutLabel(azerty, code, fb))).toContain('C/A')
    })
    it('keeps W A S D with no map', () => {
        expect(moveKeysText(null)).toBe('WASD')
        expect(layoutLabel(new Map([['KeyW', 'ц́']]), 'KeyW', 'W')).toBe('W')
    })
})
