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
function registerLightingRoutes(app, { dataDir, mountPaths = ['/light'], offline = false, log } = {}) {
  let desk = null
  const getDesk = () => {
    if (desk) return desk
    const { createDesk } = require('../lighting/desk')
    desk = createDesk({
      dataDir: path.join(dataDir, 'lighting'),
      offline,
      outputEnabledDefault: false,
      lanAllowed: isLanAllowed(),
      log
    })
    return desk
  }

  const handler = (req, res) => {
    // /light → /light/ : the interface uses relative addresses (api/state, style.css)
    // and they only resolve under a directory-shaped URL.
    const [bare, query] = req.originalUrl.split('?')
    if ((req.path === '/' || req.path === '') && !bare.endsWith('/')) {
      res.redirect(302, bare + '/' + (query ? '?' + query : ''))
      return
    }
    getDesk().handle(req, res, req.path || '/')
  }

  for (const mount of mountPaths) app.use(mount, requireLocalRuntime, handler)

  return {
    getDesk,
    // Only the desk that was actually built is closed; asking never builds one.
    close: () => { if (desk) { desk.close(); desk = null } }
  }
}

module.exports = { registerLightingRoutes }
