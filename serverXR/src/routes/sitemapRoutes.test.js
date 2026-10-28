// @vitest-environment node
// /sitemap.xml from the records (audit G04, 2026-10-21). The static file it
// replaces listed 15 addresses with no lastmod, two of them private spaces, and
// missed every page made after it was typed.
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { registerSitemapRoutes, buildSitemap, parseBuiltSitemap } = require('./sitemapRoutes')

const DAY = Date.UTC(2026, 9, 20, 15, 30)
const SPACES = [
  { id: 'main', isPublic: true, kind: 'default', updatedAt: DAY },
  { id: 'wcc', isPublic: true, kind: 'default', updatedAt: DAY },
  { id: 'network', isPublic: true, kind: 'default', updatedAt: DAY },
  { id: 'tx', slug: 'taronx', isPublic: true, kind: 'default', updatedAt: DAY },
  { id: 'cascade', isPublic: false, kind: 'default', updatedAt: DAY },
  { id: 'sandbox-abc', isPublic: true, kind: 'sandbox', updatedAt: DAY },
  { id: 'old', isPublic: true, kind: 'default', archivedAt: DAY, updatedAt: DAY },
]
const PROJECTS = {
  network: [
    { id: 'p1', slug: 'ani', state: 'live', visibility: 'public', updatedAt: DAY },
    { id: 'p2', slug: 'constellation', state: 'live', visibility: 'public', updatedAt: DAY },
    { id: 'p3', slug: 'secret-room', state: 'live', visibility: 'private', updatedAt: DAY },
    { id: 'p4', slug: 'wip', state: 'draft', visibility: 'public', updatedAt: DAY },
  ],
  wcc: [{ id: 'unslugged', slug: null, state: 'live', visibility: 'public', updatedAt: DAY }],
  // A private space's public project is still private: the space gate first.
  cascade: [{ id: 'c1', slug: 'inside', state: 'live', visibility: 'public', updatedAt: DAY }],
}
const projectsFor = async (id) => PROJECTS[id] || []
const locs = (xml) => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1])

describe('the sitemap', () => {
  it('lists the platform pages, every public space and its live public projects', async () => {
    const xml = await buildSitemap({ origin: 'https://diiii.xyz', spaces: SPACES, projectsFor })
    expect(locs(xml)).toEqual([
      'https://diiii.xyz/',
      'https://diiii.xyz/spaces',
      'https://diiii.xyz/wiki',
      'https://diiii.xyz/suite',
      'https://diiii.xyz/terms',
      'https://diiii.xyz/privacy',
      'https://diiii.xyz/for-apps',
      'https://diiii.xyz/network',
      'https://diiii.xyz/network/ani',
      'https://diiii.xyz/network/constellation',
      'https://diiii.xyz/taronx',
      'https://diiii.xyz/wcc',
      'https://diiii.xyz/wcc/p/unslugged',
    ])
  })

  it('never lists anything private, a sandbox, a draft or an archived space', async () => {
    const xml = await buildSitemap({ origin: 'https://diiii.xyz', spaces: SPACES, projectsFor })
    for (const word of ['cascade', 'inside', 'sandbox-abc', 'secret-room', 'wip', '/old', '/main']) {
      expect(xml, word).not.toContain(word)
    }
  })

  it('carries lastmod from the record', async () => {
    const xml = await buildSitemap({ origin: 'https://diiii.xyz', spaces: SPACES, projectsFor })
    expect(xml).toContain('<url><loc>https://diiii.xyz/network/ani</loc><lastmod>2026-10-20</lastmod></url>')
    expect((xml.match(/<lastmod>/g) || []).length).toBe(6)
  })

  it('is served at /serverXR/sitemap.xml as XML, on the configured origin', async () => {
    const app = express()
    const router = express.Router()
    registerSitemapRoutes(router, { listSpaces: async () => SPACES, listProjects: projectsFor, siteOrigin: 'https://diiii.xyz' })
    app.use('/serverXR', router)
    const r = await new Promise((resolve) => {
      const server = app.listen(0, async () => {
        const res = await fetch(`http://127.0.0.1:${server.address().port}/serverXR/sitemap.xml`)
        const body = await res.text()
        server.close(() => resolve({ status: res.status, type: res.headers.get('content-type'), body }))
      })
    })
    expect(r.status).toBe(200)
    expect(r.type).toMatch(/^application\/xml/)
    expect(r.body).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/)
    expect(locs(r.body)).toHaveLength(13)
  })

  // The build's own sitemap (scripts/sitemap.mjs) lists the wiki and the
  // network's rooms; the records must add to it, never replace it (R17).
  describe('on top of the build\'s sitemap', () => {
    const BUILT = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://diiii.xyz/</loc></url>
  <url><loc>https://diiii.xyz/wiki/what-is-a-space</loc><lastmod>2026-10-20</lastmod></url>
  <url><loc>https://diiii.xyz/network/constellation</loc></url>
  <url><loc>https://diiii.xyz/network/some-person</loc></url>
</urlset>`

    it('keeps the wiki and network URLs and adds the records, once each, on the request origin', async () => {
      const builtEntries = parseBuiltSitemap(BUILT)
      const xml = await buildSitemap({ origin: 'https://dev.diiii.xyz', spaces: SPACES, projectsFor, builtEntries })
      const got = locs(xml)
      expect(got).toContain('https://dev.diiii.xyz/wiki/what-is-a-space')
      expect(got).toContain('https://dev.diiii.xyz/network/some-person')
      expect(got).toContain('https://dev.diiii.xyz/network/constellation')
      expect(got).toContain('https://dev.diiii.xyz/taronx')
      expect(got.length).toBe(new Set(got).size)
      expect(got.some((l) => l.startsWith('https://diiii.xyz'))).toBe(false)
      expect(xml).toContain('<loc>https://dev.diiii.xyz/wiki/what-is-a-space</loc><lastmod>2026-10-20</lastmod>')
    })

    it('is served with the built file read through loadBuilt, and never caches a missing one', async () => {
      const serve = async (loadBuilt) => {
        const app = express()
        const router = express.Router()
        registerSitemapRoutes(router, { listSpaces: async () => SPACES, listProjects: projectsFor, siteOrigin: 'https://diiii.xyz', loadBuilt })
        app.use('/serverXR', router)
        return new Promise((resolve) => {
          const server = app.listen(0, async () => {
            const res = await fetch(`http://127.0.0.1:${server.address().port}/serverXR/sitemap.xml`)
            const body = await res.text()
            server.close(() => resolve({ body, cache: res.headers.get('cache-control') }))
          })
        })
      }
      const ok = await serve(async () => BUILT)
      expect(locs(ok.body)).toContain('https://diiii.xyz/wiki/what-is-a-space')
      expect(ok.cache).toMatch(/max-age=3600/)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const missing = await serve(async () => { throw new Error('ENOENT') })
      expect(locs(missing.body)).toContain('https://diiii.xyz/taronx')
      expect(missing.cache).toBe('no-store')
      expect(warn).toHaveBeenCalled()
      warn.mockRestore()
    })
  })
})
