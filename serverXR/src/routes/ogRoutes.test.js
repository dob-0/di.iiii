import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const { ogHtml } = createRequire(import.meta.url)('./ogRoutes')

describe('link preview cards', () => {
  it('names the space, not the platform', () => {
    const h = ogHtml({ url: 'https://di-studio.xyz/br_id_ge', title: 'br_id_ge', description: 'a rite in five acts', image: '/og/br-id-ge.png' })
    expect(h).toContain('<meta property="og:title" content="br_id_ge">')
    expect(h).not.toContain('browser-native XR authoring')
    // the whole point: the card must not be the platform tile
    expect(h).not.toContain('/brand/og-image.png')
  })

  it('escapes a title that carries markup', () => {
    const h = ogHtml({ url: 'https://x/y', title: 'a "<script>alert(1)</script>" space', description: 'd' })
    expect(h).not.toContain('<script>')
    expect(h).toContain('&lt;script&gt;')
  })

  it('a quote in a title cannot break out of the content attribute', () => {
    const h = ogHtml({ url: 'https://x/y', title: 'x" data-evil="1', description: 'd' })
    const line = h.split('\n').find((l) => l.includes('og:title'))
    expect(line).toBe('<meta property="og:title" content="x&quot; data-evil=&quot;1">')
  })

  it('falls back to the platform tile when a space has no card', () => {
    const h = ogHtml({ url: 'https://x/y', title: 't', description: 'd' })
    expect(h).toContain('/brand/og-image.png')
  })

  it('sends a human on to the real page rather than dead-ending', () => {
    const h = ogHtml({ url: 'https://di-studio.xyz/br_id_ge', title: 't', description: 'd' })
    expect(h).toContain('http-equiv="refresh"')
    expect(h).toContain('rel="canonical" href="https://di-studio.xyz/br_id_ge"')
  })
})

// ── the route, mounted the way index.js mounts it ─────────────────────────
// Everything above tests ogHtml(), the pure builder. None of it touches the
// ROUTE, which is how the path shipped wrong: declared '/serverXR/og/*splat'
// inside a router that index.js already mounts at '/serverXR', so the server
// really answered '/serverXR/serverXR/og/…'. nginx proxies crawlers to
// '/serverXR/og$uri', so every link preview on prod became a 404 — worse than
// the platform tile it replaced. A builder test can never see that; only
// mounting can.
describe('the og route, through the real mount', () => {
  const express = createRequire(import.meta.url)('express')
  const { registerOgRoutes } = createRequire(import.meta.url)('./ogRoutes')

  const app = (() => {
    const a = express()
    const router = express.Router()
    registerOgRoutes(router, {
      loadSpaceMeta: async (h) => (h === 'br_id_ge'
        ? { title: 'br_id_ge', description: 'a rite', isPublic: true }
        : null),
      siteOrigin: 'https://di-studio.xyz',
    })
    a.use('/serverXR', router)   // <- exactly what index.js does
    return a
  })()

  const hit = (path) => new Promise((resolve) => {
    const server = app.listen(0, async () => {
      const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`)
      const body = await r.text()
      server.close(() => resolve({ status: r.status, body }))
    })
  })

  it('answers the path nginx actually proxies to', async () => {
    const r = await hit('/serverXR/og/br_id_ge')
    expect(r.status).toBe(200)
    expect(r.body).toContain('<meta property="og:title" content="br_id_ge">')
  })

  it('does NOT answer the double-prefixed path', async () => {
    expect((await hit('/serverXR/serverXR/og/br_id_ge')).status).toBe(404)
  })

  it('an unknown space still gets a card, never a 404', async () => {
    const r = await hit('/serverXR/og/nothing-here')
    expect(r.status).toBe(200)
    expect(r.body).toContain('/brand/og-image.png')
  })
})

// ── the public origin ─────────────────────────────────────────────────────
// nginx proxies the crawler path to http://server:4000, so the request's own
// Host is the compose service name. That address shipped live inside og:url,
// <link rel=canonical> AND the meta refresh — a crawler publishes those and may
// cache them. Nothing above could see it: every earlier test calls ogHtml()
// with a url it supplies itself.
describe('the origin a card advertises', () => {
  const express = createRequire(import.meta.url)('express')
  const { registerOgRoutes } = createRequire(import.meta.url)('./ogRoutes')

  const build = (siteOrigin = '') => {
    const a = express()
    const router = express.Router()
    registerOgRoutes(router, {
      // EXACT match only, deliberately — this is what the real loadSpaceMeta
      // does (a selectById). A stub that normalized would test itself.
      loadSpaceMeta: async (h) => (h === 'br-id-ge'
        ? { id: 'br-id-ge', label: 'br_id_ge', description: 'a rite', isPublic: true }
        : null),
      siteOrigin,
    })
    a.use('/serverXR', router)
    return a
  }

  // node:http, not fetch — fetch silently DROPS a Host header (it is a
  // forbidden header name), so the one case that matters here, nginx arriving
  // with `Host: server:4000`, could never be posed and the test passed against
  // the broken build as happily as against the fixed one.
  const http = createRequire(import.meta.url)('node:http')
  const hit = (app, path, headers = {}) => new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const req = http.request(
        { host: '127.0.0.1', port: server.address().port, path, headers },
        (res) => {
          let body = ''
          res.on('data', (c) => { body += c })
          res.on('end', () => server.close(() => resolve({ status: res.statusCode, body })))
        },
      )
      req.on('error', (e) => server.close(() => reject(e)))
      req.end()
    })
  })

  it('never puts the internal service name in a card', async () => {
    // Exactly what nginx sent before the Host header was preserved.
    const r = await hit(build(), '/serverXR/og/br_id_ge', { host: 'server:4000' })
    expect(r.body).not.toContain('server:4000')
    expect(r.body).not.toContain('localhost')
  })

  it('uses the forwarded host nginx now sets', async () => {
    const r = await hit(build(), '/serverXR/og/br_id_ge', {
      host: 'server:4000',
      'x-forwarded-host': 'staging.di-studio.xyz',
      'x-forwarded-proto': 'https',
    })
    expect(r.body).toContain('content="https://staging.di-studio.xyz/br_id_ge"')
  })

  it('an explicit SITE_ORIGIN wins over anything the request claims', async () => {
    const r = await hit(build('https://di-studio.xyz'), '/serverXR/og/br_id_ge', {
      host: 'evil.example',
      'x-forwarded-host': 'evil.example',
    })
    expect(r.body).toContain('content="https://di-studio.xyz/br_id_ge"')
    expect(r.body).not.toContain('evil.example')
  })

  it('resolves the shared handle, not just the exact space id', async () => {
    // br_id_ge is the URL people share; br-id-ge is the id in the database.
    const r = await hit(build('https://di-studio.xyz'), '/serverXR/og/br_id_ge')
    expect(r.body).toContain('<meta property="og:title" content="br_id_ge">')
    expect(r.body).toContain('/og/br-id-ge.png')
    expect(r.body).not.toContain('browser-native XR authoring')
  })

  it('the fallback card carries an absolute image too', async () => {
    const r = await hit(build('https://di-studio.xyz'), '/serverXR/og/no-such-space')
    expect(r.body).toContain('content="https://di-studio.xyz/brand/og-image.png"')
  })
})
