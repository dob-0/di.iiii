import { describe, expect, it } from 'vitest'
import { buildBuildPath, buildCrewPath, getBuildLocationState, isBuildLocation } from './buildRouting.js'
import { RESERVED_APP_SEGMENTS } from '../utils/spaceRouting.js'

describe('/{space}/build/{project} and /{space}/crew/{project}', () => {
    it('reads exactly three segments with "build" or "crew" in the middle', () => {
        expect(getBuildLocationState({ pathname: '/moxir/build/moxir-hall' })).toEqual({ isBuild: true, crew: false, spaceId: 'moxir', projectId: 'moxir-hall' })
        expect(getBuildLocationState({ pathname: '/moxir/crew/moxir-hall/' })).toEqual({ isBuild: true, crew: true, spaceId: 'moxir', projectId: 'moxir-hall' })
        expect(isBuildLocation(getBuildLocationState({ pathname: '/moxir/build' }))).toBe(false)
        expect(isBuildLocation(getBuildLocationState({ pathname: '/moxir/build/a/b' }))).toBe(false)
        expect(isBuildLocation(getBuildLocationState({ pathname: '/moxir/plot/moxir-hall' }))).toBe(false)
    })

    it('builds both paths and reserves both words', () => {
        expect(buildBuildPath('moxir', 'moxir-hall')).toMatch(/\/moxir\/build\/moxir-hall$/)
        expect(buildCrewPath('moxir', 'moxir-hall')).toMatch(/\/moxir\/crew\/moxir-hall$/)
        expect(RESERVED_APP_SEGMENTS).toContain('build')
        expect(RESERVED_APP_SEGMENTS).toContain('crew')
    })
})
