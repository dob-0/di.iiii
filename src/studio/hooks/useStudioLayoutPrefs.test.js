import { describe, expect, it } from 'vitest'
import { deriveStudioLayoutFromLegacy } from './useStudioLayoutPrefs.js'

describe('useStudioLayoutPrefs', () => {
    it('derives a desktop studio layout from legacy beta windows', () => {
        const layout = deriveStudioLayoutFromLegacy({
            windows: {
                assets: {
                    visible: true,
                    width: 420
                },
                inspector: {
                    visible: true,
                    width: 380
                },
                activity: {
                    visible: true
                },
                project: {
                    visible: false
                },
                outliner: {
                    visible: true
                }
            }
        }, 'desktop')

        expect(layout.leftOpen).toBe(true)
        expect(layout.leftTab).toBe('assets')
        expect(layout.leftWidth).toBe(420)
        expect(layout.rightOpen).toBe(true)
        expect(layout.rightWidth).toBe(380)
        expect(layout.bottomOpen).toBe(true)
        expect(layout.bottomTab).toBe('activity')
        expect(layout.popouts.outliner).toBe(true)
    })

    it('creates mobile-friendly defaults when deriving from legacy windows', () => {
        const layout = deriveStudioLayoutFromLegacy({}, 'mobile')

        expect(layout.leftOpen).toBe(false)
        expect(layout.bottomOpen).toBe(true)
        expect(layout.popouts.assets).toBe(false)
    })
})
