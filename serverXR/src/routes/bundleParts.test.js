// @vitest-environment node
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { registerBundleParts } from './bundleParts.js'

// The route handlers called directly through a fake router, with the disk
// reading (statfs) and the clock injected: expiry, free-space refusal, who owns
// an upload, and that parts are deleted while joining.
let dir
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

const setup = (options = {}, importBundleFile = async () => {}) => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'di-parts-unit-'))
    const handlers = {}
    const router = {}
    for (const verb of ['get', 'post', 'put', 'delete']) router[verb] = (route, handler) => { handlers[`${verb} ${route}`] = handler }
    const api = registerBundleParts(router, {
        config: { directories: { uploadsDir: dir }, maxBundleBytes: 8 * 1024 ** 3, bundlePartBytes: 4 },
        mayOpenAFile: () => true, importBundleFile, normalizeSpaceId: (x) => x, ...options
    })
    return { handlers, api, root: path.join(dir, 'bundle-parts') }
}
const respond = () => {
    const res = { code: 200, body: null, status(c) { res.code = c; return res }, json(b) { res.body = b; return res }, setHeader() {} }
    return res
}
const START = 'post /api/spaces/bundle/uploads'
const sha = (text) => createHash('sha256').update(text).digest('hex')
const startReq = (subject = 'u1', body = { size: 10, sha256: 'a'.repeat(64), name: 'x.diiii' }) => ({ authState: { type: 'session', subject }, body })

describe('bundle parts', () => {
    it('expiry: removes an upload older than the TTL and keeps a fresh one', async () => {
        const { api, root } = setup()
        const old = 'a'.repeat(32)
        const fresh = 'b'.repeat(32)
        for (const id of [old, fresh]) { fs.mkdirSync(path.join(root, id), { recursive: true }); fs.writeFileSync(path.join(root, id, 'part-000001'), 'x') }
        const past = new Date(Date.now() - 25 * 3600 * 1000)
        fs.utimesSync(path.join(root, old), past, past)
        await api.sweep()
        expect(fs.existsSync(path.join(root, old))).toBe(false)
        expect(fs.existsSync(path.join(root, fresh))).toBe(true)
    })

    it('disk: refuses with 507 when free space is below 2 x size + margin, accepts when above', async () => {
        const gib = 1024 ** 3
        const free = (bytes) => async () => ({ bavail: bytes, bsize: 1 })
        const body = { size: 3 * gib, sha256: 'a'.repeat(64), name: 'x.diiii' }
        // needs 6 GiB + 1 GiB margin
        let { handlers } = setup({ statfs: free(7 * gib - 1) })
        let res = respond()
        await handlers[START](startReq('u1', body), res, (e) => { throw e })
        expect(res.code).toBe(507)
        expect(res.body.code).toBe('insufficient_storage')
        ;({ handlers } = setup({ statfs: free(7 * gib) }))
        res = respond()
        await handlers[START](startReq('u1', body), res, (e) => { throw e })
        expect(res.code).toBe(201)
    })

    it('owner: a login with no subject cannot start an upload, and another account cannot touch it', async () => {
        const { handlers } = setup({ statfs: async () => ({ bavail: 1e12, bsize: 1 }) })
        let res = respond()
        await handlers[START]({ authState: { type: 'session' }, body: { size: 10, sha256: 'a'.repeat(64), name: 'x.diiii' } }, res, (e) => { throw e })
        expect(res.code).toBe(403)
        res = respond()
        await handlers[START](startReq('alice'), res, (e) => { throw e })
        const id = res.body.uploadId
        for (const route of ['get /api/spaces/bundle/uploads/:id', 'delete /api/spaces/bundle/uploads/:id']) {
            res = respond()
            await handlers[route]({ authState: { type: 'session', subject: 'bob' }, params: { id } }, res, (e) => { throw e })
            expect(res.code).toBe(403)
        }
        // the same subject under another kind of login is not the same owner either
        res = respond()
        await handlers['get /api/spaces/bundle/uploads/:id']({ authState: { type: 'token', subject: 'alice' }, params: { id } }, res, (e) => { throw e })
        expect(res.code).toBe(403)
        res = respond()
        await handlers['get /api/spaces/bundle/uploads/:id']({ authState: { type: 'session', subject: 'alice' }, params: { id } }, res, (e) => { throw e })
        expect(res.code).toBe(200)
    })

    it('join: each part is deleted once copied, so at import time only the joined file is left', async () => {
        let seen = null
        const text = '0123456789'
        const { handlers, root } = setup({ statfs: async () => ({ bavail: 1e12, bsize: 1 }) }, async (req, res, joined) => {
            seen = { files: fs.readdirSync(path.dirname(joined)).sort(), content: fs.readFileSync(joined, 'utf8') }
            res.status(201).json({ spaceId: 'x' })
        })
        let res = respond()
        await handlers[START](startReq('u1', { size: 10, sha256: sha(text), name: 'x.diiii' }), res, (e) => { throw e })
        const id = res.body.uploadId
        for (const [n, piece] of [[1, '0123'], [2, '4567'], [3, '89']]) fs.writeFileSync(path.join(root, id, `part-00000${n}`), piece)
        res = respond()
        const req = { authState: { type: 'session', subject: 'u1' }, params: { id }, body: {} }
        await handlers['post /api/spaces/bundle/uploads/:id/finish'](req, res, (e) => { throw e })
        expect(res.code).toBe(202)
        let status
        for (let i = 0; i < 100 && status?.state !== 'done'; i += 1) {
            await new Promise((r) => setTimeout(r, 20))
            const got = respond()
            await handlers['get /api/spaces/bundle/uploads/:id'](req, got, (e) => { throw e })
            status = got.body
        }
        expect(status.state).toBe('done')
        expect(seen.content).toBe(text)
        expect(seen.files).toEqual(['joined.diiii', 'meta.json', 'status.json'])
        expect(fs.readdirSync(path.join(root, id)).sort()).toEqual(['meta.json', 'status.json'])
    })
})
