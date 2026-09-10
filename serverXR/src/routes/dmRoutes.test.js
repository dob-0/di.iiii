// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { registerDmRoutes } = require('./dmRoutes.js')

const makeRouter = () => {
    const routes = {}
    const record = (method) => (path, ...handlers) => { routes[`${method} ${path}`] = handlers.at(-1) }
    return { routes, get: record('get'), post: record('post'), delete: record('delete'), use: () => {} }
}

const makeRes = () => ({
    statusCode: 200, body: null, ended: false,
    status(code) { this.statusCode = code; return this },
    json(payload) { this.body = payload; return this },
    end() { this.ended = true; return this }
})

const KEY = 'B'.repeat(87) + '='

const setup = ({ people = {}, devices = {} } = {}) => {
    const router = makeRouter()
    registerDmRoutes(router, {
        deps: {
            users: { findUserById: (id) => people[id] || null },
            store: {
                publishDevice: vi.fn(({ userId, publicKey }) => (
                    /^[A-Za-z0-9+/]{86,90}={0,2}$/.test(publicKey)
                        ? { device: { id: 'd1', userId, publicKey } }
                        : { error: 'not_a_public_key' }
                )),
                listDevices: (id) => devices[id] || [],
                forgetDevice: vi.fn(() => true),
                forgetAllDevices: vi.fn(() => 2)
            }
        }
    })
    return router
}

const call = async (handler, { authState = null, body = {}, params = {} } = {}) => {
    const res = makeRes()
    await handler({ authState, body, params }, res, (e) => { throw e })
    return res
}

const account = (subject, spaces = [], extra = {}) => ({
    authenticated: true, type: 'session', subject, spaces, ...extra
})

describe('publishing my own device', () => {
    it('takes a real key from an account', async () => {
        const router = setup()
        const res = await call(router.routes['post /api/dm/devices'], {
            authState: account('u1'), body: { publicKey: KEY, label: 'laptop' }
        })
        expect(res.statusCode).toBe(201)
    })

    it('refuses a guest — a disposable identity cannot be somebody you talk to', async () => {
        const router = setup()
        for (const state of [null, account('guest:abc'), { authenticated: true, type: 'token', subject: 'api' }]) {
            const res = await call(router.routes['post /api/dm/devices'], { authState: state, body: { publicKey: KEY } })
            expect(res.statusCode).toBe(401)
        }
    })

    it('refuses anything that is not a key', async () => {
        const router = setup()
        const res = await call(router.routes['post /api/dm/devices'], {
            authState: account('u1'), body: { publicKey: 'hello' }
        })
        expect(res.statusCode).toBe(400)
    })
})

describe('looking somebody up', () => {
    const people = {
        u2: { id: 'u2', display_name: 'Someone', spaces: ['dilijan'], isUnrestricted: false },
        u3: { id: 'u3', display_name: 'A stranger', spaces: ['elsewhere'], isUnrestricted: false },
        owner: { id: 'owner', display_name: 'The owner', spaces: [], isUnrestricted: true }
    }
    const devices = { u2: [{ id: 'd2', publicKey: KEY, label: 'phone', lastSeenAt: 1 }], u3: [{ id: 'd3', publicKey: KEY }] }

    it('hands over the keys of somebody you share a space with', async () => {
        const router = setup({ people, devices })
        const res = await call(router.routes['get /api/dm/devices/:userId'], {
            authState: account('u1', ['dilijan']), params: { userId: 'u2' }
        })
        expect(res.statusCode).toBe(200)
        expect(res.body.devices[0].publicKey).toBe(KEY)
    })

    // The refusal that matters: no directory of strangers.
    it('refuses somebody you share nothing with', async () => {
        const router = setup({ people, devices })
        const res = await call(router.routes['get /api/dm/devices/:userId'], {
            authState: account('u1', ['dilijan']), params: { userId: 'u3' }
        })
        expect(res.statusCode).toBe(404)
    })

    // And it must not become a way to ask whether an account exists at all.
    it('answers a stranger and a person who does not exist identically', async () => {
        const router = setup({ people, devices })
        const stranger = await call(router.routes['get /api/dm/devices/:userId'], {
            authState: account('u1', ['dilijan']), params: { userId: 'u3' }
        })
        const nobody = await call(router.routes['get /api/dm/devices/:userId'], {
            authState: account('u1', ['dilijan']), params: { userId: 'does-not-exist' }
        })
        expect(stranger.statusCode).toBe(nobody.statusCode)
        expect(stranger.body).toEqual(nobody.body)
    })

    it('an unrestricted account shares a space with everybody, both ways', async () => {
        const router = setup({ people, devices })
        const ownerAsking = await call(router.routes['get /api/dm/devices/:userId'], {
            authState: account('owner', [], { isUnrestricted: true }), params: { userId: 'u3' }
        })
        expect(ownerAsking.statusCode).toBe(200)

        const askingOwner = await call(router.routes['get /api/dm/devices/:userId'], {
            authState: account('u1', ['nothing-in-common']), params: { userId: 'owner' }
        })
        expect(askingOwner.statusCode).toBe(200)
    })

    it('hands over public keys and nothing else about the person', async () => {
        const router = setup({ people, devices })
        const res = await call(router.routes['get /api/dm/devices/:userId'], {
            authState: account('u1', ['dilijan']), params: { userId: 'u2' }
        })
        expect(Object.keys(res.body).sort()).toEqual(['devices', 'label', 'userId'])
        expect(JSON.stringify(res.body)).not.toMatch(/email|password|token/i)
    })
})

describe('taking a device back', () => {
    it('forgets one, and forgets all', async () => {
        const router = setup()
        const one = await call(router.routes['delete /api/dm/devices/:deviceId'], {
            authState: account('u1'), params: { deviceId: 'd1' }
        })
        expect(one.statusCode).toBe(204)
        const all = await call(router.routes['delete /api/dm/devices'], { authState: account('u1') })
        expect(all.body.forgotten).toBe(2)
    })
})
