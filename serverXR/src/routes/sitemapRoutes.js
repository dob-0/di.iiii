// /sitemap.xml, written from the database at request time.
//
// It used to be a static file in public/: fifteen addresses typed by hand, no
// lastmod, two of them private spaces that answer 401 to a stranger, and none
// of the pages a space grew after the file was written — /taronx, the network
// rooms, /terms, /privacy, /for-apps (audit G04, 2026-10-21). A list kept by
// hand drifts from the data the moment anyone makes a page; this reads the
// same records the site itself serves.
//
// Nothing private is ever listed: a space only when it is public and not a
// sandbox, a project only when its space is public, it is live, and it is not
// private to the space's members. The same rules the card route and the
// space listing apply to a stranger.
const { publicOrigin } = require('./ogRoutes')

// The platform's own pages that are not spaces, and that a stranger can read.
const PLATFORM_PAGES = ['/', '/spaces', '/wiki', '/suite', '/terms', '/privacy', '/for-apps']

const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
const xmlEsc = (s) => String(s).replace(/[&<>"']/g, (c) => XML_ESCAPES[c])

// W3C Datetime, the date part — sitemaps.org accepts it, and a day is as
// precise as a crawler's revisit schedule ever is.
const lastmodOf = (value) => {
  const n = typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString().slice(0, 10) : null
}

const isListedSpace = (space) => Boolean(space)
  && space.isPublic === true
  && space.kind !== 'sandbox'
  && !space.archivedAt
  && !space.deletedAt

const isListedProject = (project) => Boolean(project)
  && (project.state || 'live') === 'live'
  && project.visibility !== 'private'
  && !project.deletedAt

/**
 * The sitemap for `origin` (absolute, no trailing slash).
 * `spaces` is every space record; `projectsFor(spaceId)` the projects in one.
 */
async function buildSitemap({ origin, spaces, projectsFor, builtEntries = [] }) {
  const entries = new Map()
  const add = (path, lastmod = null) => {
    const loc = `${origin}${path}`
    if (!entries.has(loc)) entries.set(loc, lastmod)
  }
  for (const page of PLATFORM_PAGES) add(page)
  // What the build already wrote (scripts/sitemap.mjs): the wiki's articles
  // and the network's rooms, which no database row says. Kept, then the
  // records add the spaces and projects made since.
  for (const { path, lastmod } of builtEntries) add(path, lastmod)

  const listed = (spaces || []).filter(isListedSpace)
    .sort((a, b) => String(a.slug || a.id).localeCompare(String(b.slug || b.id)))
  for (const space of listed) {
    const handle = space.slug || space.id
    // `main` is the space `/` opens on: its address is the front door, listed
    // above. Its projects still have addresses of their own.
    if (space.id !== 'main') add(`/${handle}`, lastmodOf(space.updatedAt))
    const projects = (await projectsFor(space.id).catch(() => [])) || []
    for (const project of projects.filter(isListedProject)) {
      // The vanity form when the project has a slug (the link the client
      // prints), else the explicit /p/ shape.
      const tail = project.slug ? project.slug : `p/${project.id}`
      add(`/${handle}/${tail}`, lastmodOf(project.updatedAt))
    }
  }

  const urls = [...entries].map(([loc, lastmod]) => (
    `  <url><loc>${xmlEsc(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`
  ))
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`
}

// The built sitemap's entries as { path, lastmod }, whatever host the build
// named: they are re-rooted on the origin this request answers for.
function parseBuiltSitemap(xml) {
  const out = []
  for (const m of String(xml || '').matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g)) {
    let pathname
    try { pathname = new URL(m[1].replace(/&amp;/g, '&')).pathname } catch { continue }
    out.push({ path: pathname, lastmod: m[2] || null })
  }
  return out
}

// loadBuilt(): the build's sitemap.xml text, or null when there is none. It
// is read from CLIENT_DIR on a `di` install, or from the client container's
// nginx (SITEMAP_BUILT_URL) on the hosted tiers.
function createBuiltSitemapSource({ readBuilt = null, builtUrl = '', fetchImpl = globalThis.fetch } = {}) {
  return async () => {
    if (typeof readBuilt === 'function') return readBuilt()
    if (!builtUrl) return null
    const res = await fetchImpl(builtUrl, { signal: AbortSignal.timeout(3000) })
    return res.ok ? res.text() : null
  }
}

function createSitemapHandler({ listSpaces, listProjects, siteOrigin, loadBuilt = null }) {
  return async (req, res, next) => {
    try {
      // The protocol demands absolute addresses. With no public origin to
      // name (serverXR addressed by its internal name and no SITE_ORIGIN),
      // there is no honest sitemap to give.
      const origin = publicOrigin(req, siteOrigin)
      if (!origin) {
        res.set('Cache-Control', 'no-store')
        return res.status(503).type('text/plain').send('no public origin configured')
      }
      // Without the built file the wiki and the network would vanish from the
      // sitemap, so that is said (log, and no long cache), never quiet.
      let builtEntries = []
      let builtOk = !loadBuilt
      if (loadBuilt) {
        try {
          const text = await loadBuilt()
          builtEntries = parseBuiltSitemap(text)
          builtOk = builtEntries.length > 0
        } catch (error) { console.warn('[sitemap] built sitemap unreadable:', error?.message || error) }
        if (!builtOk) console.warn('[sitemap] built sitemap missing: wiki and network URLs are not listed')
      }
      const xml = await buildSitemap({ origin, spaces: await listSpaces(), projectsFor: listProjects, builtEntries })
      res.set('Cache-Control', builtOk ? 'public, max-age=3600' : 'no-store')
      res.type('application/xml').send(xml)
    } catch (error) { next(error) }
  }
}

function registerSitemapRoutes(router, deps) {
  const handler = createSitemapHandler(deps)
  router.get('/sitemap.xml', handler)
  return handler
}

module.exports = { registerSitemapRoutes, createSitemapHandler, buildSitemap, createBuiltSitemapSource, parseBuiltSitemap, PLATFORM_PAGES }
