import { beforeEach, describe, expect, it } from 'vitest'
import { loadStudioWorkspace, saveStudioWorkspace } from './studioWorkspaceStorage.js'

describe('studioWorkspaceStorage', () => {
    beforeEach(() => {
        window.localStorage.clear()
    })

    it('round-trips positions, sizes, collapsed panels, and snap preference', () => {
        saveStudioWorkspace({
            open: new Set(['create', 'scene']),
            positions: { scene: { x: 40, y: 90 } },
            sizes: { scene: { width: 360, height: 500 }, files: { width: 620, height: null } },
            collapsed: new Set(['world']),
            snapEdges: true
        })

        const loaded = loadStudioWorkspace()
        expect(loaded.open).toEqual(['create', 'scene'])
        expect(loaded.positions).toEqual({ scene: { x: 40, y: 90 } })
        expect(loaded.sizes).toEqual({ scene: { width: 360, height: 500 }, files: { width: 620, height: null } })
        expect(loaded.collapsed).toEqual(['world'])
        expect(loaded.snapEdges).toBe(true)
    })

    it('tolerates pre-sizes payloads saved by older builds', () => {
        window.localStorage.setItem('dii.studio.workspace.v1', JSON.stringify({
            open: ['scene'],
            positions: { scene: { x: 1, y: 2 } },
            snapEdges: false
        }))
        const loaded = loadStudioWorkspace()
        expect(loaded.open).toEqual(['scene'])
        expect(loaded.sizes).toBe(null)
        expect(loaded.collapsed).toBe(null)
    })
})
