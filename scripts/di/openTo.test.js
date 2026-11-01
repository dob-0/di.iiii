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

    it('401/403 auth_required says to sign in', async () => {
        for (const status of [401, 403]) {
            err.length = 0; stored()
            vi.stubGlobal('fetch', answer(status, { error: 'auth_required' }))
            await run('--to', SITE)
            expect(err.join('')).toContain(`di login --to ${SITE}`)
            expect(process.exitCode).toBe(1)
        }
    })

    it('F1: the real not_through_cli body prints the server\'s reason and rule, not "sign in"', async () => {
        stored()
        vi.stubGlobal('fetch', answer(403, { error: 'not_through_cli', rule: 'RULE-X', reason: 'REASON-Y' }))
        await run('--to', SITE)
        expect(err.join('')).toContain('REASON-Y')
        expect(err.join('')).toContain('RULE-X')
        expect(err.join('')).not.toContain('sign in first')
        expect(process.exitCode).toBe(1)
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

    it('F2: the real 409 space_exists body gets the --as hint', async () => {
        stored()
        vi.stubGlobal('fetch', answer(409, { error: 'A space called "show" is already here.', code: 'space_exists', spaceId: 'show' }))
        await run('--to', SITE)
        expect(err.join('')).toContain('A space called "show" is already here.')
        expect(err.join('')).toContain(`--to ${SITE} --as NEW-ID`)
        expect(process.exitCode).toBe(1)
    })

    it('F3: a bare --token VALUE is refused, with or without --to, and sends nothing', async () => {
        const fetchMock = answer(200, {})
        vi.stubGlobal('fetch', fetchMock)
        await run('--to', SITE, '--token', 'dii_cli_SECRET')
        await run('--token', 'dii_cli_SECRET')
        expect(fetchMock).not.toHaveBeenCalled()
        expect(err.join('')).toContain('visible to every process')
        expect(err.join('')).toContain('--token -')
        expect(err.join('')).not.toContain('dii_cli_SECRET')
        expect(process.exitCode).toBe(1)
    })

    it('F4: plain http to another host is refused before any token is sent; localhost http is allowed', async () => {
        process.env.DI_TOKEN = 'env-secret'
        const fetchMock = answer(200, { spaceId: 'show' })
        vi.stubGlobal('fetch', fetchMock)
        await run('--to', 'http://dev.example.org')
        expect(fetchMock).not.toHaveBeenCalled()
        expect(err.join('')).toContain('not https')
        expect(process.exitCode).toBe(1)
        process.exitCode = 0
        await run('--to', 'http://diiii.localhost')
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('F4: a DI_TOKEN send names the host that receives it', async () => {
        process.env.DI_TOKEN = 'env-secret'
        vi.stubGlobal('fetch', answer(200, { spaceId: 'show' }))
        await run('--to', SITE)
        expect(out.join('')).toContain('token from DI_TOKEN, sent to dev.example.org')
    })

    it('F5: a dropped connection mentions the upload cap, not just "fetch failed"', async () => {
        stored()
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
        await run('--to', SITE)
        expect(err.join('')).toContain('fetch failed')
        expect(err.join('')).toContain('upload cap may be the cause')
        expect(process.exitCode).toBe(1)
    })

    it('F6: --to or --token - without a FILE asks which file and opens nothing', async () => {
        const fetchMock = answer(200, {})
        vi.stubGlobal('fetch', fetchMock)
        await COMMANDS.open(parseArgs(['open', '--to', SITE]))
        expect(err.join('')).toContain('which file?')
        expect(fetchMock).not.toHaveBeenCalled()
        expect(process.exitCode).toBe(1)
    })

    it('F7: says what is being sent and where, passes a timeout signal, and names the host on a timeout', async () => {
        stored()
        const fetchMock = vi.fn(async () => { const e = new Error('timed out'); e.name = 'TimeoutError'; throw e })
        vi.stubGlobal('fetch', fetchMock)
        await run('--to', SITE)
        expect(out.join('')).toContain('MB to dev.example.org')
        expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
        expect(err.join('')).toContain('dev.example.org did not finish')
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
