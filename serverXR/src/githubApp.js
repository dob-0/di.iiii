// GitHub App auth for the one-click space-sync flow (dii-space-sync).
// Signs an App JWT (RS256) with the App private key, exchanges it for a
// short-lived installation token, and verifies inbound webhook signatures.
// Config (env): GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY_B64 (or _PRIVATE_KEY),
// GITHUB_APP_WEBHOOK_SECRET. No external dependencies.

const crypto = require('node:crypto')
const { httpRequest } = require('./httpClient')

const GH = 'https://api.github.com'
const b64url = (buf) => Buffer.from(buf).toString('base64url')

const getPrivateKey = () => {
  // Prefer a .pem file path (most reliable on cPanel — no fragile long base64 line).
  const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH
  if (keyPath) {
    try { return require('node:fs').readFileSync(keyPath, 'utf8') } catch { return '' }
  }
  const b64 = process.env.GITHUB_APP_PRIVATE_KEY_B64
  if (b64) return Buffer.from(b64, 'base64').toString('utf8')
  // Support a raw PEM in env with literal \n escapes (common in CI secrets).
  const raw = process.env.GITHUB_APP_PRIVATE_KEY || ''
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw
}

const isConfigured = () => Boolean(process.env.GITHUB_APP_ID && getPrivateKey())

// App JWT — identifies the App itself (max 10 min lifetime per GitHub).
const appJwt = () => {
  const appId = process.env.GITHUB_APP_ID
  const key = getPrivateKey()
  if (!appId || !key) throw new Error('GitHub App not configured (GITHUB_APP_ID / private key).')
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({ iat: now - 30, exp: now + 540, iss: Number(appId) }))
  const data = `${header}.${payload}`
  const sig = crypto.createSign('RSA-SHA256').update(data).end().sign(key)
  return `${data}.${b64url(sig)}`
}

const ghFetch = async (url, { token, method = 'GET', body } = {}) => {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'di.iiii-space-sync' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body) headers['Content-Type'] = 'application/json'
  const r = await httpRequest(url, { method, headers, body: body ? JSON.stringify(body) : null })
  const json = r.json()
  if (!r.ok) throw new Error(`GitHub ${r.status} ${url}: ${json.message || r.text.slice(0, 160)}`)
  return json
}

const getAppInfo = () => ghFetch(`${GH}/app`, { token: appJwt() })
const listInstallations = () => ghFetch(`${GH}/app/installations`, { token: appJwt() })
const installationToken = async (installationId) =>
  (await ghFetch(`${GH}/app/installations/${installationId}/access_tokens`, { token: appJwt(), method: 'POST' })).token

// Find the installation that can access owner/repo, return a fresh install token.
const getInstallationForRepo = async (owner, repo) => {
  const want = `${owner}/${repo}`.toLowerCase()
  const installs = await listInstallations()
  for (const inst of installs) {
    const token = await installationToken(inst.id)
    try {
      const { repositories = [] } = await ghFetch(`${GH}/installation/repositories`, { token })
      if (repositories.some((r) => String(r.full_name).toLowerCase() === want)) {
        return { installationId: inst.id, token }
      }
    } catch { /* skip installs we can't enumerate */ }
  }
  return null
}

const repoDefaultBranch = async (token, owner, repo) =>
  (await ghFetch(`${GH}/repos/${owner}/${repo}`, { token })).default_branch || 'main'

// Fetch a single text file from a repo via an installation token. Falls back to
// the blob API for files too large for the contents endpoint.
const fetchRepoFile = async (token, owner, repo, ref, filePath) => {
  const enc = encodeURIComponent(filePath).replace(/%2F/g, '/')
  const meta = await ghFetch(`${GH}/repos/${owner}/${repo}/contents/${enc}?ref=${ref}`, { token })
  if (meta.content && meta.encoding === 'base64') return Buffer.from(meta.content, 'base64').toString('utf8')
  const blob = await ghFetch(`${GH}/repos/${owner}/${repo}/git/blobs/${meta.sha}`, { token })
  return Buffer.from(blob.content, 'base64').toString('utf8')
}

// HMAC-SHA256 verification of the X-Hub-Signature-256 header. Constant-time.
const verifyWebhookSignature = (rawBody, signatureHeader, secret = process.env.GITHUB_APP_WEBHOOK_SECRET) => {
  if (!secret || !signatureHeader) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(String(signatureHeader))
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

module.exports = {
  isConfigured, appJwt, getAppInfo, listInstallations,
  installationToken, getInstallationForRepo, repoDefaultBranch,
  fetchRepoFile, verifyWebhookSignature
}
