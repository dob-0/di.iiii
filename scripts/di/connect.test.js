// @vitest-environment node
//
// `di connect` and `di disconnect` (scripts/di/connect.mjs) against a stub of the wire format in
// docs/architecture/CLI_LOGIN.md ("Connecting a machine"): a real HTTP server on a free port, a fake clock and sleep,
// a temp folder for a home. Following itself is injected (it has its own tests: follow*.test.js); what is proved
// here is WHAT connect asks it to do, what it refuses to do, and that no key ever reaches a screen, an argument or a URL.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseArgs } from './args.mjs'
import { cmdConnect, cmdDisconnect, readConnected, syncConnected } from './connect.mjs'
import { addFollow, readFollows } from './follows.mjs'
import { paths } from './paths.mjs'

const GRANT = { deviceCode: 'devicecode-0123456789abcdef', userCode: 'BDFG-HJKL', verificationPath: '/device', expiresIn: 600, interval: 5 }
const KEY = (n) => `dii_sync_k${n}0123456789abcdef.SECRETSECRET${n}SECRETSECRET${n}SECRET`
const BODY = (spaces) => ({ scope: 'connect', user: { id: 'u1', name: 'Taron' }, keys: spaces.map((id, i) => ({ spaceId: id, name: id, key: KEY(i + 1), expiresAt: 1999999999999 })) })
const T0 = 1_800_000_000_000

let server
let ORIGIN
let S
let home
const seen = []

beforeAll(async () => {
    server = http.createServer((req, res) => {
        let raw = ''
        req.on('data', (c) => { raw += c })
        req.on('end', () => {
            seen.push({ method: req.method, url: req.url, auth: req.headers.authorization || null, body: raw })
            const reply = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
            if (req.url.endsWith('/api/auth/device/start')) return reply(201, GRANT)
            if (req.url.endsWith('/api/auth/device/token')) return reply(S.poll.status, S.poll.body)
            if (req.url.endsWith('/api/auth/connect/sync')) return reply(...(S.sync(req.headers.authorization || '') || [404, { error: 'not_found' }]))
            if (req.url.endsWith('/api/auth/connect/revoke')) return reply(...(S.revoke(req.headers.authorization || '') || [404, { error: 'not_found' }]))
            return reply(404, {})
        })
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    ORIGIN = `http://127.0.0.1:${server.address().port}`
})
afterAll(() => new Promise((resolve) => server.close(resolve)))
beforeEach(() => {
    seen.length = 0
    S = { poll: { status: 200, body: BODY(['alpha', 'beta', 'main']) }, revoke: () => [200, { revoked: true }], sync: () => [200, { scope: 'connect', keys: [] }] }
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-connect-'))
})

const run = async (fn, argv, extra = {}) => {
    const out = []
    const deps = {
        home, hostname: 'studio-mac', version: '0.4.17', platform: 'linux', env: {}, sleep: async () => {}, now: () => T0,
        say: async (t) => { out.push(String(t)) }, fail: (t) => { out.push(String(t)) }, warn: (t) => { out.push(String(t)) },
        open: () => {}, ...extra
    }
    const code = await fn(parseArgs(argv), deps)
    return { code, text: out.join('\n') }
}

describe('di connect', () => {
    it('asks for the connect scope, then follows every space it was given a key for, from now on', async () => {
        const calls = []
        const { code, text } = await run(cmdConnect, ['connect', '--from', ORIGIN, '--no-open'], {
            local: { projects: async () => ({ exists: false, ids: [] }) },
            follow: async (call) => { calls.push(call); return { ok: true } }
        })
        expect(code).toBe(0)
        const start = seen.find((r) => r.url.endsWith('/device/start'))
        expect(JSON.parse(start.body)).toMatchObject({ scope: 'connect' })
        expect(calls.map((c) => [c.spaceId, c.from, c.into])).toEqual([['alpha', ORIGIN, null], ['beta', ORIGIN, null], ['main', ORIGIN, null]])
        expect(text).toContain('BDFG-HJKL')
        expect(text).toContain('following 3 spaces')
        expect(readConnected(home).spaces).toEqual(['alpha', 'beta', 'main'])
    })

    it('follows INTO a space of that name here when the host already holds everything this copy holds', async () => {
        const calls = []
        const { code } = await run(cmdConnect, ['connect', '--from', ORIGIN, '--no-open'], {
            local: { projects: async (id) => (id === 'main' ? { exists: true, ids: [] } : { exists: false, ids: [] }) },
            hostProjects: async () => ['p1'],
            follow: async (call) => { calls.push(call); return { ok: true } }
        })
        expect(code).toBe(0)
        expect(calls.find((c) => c.spaceId === 'main').into).toBe('main')
    })

    it('SKIPS a space whose local copy holds work the host lacks: no follow, named, nothing changed', async () => {
        const calls = []
        const { code, text } = await run(cmdConnect, ['connect', '--from', ORIGIN, '--no-open'], {
            local: { projects: async (id) => (id === 'main' ? { exists: true, ids: ['p1', 'mine-1', 'mine-2'] } : { exists: false, ids: [] }) },
            hostProjects: async () => ['p1'],
            follow: async (call) => { calls.push(call); return { ok: true } }
        })
        expect(code).toBe(0)
        expect(calls.map((c) => c.spaceId)).toEqual(['alpha', 'beta'])
        expect(text).toMatch(/main — skipped: this copy holds 2 projects the host lacks/)
        expect(text).toContain('skipped 1')
        expect(readConnected(home).spaces).toEqual(['alpha', 'beta'])
    })

    it('skips rather than guesses when either side cannot be read', async () => {
        const calls = []
        const { text } = await run(cmdConnect, ['connect', '--from', ORIGIN, '--no-open'], {
            local: { projects: async () => ({ exists: true, ids: null }) },
            hostProjects: async () => ['p1'],
            follow: async (call) => { calls.push(call); return { ok: true } }
        })
        expect(calls).toEqual([])
        expect(text).toContain('could not compare this copy with the host')
    })

    it('says so, and follows nothing, when the person owns or edits no space', async () => {
        S.poll = { status: 200, body: BODY([]) }
        const calls = []
        const { code, text } = await run(cmdConnect, ['connect', '--from', ORIGIN, '--no-open'], { follow: async (c) => { calls.push(c); return { ok: true } } })
        expect(code).toBe(0)
        expect(calls).toEqual([])
        expect(text).toContain('nothing to connect')
    })

    it('a denied or expired code writes nothing', async () => {
        S.poll = { status: 400, body: { error: 'access_denied' } }
        const { code } = await run(cmdConnect, ['connect', '--from', ORIGIN, '--no-open'], { follow: async () => ({ ok: true }) })
        expect(code).toBe(1)
        expect(readConnected(home)).toBeNull()
    })

    it('never puts a key on a screen, in a URL or in the code path that starts processes', async () => {
        const { text } = await run(cmdConnect, ['connect', '--from', ORIGIN, '--no-open'], {
            local: { projects: async () => ({ exists: false, ids: [] }) },
            follow: async () => ({ ok: true })
        })
        for (const n of [1, 2, 3]) {
            expect(text).not.toContain(`SECRETSECRET${n}`)
            expect(JSON.stringify(seen.map((r) => r.url))).not.toContain(`SECRETSECRET${n}`)
        }
        // connect.mjs starts no process, so there is no argv to carry a key; the keys travel in memory to followSpace.
        const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'connect.mjs'), 'utf8')
        expect(source).not.toMatch(/child_process|spawn\(|exec\(|execFile|process\.argv/)
        expect(source).not.toMatch(/console\.|say\([^)]*\.key|fail\([^)]*\.key/)
    })

    it('refuses a plain-http host that is not yours, before asking anything', async () => {
        const { code } = await run(cmdConnect, ['connect', '--from', 'http://example.org', '--no-open'], { follow: async () => ({ ok: true }) })
        expect(code).toBe(1)
        expect(seen).toHaveLength(0)
    })
})

describe('di disconnect', () => {
    const seed = async (spaces) => {
        const data = paths(home).data
        fs.mkdirSync(data, { recursive: true })
        for (const [i, id] of spaces.entries()) await addFollow(data, id, { remote: `${ORIGIN}/serverXR`, token: KEY(i + 1), start: null })
        fs.writeFileSync(path.join(data, 'connect.json'), JSON.stringify({ remote: ORIGIN, spaces, at: 'x' }))
        return data
    }

    it('ends each connect key, stops each follow, and leaves a follow whose key is not a connect key', async () => {
        const data = await seed(['alpha', 'beta', 'main'])
        S.revoke = (auth) => (auth === `Bearer ${KEY(2)}` ? [404, { error: 'not_found' }] : [200, { revoked: true }])
        const { code, text } = await run(cmdDisconnect, ['disconnect'])
        expect(code).toBe(0)
        expect(Object.keys(readFollows(data))).toEqual(['beta'])
        expect(readConnected(home).spaces).toEqual(['beta'])
        expect(text).toContain('stopped 2 follows')
        expect(text).toContain('1 left as they were')
        expect(seen.filter((r) => r.url.endsWith('/connect/revoke'))).toHaveLength(3)
        expect(text).not.toContain('SECRETSECRET')
    })

    it('treats an already-dead key as ended, and says "nothing" when nothing was connected', async () => {
        const data = await seed(['alpha'])
        S.revoke = () => [401, { error: 'unauthorized' }]
        await run(cmdDisconnect, ['disconnect'])
        expect(readFollows(data)).toEqual({})
        const again = await run(cmdDisconnect, ['disconnect'])
        expect(again.text).toContain('nothing was connected here')
    })

    it('keeps the follow when the host cannot be reached (nothing half-undone)', async () => {
        const data = await seed(['alpha'])
        S.revoke = () => [500, { error: 'boom' }]
        await run(cmdDisconnect, ['disconnect'])
        expect(Object.keys(readFollows(data))).toEqual(['alpha'])
    })
})

describe('di connect --sync (stays connected)', () => {
    const seed = async (spaces) => {
        const data = paths(home).data
        fs.mkdirSync(data, { recursive: true })
        for (const [i, id] of spaces.entries()) await addFollow(data, id, { remote: `${ORIGIN}/serverXR`, token: KEY(i + 1), start: null })
        fs.writeFileSync(path.join(data, 'connect.json'), JSON.stringify({ remote: ORIGIN, spaces, at: 'x' }))
    }
    const keyFor = (id, n) => ({ spaceId: id, name: id, key: KEY(n) })

    it('does nothing, and asks nothing, on a machine that was never connected', async () => {
        const r = await run(syncConnected.bind(null), [], {})
        expect(seen).toHaveLength(0)
        expect(r.code.code).toBe(0)
    })

    it('shows a connect key (bearer, never in the URL) and follows only the spaces gained since', async () => {
        await seed(['alpha'])
        S.sync = () => [200, { scope: 'connect', keys: [keyFor('alpha', 1), keyFor('gamma', 7)] }]
        const calls = []
        const out = []
        const r = await syncConnected({
            home, say: async (t) => { out.push(t) }, warn: (t) => out.push(t), fail: (t) => out.push(t), now: () => T0,
            local: { projects: async () => ({ exists: false, ids: [] }) },
            follow: async (c) => { calls.push(c); return { ok: true } }
        })
        expect(r.code).toBe(0)
        expect(calls.map((c) => c.spaceId)).toEqual(['gamma'])
        expect(readConnected(home).spaces).toEqual(['alpha', 'gamma'])
        const hit = seen.find((x) => x.url.endsWith('/connect/sync'))
        expect(hit.auth).toBe(`Bearer ${KEY(1)}`)
        expect(JSON.stringify(seen.map((x) => x.url))).not.toContain('SECRETSECRET')
        expect(out.join('\n')).not.toContain('SECRETSECRET')
    })

    it('skips a new space whose local copy holds work the host lacks, like connect does', async () => {
        await seed(['alpha'])
        S.sync = () => [200, { scope: 'connect', keys: [keyFor('gamma', 7)] }]
        const calls = []
        const out = []
        await syncConnected({
            home, say: async (t) => { out.push(t) }, warn: (t) => out.push(t), now: () => T0,
            local: { projects: async () => ({ exists: true, ids: ['mine'] }) }, hostProjects: async () => [],
            follow: async (c) => { calls.push(c); return { ok: true } }
        })
        expect(calls).toEqual([])
        expect(out.join('\n')).toMatch(/gamma — skipped: this copy holds 1 project/)
        expect(readConnected(home).spaces).toEqual(['alpha'])
    })

    it('says so loudly when the host refuses (key ended) and changes nothing', async () => {
        await seed(['alpha'])
        S.sync = () => [404, { error: 'not_found' }]
        const out = []
        const r = await syncConnected({ home, say: async (t) => { out.push(t) }, warn: (t) => out.push(t), follow: async () => ({ ok: true }) })
        expect(r.code).toBe(1)
        expect(out.join('\n')).toContain('could not check')
        expect(readConnected(home).spaces).toEqual(['alpha'])
    })

    it('quiet when nothing is new, and the CLI flag routes to it', async () => {
        await seed(['alpha'])
        S.sync = () => [200, { scope: 'connect', keys: [keyFor('alpha', 1)] }]
        const r = await run(cmdConnect, ['connect', '--sync'], { follow: async () => ({ ok: true }) })
        expect(r.code).toBe(0)
        expect(r.text).toContain('no new spaces')
    })
})
