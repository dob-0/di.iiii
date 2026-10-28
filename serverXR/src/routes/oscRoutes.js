const express = require('express')
const { requireLocalRuntime, requireOwnPage } = require('../localRuntimeGuard')

// OSC — serverXR/src/osc — mounted at /osc on a LOCAL di.iiii (2026-10-21): the bridge the
// OSC In and OSC Out nodes speak through, because a page cannot open a UDP socket. The
// lasers' twin in shape (laserRoutes.js): built on the first request, never at boot;
// loopback-only unless DI_ALLOW_LAN_DEVICES=1; 404 on a hosted tier, which is how a node
// on a hosted page learns there is no local bridge.
//
//   GET  /osc/api/state  what is listening where, and what was sent
//   POST /osc/api/in     { port, pattern?, since? } — listen on that UDP port (opened on the
//                        first ask, closed after 60 s with nobody asking) and answer every
//                        message after number `since` whose address matches `pattern`
//   POST /osc/api/out    { host, port, address, args: [value | { type, value }], numbers?:
//                        'float' | 'int' } — one OSC 1.0 message to host:port. The host is
//                        an IPv4 address on this machine or a private network.
// Every POST first passes requireOwnPage (Host is this machine's own name and Origin is
// that same origin), so no other website can aim the sender or open a port.

function registerOscRoutes(app, { mountPaths = ['/osc'], log, bridgeOptions = {} } = {}) {
  let bridge = null
  const getBridge = () => {
    if (bridge) return bridge
    const { createOscBridge } = require('../osc/oscBridge')
    bridge = createOscBridge({ log: (line) => log?.info?.(line), ...bridgeOptions })
    return bridge
  }

  const router = express.Router()
  router.use((req, res, next) => (req.method === 'GET' || req.method === 'HEAD' ? next() : requireOwnPage(req, res, next)))
  router.use(express.json({ limit: '64kb' }))
  router.get('/api/state', (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json({ ok: true, ...getBridge().state() })
  })
  router.post('/api/in', async (req, res) => {
    const port = Number(req.body?.port)
    const opened = await getBridge().listen(port)
    if (!opened.ok) return res.status(opened.error && /whole number|already listening/.test(opened.error) ? 400 : 200).json({ ...opened, listening: false, messages: [] })
    res.set('Cache-Control', 'no-store')
    res.json(getBridge().read(port, { pattern: String(req.body?.pattern ?? ''), since: req.body?.since }))
  })
  router.post('/api/out', async (req, res) => {
    const out = await getBridge().send({
      host: req.body?.host,
      port: req.body?.port,
      address: req.body?.address,
      args: req.body?.args,
      numbers: req.body?.numbers,
    })
    res.status(out.ok ? 200 : 400).json(out)
  })

  for (const mount of mountPaths) app.use(mount, requireLocalRuntime, router)

  return {
    getBridge,
    hasBridge: () => bridge !== null,
    close: () => { if (bridge) { bridge.close(); bridge = null } },
  }
}

module.exports = { registerOscRoutes }
