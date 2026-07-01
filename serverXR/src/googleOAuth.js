// Minimal Google OAuth2 client for the "Connect your Drive" flow, over node:https
// (never global fetch — undici WASM-OOMs under cPanel/LVE). Separate from the
// passport login strategy: this requests incremental Drive scope + offline access
// so we get a refresh token and can import on the user's behalf later.

const https = require('node:https')

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo'

// Read-only is all we need to list + download the user's files.
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const SCOPES = [DRIVE_SCOPE, 'openid', 'email']

function httpPostForm(url, form) {
  const body = new URLSearchParams(form).toString()
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request(u, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json = {}
        try { json = JSON.parse(text) } catch { /* keep {} */ }
        resolve({ status: res.statusCode, json })
      })
    })
    req.on('error', reject)
    req.setTimeout(20000, () => req.destroy(new Error('oauth request timeout')))
    req.write(body)
    req.end()
  })
}

function httpGetJson(url, accessToken) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request(u, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` }
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        let json = {}
        try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { /* keep {} */ }
        resolve({ status: res.statusCode, json })
      })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => req.destroy(new Error('userinfo request timeout')))
    req.end()
  })
}

function buildAuthUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

async function exchangeCode({ code, clientId, clientSecret, redirectUri }) {
  const { status, json } = await httpPostForm(TOKEN_ENDPOINT, {
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  })
  if (status !== 200 || !json.access_token) {
    throw new Error(json.error_description || json.error || `Token exchange failed (${status})`)
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || '',
    scope: json.scope || '',
    expiresAt: Date.now() + (Number(json.expires_in || 3600) * 1000)
  }
}

async function refreshAccessToken({ refreshToken, clientId, clientSecret }) {
  const { status, json } = await httpPostForm(TOKEN_ENDPOINT, {
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token'
  })
  if (status !== 200 || !json.access_token) {
    throw new Error(json.error_description || json.error || `Token refresh failed (${status})`)
  }
  return {
    accessToken: json.access_token,
    expiresAt: Date.now() + (Number(json.expires_in || 3600) * 1000)
  }
}

async function getUserEmail(accessToken) {
  try {
    const { status, json } = await httpGetJson(USERINFO_ENDPOINT, accessToken)
    if (status === 200) return json.email || ''
  } catch { /* non-fatal */ }
  return ''
}

module.exports = { buildAuthUrl, exchangeCode, refreshAccessToken, getUserEmail, SCOPES, DRIVE_SCOPE }
