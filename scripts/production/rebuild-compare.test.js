import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

import { applyOp, compare, documentAt, fieldDiff, gitSide, settled } from './rebuild-compare.mjs'
import { fileBlob, REPO_ROOT } from './versionList.mjs'
import { normalizeProductionVersion } from '../../src/shared/productionVersions.js'
import { rigFileOf } from '../rigbuild/versions.mjs'

const RECORD = 'scripts/production/records/moxir-2026-10-17--known-full-ponyo-10-04.json'
const ENTRY = 'scripts/production/records/moxir-2026-10-17--known-full-ponyo-10-04.entry.json'
const read = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'))

describe('the Known · full record (audit D1)', () => {
    const record = read(RECORD)
    it('pins the files the measurement was made from — a moved file means the claim must be re-checked against the installs', () => {
        const moved = Object.entries(record.pinned).filter(([file, blob]) => fileBlob(file) !== blob).map(([file]) => file)
        expect(moved, `re-run: ${record.rebuild.check}`).toEqual([])
        expect(record.pinned[rigFileOf(record.production, record.versionOf)]).toMatch(/^[0-9a-f]{40}$/)
    })
    it('the list entry to write is the record, as the list schema keeps it', () => {
        const entry = normalizeProductionVersion(read(ENTRY))
        expect(entry.id).toBe(record.versionId)
        expect(entry.projectId).toBe(record.projectId)
        expect(entry.madeFrom).toBe(record.versionOf)
        expect(entry.rig).toEqual({ file: rigFileOf(record.production, record.versionOf), blob: record.pinned[rigFileOf(record.production, record.versionOf)] })
        expect(entry.fingerprint).toBe(record.listed.fingerprint)
        expect(entry.status).toBe('for-the-show')
    })
})

describe('rebuild-compare pure parts', () => {
    it('fieldDiff names each differing leaf', () => {
        expect(fieldDiff({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [1, 3] } })).toEqual([{ path: 'b.c.1', git: 2, live: 3 }])
        expect(fieldDiff({ a: 1 }, { a: 1, z: 2 })).toEqual([{ path: 'z', git: '(absent)', live: 2 }])
    })
    it('replays an op log to a version and refuses op types it does not know', () => {
        const ops = [
            { version: 1, type: 'replaceDocument', payload: { document: { entities: [{ id: 'x', components: { light: { intensity: 1 } } }], worldState: { backgroundColor: '#000000' } } } },
            { version: 2, type: 'setWorldState', payload: { patch: { backgroundColor: '#030304' } } }
        ]
        expect(documentAt(ops, 1).worldState.backgroundColor).toBe('#000000')
        expect(documentAt(ops, 2).worldState.backgroundColor).toBe('#030304')
        expect(() => applyOp({ entities: [] }, { opId: 'o', type: 'deleteEntity', payload: {} })).toThrow(/not replayed/)
    })
    it('settled is the normaliser at its fixed point (a cut summary loses its trailing space on the second write)', () => {
        const e = { id: 'rig-show', type: 'group', components: { rigVariant: { set: 's', id: 'v', title: 'V', summary: `${'x'.repeat(159)} tail`, siblings: [{ id: 'v', projectId: 'p-v', title: 'V', summary: '' }] } } }
        const once = settled(e)
        expect(once.components.rigVariant.summary.endsWith(' ')).toBe(false)
        expect(settled(once)).toEqual(once)
    })
})

describe('rebuild-compare against a document built from git itself', async () => {
    const git = await gitSide({ versionId: 'known-full', copy: { label: 'PONYO 10-04', siblingsFile: 'scripts/place/rigs/moxir-ponyo-to-dev-siblings-2026-10-04.json' } })
    // as an install holds it: every entity has passed the server's normaliser
    const doc = () => ({
        entities: [
            settled({ id: 'place-hall', type: 'model', components: { venuePlan: structuredClone(git.venuePlan) } }),
            ...structuredClone(git.entities),
            settled({ id: 'rig-show', type: 'group', components: structuredClone(git.show) })
        ],
        assets: Object.values(git.pieceAssets).map((a) => ({ id: a.id, name: a.name, mimeType: 'model/gltf-binary' })),
        worldState: {},
        renderSettings: {}
    })
    it('is equal to itself: every git-built entity identical, the fingerprint unchanged by the substitution', () => {
        const c = compare(doc(), git)
        expect(c.entities.changed).toEqual([])
        expect(c.entities.equal).toBe(git.entities.length)
        expect(c.fingerprint.withGitParts).toBe(c.fingerprint.live)
        expect(Object.values(c.show).every((d) => d.length === 0)).toBe(true)
    })
    it('names the entity and the field when one lamp differs, and the fingerprint tells', () => {
        const d = doc()
        const lamp = d.entities.find((e) => e.type === 'spotLight')
        lamp.components.light.intensity += 1
        const c = compare(d, git)
        expect(c.entities.changed.map((x) => [x.id, x.fields.map((f) => f.path)])).toEqual([[lamp.id, ['components.light.intensity']]])
        expect(c.fingerprint.withGitParts).not.toBe(c.fingerprint.live)
    })
    it('names a rig entity that only the project holds', () => {
        const d = doc()
        d.entities.push({ id: 'rig-extra-01', type: 'spotLight', components: {} })
        expect(compare(d, git).entities.onlyLive).toEqual(['rig-extra-01'])
    })
})
