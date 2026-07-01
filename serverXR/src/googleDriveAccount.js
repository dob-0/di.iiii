// Bridges the per-user token store and the OAuth client: hand it a userId, get
// back a currently-valid Drive access token, transparently refreshing (and
// persisting) an expired one. Returns null when the user has not connected.

const { config } = require('./config')
const tokenStore = require('./driveTokenStore')
const oauth = require('./googleOAuth')

const EXPIRY_SKEW_MS = 60 * 1000 // refresh a minute early to avoid edge races

async function getValidAccessToken(userId) {
  const tokens = tokenStore.getTokens(userId)
  if (!tokens || !tokens.accessToken) return null

  const stillValid = tokens.expiresAt && tokens.expiresAt - EXPIRY_SKEW_MS > Date.now()
  if (stillValid) return { accessToken: tokens.accessToken, email: tokens.email }

  if (!tokens.refreshToken) {
    // Access token expired and no refresh token — treat as disconnected.
    return null
  }
  const { clientId, clientSecret } = config.oauth.google
  const refreshed = await oauth.refreshAccessToken({
    refreshToken: tokens.refreshToken,
    clientId,
    clientSecret
  })
  tokenStore.updateAccessToken(userId, refreshed.accessToken, refreshed.expiresAt)
  return { accessToken: refreshed.accessToken, email: tokens.email }
}

module.exports = { getValidAccessToken }
