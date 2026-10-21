// @vitest-environment node

import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { registerShareRoutes } = require('./shareRoutes.js')
const { createShareService } = require('../share/shareService.js')
const { initDb, closeDb } = require('../db.js')

// Same fake-router approach as aiConnectionRoutes.test.js.
function makeFakeRouter() {
  const routes = {}
  const record = (method) => (path, ...handlers) => { routes[`${method} ${path}`] = handlers }
  return { routes, get: record('get'), post: record('post') }
}
function makeRes() {
  const res = {
    statusCode: 200, body: null, headers: {},
    status(code) { this.statusCode = code; return this },
    json(payload) { this.body = payload; return this },
    type() { return this }, set(k, v) { this.headers[k] = v; return this },
    send(payload) { this.body = payload; return this }
  }
  return res
}
const req = (over = {}) => ({ params: {}, query: {}, body: {}, protocol: 'http', baseUrl: '/serverXR', authState: { subject: 'admin-1' }, get: (h) => ({ host: 'diiii.localhost' })[h], ...over })
// The gate is the first handler; the fake ones below record that it was in front.
const run = async (routes, key, request) => {
  const res = makeRes()
  const handlers = routes[key]
  for (const h of handlers) await h(request, res, (e) => { if (e) throw e })
  return res
}

const fake = (name, impl) => ({ name, capabilities: { text: true, image: true, video: false, link: true, maxText: 20, maxImages: 4 }, status: () => ({ name, state: 'connected', detail: 'ok' }), send: impl })

describe('shareRoutes', () => {
  let routes, gate, sent
  beforeEach(() => {
    initDb(':memory:')
    sent = vi.fn(async () => ({ url: 'https://c.example/1' }))
    gate = vi.fn((r, s, next) => next())
    const router = makeFakeRouter()
    registerShareRoutes(router, { requireAdminAlways: gate, service: createShareService({ config: { telegram: {}, bluesky: {}, mastodon: {} }, channels: [fake('alpha', sent), fake('beta', async () => { throw Object.assign(new Error('nope'), { code: 'api-error' }) })] }) })
    routes = router.routes
  })
  afterEach(() => closeDb())

  it('every route sits behind the admin gate', () => {
    for (const key of Object.keys(routes)) expect(routes[key][0]).toBe(gate)
    expect(Object.keys(routes).sort()).toEqual([
      'get /api/share/channels', 'get /api/share/posts', 'get /api/share/posts/:id', 'get /share/posts/:id/preview',
      'post /api/share/posts', 'post /api/share/posts/:id/send'
    ])
  })

  it('lists channels with their state and no secret', async () => {
    const res = await run(routes, 'get /api/share/channels', req())
    expect(res.body.channels.map((c) => [c.name, c.state])).toEqual([['alpha', 'connected'], ['beta', 'connected']])
  })

  it('drafts, reads, lists, previews and sends', async () => {
    const created = await run(routes, 'post /api/share/posts', req({ body: { text: 'hello <b>x</b>', link: 'https://diiii.xyz', channels: ['alpha', 'beta'] } }))
    expect(created.statusCode).toBe(201)
    const { id, previewUrl } = created.body.post
    expect(previewUrl).toBe(`http://diiii.localhost/serverXR/share/posts/${id}/preview`)
    expect((await run(routes, 'get /api/share/posts/:id', req({ params: { id } }))).body.post.status).toBe('draft')
    expect((await run(routes, 'get /api/share/posts', req())).body.posts[0].id).toBe(id)

    const page = await run(routes, 'get /share/posts/:id/preview', req({ params: { id } }))
    expect(page.body).toContain('data-channel="alpha"')
    expect(page.body).toContain('data-channel="beta"')
    expect(page.body).toContain('&lt;b&gt;x&lt;/b&gt;')          // escaped, never raw
    expect(page.body).toContain('prefers-color-scheme:light')
    expect(page.body).not.toMatch(/border-radius:\s*[1-9]/)
    expect(page.body).toContain('/ 20')                           // length against maxText
    expect(page.body).toContain('mono bad')                    // 40 chars > 20

    const out = await run(routes, 'post /api/share/posts/:id/send', req({ params: { id } }))
    expect(out.body.post.status).toBe('failed')
    expect(out.body.post.results.alpha.ok).toBe(true)
    expect(out.body.post.results.beta.error).toContain('nope')
    expect(sent).toHaveBeenCalledTimes(1)
  })

  it('refuses a bad draft with 400 and names the reason', async () => {
    const res = await run(routes, 'post /api/share/posts', req({ body: { text: 'x', channels: ['zz'] } }))
    expect(res.statusCode).toBe(400)
    expect(res.body.code).toBe('unknown-channel')
  })

  it('404 for a post that does not exist', async () => {
    expect((await run(routes, 'get /api/share/posts/:id', req({ params: { id: 'nope' } }))).statusCode).toBe(404)
    expect((await run(routes, 'post /api/share/posts/:id/send', req({ params: { id: 'nope' } }))).statusCode).toBe(404)
    expect((await run(routes, 'get /share/posts/:id/preview', req({ params: { id: 'nope' } }))).statusCode).toBe(404)
  })
})
