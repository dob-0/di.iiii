import { describe, expect, it, vi } from 'vitest'

// The text module is mocked: this checks the LOOKUP (which place each tab
// reads, whole files through their loader), not the build-time measurement —
// scripts/nodeAnatomy.test.js checks that against the real files.
vi.mock('virtual:node-source', () => ({
    SOURCE_TEXTS: ['case cube text', 'draw cube text', 'door text', 'branch text'],
    NODE_SOURCE: {
        'geom.cube': { computes: { file: 'rt.js', fromLine: 10, toLine: 12, text: 0 }, draws: { file: 'vp.jsx', fromLine: 40, toLine: 41, text: 1 }, branch: null, component: null, feed: null },
        'source.webcam': { computes: null, draws: null, branch: { file: 'ed.jsx', fromLine: 5, toLine: 7, text: 3 }, component: 'Cam.jsx', feed: null }
    },
    DOORWAY_SOURCE: { file: 'rt.js', fromLine: 1, toLine: 3, text: 2 },
    FILE_LOADERS: { 'Cam.jsx': () => Promise.resolve({ default: 'export default function Cam() {}' }) }
}))

const { madeOfTabs, readMadeOf } = await import('./insideSource.js')

describe('MADE OF — tabs and their source', () => {
    it('offers only the tabs a node really has', () => {
        expect(madeOfTabs({ typeId: 'geom.cube' }).map((tab) => tab.id)).toEqual(['computes', 'draws', 'script'])
        expect(madeOfTabs({ typeId: 'top.level' }).map((tab) => tab.id)).toEqual(['computes', 'window', 'shader', 'script'])
        expect(madeOfTabs({ typeId: 'source.webcam' }).map((tab) => tab.id)).toEqual(['computes', 'window', 'script'])
        expect(madeOfTabs({ typeId: 'geom.geo' }).map((tab) => tab.id)).toContain('door')
        expect(madeOfTabs({ typeId: 'stream.recorder' })).toEqual([])
    })

    it('reads a slice with its real first line number', async () => {
        expect(await readMadeOf('geom.cube', 'computes')).toEqual([{ file: 'rt.js', fromLine: 10, text: 'case cube text' }])
        expect(await readMadeOf('geom.cube', 'draws')).toEqual([{ file: 'vp.jsx', fromLine: 40, text: 'draw cube text' }])
        expect(await readMadeOf('geom.cube', 'door')).toEqual([{ file: 'rt.js', fromLine: 1, text: 'door text' }])
    })

    it('loads a window component as a whole file, then the branch that mounts it', async () => {
        expect(await readMadeOf('source.webcam', 'window')).toEqual([
            { file: 'Cam.jsx', fromLine: 1, text: 'export default function Cam() {}' },
            { file: 'ed.jsx', fromLine: 5, text: 'branch text' }
        ])
    })
})
