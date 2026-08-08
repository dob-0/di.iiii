// "Connect your AI" — a signed-in user stores their own AI provider API key
// against their account (encrypted, see aiConnectionStore.js). v1: Claude only.
// Nothing here is shared between users, and the raw key is never sent back to
// the client once saved — only a connected flag + trailing-4-chars hint.

const store = require('../aiConnectionStore')
const { isGuestSubject } = require('../authAccess')

const ALLOWED_PROVIDERS = new Set(['claude'])
const MAX_API_KEY_LENGTH = 512

const currentUserId = (req) => req.authState?.subject || null

function registerAiConnectionRoutes(router) {
  router.get('/api/integrations/ai/status', (req, res) => {
    const provider = String(req.query.provider || '')
    if (!ALLOWED_PROVIDERS.has(provider)) return res.status(400).json({ error: 'Unknown provider.' })
    const userId = currentUserId(req)
    const connection = userId ? store.getConnection(userId, provider) : null
    res.json({
      connected: Boolean(connection),
      label: connection?.label || '',
      last4: connection?.last4 || ''
    })
  })

  router.post('/api/integrations/ai/connect', (req, res) => {
    const userId = currentUserId(req)
    if (!userId) return res.status(401).json({ error: 'Sign in first to connect an AI key.' })
    if (isGuestSubject(userId)) return res.status(403).json({ error: 'Guest sessions cannot connect an AI key. Sign in with an account first.' })
    const provider = String(req.body?.provider || '')
    if (!ALLOWED_PROVIDERS.has(provider)) return res.status(400).json({ error: 'Unknown provider.' })
    const apiKey = String(req.body?.apiKey || '').trim()
    if (!apiKey) return res.status(400).json({ error: 'API key required.' })
    if (apiKey.length > MAX_API_KEY_LENGTH) return res.status(400).json({ error: 'API key is too long.' })
    const label = String(req.body?.label || '').trim().slice(0, 80)
    const connection = store.saveKey(userId, provider, apiKey, label)
    res.json({ connected: true, label: connection.label, last4: connection.last4 })
  })

  router.post('/api/integrations/ai/disconnect', (req, res) => {
    const userId = currentUserId(req)
    if (!userId) return res.status(401).json({ error: 'Sign in first.' })
    if (isGuestSubject(userId)) return res.status(403).json({ error: 'Guest sessions cannot manage AI keys.' })
    const provider = String(req.body?.provider || '')
    if (!ALLOWED_PROVIDERS.has(provider)) return res.status(400).json({ error: 'Unknown provider.' })
    store.deleteConnection(userId, provider)
    res.json({ ok: true })
  })
}

module.exports = { registerAiConnectionRoutes }
