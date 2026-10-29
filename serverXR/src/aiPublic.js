// What di.iiii tells a language model, by URL: /llms.txt and the markdown
// files under /ai/ (llms.txt links them). Read from the public bundle folder,
// docs/ai/public/ in the repo — the public level of the one context, the only
// level a stranger reads (docs/ai/public/README.md).
//
// Why serverXR and not nginx's static files: before this, /llms-full.txt and
// every /ai/… address answered 200 with the app's HTML shell (the SPA
// fallback), so an assistant that fetched one read an app page and took it
// for content. Under /ai/ a file that is not in the bundle is a 404 here,
// never the shell.
//
// Mounted twice by index.js: on the API router (nginx sends /llms.txt and
// /ai/ to /serverXR/…), and at the root when serverXR is also the web server
// (CLIENT_DIR, a local `di` install). The pack carries the bundle
// (scripts/pack-runtime.mjs copies docs/ai/public), because the dev tier runs
// the pack without nginx; a build that lacks the folder answers 404 for all of it.

const fs = require('node:fs/promises')
const path = require('node:path')
const { parseLlmsTxt } = require('./llmsTxt')

const DEFAULT_BUNDLE_DIR = path.resolve(__dirname, '../../docs/ai/public')

// A file under /ai/ is one plain name: lower case, digits, dashes, `.md`.
// Nothing else is ever looked up on disk, so no `..`, no dot-files, no nesting.
const BUNDLE_FILE = /^\/([a-z0-9][a-z0-9-]*\.md)$/

// Addresses under /ai/ that are pages of the app, not files of the bundle.
// When serverXR is the web server these pass on to the app; on the API router
// they are a 404 like any unknown name (nginx sends them to the app itself).
const AI_APP_PAGES = new Set(['/setup'])

const HEADERS = {
  'Cache-Control': 'public, max-age=300',
  'X-Content-Type-Options': 'nosniff'
}

const notFound = (res, message = 'Not found') => {
  res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.status(404).type('text/plain; charset=utf-8').send(`${message}\n`)
}

const readBundleFile = async (dir, name) => {
  try {
    return await fs.readFile(path.join(dir, name), 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null
    throw error
  }
}

function registerAiPublicRoutes(target, { bundleDir = DEFAULT_BUNDLE_DIR, appPages = false, logger = console } = {}) {
  target.get('/llms.txt', async (req, res, next) => {
    try {
      const text = await readBundleFile(bundleDir, 'llms.txt')
      if (text === null) return notFound(res)
      // A broken file is worse than none: a reader cannot tell it is broken.
      const parsed = parseLlmsTxt(text)
      if (!parsed.ok) {
        logger.error?.(`[ai] llms.txt in ${bundleDir} is not valid: ${parsed.errors.join('; ')}`)
        res.set('Cache-Control', 'no-store')
        return res.status(500).type('text/plain; charset=utf-8').send('llms.txt in this build is not valid.\n')
      }
      res.set(HEADERS)
      res.type('text/plain; charset=utf-8').send(text)
    } catch (error) { next(error) }
  })

  // llmstxt.org names no "full" file, and di.iiii keeps one. A 404 that says
  // where to go, not the app shell.
  target.get('/llms-full.txt', (req, res) => notFound(res, 'Not found. di.iiii keeps one file for language models: /llms.txt'))

  target.use('/ai', async (req, res, next) => {
    try {
      if (appPages && AI_APP_PAGES.has(req.path.replace(/\/$/, ''))) return next()
      const match = BUNDLE_FILE.exec(req.path)
      if (!match || (req.method !== 'GET' && req.method !== 'HEAD')) return notFound(res)
      const text = await readBundleFile(bundleDir, match[1])
      if (text === null) return notFound(res)
      res.set({ ...HEADERS, Link: '</llms.txt>; rel="describedby"' })
      res.type('text/markdown; charset=utf-8').send(text)
    } catch (error) { next(error) }
  })
}

module.exports = { registerAiPublicRoutes, DEFAULT_BUNDLE_DIR, AI_APP_PAGES }
