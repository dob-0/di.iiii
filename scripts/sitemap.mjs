// The sitemap, built from what the repo already knows, at build time.
//
// public/sitemap.xml was kept by hand: 15 URLs, one of them in the network,
// none of the wiki's articles, no /for-apps (marketing audit 2026-10-21, G25,
// G27, G28). A hand-kept list falls behind every article and every room
// added after it. So the build writes it (vite.config.js, emitSitemapPlugin)
// from the same sources the pages render from:
//
//   - the wiki: src/wiki/wikiContent.js, one URL per article, /wiki/{id},
//     with the article's `updated` as <lastmod>
//   - the network: spaces/network/people.json, one room per person, plus the
//     constellation
//   - the public spaces: scripts/sitemap-spaces.json (by hand — no server to
//     ask at build time)
//
// The sitemap protocol requires absolute URLs (sitemaps.org/protocol.html),
// so this is the one place that must name a single host. It names diiii.xyz,
// the one public address (the owner, 2026-10-21). di-studio.xyz serves the
// same pages and is not listed: naming both would offer a search engine two
// copies of everything. A local install's build (DI_PROFILE=local) writes no
// sitemap at all.
//
//   node scripts/sitemap.mjs           prints it
//   node scripts/sitemap.mjs <file>    writes it
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const SITEMAP_ORIGIN = 'https://diiii.xyz'

// Platform pages that are public and worth a search engine's time. /suite is
// the name-and-mark page; /for-apps is the door sign for programs.
export const CORE_PATHS = ['/', '/spaces', '/wiki', '/suite', '/for-apps', '/terms', '/privacy']

const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
const xml = (s) => String(s).replace(/[&<>"']/g, (c) => XML_ESCAPES[c])
const seg = (s) => encodeURIComponent(String(s))
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

// Pure: lists in, entries out. { loc, lastmod? }, no duplicates, in order.
export function sitemapEntries({ wikiArticles = [], people = [], spaces = [], origin = SITEMAP_ORIGIN } = {}) {
  const entries = []
  const seen = new Set()
  const add = (p, lastmod) => {
    const loc = origin + p
    if (seen.has(loc)) return
    seen.add(loc)
    entries.push(isDate(lastmod) ? { loc, lastmod } : { loc })
  }
  for (const p of CORE_PATHS) add(p)
  for (const id of spaces) add(`/${seg(id)}`)
  add('/network/constellation')
  for (const person of people) if (person?.slug) add(`/network/${seg(person.slug)}`)
  for (const a of wikiArticles) if (a?.id) add(`/wiki/${seg(a.id)}`, a.updated)
  return entries
}

export function renderSitemap(entries) {
  const rows = entries.map(({ loc, lastmod }) => (lastmod
    ? `  <url><loc>${xml(loc)}</loc><lastmod>${lastmod}</lastmod></url>`
    : `  <url><loc>${xml(loc)}</loc></url>`))
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`
}

// Reads the three sources from the repo.
export async function buildSitemap(root = ROOT) {
  const { WIKI_ARTICLES } = await import(pathToFileURL(path.join(root, 'src/wiki/wikiContent.js')).href)
  const { people } = JSON.parse(fs.readFileSync(path.join(root, 'spaces/network/people.json'), 'utf8'))
  const { spaces } = JSON.parse(fs.readFileSync(path.join(root, 'scripts/sitemap-spaces.json'), 'utf8'))
  return renderSitemap(sitemapEntries({ wikiArticles: WIKI_ARTICLES, people, spaces }))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = await buildSitemap()
  const target = process.argv[2]
  if (target) {
    fs.writeFileSync(target, out)
    console.log(`${(out.match(/<url>/g) || []).length} URLs written to ${target}`)
  } else {
    process.stdout.write(out)
  }
}
