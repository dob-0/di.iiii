// The sitemap the build writes (scripts/sitemap.mjs). Marketing audit
// 2026-10-21: the hand-kept file had 15 URLs, 1 in the network, none of the
// wiki's articles and not /for-apps (G25, G27, G28).
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WIKI_ARTICLES } from '../src/wiki/wikiContent.js'
import { buildSitemap, renderSitemap, sitemapEntries, SITEMAP_ORIGIN } from './sitemap.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { people } = JSON.parse(fs.readFileSync(path.join(ROOT, 'spaces/network/people.json'), 'utf8'))

// What a crawler reads: every <loc>, and the <lastmod> beside it.
const parse = (xmlText) => [...xmlText.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/g)]
    .map(([, loc, lastmod]) => ({ loc, lastmod }))

describe('the sitemap', async () => {
    const text = await buildSitemap()
    const urls = parse(text)
    const locs = new Set(urls.map((u) => u.loc))

    it('is a sitemaps.org urlset under the 50,000-URL limit, every URL absolute on diiii.xyz', () => {
        expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')).toBe(true)
        expect(urls.length).toBe((text.match(/<url>/g) || []).length)
        expect(urls.length).toBeLessThan(50000)
        for (const { loc } of urls) expect(loc.startsWith(`${SITEMAP_ORIGIN}/`)).toBe(true)
        expect(locs.size).toBe(urls.length)
        expect(text).not.toContain('di-studio.xyz')
    })

    it('lists /for-apps (G27)', () => {
        expect(locs.has('https://diiii.xyz/for-apps')).toBe(true)
    })

    it('lists the network, its constellation and every room in it (G28)', () => {
        expect(people.length).toBeGreaterThanOrEqual(65)
        expect(locs.has('https://diiii.xyz/network')).toBe(true)
        expect(locs.has('https://diiii.xyz/network/constellation')).toBe(true)
        for (const p of people) expect(locs.has(`https://diiii.xyz/network/${p.slug}`), p.slug).toBe(true)
    })

    it('lists every wiki article at its own address, dated by its `updated` (G25)', () => {
        expect(WIKI_ARTICLES.length).toBeGreaterThanOrEqual(108)
        for (const a of WIKI_ARTICLES) {
            const row = urls.find((u) => u.loc === `https://diiii.xyz/wiki/${a.id}`)
            expect(row, a.id).toBeTruthy()
            expect(row.lastmod).toBe(a.updated)
        }
        expect(locs.has('https://diiii.xyz/wiki')).toBe(true)
    })

    it('keeps every URL the hand-kept file had', () => {
        for (const p of ['/', '/spaces', '/open', '/network', '/wiki', '/suite', '/wcc', '/br_id_ge',
            '/beyond-form', '/algovrithm', '/dilijan', '/azd', '/platform-recordar', '/cascade', '/the-light-put-back']) {
            expect(locs.has(`https://diiii.xyz${p}`), p).toBe(true)
        }
    })

    it('escapes what XML needs escaped and drops a date that is not one', () => {
        const out = renderSitemap(sitemapEntries({ wikiArticles: [{ id: 'a&b', updated: 'soon' }] }))
        expect(out).toContain('<loc>https://diiii.xyz/wiki/a%26b</loc>')
        expect(out).not.toContain('<lastmod>soon</lastmod>')
    })

    it('is written by the build, and only by the hosted build', () => {
        const config = fs.readFileSync(path.join(ROOT, 'vite.config.js'), 'utf8')
        expect(config).toMatch(/emitSitemapPlugin\(\),/)
        expect(config).toMatch(/if \(LOCAL_PROFILE\) return\s+const \{ buildSitemap \}/)
        // One source: a hand-kept public/sitemap.xml would race the build's.
        expect(fs.existsSync(path.join(ROOT, 'public/sitemap.xml'))).toBe(false)
    })
})
