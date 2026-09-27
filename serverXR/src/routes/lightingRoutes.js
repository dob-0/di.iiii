const path = require('path')
const { requireLocalRuntime, isLanAllowed } = require('../localRuntimeGuard')

// The lighting desk — serverXR/src/lighting — mounted at /light on a LOCAL di.iiii.
//
// Two rules keep a dev server from ever touching a real rig:
//   1. the desk is built on the first request to /light, never at boot, so a serverXR
//      that nobody points at lighting never loads the engine, binds the Art-Net socket
//      or starts a 40 Hz loop;
//   2. its output is OFF until someone switches it on under OUTPUT — the engine renders
//      (the stage view is live, scenes recall), nothing leaves the machine. The
//      standalone club desk keeps the opposite default; a restart there must transmit.
//
// The desk's own HTTP handler answers everything under the mount: its interface files
// (relative paths, so /light/ and /serverXR/light/ both work) and its /api/* routes.
// It is mounted BEFORE express.json so the desk reads its own bodies — a library push
// is up to 16 MB, byte-exact, and the desk's cap and UTF-8 handling apply.
// A space's id as spaceStore makes them. The desk checks the same rule again.
const SPACE_ID = /^[a-z0-9-]{3,48}$/

// ONE SHOW PER SPACE. A space's light show lives beside its scene —
// <spacesDir>/<id>/lighting/show.json — so it travels with the space, in its .diiii
// file (scripts/space-bundle.mjs). This machine's own show stays where it always was,
// <dataDir>/lighting/show.json. `findSpace(id)` answers { label } for a space that is
// here, null for one that is not; without it (and `spacesDir`) the desk keeps one show.
function registerLightingRoutes(app, { dataDir, spacesDir = null, findSpace = null, mountPaths = ['/light'], offline = false, log, listen = null } = {}) {
  let desk = null
  const getDesk = () => {
    if (desk) return desk
    const { createDesk } = require('../lighting/desk')
    desk = createDesk({
      dataDir: path.join(dataDir, 'lighting'),
      offline,
      outputEnabledDefault: false,
      lanAllowed: isLanAllowed(),
      // How the server around the desk listens — the Phone box reads it, so a
      // loopback-only `di up` stops printing a phone URL no phone can open.
      listen,
      log,
      spaces: spacesDir && typeof findSpace === 'function'
        ? { dir: (id) => path.join(spacesDir, id, 'lighting'), find: findSpace }
        : null
    })
    return desk
  }

  const handler = (req, res) => {
    // The show clock is asked for every second by any Perform page open on
    // this machine (src/perform/useShowClock.js). Asking must not BUILD the
    // desk — that would start the 40 Hz loop and bind Art-Net on an install
    // with no lights because a VJ opened a deck. No desk yet: "not up", with
    // this machine's time, which is all a follower needs to keep its own.
    if (!desk && req.method === 'GET' && req.path === '/api/clock') {
      res.set('Cache-Control', 'no-store')
      res.json({ up: false, now: Date.now() })
      return
    }
    const [bare, query] = req.originalUrl.split('?')
    if (req.path === '/' || req.path === '') {
      // /light/?space=<id> — a space opened the desk (the bar, Projection's Light) — is
      // that space's page, /light/space/<id>/, whose relative addresses then all say
      // which show they mean. The query rides along: it is what draws the way back.
      const space = new URLSearchParams(query || '').get('space')
      if (space && SPACE_ID.test(space)) {
        res.redirect(302, bare.replace(/\/?$/, '/') + 'space/' + space + '/' + (query ? '?' + query : ''))
        return
      }
      // /light → /light/ : the interface uses relative addresses (api/state, style.css)
      // and they only resolve under a directory-shaped URL.
      if (!bare.endsWith('/')) {
        res.redirect(302, bare + '/' + (query ? '?' + query : ''))
        return
      }
    }
    getDesk().handle(req, res, req.path || '/')
  }

  for (const mount of mountPaths) app.use(mount, requireLocalRuntime, handler)

  return {
    getDesk,
    // Asking never builds one: the rig mirrors a blackout onto a desk that a
    // browser already opened, without starting the 40 Hz loop on an install
    // that has no lights.
    hasDesk: () => desk !== null,
    // Only the desk that was actually built is closed; asking never builds one.
    close: () => { if (desk) { desk.close(); desk = null } }
  }
}

module.exports = { registerLightingRoutes }
