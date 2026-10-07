import { beforeEach, describe, expect, it } from 'vitest'
import {
    FORM_LIGHT_DEFAULT, FORM_LIGHT_MAX, FORM_LIGHT_KEY, LOOK_KEY,
    environmentIntensityFor, formLightOf, getViewLook, lookOf, resetViewLookForTests, setFormLight, setViewLook
} from './viewLook.js'

beforeEach(() => { window.localStorage.clear(); resetViewLookForTests() })

describe('the look (current / form)', () => {
    it('starts as the current look, with the form fill at the owner\'s 0.15', () => {
        expect(getViewLook()).toEqual({ look: 'current', light: FORM_LIGHT_DEFAULT })
        expect(FORM_LIGHT_DEFAULT).toBe(0.15)
    })
    it('the current look asks for NO environment light, whatever the level', () => {
        expect(environmentIntensityFor('current', 0.5)).toBe(0)
        expect(environmentIntensityFor('nonsense', 0.5)).toBe(0)
    })
    it('the form look asks for the level, clamped to 0…max, default when unreadable', () => {
        expect(environmentIntensityFor('form', 0.3)).toBe(0.3)
        expect(formLightOf(9)).toBe(FORM_LIGHT_MAX)
        expect(formLightOf(-1)).toBe(0)
        expect(formLightOf('abc')).toBe(FORM_LIGHT_DEFAULT)
        expect(formLightOf(null)).toBe(FORM_LIGHT_DEFAULT)
        expect(lookOf('form')).toBe('form')
        expect(lookOf(undefined)).toBe('current')
    })
    it('remembers the choice per browser', () => {
        setViewLook('form'); setFormLight(0.3)
        expect(window.localStorage.getItem(LOOK_KEY)).toBe('form')
        expect(window.localStorage.getItem(FORM_LIGHT_KEY)).toBe('0.3')
        resetViewLookForTests()
        expect(getViewLook()).toEqual({ look: 'form', light: 0.3 })
    })
})
