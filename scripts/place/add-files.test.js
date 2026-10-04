import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { retryAfterSeconds, runAddFiles, planFiles, expandManifest, mediaIndex, provenanceMd, mimeOf, assetNameFor, sha256File } from './add-files.mjs'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'add-files-'))
const write = (rel, content) => {
    const full = path.join(tmp, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
    return full
}
const entryOf = (name, content, extra = {}) => {
    const abs = write(`e/${name}`, content)
    return { group: 'g', abs, rel: name, name, size: fs.statSync(abs).size, mtime: '2026-10-04', sha256: sha256File(abs), source: 'made by a tool', licence: 'private', note: '', ...extra }
}

// A stand-in for the server: project list, documents, uploads, ops; can refuse by name; can ignore `visibility`.
const fakeServer = ({ existing = null, refuse = {}, ignoreVisibility = false, siblings = {} } = {}) => {
    const log = { created: [], uploads: [], ops: [], order: [] }
    const projects = new Map()
    if (existing) projects.set(existing.id, { id: existing.id, visibility: existing.visibility, document: { assets: existing.assets || [], entities: [] } })
    for (const [id, assets] of Object.entries(siblings)) projects.set(id, { id, visibility: 'public', document: { assets, entities: [] } })
    const client = {
        get: async (route) => {
            if (route.endsWith('/projects')) return { ok: true, status: 200, body: { projects: [...projects.values()].map((p) => ({ id: p.id, ...(p.visibility === 'private' ? { visibility: 'private' } : {}) })) }, text: '' }
            const id = route.split('/')[3]
            const p = projects.get(id)
            return p ? { ok: true, status: 200, body: { version: 1, document: p.document }, text: '' } : { ok: false, status: 404, body: null, text: '' }
        },
        post: async (route, body) => {
            if (route.endsWith('/projects')) {
                log.created.push(body)
                log.order.push('create')
                projects.set(body.slug, { id: body.slug, visibility: ignoreVisibility ? 'public' : (body.visibility || 'public'), document: { assets: [], entities: [] } })
                return { ok: true, status: 200, body: { project: { id: body.slug } }, text: '' }
            }
            const id = route.split('/')[3]
            if (route.endsWith('/assets')) {
                const upload = body.get('asset')
                if (refuse[upload.name]) return { ok: false, status: refuse[upload.name], body: null, text: 'refused' }
                const bytes = Buffer.from(await upload.arrayBuffer())
                log.uploads.push({ name: upload.name, type: upload.type, text: upload.name === 'PROVENANCE.md' ? bytes.toString() : null })
                log.order.push(`up:${upload.name}`)
                const { createHash } = await import('node:crypto')
                return { ok: true, status: 200, body: { asset: { id: createHash('sha256').update(bytes).digest('hex'), name: upload.name, mimeType: upload.type, size: bytes.length, url: '/x' } }, text: '' }
            }
            log.ops.push(...body.ops)
            for (const op of body.ops) {
                const doc = projects.get(id).document
                if (op.type === 'upsertAsset') doc.assets.push(op.payload.asset)
                if (op.type === 'deleteAsset') doc.assets = doc.assets.filter((a) => a.id !== op.payload.assetId)
            }
            return { ok: true, status: 200, body: { newVersion: 2 }, text: '' }
        }
    }
    return { client, log, projects }
}
const quiet = { say: () => {}, warn: () => {} }

describe('add-files', () => {
    it('creates the project PRIVATE in the same request, before any upload', async () => {
        const server = fakeServer()
        await runAddFiles({ client: server.client, space: 'moxir', projectId: 'moxir-documents', title: 'T', entries: [entryOf('a.pdf', 'pdf one')], createPrivate: true, ...quiet })
        expect(server.log.created).toEqual([{ slug: 'moxir-documents', title: 'T', visibility: 'private' }])
        expect(server.log.order[0]).toBe('create')
        expect(server.log.order[1]).toBe('up:a.pdf')
    })

    it('uploads NOTHING when the server reads the new project back as public', async () => {
        const server = fakeServer({ ignoreVisibility: true })
        let died = false
        const exit = process.exit
        process.exit = () => { died = true; throw new Error('exit') }
        try { await runAddFiles({ client: server.client, space: 'moxir', projectId: 'p', entries: [entryOf('a.pdf', 'x')], createPrivate: true, ...quiet }) } catch { /* exit */ }
        process.exit = exit
        expect(died).toBe(true)
        expect(server.log.uploads).toEqual([])
    })

    it('refuses to write into an existing PUBLIC project', async () => {
        const server = fakeServer({ existing: { id: 'p', visibility: 'public' } })
        let died = false
        const exit = process.exit
        process.exit = () => { died = true; throw new Error('exit') }
        try { await runAddFiles({ client: server.client, space: 'moxir', projectId: 'p', entries: [entryOf('b.pdf', 'y')], ...quiet }) } catch { /* exit */ }
        process.exit = exit
        expect(died).toBe(true)
        expect(server.log.uploads).toEqual([])
    })

    it('puts every kind in as an ASSET with its real type, and writes no entity', async () => {
        const server = fakeServer()
        const names = ['a.pdf', 'b.csv', 'c.md', 'd.mvr', 'e.glb', 'f.mp4', 'g.html']
        await runAddFiles({ client: server.client, space: 'moxir', projectId: 'p', entries: names.map((n) => entryOf(n, `content of ${n}`)), createPrivate: true, ...quiet })
        const types = Object.fromEntries(server.log.uploads.map((u) => [u.name, u.type]))
        expect(types['a.pdf']).toBe('application/pdf')
        expect(types['b.csv']).toBe('text/plain')
        expect(types['e.glb']).toBe('model/gltf-binary')
        expect(types['d.mvr']).toBe('application/zip')
        expect(server.log.ops.every((o) => o.type === 'upsertAsset' || o.type === 'deleteAsset')).toBe(true)
        expect(server.log.ops.some((o) => o.type === 'createEntity')).toBe(false)
        expect(server.projects.get('p').document.assets.map((a) => a.name)).toEqual(expect.arrayContaining(names))
    })

    it('skips by name when already there, and by sha256 when a sibling project holds the bytes', async () => {
        const have = entryOf('a.pdf', 'same')
        const server = fakeServer({
            existing: { id: 'p', visibility: 'private', assets: [{ id: 'z', name: 'a.pdf', size: 4 }] },
            siblings: { other: [{ id: have.sha256.replace(/^./, (c) => c), name: 'orig.pdf', size: 4 }] }
        })
        const dupe = entryOf('b.pdf', 'same')
        const fresh = entryOf('c.pdf', 'new bytes')
        const result = await runAddFiles({ client: server.client, space: 'moxir', projectId: 'p', entries: [have, dupe, fresh], dedupeSpace: true, ...quiet })
        expect(result.plan.present.map((e) => e.name)).toEqual(['a.pdf'])
        expect(result.plan.duplicate.map((e) => e.name)).toEqual(['b.pdf'])
        expect(server.log.uploads.map((u) => u.name)).toEqual(['c.pdf', 'PROVENANCE.md'])
    })

    it('refuses a file over the size line by name, size and reason, without trying it', () => {
        const big = entryOf('big.mp4', 'x'.repeat(50))
        const plan = planFiles([big], { maxBytes: 10 })
        expect(plan.fresh).toEqual([])
        expect(plan.refused[0]).toMatchObject({ name: 'big.mp4', size: 50, status: 413 })
        expect(plan.refused[0].reason).toMatch(/100 MB|line/)
    })

    it('reports a server refusal (415) by name and size, keeps going, and lists it in PROVENANCE.md', async () => {
        const server = fakeServer({ refuse: { 'pano.png': 415 } })
        const result = await runAddFiles({ client: server.client, space: 'moxir', projectId: 'p', createPrivate: true, entries: [entryOf('pano.png', 'p'.repeat(20)), entryOf('ok.csv', 'a,b')], ...quiet })
        expect(result.refused).toHaveLength(1)
        expect(result.refused[0]).toMatchObject({ name: 'pano.png', size: 20, status: 415 })
        const prov = server.log.uploads.find((u) => u.name === 'PROVENANCE.md').text
        expect(prov).toMatch(/pano\.png.*REFUSED HTTP 415/)
        expect(server.log.uploads.map((u) => u.name)).toContain('ok.csv')
    })

    it('PROVENANCE.md goes in LAST and lists every file with its sha256, path, source and licence', async () => {
        const server = fakeServer()
        const a = entryOf('a.pdf', 'aaa', { source: "maker's website", licence: "maker's copyright" })
        const b = entryOf('b.csv', 'bbb')
        await runAddFiles({ client: server.client, space: 'moxir', projectId: 'p', createPrivate: true, entries: [a, b], ...quiet })
        expect(server.log.order.at(-1)).toBe('up:PROVENANCE.md')
        expect(server.log.uploads.at(-1).type).toBe('text/plain') // text/markdown is refused by the server (400)
        const prov = server.log.uploads.at(-1).text
        for (const e of [a, b]) {
            expect(prov).toContain(e.sha256)
            expect(prov).toContain(e.abs)
        }
        expect(prov).toContain("maker's copyright")
        expect(prov).toMatch(/Private/)
    })

    it('a second run replaces the old PROVENANCE.md instead of stacking another', async () => {
        const server = fakeServer()
        const args = { client: server.client, space: 'moxir', projectId: 'p', createPrivate: true, ...quiet }
        await runAddFiles({ ...args, entries: [entryOf('a.csv', '1')] })
        await runAddFiles({ ...args, entries: [entryOf('a.csv', '1'), entryOf('b.csv', '2')] })
        const names = server.projects.get('p').document.assets.map((x) => x.name)
        expect(names.filter((n) => n === 'PROVENANCE.md')).toHaveLength(1)
        expect(names.filter((n) => n === 'a.csv')).toHaveLength(1)
    })

    it('--dry-run changes nothing: no project, no upload, no op', async () => {
        const server = fakeServer()
        const result = await runAddFiles({ client: server.client, space: 'moxir', projectId: 'p', createPrivate: true, dryRun: true, entries: [entryOf('a.pdf', 'q')], ...quiet })
        expect(server.log.created).toEqual([])
        expect(server.log.uploads).toEqual([])
        expect(server.log.ops).toEqual([])
        expect(result.dryRun).toBe(true)
        expect(result.provenance).toContain('a.pdf')
    })

    it('a read-back that misses an uploaded file is reported', async () => {
        const server = fakeServer()
        const orig = server.client.post
        server.client.post = async (route, body) => {
            const r = await orig(route, body)
            if (body?.ops) server.projects.get('p').document.assets = [] // the server loses them
            return r
        }
        const result = await runAddFiles({ client: server.client, space: 'moxir', projectId: 'p', createPrivate: true, entries: [entryOf('a.csv', '1')], ...quiet })
        expect(result.missing).toContain('a.csv')
    })
})

describe('add-files rate limit', () => {
    it('waits the time the server names on HTTP 429, then uploads the same file', async () => {
        const server = fakeServer()
        const orig = server.client.post
        let hits = 0
        server.client.post = async (route, body) => {
            if (route.endsWith('/assets') && body.get('asset').name === 'a.csv' && hits++ < 2) {
                return { ok: false, status: 429, body: null, text: '{"error":"Too many uploads from this session — retry in 509s."}' }
            }
            return orig(route, body)
        }
        const waits = []
        const result = await runAddFiles({ client: server.client, space: 'moxir', projectId: 'p', createPrivate: true, entries: [entryOf('a.csv', '1')], sleep: async (ms) => { waits.push(ms) }, ...quiet })
        expect(waits).toEqual([511000, 511000])
        expect(result.refused).toEqual([])
        expect(server.log.uploads.map((u) => u.name)).toContain('a.csv')
    })

    it('gives up after the tries and reports the 429 by name', async () => {
        const server = fakeServer({ refuse: { 'a.csv': 429 } })
        const result = await runAddFiles({ client: server.client, space: 'moxir', projectId: 'p', createPrivate: true, entries: [entryOf('a.csv', '1')], sleep: async () => {}, ...quiet })
        expect(result.refused[0]).toMatchObject({ name: 'a.csv', status: 429 })
    })

    it('reads the seconds out of the server message', () => {
        expect(retryAfterSeconds('{"error":"Too many uploads from this session — retry in 509s."}')).toBe(509)
        expect(retryAfterSeconds('nope')).toBeNull()
    })
})

describe('add-files helpers', () => {
    it('expands a manifest: prefix, include and exclude rules, sha256, and reports a missing folder', () => {
        write('m/one/a.csv', 'a')
        write('m/one/skip.png', 'p')
        write('m/one/sub/b.md', 'b')
        const { entries, missing, excluded } = expandManifest({ groups: [
            { id: 'one', dir: path.join(tmp, 'm/one'), prefix: 'x', include: ['\\.(csv|md)$'], source: 's', licence: 'l' },
            { id: 'gone', dir: path.join(tmp, 'm/nope'), prefix: 'y' }
        ] })
        expect(entries.map((e) => e.name)).toEqual(['x--a.csv', 'x--sub__b.md'])
        expect(entries[0].sha256).toMatch(/^[0-9a-f]{64}$/)
        expect(missing.map((m) => m.group)).toEqual(['gone'])
        expect(excluded).toHaveLength(1)
    })

    it('names a file by prefix and flattened path so two folders can both hold a patch.csv', () => {
        expect(assetNameFor({ prefix: 'a' }, path.join('d', 'patch.csv'))).toBe('a--d__patch.csv')
        expect(assetNameFor({}, 'x.csv')).toBe('x.csv')
    })

    it('two different files with one name in a run are not both uploaded', () => {
        const plan = planFiles([entryOf('same.csv', '1'), entryOf('same.csv', '2')])
        expect(plan.fresh).toHaveLength(1)
        expect(plan.refused).toHaveLength(1)
    })

    it('indexes the makers\' pages by sha256 from media.json', () => {
        const index = mediaIndex({ items: { hazer: { media: [{ sha256: 'abc', maker: 'MDG', title: 'T', kind: 'manual', page: 'https://m', fetched: '2026-09-28' }] } } })
        expect(index.get('abc')).toMatchObject({ maker: 'MDG', page: 'https://m' })
    })

    it('declares only types the server takes (mirror of serverXR/src/index.js isAllowedUpload) for every kind in the manifest', () => {
        const prefixes = ['image/', 'video/', 'audio/', 'model/']
        const types = new Set(['application/json', 'application/octet-stream', 'application/pdf', 'application/zip', 'application/x-zip-compressed', 'application/gzip', 'text/plain'])
        const extensions = new Set(['.exr', '.glb', '.gltf', '.obj', '.mtl', '.png', '.jpg', '.mp4'])
        for (const name of ['a.pdf', 'a.csv', 'a.md', 'a.html', 'a.mvr', 'a.gdtf', 'a.glb', 'a.mp4', 'a.json', 'a.log', 'a.out', 'a.exr', 'a.mg', 'a.png', 'a.jpg', 'a.txt', 'a.obj', 'a.mtl']) {
            const mime = mimeOf(name)
            const ok = prefixes.some((p) => mime.startsWith(p)) || (types.has(mime) && (mime !== 'application/octet-stream' || extensions.has(path.extname(name))))
            expect(ok, `${name} as ${mime}`).toBe(true)
        }
    })

    it('knows the real type of each kind', () => {
        expect(mimeOf('x.PDF')).toBe('application/pdf')
        expect(mimeOf('x.unknown')).toBe('application/octet-stream')
        expect(provenanceMd({ project: 'p', space: 's', date: 'd', plan: { fresh: [], present: [], duplicate: [], refused: [] } })).toContain('| file |')
    })
})
