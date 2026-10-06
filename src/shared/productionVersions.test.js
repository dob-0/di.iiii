import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import {
    entryOps, forTheShow, listProjectIdOf, normalizeProductionMeta, normalizeProductionVersion, productionOps, removeOps,
    statusOps, VERSION_STATUSES, versionsFromDocument
} from './productionVersions.js'
import { applyProjectOps, normalizeProjectDocument } from './projectSchema.js'

const server = createRequire(import.meta.url)('../../shared/projectSchema.cjs')

const FP = `sha256:${'a'.repeat(64)}`
const entry = (id, status = 'candidate', extra = {}) => ({
    id, projectId: `moxir-hall-${id}`, title: `${id} — title`, status, madeFrom: null,
    madeBy: { machine: 'aylmo', install: 'dev.diiii.xyz', tool: 'load-version.mjs', commit: 'abc123' },
    madeAt: '2026-10-04T20:00:00.000Z', fingerprint: FP, listed: { at: '2026-10-04T20:00:00.000Z', by: { machine: 'aylmo', install: 'dev.diiii.xyz', tool: 'x', commit: null } }, note: '', ...extra
})
const META = { id: 'moxir-2026-10-17', title: 'MOXIR 17.10', space: 'moxir', codeList: 'scripts/place/rigs/moxir-versions-2026-10-17.json' }
/** A list document built the way the tools build it: ops, applied by a schema. */
const listWith = (entries, apply = applyProjectOps) => {
    let doc = normalizeProjectDocument({ entities: [] })
    doc = apply(doc, productionOps(doc, META))
    for (const e of entries) doc = apply(doc, entryOps(doc, e).ops)
    return doc
}

describe('a production version list: the data (decision 2026-10-04)', () => {
    it('names the list project after the production', () => {
        expect(listProjectIdOf('moxir-2026-10-17')).toBe('moxir-2026-10-17-versions')
    })

    it('keeps an entry whole and turns what it does not know into null, never a guess', () => {
        const kept = normalizeProductionVersion({ id: 'minimal', projectId: 'moxir-hall-minimal', status: 'candidate' })
        expect(kept).toEqual({
            id: 'minimal', projectId: 'moxir-hall-minimal', title: 'minimal', status: 'candidate', madeFrom: null,
            madeBy: { machine: null, install: null, tool: null, commit: null }, madeAt: null, fingerprint: null,
            listed: { at: null, by: { machine: null, install: null, tool: null, commit: null } }, note: ''
        })
    })

    it('refuses an entry with no id, no project, or a status outside the four', () => {
        expect(normalizeProductionVersion({ projectId: 'p', status: 'candidate' })).toBe(null)
        expect(normalizeProductionVersion({ id: 'a', status: 'candidate' })).toBe(null)
        expect(normalizeProductionVersion({ id: 'a', projectId: 'p', status: 'approved' })).toBe(null)
        expect(normalizeProductionVersion({ id: 'a', projectId: 'p', status: 'candidate', fingerprint: 'md5:1' }).fingerprint).toBe(null)
        expect(VERSION_STATUSES).toEqual(['for-the-show', 'candidate', 'kept-copy', 'concept', 'archived'])
    })

    it('concept is a status: kept by both normalisers, ordered after kept copies and before archived, never the show', () => {
        const c = { id: 'a', projectId: 'p', status: 'concept' }
        expect(normalizeProductionVersion(c).status).toBe('concept')
        expect(server.normalizeProductionVersion(c).status).toBe('concept')
        const doc = listWith([entry('z', 'archived'), entry('c', 'concept'), entry('k', 'kept-copy'), entry('n'), entry('s', 'for-the-show')])
        expect(versionsFromDocument(doc).entries.map((v) => v.id)).toEqual(['s', 'n', 'k', 'c', 'z'])
        expect(forTheShow(versionsFromDocument(listWith([entry('c', 'concept')])).entries)).toBe(null)
    })

    // The server runs shared/projectSchema.cjs, the browser and the tools src/shared — the two must agree,
    // and the server must keep the list through its own normaliser and op application.
    it('the server\'s schema copy normalises the list exactly as the shared one does', () => {
        const odd = { ...entry('minimal'), title: 'x'.repeat(300), note: 'n'.repeat(900), rig: { file: 'scripts/place/rigs/a.json', blob: 'f'.repeat(40) }, extra: 1 }
        expect(server.normalizeProductionVersion(odd)).toEqual(normalizeProductionVersion(odd))
        expect(server.normalizeProductionVersion({ id: 'a', projectId: 'p', status: 'nope' })).toBe(null)
        expect(server.normalizeProductionMeta(META)).toEqual(normalizeProductionMeta(META))
        const viaServer = listWith([entry('minimal'), entry('full', 'kept-copy')], server.applyProjectOps)
        const viaShared = listWith([entry('minimal'), entry('full', 'kept-copy')])
        expect(versionsFromDocument(viaServer)).toEqual(versionsFromDocument(viaShared))
        expect(versionsFromDocument(viaServer).entries.map((v) => v.id)).toEqual(['minimal', 'full'])
    })

    it('drops a malformed entry at the server — one with a status outside the four never lands', () => {
        const doc = server.normalizeProjectDocument({ entities: [{ id: 'version-x', type: 'group', components: { productionVersion: { id: 'x', projectId: 'p', status: 'the best one' } } }] })
        expect(doc.entities[0].components.productionVersion).toBeUndefined()
    })

    it('reads the list in a fixed order: for the show, candidates, kept copies, archived; then by project', () => {
        const doc = listWith([entry('zeta', 'archived'), entry('beta', 'kept-copy'), entry('gamma'), entry('alpha'), entry('omega', 'for-the-show')])
        const { production, entries, problems } = versionsFromDocument(doc)
        expect(production).toEqual(META)
        expect(entries.map((v) => v.id)).toEqual(['omega', 'alpha', 'gamma', 'beta', 'zeta'])
        expect(problems).toEqual([])
        expect(forTheShow(entries).id).toBe('omega')
    })

    it('"none chosen" is a valid state', () => {
        const { entries, problems } = versionsFromDocument(listWith([entry('a'), entry('b')]))
        expect(forTheShow(entries)).toBe(null)
        expect(problems).toEqual([])
    })

    it('refuses a second version for the show, both when listing and when setting a status', () => {
        const doc = listWith([entry('a', 'for-the-show'), entry('b')])
        expect(() => entryOps(doc, entry('c', 'for-the-show'))).toThrow(/"a" is already for the show/)
        expect(() => statusOps(doc, 'b', 'for-the-show')).toThrow(/"a" is already for the show/)
        const moved = applyProjectOps(doc, statusOps(doc, 'a', 'candidate').ops)
        expect(statusOps(moved, 'b', 'for-the-show').ops).toHaveLength(1)
    })

    it('says so — and names no version for the show — when a merge of two machines left two', () => {
        // two installs each chose one at the same moment; the follow carries both entities' edits
        let doc = listWith([entry('a'), entry('b')])
        doc = applyProjectOps(doc, [
            { type: 'updateComponent', payload: { entityId: 'version-a', component: 'productionVersion', patch: { status: 'for-the-show' } } },
            { type: 'updateComponent', payload: { entityId: 'version-b', component: 'productionVersion', patch: { status: 'for-the-show' } } }
        ])
        const { entries, problems } = versionsFromDocument(doc)
        expect(problems[0]).toMatch(/2 versions say they are for the show/)
        expect(forTheShow(entries)).toBe(null)
    })

    it('refuses to list one project as two versions', () => {
        const doc = listWith([entry('a')])
        expect(() => entryOps(doc, { ...entry('b'), projectId: 'moxir-hall-a' })).toThrow(/already listed as version "a"/)
    })

    it('replaces an entry whole: a field the new one lacks does not survive from the old', () => {
        const doc = listWith([entry('a', 'candidate', { rig: { file: 'scripts/place/rigs/a.json', blob: null } })])
        const next = applyProjectOps(doc, entryOps(doc, entry('a', 'candidate', { note: 'again' })).ops)
        const [a] = versionsFromDocument(next).entries
        expect(a.rig).toBeUndefined()
        expect(a.note).toBe('again')
    })

    it('one entity per version, so two machines adding different versions both keep theirs', () => {
        const base = listWith([entry('a')])
        const here = entryOps(base, entry('b')).ops
        const there = entryOps(base, entry('c')).ops
        const merged = applyProjectOps(applyProjectOps(base, here), there)
        expect(versionsFromDocument(merged).entries.map((v) => v.id)).toEqual(['a', 'b', 'c'])
    })

    it('removes an entry (the project is not touched — it is not in this document)', () => {
        const doc = listWith([entry('a'), entry('b')])
        const after = applyProjectOps(doc, removeOps(doc, 'a').ops)
        expect(versionsFromDocument(after).entries.map((v) => v.id)).toEqual(['b'])
    })
})
