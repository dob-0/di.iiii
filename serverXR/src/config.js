const path = require('node:path')
const { URL } = require('node:url')
const { normalizeAuthRole, normalizeAuthScopeSpaces } = require('./authAccess')
const logger = require('./logger')

const normalizeBasePath = (value) => {
  if (!value) return ''
  const trimmed = String(value).trim()
  if (!trimmed || trimmed === '/') return ''
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`
}

const parseList = (value) => {
  if (!value) return []
  return String(value)
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1'])

const expandLoopbackOrigins = (origins = []) => {
  const expanded = new Set()

  origins.forEach((origin) => {
    if (!origin) return
    expanded.add(origin)
    try {
      const url = new URL(origin)
      if (!LOOPBACK_HOSTS.has(url.hostname)) return
      const alternate = new URL(origin)
      alternate.hostname = url.hostname === 'localhost' ? '127.0.0.1' : 'localhost'
      expanded.add(alternate.origin)
    } catch {
      // Ignore malformed CORS origins and keep the configured value unchanged.
    }
  })

  return Array.from(expanded)
}

const parseBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback
  return String(value).toLowerCase() === 'true'
}

const isCorsOriginAllowed = (origin, corsOrigins = [], nodeEnv = process.env.NODE_ENV || '') => {
  if (!origin) return true
  if (corsOrigins.includes('*')) return true
  if (!corsOrigins.length) {
    return String(nodeEnv).toLowerCase() !== 'production'
  }
  return corsOrigins.includes(origin)
}

const buildCorsOriginHandler = (corsOrigins = [], nodeEnv = process.env.NODE_ENV || '') => {
  return (origin, callback) => {
    callback(null, isCorsOriginAllowed(origin, corsOrigins, nodeEnv))
  }
}

const parseNumber = (value, fallback) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

const parseJson = (value, fallback = null) => {
  if (!value) return fallback
  try {
    return JSON.parse(String(value))
  } catch {
    return fallback
  }
}

const resolveDir = (inputPath, fallback) => {
  if (!inputPath) return fallback
  if (path.isAbsolute(inputPath)) return inputPath
  return path.resolve(ROOT_DIR, inputPath)
}

const normalizeIdentityText = (value = '') => {
  const normalized = String(value || '').trim()
  return normalized || null
}

const buildAuthIdentity = (rawValue, {
  role = 'viewer',
  subject = '',
  label = '',
  spaces = undefined
} = {}) => {
  const raw = typeof rawValue === 'string'
    ? { token: rawValue }
    : (rawValue && typeof rawValue === 'object' ? rawValue : null)
  const token = String(raw?.token || '').trim()
  if (!token) return null
  const normalizedRole = normalizeAuthRole(raw?.role, role)
  const normalizedSubject = normalizeIdentityText(raw?.subject || raw?.id || subject || raw?.label || normalizedRole)
  const normalizedLabel = normalizeIdentityText(raw?.label || label || normalizedSubject)
  const normalizedSpaces = normalizeAuthScopeSpaces(
    raw?.spaces ?? raw?.spaceIds ?? raw?.allowedSpaces,
    spaces
  )
  return {
    token,
    role: normalizedRole,
    subject: normalizedSubject || normalizedRole,
    label: normalizedLabel,
    spaces: normalizedSpaces
  }
}

const pushAuthIdentity = (target, rawValue, fallback = {}) => {
  const identity = buildAuthIdentity(rawValue, fallback)
  if (!identity) return
  if (target.some(entry => entry.token === identity.token)) {
    return
  }
  target.push(identity)
}

const parseConfiguredAuthIdentities = (value) => {
  const parsed = parseJson(value, null)
  return Array.isArray(parsed) ? parsed : []
}

const ROOT_DIR = path.resolve(__dirname, '..')
const DEFAULT_DATA_DIR = path.join(ROOT_DIR, 'data')
const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production'

const basePath = normalizeBasePath(process.env.APP_BASE_PATH || process.env.BASE_PATH)
const apiToken = (process.env.API_TOKEN || process.env.SERVERXR_API_TOKEN || '').trim()
const requireAuth = parseBool(process.env.REQUIRE_AUTH, isProduction)
const corsOrigins = expandLoopbackOrigins(parseList(process.env.CORS_ORIGINS))
const maxUploadMb = parseNumber(process.env.MAX_UPLOAD_MB, 100)
const maxUploadBytes = Math.max(1, maxUploadMb) * 1024 * 1024
const dataDir = resolveDir(process.env.DATA_ROOT, DEFAULT_DATA_DIR)
const clientDir = process.env.CLIENT_DIR ? resolveDir(process.env.CLIENT_DIR, null) : null
const spacesDir = resolveDir(process.env.SPACES_DIR, path.join(dataDir, 'spaces'))
const uploadsDir = resolveDir(process.env.UPLOADS_DIR, path.join(dataDir, 'uploads'))
const dbPath = resolveDir(process.env.DB_PATH, path.join(dataDir, 'di.db'))
const authSessionTtlMs = parseNumber(process.env.AUTH_SESSION_TTL_MS, 1000 * 60 * 60 * 12)
const authSessionCookieName = (process.env.AUTH_SESSION_COOKIE_NAME || 'dii_serverxr_session').trim()
const authSessionCookieSecure = parseBool(process.env.AUTH_SESSION_COOKIE_SECURE, isProduction)
const authIdentities = []

parseConfiguredAuthIdentities(process.env.AUTH_IDENTITIES).forEach(entry => {
  pushAuthIdentity(authIdentities, entry)
})
pushAuthIdentity(authIdentities, process.env.ADMIN_API_TOKEN, {
  role: 'admin',
  subject: process.env.ADMIN_API_SUBJECT || 'admin',
  label: process.env.ADMIN_API_LABEL || 'Admin',
  spaces: normalizeAuthScopeSpaces(process.env.ADMIN_ALLOWED_SPACES, null)
})
pushAuthIdentity(authIdentities, process.env.EDITOR_API_TOKEN, {
  role: 'editor',
  subject: process.env.EDITOR_API_SUBJECT || 'editor',
  label: process.env.EDITOR_API_LABEL || 'Editor',
  spaces: normalizeAuthScopeSpaces(process.env.EDITOR_ALLOWED_SPACES, null)
})
pushAuthIdentity(authIdentities, process.env.VIEWER_API_TOKEN, {
  role: 'viewer',
  subject: process.env.VIEWER_API_SUBJECT || 'viewer',
  label: process.env.VIEWER_API_LABEL || 'Viewer',
  spaces: normalizeAuthScopeSpaces(process.env.VIEWER_ALLOWED_SPACES, null)
})
pushAuthIdentity(authIdentities, apiToken, {
  role: 'admin',
  subject: process.env.API_TOKEN_SUBJECT || 'legacy-admin',
  label: process.env.API_TOKEN_LABEL || 'Legacy Admin',
  spaces: normalizeAuthScopeSpaces(process.env.API_TOKEN_ALLOWED_SPACES, null)
})

const authIdentityLookup = new Map(authIdentities.map(identity => [identity.token, identity]))
// Falls back to an admin-role token only, never `authIdentities[0]` blindly —
// that would let whichever token happened to be configured first (even a
// viewer-only token, e.g. a self-host with only VIEWER_API_TOKEN set) become
// the session-cookie signing key, letting its holder forge an admin session.
// A compromised admin token is already full compromise, so falling back to
// one isn't a new escalation the way falling back to a lower-role one would be.
const adminFallbackToken = authIdentities.find(identity => identity.role === 'admin')?.token
const authSessionSecret = (process.env.AUTH_SESSION_SECRET || apiToken || adminFallbackToken || '').trim()

if (requireAuth && !authIdentities.length) {
  throw new Error('At least one auth token is required when REQUIRE_AUTH is enabled.')
}

if (requireAuth && !authSessionSecret) {
  throw new Error('AUTH_SESSION_SECRET or an auth token is required when REQUIRE_AUTH is enabled.')
}

if (requireAuth && !process.env.AUTH_SESSION_SECRET && authSessionSecret) {
  const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production'
  const message = '[serverXR] AUTH_SESSION_SECRET is not set — falling back to an API bearer ' +
    'token as the session-cookie signing key. Anyone holding that token can forge session ' +
    'cookies for any role. Set a dedicated AUTH_SESSION_SECRET in the server env.'
  if (isProduction) {
    // Same silent-degrade shape as the requireAuth/cookieSecure NODE_ENV
    // check below (audit 2026-07-17) and the recurring "value silently
    // falls back to something weaker/wrong instead of failing loudly" bug
    // class in known-fixes.md — a hardened production deploy must not boot
    // with a session-signing key an API-token holder could forge.
    throw new Error(message)
  }
  logger.warn(message)
}

// requireAuth/cookieSecure both silently default to off unless NODE_ENV is
// the exact string 'production' — a real production deploy with NODE_ENV
// merely unset (not misconfigured, just absent) runs fully open with
// non-secure cookies and nothing surfaces the fact (audit 2026-07-17). This
// is a warning only, not a behavior change — don't flip a working deploy's
// defaults out from under it, just make the silent case loud.
if (!requireAuth && !process.env.REQUIRE_AUTH) {
  logger.warn(
    `[serverXR] REQUIRE_AUTH is unset and NODE_ENV is "${process.env.NODE_ENV || ''}" (not "production") — ` +
    'auth is running fully OPEN (every request treated as admin) and cookies are not marked Secure. ' +
    'If this is a real deployment, set REQUIRE_AUTH=true (and NODE_ENV=production) explicitly.'
  )
}

const oauthCallbackBase = (process.env.OAUTH_CALLBACK_BASE_URL || '').replace(/\/+$/, '')
const oauthFrontendUrl = (process.env.OAUTH_FRONTEND_URL || '/').replace(/\/+$/, '') || '/'

// `enabled` only checks *_CLIENT_ID (an ID with no matching secret still
// reports the provider as enabled) — a config where docker-compose.yml's
// `${VAR:-}` silently defaulted just the secret half to empty would look
// configured right up until a real login attempt fails with a confusing
// OAuth error, instead of a clear signal at startup that something's
// half-set. Audit finding #21.
for (const [provider, idVar, secretVar] of [
  ['GitHub', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
  ['Google', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']
]) {
  const hasId = Boolean((process.env[idVar] || '').trim())
  const hasSecret = Boolean((process.env[secretVar] || '').trim())
  if (hasId !== hasSecret) {
    logger.warn(
      `[serverXR] ${idVar} is set but ${secretVar} is not (or vice versa) — ${provider} sign-in ` +
      `will report as enabled but fail at login time. Set both or neither.`
    )
  }
}

const config = {
  port: Number(process.env.PORT) || 4000,
  // Default stays every interface, which is what the container topology needs.
  // A local install sets HOST=127.0.0.1 so an artist's laptop on café wifi is not
  // quietly editable by the room.
  host: String(process.env.HOST || '').trim() || '0.0.0.0',
  basePath,
  mountPath: basePath || '/',
  apiToken,
  requireAuth,
  corsOrigins,
  maxUploadBytes,
  authSession: {
    cookieName: authSessionCookieName || 'dii_serverxr_session',
    cookiePath: basePath || '/',
    cookieSecure: authSessionCookieSecure,
    ttlMs: authSessionTtlMs
  },
  auth: {
    identities: authIdentities.map(({ token, ...identity }) => ({ ...identity })),
    resolveIdentity: (token = '') => authIdentityLookup.get(String(token || '').trim()) || null,
    sessionSecret: authSessionSecret
  },
  directories: {
    root: ROOT_DIR,
    publicDir: path.resolve(ROOT_DIR, 'public'),
    // The built frontend, when this server is also the one serving it — a local
    // `di` install, where one process on one port is the whole product. Unset in
    // the deployed topology, where nginx owns the SPA and this stays a pure API.
    clientDir,
    dataDir,
    spacesDir,
    uploadsDir,
    dbPath
  },
  defaultTtlMs: Number(process.env.SPACE_TTL_MS || 1000 * 60 * 60 * 24 * 30),
  // Guest sandboxes are throwaway by contract (the hub banner says so) — idle
  // ones expire much sooner than regular spaces; a returning guest gets a
  // fresh sandbox re-provisioned on next access.
  sandboxTtlMs: Number(process.env.SANDBOX_TTL_MS || 1000 * 60 * 60 * 24 * 7),
  // Account sandboxes are permanent but not immortal: after this idle window
  // they archive down to a scene snapshot and are revived on next access.
  accountSandboxTtlMs: Number(process.env.ACCOUNT_SANDBOX_TTL_MS || 1000 * 60 * 60 * 24 * 180),
  // The communal open space every authenticated session can enter and edit.
  // The config store's globalSpaceId (admin-settable) overrides this default id.
  openSpaceId: String(process.env.OPEN_SPACE_ID || 'open').trim().toLowerCase(),
  freeSpaceLimit: Number(process.env.FREE_SPACE_LIMIT) || 3,
  liveSync: {
    // No implicit default: an unset LIVE_API_URL must surface as "not
    // configured" (syncRoutes 503s), never silently target production —
    // a dev/staging server with the old prod fallback would push there.
    url: (process.env.LIVE_API_URL || '').replace(/\/+$/, ''),
    token: (process.env.LIVE_API_TOKEN || '').trim()
  },
  googleDrive: {
    // Optional. Unlocks folder import + real metadata; keyless single-file import
    // works without it. The Google Picker also needs it (developerKey).
    apiKey: (process.env.GOOGLE_API_KEY || '').trim(),
    // Google Cloud project number — ties Picker grants to the OAuth client
    // under the drive.file scope.
    appId: (process.env.GOOGLE_APP_ID || '').trim()
  },
  oauth: {
    callbackBase: oauthCallbackBase,
    frontendUrl: oauthFrontendUrl,
    github: {
      clientId: (process.env.GITHUB_CLIENT_ID || '').trim(),
      clientSecret: (process.env.GITHUB_CLIENT_SECRET || '').trim(),
      enabled: Boolean((process.env.GITHUB_CLIENT_ID || '').trim())
    },
    google: {
      clientId: (process.env.GOOGLE_CLIENT_ID || '').trim(),
      clientSecret: (process.env.GOOGLE_CLIENT_SECRET || '').trim(),
      enabled: Boolean((process.env.GOOGLE_CLIENT_ID || '').trim())
    }
  },
  // Human-approval gate for admin-level writes (see approvalGate.js). Unset
  // secret/botUrl = disabled: gated routes apply immediately, exactly as
  // before this feature existed. Never fail open when explicitly enabled —
  // that's approvalGate.js's job, not this file's.
  approval: {
    enabled: parseBool(process.env.APPROVAL_GATE_ENABLED, false),
    botUrl: (process.env.APPROVAL_BOT_URL || '').replace(/\/+$/, ''),
    secret: (process.env.APPROVAL_SHARED_SECRET || '').trim(),
    ttlMs: Number(process.env.APPROVAL_TTL_MS || 1000 * 60 * 60)
  }
}

module.exports = { config, normalizeBasePath, isCorsOriginAllowed, buildCorsOriginHandler }
