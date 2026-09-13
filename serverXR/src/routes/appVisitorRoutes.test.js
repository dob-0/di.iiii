// @vitest-environment node

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { registerAppVisitorRoutes } = require('./appVisitorRoutes.js')

const makeRouter = () => {
    const routes = []
    const add = (method) => (path, ...rest) => {
        routes.push({ method, path, middleware: rest.slice(0, -1), handler: rest[rest.length - 1] })
    }
    return { routes, get: add('GET'), put: add('PUT') }
}

const makeRes = () => {
    const res = { statusCode: 200, body: null }
    res.status = (code) => { res.statusCode = code; return res }
    res.json = (payload) => { res.body = payload; return res }
    return res
}

const allowAdmin = (req, res, next) => next()

const fakeBook = () => ({
    calls: [],
    summary: () => ({ agents: [{ agent: 'curl', kind: 'anonymous' }], totals: {} }),
    setBlocked(agent, blocked) {
        if (agent === 'browser') throw Object.assign(new Error('"browser" is not one program and cannot be blocked.'), { status: 400 })
        this.calls.push([agent, blocked])
        return { agent, blocked }
    }
})

describe('guest book routes', () => {
    it('gates both routes on admin, first in line', () => {
        const router = makeRouter()
        registerAppVisitorRoutes(router, { requireAdminAlways: allowAdmin, guestBook: fakeBook() })
        expect(router.routes.map((r) => `${r.method} ${r.path}`)).toEqual([
            'GET /api/admin/app-visitors',
            'PUT /api/admin/app-visitors/blocks/:agent'
        ])
        for (const route of router.routes) expect(route.middleware[0]).toBe(allowAdmin)
    })

    it('says a local install keeps no guest book, instead of an empty list', () => {
        const router = makeRouter()
        registerAppVisitorRoutes(router, { requireAdminAlways: allowAdmin, guestBook: fakeBook(), isEnabled: () => false })
        const res = makeRes()
        router.routes[0].handler({}, res, () => {})
        expect(res.body).toEqual({ enabled: false, agents: [], totals: {} })
    })

    it('lists the guest book when enabled', () => {
        const router = makeRouter()
        registerAppVisitorRoutes(router, { requireAdminAlways: allowAdmin, guestBook: fakeBook() })
        const res = makeRes()
        router.routes[0].handler({}, res, () => {})
        expect(res.body.enabled).toBe(true)
        expect(res.body.agents[0].agent).toBe('curl')
    })

    it('toggles a block, and refuses a body that does not say which way', () => {
        const book = fakeBook()
        const router = makeRouter()
        registerAppVisitorRoutes(router, { requireAdminAlways: allowAdmin, guestBook: book })
        const put = router.routes[1].handler

        const ok = makeRes()
        put({ params: { agent: 'curl' }, body: { blocked: true } }, ok, () => {})
        expect(ok.body).toEqual({ agent: 'curl', blocked: true })
        expect(book.calls).toEqual([['curl', true]])

        const vague = makeRes()
        put({ params: { agent: 'curl' }, body: { blocked: 'yes' } }, vague, () => {})
        expect(vague.statusCode).toBe(400)

        const browser = makeRes()
        put({ params: { agent: 'browser' }, body: { blocked: true } }, browser, () => {})
        expect(browser.statusCode).toBe(400)
        expect(browser.body.error).toMatch(/cannot be blocked/)
    })
})
