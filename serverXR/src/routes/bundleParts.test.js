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
    it('finish: two finishes at the same moment start one join, the other gets already_finishing', async () => {
        let imports = 0
        const text = '0123456789'
        const { handlers, root } = setup({ statfs: async () => ({ bavail: 1e12, bsize: 1 }) }, async (req, res) => {
            imports += 1
            res.status(201).json({ spaceId: 'x' })
        })
        let res = respond()
        await handlers[START](startReq('u1', { size: 10, sha256: sha(text), name: 'x.diiii' }), res, (e) => { throw e })
        const id = res.body.uploadId
        for (const [n, piece] of [[1, '0123'], [2, '4567'], [3, '89']]) fs.writeFileSync(path.join(root, id, `part-00000${n}`), piece)
        const req = { authState: { type: 'session', subject: 'u1' }, params: { id }, body: {} }
        const a = respond()
        const b = respond()
        await Promise.all([
            handlers['post /api/spaces/bundle/uploads/:id/finish'](req, a, (e) => { throw e }),
            handlers['post /api/spaces/bundle/uploads/:id/finish'](req, b, (e) => { throw e })
        ])
        expect([a.code, b.code].sort()).toEqual([202, 409])
        expect([a.body.code, b.body.code]).toContain('already_finishing')
        let status
        for (let i = 0; i < 100 && status?.state !== 'done'; i += 1) {
            await new Promise((r) => setTimeout(r, 20))
            const got = respond()
            await handlers['get /api/spaces/bundle/uploads/:id'](req, got, (e) => { throw e })
            status = got.body
        }
        expect(status.state).toBe('done')
        expect(imports).toBe(1)
    })
})

// A proposal sent in parts runs the same submit the one-POST route runs. The
// fake submit stands for contentProposals.submit: it creates a proposal unless
// the file is a dry run, and refuses the way the real one does.
describe('bundle parts: kind proposal', () => {
    const DISK = { statfs: async () => ({ bavail: 1e12, bsize: 1 }) }
    const FINISH = 'post /api/spaces/bundle/uploads/:id/finish'
    const text = '0123456789'
    const proposalBody = (proposal = {}) => ({ size: 10, sha256: sha(text), name: 'platina.diiii', kind: 'proposal', proposal: { spaceId: 'platina', mode: 'propose', ...proposal } })
    const fakeProposals = () => {
        const state = { created: [], calls: [] }
        state.proposals = {
            precheck: (req) => req.authState.type === 'guest' ? { status: 403, body: { error: 'Sign in with an account to send a file for this space.', code: 'auth_required' } } : null,
            submit: async (req, job) => {
                state.calls.push({ spaceId: job.spaceId, content: fs.readFileSync(job.uploadPath, 'utf8'), fields: job.fields })
                if (job.fields.acceptLoss !== null && job.fields.acceptLoss !== '2') return { status: 409, body: { error: 'The file removes 2 media items.', code: 'media_loss' } }
                if (job.fields.dryRun) return { status: 200, body: { status: 'dry_run', text: 'summary' } }
                state.created.push(job.spaceId)
                return { status: 202, body: { status: 'pending_approval', approvalId: 'ap1', expiresAt: 1 } }
            }
        }
        return state
    }
    const sendAll = async (handlers, root, subject, body) => {
        let res = respond()
        const req = { authState: { type: 'session', subject }, body }
        await handlers[START](req, res, (e) => { throw e })
        if (res.code !== 201) return { start: res }
        const id = res.body.uploadId
        for (const [n, piece] of [[1, '0123'], [2, '4567'], [3, '89']]) fs.writeFileSync(path.join(root, id, `part-00000${n}`), piece)
        const fin = { authState: req.authState, params: { id }, body: {} }
        res = respond()
        await handlers[FINISH](fin, res, (e) => { throw e })
        let status
        for (let i = 0; i < 100 && status?.state !== 'done' && status?.state !== 'failed'; i += 1) {
            await new Promise((r) => setTimeout(r, 20))
            const got = respond()
            await handlers['get /api/spaces/bundle/uploads/:id'](fin, got, (e) => { throw e })
            status = got.body
        }
        return { start: { code: 201, body: { uploadId: id } }, finish: res, status }
    }

    it('creates the proposal through submit with the joined file and the fields, and never imports', async () => {
        const fake = fakeProposals()
        let imports = 0
        const { handlers, root } = setup({ ...DISK, proposals: fake.proposals }, async () => { imports += 1 })
        const out = await sendAll(handlers, root, 'u1', proposalBody({ from: 'Emilya', overwriteNewer: true }))
        expect(out.finish.code).toBe(202)
        expect(out.status).toMatchObject({ state: 'done', httpStatus: 202, status: 'pending_approval', approvalId: 'ap1' })
        expect(fake.calls).toEqual([{ spaceId: 'platina', content: text, fields: { mode: 'propose', from: 'Emilya', overwriteNewer: true, dryRun: false, acceptLoss: null } }])
        expect(fake.created).toEqual(['platina'])
        expect(imports).toBe(0)
    })

    it('start echoes the kind, so a sender can tell a server that knows it', async () => {
        const fake = fakeProposals()
        const { handlers } = setup({ ...DISK, proposals: fake.proposals })
        const res = respond()
        await handlers[START](startReq('u1', proposalBody()), res, (e) => { throw e })
        expect(res.code).toBe(201)
        expect(res.body.kind).toBe('proposal')
    })

    it('dry run: the summary comes back and nothing is created', async () => {
        const fake = fakeProposals()
        const { handlers, root } = setup({ ...DISK, proposals: fake.proposals })
        const out = await sendAll(handlers, root, 'u1', proposalBody({ dryRun: true }))
        expect(out.status).toMatchObject({ state: 'done', httpStatus: 200, status: 'dry_run' })
        expect(fake.created).toEqual([])
    })

    it('a refusal of submit surfaces with its status and code, and creates nothing', async () => {
        const fake = fakeProposals()
        const { handlers, root } = setup({ ...DISK, proposals: fake.proposals })
        const out = await sendAll(handlers, root, 'u1', proposalBody({ acceptLoss: 1 }))
        expect(out.status).toMatchObject({ state: 'failed', httpStatus: 409, code: 'media_loss' })
        expect(fake.created).toEqual([])
    })

    it('the proposals access rule is checked at start, before any byte is sent', async () => {
        const fake = fakeProposals()
        const { handlers } = setup({ ...DISK, proposals: fake.proposals })
        const res = respond()
        await handlers[START]({ authState: { type: 'guest', subject: 'guest:1' }, body: proposalBody() }, res, (e) => { throw e })
        expect(res.code).toBe(403)
        expect(res.body.code).toBe('auth_required')
    })

    it('a proposal does not need the open-a-file permission, an import still does', async () => {
        const fake = fakeProposals()
        const { handlers } = setup({ ...DISK, proposals: fake.proposals, mayOpenAFile: (req, res) => { res.status(403).json({ code: 'auth_required' }); return false } })
        let res = respond()
        await handlers[START](startReq('u1', proposalBody()), res, (e) => { throw e })
        expect(res.code).toBe(201)
        res = respond()
        await handlers[START](startReq('u1'), res, (e) => { throw e })
        expect(res.code).toBe(403)
    })

    it('a server built without proposals, or an unknown kind, says so at start', async () => {
        const { handlers } = setup(DISK)
        let res = respond()
        await handlers[START](startReq('u1', proposalBody()), res, (e) => { throw e })
        expect(res.code).toBe(400)
        expect(res.body.code).toBe('kind_unsupported')
        res = respond()
        await handlers[START](startReq('u1', { ...proposalBody(), kind: 'wipe' }), res, (e) => { throw e })
        expect(res.code).toBe(400)
    })

    it('a proposal must name its space', async () => {
        const fake = fakeProposals()
        const { handlers } = setup({ ...DISK, proposals: fake.proposals })
        const res = respond()
        await handlers[START](startReq('u1', proposalBody({ spaceId: '' })), res, (e) => { throw e })
        expect(res.code).toBe(400)
    })
})

describe('bundle parts without an uploads folder', () => {
    it('registers no route and does not throw', async () => {
        const handlers = {}
        const router = {}
        for (const verb of ['get', 'post', 'put', 'delete']) router[verb] = (route, handler) => { handlers[`${verb} ${route}`] = handler }
        const api = registerBundleParts(router, { config: {}, mayOpenAFile: () => true, importBundleFile: async () => {}, normalizeSpaceId: (x) => x })
        expect(Object.keys(handlers)).toEqual([])
        await expect(api.sweep()).resolves.toBeUndefined()
    })
})
