// "Connect your Drive" — per-user Google Drive OAuth so any signed-in user can
// link their own account, browse their files, and import into a space. Tokens
// are stored per user (encrypted, see driveTokenStore); nothing here is shared
// between users. Separate from the passport login strategy: this is incremental
// Drive-scope consent that yields a refresh token.

const crypto = require('node:crypto')
const { config } = require('../config')
const tokenStore = require('../driveTokenStore')
const oauth = require('../googleOAuth')
const googleDrive = require('../googleDrive')
const driveAccount = require('../googleDriveAccount')

// Signed, short-lived state param binding the OAuth round-trip to the user who
// started it (CSRF defense + user identity across the redirect).
const STATE_TTL_MS = 10 * 60 * 1000

function signState(userId) {
  const secret = config.auth.sessionSecret || 'di-local-dev-secret'
  const payload = Buffer.from(JSON.stringify({ u: userId, n: crypto.randomBytes(8).toString('hex'), t: Date.now() }))
    .toString('base64url')
  const mac = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${mac}`
}

function verifyState(state) {
  if (!state || typeof state !== 'string' || !state.includes('.')) return null
  const [payload, mac] = state.split('.')
  const secret = config.auth.sessionSecret || 'di-local-dev-secret'
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!data.t || Date.now() - data.t > STATE_TTL_MS) return null
    return data
  } catch {
    return null
  }
}

const currentUserId = (req) => req.authState?.subject || null

function registerIntegrationRoutes(router) {
  const driveCallbackUri = `${config.oauth.callbackBase}/api/integrations/google-drive/callback`
  const frontendUrl = config.oauth.frontendUrl || '/'
  const driveEnabled = () => config.oauth.google.enabled

  // Is the caller connected? (+ whether the server can support the flow at all)
  router.get('/api/integrations/google-drive/status', (req, res) => {
    const userId = currentUserId(req)
    const tokens = userId ? tokenStore.getTokens(userId) : null
    res.json({
      available: driveEnabled(),
      connected: Boolean(tokens),
      email: tokens?.email || null
    })
  })

  // Kick off consent. Full-page redirect to Google; comes back to /callback.
  router.get('/api/integrations/google-drive/connect', (req, res) => {
    if (!driveEnabled()) return res.status(501).json({ error: 'Google Drive is not configured on this server.' })
    const userId = currentUserId(req)
    if (!userId) return res.status(401).json({ error: 'Sign in first to connect your Drive.' })
    const url = oauth.buildAuthUrl({
      clientId: config.oauth.google.clientId,
      redirectUri: driveCallbackUri,
      state: signState(userId)
    })
    res.redirect(url)
  })

  router.get('/api/integrations/google-drive/callback', async (req, res, next) => {
    try {
      if (!driveEnabled()) return res.redirect(`${frontendUrl}?drive=error`)
      const { code, state, error } = req.query
      if (error) return res.redirect(`${frontendUrl}?drive=denied`)
      const parsed = verifyState(state)
      if (!parsed || !code) return res.redirect(`${frontendUrl}?drive=error`)

      const tokens = await oauth.exchangeCode({
        code: String(code),
        clientId: config.oauth.google.clientId,
        clientSecret: config.oauth.google.clientSecret,
        redirectUri: driveCallbackUri
      })
      const email = await oauth.getUserEmail(tokens.accessToken)
      tokenStore.saveTokens(parsed.u, { ...tokens, email })
      res.redirect(`${frontendUrl}?drive=connected`)
    } catch (err) {
      // Surface a clean state to the SPA rather than a 500 page.
      res.redirect(`${frontendUrl}?drive=error`)
      void err
    }
  })

  router.post('/api/integrations/google-drive/disconnect', (req, res) => {
    const userId = currentUserId(req)
    if (userId) tokenStore.deleteTokens(userId)
    res.json({ ok: true })
  })

  // Browse the caller's own Drive: ?q= name search, ?folderId= to list a folder.
  router.get('/api/integrations/google-drive/files', async (req, res, next) => {
    try {
      const userId = currentUserId(req)
      if (!userId) return res.status(401).json({ error: 'Sign in first.' })
      const auth = await driveAccount.getValidAccessToken(userId)
      if (!auth) return res.status(403).json({ error: 'Drive not connected.' })
      const { files, nextPageToken } = await googleDrive.listFiles({
        folderId: req.query.folderId ? String(req.query.folderId) : '',
        query: req.query.q ? String(req.query.q).slice(0, 120) : '',
        auth: { accessToken: auth.accessToken },
        pageSize: 100
      })
      res.json({ files, nextPageToken })
    } catch (error) {
      next(error)
    }
  })

  return { driveCallbackUri }
}

module.exports = { registerIntegrationRoutes }
