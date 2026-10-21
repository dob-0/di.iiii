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
async function buildSitemap({ origin, spaces, projectsFor }) {
  const entries = new Map()
  const add = (path, lastmod = null) => {
    const loc = `${origin}${path}`
    if (!entries.has(loc)) entries.set(loc, lastmod)
  }
  for (const page of PLATFORM_PAGES) add(page)

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

function createSitemapHandler({ listSpaces, listProjects, siteOrigin }) {
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
      const xml = await buildSitemap({ origin, spaces: await listSpaces(), projectsFor: listProjects })
      res.set('Cache-Control', 'public, max-age=3600')
      res.type('application/xml').send(xml)
    } catch (error) { next(error) }
  }
}

function registerSitemapRoutes(router, deps) {
  const handler = createSitemapHandler(deps)
  router.get('/sitemap.xml', handler)
  return handler
}

module.exports = { registerSitemapRoutes, createSitemapHandler, buildSitemap, PLATFORM_PAGES }
