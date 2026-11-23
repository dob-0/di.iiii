'use strict'

const express = require('express')
const { requireLocalRuntime } = require('../localRuntimeGuard')

// The show status (serverXR/src/stage/showStatus.js, 2026-11-01, plan S11): one JSON of the running show — the light
// scene, the laser armed or stopped and why, the controller heard, the link, the heat and the stage watch.
//   GET /show-status   the document (schema di.show-status/1); the Show desk's status line reads it every 5 s
// Read only: it builds no desk and no engine, and writes nothing. Local only like the show desk itself
// (requireLocalRuntime: loopback, or the LAN when DI_ALLOW_LAN_DEVICES=1; a hosted tier answers 404).
function registerShowStatusRoutes(app, { mountPaths = ['/show-status'], status } = {}) {
  const router = express.Router()
  router.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(status.build())
  })
  for (const mount of mountPaths) app.use(mount, requireLocalRuntime, router)
}

module.exports = { registerShowStatusRoutes }
