// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { PENDING, loadProjectLibrary, typeIdsUsedBy, useProjectLibrary } from './projectTypes.js'
import { TYPE_LIBRARY } from './index.js'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'library')
const bytesOf = (ids) => ids.reduce((sum, id) => sum + fs.statSync(path.join(DIR, `${id}.json`)).size, 0)
const lamp = (id, type) => ({ id, type: 'spotLight', components: { fixture: { type, index: 1 } } })

// A room that hangs three kinds: PARs, beams, and one hazer on its rental list only.
const DOC = [
    lamp('p1', 'up-pl5403'), lamp('p2', 'up-pl5403'), lamp('b1', 'UP-B380F'),
    { id: 'rig-show', type: 'group', components: { rentalList: { items: [{ code: 'EXT-HAZER', type: 'ext-hazer', ordered: 1 }, { code: 'Art-Net node', type: 'item-artnet', kind: 'item', ordered: 1 }] } } },
    { id: 'box', type: 'box', components: {} }
]

describe('a viewer loads only the types its project uses', () => {
    it('names the 3 types the document uses, in the library\'s order; an unknown id and a non-lamp name none', () => {
        expect(typeIdsUsedBy(DOC)).toEqual(['up-b380f', 'up-pl5403', 'ext-hazer'])
        expect(typeIdsUsedBy([])).toEqual([])
        expect(typeIdsUsedBy([lamp('x', 'ofl-someone-else')])).toEqual([])
    })

    it('MEASURED: 3 of 13 types, and the bytes of those 3 files against the whole library', async () => {
        const library = await loadProjectLibrary(DOC)
        expect(library.types.map((t) => t.id)).toEqual(['up-b380f', 'up-pl5403', 'ext-hazer'])
        expect(library.types[0]).toEqual(TYPE_LIBRARY.types.find((t) => t.id === 'up-b380f'))
        const all = TYPE_LIBRARY.types.map((t) => t.id)
        const before = bytesOf(all)
        const after = bytesOf(library.types.map((t) => t.id))
        expect(all).toHaveLength(13)
        expect(after).toBeLessThan(before / 2)
        // the numbers the PR reports (source JSON, pretty-printed; the built chunks are measured by `npm run build`)
        console.info(`[projectTypes] before: ${all.length} types, ${before} B · after: ${library.types.length} types, ${after} B (${Math.round((100 * after) / before)} %)`)
    })

    it('the hook: PENDING while the types load, then the 3; a room with no library lamp loads nothing', async () => {
        const { result } = renderHook(() => useProjectLibrary(DOC))
        expect(result.current).toBe(PENDING)
        await waitFor(() => expect(result.current.types.map((t) => t.id)).toEqual(['up-b380f', 'up-pl5403', 'ext-hazer']))
        const none = renderHook(() => useProjectLibrary([{ id: 'box', type: 'box', components: {} }]))
        expect(none.result.current.types).toEqual([])
        expect(none.result.current).not.toBe(PENDING)
    })
})

describe('a kind added to the room', () => {
    it('keeps the types already drawn while the new one loads, then adds it', async () => {
        const { result, rerender } = renderHook(({ doc }) => useProjectLibrary(doc), { initialProps: { doc: [lamp('p1', 'up-pl5403')] } })
        await waitFor(() => expect(result.current.types.map((t) => t.id)).toEqual(['up-pl5403']))
        rerender({ doc: [lamp('p1', 'up-pl5403'), lamp('s1', 'ext-strobe')] })
        expect(result.current.types.map((t) => t.id)).toEqual(['up-pl5403'])
        await waitFor(() => expect(result.current.types.map((t) => t.id)).toEqual(['up-pl5403', 'ext-strobe']))
    })
})

// The guarantee that outlives this PR: a room and a Studio open without the whole library. Only the
// Studio's tool surfaces, which offer every type (hotbar, plot, cards, ...), import it - each is its own
// lazy chunk (RootApp.jsx, WalkHand.jsx). A new importer is a decision, made here, in the open.
describe('who may import the whole library', () => {
    it('only the tool surfaces and the walk hand', () => {
        const SRC = path.resolve(DIR, '../../..')
        const found = []
        const walkDir = (dir) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name)
                if (entry.isDirectory()) { if (entry.name !== 'node_modules') walkDir(full) } else if (/\.(js|jsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
                    if (/from '[^']*types\/index\.js'/.test(fs.readFileSync(full, 'utf8'))) found.push(path.relative(SRC, full))
                }
            }
        }
        walkDir(SRC)
        expect(found.sort()).toEqual([
            'rigbuild/BuildSurface.jsx', 'rigbuild/CardsSurface.jsx', 'rigbuild/EquipmentSurface.jsx', 'rigbuild/PatchSheetSurface.jsx',
            'rigbuild/PlotSurface.jsx', 'rigbuild/VisualiserSurface.jsx', 'studio/walkBuild/WalkHand.jsx'
        ])
    })
})
