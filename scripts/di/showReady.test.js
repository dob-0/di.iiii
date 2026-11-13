// @vitest-environment node
//
// `di show-ready`: a fixture install on disk (a real sqlite file + spaces/ folder)
// and a mocked host. Nothing here touches the network or the real data folder.
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'

import { parseArgs } from './args.mjs'
import { checkShowReady, isLocalHost, readDocument, renderReport } from './showReady.mjs'

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cli.mjs')
const dirs = []
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }) })

const sha = (text) => crypto.createHash('sha256').update(text).digest('hex')
const HOST = 'https://dev.diiii.xyz'

// projects: [{ id, visibility, doc?, assets: [{ text, legacy?, size? }] }]
const makeData = (projects) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'di-showready-'))
    dirs.push(dir)
    const db = new DatabaseSync(path.join(dir, 'di.db'))
    db.exec(`CREATE TABLE spaces (id TEXT PRIMARY KEY);
      CREATE TABLE projects (id TEXT PRIMARY KEY, space_id TEXT, title TEXT, created_at INTEGER DEFAULT 0, deleted_at INTEGER, visibility TEXT DEFAULT 'public');
      INSERT INTO spaces VALUES ('show');`)
    const ids = {}
    for (const p of projects) {
        db.prepare('INSERT INTO projects (id, space_id, title, visibility) VALUES (?, ?, ?, ?)').run(p.id, 'show', p.title || p.id, p.visibility || 'public')
        const pdir = path.join(dir, 'spaces', 'show', 'projects', p.id)
        fs.mkdirSync(path.join(pdir, 'assets'), { recursive: true })
        const refs = []
        ;(p.assets || []).forEach((a, n) => {
            const id = a.id || sha(a.text)
            ids[`${p.id}:${n}`] = id
            refs.push({ assetId: id })
            if (a.skipBytes) return
            if (a.legacy) fs.writeFileSync(path.join(pdir, 'assets', id), a.text)
            else { fs.mkdirSync(path.join(dir, 'spaces', 'show', 'blobs'), { recursive: true }); fs.writeFileSync(path.join(dir, 'spaces', 'show', 'blobs', id), a.text) }
            fs.writeFileSync(path.join(pdir, 'assets', `${id}.json`), JSON.stringify({ id, size: a.size ?? Buffer.byteLength(a.text) }))
        })
        fs.writeFileSync(path.join(pdir, 'document.json'), JSON.stringify(p.doc || { nodes: refs, note: p.note || '' }))
    }
    db.close()
    return { dir, ids }
}

// A host: cloudProjects = [{id, visibility}], cloudAssets = Set of "project/id" -> size
const mockHost = ({ projects = [], assets = {}, status = 200, down = false, listStatus = 200, listBody = { error: 'x' } } = {}) => async (url) => {
    if (down) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } })
    const u = new URL(url)
    const reply = (code, body) => ({ status: code, json: async () => body })
    if (/\/api\/spaces\/show\/projects$/.test(u.pathname)) return listStatus === 200 ? reply(200, { projects }) : reply(listStatus, listBody)
    const m = u.pathname.match(/\/api\/projects\/([^/]+)\/assets\/([a-f0-9]{64})\/meta$/)
    if (m && assets[`${m[1]}/${m[2]}`] !== undefined) return reply(200, { ok: true, asset: { id: m[2], size: assets[`${m[1]}/${m[2]}`] } })
    return reply(404, { error: 'Asset not found.' })
}

const run = (data, extra = {}) => checkShowReady({ dataDir: data.dir, space: 'show', host: HOST, token: 'SECRET-TOKEN', ...extra })

describe('show-ready', () => {
    it('is ready (exit 0) when everything is here, in the cloud, and offline-proof', async () => {
        const data = makeData([{ id: 'p1', assets: [{ text: 'aaa' }, { text: 'bbb', legacy: true }] }])
        const id0 = data.ids['p1:0'], id1 = data.ids['p1:1']
        const r = await run(data, { fetchImpl: mockHost({ projects: [{ id: 'p1', visibility: 'public' }], assets: { [`p1/${id0}`]: 3, [`p1/${id1}`]: 3 } }) })
        expect(r.exit).toBe(0)
        expect(r.ok).toEqual({ projects: 1, assets: 2 })
        expect(renderReport(r)).toContain('READY:')
    })

    it('flags a private project that is absent in the cloud as only on this machine (exit 1)', async () => {
        const data = makeData([{ id: 'nopa', visibility: 'private' }, { id: 'p1' }])
        const r = await run(data, { fetchImpl: mockHost({ projects: [{ id: 'p1', visibility: 'public' }] }) })
        expect(r.exit).toBe(1)
        expect(r.onlyHere).toEqual([expect.stringContaining('show/nopa (private): only on this machine')])
        expect(renderReport(r)).toContain('ONLY HERE')
    })

    it('flags a project only in the cloud, and not when one project was asked for', async () => {
        const data = makeData([{ id: 'p1' }])
        const fetchImpl = mockHost({ projects: [{ id: 'p1', visibility: 'public' }, { id: 'extra', visibility: 'public' }] })
        expect((await run(data, { fetchImpl })).onlyCloud).toEqual([expect.stringContaining('show/extra')])
        expect((await run(data, { fetchImpl, project: 'p1' })).onlyCloud).toEqual([])
    })

    it('flags a visibility that differs: private here, public there', async () => {
        const data = makeData([{ id: 'p1', visibility: 'private' }])
        const r = await run(data, { fetchImpl: mockHost({ projects: [{ id: 'p1', visibility: 'public' }] }) })
        expect(r.exit).toBe(1)
        expect(r.different[0]).toMatch(/private here but public in the cloud/)
    })

    it('flags an asset that is missing on disk, damaged, wrongly sized, or absent in the cloud', async () => {
        const data = makeData([{ id: 'p1', assets: [
            { text: 'gone', skipBytes: true },
            { text: 'real', id: sha('other') },       // bytes do not match the hash
            { text: 'abc', size: 99 },               // reference says another size
            { text: 'local only' }
        ] }])
        const r = await run(data, { fetchImpl: mockHost({ projects: [{ id: 'p1', visibility: 'public' }] }) })
        const text = renderReport(r)
        expect(text).toMatch(/bytes are not on this machine/)
        expect(text).toMatch(/damaged/)
        expect(text).toMatch(/wrong size/)
        expect(r.onlyHere.some((l) => /only on this machine, not in the cloud/.test(l))).toBe(true)
        expect(r.exit).toBe(1)
    })

    it('flags an asset whose size differs in the cloud', async () => {
        const data = makeData([{ id: 'p1', assets: [{ text: 'aaa' }] }])
        const r = await run(data, { fetchImpl: mockHost({ projects: [{ id: 'p1', visibility: 'public' }], assets: { [`p1/${data.ids['p1:0']}`]: 7 } }) })
        expect(r.different[0]).toMatch(/differs in size \(here 3, cloud 7\)/)
    })

    it('flags every outside address as needing internet, and lets local and namespace addresses pass', async () => {
        const doc = { a: 'http://localhost:8090/x', b: 'https://cdn.example.com/lib.js', c: 'http://show.diiii.localhost/p', d: '<svg xmlns="http://www.w3.org/2000/svg"/>', e: `${HOST}/serverXR/api/x` }
        const data = makeData([{ id: 'p1', doc }])
        const r = await run(data, { fetchImpl: mockHost({ projects: [{ id: 'p1', visibility: 'public' }] }) })
        expect(r.needsInternet).toEqual([expect.stringContaining('cdn.example.com')])
        expect(r.exit).toBe(1)
    })

    it('exits 2 when the host cannot be reached, 2 when there is no login', async () => {
        const data = makeData([{ id: 'p1' }])
        const down = await run(data, { fetchImpl: mockHost({ down: true }) })
        expect(down.exit).toBe(2)
        expect(renderReport(down)).toMatch(/CLOUD NOT REACHED: .*ENOTFOUND/)
        expect((await run(data, { token: '', fetchImpl: mockHost({ projects: [] }) })).exit).toBe(2)
        expect((await run(data, { fetchImpl: mockHost({ listStatus: 401 }) })).exit).toBe(2)
    })

    it('uses the follow key when the login is refused, and never prints either', async () => {
        const data = makeData([{ id: 'p1' }])
        const seen = []
        const inner = mockHost({ projects: [{ id: 'p1', visibility: 'public' }] })
        const fetchImpl = async (url, init) => {
            const auth = init.headers.authorization
            seen.push(auth)
            if (auth !== 'Bearer FOLLOW-KEY') return { status: 403, json: async () => ({ error: 'Space access denied.' }) }
            return inner(url, init)
        }
        const r = await run(data, { token: ['FOLLOW-KEY', 'LOGIN-TOKEN'], fetchImpl })
        expect(r.exit).toBe(0)
        const refusedFirst = await run(data, { token: ['LOGIN-TOKEN', 'FOLLOW-KEY'], fetchImpl })
        expect(refusedFirst.exit).toBe(0)
        expect(seen).toContain('Bearer LOGIN-TOKEN')
        expect(renderReport(r) + JSON.stringify(r)).not.toMatch(/FOLLOW-KEY|LOGIN-TOKEN/)
    })

    it('says the space is only here when the host has never heard of it', async () => {
        const data = makeData([{ id: 'p1' }])
        const r = await run(data, { fetchImpl: mockHost({ listStatus: 404 }) })
        expect(r.exit).toBe(1)
        expect(r.onlyHere[0]).toMatch(/the space is not in the cloud/)
    })

    it('treats "Space access denied" as only here, not as an unreachable cloud', async () => {
        const data = makeData([{ id: 'p1', visibility: 'private' }])
        const r = await run(data, { fetchImpl: mockHost({ listStatus: 403, listBody: { error: 'Space access denied.', requiredSpaceId: 'show' } }) })
        expect(r.exit).toBe(1)
        expect(r.onlyHere[0]).toMatch(/gives this login no access/)
    })

    it('fails for a space or project this machine does not have', async () => {
        const data = makeData([{ id: 'p1' }])
        expect((await checkShowReady({ dataDir: data.dir, space: 'nope', host: HOST, token: 't', fetchImpl: mockHost() })).fatal).toMatch(/not on this machine/)
        expect((await run(data, { project: 'zzz', fetchImpl: mockHost() })).fatal).toMatch(/not in space/)
    })

    it('never prints the token or file contents', async () => {
        const data = makeData([{ id: 'p1', assets: [{ text: 'TOP-SECRET-BYTES' }] }])
        const r = await run(data, { fetchImpl: mockHost({ projects: [] }) })
        const text = renderReport(r) + JSON.stringify(r)
        expect(text).not.toContain('SECRET-TOKEN')
        expect(text).not.toContain('TOP-SECRET-BYTES')
    })

    it('reads asset ids and addresses out of a document', () => {
        const id = 'a'.repeat(64), other = 'b'.repeat(64)
        const d = readDocument({ n: { assetId: id }, u: `/serverXR/api/projects/other/assets/${other}`, plain: id.replace(/a/g, 'c') }, 'p1')
        expect(d.assets).toEqual([{ project: 'p1', id }, { project: 'other', id: other }])
        expect(isLocalHost('x.diiii.localhost')).toBe(true)
        expect(isLocalHost('dev.diiii.xyz')).toBe(false)
    })
})

describe('di show-ready, the command', () => {
    it('takes --host and --json, and prints its usage', () => {
        expect(parseArgs(['show-ready', 'hayfilm', '--host', 'https://x.y', '--json'])).toEqual({ _: ['show-ready', 'hayfilm'], flags: { host: 'https://x.y', json: true } })
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-sr-home-'))
        dirs.push(home)
        const res = spawnSync(process.execPath, [CLI, 'show-ready', '--help'], { encoding: 'utf8', env: { ...process.env, DI_HOME: home, DI_NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
        expect(res.status).toBe(0)
        expect(res.stdout).toContain('show-ready SPACE [PROJECT]')
        expect(res.stdout).toContain('Exit 0')
    })

    it('without a space, says which space and exits 1', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-sr-home-'))
        dirs.push(home)
        const res = spawnSync(process.execPath, [CLI, 'show-ready'], { encoding: 'utf8', env: { ...process.env, DI_HOME: home, DI_NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
        expect(res.status).toBe(1)
        expect(res.stderr + res.stdout).toMatch(/which space/)
    })
})
