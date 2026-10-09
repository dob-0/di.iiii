import { describe, expect, it } from 'vitest'
import { ACESFilmicToneMapping, AgXToneMapping } from 'three'
import {
    getMeasureRequest, isMeasureChord, isMeasuring, measurementOf, parseMeasureParams, resolveMeasurement,
    setMeasureRequest, setMeasurementActive, toggleMeasureRequest
} from './measureState.js'

describe('the request (URL flag, hidden toggle)', () => {
    it('is off unless asked for', () => {
        expect(parseMeasureParams('')).toBeNull()
        expect(parseMeasureParams('?view=free')).toBeNull()
        expect(parseMeasureParams('?measure=0')).toBeNull()
        expect(parseMeasureParams('?measure=off')).toBeNull()
    })
    it('reads ev100, scale, bounce and scene', () => {
        expect(parseMeasureParams('?measure')).toEqual({ ev100: null, sceneScale: null, bounce: false, scene: null })
        expect(parseMeasureParams('?measure=1&ev100=3.5&scale=0.02&bounce=1&scene=moxir-v1')).toEqual({ ev100: 3.5, sceneScale: 0.02, bounce: true, scene: 'moxir-v1' })
        expect(parseMeasureParams('?measure&ev100=-1').ev100).toBe(-1)
        expect(parseMeasureParams('?measure&scale=-2').sceneScale).toBeNull()
        expect(parseMeasureParams('?measure&ev100=abc').ev100).toBeNull()
    })
    it('the hidden key is Alt+Shift+M only', () => {
        expect(isMeasureChord({ altKey: true, shiftKey: true, code: 'KeyM' })).toBe(true)
        expect(isMeasureChord({ altKey: true, shiftKey: false, code: 'KeyM' })).toBe(false)
        expect(isMeasureChord({ altKey: true, shiftKey: true, ctrlKey: true, code: 'KeyM' })).toBe(false)
        expect(isMeasureChord({ altKey: true, shiftKey: true, code: 'KeyN' })).toBe(false)
    })
    it('the toggle turns it on and off', () => {
        setMeasureRequest(null)
        toggleMeasureRequest()
        expect(getMeasureRequest()).not.toBeNull()
        toggleMeasureRequest()
        expect(getMeasureRequest()).toBeNull()
    })
})

describe('the camera it draws with', () => {
    const sceneSettings = { toneMappingExposure: 3.5, photometry: { sceneScale: 0.02 } }
    it("states the scene's own exposure as an EV100 when none is given", () => {
        const m = resolveMeasurement({ ev100: null }, sceneSettings, ACESFilmicToneMapping)
        expect(m.ev100).toBeCloseTo(2.8365, 4)
        expect(m.exposure).toBeCloseTo(3.5, 10) // the picture does not jump; only auto exposure and glow go
        expect(m.sceneScale).toBe(0.02)
        expect(m.sceneScaleSource).toMatch(/document/)
    })
    it('a fixed EV100 sets the exposure', () => {
        const m = resolveMeasurement({ ev100: 4 }, sceneSettings, AgXToneMapping)
        expect(m.ev100).toBe(4)
        expect(m.exposure).toBeCloseTo(1 / (1.2 * 16 * 0.02), 10)
        expect(m.ev100Source).toMatch(/url/)
    })
    it('the URL scale wins over the document; none at all is UNKNOWN, not guessed', () => {
        expect(resolveMeasurement({ sceneScale: 0.05 }, sceneSettings, AgXToneMapping).sceneScale).toBe(0.05)
        const unknown = resolveMeasurement({}, { toneMappingExposure: 1 }, AgXToneMapping)
        expect(unknown.sceneScale).toBeNull()
        expect(unknown.sceneScaleSource).toMatch(/unknown/)
    })
    it('is null when not requested', () => {
        expect(resolveMeasurement(null, sceneSettings, AgXToneMapping)).toBeNull()
    })
    it('is held per renderer', () => {
        const a = {}
        const b = {}
        setMeasurementActive(a, { ev100: 3 })
        expect(isMeasuring(a)).toBe(true)
        expect(isMeasuring(b)).toBe(false)
        expect(measurementOf(a).ev100).toBe(3)
        setMeasurementActive(a, null)
        expect(isMeasuring(a)).toBe(false)
    })
})
