'use strict'

const path = require('path')
const express = require('express')
const { requireLocalRuntime } = require('../localRuntimeGuard')

// The show desk (serverXR/src/showDesk, 2026-10-31): one page for the person who runs a show, with the lighting desk's scenes and
// lamps and the laser desk's cubes side by side, and one Blackout for both. (Not routes/showRoutes.js: that is a space's
// show page, /api/spaces/:spaceId/show/….)
//   GET /show    the page (showDesk/ui/); /show redirects to /show/ (its addresses are relative: ../light/api/…, ../laser/…)
// It is only files. It adds no route that reads or writes anything: every press on the page is one of the two desks' own
// routes, sent from this same origin, so the lighting desk's and the laser desk's guards (own page, same machine, the
// stops' gate, the token for a request with no Origin) apply exactly as they do for those desks' own pages. Like them it is
// local only: requireLocalRuntime, so a hosted tier answers 404.
function registerShowDeskRoutes(app, { mountPaths = ['/show'] } = {}) {
  const router = express.Router()
  router.get('/', (req, res, next) => {
    const [bare, query] = req.originalUrl.split('?')
    if (!bare.endsWith('/')) { res.redirect(302, bare + '/' + (query ? '?' + query : '')); return }
    next()
  })
  router.use(express.static(path.join(__dirname, '../showDesk/ui'), { index: 'index.html', maxAge: 0 }))
  for (const mount of mountPaths) app.use(mount, requireLocalRuntime, router)
}

module.exports = { registerShowDeskRoutes }
