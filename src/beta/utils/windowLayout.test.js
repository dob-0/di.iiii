import { describe, expect, it } from 'vitest'
import {
    clampWindowFrame,
    getWorkspaceAdjustmentOps,
    getWorkspaceTopInset
} from './windowLayout.js'

describe('windowLayout', () => {
    it('computes a workspace inset from the topbar bottom edge', () => {
        expect(getWorkspaceTopInset({
            topbarRect: {
                bottom: 132
            }
        })).toBe(168)

        expect(getWorkspaceTopInset({
            topbarRect: {
                bottom: 210
            }
        })).toBe(226)
    })

    it('clamps windows below the workspace chrome and inside the viewport', () => {
        expect(clampWindowFrame({
            x: 2,
            y: 20,
            width: 360,
            height: 240
        }, {
            minTop: 180,
            viewportWidth: 1024,
            viewportHeight: 768
        })).toEqual(expect.objectContaining({
            x: 12,
            y: 180,
            width: 360,
            height: 240
        }))
    })

    it('builds adjustment ops only for overlapping visible windows', () => {
        expect(getWorkspaceAdjustmentOps([
            { id: 'viewport', visible: true, y: 24 },
            { id: 'assets', visible: true, y: 180 },
            { id: 'project', visible: false, y: 24 }
        ], 160)).toEqual([
            {
                windowId: 'viewport',
                patch: {
                    y: 160
                }
            }
        ])
    })
})
