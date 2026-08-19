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

// The public address of this tier, which is NOT what the request says on its
// own. nginx proxies the crawler path to `http://server:4000`, so `req.get(
// 'host')` is the compose service name — and that address went out live in
// og:url, the canonical link and the meta refresh. A crawler publishes those,
// and may cache them.
//
// Order: an explicit SITE_ORIGIN wins; then the forwarded pair nginx now sets;
// then the request itself, which is right when serverXR is addressed directly.
// The internal name is refused outright at the end, because a wrong absolute
// URL in a shared card is worse than a relative one.
function publicOrigin(req, siteOrigin) {
  if (siteOrigin) return String(siteOrigin).replace(/\/+$/, '')
  const host = req.get('x-forwarded-host') || req.get('host') || ''
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https'
  const first = (v) => String(v).split(',')[0].trim()
  const h = first(host)
  if (!h || /^server(:|$)|^localhost(:|$)|^127\.0\.0\.1(:|$)|^\[?::1\]?(:|$)/i.test(h)) return ''
  return `${first(proto)}://${h}`
}

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
  //
  // The path is relative to the MOUNT. index.js does `app.use(normalizedTarget,
  // router)` with the target already `/serverXR`, and every sibling route here
  // is declared as `/api/…` for exactly that reason. This one was declared as
  // `/serverXR/og/…`, so it actually served `/serverXR/serverXR/og/…` — and the
  // nginx crawler rule proxies to `/serverXR/og$uri`, which therefore 404'd.
  // The effect on prod was worse than the bug being fixed: every crawler, for
  // every di.iiii link, got a 404 and no preview at all.
  router.get('/og/*splat', async (req, res, next) => {
    try {
      const splat = req.params.splat
      const path = String(Array.isArray(splat) ? splat.join('/') : (splat || '')).replace(/^\/+/, '')
      const handle = path.split('/')[0] || ''
      const origin = publicOrigin(req, siteOrigin)
      const url = `${origin}/${path}`
      // No handle, or a handle nothing answers to: still return a valid card
      // rather than a 404. A crawler that gets a 404 shows the bare URL, which
      // is uglier than the platform tile and tells the reader nothing.
      // `br_id_ge` is the handle people share; `br-id-ge` is the id in the
      // database, and the lookup behind this is an exact match — so the one
      // link this route was built for resolved to nothing and got the platform
      // tile. Try what was asked for, then the normalized form. index.js also
      // composes a slug lookup in front of this; the normalization lives HERE
      // so it is reachable by a test rather than only through a booted server.
      let meta = null
      const dashed = handle.replace(/_/g, '-').toLowerCase()
      for (const candidate of handle === dashed ? [handle] : [handle, dashed]) {
        meta = await loadSpaceMeta(candidate).catch(() => null)
        if (meta) break
      }
      if (!meta || meta.isPublic === false) {
        return res.type('html').send(ogHtml({
          // The platform's own front door, not the path that missed — sending a
          // crawler back to a URL we just failed to resolve is a loop.
          url: origin || undefined,
          title: 'di.iiii — make a space in your browser',
          description: 'Make a space of your own, build projects inside it out of nodes and objects, and share the link.',
          // Absolute, like the per-space branch. A relative image resolves
          // against og:url, so on the fallback path it used to resolve against
          // the internal address and reach nothing.
          image: origin ? origin + DEFAULT_IMAGE : undefined,
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
