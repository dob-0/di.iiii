// The catalogue: every route serverXR answers, described once, in the shape an
// agent needs — what it does, what it takes, how far it reaches, and whether an
// agent may call it at all. Spec: docs/architecture/SPEC_agent_door.md.
//
// Entries live in ./entries/<area>.js. The contract test
// (catalogueContracts.test.js) boots a real server, walks its live router
// (./routeWalk.js) and fails on any route without an entry and any entry
// without a route. That is the whole of "the MCP grows with the platform": a
// route cannot land undescribed, and the MCP reads this catalogue from the
// running server, so it can never describe a server other than the one it is
// talking to.
//
// Entry shape:
//   route    'METHOD /path/:param'       — exactly as the live router lists it
//   summary  one line, what it does       — what di_find searches
//   reach    'read' | 'private' | 'public' — sdk/reach.js's words: public OPENS
//            A DOOR (a new audience can see, edit or reach something)
//   role     'guest' | 'viewer' | 'editor' | 'admin' — the least the route
//            already demands; the catalogue describes, it does not relax
//   agent    true | false                  — false: never reachable through the
//            agent door (accounts, admin, key minting, approvals, webhooks,
//            streams, or not yet described)
//   input    optional { query?, body? }    — JSON Schema objects
//   note     optional, a trap worth knowing before calling

const { entries: AREAS } = require('./entries')

const REACHES = Object.freeze(['read', 'private', 'public'])
const ROLES = Object.freeze(['guest', 'viewer', 'editor', 'admin'])
const METHODS = Object.freeze(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

const splitRoute = (route) => {
  const [method, ...rest] = String(route).trim().split(/\s+/)
  return { method: method.toUpperCase(), path: rest.join(' ') }
}

const pathParams = (path) => [...path.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1])

// Tool-safe name: 'GET /api/spaces/:spaceId/projects' → 'get_spaces_projects'.
// Names are unique by construction (the test checks), stable while the route
// is, and readable enough that di_find results make sense at a glance.
const nameOf = (route) => {
  const { method, path } = splitRoute(route)
  const words = path
    .replace(/^\/api\//, '/')
    .split('/')
    .filter((part) => part && !part.startsWith(':') && !part.startsWith('*'))
    .map((part) => part.replace(/[^a-z0-9]+/gi, '_').toLowerCase())
  return [method.toLowerCase(), ...words].join('_').replace(/_+/g, '_')
}

const problemsOf = (entry) => {
  const problems = []
  const { method, path } = splitRoute(entry.route || '')
  if (!METHODS.includes(method) || !path.startsWith('/')) problems.push('route must be "METHOD /path"')
  if (!entry.summary || typeof entry.summary !== 'string') problems.push('summary missing')
  if (!REACHES.includes(entry.reach)) problems.push(`reach must be one of ${REACHES.join('/')}`)
  if (!ROLES.includes(entry.role)) problems.push(`role must be one of ${ROLES.join('/')}`)
  if (typeof entry.agent !== 'boolean') problems.push('agent must be true or false')
  if (method === 'GET' && entry.reach !== 'read') problems.push('a GET must be reach: read')
  if (method !== 'GET' && entry.reach === 'read') problems.push(`a ${method} changes something; reach cannot be read`)
  return problems
}

const load = (areas = AREAS) => {
  const list = []
  for (const [area, entries] of Object.entries(areas)) {
    for (const entry of entries) list.push({ ...entry, area, name: nameOf(entry.route), ...splitRoute(entry.route) })
  }
  return list
}

/** Compare the catalogue with what the live router answers. */
const compare = (liveRoutes, list = load()) => {
  const live = new Set(liveRoutes.map((r) => `${r.method} ${r.path}`))
  const declared = new Map(list.map((e) => [`${e.method} ${e.path}`, e]))
  const names = new Map()
  const invalid = []
  for (const entry of list) {
    const problems = problemsOf(entry)
    if (names.has(entry.name) && names.get(entry.name) !== entry.route) {
      problems.push(`name ${entry.name} collides with ${names.get(entry.name)}`)
    }
    names.set(entry.name, entry.route)
    if (problems.length) invalid.push({ route: entry.route, problems })
  }
  return {
    undeclared: [...live].filter((key) => !declared.has(key)).sort(),
    stale: [...declared.keys()].filter((key) => !live.has(key)).sort(),
    invalid,
    counts: {
      live: live.size,
      declared: declared.size,
      agent: list.filter((e) => e.agent).length,
      closed: list.filter((e) => !e.agent).length
    }
  }
}

const toOpenApiPath = (path) => path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}').replace(/\*([A-Za-z_]+)/g, '{$1}')

/** The catalogue as an OpenAPI 3.1 document. `keep` filters entries. */
const openapi = ({ keep = () => true, version = '0.0.0', list = load() } = {}) => {
  const paths = {}
  for (const entry of list.filter(keep)) {
    const operation = {
      operationId: entry.name,
      summary: entry.summary,
      tags: [entry.area],
      parameters: [
        ...pathParams(entry.path).map((name) => ({ name, in: 'path', required: true, schema: { type: 'string' } })),
        ...Object.entries(entry.input?.query?.properties || {}).map(([name, schema]) => ({
          name, in: 'query', required: (entry.input.query.required || []).includes(name), schema
        }))
      ],
      'x-di-reach': entry.reach,
      'x-di-role': entry.role,
      'x-di-agent': entry.agent
    }
    if (entry.note) operation.description = entry.note
    if (entry.input?.body) {
      operation.requestBody = { required: true, content: { 'application/json': { schema: entry.input.body } } }
    }
    const key = toOpenApiPath(entry.path)
    paths[key] = { ...(paths[key] || {}), [entry.method.toLowerCase()]: operation }
  }
  return {
    openapi: '3.1.0',
    info: { title: 'di.iiii serverXR', version },
    servers: [{ url: '/serverXR' }],
    paths
  }
}

module.exports = { load, compare, openapi, nameOf, splitRoute, pathParams, problemsOf, REACHES, ROLES }
