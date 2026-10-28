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
//
// 2026-10-21: the card was only ever built for the fifteen named social
// crawlers nginx forked here. Googlebot, Bingbot and every other reader got
// the static shell — one title, one description, a relative og:image, og:url
// '/', no canonical — and every unknown address answered 200 with that same
// shell (a soft 404). resolveHead() below is now the ONE answer to "what is
// this address": the card route, the page route (the shell with this head
// written in, 404 when nothing answers) and the sitemap all read it.
const {
  RESERVED_PROJECT_SLUGS,
  APP_SEGMENTS,
  STATIC_SEGMENTS,
} = require('../../../shared/reservedSegments.cjs')

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESCAPES[c])

// A space may name its own card. Anything without one falls back to the
// platform tile, which is correct for a space that has no face of its own yet.
const DEFAULT_IMAGE = '/suite/og-image.png'
// Every card image is drawn at 1200x630 (`file public/suite/og-image.png
// public/og/*.png`). The alt text says what is IN the picture, not what the
// page is — the tile's line is the brand's to change (audit G10), so it is not
// repeated here.
const CARD_WIDTH = 1200
const CARD_HEIGHT = 630
const DEFAULT_IMAGE_ALT = 'The di.iiii mark and wordmark on black.'
const LOCALE = 'en_US'
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
  'br-id-ge': {
    src: '/og/br-id-ge.png',
    alt: 'Two overlapping rings of Armenian letters above a button reading “Carry this across”.',
  },
}
const DEFAULT_CARD = { src: DEFAULT_IMAGE, alt: DEFAULT_IMAGE_ALT }
const cardFor = (handle) => SPACE_CARDS[String(handle).replace(/_/g, '-').toLowerCase()] || DEFAULT_CARD

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

// The studio behind the platform, and the platform itself, as structured data
// (Google: Organization, WebSite). Facts only: the Instagram handle and an X
// account are the owner's to name, so `sameAs` carries the one public profile
// the repo itself proves — its own source.
const STUDIO = {
  '@type': 'Organization',
  name: 'di.i',
  url: 'https://thedi.studio',
  sameAs: ['https://github.com/dob-0/di.iiii'],
}

// Top-level words the client answers without a space behind them. A reserved
// app word (/login, /studio, /open_jam) or a public/ directory nginx serves is
// a real page; anything else must be a space the database knows, or it is a
// 404 — not the front door's shell with a 200 (audit G01, "soft 404").
const KNOWN_TOP = new Set([...APP_SEGMENTS, ...STATIC_SEGMENTS].map((w) => w.toLowerCase()))

// One room handed out on more than one address. `/open_jam/scene` and the bare
// `/open` land in the identical jam scene (src/project/routing/jamRouting.js),
// and `/open_jam` is that jam's editor — three addresses, one room, so one
// canonical: the space's own (audit G12).
const CANONICAL_ALIASES = { open_jam: 'open' }

// Tools, not pages: a crawler that reaches one should not index it. These are
// the reserved words with no STATIC_PAGES entry and no alias.
const isToolWord = (word) => KNOWN_TOP.has(word) && !STATIC_PAGES[word] && !CANONICAL_ALIASES[word]

const jsonLdScript = (data) => `<script type="application/ld+json">${
  // `<` escaped so a title carrying `</script>` cannot close the block.
  JSON.stringify(data).replace(/</g, '\\u003c')
}</script>`

// The head every address shares: link card, search snippet, canonical. Used
// by the crawler card (ogHtml) and written into the app's own shell
// (injectHead), so a search bot and a chat app read the same words.
function headTags({ url, title, description, image, imageAlt, imageSized = true, noindex = false, jsonLd = [] }) {
  const t = esc(title)
  const d = esc(description)
  const i = esc(image || DEFAULT_IMAGE)
  const a = esc(imageAlt || DEFAULT_IMAGE_ALT)
  const lines = [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="di.iiii">',
    `<meta property="og:locale" content="${LOCALE}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:image" content="${i}">`,
    ...(imageSized ? [
      `<meta property="og:image:width" content="${CARD_WIDTH}">`,
      `<meta property="og:image:height" content="${CARD_HEIGHT}">`,
    ] : []),
    `<meta property="og:image:alt" content="${a}">`,
    ...(url ? [`<meta property="og:url" content="${esc(url)}">`] : []),
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
    `<meta name="twitter:image" content="${i}">`,
    `<meta name="twitter:image:alt" content="${a}">`,
    ...(url ? [`<link rel="canonical" href="${esc(url)}">`] : []),
    ...(noindex ? ['<meta name="robots" content="noindex">'] : []),
    ...jsonLd.map(jsonLdScript),
  ]
  return lines.join('\n')
}

function ogHtml(head) {
  const u = esc(head.url)
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
${headTags(head)}
<meta http-equiv="refresh" content="0; url=${u}">
</head><body><a href="${u}">${esc(head.title)}</a></body></html>`
}

// Every tag headTags() writes, as it appears in the static shell (src/index.html)
// — removed before the resolved head goes in, so nothing is said twice.
const SHELL_HEAD_TAG = new RegExp([
  '<title>[\\s\\S]*?</title>',
  '<meta\\s+name="description"[^>]*>',
  '<meta\\s+property="og:[^"]*"[^>]*>',
  '<meta\\s+name="twitter:[^"]*"[^>]*>',
  '<link\\s+rel="canonical"[^>]*>',
  '<meta\\s+name="robots"[^>]*>',
  '<script\\s+type="application/ld\\+json">[\\s\\S]*?</script>',
].join('|'), 'gi')

// The app's shell with this address's head written in, for ANY reader — not
// only the fifteen crawlers nginx used to fork to the card. Everything else in
// the shell (the scripts, the bundle, the noscript floor) is left exactly as
// built. A shell without <head> is returned unchanged rather than guessed at.
//
// Written straight after the charset, near the TOP of the head: the shell's
// inline canonical script (src/index.html) runs where it stands during the
// parse and only adds a canonical when none is there yet — a link appended at
// </head> would not exist yet when it looked, and the page would carry two.
function injectHead(shell, head) {
  const html = String(shell || '')
  if (!/<head[^>]*>/i.test(html)) return html
  const stripped = html.replace(SHELL_HEAD_TAG, '')
  const anchor = /<meta\s+charset=[^>]*>/i.test(stripped) ? /<meta\s+charset=[^>]*>/i : /<head[^>]*>/i
  return stripped.replace(anchor, (tag) => `${tag}\n${headTags(head)}`)
}

const defaultLoadMeta = async (loadSpaceMeta, handle) => {
  // `br_id_ge` is the handle people share; `br-id-ge` is the id in the
  // database, and the lookup behind this is an exact match. Try what was
  // asked for, then the normalized form. index.js also composes a slug
  // lookup in front of this; the normalization lives HERE so it is reachable
  // by a test rather than only through a booted server.
  const dashed = handle.replace(/_/g, '-').toLowerCase()
  for (const candidate of handle === dashed ? [handle] : [handle, dashed]) {
    const meta = await loadSpaceMeta(candidate).catch(() => null)
    if (meta) return meta
  }
  return null
}

/**
 * What an address is, for anyone who reads its head.
 *
 * Returns { found, title, description, url, image, imageAlt, noindex, jsonLd }.
 * `found: false` means nothing answers to the address: the page route sends
 * it as a 404, the card route still sends the front door's card (a chat app
 * shown a 404 prints the bare URL, which tells the reader nothing).
 *
 * `url` is the canonical address. A space's canonical is its public handle
 * (slug, else id — the same link /spaces prints), so `/br_id_ge` and
 * `/br-id-ge` name one page, not two (audit G11).
 */
async function resolveHead({ path, hostSpaceId = null, origin = '', loadSpaceMeta, resolveProject = null, loadWikiArticles = null }) {
  const parts = String(path || '').split(/[?#]/)[0].split('/').filter(Boolean)
  const segments = hostSpaceId ? [hostSpaceId, ...parts] : parts
  const handle = segments[0] || ''
  const lower = handle.toLowerCase()
  const at = (p) => (origin ? `${origin}${p}` : undefined)
  const image = (card) => (origin ? origin + card.src : card.src)
  const front = {
    title: FRONT_DOOR.title,
    description: FRONT_DOOR.description,
    image: image(DEFAULT_CARD),
    imageAlt: DEFAULT_CARD.alt,
  }
  const website = origin ? { '@type': 'WebSite', name: 'di.iiii', url: `${origin}/` } : null
  const withContext = (items) => items.filter(Boolean).map((item) => ({ '@context': 'https://schema.org', ...item }))

  if (!hostSpaceId) {
    if (!handle) {
      return {
        found: true,
        ...front,
        // The platform's own front door, bare: crawlers and the existing cards
        // already carry it without a trailing slash.
        url: origin || undefined,
        jsonLd: withContext([website, { ...STUDIO, ...(origin ? { logo: `${origin}/suite/mark.svg` } : {}) }]),
      }
    }
    const staticPage = STATIC_PAGES[lower]
    // One wiki article, /wiki/{id} (G25): its own title, description and
    // canonical. An id the wiki does not have falls through to the wiki's own
    // card, with the wiki's address as canonical, not the address that missed.
    if (staticPage && lower === 'wiki' && segments[1] && typeof loadWikiArticles === 'function') {
      const articles = await loadWikiArticles().catch(() => null)
      const article = articles?.get(segments[1])
      if (article) {
        return {
          found: true,
          ...front,
          title: `${article.title} — Wiki — di.iiii`,
          description: article.summary || staticPage.description,
          url: at(`/wiki/${encodeURIComponent(article.id)}`),
        }
      }
    }
    if (staticPage) {
      return { found: true, ...front, title: staticPage.title, description: staticPage.description, url: at(`/${lower}`) }
    }
  }

  // An alias names a space by another word: read it as that space, and point
  // the canonical there.
  const alias = hostSpaceId ? null : CANONICAL_ALIASES[lower]
  const spaceHandle = alias || handle

  if (!hostSpaceId && !alias && isToolWord(lower)) {
    return { found: true, ...front, url: at(`/${lower}`), noindex: true }
  }

  const meta = await defaultLoadMeta(loadSpaceMeta, spaceHandle)
  if (!meta) {
    return { found: false, ...front, url: undefined, noindex: true }
  }
  if (meta.isPublic === false) {
    // A real space, not open to strangers: it exists (200), says nothing of
    // itself, and is never indexed.
    return { found: true, ...front, url: undefined, noindex: true }
  }

  // `main` is the space `/` opens on and is labelled after the platform
  // itself, so the generic line would read "di.iiii — a space on di.iiii."
  const own = (meta.id || spaceHandle) === 'main'
  const spaceTitle = meta.ogTitle || meta.label || spaceHandle
  const spaceLink = hostSpaceId ? '' : `/${alias || meta.slug || meta.id || handle}`
  const card = cardFor(meta.id || spaceHandle)

  // A project the URL itself names — /{space}/p/{project} (the explicit
  // shape) or /{space}/{projectSlug} (the vanity form; every other reserved
  // word is claimed above or by RESERVED_PROJECT_SLUGS, so a lone second
  // segment that survives both can only be a project slug or a miss).
  // Resolved only now that the SPACE is confirmed public: doing it earlier
  // would let a private space's project title leak through the one door that
  // skips the ordinary read gate. An alias's sub-path (/open_jam/scene) is
  // the room itself, never a project.
  const rest = alias ? [] : segments.slice(1)
  const projectSegment = rest[0] === 'p' && rest[1]
    ? rest[1]
    : (rest.length === 1 && rest[0] && !RESERVED_PROJECT_SLUGS.has(rest[0]) ? rest[0] : null)
  const project = (projectSegment && typeof resolveProject === 'function')
    ? await resolveProject(meta.id || spaceHandle, projectSegment).catch(() => null)
    : null

  const spaceUrl = at(spaceLink || '/')
  const spaceLd = {
    '@type': 'CreativeWork',
    name: spaceTitle,
    url: spaceUrl,
    ...(origin ? { isPartOf: { '@type': 'WebSite', name: 'di.iiii', url: `${origin}/` } } : {}),
  }

  if (project) {
    const projectUrl = at(`${spaceLink}/${rest.join('/')}`)
    const description = project.ogDescription
      || `${project.title} — a project in ${meta.label || spaceHandle} on di.iiii.`
    return {
      found: true,
      // No "— di.iiii" here, for the same reason the space's own card next
      // door does not carry one: og:site_name already says it.
      title: `${project.title} — ${spaceTitle}`,
      description,
      url: projectUrl,
      image: image(card),
      imageAlt: card.alt,
      jsonLd: withContext([{ '@type': 'CreativeWork', name: project.title, description, url: projectUrl, isPartOf: spaceLd }]),
    }
  }

  // The space's own line for visitors (shared/spaceBlurb.cjs) before the
  // generic sentence (G23).
  const description = meta.ogDescription || meta.blurb || meta.description
    || (own ? FRONT_DOOR.description : `${meta.label || spaceHandle} — a space on di.iiii.`)
  return {
    found: true,
    title: spaceTitle,
    description,
    // Deeper paths that are not a project (/wcc/scene, /x/scan) are still this
    // space's page; their canonical keeps the path, on the space's own handle.
    url: at(rest.length ? `${spaceLink}/${rest.join('/')}` : (spaceLink || '/')),
    image: image(card),
    imageAlt: card.alt,
    jsonLd: own ? [] : withContext([{ ...spaceLd, description }]),
  }
}

function hostContext(req, { siteOrigin, spaceIdForHost }) {
  // A space on its own domain (SPEC_space_own_domain.md): yokozo.xyz/x is
  // diiii.xyz/taronx/x. The card is looked up as the space path, but its
  // address stays the domain the link was shared on — and SITE_ORIGIN,
  // which names the platform, must not override it.
  const forwardedHost = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim().replace(/:\d+$/, '')
  const hostSpaceId = (typeof spaceIdForHost === 'function' && forwardedHost) ? spaceIdForHost(forwardedHost) : null
  const origin = hostSpaceId ? publicOrigin(req, '') : publicOrigin(req, siteOrigin)
  return { hostSpaceId, origin }
}

const splatPath = (req) => {
  const splat = req.params.splat
  return String(Array.isArray(splat) ? splat.join('/') : (splat || '')).replace(/^\/+/, '')
}

// Fetches the built shell (dist/index.html) and keeps it, revalidating with
// its ETag on every use: a shell held past a deploy would name hashed bundles
// that no longer exist, and that page would load blank.
function createShellSource({ readShell = null, shellUrl = '', fetchImpl = globalThis.fetch } = {}) {
  let cached = null
  return async () => {
    if (typeof readShell === 'function') return readShell()
    if (!shellUrl) return null
    const headers = cached?.etag ? { 'if-none-match': cached.etag } : {}
    // Bounded: nginx waits 10s on the page route before it falls back to the
    // static shell, and a hung fetch here must not hold a request that long.
    const res = await fetchImpl(shellUrl, { headers, signal: AbortSignal.timeout(3000) })
    if (res.status === 304 && cached) return cached.body
    if (!res.ok) return null
    cached = { etag: res.headers.get('etag'), body: await res.text() }
    return cached.body
  }
}

function registerOgRoutes(router, { loadSpaceMeta, resolveProject = null, siteOrigin, spaceIdForHost = null, loadShell = null, loadWikiArticles = null }) {
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
  // $uri is `/` — so the one link most likely to be shared, diiii.xyz
  // itself, fell past this router entirely and a crawler got nginx's 403 page.
  // The fallback for "no handle" was already written a few lines below; it was
  // simply unreachable. Registering the empty case is the whole fix.
  const cardHandler = async (req, res, next) => {
    try {
      const { hostSpaceId, origin } = hostContext(req, { siteOrigin, spaceIdForHost })
      const head = await resolveHead({ path: splatPath(req), hostSpaceId, origin, loadSpaceMeta, resolveProject, loadWikiArticles })
      // An address nothing answers to still gets a valid card rather than a
      // 404, pointed at the platform's own front door — sending a crawler
      // back to a URL we just failed to resolve is a loop.
      res.type('html').send(ogHtml(head.found ? head : { ...head, url: origin || undefined, noindex: false }))
    } catch (error) { next(error) }
  }

  router.get('/og/*splat', cardHandler)
  // The bare domain. Both spellings: nginx sends `/og/` for `/`, and `/og` is
  // what a hand-typed or redirected request arrives as.
  router.get('/og', cardHandler)
  router.get('/og/', cardHandler)

  // The page itself: the app's shell, this address's head written in, and the
  // true status — 404 when nothing answers (audit G01, G02). nginx sends every
  // page request here and falls back to the static shell if this fails, so a
  // stopped serverXR still serves the app (nginx.conf, `location /`). A `di`
  // install, where serverXR IS the web server, calls renderPage directly.
  const renderPage = async (req, path) => {
    const shell = typeof loadShell === 'function' ? await loadShell().catch(() => null) : null
    if (!shell) return null
    const { hostSpaceId, origin } = hostContext(req, { siteOrigin, spaceIdForHost })
    const head = await resolveHead({ path, hostSpaceId, origin, loadSpaceMeta, resolveProject, loadWikiArticles })
    return { status: head.found ? 200 : 404, html: injectHead(shell, head) }
  }
  const pageHandler = async (req, res, next) => {
    try {
      const page = await renderPage(req, splatPath(req))
      if (!page) {
        res.set('Cache-Control', 'no-store')
        return res.status(503).type('text/plain').send('shell unavailable')
      }
      res.set('Cache-Control', 'no-cache')
      res.status(page.status).type('html').send(page.html)
    } catch (error) { next(error) }
  }
  router.get('/page/*splat', pageHandler)
  router.get('/page', pageHandler)
  router.get('/page/', pageHandler)
  return { renderPage }
}

module.exports = { registerOgRoutes, ogHtml, headTags, injectHead, resolveHead, createShellSource, publicOrigin }
