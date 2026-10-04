import { describe, expect, it } from 'vitest'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { run } from './versions.mjs'
import { fingerprintOf, readList, recordMadeVersion } from './versionList.mjs'
import { fakeInstall, markedDoc } from './fakeInstall.testlib.mjs'

// an undo file goes to a temporary folder in tests, never the person's ~/.di
process.env.DI_VERSIONS_UNDO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'versions-undo-'))

const SET = 'moxir-2026-10-17'
const API = 'https://dev.example/serverXR'
const collect = () => { const lines = []; return { lines, log: (l) => lines.push(String(l)) } }
const install = () => fakeInstall({
    'moxir-hall-minimal': { document: markedDoc({ set: SET, id: 'minimal', title: 'Minimal — simple', source: 'scripts/place/rigs/moxir-versions-2026-10-17.json — scripts/rigbuild/load-version.mjs' }) },
    'moxir-hall-full-ground': { document: markedDoc({ set: SET, id: 'full-ground', title: 'Full · movers on the ground' }) },
    'moxir-hall-minimal-oldhall-0929': { document: markedDoc({ set: SET, id: 'minimal-oldhall-0929', title: 'Minimal · old hall 09-29', copyOf: { projectId: 'moxir-hall-minimal', id: 'minimal', label: 'old hall 09-29' } }) },
    'moxir-sources': { document: markedDoc(null) }
})
const cli = (i, ...argv) => { const { lines, log } = collect(); return run(['--api', API, ...argv], { client: i, log }).then((r) => ({ r, lines })) }

describe('the fingerprint: the same work on two installs reads the same', () => {
    const doc = (assetId, stamp) => ({
        projectMeta: { id: 'p', spaceId: 'moxir', title: 'P', createdAt: stamp, updatedAt: stamp, source: 'project' },
        assets: [{ id: assetId, name: 'hall.glb', mimeType: 'model/gltf-binary', url: `/api/projects/p/assets/${assetId}` }],
        entities: [{ id: 'hall', components: { media: { assetId } } }]
    })
    it('ignores per-install timestamps and asset ids re-addressed by the upload route', () => {
        expect(fingerprintOf(doc('aaa111', 1))).toBe(fingerprintOf(doc('bbb222', 999)))
        expect(fingerprintOf(doc('aaa111', 1))).toMatch(/^sha256:[0-9a-f]{64}$/)
    })
    it('changes when the work changes', () => {
        const moved = doc('aaa111', 1)
        moved.entities.push({ id: 'lamp', components: {} })
        expect(fingerprintOf(moved)).not.toBe(fingerprintOf(doc('aaa111', 1)))
    })
})

describe('versions.mjs — register, list, set-status, remove, put', () => {
    it('registers an existing version from its own mark, makes the private list in its space, prints the undo', async () => {
        const i = install()
        const { r, lines } = await cli(i, 'register', 'moxir-hall-minimal')
        expect(r.status).toBe('written')
        const list = await readList(i, SET)
        expect(list.entries).toHaveLength(1)
        expect(list.entries[0]).toMatchObject({ id: 'minimal', projectId: 'moxir-hall-minimal', status: 'candidate', madeBy: { tool: 'load-version.mjs', machine: null } })
        expect(list.entries[0].fingerprint).toBe(fingerprintOf(i.rows.get('moxir-hall-minimal').document))
        expect(i.rows.get(`${SET}-versions`)).toMatchObject({ space: 'moxir', meta: { visibility: 'private' } })
        expect(lines.some((l) => /undo: node scripts\/production\/versions\.mjs .* remove minimal$/.test(l))).toBe(true)
        // only the ops route — never a whole-document PUT, which a follow does not carry
        expect(i.writes.filter((w) => w.method === 'PUT')).toHaveLength(0)
    })

    it('a labelled copy registers as a kept copy, made from its source version', async () => {
        const i = install()
        await cli(i, 'register', 'moxir-hall-minimal-oldhall-0929')
        expect((await readList(i, SET)).entries[0]).toMatchObject({ id: 'minimal-oldhall-0929', status: 'kept-copy', madeFrom: 'minimal', madeBy: { tool: 'copy-version.mjs' } })
    })

    it('refuses a project with no version mark', async () => {
        await expect(cli(install(), 'register', 'moxir-sources')).rejects.toThrow(/no version mark/)
    })

    it('--dry-run prints the ops and writes nothing at all', async () => {
        const i = install()
        const { r, lines } = await cli(i, '--dry-run', 'register', 'moxir-hall-minimal')
        expect(r.status).toBe('dry-run')
        expect(i.writes).toHaveLength(0)
        expect(lines.join('\n')).toMatch(/would make the private project moxir-2026-10-17-versions in moxir/)
    })

    it('set-status names one version for the show and refuses a second, writing nothing', async () => {
        const i = install()
        await cli(i, 'register', 'moxir-hall-minimal')
        await cli(i, 'register', 'moxir-hall-full-ground')
        const { lines } = await cli(i, '--production', SET, 'set-status', 'full-ground', 'for-the-show')
        expect(lines.some((l) => l.endsWith(`set-status full-ground candidate`))).toBe(true) // the undo
        const writes = i.writes.length
        await expect(cli(i, '--production', SET, 'set-status', 'minimal', 'for-the-show')).rejects.toThrow(/"full-ground" is already for the show/)
        expect(i.writes.length).toBe(writes)
        expect((await readList(i, SET)).entries.map((v) => [v.id, v.status])).toEqual([['full-ground', 'for-the-show'], ['minimal', 'candidate']])
    })

    it('refuses a status outside the four', async () => {
        const i = install()
        await cli(i, 'register', 'moxir-hall-minimal')
        await expect(cli(i, '--production', SET, 'set-status', 'minimal', 'approved')).rejects.toThrow(/not a status/)
    })

    it('registering again keeps the owner\'s status and re-records the fingerprint', async () => {
        const i = install()
        await cli(i, 'register', 'moxir-hall-minimal')
        await cli(i, '--production', SET, 'set-status', 'minimal', 'for-the-show')
        const row = i.rows.get('moxir-hall-minimal')
        row.document = { ...row.document, entities: [...row.document.entities, { id: 'rig-par-9', type: 'box', name: 'par', components: {} }] }
        await cli(i, 'register', 'moxir-hall-minimal')
        const [v] = (await readList(i, SET)).entries
        expect(v.status).toBe('for-the-show')
        expect(v.fingerprint).toBe(fingerprintOf(row.document))
    })

    it('remove takes a version out of the list, leaves its project, and the undo it prints puts it back', async () => {
        const i = install()
        await cli(i, 'register', 'moxir-hall-minimal')
        const { lines } = await cli(i, '--production', SET, 'remove', 'minimal')
        expect((await readList(i, SET)).entries).toHaveLength(0)
        expect(i.rows.has('moxir-hall-minimal')).toBe(true)
        const file = lines.find((l) => l.includes('put --file')).split('put --file ')[1]
        expect(path.dirname(file)).toBe(process.env.DI_VERSIONS_UNDO_DIR)
        await cli(i, '--production', SET, 'put', '--file', file)
        expect((await readList(i, SET)).entries[0]).toMatchObject({ id: 'minimal', status: 'candidate', projectId: 'moxir-hall-minimal' })
    })

    it('reads the list again and retries when it moved under the write (409)', async () => {
        const i = fakeInstall({ 'moxir-hall-minimal': { document: markedDoc({ set: SET, id: 'minimal', title: 'Minimal' }) } }, { refuseOps: 2 })
        const { r, lines } = await cli(i, 'register', 'moxir-hall-minimal')
        expect(r.status).toBe('written')
        expect(lines.filter((l) => l.includes('(409)'))).toHaveLength(2)
    })

    it('says so — never silence — when the install does not keep what was written', async () => {
        // an install whose schema throws the list's components away
        const real = (await import('./fakeInstall.testlib.mjs')).fakeInstall
        const { createRequire } = await import('node:module')
        const schema = createRequire(import.meta.url)('../../shared/projectSchema.cjs')
        const dropping = { ...schema, applyProjectOps: (doc, ops) => { const out = schema.applyProjectOps(doc, ops); out.entities = out.entities.map((e) => { const { productionVersion, ...c } = e.components; return { ...e, components: c } }); return out } }
        const i = real({ 'moxir-hall-minimal': { document: markedDoc({ set: SET, id: 'minimal', title: 'Minimal' }) } }, { server: dropping })
        await expect(cli(i, 'register', 'moxir-hall-minimal')).rejects.toThrow(/reads back wrong/)
    })

    it('a tool that just made a version lists it with its making; one already listed keeps its status', async () => {
        const i = install()
        const out = collect()
        const args = { client: i, api: API, space: 'moxir', production: SET, title: 'MOXIR 17.10', projectId: 'moxir-hall-full-ground', id: 'full-ground', tool: 'load-version.mjs', madeFrom: 'full', rig: { file: 'scripts/place/rigs/moxir-2026-10-17-full-ground.json', blob: 'a'.repeat(40) }, log: out.log }
        await recordMadeVersion(args)
        let [v] = (await readList(i, SET)).entries
        expect(v).toMatchObject({ status: 'candidate', madeFrom: 'full', madeBy: { tool: 'load-version.mjs', install: 'dev.example' }, rig: { blob: 'a'.repeat(40) } })
        await cli(i, '--production', SET, 'set-status', 'full-ground', 'for-the-show')
        await recordMadeVersion({ ...args, rig: { ...args.rig, blob: 'b'.repeat(40) } })
        ;[v] = (await readList(i, SET)).entries
        expect(v).toMatchObject({ status: 'for-the-show', rig: { blob: 'b'.repeat(40) } })
    })

    it('a list write that fails after the version is made names the command that finishes it', async () => {
        const i = install()
        i.post = async () => ({ status: 500, ok: false, body: null, text: 'boom' })
        await expect(recordMadeVersion({ client: i, api: API, space: 'moxir', production: SET, projectId: 'moxir-hall-minimal', id: 'minimal', tool: 'load-version.mjs' }))
            .rejects.toThrow(/moxir-hall-minimal is made, but the version list .* finish it with: node scripts\/production\/versions\.mjs .* register moxir-hall-minimal/s)
    })

    it('refuses unknown arguments before reading anything', async () => {
        const i = install()
        await expect(cli(i, '--dryrun', 'list')).rejects.toThrow(/unknown argument: --dryrun/)
    })
})
