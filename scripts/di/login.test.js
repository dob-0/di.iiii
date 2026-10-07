// @vitest-environment node
//
// `di login`, `di whoami`, `di logout` against a stub of the wire format in
// docs/architecture/CLI_LOGIN.md: a real HTTP server on a free port (a test
// fixture, closed in afterAll), a fake clock and a fake sleep so the whole
// suite takes milliseconds, a temp folder for a home. Two tests at the bottom
// spawn the real `cli.mjs` against the same stub, because "the address and the
// code are on the screen before the first poll" and "Ctrl-C ends it" are
// claims about a process, not about a function.
//
// Never here: a real browser (every flow passes a fake `open` or --no-open), a
// request to a real host (tier hosts are rewritten to the stub), ~/.di or the
// real ~/.config.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseArgs } from './args.mjs'
import { cleanText, cmdLogin, cmdLogout, cmdWhoami, hasDisplay, labelFor, mcpArgs, moveToken, openInBrowser } from './login.mjs'
import { credentialsFile, readLogin, writeLogin } from './loginStore.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLI = path.join(HERE, 'cli.mjs')
const posix = process.platform !== 'win32'

// A recognisable secret: if any part of it shows up on a stream, a test says so.
const SECRET = 'SECRETPARTSECRETPART'
const TOKEN = `dii_cli_0123456789abcdef.${SECRET}SECRETPARTSECRETPART12`
const GRANT = { deviceCode: 'devicecode-0123456789abcdef', userCode: 'BDFG-HJKL', verificationPath: '/device', expiresIn: 600, interval: 5 }
const PENDING = { status: 400, body: { error: 'authorization_pending' } }
const DENIED = { status: 400, body: { error: 'access_denied' } }
const EXPIRED = { status: 400, body: { error: 'expired_token' } }
const SLOW = (interval) => ({ status: 400, body: { error: 'slow_down', ...(interval ? { interval } : {}) } })
const approved = (extra = {}) => ({ status: 200, body: { token: TOKEN, expiresAt: 1799999999999, user: { id: 'u1', name: 'Taron' }, ...extra } })
const T0 = 1_800_000_000_000
const WHOAMI = { user: { id: 'u1', name: 'Taron' }, token: { id: 'abcd', label: 'taron-laptop (di 0.4.17)', expiresAt: Date.UTC(2027, 0, 5, 10) } }

let server
let ORIGIN
let HOST
let S
let home
let noColor

const resetStub = () => {
    S = {
        start: { status: 201, body: GRANT },
        polls: [PENDING],
        pollIndex: 0,
        whoami: (auth) => (auth === `Bearer ${TOKEN}` ? { status: 200, body: WHOAMI } : { status: 401, body: { error: 'cli_token_invalid' } }),
        logout: { status: 200, body: { revoked: true } },
        onPoll: null,
        seen: []
    }
}

beforeAll(async () => {
    noColor = process.env.DI_NO_COLOR
    process.env.DI_NO_COLOR = '1'
    server = http.createServer((req, res) => {
        let raw = ''
        req.on('data', (chunk) => { raw += chunk })
        req.on('end', () => {
            let body = {}
            try { body = raw ? JSON.parse(raw) : {} } catch { /* not JSON */ }
            const pathname = new URL(req.url, 'http://stub').pathname
            S.seen.push({ method: req.method, path: pathname, auth: req.headers.authorization || null, body })
            const send = ({ status, body: answer }) => {
                res.writeHead(status, { 'content-type': 'application/json' })
                res.end(JSON.stringify(answer))
            }
            const route = `${req.method} ${pathname}`
            if (route === 'POST /serverXR/api/auth/device/start') return send(S.start)
            if (route === 'POST /serverXR/api/auth/device/token') {
                S.onPoll?.()
                return send(S.polls[Math.min(S.pollIndex++, S.polls.length - 1)])
            }
            if (route === 'GET /serverXR/api/auth/cli/whoami') return send(S.whoami(req.headers.authorization))
            if (route === 'DELETE /serverXR/api/auth/cli/token') return send(S.logout)
            return send({ status: 404, body: { error: 'not_found' } })
        })
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    ORIGIN = `http://127.0.0.1:${server.address().port}`
    HOST = `127.0.0.1:${server.address().port}`
})
afterAll(async () => {
    if (noColor === undefined) delete process.env.DI_NO_COLOR
    else process.env.DI_NO_COLOR = noColor
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
})
beforeEach(() => {
    resetStub()
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-login-'))
})
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }) })

const isStart = (r) => r.path.endsWith('/device/start')
const isPoll = (r) => r.path.endsWith('/device/token')
const mode = (target) => fs.statSync(target).mode & 0o777
// The three hosts the tiers name are answered by the stub; the URL asked for is still recorded as asked.
const rewrite = (url) => String(url).replace(/^(https:\/\/(dev\.diiii\.xyz|di-studio\.xyz)|http:\/\/localhost:4000)/, ORIGIN)

/** One command, in process: real HTTP to the stub, everything else fake. */
const run = async (command, argv, { env = { DISPLAY: ':0' }, platform = 'linux', fetchImpl = null, signal = null, onSleep = null, hostname = 'taron-laptop', version = '0.4.17' } = {}) => {
    const out = []
    const err = []
    const sleeps = []
    const opened = []
    const requested = []
    let clock = T0
    const deps = {
        fetch: (url, init) => { requested.push(`${init?.method} ${url}`); return (fetchImpl || fetch)(rewrite(url), init) },
        sleep: async (ms) => { sleeps.push(ms); onSleep?.(sleeps.length, out); clock += ms },
        now: () => clock,
        say: (text) => { out.push(String(text)) },
        fail: (text) => { err.push(String(text)) },
        warn: (text) => { err.push(String(text)) },
        open: (url) => { opened.push(url) },
        home, env, hostname, version, platform, signal
    }
    const code = await command(parseArgs(argv), deps)
    const outText = out.join('\n')
    const errText = err.join('\n')
    return { code, out: outText, err: errText, all: `${outText}\n${errText}`, sleeps, opened, requested }
}

const login = (extra = [], options) => run(cmdLogin, ['login', '--to', ORIGIN, ...extra], options)

const storeStub = (token = 'dii_cli_old0000000000.old', key = ORIGIN) => writeLogin({
    home, key, entry: { token, base: `${ORIGIN}/serverXR`, site: ORIGIN, user: { id: 'u1', name: 'Taron' }, expiresAt: 1, savedAt: '2026-10-01T00:00:00.000Z' }
})

describe('di login — the flow', () => {
    it('pending twice, then yes: stores the login, says who and where, and never prints the token', async () => {
        S.polls = [PENDING, PENDING, approved()]
        const r = await login(['--no-open'])
        expect(r.code).toBe(0)
        // wait one interval, then poll; the same again until it is answered
        expect(r.sleeps).toEqual([5000, 5000, 5000])
        const polls = S.seen.filter(isPoll)
        expect(polls).toHaveLength(3)
        // the polls carry the device code and no credential; nothing carries the token before it exists
        expect(polls.every((p) => p.body.deviceCode === GRANT.deviceCode && p.auth === null)).toBe(true)
        expect(S.seen.find(isStart).auth).toBeNull()
        const stored = readLogin({ home, key: ORIGIN })
        expect(stored).toEqual({
            token: TOKEN,
            base: `${ORIGIN}/serverXR`,
            site: ORIGIN,
            user: { id: 'u1', name: 'Taron' },
            expiresAt: 1799999999999,
            savedAt: new Date(T0 + 15_000).toISOString()
        })
        expect(r.out).toContain(`signed in as Taron on ${HOST}`)
        // the one line on what a terminal login does not do
        expect(r.out).toMatch(/cannot publish or delete a space, or change who owns or edits one/)
        expect(r.all).not.toContain(SECRET)
        expect(r.all).not.toContain('dii_cli_')
        expect(JSON.stringify(r.requested)).not.toContain(SECRET)
    })

    it('puts the address and the code on the screen BEFORE the first poll, and opens only the bare address', async () => {
        S.polls = [approved()]
        let screenAtFirstSleep = null
        const r = await login([], { onSleep: (n, out) => { if (n === 1) screenAtFirstSleep = out.join('\n') } })
        expect(screenAtFirstSleep).toContain(`${ORIGIN}/device`)
        expect(screenAtFirstSleep).toContain('BDFG-HJKL')
        expect(screenAtFirstSleep).toContain('10 minutes')
        // the code is typed by the person — never carried in a link (RFC 8628 §5.4)
        expect(r.opened).toEqual([`${ORIGIN}/device`])
        expect(r.opened[0]).not.toContain('BDFG')
        expect(r.opened[0]).not.toContain('?')
    })

    it('opens the browser only with a display and without --no-open', async () => {
        S.polls = [approved()]
        // --force on every call after the first: a stored login would otherwise answer "already signed in"
        // and never reach the browser step, which would make the empty lists below pass for the wrong reason
        const flows = []
        const attempt = async (extra, options) => {
            S.pollIndex = 0
            const r = await login(['--force', ...extra], options)
            flows.push(r.code)
            return r.opened
        }
        expect(await attempt(['--no-open'])).toEqual([])
        expect(await attempt([], { env: {} })).toEqual([])
        expect(await attempt([], { env: { DISPLAY: ':0', SSH_CONNECTION: '1 2 3 4' } })).toEqual([])
        expect(await attempt([], { env: { DISPLAY: ':0' } })).toEqual([`${ORIGIN}/device`])
        expect(await attempt([], { env: {}, platform: 'darwin' })).toEqual([`${ORIGIN}/device`])
        // every one of them really signed in
        expect(flows).toEqual([0, 0, 0, 0, 0])
        expect(S.seen.filter(isStart)).toHaveLength(5)
    })

    it('slow_down: waits the interval the server sent, or five seconds more when it sent none', async () => {
        S.polls = [SLOW(12), approved()]
        expect((await login(['--no-open'])).sleeps).toEqual([5000, 12000])
        S.pollIndex = 0
        S.polls = [SLOW(), SLOW(), approved()]
        expect((await login(['--no-open', '--force'])).sleeps).toEqual([5000, 10000, 15000])
    })

    it('slow_down never makes it faster: a smaller interval than the one in use is not taken', async () => {
        S.start = { status: 201, body: { ...GRANT, interval: 8 } }
        S.polls = [SLOW(3), approved()]
        expect((await login(['--no-open'])).sleeps).toEqual([8000, 8000])
    })

    it('denied in the browser: says so, exits 1, writes nothing', async () => {
        S.polls = [PENDING, DENIED]
        const r = await login(['--no-open'])
        expect(r.code).toBe(1)
        expect(r.err).toContain('it was denied in the browser')
        expect(fs.existsSync(credentialsFile(home))).toBe(false)
    })

    it('expired_token: says the code ran out, exits 1, writes nothing', async () => {
        S.polls = [EXPIRED]
        const r = await login(['--no-open'])
        expect(r.code).toBe(1)
        expect(r.err).toContain('the code ran out — run di login again')
        expect(fs.existsSync(credentialsFile(home))).toBe(false)
    })

    it('stops at expiresIn on its own clock, even if the server never says so', async () => {
        S.start = { status: 201, body: { ...GRANT, expiresIn: 30 } }
        S.polls = [PENDING]
        const r = await login(['--no-open'])
        expect(r.code).toBe(1)
        expect(r.err).toContain('the code ran out')
        expect(S.seen.filter(isPoll)).toHaveLength(5)
        expect(r.sleeps).toHaveLength(6)
        expect(fs.existsSync(credentialsFile(home))).toBe(false)
    })

    it('a network error is not a refusal: it keeps polling on the same wait, and gives up after five in a row, naming the host', async () => {
        S.polls = [PENDING]
        const down = async () => { throw new TypeError('fetch failed') }
        const asked = []
        const fetchImpl = (url, init) => (String(url).endsWith('/device/token') ? (asked.push(url), down()) : fetch(url, init))
        const r = await login(['--no-open'], { fetchImpl })
        expect(r.code).toBe(1)
        expect(asked).toHaveLength(5)
        expect(r.sleeps).toEqual([5000, 5000, 5000, 5000, 5000])
        expect(r.err).toContain(`could not reach ${HOST}`)
        expect(r.err).toContain('5 tries in a row')
        expect(fs.existsSync(credentialsFile(home))).toBe(false)
    })

    it('"in a row" means in a row: eight failures with an answer between them still sign in', async () => {
        S.polls = [PENDING, PENDING, approved()]
        const pattern = ['down', 'down', 'down', 'down', 'ok', 'down', 'down', 'down', 'down']
        let n = 0
        const fetchImpl = (url, init) => {
            if (String(url).endsWith('/device/token') && pattern[n++] === 'down') throw new TypeError('fetch failed')
            return fetch(url, init)
        }
        const r = await login(['--no-open'], { fetchImpl })
        expect(r.code).toBe(0)
        expect(readLogin({ home, key: ORIGIN }).token).toBe(TOKEN)
    })

    it('a 5xx while polling counts like a network error', async () => {
        S.polls = [{ status: 503, body: {} }]
        const r = await login(['--no-open'])
        expect(r.code).toBe(1)
        expect(S.seen.filter(isPoll)).toHaveLength(5)
        expect(r.err).toContain('5 tries in a row')
    })

    it('a 429 while polling backs off by five seconds and goes on', async () => {
        S.polls = [{ status: 429, body: {} }, approved()]
        const r = await login(['--no-open'])
        expect(r.code).toBe(0)
        expect(r.sleeps).toEqual([5000, 10000])
    })

    it('a server with no accounts: says it runs without sign-in, and polls nothing', async () => {
        S.start = { status: 404, body: { error: 'login_not_available' } }
        const r = await login(['--no-open'])
        expect(r.code).toBe(1)
        expect(r.err).toContain('this di.iiii has no accounts to sign in to (it runs without sign-in)')
        expect(S.seen.filter(isPoll)).toHaveLength(0)
        expect(r.sleeps).toEqual([])
    })

    it('says the other refusals of the start in words, and writes nothing for any of them', async () => {
        const cases = [
            [{ status: 404, body: {} }, 'does not answer a sign-in'],
            [{ status: 429, body: {} }, 'too many tries'],
            [{ status: 500, body: { error: 'boom' } }, 'refused the sign-in (500, boom)'],
            [{ status: 301, body: {} }, 'answered with a redirect'],
            [{ status: 201, body: { userCode: 'BDFG-HJKL' } }, 'does not understand'],
            [{ status: 201, body: { ...GRANT, userCode: 'BDFG\u001b[2J' } }, 'does not understand']
        ]
        for (const [answer, words] of cases) {
            S.start = answer
            const r = await login(['--no-open'])
            expect(r.code, words).toBe(1)
            expect(r.err, words).toContain(words)
            expect(fs.existsSync(credentialsFile(home)), words).toBe(false)
        }
        const unreachable = await login(['--no-open'], { fetchImpl: async () => { throw new TypeError('fetch failed') } })
        expect(unreachable.code).toBe(1)
        expect(unreachable.err).toContain(`could not reach ${HOST} — check the address and the network`)
    })

    it('never follows a redirect: a token is not sent on to a host the person did not name', async () => {
        const seenInit = []
        const fetchImpl = async (url, init) => { seenInit.push(init); return new Response('', { status: 302, headers: { location: 'https://elsewhere.example/x' } }) }
        storeStub()
        const r = await login(['--no-open', '--force'], { fetchImpl })
        expect(r.code).toBe(1)
        expect(r.err).toContain('answered with a redirect to https://elsewhere.example/x')
        expect(seenInit.every((init) => init.redirect === 'manual')).toBe(true)
    })

    it('Ctrl-C ends the wait at once, says nothing was saved, and writes nothing (exit 130)', async () => {
        S.polls = [PENDING]
        const controller = new AbortController()
        const r = await login(['--no-open'], { signal: controller.signal, onSleep: (n) => { if (n === 2) controller.abort() } })
        expect(r.code).toBe(130)
        expect(r.out).toContain('stopped — nothing was saved')
        expect(S.seen.filter(isPoll)).toHaveLength(1)
        expect(fs.existsSync(credentialsFile(home))).toBe(false)
    })
})

describe('di login — who it signs in as, and what it keeps', () => {
    it('already signed in (the stored login answers 200): says who, exits 0, changes nothing; --force signs in again', async () => {
        storeStub(TOKEN)
        const before = fs.readFileSync(credentialsFile(home), 'utf8')
        const r = await login(['--no-open'])
        expect(r.code).toBe(0)
        expect(r.out).toContain(`already signed in to ${HOST} as Taron`)
        expect(S.seen.filter(isStart)).toHaveLength(0)
        expect(S.seen.find((x) => x.path.endsWith('/cli/whoami')).auth).toBe(`Bearer ${TOKEN}`)
        expect(fs.readFileSync(credentialsFile(home), 'utf8')).toBe(before)

        S.polls = [approved()]
        const forced = await login(['--no-open', '--force'])
        expect(forced.code).toBe(0)
        expect(S.seen.filter(isStart)).toHaveLength(1)
        expect(forced.out).toContain('signed in as Taron')
    })

    it('a stored login that answers 401: says it ended, and goes on to sign in again', async () => {
        storeStub('dii_cli_expired0000000.zzzzzzzz')
        S.polls = [approved()]
        const r = await login(['--no-open'])
        expect(r.code).toBe(0)
        expect(r.out).toContain(`the login stored for ${HOST} has ended — signing in again`)
        expect(readLogin({ home, key: ORIGIN }).token).toBe(TOKEN)
    })

    it('a stored login it cannot check (the host is down) does not stop a new sign-in from trying', async () => {
        storeStub(TOKEN)
        S.polls = [approved({ user: { id: 'u2', name: 'Other' } })]
        let first = true
        const fetchImpl = (url, init) => {
            if (first && String(url).endsWith('/cli/whoami')) { first = false; throw new TypeError('fetch failed') }
            return fetch(url, init)
        }
        const r = await login(['--no-open'], { fetchImpl })
        expect(r.code).toBe(0)
        expect(readLogin({ home, key: ORIGIN }).user.name).toBe('Other')
    })

    it('files a login for a tier under the tier, and asks that tier\'s own host', async () => {
        S.polls = [approved()]
        const r = await run(cmdLogin, ['login', '--no-open'])
        expect(r.code).toBe(0)
        expect(r.requested[0]).toBe('POST https://dev.diiii.xyz/serverXR/api/auth/device/start')
        expect(r.out).toContain('https://dev.diiii.xyz/device')
        expect(readLogin({ home, key: 'dev' }).site).toBe('https://dev.diiii.xyz')
        expect(Object.keys(JSON.parse(fs.readFileSync(credentialsFile(home), 'utf8')))).toEqual(['dev'])

        S.pollIndex = 0
        const prod = await run(cmdLogin, ['login', '--no-open', '--tier', 'prod'])
        expect(prod.requested[0]).toBe('POST https://di-studio.xyz/serverXR/api/auth/device/start')
        expect(Object.keys(JSON.parse(fs.readFileSync(credentialsFile(home), 'utf8'))).sort()).toEqual(['dev', 'prod'])

        // --to a tier's own address is that tier
        S.pollIndex = 0
        const same = await run(cmdLogin, ['login', '--no-open', '--to', 'https://di-studio.xyz/', '--force'])
        expect(same.code).toBe(0)
        expect(Object.keys(JSON.parse(fs.readFileSync(credentialsFile(home), 'utf8'))).sort()).toEqual(['dev', 'prod'])
    })

    it('refuses what it cannot aim at, before any request', async () => {
        const cases = [
            [['--tier', 'nope'], 'no such tier: nope'],
            [['--tier', 'staging'], '"staging" is now "dev"'],
            [['--tier', 'dev', '--to', 'https://example.org'], '--tier or --to, not both'],
            [['--to', 'example.org'], '"example.org" is not an address'],
            [['--to'], '--to wants an address'],
            [['--tier'], '--tier wants a name']
        ]
        for (const [argv, words] of cases) {
            const r = await run(cmdLogin, ['login', ...argv])
            expect(r.code, words).toBe(1)
            expect(r.err, words).toContain(words)
            expect(r.requested, words).toEqual([])
        }
    })

    it('sends no login over plain http to a public address without --insecure, and none of its requests leave first', async () => {
        const calls = []
        const fetchImpl = async (url) => { calls.push(String(url)); return new Response(JSON.stringify({ error: 'login_not_available' }), { status: 404 }) }
        const refused = await run(cmdLogin, ['login', '--to', 'http://203.0.113.9', '--no-open'], { fetchImpl })
        expect(refused.code).toBe(1)
        expect(refused.err).toContain('plain http on a network that is not yours')
        expect(calls).toEqual([])
        const allowed = await run(cmdLogin, ['login', '--to', 'http://203.0.113.9', '--no-open', '--insecure'], { fetchImpl })
        expect(calls).toHaveLength(1)
        expect(allowed.err).toContain('no accounts')
        // a machine that is yours needs no flag
        const loopback = await run(cmdLogin, ['login', '--to', 'http://192.168.1.20:4000', '--no-open'], { fetchImpl })
        expect(loopback.err).toContain('no accounts')
    })

    it('labels the terminal with its machine and version, or with --label — cleaned, one line, cut to 80', async () => {
        S.polls = [approved()]
        await login(['--no-open'])
        expect(S.seen.find(isStart).body).toEqual({ label: 'taron-laptop (di 0.4.17)' })
        S.seen.length = 0
        S.pollIndex = 0
        await login(['--no-open', '--force', '--label', 'work laptop'])
        expect(S.seen.find(isStart).body.label).toBe('work laptop')
        S.seen.length = 0
        S.pollIndex = 0
        const long = `bad\u001b[31m‮\nline${'x'.repeat(100)}`
        await login(['--no-open', '--force', '--label', long])
        const sent = S.seen.find(isStart).body.label
        expect(Array.from(sent)).toHaveLength(80)
        expect(sent).toBe(`bad[31m line${'x'.repeat(100)}`.slice(0, 80))
        // an empty --label is the default, not an empty label
        expect(labelFor({ flag: '  ', hostname: 'h', version: '1.2.3' })).toBe('h (di 1.2.3)')
        expect(labelFor({ flag: undefined, hostname: 'h', version: null })).toBe('h (di)')
        expect(labelFor({ flag: true, hostname: 'h', version: null })).toBe('h (di)')
    })

    it('is careful with what the server sent: no escape sequence reaches the terminal or the file', async () => {
        S.polls = [approved({ user: { id: 'u1', name: 'Ta\u001b[31mron‮\u0007' } })]
        const r = await login(['--no-open'])
        expect(r.out).toContain('signed in as Ta[31mron on')
        // eslint-disable-next-line no-control-regex
        expect(r.all).not.toMatch(/[\u001b\u0007‮]/)
        expect(readLogin({ home, key: ORIGIN }).user.name).toBe('Ta[31mron')
    })

    it('does not keep a token that is not one: nothing is saved for an answer it does not understand', async () => {
        S.polls = [approved({ token: 'abc' })]
        const r = await login(['--no-open'])
        expect(r.code).toBe(1)
        expect(r.err).toContain('does not understand')
        expect(fs.existsSync(credentialsFile(home))).toBe(false)
    })

    it('when the login cannot be kept it says so, without the token, and exits 1', async () => {
        S.polls = [approved()]
        // a FILE where the folder should be: the write cannot succeed
        fs.writeFileSync(path.join(home, '.config'), 'not a folder')
        const r = await login(['--no-open'])
        expect(r.code).toBe(1)
        expect(r.err).toMatch(/signed in to .* but could not keep the login on this machine \(ENOTDIR\)/)
        expect(r.all).not.toContain(SECRET)
        expect(r.out).not.toContain('signed in as')
    })

    it('says when DI_TOKEN is set, because it wins over what was just kept', async () => {
        S.polls = [approved()]
        const r = await login(['--no-open'], { env: { DI_TOKEN: 'ci-token-123' } })
        expect(r.code).toBe(0)
        expect(r.out).toContain('DI_TOKEN is set in this environment and wins')
        expect(r.all).not.toContain('ci-token-123')
        S.pollIndex = 0
        const without = await login(['--no-open', '--force'], { env: {} })
        expect(without.out).not.toContain('DI_TOKEN')
    })
})

describe('di whoami', () => {
    it('asks with the stored token and says name, host, this terminal and when it would end', async () => {
        storeStub(TOKEN)
        const r = await run(cmdWhoami, ['whoami', '--to', ORIGIN])
        expect(r.code).toBe(0)
        expect(r.out).toContain(`signed in as Taron on ${HOST}`)
        expect(r.out).toContain('this terminal: taron-laptop (di 0.4.17)')
        expect(r.out).toContain('ends 2027-01-05')
        expect(S.seen[0].auth).toBe(`Bearer ${TOKEN}`)
        expect(r.all).not.toContain(SECRET)
    })

    it('a login that has ended: says how, and what to type — with the same flags', async () => {
        storeStub('dii_cli_gone000000000000.zzzz')
        const r = await run(cmdWhoami, ['whoami', '--to', ORIGIN])
        expect(r.code).toBe(1)
        expect(r.out).toContain("this terminal's login to")
        expect(r.out).toContain('ended in the browser, or unused for too long')
        expect(r.out).toContain(`di login --to ${ORIGIN}`)
        expect(fs.existsSync(credentialsFile(home))).toBe(true)
    })

    it('no login stored: says so, exits 1, and asks nothing', async () => {
        const r = await run(cmdWhoami, ['whoami'])
        expect(r.code).toBe(1)
        expect(r.out).toContain('not signed in to dev.diiii.xyz — di login')
        expect(r.requested).toEqual([])
        const prod = await run(cmdWhoami, ['whoami', '--tier', 'prod'])
        expect(prod.out).toContain('not signed in to di-studio.xyz — di login --tier prod')
    })

    it('with DI_TOKEN set: says it wins and that the stored login is not the one in use — and still asks about the stored one', async () => {
        storeStub(TOKEN)
        const r = await run(cmdWhoami, ['whoami', '--to', ORIGIN], { env: { DI_TOKEN: 'ci' } })
        expect(r.code).toBe(0)
        expect(r.out).toContain('DI_TOKEN is set in this environment and wins')
        expect(r.out).toContain('not the login di login keeps')
        expect(S.seen[0].auth).toBe(`Bearer ${TOKEN}`)
        const none = await run(cmdWhoami, ['whoami'], { env: { DI_TOKEN: 'ci' } })
        expect(none.code).toBe(1)
        expect(none.out).toContain('DI_TOKEN is set')
    })

    it('a host that cannot be reached is not "the login ended" — and the stored login stays', async () => {
        storeStub(TOKEN)
        const r = await run(cmdWhoami, ['whoami', '--to', ORIGIN], { fetchImpl: async () => { throw new TypeError('fetch failed') } })
        expect(r.code).toBe(1)
        expect(r.err).toContain('could not reach')
        expect(r.err).toContain('may be fine')
        expect(readLogin({ home, key: ORIGIN }).token).toBe(TOKEN)
    })

    it('reads --tier prod from the prod entry and asks the prod host', async () => {
        writeLogin({ home, key: 'prod', entry: { token: TOKEN } })
        const r = await run(cmdWhoami, ['whoami', '--tier', 'prod'])
        expect(r.code).toBe(0)
        expect(r.requested).toEqual(['GET https://di-studio.xyz/serverXR/api/auth/cli/whoami'])
    })
})

describe('di logout', () => {
    it('ends it on the host with the token, then removes only that entry here', async () => {
        storeStub(TOKEN)
        writeLogin({ home, key: 'dev', entry: { token: 'dii_cli_otherother0000.s' } })
        const r = await run(cmdLogout, ['logout', '--to', ORIGIN])
        expect(r.code).toBe(0)
        expect(r.out).toContain(`signed out of ${HOST} — the login is ended there and removed here`)
        const asked = S.seen.find((x) => x.method === 'DELETE')
        expect(asked.path).toBe('/serverXR/api/auth/cli/token')
        expect(asked.auth).toBe(`Bearer ${TOKEN}`)
        expect(readLogin({ home, key: ORIGIN })).toBeNull()
        expect(readLogin({ home, key: 'dev' }).token).toBe('dii_cli_otherother0000.s')
        expect(r.all).not.toContain(SECRET)
    })

    it('a host that cannot be reached: says it could not end it there, points at the browser list, and still removes the local entry', async () => {
        storeStub(TOKEN)
        const r = await run(cmdLogout, ['logout', '--to', ORIGIN], { fetchImpl: async () => { throw new TypeError('fetch failed') } })
        expect(r.code).toBe(0)
        expect(r.err).toContain('removed here, but could not end it on')
        expect(r.err).toContain(`${ORIGIN}/device`)
        expect(readLogin({ home, key: ORIGIN })).toBeNull()
    })

    it('a login the host had already ended: says so, and removes it here', async () => {
        storeStub(TOKEN)
        S.logout = { status: 401, body: { error: 'cli_token_invalid' } }
        const r = await run(cmdLogout, ['logout', '--to', ORIGIN])
        expect(r.code).toBe(0)
        expect(r.out).toContain('the host had already ended it')
        expect(readLogin({ home, key: ORIGIN })).toBeNull()
    })

    it('no login here: says so, exits 0, and asks nothing', async () => {
        const r = await run(cmdLogout, ['logout'])
        expect(r.code).toBe(0)
        expect(r.out).toContain('not signed in to dev.diiii.xyz — nothing to do')
        expect(r.requested).toEqual([])
    })
})

describe('what the other commands take from the store', () => {
    it('`di mcp` hands the SDK the argv it always did when no flag is given, and passes --tier and --base through', () => {
        expect(mcpArgs({ flags: {}, port: 4000 })).toEqual(['--base', 'http://localhost:4000/serverXR'])
        expect(mcpArgs({ flags: {}, port: 4100 })).toEqual(['--base', 'http://localhost:4100/serverXR'])
        expect(mcpArgs({ flags: { port: '4100' }, port: 4100 })).toEqual(['--base', 'http://localhost:4100/serverXR'])
        expect(mcpArgs({ flags: { tier: 'dev' }, port: 4000 })).toEqual(['--tier', 'dev'])
        expect(mcpArgs({ flags: { tier: 'prod' }, port: 4000 })).toEqual(['--tier', 'prod'])
        // --tier local keeps `di mcp`'s own port
        expect(mcpArgs({ flags: { tier: 'local' }, port: 4100 })).toEqual(['--tier', 'local', '--base', 'http://localhost:4100/serverXR'])
        expect(mcpArgs({ flags: { base: 'https://example.org/serverXR' }, port: 4000 })).toEqual(['--base', 'https://example.org/serverXR'])
        // a base that is one of ours is that tier, so the SDK looks for that tier's login and not the `local` one
        expect(mcpArgs({ flags: { base: 'https://dev.diiii.xyz/serverXR' }, port: 4000 })).toEqual(['--tier', 'dev', '--base', 'https://dev.diiii.xyz/serverXR'])
        expect(mcpArgs({ flags: { tier: 'dev', base: 'https://x.example/serverXR' }, port: 4000 })).toEqual(['--tier', 'dev', '--base', 'https://x.example/serverXR'])
        // a token is never put in an argument
        expect(mcpArgs({ flags: { tier: 'dev', token: 'dii_cli_secret' }, port: 4000 }).join(' ')).not.toContain('secret')
    })

    it('`di move --from URL` sends DI_TOKEN first, else the login stored for that very address, else nothing', () => {
        writeLogin({ home, key: 'dev', entry: { token: 'dii_cli_devdev0000000.s' } })
        writeLogin({ home, key: 'https://example.org', entry: { token: 'dii_cli_example000000.s' } })
        expect(moveToken({ from: 'https://dev.diiii.xyz/', env: {}, home })).toBe('dii_cli_devdev0000000.s')
        expect(moveToken({ from: 'https://example.org', env: {}, home })).toBe('dii_cli_example000000.s')
        expect(moveToken({ from: 'https://example.org/serverXR', env: {}, home })).toBe('dii_cli_example000000.s')
        expect(moveToken({ from: 'https://dev.diiii.xyz', env: { DI_TOKEN: ' ci ' }, home })).toBe('ci')
        // never another host's login
        expect(moveToken({ from: 'https://other.example', env: {}, home })).toBe('')
        expect(moveToken({ from: 'https://example.org:8443', env: {}, home })).toBe('')
        expect(moveToken({ from: 'http://dev.diiii.xyz', env: {}, home })).toBe('')
        expect(moveToken({ from: undefined, env: {}, home })).toBe('')
        expect(moveToken({ from: 'https://dev.diiii.xyz', env: {}, home: path.join(home, 'nowhere') })).toBe('')
    })

    it('reads --tier, --label and --base as values, so a label with a space survives', () => {
        expect(parseArgs(['login', '--tier', 'prod', '--label', 'my laptop', '--no-open'])).toEqual({
            _: ['login'], flags: { tier: 'prod', label: 'my laptop', 'no-open': true }
        })
        expect(parseArgs(['mcp', '--base', 'https://example.org/serverXR']).flags).toEqual({ base: 'https://example.org/serverXR' })
    })
})

describe('the small helpers', () => {
    it('hasDisplay: a display on Linux, always on macOS and Windows, never over ssh', () => {
        const table = [
            [{ platform: 'linux', env: { DISPLAY: ':0' } }, true],
            [{ platform: 'linux', env: { WAYLAND_DISPLAY: 'wayland-0' } }, true],
            [{ platform: 'linux', env: {} }, false],
            [{ platform: 'linux', env: { DISPLAY: ':0', SSH_CONNECTION: 'a b c d' } }, false],
            [{ platform: 'linux', env: { DISPLAY: ':0', SSH_TTY: '/dev/pts/1' } }, false],
            [{ platform: 'darwin', env: {} }, true],
            [{ platform: 'darwin', env: { SSH_CLIENT: 'a b c' } }, false],
            [{ platform: 'win32', env: {} }, true]
        ]
        for (const [input, expected] of table) expect(hasDisplay(input), JSON.stringify(input)).toBe(expected)
    })

    it('openInBrowser listens for the opener failing, so a missing xdg-open cannot crash a login whose address is already on the screen', () => {
        const child = new EventEmitter()
        let unref = 0
        child.unref = () => { unref += 1 }
        const calls = []
        const spawnImpl = (command, args, options) => { calls.push({ command, args, options }); return child }
        openInBrowser('https://x.example/device', { platform: 'linux', spawnImpl })
        expect(calls[0]).toMatchObject({ command: 'xdg-open', args: ['https://x.example/device'], options: { stdio: 'ignore', detached: true } })
        expect(child.listenerCount('error')).toBe(1)
        expect(() => child.emit('error', new Error('spawn xdg-open ENOENT'))).not.toThrow()
        expect(unref).toBe(1)
        openInBrowser('https://x.example/device', { platform: 'darwin', spawnImpl })
        openInBrowser('https://x.example/device', { platform: 'win32', spawnImpl })
        expect(calls.slice(1).map((c) => c.command)).toEqual(['open', 'cmd'])
        // a spawn that throws is swallowed too
        expect(() => openInBrowser('https://x.example/device', { platform: 'linux', spawnImpl: () => { throw new Error('nope') } })).not.toThrow()
    })

    it('cleanText removes control and format characters, turns line breaks into a space, and cuts by characters', () => {
        expect(cleanText('a\u0007b\u001b[31mc‮\nd')).toBe('ab[31mc d')
        expect(cleanText(undefined)).toBe('')
        expect(cleanText('😀'.repeat(100), 80)).toBe('😀'.repeat(80))
    })
})

// ── the real `di`, spawned ────────────────────────────────────────────────

const childEnv = () => ({
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    DI_HOME: path.join(home, '.di'),
    DI_NO_COLOR: '1',
    DI_TOKEN: '',
    DISPLAY: '',
    WAYLAND_DISPLAY: '',
    SSH_CONNECTION: ''
})

const spawnCli = (argv) => {
    const child = spawn(process.execPath, [CLI, ...argv], { env: childEnv(), stdio: ['ignore', 'pipe', 'pipe'] })
    const seen = { out: '', err: '' }
    child.stdout.on('data', (chunk) => { seen.out += chunk })
    child.stderr.on('data', (chunk) => { seen.err += chunk })
    const done = new Promise((resolve) => child.on('close', (code, signal) => resolve({ code, signal })))
    return { child, seen, done }
}

const until = async (check, ms = 10_000) => {
    const end = Date.now() + ms
    while (Date.now() < end) {
        if (check()) return true
        await new Promise((resolve) => setTimeout(resolve, 20))
    }
    return false
}

describe('the real `di login`, spawned against the stub', () => {
    it('prints the address and the code to the pipe before the first poll, keeps the login 0600, and prints the token nowhere', async () => {
        S.start = { status: 201, body: { ...GRANT, interval: 1 } }
        S.polls = [PENDING, approved()]
        let cli = null
        let screenAtFirstPoll = null
        S.onPoll = () => { screenAtFirstPoll ??= cli.seen.out }
        cli = spawnCli(['login', '--to', ORIGIN, '--no-open'])
        const { code } = await cli.done
        expect(cli.seen.err).toBe('')
        expect(code).toBe(0)
        expect(screenAtFirstPoll).toContain(`${ORIGIN}/device`)
        expect(screenAtFirstPoll).toContain('BDFG-HJKL')
        expect(cli.seen.out).toContain('signed in as Taron')
        expect(readLogin({ home, key: ORIGIN }).token).toBe(TOKEN)
        if (posix) {
            expect(mode(credentialsFile(home))).toBe(0o600)
            expect(mode(path.dirname(credentialsFile(home)))).toBe(0o700)
        }
        expect(cli.seen.out + cli.seen.err).not.toContain(SECRET)
        // and the other two commands, through the same registration
        const who = spawnCli(['whoami', '--to', ORIGIN])
        expect((await who.done).code).toBe(0)
        expect(who.seen.out).toContain(`signed in as Taron on ${HOST}`)
        const out = spawnCli(['logout', '--to', ORIGIN])
        expect((await out.done).code).toBe(0)
        expect(readLogin({ home, key: ORIGIN })).toBeNull()
    }, 30_000)

    it('ends at once on Ctrl-C: says nothing was saved, writes nothing, exits 130', async () => {
        S.start = { status: 201, body: { ...GRANT, interval: 30 } }
        S.polls = [PENDING]
        const cli = spawnCli(['login', '--to', ORIGIN, '--no-open'])
        expect(await until(() => cli.seen.out.includes('BDFG-HJKL'))).toBe(true)
        cli.child.kill('SIGINT')
        const { code } = await cli.done
        expect(code).toBe(130)
        expect(cli.seen.out).toContain('stopped — nothing was saved')
        expect(S.seen.filter(isPoll)).toHaveLength(0)
        expect(fs.existsSync(credentialsFile(home))).toBe(false)
    }, 30_000)

    it('has a page of its own: di login --help, di help login, di help whoami, di logout --help', async () => {
        const pages = []
        for (const argv of [['login', '--help'], ['help', 'login'], ['help', 'whoami'], ['logout', '--help']]) {
            const run1 = spawnCli(argv)
            expect((await run1.done).code).toBe(0)
            pages.push(run1.seen.out)
        }
        expect(new Set(pages).size).toBe(1)
        expect(pages[0]).toContain('sign in once on this machine, from the terminal')
        expect(pages[0]).toContain('--tier dev|prod|local')
        expect(pages[0]).toContain('cannot publish or')
        const general = spawnCli(['help'])
        await general.done
        expect(general.seen.out).toContain('di login')
        expect(general.seen.out).toContain('di whoami')
    }, 30_000)
})
