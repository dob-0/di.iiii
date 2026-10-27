import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const { ogHtml } = createRequire(import.meta.url)('./ogRoutes')

describe('link preview cards', () => {
  it('names the space, not the platform', () => {
    const h = ogHtml({ url: 'https://diiii.xyz/br_id_ge', title: 'br_id_ge', description: 'a rite in five acts', image: '/og/br-id-ge.png' })
    expect(h).toContain('<meta property="og:title" content="br_id_ge">')
    expect(h).not.toContain('browser-native XR authoring')
    // the whole point: the card must not be the platform tile
    expect(h).not.toContain('/suite/og-image.png')
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
    expect(h).toContain('/suite/og-image.png')
  })

  it('sends a human on to the real page rather than dead-ending', () => {
    const h = ogHtml({ url: 'https://diiii.xyz/br_id_ge', title: 't', description: 'd' })
    expect(h).toContain('http-equiv="refresh"')
    expect(h).toContain('rel="canonical" href="https://diiii.xyz/br_id_ge"')
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
      siteOrigin: 'https://diiii.xyz',
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
    expect(r.body).toContain('/suite/og-image.png')
  })

  // The bare domain — the single most-shared link there is. `*splat` requires at
  // least one segment, so `/og` and `/og/` fell past the router entirely and a
  // crawler got nginx's 403 page instead of a card. The "no handle" fallback was
  // already written; it was unreachable. Watched failing at 404 before the fix.
  it('gives the platform card for the bare domain, both spellings', async () => {
    for (const path of ['/serverXR/og/', '/serverXR/og']) {
      const r = await hit(path)
      expect(r.status, `${path} must answer`).toBe(200)
      expect(r.body).toContain('/suite/og-image.png')
      expect(r.body).toContain('<meta property="og:title" content="di.iiii')
    }
  })

  // ...and it must send the crawler to the front door, not back to the path
  // that just missed, which is a loop.
  it('points the bare-domain card at the origin, not at /og', async () => {
    const r = await hit('/serverXR/og/')
    expect(r.body).toContain('rel="canonical" href="https://diiii.xyz"')
    expect(r.body).not.toContain('href="https://diiii.xyz/og')
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

  it("the platform's own space does not describe itself as a space on itself", async () => {
    const a = express()
    const router = express.Router()
    registerOgRoutes(router, {
      loadSpaceMeta: async (h) => (h === 'main'
        ? { id: 'main', label: 'di.iiii', isPublic: true }
        : null),
      siteOrigin: 'https://diiii.xyz',
    })
    a.use('/serverXR', router)
    const r = await hit(a, '/serverXR/og/main')
    expect(r.body).toContain('<meta property="og:title" content="di.iiii">')
    expect(r.body).not.toContain('a space on di.iiii')
    expect(r.body).toContain('a link while it runs, a file when it ends')
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
      'x-forwarded-host': 'dev.diiii.xyz',
      'x-forwarded-proto': 'https',
    })
    // The space's own handle (its id here, no slug), not the spelling the
    // link used: /br_id_ge and /br-id-ge are one page (audit G11, 2026-10-21).
    expect(r.body).toContain('content="https://dev.diiii.xyz/br-id-ge"')
  })

  it('an explicit SITE_ORIGIN wins over anything the request claims', async () => {
    const r = await hit(build('https://diiii.xyz'), '/serverXR/og/br_id_ge', {
      host: 'evil.example',
      'x-forwarded-host': 'evil.example',
    })
    expect(r.body).toContain('content="https://diiii.xyz/br-id-ge"')
    expect(r.body).not.toContain('evil.example')
  })

  it('resolves the shared handle, not just the exact space id', async () => {
    // br_id_ge is the URL people share; br-id-ge is the id in the database.
    const r = await hit(build('https://diiii.xyz'), '/serverXR/og/br_id_ge')
    expect(r.body).toContain('<meta property="og:title" content="br_id_ge">')
    expect(r.body).toContain('/og/br-id-ge.png')
    expect(r.body).not.toContain('browser-native XR authoring')
  })

  it('the fallback card carries an absolute image too', async () => {
    const r = await hit(build('https://diiii.xyz'), '/serverXR/og/no-such-space')
    expect(r.body).toContain('content="https://diiii.xyz/suite/og-image.png"')
  })
})

// 2026-09-14: /login, /terms, /privacy, /for-apps, /spaces and /wiki are
// reserved words — none of them can ever be a space (shared/reservedSegments.cjs
// APP_SEGMENTS) — so `loadSpaceMeta` found nothing for any of them and every
// one previewed as the FRONT_DOOR card, same as a genuinely unknown address.
describe('reserved top-level pages get their own card', () => {
  const express = createRequire(import.meta.url)('express')
  const { registerOgRoutes } = createRequire(import.meta.url)('./ogRoutes')

  const app = (() => {
    const a = express()
    const router = express.Router()
    registerOgRoutes(router, {
      // None of these words can be a space — if this is ever reached for one
      // of them, the static-page check ran too late (or not at all).
      loadSpaceMeta: async () => { throw new Error('loadSpaceMeta must not be asked about a reserved page') },
      siteOrigin: 'https://diiii.xyz',
    })
    a.use('/serverXR', router)
    return a
  })()

  const hit = (path) => new Promise((resolve) => {
    const server = app.listen(0, async () => {
      const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`)
      const body = await r.text()
      server.close(() => resolve({ status: r.status, body }))
    })
  })

  it.each([
    ['/serverXR/og/login', 'Sign in — di.iiii'],
    ['/serverXR/og/terms', 'Terms — di.iiii'],
    ['/serverXR/og/privacy', 'Privacy — di.iiii'],
    ['/serverXR/og/for-apps', 'For apps — di.iiii'],
    ['/serverXR/og/spaces', 'Spaces — di.iiii'],
    ['/serverXR/og/wiki', 'Wiki — di.iiii'],
  ])('%s carries its own card, not the front door', async (path, title) => {
    const r = await hit(path)
    expect(r.status).toBe(200)
    expect(r.body).toContain(`<meta property="og:title" content="${title}">`)
    expect(r.body).not.toContain('browser-native XR authoring')
    // the front door's OWN title, distinct from any one page's — must not leak
    expect(r.body).not.toContain('public spaces on the open web')
  })

  it('still names di.iiii as the site and points the url at the real page', async () => {
    const r = await hit('/serverXR/og/login')
    expect(r.body).toContain('<meta property="og:site_name" content="di.iiii">')
    expect(r.body).toContain('content="https://diiii.xyz/login"')
  })
})

// 2026-09-14: a link naming a PROJECT explicitly — /{space}/p/{project} or the
// vanity /{space}/{projectSlug} form — used to be read only as far as the
// space: sharing one artist's project previewed as the whole exhibition, the
// same card as the bare /{space} link.
describe('a project the URL itself names', () => {
  const express = createRequire(import.meta.url)('express')
  const { registerOgRoutes } = createRequire(import.meta.url)('./ogRoutes')

  const PROJECTS = {
    'wcc:mery-petrosyan': { title: 'Mery Petrosyan', spaceId: 'wcc', state: 'live' },
    'wcc:draft-work': { title: 'Draft Work', spaceId: 'wcc', state: 'draft' },
  }

  const build = () => {
    const a = express()
    const router = express.Router()
    registerOgRoutes(router, {
      loadSpaceMeta: async (h) => (h === 'wcc' ? { id: 'wcc', label: 'WCC Exhibition', isPublic: true } : null),
      // Mirrors index.js's real resolveProject: only a 'live' project ever
      // previews as itself — drafts and archived work never reach a visitor
      // (RootApp.jsx's SlugProjectRoute, SpaceContentsPage's own listing).
      resolveProject: async (spaceId, segment) => {
        const project = PROJECTS[`${spaceId}:${segment}`]
        return (project && project.state === 'live') ? project : null
      },
      siteOrigin: 'https://diiii.xyz',
    })
    a.use('/serverXR', router)
    return a
  }

  const hit = (path) => new Promise((resolve) => {
    const server = build().listen(0, async () => {
      const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`)
      const body = await r.text()
      server.close(() => resolve({ status: r.status, body }))
    })
  })

  it('names the project, then the space, on the explicit /p/ shape', async () => {
    const r = await hit('/serverXR/og/wcc/p/mery-petrosyan')
    expect(r.body).toContain('<meta property="og:title" content="Mery Petrosyan — WCC Exhibition">')
    expect(r.body).toContain('content="https://diiii.xyz/wcc/p/mery-petrosyan"')
  })

  it('names the project on the vanity /{space}/{projectSlug} shape too', async () => {
    const r = await hit('/serverXR/og/wcc/mery-petrosyan')
    expect(r.body).toContain('<meta property="og:title" content="Mery Petrosyan — WCC Exhibition">')
  })

  it('never previews a draft — falls back to the space card instead', async () => {
    const r = await hit('/serverXR/og/wcc/p/draft-work')
    expect(r.body).toContain('<meta property="og:title" content="WCC Exhibition">')
    expect(r.body).not.toContain('Draft Work')
  })

  it('does not read a reserved second segment (/raw, /studio, …) as a project slug', async () => {
    const r = await hit('/serverXR/og/wcc/raw')
    expect(r.body).toContain('<meta property="og:title" content="WCC Exhibition">')
  })

  it('falls back to the space card when nothing has that project slug', async () => {
    const r = await hit('/serverXR/og/wcc/not-a-real-project')
    expect(r.body).toContain('<meta property="og:title" content="WCC Exhibition">')
  })
})

// ── a space on its own domain (SPEC_space_own_domain.md) ──────────────────
// yokozo.xyz/ is diiii.xyz/taronx. A link shared on the domain must preview as
// the space, and advertise the domain, not the platform, even though
// SITE_ORIGIN names the platform.
describe('a card for a space on its own domain', () => {
  const express = createRequire(import.meta.url)('express')
  const { registerOgRoutes } = createRequire(import.meta.url)('./ogRoutes')

  const app = (() => {
    const a = express()
    const router = express.Router()
    registerOgRoutes(router, {
      loadSpaceMeta: async (h) => (h === 'taronx' ? { id: 'taronx', label: 'Taron', isPublic: true } : null),
      resolveProject: async (spaceId, slug) => (spaceId === 'taronx' && slug === 'instruments' ? { title: 'Instruments' } : null),
      siteOrigin: 'https://diiii.xyz',
      spaceIdForHost: (host) => (host === 'yokozo.xyz' ? 'taronx' : null),
    })
    a.use('/serverXR', router)
    return a
  })()

  const hit = (path, host) => new Promise((resolve) => {
    const server = app.listen(0, async () => {
      const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        headers: { 'x-forwarded-host': host, 'x-forwarded-proto': 'https' },
      })
      const body = await r.text()
      server.close(() => resolve({ status: r.status, body }))
    })
  })

  it('previews the bare domain as the space, at the domain', async () => {
    const r = await hit('/serverXR/og/', 'yokozo.xyz')
    expect(r.body).toContain('<meta property="og:title" content="Taron">')
    expect(r.body).toContain('rel="canonical" href="https://yokozo.xyz/"')
    expect(r.body).not.toContain('diiii.xyz')
  })

  it('previews a project on the domain as that project', async () => {
    const r = await hit('/serverXR/og/instruments', 'yokozo.xyz')
    expect(r.body).toContain('<meta property="og:title" content="Instruments — Taron">')
    expect(r.body).toContain('rel="canonical" href="https://yokozo.xyz/instruments"')
  })

  it('leaves the platform host as it was', async () => {
    const r = await hit('/serverXR/og/', 'diiii.xyz')
    expect(r.body).toContain('/suite/og-image.png')
    expect(r.body).toContain('rel="canonical" href="https://diiii.xyz"')
  })
})

// ── marketing audit 2026-10-21: G23 (a space's own line) and G25 (a card per
// wiki article). Mounted like index.js mounts it; the wiki loader is the REAL
// one, reading src/wiki/wikiContent.js, so a broken path or shape fails here.
describe('a space\'s line for visitors, and one card per wiki article', () => {
  const express = createRequire(import.meta.url)('express')
  const { registerOgRoutes } = createRequire(import.meta.url)('./ogRoutes')
  const { loadWikiArticles } = createRequire(import.meta.url)('../wikiIndex')

  const app = (() => {
    const a = express()
    const router = express.Router()
    registerOgRoutes(router, {
      loadSpaceMeta: async (h) => ({
        said: { id: 'said', label: 'Said', isPublic: true, blurb: 'Nineteen films made by children in one town.' },
        quiet: { id: 'quiet', label: 'Quiet', isPublic: true, blurb: null },
      })[h] || null,
      siteOrigin: 'https://diiii.xyz',
      loadWikiArticles,
    })
    a.use('/serverXR', router)
    return a
  })()

  const hit = (path) => new Promise((resolve) => {
    const server = app.listen(0, async () => {
      const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`)
      const body = await r.text()
      server.close(() => resolve({ status: r.status, body }))
    })
  })

  it('a space that wrote its line is described by it, not by the formula', async () => {
    const r = await hit('/serverXR/og/said')
    expect(r.body).toContain('<meta property="og:description" content="Nineteen films made by children in one town.">')
    expect(r.body).toContain('<meta name="description" content="Nineteen films made by children in one town.">')
    expect(r.body).not.toContain('a space on di.iiii')
  })

  it('a space without one keeps the old sentence', async () => {
    const r = await hit('/serverXR/og/quiet')
    expect(r.body).toContain('Quiet — a space on di.iiii.')
  })

  it('reads every wiki article from the real wiki file', async () => {
    const articles = await loadWikiArticles()
    // 118 on 2026-10-21; the floor is the audit's 108 anchors.
    expect(articles.size).toBeGreaterThanOrEqual(108)
    for (const a of articles.values()) {
      expect(a.title.length).toBeGreaterThan(0)
      expect(a.summary.length).toBeGreaterThan(0)
    }
  })

  it('/wiki/{id} is its own page: title, description and canonical', async () => {
    const articles = await loadWikiArticles()
    const glossary = articles.get('glossary')
    expect(glossary).toBeTruthy()
    const r = await hit('/serverXR/og/wiki/glossary')
    expect(r.status).toBe(200)
    expect(r.body).toContain(`<title>${glossary.title} — Wiki — di.iiii</title>`)
    expect(r.body).toContain('rel="canonical" href="https://diiii.xyz/wiki/glossary"')
    expect(r.body).toContain('<meta property="og:url" content="https://diiii.xyz/wiki/glossary">')
    expect(r.body).toContain('One word, one meaning.')
  })

  it('every article gets a different title from every other', async () => {
    const articles = await loadWikiArticles()
    const ids = [...articles.keys()].slice(0, 12)
    const titles = new Set()
    for (const id of ids) {
      const r = await hit(`/serverXR/og/wiki/${id}`)
      titles.add(r.body.match(/<title>(.*)<\/title>/)[1])
    }
    expect(titles.size).toBe(ids.length)
  })

  it('an id the wiki does not have gets the wiki\'s own card, canonical to /wiki', async () => {
    const r = await hit('/serverXR/og/wiki/no-such-article')
    expect(r.status).toBe(200)
    expect(r.body).toContain('<title>Wiki — di.iiii</title>')
    expect(r.body).toContain('rel="canonical" href="https://diiii.xyz/wiki"')
  })

  it('a wiki file that cannot be read gives an empty index, not a crash', async () => {
    const missing = await loadWikiArticles('/nonexistent/wikiContent.js')
    expect(missing.size).toBe(0)
  })
})
