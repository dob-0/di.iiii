import { afterEach, describe, expect, it } from 'vitest'
import { isLetterShortcut, letterKeyIsOff, readKeyPrefs, tabFlipsMode, writeKeyPrefs, KEY_PREFS_STORAGE } from './studioKeyPrefs.js'
import { walkKeyAction } from '../navigation/useWalkNavigation.js'

afterEach(() => window.localStorage.clear())

describe('studioKeyPrefs', () => {
    it('defaults: letter keys on, Tab left to the browser', () => {
        expect(readKeyPrefs()).toEqual({ letters: true, blenderTab: false })
    })
    it('a bad stored value falls back to the defaults', () => {
        window.localStorage.setItem(KEY_PREFS_STORAGE, '{nope')
        expect(readKeyPrefs()).toEqual({ letters: true, blenderTab: false })
    })
    it('writeKeyPrefs keeps what it is not told about', () => {
        writeKeyPrefs({ letters: false })
        writeKeyPrefs({ blenderTab: true })
        expect(readKeyPrefs()).toEqual({ letters: false, blenderTab: true })
    })
    it('a letter shortcut is one printable character; Ctrl, Cmd, Alt and named keys are not', () => {
        expect(isLetterShortcut({ key: 'h' })).toBe(true)
        expect(isLetterShortcut({ key: '?', shiftKey: true })).toBe(true)
        expect(isLetterShortcut({ key: 'D', shiftKey: true })).toBe(true)
        expect(isLetterShortcut({ key: 'z', ctrlKey: true })).toBe(false)
        expect(isLetterShortcut({ key: 'g', altKey: true })).toBe(false)
        expect(isLetterShortcut({ key: 'Escape' })).toBe(false)
        expect(isLetterShortcut({ key: 'Tab' })).toBe(false)
        expect(isLetterShortcut({ key: 'Delete' })).toBe(false)
        expect(isLetterShortcut({ key: ' ' })).toBe(false)
    })
    it('letterKeyIsOff follows the switch', () => {
        expect(letterKeyIsOff({ key: 'e' })).toBe(false)
        writeKeyPrefs({ letters: false })
        expect(letterKeyIsOff({ key: 'e' })).toBe(true)
        expect(letterKeyIsOff({ key: 'e', ctrlKey: true })).toBe(false)
    })
    it('Tab flips the mode only for the Blender opt-in', () => {
        expect(tabFlipsMode({ key: 'Tab' })).toBe(false)
        writeKeyPrefs({ blenderTab: true })
        expect(tabFlipsMode({ key: 'Tab' })).toBe(true)
        expect(tabFlipsMode({ key: 'Tab', ctrlKey: true })).toBe(false)
    })
    it('walking keeps its keys: Tab in a walk is still "toggle" (useWalkNavigation.js is untouched)', () => {
        writeKeyPrefs({ letters: false })
        expect(walkKeyAction('Tab')).toBe('toggle')
    })
})
