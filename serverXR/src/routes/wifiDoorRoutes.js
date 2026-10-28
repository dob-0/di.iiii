/**
 * /api/wifi-door — the wifi door's three routes (serverXR/src/wifiDoor.js).
 *
 * Owner only: the person at this machine, by the address the packet came from
 * (localOwner.js — a request that came through the wifi door itself, or a
 * proxy, is never the owner) AND by the name they typed: a page on another site
 * can point its own name at 127.0.0.1, so the Host must be a loopback or
 * `.localhost` name and an Origin, when sent, the same.
 */
const { isOwnerAtTheMachine } = require('../localOwner')

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|([a-z0-9-]+\.)*localhost)$/

const bare = (value) => String(value || '').trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')

const isOwnerRequest = (req, ownerCheck = isOwnerAtTheMachine) => {
  if (req.diWifiDoor || !ownerCheck(req)) return false
  if (!LOCAL_HOST.test(bare(req.headers?.host))) return false
  const origin = req.headers?.origin
  if (origin) {
    try { if (!LOCAL_HOST.test(bare(new URL(origin).host)) && !LOCAL_HOST.test(new URL(origin).hostname)) return false } catch { return false }
  }
  return true
}

const REFUSALS = {
  'no-name': [409, 'This install has no name yet. Run di name first.'],
  'no-network': [409, 'This machine is not on a network.'],
  'no-guest-secrets': [409, 'Guest mode needs the install’s secrets. Restart it once: di down, then di up.'],
  'no-port': [409, 'No port is free for the wifi door.']
}

const registerWifiDoorRoutes = (router, { door, isOwner = isOwnerRequest }) => {
  const guard = (req, res, next) => (isOwner(req) ? next() : res.status(403).json({ error: 'owner-only' }))
  router.get('/api/wifi-door', guard, (req, res) => { res.set('Cache-Control', 'no-store').json(door.status()) })
  router.post('/api/wifi-door', guard, async (req, res) => {
    const result = await door.open()
    if (result.ok) return res.json(door.status())
    const [code, message] = REFUSALS[result.reason] || [500, 'The wifi door did not open.']
    return res.status(code).json({ error: result.reason, message, ...(result.detail ? { detail: result.detail } : {}) })
  })
  router.delete('/api/wifi-door', guard, async (req, res) => {
    await door.close()
    res.json(door.status())
  })
}

module.exports = { registerWifiDoorRoutes, isOwnerRequest }
