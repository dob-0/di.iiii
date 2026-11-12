// @vitest-environment node
// Contract of the chunked upload (chunkedUploads.js): start / part / finish, bad
// sha rejected, missing part rejected, auth required, size ceiling, cleanup.
// In-process express app with stand-in doors; the doors' own behaviour is covered
// by bundleContracts / proposalContracts, and finish is proved to call the door's
// handler with the assembled file and the stored form fields.
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { createChunkedUploads, MAX_PART_BYTES } = require('./chunkedUploads')

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const PART = 1024
let root, server, base, uploads, seen, scopeCalls, scopeAllows

const boot = async (opts = {}) => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'chunked-test-'))
    seen = []
    scopeCalls = []
    scopeAllows = true
    const app = express()
    app.use(express.json())
    // Stand-in for the auth middleware: who the caller is comes from a header.
    app.use((req, _res, next) => {
        const who = req.get('x-user')
        req.authState = who ? { authenticated: true, type: 'session', subject: who, role: 'editor' } : { authenticated: false }
        next()
    })
    const door = (name) => ({
        authRefusal: (req) => (req.authState.authenticated ? null : { status: 403, body: { error: 'Sign in.', code: 'auth_required' } }),
        handle: async (req, res) => {
            const bytes = fs.readFileSync(req.file.path)
            seen.push({ name, bytes, body: req.body, spaceId: req.params.spaceId, originalname: req.file.originalname })
            fs.rmSync(req.file.path, { force: true }) // the real handlers delete the file in their finally
            res.status(201).json({ ok: true, name })
        }
    })
    fs.mkdirSync(path.join(root, 'assembled'))
    uploads = createChunkedUploads({
        router: app,
        dir: path.join(root, 'chunked'),
        assembleDir: path.join(root, 'assembled'),
        maxBytes: 10 * PART,
        partBytes: PART,
        doors: { bundle: door('bundle'), proposal: door('proposal') },
        scopeGate: async (_req, res, spaceId) => {
            scopeCalls.push(spaceId)
            if (!scopeAllows) { res.status(403).json({ error: 'scope' }); return false }
            return true
        },
        logger: { warn() {} },
        ...opts
    })
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
    base = `http://127.0.0.1:${server.address().port}/api/space-uploads`
}

beforeEach(() => boot())
afterEach(async () => {
    uploads.stop()
    await new Promise((resolve) => server.close(resolve))
    fs.rmSync(root, { recursive: true, force: true })
})

const start = (file, extra = {}, user = 'ann') => fetch(base, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(user ? { 'x-user': user } : {}) },
    body: JSON.stringify({ kind: 'bundle', filename: 'x.diiii', size: file.length, sha256: sha(file), ...extra })
})
const put = (id, n, buf, { user = 'ann', partSha = sha(buf) } = {}) => fetch(`${base}/${id}/parts/${n}`, {
    method: 'PUT',
    headers: { 'x-part-sha256': partSha, 'content-type': 'application/octet-stream', ...(user ? { 'x-user': user } : {}) },
    body: buf
})
const finish = (id, user = 'ann') => fetch(`${base}/${id}/finish`, { method: 'POST', headers: user ? { 'x-user': user } : {} })
const file = (n) => crypto.randomBytes(n)
const slices = (f) => Array.from({ length: Math.ceil(f.length / PART) }, (_, i) => f.subarray(i * PART, (i + 1) * PART))
// Cleanup runs right after the response is sent, so wait a moment for it.
const gone = async () => {
    for (let i = 0; i < 50 && dirsLeft().length; i++) await new Promise((r) => setTimeout(r, 10))
    return dirsLeft()
}
const dirsLeft = () => fs.readdirSync(path.join(root, 'chunked')).concat(fs.readdirSync(path.join(root, 'assembled')))

describe('chunked upload', () => {
    it('start, parts, finish hands the door its handler the assembled file and the stored fields', async () => {
        const f = file(PART * 2 + 100)
        const res = await start(f, { fields: { as: 'my-space', evil: 'dropped' } })
        expect(res.status).toBe(201)
        const { uploadId, partSize, parts } = await res.json()
        expect(partSize).toBe(PART)
        expect(parts).toBe(3)
        for (const [n, buf] of slices(f).entries()) expect((await put(uploadId, n, buf)).status).toBe(200)
        const done = await finish(uploadId)
        expect(done.status).toBe(201)
        expect(seen).toHaveLength(1)
        expect(seen[0].bytes.equals(f)).toBe(true)
        expect(seen[0].body).toEqual({ as: 'my-space' })
        expect(seen[0].originalname).toBe('x.diiii')
        expect(await gone()).toEqual([])
    })

    it('a proposal runs the scope gate for its space and gets spaceId and fields', async () => {
        const f = file(PART + 5)
        const { uploadId } = await (await start(f, { kind: 'proposal', spaceId: 'sp', fields: { mode: 'propose', dryRun: 'true' } })).json()
        for (const [n, buf] of slices(f).entries()) await put(uploadId, n, buf)
        expect((await finish(uploadId)).status).toBe(201)
        expect(scopeCalls).toEqual(['sp', 'sp'])
        expect(seen[0]).toMatchObject({ name: 'proposal', spaceId: 'sp', body: { mode: 'propose', dryRun: 'true' } })
    })

    it('a scope refusal at finish never reaches the handler', async () => {
        const f = file(PART)
        const { uploadId } = await (await start(f, { kind: 'proposal', spaceId: 'sp' })).json()
        await put(uploadId, 0, f)
        scopeAllows = false
        expect((await finish(uploadId)).status).toBe(403)
        expect(seen).toHaveLength(0)
    })

    it('a part whose sha256 is wrong is refused and deleted; the right one then goes in', async () => {
        const f = file(PART)
        const { uploadId } = await (await start(f)).json()
        const bad = await put(uploadId, 0, f, { partSha: 'a'.repeat(64) })
        expect(bad.status).toBe(400)
        expect((await bad.json()).code).toBe('part_sha_mismatch')
        expect(fs.readdirSync(path.join(root, 'chunked', uploadId))).toEqual([])
        expect((await put(uploadId, 0, f)).status).toBe(200)
    })

    it('a part of the wrong length is refused (short and long)', async () => {
        const f = file(PART * 2)
        const { uploadId } = await (await start(f)).json()
        expect((await (await put(uploadId, 0, f.subarray(0, PART - 1))).json()).code).toBe('part_wrong_length')
        const long = await put(uploadId, 0, f.subarray(0, PART + 1), { partSha: sha(f.subarray(0, PART + 1)) })
        expect([400, 413]).toContain(long.status)
        expect(fs.readdirSync(path.join(root, 'chunked', uploadId))).toEqual([])
    })

    it('finish with a missing part answers 409 and names it, keeping the session', async () => {
        const f = file(PART * 3)
        const { uploadId } = await (await start(f)).json()
        const ps = slices(f)
        await put(uploadId, 0, ps[0])
        await put(uploadId, 2, ps[2])
        const res = await finish(uploadId)
        expect(res.status).toBe(409)
        expect(await res.json()).toMatchObject({ code: 'parts_missing', missing: [1] })
        const status = await (await fetch(`${base}/${uploadId}`, { headers: { 'x-user': 'ann' } })).json()
        expect(status.received).toEqual([0, 2])
        await put(uploadId, 1, ps[1])
        expect((await finish(uploadId)).status).toBe(201)
    })

    it('a whole-file sha256 that does not match imports nothing and cleans up', async () => {
        const f = file(PART + 1)
        const { uploadId } = await (await start(f, { sha256: 'b'.repeat(64) })).json()
        for (const [n, buf] of slices(f).entries()) await put(uploadId, n, buf)
        const res = await finish(uploadId)
        expect(res.status).toBe(400)
        expect((await res.json()).code).toBe('sha_mismatch')
        expect(seen).toHaveLength(0)
        expect(await gone()).toEqual([])
    })

    it('needs the same sign-in as the door, on every call, and is bound to who started it', async () => {
        const f = file(PART)
        expect((await start(f, {}, null)).status).toBe(403)
        const { uploadId } = await (await start(f)).json()
        expect((await put(uploadId, 0, f, { user: 'bob' })).status).toBe(404)
        expect((await finish(uploadId, 'bob')).status).toBe(404)
        expect((await fetch(`${base}/${uploadId}`, { headers: { 'x-user': 'bob' } })).status).toBe(404)
        expect((await fetch(`${base}/${uploadId}`, { method: 'DELETE', headers: { 'x-user': 'bob' } })).status).toBe(404)
        await put(uploadId, 0, f)
        // signed out at finish: the door's refusal applies again
        expect((await finish(uploadId, null)).status).toBe(404)
        expect(seen).toHaveLength(0)
    })

    it('refuses a file over the ceiling at start, before anything is stored', async () => {
        const res = await start(file(10 * PART + 1))
        expect(res.status).toBe(413)
        expect(fs.readdirSync(path.join(root, 'chunked'))).toEqual([])
    })

    it('refuses a bad kind, filename, sha256 and size', async () => {
        const f = file(PART)
        expect((await start(f, { kind: 'nope' })).status).toBe(400)
        expect((await start(f, { filename: 'x.exe' })).status).toBe(400)
        expect((await start(f, { sha256: 'zz' })).status).toBe(400)
        expect((await start(f, { size: 0 })).status).toBe(400)
        expect((await start(f, { kind: 'proposal' })).status).toBe(400)
    })

    it('limits sessions per caller', async () => {
        const f = file(PART)
        for (let i = 0; i < 3; i++) expect((await start(f)).status).toBe(201)
        expect((await start(f)).status).toBe(429)
        expect((await start(f, {}, 'bob')).status).toBe(201)
    })

    it('abandon (DELETE) and expiry both delete the session files', async () => {
        const f = file(PART * 2)
        const a = (await (await start(f)).json()).uploadId
        await put(a, 0, f.subarray(0, PART))
        expect((await fetch(`${base}/${a}`, { method: 'DELETE', headers: { 'x-user': 'ann' } })).status).toBe(204)
        expect(fs.existsSync(path.join(root, 'chunked', a))).toBe(false)

        const b = (await (await start(f)).json()).uploadId
        await put(b, 0, f.subarray(0, PART))
        uploads.sessions.get(b).expiresAt = Date.now() - 1
        await uploads.sweep()
        expect(fs.existsSync(path.join(root, 'chunked', b))).toBe(false)
        expect((await put(b, 1, f.subarray(PART))).status).toBe(404)
    })

    it('a part is never larger than 64 MB whatever is asked', () => {
        const big = createChunkedUploads({ router: express(), dir: path.join(root, 'big'), assembleDir: root, maxBytes: 1, partBytes: 500 * 1024 * 1024, doors: {} })
        big.stop()
        expect(big.partSize).toBe(MAX_PART_BYTES)
        expect(MAX_PART_BYTES).toBe(64 * 1024 * 1024)
    })
})
