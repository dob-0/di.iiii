// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { registerPasswordAuthRoutes } = require('./passwordAuthRoutes.js')
const { hashPassword } = require('../passwordHash.js')

// A router that keeps the handlers, and a res that keeps what was said.
const makeRouter = () => {
    const routes = {}
    const record = (method) => (path, ...handlers) => { routes[`${method} ${path}`] = handlers.at(-1) }
    return { routes, get: record('get'), post: record('post'), use: () => {} }
}

const makeRes = () => ({
    statusCode: 200,
    body: null,
    redirected: null,
    req: {},
    status(code) { this.statusCode = code; return this },
    json(payload) { this.body = payload; return this },
    redirect(url) { this.redirected = url; return this }
})

const setup = ({ users = [], mailConfigured = true } = {}) => {
    const rows = new Map(users.map((u) => [u.id, u]))
    const sent = []
    const minted = []
    let nextId = users.length

    const store = {
        findPasswordUser: (identifier) => [...rows.values()].find((u) => (
            u.email === String(identifier).toLowerCase() || u.username === String(identifier).toLowerCase()
        )) || null,
        findPasswordUserByEmail: (email) => [...rows.values()].find((u) => u.email === String(email).toLowerCase()) || null,
        createPasswordUser: ({ email, username, displayName, passwordHash }) => {
            if (email && [...rows.values()].some((u) => u.email === email)) return { error: 'email_taken' }
            const user = {
                id: `u${++nextId}`, provider: 'password', email, username,
                display_name: displayName, role: 'editor', spaces: [], password_hash: passwordHash,
                email_verified_at: null
            }
            rows.set(user.id, user)
            return { user }
        },
        setUserPasswordHash: (id, hash) => { rows.get(id).password_hash = hash; return rows.get(id) },
        markEmailVerified: (id) => { rows.get(id).email_verified_at = Date.now(); return rows.get(id) },
        findUserById: (id) => rows.get(id) || null
    }

    const tokens = {
        mintAuthToken: ({ kind, userId }) => {
            const token = `dii_auth_${kind}.${userId}`
            minted.push({ kind, userId, token })
            return { token, expiresAt: Date.now() + 60000 }
        },
        consumeAuthToken: (token, kind) => {
            const entry = minted.find((m) => m.token === token && m.kind === kind && !m.spent)
            if (!entry) return null
            entry.spent = true
            return { userId: entry.userId, kind }
        }
    }

    const mailer = {
        isConfigured: () => mailConfigured,
        readConfig: () => ({ siteUrl: 'https://di-studio.xyz' }),
        sendMail: async (message) => { sent.push(message); return { ok: true } }
    }

    const router = makeRouter()
    const issued = []
    registerPasswordAuthRoutes(router, {
        issueSessionForUser: (res, user) => { issued.push(user); return { authenticated: true, subject: user.id, label: user.display_name } },
        frontendUrl: 'https://di-studio.xyz',
        deps: { store, mailer, tokens }
    })
    return { router, rows, sent, minted, issued, store }
}

const call = async (handler, { body = {}, query = {} } = {}) => {
    const res = makeRes()
    await handler({ body, query }, res, (e) => { throw e })
    return res
}

describe('registering a first-party account', () => {
    let ctx
    beforeEach(() => { ctx = setup() })

    it('creates an account and signs the person straight in', async () => {
        const res = await call(ctx.router.routes['post /api/auth/password/register'], {
            body: { email: 'Gevorg@Example.com ', password: 'a good long password', displayName: 'Gevorg' }
        })
        expect(res.statusCode).toBe(201)
        expect(res.body.authenticated).toBe(true)
        // Normalized on the way in: one address is one account, whatever the caps.
        expect(ctx.store.findPasswordUserByEmail('gevorg@example.com')).toBeTruthy()
    })

    // The rule the whole file is built on.
    it('never grants a role or a space', async () => {
        await call(ctx.router.routes['post /api/auth/password/register'], {
            body: { email: 'new@example.com', password: 'a good long password', role: 'admin', spaces: ['main'], isUnrestricted: true }
        })
        const user = ctx.store.findPasswordUserByEmail('new@example.com')
        expect(user.role).toBe('editor')
        expect(user.spaces).toEqual([])
        expect(user.isUnrestricted).toBeFalsy()
    })

    it('refuses a short password, and stores nothing', async () => {
        const res = await call(ctx.router.routes['post /api/auth/password/register'], {
            body: { email: 'short@example.com', password: 'seven77' }
        })
        expect(res.statusCode).toBe(400)
        expect(ctx.store.findPasswordUserByEmail('short@example.com')).toBe(null)
    })

    it('never stores the password itself', async () => {
        await call(ctx.router.routes['post /api/auth/password/register'], {
            body: { email: 'secret@example.com', password: 'the password itself' }
        })
        const user = ctx.store.findPasswordUserByEmail('secret@example.com')
        expect(user.password_hash).not.toContain('the password itself')
        expect(user.password_hash.startsWith('scrypt$')).toBe(true)
    })

    // An endpoint that says "already registered" is an endpoint that tells a
    // stranger which of your people have accounts.
    it('does not reveal that an address is taken', async () => {
        await call(ctx.router.routes['post /api/auth/password/register'], {
            body: { email: 'taken@example.com', password: 'a good long password' }
        })
        const second = await call(ctx.router.routes['post /api/auth/password/register'], {
            body: { email: 'taken@example.com', password: 'another good password' }
        })
        expect(second.statusCode).toBe(409)
        expect(second.body.error).not.toMatch(/taken|exists|already registered/i)
    })

    it('sends a verification message when there is mail, and says so when there is not', async () => {
        const withMail = await call(ctx.router.routes['post /api/auth/password/register'], {
            body: { email: 'verify@example.com', password: 'a good long password' }
        })
        expect(withMail.body.verification).toBe('sent')
        expect(ctx.sent.at(-1).to).toBe('verify@example.com')

        const offline = setup({ mailConfigured: false })
        const res = await call(offline.router.routes['post /api/auth/password/register'], {
            body: { email: 'nomail@example.com', password: 'a good long password' }
        })
        expect(res.body.verification).toBe('no_mailer')
        expect(offline.sent).toHaveLength(0)
    })

    // The camp: a laptop with no mail, and an honest limit rather than a lie.
    it('takes a username with no address at all, and says what that costs', async () => {
        const res = await call(ctx.router.routes['post /api/auth/password/register'], {
            body: { username: 'gor', password: 'a good long password' }
        })
        expect(res.statusCode).toBe(201)
        expect(res.body.note).toMatch(/nobody but an admin can recover it/i)
    })

    it('refuses a username that could be mistaken for something else', async () => {
        for (const username of ['ab', 'has space', 'a@b', '-leading', 'x'.repeat(33)]) {
            const res = await call(ctx.router.routes['post /api/auth/password/register'], {
                body: { username, password: 'a good long password' }
            })
            expect(res.statusCode).toBe(400)
        }
    })
})

describe('signing in with a password', () => {
    let ctx
    beforeEach(async () => {
        ctx = setup()
        await call(ctx.router.routes['post /api/auth/password/register'], {
            body: { email: 'person@example.com', password: 'a good long password' }
        })
    })

    it('accepts the right password', async () => {
        const res = await call(ctx.router.routes['post /api/auth/password/login'], {
            body: { identifier: 'person@example.com', password: 'a good long password' }
        })
        expect(res.body.authenticated).toBe(true)
    })

    // Same words, same status, for a wrong password and for an account that
    // does not exist. The difference is only ever useful to someone probing.
    it('answers a wrong password and an unknown person identically', async () => {
        const wrong = await call(ctx.router.routes['post /api/auth/password/login'], {
            body: { identifier: 'person@example.com', password: 'not the password' }
        })
        const nobody = await call(ctx.router.routes['post /api/auth/password/login'], {
            body: { identifier: 'nobody@example.com', password: 'not the password' }
        })
        expect(wrong.statusCode).toBe(401)
        expect(nobody.statusCode).toBe(401)
        expect(wrong.body).toEqual(nobody.body)
    })

    it('rewrites a password stored at an old cost, once, on sign-in', async () => {
        const user = ctx.store.findPasswordUserByEmail('person@example.com')
        user.password_hash = 'scrypt$16384$8$1$' + Buffer.from('salt-16-bytes!!!').toString('base64') + '$'
            + (await hashPassword('a good long password')).split('$')[5]
        // (a deliberately mismatched cheap hash — the point is the branch, so
        // give it one that will not verify and assert we did not rehash)
        const res = await call(ctx.router.routes['post /api/auth/password/login'], {
            body: { identifier: 'person@example.com', password: 'a good long password' }
        })
        expect(res.statusCode).toBe(401)
        expect(ctx.store.findPasswordUserByEmail('person@example.com').password_hash.startsWith('scrypt$16384$')).toBe(true)
    })
})

describe('forgetting a password', () => {
    let ctx
    beforeEach(async () => {
        ctx = setup()
        await call(ctx.router.routes['post /api/auth/password/register'], {
            body: { email: 'person@example.com', password: 'a good long password' }
        })
        ctx.sent.length = 0
    })

    it('says the same thing whether or not the address is known', async () => {
        const known = await call(ctx.router.routes['post /api/auth/password/forgot'], { body: { email: 'person@example.com' } })
        const unknown = await call(ctx.router.routes['post /api/auth/password/forgot'], { body: { email: 'nobody@example.com' } })
        expect(known.body).toEqual(unknown.body)
        expect(ctx.sent).toHaveLength(1)
    })

    it('refuses honestly where there is no mail, rather than pretending', async () => {
        const offline = setup({ mailConfigured: false })
        const res = await call(offline.router.routes['post /api/auth/password/forgot'], { body: { email: 'a@b.co' } })
        expect(res.statusCode).toBe(503)
        expect(res.body.error).toMatch(/cannot send mail/i)
    })

    it('a reset link sets a new password once, and verifies the address', async () => {
        await call(ctx.router.routes['post /api/auth/password/forgot'], { body: { email: 'person@example.com' } })
        const token = ctx.minted.at(-1).token

        const first = await call(ctx.router.routes['post /api/auth/password/reset'], {
            body: { token, password: 'a brand new password' }
        })
        expect(first.body.authenticated).toBe(true)
        expect(ctx.store.findPasswordUserByEmail('person@example.com').email_verified_at).toBeTruthy()

        const again = await call(ctx.router.routes['post /api/auth/password/reset'], {
            body: { token, password: 'a third password entirely' }
        })
        expect(again.statusCode).toBe(400)

        // and the new password is the one that works now
        const login = await call(ctx.router.routes['post /api/auth/password/login'], {
            body: { identifier: 'person@example.com', password: 'a brand new password' }
        })
        expect(login.body.authenticated).toBe(true)
    })

    it('refuses a reset that would set a password too short to be one', async () => {
        await call(ctx.router.routes['post /api/auth/password/forgot'], { body: { email: 'person@example.com' } })
        const token = ctx.minted.at(-1).token
        const res = await call(ctx.router.routes['post /api/auth/password/reset'], { body: { token, password: 'short' } })
        expect(res.statusCode).toBe(400)
    })

    // A mail client that pre-fetches links must not burn the reset before the
    // person has seen the form.
    it('the GET hands over a form and spends nothing', async () => {
        await call(ctx.router.routes['post /api/auth/password/forgot'], { body: { email: 'person@example.com' } })
        const token = ctx.minted.at(-1).token
        const res = await call(ctx.router.routes['get /api/auth/password/reset'], { query: { token } })
        expect(res.redirected).toContain('auth=reset')
        const used = await call(ctx.router.routes['post /api/auth/password/reset'], { body: { token, password: 'a brand new password' } })
        expect(used.body.authenticated).toBe(true)
    })
})

describe('signing in without a password', () => {
    let ctx
    beforeEach(async () => {
        ctx = setup()
        await call(ctx.router.routes['post /api/auth/password/register'], {
            body: { email: 'person@example.com', password: 'a good long password' }
        })
        ctx.sent.length = 0
    })

    it('mails a link that works once', async () => {
        await call(ctx.router.routes['post /api/auth/password/magic'], { body: { email: 'person@example.com' } })
        const token = ctx.minted.at(-1).token
        const first = await call(ctx.router.routes['get /api/auth/password/magic'], { query: { token } })
        expect(first.redirected).toContain('auth=ok')
        const second = await call(ctx.router.routes['get /api/auth/password/magic'], { query: { token } })
        expect(second.redirected).toContain('auth=error')
    })

    it('tells a stranger nothing about who has an account', async () => {
        const known = await call(ctx.router.routes['post /api/auth/password/magic'], { body: { email: 'person@example.com' } })
        const unknown = await call(ctx.router.routes['post /api/auth/password/magic'], { body: { email: 'nobody@example.com' } })
        expect(known.body).toEqual(unknown.body)
    })

    // The kinds must not be interchangeable, whatever route they arrive at.
    it('will not take a verification token as a sign-in', async () => {
        const verifyToken = ctx.minted.find((m) => m.kind === 'verify').token
        const res = await call(ctx.router.routes['get /api/auth/password/magic'], { query: { token: verifyToken } })
        expect(res.redirected).toContain('auth=error')
    })
})
