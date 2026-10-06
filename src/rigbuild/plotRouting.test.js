import { describe, expect, it } from 'vitest'
import { buildPlotPath, getPlotLocationState, isPlotLocation } from './plotRouting.js'
import { RESERVED_APP_SEGMENTS } from '../utils/spaceRouting.js'

describe('/{space}/plot/{project}', () => {
    it('reads exactly three segments with "plot" in the middle', () => {
        expect(getPlotLocationState({ pathname: '/moxir/plot/moxir-hall' })).toEqual({ isPlot: true, spaceId: 'moxir', projectId: 'moxir-hall' })
        expect(isPlotLocation(getPlotLocationState({ pathname: '/moxir/plot' }))).toBe(false)
        expect(isPlotLocation(getPlotLocationState({ pathname: '/moxir/plot/a/b' }))).toBe(false)
        expect(isPlotLocation(getPlotLocationState({ pathname: '/moxir/patch/moxir-hall' }))).toBe(false)
    })

    it('builds the path and reserves the word', () => {
        expect(buildPlotPath('moxir', 'moxir-hall')).toMatch(/\/moxir\/plot\/moxir-hall$/)
        expect(RESERVED_APP_SEGMENTS).toContain('plot')
    })
})
