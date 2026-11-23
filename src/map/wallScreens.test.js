import { describe, expect, it } from 'vitest'
import {
    boundsOfCorners,
    isUnwarped,
    presetScreens,
    rectCorners,
    rectsToClipPath,
    screenInput,
    screenPresets,
    sharesWallLayer,
    visualKey,
    visualKindForFile
} from './wallScreens.js'

const plainScreen = (patch = {}) => ({
    corners: rectCorners([0.2, 0, 0.2, 1]),
    input: [0.2, 0, 0.2, 1],
    source: { kind: 'wall', ref: '' },
    ...patch
})

describe('screenInput', () => {
    it('falls back to the box the corners make when there is no input', () => {
        const corners = [[0.1, 0.2], [0.5, 0.25], [0.45, 0.9], [0.05, 0.8]]
        expect(screenInput({ corners })).toEqual(boundsOfCorners(corners))
        expect(screenInput({ corners })[0]).toBeCloseTo(0.05)
    })

    it('uses a valid explicit input as it is', () => {
        expect(screenInput({ corners: rectCorners([0, 0, 1, 1]), input: [0.4, 0.1, 0.2, 0.5] })).toEqual([0.4, 0.1, 0.2, 0.5])
    })

    it('ignores an input with no area', () => {
        expect(screenInput({ corners: rectCorners([0, 0, 0.5, 0.5]), input: [0.4, 0.1, 0, 0.5] })).toEqual([0, 0, 0.5, 0.5])
    })
})

describe('isUnwarped', () => {
    it('is true when the corners sit on the input rectangle', () => {
        expect(isUnwarped(plainScreen())).toBe(true)
    })

    it('tolerates a nudge under 1e-4 and not one over it', () => {
        const nudged = (amount) => {
            const corners = rectCorners([0.2, 0, 0.2, 1])
            corners[0] = [corners[0][0] + amount, corners[0][1]]
            return plainScreen({ corners })
        }
        expect(isUnwarped(nudged(0.00005))).toBe(true)
        expect(isUnwarped(nudged(0.0002))).toBe(false)
    })
})

describe('sharesWallLayer', () => {
    it('is true for a plain unwarped wall screen', () => {
        expect(sharesWallLayer(plainScreen())).toBe(true)
    })

    it.each([
        ['a mask', { mask: [[0, 0], [1, 0], [1, 1]] }],
        ['opacity 0.5', { opacity: 0.5 }],
        ['a brightness change', { brightness: 0.8 }],
        ['blend screen', { blend: 'screen' }],
        ['kind visual', { source: { kind: 'visual', ref: 'v1' } }],
        ['a warped quad', { corners: [[0.21, 0.02], [0.4, 0], [0.4, 1], [0.2, 1]] }]
    ])('is false for %s', (_name, patch) => {
        expect(sharesWallLayer(plainScreen(patch))).toBe(false)
    })
})

describe('rectsToClipPath', () => {
    it('draws one subpath per rectangle in pixels', () => {
        expect(rectsToClipPath([[0, 0, 0.2, 1], [0.4, 0, 0.2, 1]], 3200, 1440))
            .toBe("path('M0 0H640V1440H0ZM1280 0H1920V1440H1280Z')")
    })

    it('is none for an empty list', () => {
        expect(rectsToClipPath([], 3200, 1440)).toBe('none')
    })
})

describe('presetScreens', () => {
    const row5 = screenPresets.find((preset) => preset.id === 'row5')
    const screens = presetScreens(row5, { width: 3200, height: 1440 })

    it('makes five side-by-side screens', () => {
        expect(screens).toHaveLength(5)
        expect(screens.map((screen) => screen.input[0])).toEqual([0, 0.2, 0.4, 0.6, 0.8])
    })

    it('sizes each one in pixels and starts it unwarped', () => {
        screens.forEach((screen) => {
            expect(screen.resolution).toEqual([640, 1440])
            expect(screen.corners).toEqual(rectCorners(screen.input))
            expect(screen.source.kind).toBe('wall')
            expect(isUnwarped(screen)).toBe(true)
        })
    })

    it('names them Screen 1 to 5, and honours startNumber', () => {
        expect(screens.map((screen) => screen.name)).toEqual(['Screen 1', 'Screen 2', 'Screen 3', 'Screen 4', 'Screen 5'])
        expect(presetScreens(row5, { width: 3200, height: 1440 }, 4).map((screen) => screen.name)[0]).toBe('Screen 4')
    })
})

describe('visualKindForFile', () => {
    it.each([
        [{ name: 'a.mp4', type: '' }, 'video'],
        [{ name: 'a', type: 'video/webm' }, 'video'],
        [{ name: 'a.png', type: '' }, 'image'],
        [{ name: 'a', type: 'image/svg+xml' }, 'image'],
        [{ name: 'index.html', type: 'text/html' }, 'html'],
        [{ name: 'PAGE.HTM', type: '' }, 'html'],
        [{ name: 'a.pdf', type: 'application/pdf' }, '']
    ])('%j is %j', (file, kind) => {
        expect(visualKindForFile(file)).toBe(kind)
    })
})

describe('visualKey', () => {
    const visual = { id: 'v1', name: 'One', source: { kind: 'video', ref: '/a.mp4' } }

    it('changes when the source ref changes', () => {
        expect(visualKey({ ...visual, source: { kind: 'video', ref: '/b.mp4' } })).not.toBe(visualKey(visual))
    })

    it('does not change when only the name changes', () => {
        expect(visualKey({ ...visual, name: 'Renamed' })).toBe(visualKey(visual))
    })

    it('is empty for no visual', () => {
        expect(visualKey(null)).toBe('')
    })
})
