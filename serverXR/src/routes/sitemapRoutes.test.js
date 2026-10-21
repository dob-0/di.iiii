// @vitest-environment node
// /sitemap.xml from the records (audit G04, 2026-10-21). The static file it
// replaces listed 15 addresses with no lastmod, two of them private spaces, and
// missed every page made after it was typed.
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { registerSitemapRoutes, buildSitemap } = require('./sitemapRoutes')

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
})
