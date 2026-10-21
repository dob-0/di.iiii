// @vitest-environment node
// The page route: the app's real shell (src/index.html) with each address's own
// head written in, for every reader, and the true status.
//
// Audit 2026-10-21 (rows G01-G06, G08, G09, G11, G12): every unknown address
// answered 200 with one 8,058 B shell (a soft 404), and only fifteen named
// social crawlers ever saw a per-address title, description or canonical —
// Googlebot got the landing's head on every page.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const http = require('node:http')
const { registerOgRoutes, injectHead, createShellSource } = require('./ogRoutes')

const here = path.dirname(fileURLToPath(import.meta.url))
const SHELL = readFileSync(path.resolve(here, '../../../src/index.html'), 'utf8')

const SPACES = {
  'br-id-ge': { id: 'br-id-ge', slug: null, label: 'br_id_ge', description: 'a rite in five acts', isPublic: true },
  open: { id: 'open', slug: null, label: 'Open Space', isPublic: true },
  wcc: { id: 'wcc', slug: null, label: 'WCC Exhibition', isPublic: true },
  network: { id: 'network', slug: null, label: 'The network', isPublic: true },
  main: { id: 'main', slug: null, label: 'di.iiii', isPublic: true },
  hidden: { id: 'hidden', slug: null, label: 'Secret Room', description: 'not for strangers', isPublic: false },
}
const PROJECTS = {
  'network:ani': { title: 'Ani', spaceId: 'network', state: 'live', ogDescription: 'Sound and light.' },
}

const build = ({ siteOrigin = 'https://diiii.xyz', loadShell = async () => SHELL } = {}) => {
  const app = express()
  const router = express.Router()
  registerOgRoutes(router, {
    // Exact id match, like the real selectById — the route normalizes.
    loadSpaceMeta: async (h) => SPACES[h] || null,
    resolveProject: async (spaceId, segment) => PROJECTS[`${spaceId}:${segment}`] || null,
    siteOrigin,
    loadShell,
  })
  app.use('/serverXR', router)
  return app
}

// node:http, not fetch: fetch drops a Host header, and the internal-host case
// is one of the things under test.
const get = (app, urlPath, headers = {}) => new Promise((resolve, reject) => {
  const server = app.listen(0, () => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: urlPath, headers }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => server.close(() => resolve({ status: res.statusCode, body, headers: res.headers })))
    })
    req.on('error', (e) => server.close(() => reject(e)))
    req.end()
  })
})

const GOOGLEBOT = { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }
const meta = (body, key) => {
  const re = new RegExp(`<meta (?:property|name)="${key.replace(/[:]/g, '\\:')}" content="([^"]*)">`, 'g')
  return [...body.matchAll(re)].map((m) => m[1])
}
const canonicals = (body) => [...body.matchAll(/<link rel="canonical" href="([^"]*)">/g)].map((m) => m[1])
const title = (body) => [...body.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1])
const ld = (body) => [...body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]))

describe('G01: an address nothing answers to is a 404, not the shell with a 200', () => {
  const app = build()
  it.each(['/press', '/about', '/not-a-space-at-all', '/zz-random-8f3a', '/nothing/deeper/still'])('%s -> 404', async (p) => {
    const r = await get(app, `/serverXR/page${p}`, GOOGLEBOT)
    expect(r.status).toBe(404)
    // Still the app's shell, so a person who typed it gets the app's own page.
    expect(r.body).toContain('<div id="root"></div>')
    expect(meta(r.body, 'robots')).toEqual(['noindex'])
    expect(canonicals(r.body)).toEqual([])
  })

  it.each([
    ['/', 200], ['/terms', 200], ['/privacy', 200], ['/for-apps', 200], ['/spaces', 200], ['/login', 200],
    ['/studio', 200], ['/br_id_ge', 200], ['/br-id-ge', 200], ['/wcc', 200], ['/wcc/scene', 200],
    ['/open_jam/scene', 200], ['/network/ani', 200], ['/network/not-a-room', 200], ['/hidden', 200],
  ])('%s -> %i', async (p, status) => {
    expect((await get(app, `/serverXR/page${p}`, GOOGLEBOT)).status).toBe(status)
  })
})

describe('G02/G05: every reader gets the address\'s own head, not the landing\'s', () => {
  const app = build()
  it('Googlebot reads the space\'s title, description and absolute canonical', async () => {
    const r = await get(app, '/serverXR/page/wcc', GOOGLEBOT)
    expect(title(r.body)).toEqual(['WCC Exhibition'])
    expect(meta(r.body, 'og:title')).toEqual(['WCC Exhibition'])
    expect(meta(r.body, 'description')).toEqual(['WCC Exhibition — a space on di.iiii.'])
    expect(canonicals(r.body)).toEqual(['https://diiii.xyz/wcc'])
    expect(meta(r.body, 'og:url')).toEqual(['https://diiii.xyz/wcc'])
  })

  it('a reader with no user agent at all gets the same head', async () => {
    const a = await get(app, '/serverXR/page/network/ani', GOOGLEBOT)
    const b = await get(app, '/serverXR/page/network/ani')
    expect(title(b.body)).toEqual(['Ani — The network'])
    expect(meta(b.body, 'description')).toEqual(['Sound and light.'])
    expect(b.body).toBe(a.body)
  })

  it('says each tag once: the shell\'s own copies are replaced, not added to', async () => {
    const r = await get(app, '/serverXR/page/terms', GOOGLEBOT)
    for (const key of ['description', 'og:title', 'og:description', 'og:image', 'og:url', 'twitter:title', 'twitter:image']) {
      expect(meta(r.body, key), key).toHaveLength(1)
    }
    expect(title(r.body)).toEqual(['Terms — di.iiii'])
    expect(canonicals(r.body)).toEqual(['https://diiii.xyz/terms'])
  })

  it('different pages carry different descriptions', async () => {
    const paths = ['/', '/terms', '/privacy', '/wcc', '/br_id_ge', '/network/ani']
    const descriptions = await Promise.all(paths.map(async (p) => meta((await get(app, `/serverXR/page${p}`)).body, 'description')[0]))
    expect(new Set(descriptions).size).toBe(paths.length)
  })

  it('the front door\'s description fits a search snippet (<= 160 characters)', async () => {
    const r = await get(app, '/serverXR/page/', GOOGLEBOT)
    const d = meta(r.body, 'description')[0].replace(/&#39;/g, "'")
    expect(d.length).toBeLessThanOrEqual(160)
  })

  it('a private space says nothing of itself and is never indexed', async () => {
    const r = await get(app, '/serverXR/page/hidden', GOOGLEBOT)
    expect(r.body).not.toContain('Secret Room')
    expect(r.body).not.toContain('not for strangers')
    expect(meta(r.body, 'robots')).toEqual(['noindex'])
  })
})

describe('G03/G06: every URL in the head is absolute, on the one public address', () => {
  // Host: server:4000 is what nginx sends when a location forgets to set Host
  // — how /wcc went out with og:image '/suite/og-image.png' (G06).
  const app = build({ siteOrigin: 'https://diiii.xyz' })
  it.each(['/', '/wcc', '/br_id_ge', '/open', '/terms', '/network/ani', '/studio'])('%s', async (p) => {
    const r = await get(app, `/serverXR/page${p}`, { host: 'server:4000' })
    const urls = [...meta(r.body, 'og:image'), ...meta(r.body, 'og:url'), ...meta(r.body, 'twitter:image'), ...canonicals(r.body)]
    expect(urls.length).toBeGreaterThanOrEqual(3)
    for (const u of urls) expect(u, u).toMatch(/^https:\/\/diiii\.xyz(\/|$)/)
  })
})

describe('G11/G12: one room, one canonical', () => {
  const app = build()
  it('/br_id_ge and /br-id-ge name the same page', async () => {
    const a = canonicals((await get(app, '/serverXR/page/br_id_ge')).body)
    const b = canonicals((await get(app, '/serverXR/page/br-id-ge')).body)
    expect(a).toEqual(['https://diiii.xyz/br-id-ge'])
    expect(b).toEqual(a)
  })

  it('/open, /open_jam and /open_jam/scene all point at /open', async () => {
    for (const p of ['/open', '/open_jam', '/open_jam/scene']) {
      const r = await get(app, `/serverXR/page${p}`)
      expect(canonicals(r.body), p).toEqual(['https://diiii.xyz/open'])
      expect(title(r.body), p).toEqual(['Open Space'])
    }
  })
})

describe('G08: the card says its size and what is in it', () => {
  const app = build()
  it.each(['/', '/br_id_ge', '/wcc'])('%s', async (p) => {
    const r = await get(app, `/serverXR/page${p}`)
    expect(meta(r.body, 'og:image:width')).toEqual(['1200'])
    expect(meta(r.body, 'og:image:height')).toEqual(['630'])
    expect(meta(r.body, 'og:image:alt')[0]).toMatch(/\S{3,}/)
    expect(meta(r.body, 'twitter:image:alt')).toEqual(meta(r.body, 'og:image:alt'))
    expect(meta(r.body, 'og:locale')).toEqual(['en_US'])
    // No X account exists yet (audit G41, Q5): a made-up handle is worse than none.
    expect(meta(r.body, 'twitter:site')).toEqual([])
  })
})

describe('G09: structured data', () => {
  const app = build()
  it('the front door names the site and the studio', async () => {
    const blocks = ld((await get(app, '/serverXR/page/')).body)
    expect(blocks.map((b) => b['@type']).sort()).toEqual(['Organization', 'WebSite'])
    const site = blocks.find((b) => b['@type'] === 'WebSite')
    expect(site).toMatchObject({ '@context': 'https://schema.org', name: 'di.iiii', url: 'https://diiii.xyz/' })
    expect(blocks.find((b) => b['@type'] === 'Organization')).toMatchObject({ name: 'di.i', url: 'https://thedi.studio' })
  })

  it('a space and a project are creative works, the project inside its space', async () => {
    const [space] = ld((await get(app, '/serverXR/page/wcc')).body)
    expect(space).toMatchObject({ '@type': 'CreativeWork', name: 'WCC Exhibition', url: 'https://diiii.xyz/wcc' })
    const [project] = ld((await get(app, '/serverXR/page/network/ani')).body)
    expect(project).toMatchObject({ '@type': 'CreativeWork', name: 'Ani', url: 'https://diiii.xyz/network/ani' })
    expect(project.isPartOf).toMatchObject({ name: 'The network', url: 'https://diiii.xyz/network' })
  })

  it('a title carrying </script> cannot close the block', () => {
    const html = injectHead(SHELL, {
      title: 't', description: 'd', url: 'https://diiii.xyz/x',
      jsonLd: [{ '@type': 'CreativeWork', name: '</script><script>alert(1)</script>' }],
    })
    expect(html).not.toContain('</script><script>alert(1)')
    expect(ld(html)[0].name).toBe('</script><script>alert(1)</script>')
  })

  it('no structured data for an address nothing answers to', async () => {
    expect(ld((await get(app, '/serverXR/page/press')).body)).toEqual([])
  })
})

describe('the shell itself', () => {
  it('the injected canonical comes before the shell\'s own canonical script, which then stands down', () => {
    const html = injectHead(SHELL, { title: 't', description: 'd', url: 'https://diiii.xyz/x' })
    const link = html.indexOf('<link rel="canonical"')
    const script = html.indexOf('document.querySelector(\'link[rel="canonical"]\')')
    expect(link).toBeGreaterThan(-1)
    expect(script).toBeGreaterThan(link)
  })

  it('serverXR without a shell answers 503, which nginx turns into the static shell', async () => {
    const r = await get(build({ loadShell: async () => null }), '/serverXR/page/wcc')
    expect(r.status).toBe(503)
  })

  it('the shell source revalidates with its ETag rather than holding a stale build', async () => {
    const calls = []
    let body = 'v1'
    const fetchImpl = async (url, { headers }) => {
      calls.push(headers['if-none-match'] || null)
      if (headers['if-none-match'] === `"${body}"`) return { status: 304, ok: false, headers: new Map() }
      return { status: 200, ok: true, headers: new Map([['etag', `"${body}"`]]), text: async () => body }
    }
    const load = createShellSource({ shellUrl: 'http://client:8080/index.html', fetchImpl })
    expect(await load()).toBe('v1')
    expect(await load()).toBe('v1')
    body = 'v2'
    expect(await load()).toBe('v2')
    expect(calls).toEqual([null, '"v1"', '"v1"'])
  })
})

describe('the static shell (src/index.html), read by anything that skips the page route', () => {
  const tag = (key) => meta(SHELL, key)
  it('carries the card\'s size, alt text and locale (G08)', () => {
    expect(tag('og:image:width')).toEqual(['1200'])
    expect(tag('og:image:height')).toEqual(['630'])
    expect(tag('og:image:alt')).toHaveLength(1)
    expect(tag('twitter:image:alt')).toEqual(tag('og:image:alt'))
    expect(tag('og:locale')).toEqual(['en_US'])
  })

  it('its description fits a search snippet and matches the card (G05)', () => {
    const [d] = tag('description')
    expect(d.length).toBeLessThanOrEqual(160)
    expect(tag('og:description')).toEqual([d])
  })
})
