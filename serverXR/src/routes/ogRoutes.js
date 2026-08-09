// Per-space link previews.
//
// Every di.iiii URL used to hand a crawler the same card: title "di.iiii —
// browser-native XR authoring" over a black/cyan image reading "di.iii" — three
// i's, the name NAMING.md retired. So a link to br_id_ge, to Beyond Form, to any
// piece anyone ever shared, previewed as the platform's own generic tile, in the
// visual identity br_id_ge deliberately left behind on 2026-07-31.
//
// The client is a single-page app: index.html is static and identical for every
// route, so the meta tags cannot vary. This route is what a crawler gets instead
// — nginx routes known crawler user-agents here (see nginx.conf). A human never
// reaches it, but it carries a redirect anyway, because "never" is a strong word
// and a share-link that dead-ends is worse than one that is merely plain.
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESCAPES[c])

// A space may name its own card. Anything without one falls back to the
// platform tile, which is correct for a space that has no face of its own yet.
const DEFAULT_IMAGE = '/brand/og-image.png'

// Explicit, not conventional. Deriving the filename from the handle would point
// every space without a card at a URL that 404s, and a crawler given a broken
// image shows no image at all — worse than the platform tile it replaced. A
// space appears here only once its card is actually committed to public/og/.
const SPACE_CARDS = {
  'br-id-ge': '/og/br-id-ge.png',
}
const cardFor = (handle) => SPACE_CARDS[String(handle).replace(/_/g, '-').toLowerCase()] || DEFAULT_IMAGE

function ogHtml({ url, title, description, image }) {
  const t = esc(title)
  const d = esc(description)
  const i = esc(image || DEFAULT_IMAGE)
  const u = esc(url)
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${t}</title>
<meta name="description" content="${d}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="di.iiii">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${i}">
<meta property="og:url" content="${u}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${i}">
<link rel="canonical" href="${u}">
<meta http-equiv="refresh" content="0; url=${u}">
</head><body><a href="${u}">${t}</a></body></html>`
}

function registerOgRoutes(router, { loadSpaceMeta, siteOrigin }) {
  // Express 5's router (path-to-regexp v8) rejects a bare '*' — it throws at
  // REGISTRATION, so this would not have failed a request, it would have stopped
  // serverXR from booting at all. Named wildcard, and params.splat is an array.
  router.get('/serverXR/og/*splat', async (req, res, next) => {
    try {
      const splat = req.params.splat
      const path = String(Array.isArray(splat) ? splat.join('/') : (splat || '')).replace(/^\/+/, '')
      const handle = path.split('/')[0] || ''
      const origin = siteOrigin || `${req.protocol}://${req.get('host')}`
      const url = `${origin}/${path}`
      // No handle, or a handle nothing answers to: still return a valid card
      // rather than a 404. A crawler that gets a 404 shows the bare URL, which
      // is uglier than the platform tile and tells the reader nothing.
      let meta = null
      if (handle) meta = await loadSpaceMeta(handle).catch(() => null)
      if (!meta || meta.isPublic === false) {
        return res.type('html').send(ogHtml({
          url: origin,
          title: 'di.iiii — browser-native XR authoring',
          description: 'Build and publish spatial XR experiences without leaving the web.',
        }))
      }
      res.type('html').send(ogHtml({
        url,
        title: meta.ogTitle || meta.label || handle,
        description: meta.ogDescription || meta.description
          || `${meta.label || handle} — a space on di.iiii.`,
        image: origin + cardFor(handle),
      }))
    } catch (error) { next(error) }
  })
}

module.exports = { registerOgRoutes, ogHtml }
