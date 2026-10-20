import { describe, expect, it } from 'vitest'
import { versionLinks, versionListProjectOf } from './rigVariant.js'
import { entryOps, productionOps, versionsFromDocument } from '../shared/productionVersions.js'
import { applyProjectOps, normalizeProjectDocument } from '../shared/projectSchema.js'

// MOXIR, measured 2026-10-04 (read-only): 17 versions, each carrying its own copy of the others in
// rigVariant.siblings, copied when it was made and never updated — 16 versions showed 6 different rows.
// The row now reads ONE list, the production's (decision 2026-10-04-production-versions).
const SET = 'moxir-2026-10-17'
const href = (id) => `/moxir/${id}`
const live = ['minimal', 'minimal-cut-movers', 'minimal-halo', 'minimal-halo-heads', 'minimal-xflat', 'minimal-xflat-heads', 'minimal-ground', 'full-ground', 'known-full', 'known-ground']
const copies = ['minimal', 'minimal-cut-movers', 'minimal-halo', 'minimal-halo-heads', 'minimal-xflat', 'minimal-xflat-heads'].map((id) => `${id}-oldhall-0929`)
const pid = (id) => (id === 'ordered' ? 'moxir-hall' : `moxir-hall-${id}`)
const entry = (id, status) => ({ id, projectId: pid(id), title: `${id} — words`, status })
const ENTRIES = [
    ...live.map((id) => entry(id, 'candidate')),
    ...copies.map((id) => entry(id, 'kept-copy')),
    entry('ordered', 'archived'), entry('full', 'archived'), entry('middle', 'archived')
]
const listDoc = (entries) => {
    let doc = normalizeProjectDocument({ entities: [] })
    doc = applyProjectOps(doc, productionOps(doc, { id: SET, title: 'MOXIR 17.10', space: 'moxir' }))
    for (const e of entries) doc = applyProjectOps(doc, entryOps(doc, e).ops)
    return versionsFromDocument(doc)
}
// every version's project is in the space (the /contents rows), each wearing its own mark
const rows = ENTRIES.map((e) => ({ id: e.projectId, rigVariant: { set: SET, id: e.id, title: e.title } }))
// each version's OWN stale sibling list — different on each, as measured
const variantOf = (id, i) => ({ set: SET, id, title: `${id} — words`, siblings: ENTRIES.slice(0, 2 + (i % 6)).map((e) => ({ id: e.id, projectId: e.projectId, title: e.title })) })

describe('the version row reads the production\'s version list', () => {
    // The measured fault: where the space's rows carry no marks (an install from before 2026-09-30, or a
    // viewer whose rows lack them) each version fell back to its OWN stored siblings — a different row on
    // each. With the list, every version shows the list's row.
    it('shows the SAME row from every version even where the rows carry no marks — not each one\'s stale siblings', () => {
        const list = listDoc(ENTRIES)
        const bare = rows.map(({ id }) => ({ id }))
        const shown = ENTRIES.filter((e) => e.status !== 'archived').map((e, i) => (versionLinks(variantOf(e.id, i), e.projectId, href, bare, list) || []).map((l) => l.href))
        expect(new Set(shown.map((s) => JSON.stringify(s))).size).toBe(1)
        expect(shown[0]).toHaveLength(16)
    })

    it('shows the list\'s row from every version: the versions the list archived are not on it, though their projects are live', () => {
        const list = listDoc(ENTRIES)
        const shown = ENTRIES.filter((e) => e.status !== 'archived').map((e, i) => versionLinks(variantOf(e.id, i), e.projectId, href, rows, list).map((l) => l.href))
        expect(new Set(shown.map((s) => JSON.stringify(s))).size).toBe(1)
        expect(shown[0]).toHaveLength(16) // 10 live + 6 kept copies; the three archived are not on the row
    })

    it('puts the version for the show first and marks it; candidates next; kept copies fold; archived are not linked', () => {
        const list = listDoc(ENTRIES.map((e) => (e.id === 'minimal-ground' ? { ...e, status: 'for-the-show' } : e)))
        const links = versionLinks(variantOf('minimal', 0), 'moxir-hall-minimal', href, rows, list)
        expect(links[0]).toMatchObject({ id: 'minimal-ground', show: true, copy: false })
        expect(links.filter((l) => l.show)).toHaveLength(1)
        expect(links.filter((l) => l.copy).map((l) => l.id)).toEqual([...copies].sort((a, b) => (pid(a) < pid(b) ? -1 : 1)))
        expect(links.some((l) => ['ordered', 'full', 'middle'].includes(l.id))).toBe(false)
        expect(links.find((l) => l.current).id).toBe('minimal')
    })

    it('an archived version opened by its address still shows where you are', () => {
        const links = versionLinks(variantOf('full', 0), 'moxir-hall-full', href, rows, listDoc(ENTRIES))
        expect(links.find((l) => l.current)).toMatchObject({ id: 'full', href: '/moxir/moxir-hall-full' })
    })

    it('never links a listed version this viewer\'s space does not hold (not on this install, or private to others)', () => {
        const fewer = rows.filter((r) => r.id !== 'moxir-hall-known-full')
        const links = versionLinks(variantOf('minimal', 0), 'moxir-hall-minimal', href, fewer, listDoc(ENTRIES))
        expect(links.some((l) => l.id === 'known-full')).toBe(false)
    })

    it('a project marked but not in the list is not on the row (the audit names it)', () => {
        const extra = [...rows, { id: 'moxir-hall-stray', rigVariant: { set: SET, id: 'stray', title: 'Stray' } }]
        const links = versionLinks(variantOf('minimal', 0), 'moxir-hall-minimal', href, extra, listDoc(ENTRIES))
        expect(links.some((l) => l.id === 'stray')).toBe(false)
    })

    it('two versions for the show (a merge of two machines) marks neither', () => {
        const list = listDoc(ENTRIES)
        const both = { ...list, entries: list.entries.map((e) => (e.id === 'minimal' || e.id === 'full-ground' ? { ...e, status: 'for-the-show' } : e)) }
        expect(versionLinks(variantOf('minimal', 0), 'moxir-hall-minimal', href, rows, both).filter((l) => l.show)).toHaveLength(0)
    })

    it('falls back to what it did before when there is no list, or the list is another production\'s', () => {
        const before = versionLinks(variantOf('minimal', 0), 'moxir-hall-minimal', href, rows)
        expect(versionLinks(variantOf('minimal', 0), 'moxir-hall-minimal', href, rows, null)).toEqual(before)
        const other = { ...listDoc(ENTRIES), production: { id: 'another-show', title: 'x', space: 'moxir', codeList: '' } }
        expect(versionLinks(variantOf('minimal', 0), 'moxir-hall-minimal', href, rows, other)).toEqual(before)
        expect(versionListProjectOf({ set: SET })).toBe('moxir-2026-10-17-versions')
        expect(versionListProjectOf(null)).toBe(null)
    })
})
