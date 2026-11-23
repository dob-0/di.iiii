import { describe, expect, it } from 'vitest'
import { announceVisualParams, paramSpecSignature, paramValue, subscribeVisualParams } from './visualParams.js'

describe("a clip's own settings", () => {
    const thickness = { key: 'thickness', label: 'Line thickness', type: 'number', min: 0.03, max: 0.97, step: 0.01, default: 0.5 }
    const cubes = { key: 'cubes', label: 'Cubes', type: 'choice', options: [['auto', 'Story'], ['own', 'Each its own']], default: 'auto' }
    const invert = { key: 'invert', label: 'Invert', type: 'toggle', default: false }

    it('reads a value through its setting: chosen if it fits, else the default', () => {
        expect(paramValue(thickness, { thickness: 0.2 })).toBe(0.2)
        expect(paramValue(thickness, { thickness: 5 })).toBe(0.97)
        expect(paramValue(thickness, {})).toBe(0.5)
        expect(paramValue(cubes, { cubes: 'own' })).toBe('own')
        expect(paramValue(cubes, { cubes: 'sideways' })).toBe('auto')
        expect(paramValue(invert, { invert: true })).toBe(true)
        expect(paramValue(invert, { invert: 'yes' })).toBe(false)
    })

    it('a stored list with the schema’s filled-in fields reads the same as the page’s own', () => {
        const stored = [{ ...cubes, min: 0, max: 1, step: 0.01 }, { ...invert, min: 0, max: 1, step: 0.01, options: [] }]
        expect(paramSpecSignature(stored)).toBe(paramSpecSignature([cubes, invert]))
        expect(paramSpecSignature([thickness])).not.toBe(paramSpecSignature([{ ...thickness, default: 0.4 }]))
    })

    it('tells listeners once per change, and late listeners hear what was already said', () => {
        const heard = []
        const stop = subscribeVisualParams((ref, spec) => heard.push([ref, spec.length]))
        announceVisualParams('/a.html#scene=op-blaze', [thickness, cubes])
        announceVisualParams('/a.html#scene=op-blaze', [thickness, cubes])
        announceVisualParams('/a.html#scene=op-blaze', [thickness])
        stop()
        expect(heard).toEqual([['/a.html#scene=op-blaze', 2], ['/a.html#scene=op-blaze', 1]])
        const late = []
        subscribeVisualParams((ref) => late.push(ref))()
        expect(late).toContain('/a.html#scene=op-blaze')
    })
})
