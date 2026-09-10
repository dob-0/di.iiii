// The phone book for private conversations: publish this device's public key,
// and look up somebody else's.
//
// Everything here is public by construction. The private key is made in a
// browser and never leaves it, so these routes cannot leak a conversation even
// if they leaked everything they hold. What they CAN leak is who exists, and
// that is what the scope check below is for.
//
// The rule, once: you may look up somebody you already share a space with.
// Without it, di.iiii would carry a directory that let any account open a
// channel to any stranger who ever signed up — a different product, and a worse
// one. Sharing a room is the platform's existing meaning of "these two people
// know each other"; this borrows it rather than inventing a friends list.

const { publishDevice, listDevices, forgetDevice, forgetAllDevices } = require('../dmDeviceStore')
const { findUserById } = require('../userStore')
const { isGuestSubject } = require('../authAccess')

const registerDmRoutes = (router, { requireSession = null, deps = {} } = {}) => {
  const store = { publishDevice, listDevices, forgetDevice, forgetAllDevices, ...deps.store }
  const users = { findUserById, ...deps.users }

  // A guest identity is per-browser and disposable. "Who am I talking to"
  // cannot mean anything against one, so private conversations are for
  // accounts — including the first-party ones, which is the whole reason
  // those exist.
  const accountOf = (req) => {
    const state = req.authState
    if (!state?.authenticated || state.type !== 'session') return null
    if (!state.subject || isGuestSubject(state.subject)) return null
    return state
  }

  const sharesASpace = (mine, theirs) => {
    if (!mine || !theirs) return false
    if (mine.isUnrestricted || theirs.isUnrestricted) return true
    const set = new Set(Array.isArray(mine.spaces) ? mine.spaces : [])
    return (Array.isArray(theirs.spaces) ? theirs.spaces : []).some((id) => set.has(id))
  }

  const guard = requireSession ? [requireSession] : []

  // Mine, published.
  router.post('/api/dm/devices', ...guard, (req, res) => {
    const me = accountOf(req)
    if (!me) return res.status(401).json({ error: 'Sign in with an account to talk privately.' })
    const result = store.publishDevice({
      userId: me.subject,
      publicKey: req.body?.publicKey,
      label: String(req.body?.label || '').trim().slice(0, 60) || null
    })
    if (result.error) {
      return res.status(400).json({ error: 'That is not a usable public key.' })
    }
    return res.status(201).json({ device: result.device })
  })

  router.get('/api/dm/devices', ...guard, (req, res) => {
    const me = accountOf(req)
    if (!me) return res.status(401).json({ error: 'Sign in with an account to talk privately.' })
    return res.json({ devices: store.listDevices(me.subject) })
  })

  // Taking a device back: its key stops being handed to anyone who asks.
  router.delete('/api/dm/devices/:deviceId', ...guard, (req, res) => {
    const me = accountOf(req)
    if (!me) return res.status(401).json({ error: 'Sign in with an account to talk privately.' })
    const gone = store.forgetDevice({ userId: me.subject, deviceId: req.params.deviceId })
    return res.status(gone ? 204 : 404).end()
  })

  router.delete('/api/dm/devices', ...guard, (req, res) => {
    const me = accountOf(req)
    if (!me) return res.status(401).json({ error: 'Sign in with an account to talk privately.' })
    const count = store.forgetAllDevices(me.subject)
    return res.json({ forgotten: count })
  })

  // Somebody else's, if you already share a room with them.
  router.get('/api/dm/devices/:userId', ...guard, (req, res) => {
    const me = accountOf(req)
    if (!me) return res.status(401).json({ error: 'Sign in with an account to talk privately.' })
    const theirId = String(req.params.userId || '')
    if (!theirId) return res.status(400).json({ error: 'Which person?' })

    const them = users.findUserById(theirId)
    // ONE answer for "no such person" and "not somebody you share a room
    // with". Telling those apart turns this endpoint into a way to ask whether
    // an account exists, which is exactly what it must not be.
    if (!them || !sharesASpace(me, { spaces: them.spaces, isUnrestricted: them.isUnrestricted })) {
      return res.status(404).json({ error: 'Nobody here by that name that you share a space with.' })
    }
    return res.json({
      userId: them.id,
      label: them.display_name || them.username || null,
      devices: store.listDevices(theirId).map((device) => ({
        id: device.id,
        publicKey: device.publicKey,
        label: device.label,
        lastSeenAt: device.lastSeenAt
      }))
    })
  })
}

module.exports = { registerDmRoutes }
