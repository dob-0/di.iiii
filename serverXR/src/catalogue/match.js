// A request -> the catalogue entries it could be.
//
// The catalogue (./index.js) describes every route once, with how far it
// reaches. A router-level guard has to answer "how far does THIS request reach"
// before Express has picked a handler, so the entries are turned into patterns
// here and a request path is matched against all of them.
//
// A request can match more than one entry (`/api/projects/:projectId/restore`
// and a neighbour shaped alike). The guard must not guess which one Express
// will run, so this returns every entry that could be it and the caller refuses
// when ANY of them is out of bounds. A path that matches none is not a route
// the server describes.
//
// Patterns follow Express 5's string paths as the catalogue spells them:
// `:name` is one segment, `*name` is the rest of the path. Matching is
// case-insensitive and tolerates a trailing slash, as Express routing does by
// default.

const { load } = require('./index')

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const patternOf = (path) => {
  const source = String(path).split('/').map((segment) => {
    if (segment.startsWith(':')) return '[^/]+'
    if (segment.startsWith('*')) return '.+'
    return escapeRegExp(segment)
  }).join('/')
  return new RegExp(`^${source}/?$`, 'i')
}

let compiled = null
const patterns = () => {
  if (!compiled) compiled = load().map((entry) => ({ entry, method: entry.method, test: patternOf(entry.path) }))
  return compiled
}

// HEAD is answered by the GET handler; the catalogue lists GET.
const asCatalogueMethod = (method) => {
  const verb = String(method || '').toUpperCase()
  return verb === 'HEAD' ? 'GET' : verb
}

const matchEntries = (method, path) => {
  const verb = asCatalogueMethod(method)
  const where = String(path || '')
  return patterns().filter((p) => p.method === verb && p.test.test(where)).map((p) => p.entry)
}

module.exports = { matchEntries, patternOf }
