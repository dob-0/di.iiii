// @vitest-environment node
//
// The refusal list for di.bo act tokens, as a unit. The real-HTTP proof is in
// httpContracts.test.js ('di.bo acting as a person'); this pins every rule's
// edges (case, trailing slash, neighbours that must stay open) without
// booting a server per path.

import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { REFUSED_THROUGH_DI_BO, refusalFor, createActTokenGate } = require('./actTokenGate.js')

describe('what a di.bo act token can never reach', () => {
    it.each([
        ['POST', '/api/auth/telegram/act-token'],
        ['POST', '/api/auth/telegram/login-link'],
        ['GET', '/api/auth/session'],
        ['DELETE', '/api/auth/session'],
        ['POST', '/api/auth/password/login'],
        ['GET', '/API/Auth/session'],
        ['GET', '/api/users'],
        ['PATCH', '/api/users/u-1'],
        ['GET', '/api/users/'],
        ['POST', '/api/spaces/mine/sync-keys'],
        ['GET', '/api/spaces/mine/sync-keys'],
        ['DELETE', '/api/spaces/mine/sync-keys/k1'],
        ['POST', '/api/integrations/ai/connect'],
        ['GET', '/api/integrations/google-drive/picker-token'],
        ['POST', '/api/dm/devices'],
        ['POST', '/api/approvals/decision'],
        ['POST', '/api/invites/redeem'],
        ['POST', '/api/invites/redeem/']
    ])('refuses %s %s', (method, path) => {
        expect(refusalFor(method, path)).toBeTruthy()
    })

    it('refuses a space patch that changes its owner or its trusted editors, and only that', () => {
        expect(refusalFor('PATCH', '/api/spaces/mine', { ownerUserId: 'someone-else' })).toBeTruthy()
        expect(refusalFor('PATCH', '/api/spaces/mine', { ownerUserId: null })).toBeTruthy()
        expect(refusalFor('PATCH', '/api/spaces/mine', { trustedUserIds: ['x'] })).toBeTruthy()
        expect(refusalFor('PATCH', '/api/spaces/mine', { label: 'A new name' })).toBeNull()
        expect(refusalFor('PATCH', '/api/spaces/mine', null)).toBeNull()
    })

    it.each([
        ['GET', '/api/spaces'],
        ['GET', '/api/spaces/mine/projects'],
        ['POST', '/api/spaces/mine/projects'],
        ['POST', '/api/spaces/mine/assets'],
        ['POST', '/api/spaces/mine/invites'],
        ['DELETE', '/api/spaces/mine/invites/i1'],
        ['GET', '/api/catalogue'],
        ['GET', '/api/authors'],
        ['GET', '/api/usersettings']
    ])('leaves %s %s to the person\'s own role', (method, path) => {
        expect(refusalFor(method, path)).toBeNull()
    })

    it('gives every rule a reason a person can read', () => {
        for (const entry of REFUSED_THROUGH_DI_BO) {
            expect(entry.rule).toBeTruthy()
            expect(String(entry.reason).length).toBeGreaterThan(20)
        }
    })
})

describe('the gate', () => {
    const make = (state) => {
        const logger = { info: vi.fn(), warn: vi.fn() }
        const gate = createActTokenGate({
            prefix: 'dii_tgact_',
            readToken: (req) => req.token,
            resolveState: () => state,
            cookieName: 'dii_serverxr_session',
            logger
        })
        return { gate, logger }
    }
    const fakeRes = () => {
        const headers = {}
        const listeners = {}
        const res = {
            statusCode: 200,
            headers,
            status (code) { this.statusCode = code; return this },
            json (body) { this.body = body; return this },
            setHeader (name, value) { headers[String(name).toLowerCase()] = value; return this },
            on (event, fn) { listeners[event] = fn; return this },
            finish () { listeners.finish?.() }
        }
        return res
    }

    it('leaves every other request alone', () => {
        const { gate } = make(null)
        const next = vi.fn()
        gate({ token: 'some-api-token', method: 'GET', path: '/api/users' }, fakeRes(), next)
        expect(next).toHaveBeenCalled()
    })

    it('answers 401 for a dead token rather than letting it fall back to a guest', () => {
        const { gate } = make(null)
        const res = fakeRes()
        const next = vi.fn()
        gate({ token: 'dii_tgact_x.y', method: 'GET', path: '/api/spaces' }, res, next)
        expect(next).not.toHaveBeenCalled()
        expect(res.statusCode).toBe(401)
    })

    it('refuses before it resolves, so a refused route says nothing about the token', () => {
        const resolveState = vi.fn(() => ({ subject: 'u-1' }))
        const gate = createActTokenGate({ prefix: 'dii_tgact_', readToken: (req) => req.token, resolveState, cookieName: 'c', logger: { info () {}, warn () {} } })
        const res = fakeRes()
        gate({ token: 'dii_tgact_x.y', method: 'GET', path: '/api/users' }, res, () => {})
        expect(res.statusCode).toBe(403)
        expect(res.body.error).toBe('not_through_di_bo')
        expect(resolveState).not.toHaveBeenCalled()
    })

    it('logs each write once, with who, through what, and how it ended', () => {
        const { gate, logger } = make({ subject: 'u-1', actTokenId: 't-1' })
        const res = fakeRes()
        gate({ token: 'dii_tgact_x.y', method: 'POST', path: '/api/spaces/mine/projects' }, res, () => {})
        res.statusCode = 201
        res.finish()
        const line = logger.info.mock.calls.map((c) => c[0]).find((l) => l.startsWith('[act-token] write'))
        expect(JSON.parse(line.replace('[act-token] write ', ''))).toEqual({
            subject: 'u-1', actor: 'di.bo', tokenId: 't-1', tier: 'member', method: 'POST', path: '/api/spaces/mine/projects', status: 201
        })
    })

    it('does not log reads', () => {
        const { gate, logger } = make({ subject: 'u-1', actTokenId: 't-1' })
        const res = fakeRes()
        gate({ token: 'dii_tgact_x.y', method: 'GET', path: '/api/spaces' }, res, () => {})
        res.finish()
        expect(logger.info).not.toHaveBeenCalled()
    })

    it('never lets the response carry a session cookie', () => {
        const { gate, logger } = make({ subject: 'u-1', actTokenId: 't-1' })
        const res = fakeRes()
        gate({ token: 'dii_tgact_x.y', method: 'POST', path: '/api/spaces' }, res, () => {})
        res.setHeader('Set-Cookie', 'dii_serverxr_session=abc; Path=/; HttpOnly')
        expect(res.headers['set-cookie']).toBeUndefined()
        res.setHeader('Set-Cookie', ['other=1', 'dii_serverxr_session=abc'])
        expect(res.headers['set-cookie']).toEqual(['other=1'])
        res.setHeader('Content-Type', 'application/json')
        expect(res.headers['content-type']).toBe('application/json')
        expect(logger.warn).toHaveBeenCalled()
    })
})

describe('tiers (actTokenTier.js) — the owner, 2026-10-07', () => {
    const { parseTelegramIds, tierFor, capForTier } = require('./actTokenTier')
    const { REFUSED_BELOW_ROOT, tierRefusalFor } = require('./actTokenGate')
    const lists = { rootIds: parseTelegramIds('111, x, 222 '), adminIds: parseTelegramIds('333') }

    it('reads the tier from server env lists, member by default', () => {
        expect(tierFor('111', lists)).toBe('root')
        expect(tierFor('333', lists)).toBe('admin')
        expect(tierFor('999', lists)).toBe('member')
        expect(tierFor('', lists)).toBe('member')
        expect(tierFor('111', {})).toBe('member')
    })

    it('only ever lowers the account', () => {
        expect(capForTier('member', { role: 'admin', isUnrestricted: true })).toEqual({ role: 'editor', isUnrestricted: false })
        expect(capForTier('member', { role: 'viewer', isUnrestricted: false })).toEqual({ role: 'viewer', isUnrestricted: false })
        expect(capForTier('admin', { role: 'editor', isUnrestricted: false })).toEqual({ role: 'editor', isUnrestricted: false })
        expect(capForTier('root', { role: 'admin', isUnrestricted: true })).toEqual({ role: 'admin', isUnrestricted: true })
    })

    it('refuses the platform settings below root, and nothing else', () => {
        for (const [method, path] of [['PATCH', '/api/config'], ['POST', '/api/admin/sandboxes/purge'], ['GET', '/api/estate/map'], ['DELETE', '/api/commons/assets/a1'], ['DELETE', '/api/spaces/s1']]) {
            expect(tierRefusalFor('admin', method, path)?.rule).toBeTruthy()
            expect(tierRefusalFor('member', method, path)?.rule).toBeTruthy()
            expect(tierRefusalFor('root', method, path)).toBeNull()
        }
        for (const [method, path] of [['GET', '/api/config'], ['PATCH', '/api/spaces/s1'], ['DELETE', '/api/spaces/s1/projects/p1'], ['DELETE', '/api/projects/p1']]) {
            expect(tierRefusalFor('member', method, path)).toBeNull()
        }
        for (const entry of REFUSED_BELOW_ROOT) expect(entry.reason.length).toBeGreaterThan(30)
    })

    it('treats a state with no tier as a member, and a dead token still answers 401', () => {
        const res = () => ({ statusCode: 200, status (c) { this.statusCode = c; return this }, json (b) { this.body = b; return this }, setHeader () { return this }, on () { return this } })
        const gate = (state) => createActTokenGate({ prefix: 'dii_tgact_', readToken: (r) => r.token, resolveState: () => state, cookieName: 'c', logger: { info () {}, warn () {} } })
        const r1 = res()
        gate({ subject: 'u' })({ token: 'dii_tgact_a.b', method: 'GET', path: '/api/estate/map' }, r1, () => {})
        expect(r1.statusCode).toBe(403)
        expect(r1.body).toMatchObject({ tier: 'member' })
        const r2 = res()
        gate(null)({ token: 'dii_tgact_a.b', method: 'GET', path: '/api/estate/map' }, r2, () => {})
        expect(r2.statusCode).toBe(401)
        const next = vi.fn()
        gate({ subject: 'u', actTier: 'root' })({ token: 'dii_tgact_a.b', method: 'GET', path: '/api/estate/map' }, res(), next)
        expect(next).toHaveBeenCalled()
    })
})
