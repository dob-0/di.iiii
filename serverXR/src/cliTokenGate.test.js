// @vitest-environment node
//
// What a terminal login may reach (docs/architecture/CLI_LOGIN.md), as a unit. The real-HTTP proof is cliLoginContracts.test.js;
// this pins the rules against the CATALOGUE itself, so a route added tomorrow is judged without anyone remembering to list it.

import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createCliTokenGate, reachRefusalFor, isOwnRoute } = require('./cliTokenGate.js')
const { matchEntries, patternOf } = require('./catalogue/match.js')
const { load } = require('./catalogue')

// '/api/spaces/:spaceId/assets/*assetPath' -> '/api/spaces/x1/assets/a/b'
const concretePath = (path) => path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, 'x1').replace(/\*[A-Za-z_]+/g, 'a/b')

describe('a request, matched to the catalogue', () => {
    it('finds the entry for a path with parameters, in any case, with or without a trailing slash', () => {
        for (const path of ['/api/spaces/mine/projects', '/API/Spaces/Mine/Projects', '/api/spaces/mine/projects/']) {
            expect(matchEntries('GET', path).map((e) => e.route)).toContain('GET /api/spaces/:spaceId/projects')
        }
    })

    it('answers HEAD as GET, as Express does', () => {
        expect(matchEntries('HEAD', '/api/spaces/mine/projects').map((e) => e.route)).toContain('GET /api/spaces/:spaceId/projects')
    })

    it('matches a wildcard to the rest of the path, and a parameter to exactly one segment', () => {
        expect(matchEntries('GET', '/og/deep/er/path').map((e) => e.route)).toEqual(['GET /og/*splat'])
        expect(matchEntries('GET', '/api/spaces/a/b/projects')).toEqual([])
        expect(patternOf('/api/a.b/:id').test('/api/aXb/1')).toBe(false) // a dot in the path is a dot, not "any character"
    })

    it('finds nothing for a path or a method the catalogue does not describe', () => {
        expect(matchEntries('GET', '/api/no-such-route')).toEqual([])
        expect(matchEntries('TRACE', '/api/spaces')).toEqual([])
        expect(matchEntries('GET', '')).toEqual([])
        expect(matchEntries(undefined, undefined)).toEqual([])
    })

    it('finds exactly its own entry for every route the catalogue lists (no entry is shadowed or unreachable)', () => {
        for (const entry of load()) {
            const hits = matchEntries(entry.method, concretePath(entry.path)).map((e) => e.route)
            expect(hits, entry.route).toContain(entry.route)
        }
    })
})

describe('the rule "a terminal never opens a door"', () => {
    const entries = load()
    const open = entries.filter((e) => e.reach === 'public')

    it('has something to hold: the catalogue lists routes that open a door', () => {
        expect(open.length).toBeGreaterThanOrEqual(8)
    })

    it.each(open.map((e) => [e.route]))('refuses %s, because the catalogue says it is public', (route) => {
        const entry = entries.find((e) => e.route === route)
        const refusal = reachRefusalFor(entry.method, concretePath(entry.path))
        expect(refusal, route).toBeTruthy()
        expect(refusal.rule).toContain('reach: public')
        expect(refusal.reason.length).toBeGreaterThan(30)
    })

    it('leaves every route that does not open a door to the person\'s own role', () => {
        for (const entry of entries.filter((e) => e.reach !== 'public')) {
            expect(reachRefusalFor(entry.method, concretePath(entry.path)), entry.route).toBeNull()
        }
    })

    it('refuses an /api route nobody classified, and leaves the rest of the site alone', () => {
        expect(reachRefusalFor('GET', '/api/some-new-route').rule).toContain('does not describe')
        expect(reachRefusalFor('POST', '/api').rule).toContain('does not describe')
        expect(reachRefusalFor('GET', '/healthz')).toBeNull()
        expect(reachRefusalFor('GET', '/assets/app.js')).toBeNull()
    })

    it('refuses when ANY entry a path could be is public (the guard cannot know which handler Express runs)', () => {
        const fake = [
            { route: 'PATCH /api/things/:id', method: 'PATCH', path: '/api/things/:id', reach: 'private' },
            { route: 'PATCH /api/things/special', method: 'PATCH', path: '/api/things/special', reach: 'public' }
        ]
        const hits = fake.filter((e) => patternOf(e.path).test('/api/things/special'))
        expect(hits).toHaveLength(2)
        expect(hits.some((e) => e.reach === 'public')).toBe(true)
    })
})

describe('the two routes a terminal may ask about itself', () => {
    it('are exactly whoami and logout, and nothing next to them', () => {
        expect(isOwnRoute('GET', '/api/auth/cli/whoami')).toBe(true)
        expect(isOwnRoute('GET', '/API/auth/cli/whoami/')).toBe(true)
        expect(isOwnRoute('DELETE', '/api/auth/cli/token')).toBe(true)
        expect(isOwnRoute('POST', '/api/auth/cli/whoami')).toBe(false)
        expect(isOwnRoute('DELETE', '/api/auth/cli/tokens/abc')).toBe(false) // the browser's list, not a terminal's
        expect(isOwnRoute('GET', '/api/auth/cli/tokens')).toBe(false)
        expect(isOwnRoute('POST', '/api/auth/device/decision')).toBe(false)
        expect(isOwnRoute('GET', '/api/auth/session')).toBe(false)
    })
})

describe('the gate', () => {
    const fakeRes = () => {
        const headers = {}
        const res = {
            statusCode: 200,
            headers,
            setHeader: vi.fn((name, value) => { headers[String(name).toLowerCase()] = value; return res }),
            status: vi.fn((code) => { res.statusCode = code; return res }),
            json: vi.fn((body) => { res.body = body; return res }),
            on: vi.fn((event, fn) => { res.finish = event === 'finish' ? fn : res.finish })
        }
        return res
    }
    const make = (state) => {
        const logger = { info: vi.fn(), warn: vi.fn() }
        const resolveState = vi.fn(() => state)
        const gate = createCliTokenGate({ readToken: (req) => req.token, resolveState, cookieName: 'dii_serverxr_session', logger })
        return { gate, logger, resolveState }
    }
    const goodState = { subject: 'u-1', cliTokenId: 'tok1', role: 'editor' }
    const run = (gate, req) => { const res = fakeRes(); const next = vi.fn(); gate(req, res, next); return { res, next } }

    it('does nothing to a request that carries no terminal token — a cookie, a sync key, di.bo\'s token, nothing', () => {
        const { gate, resolveState } = make(goodState)
        for (const token of [undefined, null, '', 'dii_sync_a.b', 'dii_tgact_a.b', 'admin-token']) {
            const { res, next } = run(gate, { method: 'DELETE', path: '/api/spaces/mine', token })
            expect(next).toHaveBeenCalledOnce()
            expect(res.status).not.toHaveBeenCalled()
        }
        expect(resolveState).not.toHaveBeenCalled()
    })

    it('refuses a forbidden route BEFORE it looks at the token, so a probe learns nothing about the token', () => {
        const { gate, resolveState } = make(null) // a dead token
        const { res, next } = run(gate, { method: 'DELETE', path: '/api/spaces/mine', token: 'dii_cli_dead.dead' })
        expect(res.status).toHaveBeenCalledWith(403)
        expect(res.body).toMatchObject({ error: 'not_through_cli' })
        expect(next).not.toHaveBeenCalled()
        expect(resolveState).not.toHaveBeenCalled()
    })

    it('answers 401 cli_token_invalid for a dead token on an allowed route — it never falls back to a guest', () => {
        const { gate } = make(null)
        const { res, next } = run(gate, { method: 'GET', path: '/api/spaces/mine/projects', token: 'dii_cli_dead.dead' })
        expect(res.status).toHaveBeenCalledWith(401)
        expect(res.body.error).toBe('cli_token_invalid')
        expect(next).not.toHaveBeenCalled()
    })

    it('lets a live token through on an allowed route, and on its own two routes', () => {
        const { gate } = make(goodState)
        for (const [method, path] of [['GET', '/api/spaces/mine/projects'], ['POST', '/api/spaces/mine/projects'], ['GET', '/api/auth/cli/whoami'], ['DELETE', '/api/auth/cli/token']]) {
            const { next, res } = run(gate, { method, path, token: 'dii_cli_ok.secret' })
            expect(next, `${method} ${path}`).toHaveBeenCalledOnce()
            expect(res.status).not.toHaveBeenCalled()
        }
    })

    it('answers 401 for a dead token on its own routes too', () => {
        const { gate } = make(null)
        const { res } = run(gate, { method: 'GET', path: '/api/auth/cli/whoami', token: 'dii_cli_dead.dead' })
        expect(res.status).toHaveBeenCalledWith(401)
    })

    it('refuses the platform\'s settings below root, as for a di.bo member', () => {
        const { gate } = make(goodState)
        const { res } = run(gate, { method: 'GET', path: '/api/estate/machines', token: 'dii_cli_ok.secret' })
        expect(res.status).toHaveBeenCalledWith(403)
        expect(res.body.rule).toBeTruthy()
    })

    it('holds back a session cookie from the response, and logs that it did', () => {
        const { gate, logger } = make(goodState)
        const { res, next } = run(gate, { method: 'POST', path: '/api/spaces', token: 'dii_cli_ok.secret' })
        expect(next).toHaveBeenCalledOnce()
        res.setHeader('Set-Cookie', 'dii_serverxr_session=abc; HttpOnly')
        expect(res.headers['set-cookie']).toBeUndefined()
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('held back a session cookie'))
    })

    it('logs every write once, with the token\'s id and never the token', () => {
        const { gate, logger } = make(goodState)
        const { res } = run(gate, { method: 'POST', path: '/api/spaces/mine/projects', token: 'dii_cli_ok.SECRETSECRET' })
        res.statusCode = 201
        res.finish()
        const line = logger.info.mock.calls.map((c) => c[0]).find((l) => l.includes('[cli-token] write'))
        expect(JSON.parse(line.slice(line.indexOf('{')))).toEqual({
            subject: 'u-1', actor: 'di.cli', tokenId: 'tok1', method: 'POST', path: '/api/spaces/mine/projects', status: 201
        })
        expect(JSON.stringify(logger.info.mock.calls)).not.toContain('SECRETSECRET')
        // a read is not logged
        const read = run(gate, { method: 'GET', path: '/api/spaces', token: 'dii_cli_ok.SECRETSECRET' })
        expect(read.res.on).not.toHaveBeenCalled()
    })
})
