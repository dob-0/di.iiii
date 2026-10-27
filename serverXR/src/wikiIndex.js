// The wiki's articles, as a crawler's card needs them: id, title, summary.
//
// /wiki was one page of about 250,000 characters with 108 hash anchors, so a
// search engine and a share card saw one page, never the article a link named
// (marketing audit 2026-10-21, G25). Each article now has its own address,
// /wiki/{id}, and the og route gives it its own title, description and
// canonical from here.
//
// One source: src/wiki/wikiContent.js, the same file the browser renders. It
// is read at run time rather than copied into a generated file, so an article
// added on any branch has its card the moment it ships, with no second file
// to regenerate. The server image carries that one file at the same relative
// path (serverXR/Dockerfile: COPY src/wiki/wikiContent.js /src/wiki/...).
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const logger = require('./logger')

const WIKI_CONTENT_PATH = path.resolve(__dirname, '../../src/wiki/wikiContent.js')

let cached = null

// Resolves to a Map id → { id, title, summary }. A missing or broken file is
// logged and resolves to an empty Map: every /wiki/{id} card then falls back
// to the wiki's own card, which is a plain card, not a wrong one.
const loadWikiArticles = (filePath = WIKI_CONTENT_PATH) => {
  if (cached && filePath === WIKI_CONTENT_PATH) return cached
  const loading = import(pathToFileURL(filePath).href)
    .then((mod) => new Map((mod.WIKI_ARTICLES || [])
      .filter((a) => a && typeof a.id === 'string' && a.id)
      .map((a) => [a.id, { id: a.id, title: String(a.title || a.id), summary: String(a.summary || '') }])))
    .catch((error) => {
      logger.warn(`[wikiIndex] could not read ${filePath}: ${error.message} — /wiki/{id} cards fall back to the wiki's own`)
      return new Map()
    })
  if (filePath === WIKI_CONTENT_PATH) cached = loading
  return loading
}

module.exports = { loadWikiArticles, WIKI_CONTENT_PATH }
