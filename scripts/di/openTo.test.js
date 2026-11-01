// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMMANDS, parseArgs } from './cli.mjs'
import { writeLogin } from './loginStore.mjs'
import { DI_USER_AGENT } from './userAgent.mjs'

// `di open FILE --to URL` — the same file, into another di.iiii. fetch and the
// home (where `di login` keeps its token) are fakes; nothing leaves the machine.
const SITE = 'https://dev.example.org'
let dir, file, out, err, realHome, realToken

const answer = (status, body) => vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }))
const run = (...a) => COMMANDS.open(parseArgs(['open', file, ...a]))
const stored = (token = 'stored-secret') => writeLogin({ home: dir, key: SITE, entry: { token } })

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'di-open-to-'))
    file = path.join(dir, 'show.diiii')
    fs.writeFileSync(file, 'bundle-bytes')
    realHome = process.env.HOME; realToken = process.env.DI_TOKEN
    process.env.HOME = dir; delete process.env.DI_TOKEN
    out = []; err = []
    vi.spyOn(process.stdout, 'write').mockImplementation((c) => { out.push(String(c)); return true })
    vi.spyOn(process.stderr, 'write').mockImplementation((c) => { err.push(String(c)); return true })
    process.exitCode = 0
})
afterEach(() => {
    vi.unstubAllGlobals(); vi.restoreAllMocks()
    process.env.HOME = realHome
    if (realToken === undefined) delete process.env.DI_TOKEN; else process.env.DI_TOKEN = realToken
    process.exitCode = 0
    fs.rmSync(dir, { recursive: true, force: true })
})

describe('di open FILE --to URL', () => {
    it('sends the stored login to that address\'s bundle route as multipart, and says where it opened', async () => {
        stored()
        const fetchMock = answer(200, { ok: true, spaceId: 'show' })
        vi.stubGlobal('fetch', fetchMock)
        await run('--to', SITE)
        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe(`${SITE}/serverXR/api/spaces/bundle`)
        expect(init.method).toBe('POST')
        expect(init.headers.Authorization).toBe('Bearer stored-secret')
        expect(init.headers['User-Agent']).toBe(DI_USER_AGENT)
        expect(init.body.get('bundle').name).toBe('show.diiii')
        expect(init.body.has('as')).toBe(false)
        expect(out.join('')).toContain(`${SITE}/show`)
        expect(out.join('')).toContain('sign-in: the login stored for dev.example.org')
        expect(process.exitCode).toBe(0)
    })

    it('--as reaches the form', async () => {
        stored()
        const fetchMock = answer(200, { spaceId: 'copy-2' })
        vi.stubGlobal('fetch', fetchMock)
        await run('--to', SITE, '--as', 'copy-2')
        expect(fetchMock.mock.calls[0][1].body.get('as')).toBe('copy-2')
        expect(out.join('')).toContain(`${SITE}/copy-2`)
    })

    it('DI_TOKEN is used before the stored login, and said', async () => {
        stored()
        process.env.DI_TOKEN = 'env-secret'
        const fetchMock = answer(200, { spaceId: 'show' })
        vi.stubGlobal('fetch', fetchMock)
        await run('--to', SITE)
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer env-secret')
        expect(out.join('')).toContain('token from DI_TOKEN')
    })

    it('no login and no token: says to sign in, sends nothing', async () => {
        const fetchMock = answer(200, {})
        vi.stubGlobal('fetch', fetchMock)
        await run('--to', SITE)
        expect(fetchMock).not.toHaveBeenCalled()
        expect(err.join('')).toContain(`di login --to ${SITE}`)
        expect(process.exitCode).toBe(1)
    })

    it('401 auth_required and 403 not_through_cli both say to sign in', async () => {
        for (const [status, code] of [[401, 'auth_required'], [403, 'not_through_cli']]) {
            err.length = 0; stored()
            vi.stubGlobal('fetch', answer(status, { code, error: 'x' }))
            await run('--to', SITE)
            expect(err.join('')).toContain(`di login --to ${SITE}`)
            expect(process.exitCode).toBe(1)
        }
    })

    it('413 says the file is too big for that di.iiii and does not fall back to this machine', async () => {
        stored()
        const fetchMock = answer(413, { error: 'too big' })
        vi.stubGlobal('fetch', fetchMock)
        await run('--to', SITE)
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(err.join('')).toContain('MAX_UPLOAD_MB')
        expect(err.join('')).toContain('not opened on this machine')
        expect(out.join('')).not.toContain('stopping it to open the file directly')
        expect(process.exitCode).toBe(1)
    })

    it('"already exists" and other errors show the server\'s own words', async () => {
        stored()
        vi.stubGlobal('fetch', answer(409, { error: 'space "show" already exists' }))
        await run('--to', SITE)
        expect(err.join('')).toContain('space "show" already exists')
        expect(process.exitCode).toBe(1)
    })

    it('a bad address is an error and sends nothing', async () => {
        const fetchMock = answer(200, {})
        vi.stubGlobal('fetch', fetchMock)
        await run('--to', 'not an address')
        await run('--to', `${SITE}/some/page`)
        expect(fetchMock).not.toHaveBeenCalled()
        expect(err.join('')).toContain('is not an address')
        expect(err.join('')).toContain('an address with a path')
        expect(process.exitCode).toBe(1)
    })

    it('without --to the local path is still the local path (no install → the install message, no request)', async () => {
        const fetchMock = answer(200, {})
        vi.stubGlobal('fetch', fetchMock)
        process.env.DI_HOME = path.join(dir, 'no-di')
        try { await run() } finally { delete process.env.DI_HOME }
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
