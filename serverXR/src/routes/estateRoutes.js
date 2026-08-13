const fs = require('fs')
const path = require('path')

// The estate map — every machine, address and store we own — is written and
// kept in the PRIVATE di-atlas repo. This repo is public, so the map is never
// committed here and never dropped into public/, where it would be served to
// anyone who asked. It reaches the box out of band and this route hands it to
// admins only.
//
// Size cap because the response is inlined into an iframe srcdoc: a runaway file
// would be pulled wholly into the admin page's memory.
const MAX_BYTES = 2 * 1024 * 1024

function registerEstateRoutes(router, { requireAdminAlways, estateMapPath, readFile = fs.promises.readFile, stat = fs.promises.stat }) {
  router.get('/api/estate/map', requireAdminAlways, async (req, res, next) => {
    if (!estateMapPath) {
      return res.status(404).json({
        error: 'not-configured',
        message: 'ESTATE_MAP_PATH is unset — the map lives in the private di-atlas and is placed on the host out of band.'
      })
    }
    try {
      const info = await stat(estateMapPath)
      if (info.size > MAX_BYTES) {
        return res.status(413).json({ error: 'too-large', message: 'The estate map exceeds ' + MAX_BYTES + ' bytes.' })
      }
      const html = await readFile(estateMapPath, 'utf8')
      res.json({
        html,
        updatedAt: new Date(info.mtimeMs).toISOString(),
        bytes: info.size,
        name: path.basename(estateMapPath)
      })
    } catch (error) {
      if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
        return res.status(404).json({
          error: 'missing',
          message: 'ESTATE_MAP_PATH is set but nothing is there — the map was not deployed to this host.'
        })
      }
      next(error)
    }
  })
}

module.exports = { registerEstateRoutes }
