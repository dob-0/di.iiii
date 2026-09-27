// Every route this process answers, read from the live Express router rather
// than from a list someone keeps by hand.
//
// Express 5 (router@2) forgets the path a sub-router was mounted at: a `use`
// layer keeps a matcher, not the string. So the walk needs one thing recorded
// while the server is being put together — which router was mounted where —
// and installMountRecorder() does that by wrapping Router.prototype.use before
// the first route is registered. Nothing else about routing changes: the
// wrapper records, then calls the original with the same arguments.
//
// Paths come back RELATIVE TO THE API BASE (the /serverXR mount, or whatever
// MOUNT_PATH says), because that is the address an agent or the SDK speaks:
// `GET /api/spaces`, not `GET /serverXR/api/spaces`.

// express.Router IS router@2's Router in Express 5, so this is the same
// prototype every router in this process inherits from.
const Router = require('express').Router

const MOUNTS = new WeakMap() // sub-router -> Set of mount paths
let installed = false

const isRouter = (fn) => typeof fn === 'function' && Array.isArray(fn.stack)

const flattenArgs = (args) => {
  const flat = args.flat(Infinity)
  if (typeof flat[0] === 'function') return { paths: ['/'], fns: flat }
  const first = flat[0]
  return { paths: Array.isArray(first) ? first : [first], fns: flat.slice(1) }
}

const installMountRecorder = () => {
  if (installed) return
  installed = true
  const originalUse = Router.prototype.use
  Router.prototype.use = function recordingUse(...args) {
    const { paths, fns } = flattenArgs(args)
    for (const fn of fns) {
      if (!isRouter(fn)) continue
      const seen = MOUNTS.get(fn) || new Set()
      for (const p of paths) if (typeof p === 'string') seen.add(p)
      MOUNTS.set(fn, seen)
    }
    return originalUse.apply(this, args)
  }
}

const joinPath = (prefix, path) => {
  const joined = `${prefix.replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`
  return joined.length > 1 ? joined.replace(/\/+$/, '') : '/'
}

// Strip whichever API base a path starts with. Mounts of the same router at
// '/serverXR' and at config.mountPath are one API, not two.
const relativeToBase = (path, bases) => {
  for (const base of bases) {
    const clean = base.replace(/\/+$/, '')
    if (!clean) continue
    if (path === clean) return '/'
    if (path.startsWith(`${clean}/`)) return path.slice(clean.length)
  }
  return path
}

/**
 * List every string-path route reachable from `app`.
 * Returns [{ method: 'GET', path: '/api/spaces/:spaceId' }], sorted and unique.
 * Regex routes (the SPA fallback) are skipped: they are not API.
 */
const listRoutes = (app, { bases = ['/serverXR'] } = {}) => {
  const out = new Map()
  const walk = (router, prefixes) => {
    for (const layer of router.stack || []) {
      if (layer.route) {
        const routePaths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path]
        for (const routePath of routePaths) {
          if (typeof routePath !== 'string') continue
          for (const method of Object.keys(layer.route.methods || {})) {
            if (method === '_all') continue
            for (const prefix of prefixes) {
              const path = relativeToBase(joinPath(prefix, routePath), bases)
              const key = `${method.toUpperCase()} ${path}`
              out.set(key, { method: method.toUpperCase(), path })
            }
          }
        }
        continue
      }
      if (isRouter(layer.handle)) {
        const mounts = MOUNTS.get(layer.handle) || new Set(['/'])
        const next = []
        for (const prefix of prefixes) for (const mount of mounts) next.push(joinPath(prefix, mount))
        walk(layer.handle, [...new Set(next)])
      }
    }
  }
  walk(app.router || app._router, ['/'])
  return [...out.values()].sort((a, b) => (a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)))
}

module.exports = { installMountRecorder, listRoutes, relativeToBase, joinPath }
