// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMMANDS, parseArgs } from './cli.mjs'
import { writeLogin } from './loginStore.mjs'

// `di open FILE --to URL` over one safe request goes in parts. The threshold is
// lowered by env so a 12-byte file stands for the 843 MB one; fetch is a fake.
const SITE = 'https://dev.example.org'
const door = `${SITE}/serverXR/api/spaces/bundle/uploads`
let dir, file, out, err, saved

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
const run = (...a) => COMMANDS.open(parseArgs(['open', file, ...a]))

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'di-open-parts-'))
    file = path.join(dir, 'show.diiii')
    fs.writeFileSync(file, 'bundle-bytes')
    writeLogin({ home: dir, key: SITE, entry: { token: 'stored-secret' } })
    saved = { HOME: process.env.HOME, DI_TOKEN: process.env.DI_TOKEN, max: process.env.DI_OPEN_TO_SINGLE_MAX_BYTES, retry: process.env.DI_OPEN_TO_RETRY_MS, poll: process.env.DI_OPEN_TO_POLL_MS }
    process.env.HOME = dir; delete process.env.DI_TOKEN
    process.env.DI_OPEN_TO_SINGLE_MAX_BYTES = '5'; process.env.DI_OPEN_TO_RETRY_MS = '0'; process.env.DI_OPEN_TO_POLL_MS = '0'
    out = []; err = []
    vi.spyOn(process.stdout, 'write').mockImplementation((c) => { out.push(String(c)); return true })
    vi.spyOn(process.stderr, 'write').mockImplementation((c) => { err.push(String(c)); return true })
    process.exitCode = 0
})
afterEach(() => {
    vi.unstubAllGlobals(); vi.restoreAllMocks()
    for (const [k, v] of [['HOME', saved.HOME], ['DI_TOKEN', saved.DI_TOKEN], ['DI_OPEN_TO_SINGLE_MAX_BYTES', saved.max], ['DI_OPEN_TO_RETRY_MS', saved.retry], ['DI_OPEN_TO_POLL_MS', saved.poll]]) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v
    }
    process.exitCode = 0
    fs.rmSync(dir, { recursive: true, force: true })
})

describe('di open FILE --to URL, in parts', () => {
    it('above the threshold: start, every part, finish; never the single POST', async () => {
        const calls = []
        const polls = [{ state: 'importing' }, { state: 'done', httpStatus: 201, spaceId: 'show' }]
        vi.stubGlobal('fetch', vi.fn(async (url, init) => {
            calls.push(`${init.method || 'GET'} ${url.replace(door, '')}`)
            if (url === door) return reply(201, { uploadId: 'u1', partBytes: 5, parts: 3 })
            if (url.endsWith('/finish')) return reply(202, { state: 'joining' })
            if (!init.method) return reply(200, polls.shift())
            return reply(200, { ok: true })
        }))
        await run('--to', SITE)
        expect(calls).toEqual(['POST ', 'PUT /u1/parts/1', 'PUT /u1/parts/2', 'PUT /u1/parts/3', 'POST /u1/finish', 'GET /u1', 'GET /u1', 'DELETE /u1'])
        expect(out.join('')).toContain('importing the file')
        expect(out.join('')).toContain('part 3/3 sent')
        expect(out.join('')).toContain(`${SITE}/show`)
        expect(process.exitCode).toBe(0)
    })

    it('a failed part is tried again', async () => {
        let first = true
        vi.stubGlobal('fetch', vi.fn(async (url, init) => {
            if (url === door) return reply(201, { uploadId: 'u1', partBytes: 5, parts: 3 })
            if (url.endsWith('/finish')) return reply(201, { spaceId: 'show' })
            if (url.endsWith('/parts/1') && first) { first = false; return reply(502, {}) }
            return reply(200, {})
        }))
        await run('--to', SITE)
        expect(process.exitCode).toBe(0)
    })

    it('a part that never goes through cancels the upload and says which part', async () => {
        const calls = []
        vi.stubGlobal('fetch', vi.fn(async (url, init) => {
            calls.push(init.method)
            if (url === door) return reply(201, { uploadId: 'u1', partBytes: 5, parts: 3 })
            if (init.method === 'DELETE') return reply(200, {})
            return reply(502, {})
        }))
        await run('--to', SITE)
        expect(calls).toEqual(['POST', 'PUT', 'PUT', 'PUT', 'DELETE'])
        expect(err.join('')).toContain('part 1/3 did not reach')
        expect(process.exitCode).toBe(1)
    })

    it('an older server (404 on start): a file that fits one request falls back to the single POST', async () => {
        const fetchMock = vi.fn(async () => reply(404, {}))
        vi.stubGlobal('fetch', fetchMock)
        await run('--to', SITE)
        expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([door, `${SITE}/serverXR/api/spaces/bundle`])
    })

    it('an older server (404 on start): a file over its limit is told so plainly', async () => {
        fs.truncateSync(file, 101 * 1048576)
        const fetchMock = vi.fn(async () => reply(404, {}))
        vi.stubGlobal('fetch', fetchMock)
        await run('--to', SITE)
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(err.join('')).toContain('is older and takes only files up to 100 MB')
        expect(process.exitCode).toBe(1)
    })

    // The finish answers 202 and the work goes on there: a failure of the import
    // reaches the artist with its code, the same words as the single POST.
    const finishThen = (...polls) => vi.stubGlobal('fetch', vi.fn(async (url, init) => {
        if (url === door) return reply(201, { uploadId: 'u1', partBytes: 5, parts: 3 })
        if (url.endsWith('/finish')) return reply(202, { state: 'joining' })
        if (init.method === 'PUT' || init.method === 'DELETE') return reply(200, {})
        const next = polls.shift()
        if (next instanceof Error) throw next
        return reply(200, next)
    }))

    it('a failed import is reported with its code: space_exists gets the --as hint', async () => {
        finishThen({ state: 'importing' }, { state: 'failed', httpStatus: 409, error: 'A space called "show" is already here.', code: 'space_exists', spaceId: 'show' })
        await run('--to', SITE)
        expect(err.join('')).toContain('is already here.')
        expect(err.join('')).toContain('--as NEW-ID')
        expect(process.exitCode).toBe(1)
    })

    it('a dropped poll is not a failed import: it asks again', async () => {
        finishThen(new Error('socket hang up'), { state: 'done', httpStatus: 201, spaceId: 'show' })
        await run('--to', SITE)
        expect(out.join('')).toContain(`${SITE}/show`)
        expect(process.exitCode).toBe(0)
    })

    it('stops waiting after the total timeout and says the server may still be working', async () => {
        process.env.DI_OPEN_TO_FINISH_TIMEOUT_MS = '30'
        process.env.DI_OPEN_TO_POLL_MS = '10'
        finishThen(...Array.from({ length: 50 }, () => ({ state: 'importing' })))
        try { await run('--to', SITE) } finally { delete process.env.DI_OPEN_TO_FINISH_TIMEOUT_MS }
        expect(err.join('')).toContain('may still be working')
        expect(process.exitCode).toBe(1)
    })
})
