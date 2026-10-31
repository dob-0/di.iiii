'use strict'

const path = require('path')
const express = require('express')
const { requireLocalRuntime } = require('../localRuntimeGuard')
const { createTouchBoard } = require('../touchBoard')

// The show desk (serverXR/src/showDesk, 2026-10-31): one page for the person who runs a show, with the lighting desk's scenes and
// lamps and the laser desk's cubes side by side, and one Blackout for both. (Not routes/showRoutes.js: that is a space's
// show page, /api/spaces/:spaceId/show/….)
//   GET /show            the page (showDesk/ui/); /show redirects to /show/ (its addresses are relative: ../light/api/…, ../laser/…)
//   GET /show/api/who    who is on the desk and what each touched last (touchBoard.js), for the rings and the list in the top line
// It is the page's files plus that one read. It has no route that writes anything: every press on the page is one of the two
// desks' own routes, sent from this same origin, so the lighting desk's and the laser desk's guards (own page, same machine,
// the stops' gate, the token for a request with no Origin) apply exactly as they do for those desks' own pages. Like them it
// is local only: requireLocalRuntime, so a hosted tier answers 404.
//
// Who is on (2026-10-31, the owner: "make colours like if someone is active, that is coloured around"): the page names itself on
// the requests it already sends (X-Di-Client, X-Di-Label, and X-Di-Control on a write). observeDeskWrites() sits in front of the
// two desks' mounts (registered before them in index.js) and tells the board about a write only AFTER the desk answered it with
// a status below 400. It never reads a body, never changes a request or an answer, and a throw in it is caught: the desks run
// exactly as they did. Neither desk's code is touched.
function observeDeskWrites(app, { mountPaths = [], board } = {}) {
  if (!board) return
  for (const mount of mountPaths) {
    app.use(mount, (req, res, next) => {
      try {
        if (req.method === 'POST' && req.headers && req.headers['x-di-control']) {
          res.once('finish', () => {
            try { if (res.statusCode < 400) board.touch(req.headers) } catch { /* presence never stops a desk */ }
          })
        }
      } catch { /* presence never stops a desk */ }
      next()
    })
  }
}

function registerShowDeskRoutes(app, { mountPaths = ['/show'], board = createTouchBoard() } = {}) {
  const router = express.Router()
  router.get('/', (req, res, next) => {
    const [bare, query] = req.originalUrl.split('?')
    if (!bare.endsWith('/')) { res.redirect(302, bare + '/' + (query ? '?' + query : '')); return }
    next()
  })
  // The board's one read: asking counts as being on it. A board that throws answers empty rather than an error.
  router.get('/api/who', (req, res) => {
    res.set('Cache-Control', 'no-store')
    let answer = { ok: true, clients: [], touches: [] }
    try { board.seen(req.headers); answer = board.snapshot() } catch { /* the list shows nobody rather than failing */ }
    res.json(answer)
  })
  router.use(express.static(path.join(__dirname, '../showDesk/ui'), { index: 'index.html', maxAge: 0 }))
  for (const mount of mountPaths) app.use(mount, requireLocalRuntime, router)
}

module.exports = { registerShowDeskRoutes, observeDeskWrites }
