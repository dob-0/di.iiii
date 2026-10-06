import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { run, PRODUCTION } from './build-moxir-versions.mjs'
import { readList } from './versionList.mjs'
import { run as runVersions } from './versions.mjs'
import { fakeInstall, markedDoc } from './fakeInstall.testlib.mjs'

process.env.DI_VERSIONS_UNDO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'versions-undo-'))

const SET = PRODUCTION
const API = 'https://dev.example/serverXR'
const LOAD = 'scripts/place/rigs/moxir-versions-2026-10-17.json — scripts/rigbuild/load-version.mjs'
const v = (id, title, extra = {}) => ({ set: SET, id, title, source: LOAD, ...extra })
const copyOf = (id) => ({ projectId: `moxir-hall-${id}`, id, label: 'old hall 09-29' })
const OLDHALL = ['minimal', 'minimal-cut-movers', 'minimal-halo', 'minimal-halo-heads', 'minimal-xflat', 'minimal-xflat-heads']
const LIVE = ['minimal', 'minimal-cut-movers', 'minimal-halo', 'minimal-halo-heads', 'minimal-xflat', 'minimal-xflat-heads', 'minimal-ground', 'full-ground']

/** dev's moxir space as the coordinator measured it on 2026-10-04: 22 projects. */
const moxirOnDev = (overrides = {}) => {
    const projects = {
        'moxir-hall': { document: markedDoc(v('ordered', 'As ordered — the rig of the 27.09 order')), meta: { state: 'archived' } },
        'moxir-hall-full': { document: markedDoc(v('full', 'Full — the whole list')), meta: { state: 'archived' } },
        'moxir-hall-middle': { document: markedDoc(v('middle', 'Middle — the line')) },
        ...Object.fromEntries(LIVE.map((id) => [`moxir-hall-${id}`, { document: markedDoc(v(id, `${id} — words`)) }])),
        ...Object.fromEntries(OLDHALL.map((id) => [`moxir-hall-${id}-oldhall-0929`, { document: markedDoc(v(`${id}-oldhall-0929`, `${id} · old hall 09-29`, { copyOf: copyOf(id) })) }])),
        // brought from PONYO with copy-version --from-api: from == to, so the mark says it is a copy of itself
        'moxir-hall-known-full': { document: markedDoc(v('known-full', 'Known · full', { copyOf: { projectId: 'moxir-hall-known-full', id: 'known-full', label: 'PONYO 10-04' } })) },
        'moxir-hall-known-ground': { document: markedDoc(v('known-ground', 'Known · ground', { copyOf: { projectId: 'moxir-hall-known-ground', id: 'known-ground', label: 'PONYO 10-04' } })) },
        'moxir-sources': { document: markedDoc(null), meta: { visibility: 'private' } },
        'moxir-brief': { document: markedDoc(null), meta: { visibility: 'private' } },
        'moxir-truss': { document: markedDoc(null) },
        ...overrides
    }
    return fakeInstall(projects)
}
const build = async (i, ...argv) => { const lines = []; const r = await run(['--api', API, ...argv], { client: i, log: (l) => lines.push(String(l)) }); return { r, lines } }

describe('build-moxir-versions: MOXIR\'s list, derived from what its projects say', () => {
    it('--dry-run reads only, and shows every entry it would write', async () => {
        const i = moxirOnDev()
        const { r, lines } = await build(i, '--dry-run')
        expect(r.status).toBe('dry-run')
        expect(i.writes).toHaveLength(0)
        expect(lines[0]).toMatch(/22 projects read; 19 versions of moxir-2026-10-17/)
        expect(lines.filter((l) => l.startsWith('  not a version:'))).toHaveLength(3)
    })

    it('lists every version with the agreed status, and chooses NONE for the show (owner: "I want to see all first")', async () => {
        const i = moxirOnDev()
        await build(i)
        const list = await readList(i, SET)
        const status = Object.fromEntries(list.entries.map((e) => [e.projectId, e.status]))
        for (const id of LIVE) expect(status[`moxir-hall-${id}`]).toBe('candidate')
        for (const id of OLDHALL) expect(status[`moxir-hall-${id}-oldhall-0929`]).toBe('kept-copy')
        expect(status['moxir-hall']).toBe('archived') // its project says archived
        expect(status['moxir-hall-full']).toBe('archived')
        expect(status['moxir-hall-middle']).toBe('candidate')
        expect(status['moxir-hall-known-full']).toBe('candidate') // came from another install, not a kept copy
        expect(status['moxir-hall-known-ground']).toBe('candidate')
        expect(list.entries.some((e) => e.status === 'for-the-show')).toBe(false)
        expect(list.entries).toHaveLength(19)
        expect(list.production).toMatchObject({ id: SET, title: 'MOXIR 17.10', space: 'moxir', codeList: 'scripts/place/rigs/moxir-versions-2026-10-17.json' })
        expect(list.problems).toEqual([])
    })

    it('records where each came from — by the projects\' marks and the code\'s versions file, nothing guessed', async () => {
        const i = moxirOnDev()
        await build(i)
        const by = Object.fromEntries((await readList(i, SET)).entries.map((e) => [e.id, e]))
        expect(by['minimal-xflat-oldhall-0929']).toMatchObject({ madeFrom: 'minimal-xflat', madeBy: { tool: 'copy-version.mjs', machine: null, commit: null } })
        expect(by['minimal-xflat'].madeFrom).toBe('minimal') // candidateOf in the versions file
        expect(by['minimal-halo'].madeFrom).toBe('minimal') // a variant's `of`
        expect(by['known-full'].madeFrom).toBe('full')
        expect(by['known-full'].madeBy.install).toMatch(/another install — the copy's label: "PONYO 10-04"/)
        expect(by.minimal.madeBy.tool).toBe('load-version.mjs')
        expect(by.minimal.rig).toEqual({ file: 'scripts/place/rigs/moxir-2026-10-17-minimal.json', blob: null }) // in git, not pinned
        expect(by.ordered.rig.file).toBe('scripts/place/rigs/moxir-2026-10-17.json')
        expect(by.minimal.madeAt).toBe('2026-09-30T00:00:00.000Z') // the install's createdAt, and the note says so
        expect(by.minimal.note).toMatch(/first held the project/)
        expect(by.minimal.listed.by.tool).toBe('build-moxir-versions.mjs')
        expect(by.minimal.fingerprint).toMatch(/^sha256:/)
    })

    it('a second run adds only what is missing and leaves the owner\'s statuses alone', async () => {
        const i = moxirOnDev()
        await build(i)
        const writes = i.writes.length
        const { r } = await build(i)
        expect(r.status).toBe('nothing')
        expect(i.writes.length).toBe(writes)
        // the owner chooses; a version is made later; the build runs again
        await runVersions(['--api', API, '--production', SET, 'set-status', 'minimal-ground', 'for-the-show'], { client: i, log: () => {} })
        i.rows.set('moxir-hall-late', { space: 'moxir', version: 1, document: markedDoc(v('late', 'Late')), meta: { state: 'live', title: 'late', createdAt: 0 } })
        const again = await build(i)
        expect(again.r.added.map((e) => e.id)).toEqual(['late'])
        const by = Object.fromEntries((await readList(i, SET)).entries.map((e) => [e.id, e.status]))
        expect(by['minimal-ground']).toBe('for-the-show')
        expect(by.late).toBe('candidate')
    })

    it('refuses, writing nothing, when an old-hall copy lost the mark that says what it copies', async () => {
        const i = moxirOnDev({ 'moxir-hall-minimal-oldhall-0929': { document: markedDoc(v('minimal-oldhall-0929', 'Minimal · old hall')) } })
        await expect(build(i)).rejects.toThrow(/moxir-hall-minimal-oldhall-0929 should be a kept copy.*--adopt/s)
        expect(i.writes).toHaveLength(0)
    })

    it('refuses, writing nothing, when two projects claim one version', async () => {
        const i = moxirOnDev({ 'moxir-hall-minimal-2': { document: markedDoc(v('minimal', 'Minimal again')) } })
        await expect(build(i)).rejects.toThrow(/version id "minimal" is claimed by 2 projects/)
        expect(i.writes).toHaveLength(0)
    })

    it('refuses unknown arguments', async () => {
        await expect(build(moxirOnDev(), '--dryrun')).rejects.toThrow(/unknown argument/)
    })
})
