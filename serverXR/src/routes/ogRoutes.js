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
//
// 2026-09-14: this only ever resolved the first path segment as a SPACE. Every
// other reserved top-level page — /login, /terms, /privacy, /for-apps,
// /spaces, /wiki — is not a space, so `loadSpaceMeta` found nothing for any of
// them and they all fell to the FRONT_DOOR card, same as a genuinely unknown
// address. And a project a link named explicitly — /{space}/p/{project}, or
// the vanity /{space}/{projectSlug} form — was read only as far as the space:
// sharing one project's page previewed as the whole space, telling a reader
// nothing about the one thing they were sent to look at.
const { RESERVED_PROJECT_SLUGS } = require('../../../shared/reservedSegments.cjs')

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESCAPES[c])

// A space may name its own card. Anything without one falls back to the
// platform tile, which is correct for a space that has no face of its own yet.
const DEFAULT_IMAGE = '/suite/og-image.png'
// Kept character-for-character in step with src/index.html: a link preview
// that says something different from the page it opens is how the pre-sweep
// positioning survived the lexicon pass.
const FRONT_DOOR = {
  title: 'di.iiii — public spaces on the open web',
  description: 'Make a space, hand out the address — a link while it runs, a file when it ends. No app, no store, nothing to install; it opens in a browser, or in a headset.',
}

// Explicit, not conventional. Deriving the filename from the handle would point
// every space without a card at a URL that 404s, and a crawler given a broken
// image shows no image at all — worse than the platform tile it replaced. A
// space appears here only once its card is actually committed to public/og/.
const SPACE_CARDS = {
  'br-id-ge': '/og/br-id-ge.png',
}
const cardFor = (handle) => SPACE_CARDS[String(handle).replace(/_/g, '-').toLowerCase()] || DEFAULT_IMAGE

// Reserved top-level pages that are never spaces (shared/reservedSegments.cjs
// APP_SEGMENTS) but each have a real, public page of their own worth
// previewing. A reserved word with no page of its own — /raw, /studio,
// /make, a stray /tools link — keeps the FRONT_DOOR fallback below, which is
// the honest answer for an address with nothing to show.
//
// Titles carry the "— di.iiii" suffix a space's own card does not: a space's
// card leaves that to og:site_name (see ogHtml) because the space's OWN name
// is the whole point of that card, but these pages are the platform's own —
// there is no second name to protect from repeating "di.iiii" twice.
const STATIC_PAGES = {
  login: {
    title: 'Sign in — di.iiii',
    description: 'Sign in to di.iiii.',
  },
  terms: {
    title: 'Terms — di.iiii',
    description: 'Short and factual: the code is open (AGPL-3.0), your content is yours, and the few real limits are listed here.',
  },
  privacy: {
    title: 'Privacy — di.iiii',
    description: 'What di.iiii actually collects, keeps, and doesn’t — written from a code audit, not a template.',
  },
  'for-apps': {
    title: 'For apps — di.iiii',
    description: 'Programs are welcome to read what di.iiii shows the public. Say who you are, and you get more room.',
  },
  spaces: {
    title: 'Spaces — di.iiii',
    description: 'Every space on di.iiii — make one, hand out the address, or step into someone else’s.',
  },
  wiki: {
    title: 'Wiki — di.iiii',
    description: 'How di.iiii works, written down: spaces, access, editing, and the API.',
  },
}

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

function registerOgRoutes(router, { loadSpaceMeta, resolveProject = null, siteOrigin }) {
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
  //
  // `*splat` requires AT LEAST ONE segment, so `/og` and `/og/` never matched
  // it. nginx proxies a crawler to `/serverXR/og$uri`, and for the bare domain
  // $uri is `/` — so the one link most likely to be shared, di-studio.xyz
  // itself, fell past this router entirely and a crawler got nginx's 403 page.
  // The fallback for "no handle" was already written a few lines below; it was
  // simply unreachable. Registering the empty case is the whole fix.
  const handler = async (req, res, next) => {
    try {
      const splat = req.params.splat
      const path = String(Array.isArray(splat) ? splat.join('/') : (splat || '')).replace(/^\/+/, '')
      const segments = path.split('/').filter(Boolean)
      const handle = segments[0] || ''
      const origin = publicOrigin(req, siteOrigin)
      const url = `${origin}/${path}`

      // A reserved top-level page — checked before any space lookup, since
      // none of these words can ever BE a space (RESERVED_PROJECT_SLUGS /
      // reservedSegments.cjs) and asking would only cost a round trip to
      // learn what is already known.
      const staticPage = STATIC_PAGES[handle.toLowerCase()]
      if (staticPage) {
        return res.type('html').send(ogHtml({
          url: origin ? `${origin}/${handle}` : undefined,
          title: staticPage.title,
          description: staticPage.description,
          image: origin ? origin + DEFAULT_IMAGE : undefined,
        }))
      }

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
          title: FRONT_DOOR.title,
          description: FRONT_DOOR.description,
          // Absolute, like the per-space branch. A relative image resolves
          // against og:url, so on the fallback path it used to resolve against
          // the internal address and reach nothing.
          image: origin ? origin + DEFAULT_IMAGE : undefined,
        }))
      }
      // `main` is the space `/` opens on and is labelled after the platform
      // itself, so the generic line would read "di.iiii — a space on di.iiii."
      const own = (meta.id || handle) === 'main'
      const spaceTitle = meta.ogTitle || meta.label || handle

      // A project the URL itself names — /{space}/p/{project} (the explicit
      // shape) or /{space}/{projectSlug} (the vanity form; every other
      // reserved word is claimed above or by RESERVED_PROJECT_SLUGS, so a
      // lone second segment that survives both can only be a project slug or
      // a miss). Resolved only now that the SPACE is confirmed public: doing
      // it earlier would let a private space's project title leak through the
      // one door that skips the ordinary read gate.
      const rest = segments.slice(1)
      const projectSegment = rest[0] === 'p' && rest[1]
        ? rest[1]
        : (rest.length === 1 && rest[0] && !RESERVED_PROJECT_SLUGS.has(rest[0]) ? rest[0] : null)
      const project = (projectSegment && typeof resolveProject === 'function')
        ? await resolveProject(meta.id || handle, projectSegment).catch(() => null)
        : null

      if (project) {
        return res.type('html').send(ogHtml({
          url,
          // No "— di.iiii" here either, for the same reason the space's own
          // card next door does not carry one: og:site_name already says it.
          title: `${project.title} — ${spaceTitle}`,
          description: project.ogDescription
            || `${project.title} — a project in ${meta.label || handle} on di.iiii.`,
          image: origin + cardFor(handle),
        }))
      }

      res.type('html').send(ogHtml({
        url,
        title: spaceTitle,
        description: meta.ogDescription || meta.description
          || (own ? FRONT_DOOR.description : `${meta.label || handle} — a space on di.iiii.`),
        image: origin + cardFor(handle),
      }))
    } catch (error) { next(error) }
  }

  router.get('/og/*splat', handler)
  // The bare domain. Both spellings: nginx sends `/og/` for `/`, and `/og` is
  // what a hand-typed or redirected request arrives as.
  router.get('/og', handler)
  router.get('/og/', handler)
}

module.exports = { registerOgRoutes, ogHtml }
