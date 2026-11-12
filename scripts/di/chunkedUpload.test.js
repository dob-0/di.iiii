// @vitest-environment node
// The client of the chunked upload: a 200 MB file goes in parts of at most 64 MB,
// a failed part is retried 3 times with backoff, a server without the route
// (404) is reported so the caller can fall back to the single POST.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CHUNK_THRESHOLD, MAX_PART_BYTES, uploadChunked } from './chunkedUpload.mjs'

const MB = 1024 * 1024
let dir

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chunked-client-')) })
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const sparse = (name, bytes) => {
    const f = path.join(dir, name)
    fs.writeFileSync(f, '')
    fs.truncateSync(f, bytes)
    return f
}
const reply = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

// A fake server speaking the protocol; `failures` makes the first N PUTs of a part fail.
const fakeServer = ({ size, partSize = MAX_PART_BYTES, failures = {}, startStatus = 201 }) => {
    const log = { puts: [], calls: [] }
    const parts = Math.ceil(size / partSize)
    const attempts = {}
    const fetchImpl = async (url, init = {}) => {
        const u = String(url)
        log.calls.push(`${init.method} ${u.replace(/^.*\/api/, '/api')}`)
        if (u.endsWith('/api/space-uploads')) {
            if (startStatus !== 201) return reply(startStatus, { error: 'Not found' })
            log.start = JSON.parse(init.body)
            return reply(201, { uploadId: 'u1', partSize, parts, size })
        }
        const m = /\/parts\/(\d+)$/.exec(u)
        if (m) {
            const n = Number(m[1])
            attempts[n] = (attempts[n] || 0) + 1
            log.puts.push({ n, bytes: init.body.length, sha: init.headers['X-Part-Sha256'] })
            if (attempts[n] <= (failures[n] || 0)) throw new TypeError('socket hang up')
            return reply(200, { part: n })
        }
        if (u.endsWith('/finish')) return reply(201, { spaceId: 'platina' })
        return reply(204)
    }
    return { fetchImpl, log }
}

describe('uploadChunked', () => {
    it('sends a 200 MB file in parts of at most 64 MB, each with its sha256, then finishes', async () => {
        const file = sparse('big.diiii', 200 * MB)
        const { fetchImpl, log } = fakeServer({ size: 200 * MB })
        const progress = []
        const out = await uploadChunked({ base: 'https://x/serverXR', file, kind: 'bundle', fields: { as: 'platina' }, fetchImpl, onProgress: (p) => progress.push(p) })
        expect(out).toEqual({ status: 201, body: { spaceId: 'platina' } })
        expect(log.puts.map((p) => p.bytes)).toEqual([64 * MB, 64 * MB, 64 * MB, 8 * MB])
        expect(Math.max(...log.puts.map((p) => p.bytes))).toBeLessThanOrEqual(64 * MB)
        expect(log.puts.every((p) => /^[0-9a-f]{64}$/.test(p.sha))).toBe(true)
        expect(log.start).toMatchObject({ kind: 'bundle', size: 200 * MB, fields: { as: 'platina' } })
        expect(log.start.sha256).toMatch(/^[0-9a-f]{64}$/)
        expect(progress.at(-1)).toMatchObject({ part: 4, parts: 4, sent: 200 * MB })
        expect(log.calls.at(-1)).toMatch(/POST .*\/finish$/)
    }, 60000)

    it('retries a failed part 3 times with backoff, then succeeds', async () => {
        const file = sparse('a.diiii', 3 * MB)
        const { fetchImpl, log } = fakeServer({ size: 3 * MB, partSize: 2 * MB, failures: { 1: 3 } })
        const waits = []
        const out = await uploadChunked({ base: 'b', file, kind: 'bundle', fetchImpl, sleep: async (ms) => { waits.push(ms) }, backoffMs: 10 })
        expect(out.status).toBe(201)
        expect(log.puts.filter((p) => p.n === 1)).toHaveLength(4)
        expect(waits).toEqual([10, 40, 160])
    })

    it('gives up after 3 retries, abandons the session and says which part', async () => {
        const file = sparse('b.diiii', 3 * MB)
        const { fetchImpl, log } = fakeServer({ size: 3 * MB, partSize: 2 * MB, failures: { 0: 99 } })
        await expect(uploadChunked({ base: 'b', file, kind: 'bundle', fetchImpl, sleep: async () => {} }))
            .rejects.toMatchObject({ code: 'upload_failed', message: expect.stringContaining('part 1 of 2') })
        expect(log.puts).toHaveLength(4)
        expect(log.calls.at(-1)).toMatch(/^DELETE /)
    })

    it('reports a server without the route (404 on start) as unsupported, so the caller falls back', async () => {
        const file = sparse('c.diiii', MB)
        const { fetchImpl, log } = fakeServer({ size: MB, startStatus: 404 })
        expect(await uploadChunked({ base: 'b', file, kind: 'bundle', fetchImpl })).toEqual({ unsupported: true })
        expect(log.puts).toHaveLength(0)
    })

    it('hands back a refusal at start (413, 403) as the answer', async () => {
        const file = sparse('d.diiii', MB)
        const { fetchImpl } = fakeServer({ size: MB, startStatus: 413 })
        expect(await uploadChunked({ base: 'b', file, kind: 'bundle', fetchImpl })).toMatchObject({ status: 413 })
    })

    it('uses chunks above 90 MB and a part cap of 64 MB', () => {
        expect(CHUNK_THRESHOLD).toBe(90 * MB)
        expect(MAX_PART_BYTES).toBe(64 * MB)
    })
})
