import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { compareVersions, parseAuditArgs, run } from './versions-audit.mjs'
import { run as build } from './build-moxir-versions.mjs'
import { run as versions } from './versions.mjs'
import { fakeInstall, markedDoc } from './fakeInstall.testlib.mjs'

process.env.DI_VERSIONS_UNDO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'versions-undo-'))

const SET = 'moxir-2026-10-17'
const quiet = { log: () => {} }
const v = (id, extra = {}) => ({ set: SET, id, title: `${id} — words`, ...extra })
const space = () => ({
    'moxir-hall-minimal': { document: markedDoc(v('minimal')) },
    'moxir-hall-full-ground': { document: markedDoc(v('full-ground')) },
    'moxir-hall-minimal-oldhall-0929': { document: markedDoc(v('minimal-oldhall-0929', { copyOf: { projectId: 'moxir-hall-minimal', id: 'minimal', label: 'old' } })) },
    'moxir-sources': { document: markedDoc(null) }
})
/** dev, and a local install that follows it: the same projects; the list built on dev and carried. */
const pair = async () => {
    const dev = fakeInstall(space())
    await build(['--api', 'https://dev.example/serverXR'], { client: dev, ...quiet })
    const local = fakeInstall(space())
    for (const [id, row] of dev.rows) if (id.endsWith('-versions')) local.rows.set(id, structuredClone(row))
    return { dev, local }
}
const audit = async (clients, extra = []) => {
    const lines = []
    const r = await run(['--production', SET, ...Object.keys(clients).flatMap((n) => ['--side', `${n}=https://${n}.example/serverXR`]), ...extra], { clients, log: (l) => lines.push(String(l)) })
    return { ...r, text: lines.join('\n') }
}
const touch = (install, id) => {
    const row = install.rows.get(id)
    row.document = { ...row.document, entities: [...row.document.entities, { id: `rig-new-${Math.random()}`, type: 'box', name: 'a lamp', components: {} }] }
}

describe('versions-audit: does every copy of the production agree?', () => {
    it('exit 0 when dev, the local install and git agree — said by name', async () => {
        const { dev, local } = await pair()
        const r = await audit({ dev, local }, ['--no-git'])
        expect(r.exit).toBe(0)
        expect(r.text).toMatch(/✓ minimal — words \(minimal · moxir-hall-minimal, candidate\): same on dev and local/)
        expect(r.text).toMatch(/the list is the same on dev and local/)
        expect(r.text).toMatch(/All agree: dev and local\./)
    })

    it('a version whose work differs between installs: exit 1, named', async () => {
        const { dev, local } = await pair()
        touch(local, 'moxir-hall-full-ground')
        const r = await audit({ dev, local }, ['--no-git'])
        expect(r.exit).toBe(1)
        expect(r.mismatches).toEqual([expect.stringMatching(/^full-ground — words \(full-ground · moxir-hall-full-ground, candidate\): differs — dev [0-9a-f]{12} ≠ local [0-9a-f]{12}$/)])
    })

    it('a version missing on one install', async () => {
        const { dev, local } = await pair()
        local.rows.delete('moxir-hall-minimal-oldhall-0929')
        const r = await audit({ dev, local }, ['--no-git'])
        expect(r.exit).toBe(1)
        expect(r.mismatches[0]).toMatch(/minimal-oldhall-0929 .*: missing on local/)
    })

    it('a version of the production that is not in the list', async () => {
        const { dev, local } = await pair()
        for (const i of [dev, local]) i.rows.set('moxir-hall-stray', { space: 'moxir', version: 1, document: markedDoc(v('stray')), meta: { state: 'live', title: 'stray' } })
        const r = await audit({ dev, local }, ['--no-git'])
        expect(r.mismatches).toEqual([
            'stray — words (stray · moxir-hall-stray) on dev is a version of moxir-2026-10-17 but not in its list',
            'stray — words (stray · moxir-hall-stray) on local is a version of moxir-2026-10-17 but not in its list'
        ])
    })

    it('the lists themselves disagree (a status changed on one side, not carried yet)', async () => {
        const { dev, local } = await pair()
        await versions(['--api', 'https://dev.example/serverXR', '--production', SET, 'set-status', 'minimal', 'for-the-show'], { client: dev, ...quiet })
        const r = await audit({ dev, local }, ['--no-git'])
        expect(r.exit).toBe(1)
        expect(r.mismatches).toEqual(['the lists disagree on "minimal": for-the-show on dev, candidate on local'])
    })

    it('an install with no list at all', async () => {
        const { dev } = await pair()
        const r = await audit({ dev, local: fakeInstall(space()) }, ['--no-git'])
        expect(r.mismatches).toContain('there is no version list on local')
    })

    it('the code in git: a version the versions file names but the list does not; a pinned rig file that moved', () => {
        const entry = (id, rig) => ({ id, projectId: `moxir-hall-${id}`, title: id, status: 'candidate', fingerprint: null, ...(rig ? { rig } : {}) })
        const sides = [{ name: 'dev', list: { exists: true, version: 3, entries: [entry('minimal', { file: 'a.json', blob: '1'.repeat(40) }), entry('known-full', { file: 'gone.json', blob: null })], problems: [] }, projects: { 'moxir-hall-minimal': { fingerprint: 'sha256:x' }, 'moxir-hall-known-full': { fingerprint: 'sha256:y' } } }]
        const spec = { set: SET, ordered: { id: 'ordered' }, versions: [{ id: 'minimal' }], variants: [], candidates: [{ id: 'middle-x', candidateOf: 'minimal' }] }
        const blobs = { 'a.json': '2'.repeat(40) }
        const r = compareVersions({ production: SET, sides, git: { spec, codeList: 'versions.json', blobOf: (f) => blobs[f] || null } })
        expect(r.mismatches).toEqual([
            '"ordered" is named in versions.json but is not in the list',
            '"middle-x" is named in versions.json but is not in the list',
            'minimal (minimal): a.json has changed in git since the version was made (1111111111 → 2222222222)',
            'known-full (known-full) was made from gone.json, which git does not hold'
        ])
    })

    it('against the real repo: the MOXIR list built from the versions file\'s own ids passes the git check', async () => {
        const spec = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../place/rigs/moxir-versions-2026-10-17.json'), 'utf8'))
        const ids = [spec.ordered.id, ...spec.versions, ...spec.variants, ...spec.candidates].map((x) => x.id ?? x)
        const projects = Object.fromEntries(ids.map((id) => [id === 'ordered' ? 'moxir-hall' : `moxir-hall-${id}`, { document: markedDoc(v(id)) }]))
        const dev = fakeInstall(projects)
        await build(['--api', 'https://dev.example/serverXR'], { client: dev, ...quiet })
        const r = await audit({ dev })
        expect(r.text).toMatch(/✓ every version the code names is listed, every rig file listed is in git/)
        expect(r.exit).toBe(0)
    })

    it('a version edited since it was listed — on every install alike — is a note, not a mismatch', async () => {
        const { dev, local } = await pair()
        touch(dev, 'moxir-hall-minimal')
        local.rows.get('moxir-hall-minimal').document = structuredClone(dev.rows.get('moxir-hall-minimal').document)
        const r = await audit({ dev, local }, ['--no-git'])
        expect(r.exit).toBe(0)
        expect(r.notes[0]).toMatch(/^minimal — words: edited since it was listed/)
    })

    it('an install that cannot be read is exit 2, never a pass', async () => {
        const broken = { get: async () => ({ status: 503, ok: false, body: null, text: 'down' }) }
        await expect(audit({ dev: broken }, ['--no-git'])).rejects.toMatchObject({ exit: 2 })
    })

    it('reads repeatable --side and --token', () => {
        expect(parseAuditArgs(['--production', SET, '--side', 'dev=https://d/serverXR/', '--token', 'dev=/t', '--side', 'local=https://l/s'])).toMatchObject({
            production: SET, sides: [{ name: 'dev', api: 'https://d/serverXR' }, { name: 'local', api: 'https://l/s' }], tokens: { dev: '/t' }, stray: []
        })
    })
})
