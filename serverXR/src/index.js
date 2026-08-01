require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env.local') })
require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env') })
const express = require('express')
const http = require('http')
const cors = require('cors')
const morgan = require('morgan')
const multer = require('multer')
const path = require('node:path')
const crypto = require('node:crypto')
const { initDb } = require('./db')
const { migrateFromFilesystem } = require('./migrate')
const logger = require('./logger')
const {
  canAccessSpace,
  formatAuthScopeLabel,
  formatAuthRoleLabel,
  getCommunalSpaceId,
  getOwnSandboxSpaceId,
  hasRequiredAuthRole,
  isAuthScopeAllowedForSpace,
  isGuestSubject,
  normalizeAuthRole,
  normalizeAuthScopeSpaces,
  setCommunalSpaceId
} = require('./authAccess')
const {
  createAuthSessionValue,
  readCookie,
  serializeAuthSessionCookie,
  serializeExpiredAuthSessionCookie,
  verifyAuthSessionValue
} = require('./authSession')
const { config, buildCorsOriginHandler } = require('./config')
const { ensureDir, readJson, writeJson } = require('./jsonStore')
const { initializeSocket } = require('./socketHandlers')
const { initializeMesh } = require('./meshHub')
const { loadReleaseInfo } = require('./releaseInfo')
const { registerProjectRoutes } = require('./routes/projectRoutes')
const { registerSpaceRoutes } = require('./routes/spaceRoutes')
const { createKeyedLock } = require('./asyncLock')
const { createSessionDbSync } = require('./sessionDbSync')
const { registerInscriptionRoutes } = require('./routes/inscriptionRoutes')
const { registerStatusRoutes } = require('./routes/statusRoutes')
const { registerIntegrationRoutes } = require('./routes/integrationRoutes')
const { registerUserRoutes } = require('./routes/userRoutes')
const { registerOpenCallRoutes } = require('./routes/openCallRoutes')
const openCallStore = require('./openCallStore')
const { listUsers, findUserById, setUserSpaces, setUserUnrestricted, setUserRole } = require('./userStore')
const { mintSyncKey, resolveSyncKey, listSyncKeys, revokeSyncKey, PREFIX: syncKeyPrefix } = require('./syncKeyStore')
const { mintInvite, resolveInvite, markInviteUsed, listInvites, revokeInvite } = require('./inviteStore')
const githubApp = require('./githubApp')
const spaceSyncPlan = require('./spaceSyncPlan')
const spaceLinkStore = require('./spaceLinkStore')
const { httpRequest } = require('./httpClient')
const { createRateLimiter } = require('./rateLimit')
const { registerSyncRoutes } = require('./routes/syncRoutes')
const { registerAuthRoutes, GUEST_SPACES } = require('./routes/authRoutes')
const { registerConfigRoutes } = require('./routes/configRoutes')
const configStore = require('./configStore')
const { createSpaceStore } = require('./spaceStore')
const { loadSharedModule } = require('./sharedRuntime')
const {
  defaultScene: BLANK_SCENE,
  applySceneOps
} = loadSharedModule('sceneSchema.cjs')
const {
  defaultProjectDocument: BLANK_PROJECT_DOCUMENT,
  normalizeProjectDocument,
  applyProjectOps
} = loadSharedModule('projectSchema.cjs')
const {
  appendProjectOps,
  buildProjectAssetMeta,
  deleteProject,
  ensureProject,
  findProjectById,
  findProjectBySlug,
  getProjectPaths,
  isReservedProjectSlug,
  isValidAssetId: isValidProjectAssetId,
  listProjectsInSpace,
  loadProjectMeta,
  normalizeProjectId,
  normalizeProjectSlug,
  readProjectDocument,
  readProjectOps,
  readProjectOpsSince,
  upsertProjectMeta,
  writeProjectDocument
} = require('./projectStore')

const PUBLIC_DIR = config.directories.publicDir
const SPACES_DIR = config.directories.spacesDir
const UPLOADS_DIR = config.directories.uploadsDir
const DB_PATH = config.directories.dbPath
const RECENT_LIMIT = 25
const DEFAULT_TTL_MS = config.defaultTtlMs
const MAX_OP_HISTORY = 500
const DEFAULT_SPACE_ID = 'main'
const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/', 'model/']
const ALLOWED_MIME_TYPES = new Set([
  'application/json',
  'application/octet-stream',
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/gzip',
  'text/plain'
])
const ALLOWED_EXTENSIONS = new Set([
  '.glb',
  '.gltf',
  '.obj',
  '.mtl',
  '.stl',
  '.fbx',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.svg',
  '.mp4',
  '.mov',
  '.webm',
  '.mp3',
  '.wav',
  '.ogg',
  '.m4a',
  '.zip',
  '.bin',
  '.hdr',
  '.exr'
])

const releaseInfo = loadReleaseInfo(config.directories.root)

const {
  appendOpsHistory,
  archiveIdleAccountSandboxes,
  buildMeta,
  collectSceneAssetRefs,
  countSpacesOwnedBy,
  deleteSpace,
  ensureDefaultSpace,
  ensureSpaceScene,
  ensureSpaceWritable,
  findSpaceBySlug,
  getSandboxStats,
  getSpacePaths,
  hydrateSceneAssetManifest,
  isReservedSpaceSlug,
  isValidAssetId,
  listSpaces,
  loadSpaceMeta,
  moveSpace,
  normalizeSpaceId,
  normalizeSpaceSlug,
  pruneSpaces,
  pruneStaleSandboxes,
  readLatestSpaceSnapshot,
  readOpsHistory,
  readOpsHistorySince,
  removeAssetThumbnails,
  saveSpaceMeta,
  serveAsset,
  snapshotSpaceScene,
  spaceExists,
  upsertSpaceMeta,
  writeOpsHistory
} = createSpaceStore({
  spacesDir: SPACES_DIR,
  defaultSpaceId: DEFAULT_SPACE_ID,
  defaultTtlMs: DEFAULT_TTL_MS,
  sandboxTtlMs: config.sandboxTtlMs,
  accountSandboxTtlMs: config.accountSandboxTtlMs,
  blankScene: BLANK_SCENE
})

const isAllowedUpload = (file) => {
  const mime = (file?.mimetype || '').toLowerCase()
  const name = (file?.originalname || '').toLowerCase()
  const ext = path.extname(name)
  if (ALLOWED_MIME_PREFIXES.some(prefix => mime.startsWith(prefix))) return true
  if (ALLOWED_MIME_TYPES.has(mime)) {
    if (mime === 'application/octet-stream' && ext) {
      return ALLOWED_EXTENSIONS.has(ext)
    }
    return true
  }
  if (ext && ALLOWED_EXTENSIONS.has(ext)) return true
  return false
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-z0-9._-]+/gi, '_')}`)
  }),
  limits: {
    fileSize: config.maxUploadBytes
  },
  fileFilter: (req, file, cb) => {
    if (isAllowedUpload(file)) {
      cb(null, true)
      return
    }
    cb(new Error('Unsupported asset type.'))
  }
})

async function initStorage() {
  await Promise.all([ensureDir(SPACES_DIR), ensureDir(UPLOADS_DIR)])
  initDb(DB_PATH)
  configStore.init(SPACES_DIR)
  await migrateFromFilesystem(SPACES_DIR)
}

const app = express()
const startedAt = Date.now()
const recentEvents = []
const liveClients = new Map()
const projectLiveClients = new Map()

function pushEvent(type, details = {}) {
  recentEvents.unshift({ type, details, timestamp: new Date().toISOString() })
  if (recentEvents.length > RECENT_LIMIT) {
    recentEvents.pop()
  }
}

const normalizeIncomingOps = (ops = []) => {
  if (!Array.isArray(ops)) return []
  return ops
    .map((op) => {
      if (!op || typeof op.type !== 'string') return null
      const normalizedOpId = (typeof op.opId === 'string' && op.opId.trim())
        ? op.opId.trim()
        : (crypto.randomUUID?.() || `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)
      return {
        opId: normalizedOpId,
        clientId: typeof op.clientId === 'string' ? op.clientId : null,
        type: op.type,
        payload: op.payload || {}
      }
    })
    .filter(Boolean)
}

const getLiveBucket = (spaceId) => {
  const normalized = normalizeSpaceId(spaceId)
  if (!normalized) return null
  let bucket = liveClients.get(normalized)
  if (!bucket) {
    bucket = new Map()
    liveClients.set(normalized, bucket)
  }
  return { normalized, bucket }
}

const broadcastLiveEvent = (spaceId, eventName, payload, excludeId) => {
  const entry = getLiveBucket(spaceId)
  if (!entry) return
  const data = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`
  entry.bucket.forEach((client, clientId) => {
    if (excludeId && clientId === excludeId) return
    try {
      client.res.write(data)
    } catch (error) {
      logger.warn('Failed to write SSE event', error)
      client.res.end()
      entry.bucket.delete(clientId)
    }
  })
}

const getProjectLiveBucket = async (projectId) => {
  const normalized = normalizeProjectId(projectId)
  if (!normalized) return null
  const resolved = await findProjectById(SPACES_DIR, normalized)
  if (!resolved) return null
  let bucket = projectLiveClients.get(normalized)
  if (!bucket) {
    bucket = new Map()
    projectLiveClients.set(normalized, bucket)
  }
  return {
    normalized,
    bucket,
    project: resolved
  }
}

const broadcastProjectLiveEvent = async (projectId, eventName, payload, excludeId) => {
  const entry = await getProjectLiveBucket(projectId)
  if (!entry) return
  const data = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`
  entry.bucket.forEach((client, clientId) => {
    if (excludeId && clientId === excludeId) return
    try {
      client.res.write(data)
    } catch (error) {
      logger.warn('Failed to write project SSE event', error)
      client.res.end()
      entry.bucket.delete(clientId)
    }
  })
}

// Space code documents run in sandboxed iframes whose Origin is the literal
// string "null" — the allowlist below can never match it, and its preflight
// handler would eat the OPTIONS without CORS headers. Endpoints those
// documents must reach get permissive CORS ahead of the gate. Requests from
// opaque origins carry no cookies, so auth-gated content stays gated.
const PUBLIC_CORS_ROUTES = [
  // open-call application submissions (unauthenticated writes)
  { pattern: /\/api\/open-calls\/[A-Za-z0-9_-]+\/applications\/?$/, methods: 'POST, OPTIONS' },
  // project asset reads (fetch()-based loaders like GLTF need CORS; <video>/<img> don't)
  { pattern: /\/api\/projects\/[^/]+\/assets\/[^/]+\/?$/, methods: 'GET, HEAD, OPTIONS' },
  // open inscriptions (anonymous, append-only, opt-in per space — see inscriptionRoutes)
  // slug patterns accept underscores: routes normalize them, but this shim sees the raw path
  { pattern: /\/api\/spaces\/[a-z0-9_-]+\/inscriptions\/?$/, methods: 'POST, OPTIONS' },
  // self-unmake of a single inscription (proof-gated DELETE — see inscriptionRoutes)
  { pattern: /\/api\/spaces\/[a-z0-9_-]+\/inscriptions\/insc-[A-Za-z0-9-]+\/?$/, methods: 'DELETE, OPTIONS' },
  // space scene reads — the field viewer fetches its own space's scene from
  // inside the sandboxed preview (opaque origin); private spaces still 401
  { pattern: /\/api\/spaces\/[a-z0-9_-]+\/scene\/?$/, methods: 'GET, HEAD, OPTIONS' }
]
app.use((req, res, next) => {
  const route = PUBLIC_CORS_ROUTES.find((r) => r.pattern.test(req.path))
  if (!route || !route.methods.includes(req.method)) return next()
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', route.methods)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  // this block is authoritative for these routes: drop the Origin so the
  // general cors() below can't overwrite '*' with an echoed origin
  delete req.headers.origin
  next()
})

app.use(cors({
  origin: buildCorsOriginHandler(config.corsOrigins),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Origin', 'Accept', 'Authorization', 'X-Api-Key'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}))
app.use(express.json({ limit: '10mb', verify: (req, _res, buf) => { req.rawBody = buf } }))
app.use(morgan('tiny'))
app.use((req, res, next) => {
  pushEvent('request', { method: req.method, url: req.url })
  next()
})

const router = express.Router()
router.use(express.static(PUBLIC_DIR))

const buildAuthState = ({
  authenticated = false,
  type = null,
  role = null,
  subject = null,
  label = null,
  spaces = undefined,
  isUnrestricted = false,
  session = null,
  reason = null
} = {}) => {
  const normalizedRole = normalizeAuthRole(role, null)
  return {
    authenticated: Boolean(authenticated),
    type: type || null,
    role: normalizedRole,
    subject: subject || null,
    label: label || null,
    // Admins are unrestricted by space scope — matches role semantics everywhere
    // else in the app (admin is a superset of editor/viewer, not a sibling scope).
    spaces: normalizedRole === 'admin' ? null : normalizeAuthScopeSpaces(spaces, null),
    isUnrestricted: normalizedRole === 'admin' ? true : Boolean(isUnrestricted),
    ...(session ? { session } : {}),
    ...(reason ? { reason } : {})
  }
}

const readAuthToken = (req) => {
  const header = req.get('authorization')
  if (header) {
    const [scheme, value] = header.split(' ')
    if (scheme && value && scheme.toLowerCase() === 'bearer') {
      return value.trim()
    }
    return header.trim()
  }
  const apiKey = req.get('x-api-key')
  if (apiKey) return String(apiKey).trim()
  return null
}

const normalizeAuthToken = (value = '') => String(value || '').trim().replace(/^bearer\s+/i, '')

const { getFreshDbIdentity } = createSessionDbSync({ findUserById, normalizeAuthRole })

const readAuthSession = (req) => {
  const value = readCookie(req.get('cookie') || '', config.authSession.cookieName)
  const result = verifyAuthSessionValue(value, { secret: config.auth.sessionSecret })
  if (!result.valid) {
    return buildAuthState({ authenticated: false, type: 'session', reason: result.reason })
  }
  const role = normalizeAuthRole(result.session?.role, null)
  if (!role) {
    return buildAuthState({ authenticated: false, type: 'session', reason: 'legacy' })
  }
  let effectiveRole = role
  let effectiveSpaces = result.session?.spaces
  let effectiveUnrestricted = result.session?.isUnrestricted
  if (result.session?.subject) {
    const fresh = getFreshDbIdentity(result.session.subject)
    if (fresh && fresh.dbRole) {
      effectiveRole = fresh.dbRole
      effectiveSpaces = fresh.dbSpaces
      effectiveUnrestricted = fresh.dbUnrestricted
    }
  }
  return {
    ...buildAuthState({
      authenticated: true,
      type: 'session',
      role: effectiveRole,
      subject: result.session?.subject,
      label: result.session?.label,
      spaces: effectiveSpaces,
      isUnrestricted: effectiveUnrestricted,
      session: result.session
    }),
    session: result.session
  }
}

const getAuthState = (req) => {
  const sessionState = readAuthSession(req)
  if (sessionState.authenticated) {
    return sessionState
  }
  const token = normalizeAuthToken(readAuthToken(req))
  const identity = config.auth.resolveIdentity(token)
  if (identity) {
    return buildAuthState({
      authenticated: true,
      type: 'token',
      role: identity.role,
      subject: identity.subject,
      label: identity.label,
      spaces: identity.spaces,
      isUnrestricted: identity.isUnrestricted
    })
  }
  // Dynamic source of scoped editor identities: per-space sync keys (DB-backed).
  // Only consulted on a static-table miss, and only for the dii_sync_ prefix.
  if (token && token.startsWith(syncKeyPrefix)) {
    const sk = resolveSyncKey(token)
    if (sk) {
      return buildAuthState({
        authenticated: true,
        type: 'sync-key',
        role: 'editor',
        subject: `sync-key:${sk.keyId}`,
        label: sk.label || 'Sync Key',
        spaces: [sk.spaceId]
      })
    }
  }
  return sessionState
}

const getPublicAuthState = (req) => {
  if (!config.requireAuth) {
    return buildAuthState({
      authenticated: true,
      type: 'disabled',
      role: 'admin',
      subject: 'auth-disabled',
      label: 'Auth Disabled'
    })
  }
  return getAuthState(req)
}

const setAuthSessionCookie = (res, value) => {
  res.setHeader('Set-Cookie', serializeAuthSessionCookie(value, {
    name: config.authSession.cookieName,
    path: config.authSession.cookiePath,
    secure: config.authSession.cookieSecure,
    ttlMs: config.authSession.ttlMs
  }))
}

const clearAuthSessionCookie = (res) => {
  res.setHeader('Set-Cookie', serializeExpiredAuthSessionCookie({
    name: config.authSession.cookieName,
    path: config.authSession.cookiePath,
    secure: config.authSession.cookieSecure
  }))
}

// When a signed-in account creates a space, grant their account access to it and
// refresh the session cookie so the new space is in scope immediately (no
// re-login). No-op for non-DB identities (API tokens) and unrestricted users.
const grantSpaceToSessionUser = (req, res, userId, spaceId) => {
  if (!userId || !spaceId) return
  let user = null
  try { user = findUserById(userId) } catch { return }
  if (!user || !Array.isArray(user.spaces) || user.spaces.includes(spaceId)) return
  const nextSpaces = [...user.spaces, spaceId]
  try { setUserSpaces(userId, nextSpaces) } catch { return }
  if (req.authState?.type === 'session' && config.auth.sessionSecret) {
    try {
      const session = createAuthSessionValue({
        secret: config.auth.sessionSecret,
        ttlMs: config.authSession.ttlMs,
        session: {
          subject: userId,
          label: req.authState.label,
          role: user.role,
          spaces: nextSpaces,
          isUnrestricted: Boolean(user.isUnrestricted)
        }
      })
      setAuthSessionCookie(res, session.value)
      req.authState = { ...req.authState, spaces: nextSpaces }
    } catch { /* non-fatal — DB grant still applied */ }
  }
}

const GUEST_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30

// The communal open space id: the admin-set globalSpaceId wins (legacy
// "open jam" knob, kept as the override), otherwise the config default.
// GUEST_SPACES env stays as a dev-only override when the config is silent.
const resolveOpenSpaceId = async () => {
  const cfg = await configStore.read()
  const configured = Object.prototype.hasOwnProperty.call(cfg, 'globalSpaceId') && cfg.globalSpaceId
    ? cfg.globalSpaceId
    : (process.env.GUEST_SPACES ? (GUEST_SPACES[0] || null) : null)
  // Non-slug overrides (legacy GUEST_SPACES=* wildcard) fall through to the
  // default id instead of silently disabling the open space.
  return normalizeSpaceId(configured || '') || normalizeSpaceId(config.openSpaceId) || null
}

// The shared project everyone lands in when they step into the open space.
// A fixed id lets the client forward /open/studio straight into it.
const OPEN_JAM_PROJECT_ID = 'open-jam'

// The open space is ensured at boot (and whenever an admin repoints it) so
// "step inside" always has somewhere alive to land. kind 'global' keeps it
// out of the TTL sweep and admin-delete-only. Its jam project is ensured
// alongside — the door must never open onto an empty project list.
const ensureOpenSpace = async () => {
  const openId = await resolveOpenSpaceId()
  setCommunalSpaceId(openId)
  if (!openId) return
  if (!(await spaceExists(openId))) {
    await ensureSpaceScene(openId)
    await upsertSpaceMeta(openId, { label: 'Open Space', kind: 'global', allowEdits: true, permanent: true, isPublic: true })
  }
  const jam = await findProjectById(SPACES_DIR, OPEN_JAM_PROJECT_ID)
  if (!jam) {
    await ensureProject(SPACES_DIR, openId, OPEN_JAM_PROJECT_ID, { title: 'Open Jam', source: 'studio-v3' })
  }
}

// Every guest can touch the communal open space plus exactly one private
// sandbox derived from their id. Neither space exists yet at issuance —
// sandboxes are provisioned lazily on first access (ensureOwnSandbox below),
// so pure viewers never create FS/DB rows.
const resolveGuestSpaces = async (guestId) => {
  const openId = await resolveOpenSpaceId()
  const sandboxId = normalizeSpaceId(getOwnSandboxSpaceId(guestId))
  return [...(openId ? [openId] : []), ...(sandboxId ? [sandboxId] : [])]
}

// A sandbox id is only provisionable by the identity it derives from — guests
// carry theirs in the cookie scope, accounts match on subject — so strangers
// can't mint junk spaces by requesting sandbox-* ids.
const isOwnSandbox = (state, spaceId) => {
  if (!spaceId || !spaceId.startsWith('sandbox-')) return false
  if (state?.type === 'guest' || isGuestSubject(state?.subject)) {
    return Array.isArray(state?.spaces) && state.spaces.includes(spaceId)
  }
  return state?.type === 'session' && spaceId === getOwnSandboxSpaceId(state.subject)
}

const ensureOwnSandbox = async (state, spaceId) => {
  if (!isOwnSandbox(state, spaceId)) return
  if (await spaceExists(spaceId)) return
  const isGuest = state.type === 'guest' || isGuestSubject(state.subject)
  await ensureSpaceScene(spaceId)
  // Account sandboxes are permanent (one per user, survives the sweep);
  // guest ones stay throwaway. No ownerUserId — a sandbox never counts
  // toward the owned-space quota.
  await upsertSpaceMeta(spaceId, {
    label: isGuest ? 'Guest Sandbox' : 'Sandbox',
    kind: 'sandbox',
    allowEdits: true,
    permanent: !isGuest
  })
  // Revive: if this account's sandbox was archived while idle, the scene
  // snapshot survives outside spacesDir — put it back so the room they left
  // is the room they return to.
  if (!isGuest) {
    const snapshot = await readLatestSpaceSnapshot(spaceId)
    if (snapshot?.scene) {
      const { scenePath } = getSpacePaths(spaceId)
      await writeJson(scenePath, snapshot.scene)
      await upsertSpaceMeta(spaceId, { sceneVersion: 1 })
    }
  }
}

// Keep the room: when a guest signs in, their sandbox — scene, projects,
// assets — moves onto the account's own sandbox id, so the work survives the
// identity switch. Skipped unless the guest actually built something, and it
// never clobbers existing account work.
const promoteGuestSandbox = async (priorState, userId) => {
  try {
    if (!priorState?.authenticated || !isGuestSubject(priorState.subject)) return false
    const fromId = normalizeSpaceId(getOwnSandboxSpaceId(priorState.subject) || '')
    if (!fromId || !(await spaceExists(fromId))) return false
    const fromMeta = await loadSpaceMeta(fromId)
    const fromProjects = await listProjectsInSpace(SPACES_DIR, fromId)
    if ((fromMeta?.sceneVersion || 0) === 0 && fromProjects.length === 0) return false
    const toId = normalizeSpaceId(getOwnSandboxSpaceId(userId) || '')
    if (!toId || toId === fromId) return false
    if (await spaceExists(toId)) {
      const toMeta = await loadSpaceMeta(toId)
      const toProjects = await listProjectsInSpace(SPACES_DIR, toId)
      if ((toMeta?.sceneVersion || 0) > 0 || toProjects.length > 0) return false
      await deleteSpace(toId)
    }
    await moveSpace(fromId, toId, { label: 'Sandbox', permanent: true })
    // Project documents carry their spaceId in projectMeta — repoint them so
    // clients loading the moved projects see a consistent home.
    for (const project of fromProjects) {
      try {
        const doc = await readProjectDocument(SPACES_DIR, toId, project.id)
        if (doc?.projectMeta?.spaceId && doc.projectMeta.spaceId !== toId) {
          await writeProjectDocument(SPACES_DIR, toId, project.id, {
            ...doc,
            projectMeta: { ...doc.projectMeta, spaceId: toId }
          })
        }
      } catch { /* best-effort — a stale embedded spaceId is cosmetic */ }
    }
    return true
  } catch (error) {
    logger.warn('Failed to promote guest sandbox', error)
    return false
  }
}

const issueGuestSession = async (res) => {
  const guestId = `guest:${crypto.randomUUID()}`
  const spaces = await resolveGuestSpaces(guestId)
  const result = createAuthSessionValue({
    secret: config.auth.sessionSecret,
    ttlMs: GUEST_SESSION_TTL_MS,
    session: {
      subject: guestId,
      label: 'Guest',
      role: 'editor',
      spaces
    }
  })
  setAuthSessionCookie(res, result.value)
  return { guestId, expiresAt: result.expiresAt, spaces }
}

// Request-time throttles for the endpoints that do real work (or take real
// secrets) for unauthenticated callers. Everything else stays unthrottled.
// Guest cap must absorb a whole exhibition venue behind one NAT (and CI's
// Playwright contexts) — it bounds abuse, it must never lock out a gallery.
const guestSessionLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 60, name: 'new guest sessions' })
const authAttemptLimiter = createRateLimiter({ windowMs: 60_000, max: 10, name: 'auth attempts' })
const syncKeyMintLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 30, name: 'sync-key mints' })
const inviteMintLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 30, name: 'invite mints' })
const inviteRedeemLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 30, name: 'invite redeems' })
const uploadLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 60, name: 'uploads' })
// pull/push do real disk I/O plus an outbound HTTP call to the configured
// live server, with no limiter previously — same class of gap the upload
// route already had one for (audit finding #9).
const syncLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 30, name: 'space sync' })
const openCallSubmitLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 20, name: 'open-call applications' })

// Covers the OAuth start + callback routes registered by registerAuthRoutes below.
router.use(['/api/auth/github', '/api/auth/google'], authAttemptLimiter)

registerAuthRoutes(router, {
  config,
  createAuthSessionValue,
  setAuthSessionCookie,
  // OAuth callback = session upgrade: the old guest cookie is still on the
  // request, so the guest's sandbox can follow them (keep the room).
  onSessionUpgrade: (req, user) => promoteGuestSandbox(readAuthSession(req), user.id)
})

router.get('/api/auth/session', async (req, res, next) => {
  try {
    let state = req.authState || getPublicAuthState(req)

    // Re-sync role/spaces from DB so admin patches take effect without re-login
    if (state.authenticated && state.type === 'session' && state.subject && config.auth.sessionSecret) {
      try {
        const dbUser = findUserById(state.subject)
        if (dbUser) {
          const dbRole = normalizeAuthRole(dbUser.role, null) || state.role
          const dbSpaces = Array.isArray(dbUser.spaces) ? dbUser.spaces : []
          const dbUnrestricted = Boolean(dbUser.isUnrestricted)
          const sortedDb = [...dbSpaces].sort().join(',')
          const sortedCookie = [...(state.spaces || [])].sort().join(',')
          if (dbRole !== state.role || sortedDb !== sortedCookie || dbUnrestricted !== Boolean(state.isUnrestricted)) {
            const fresh = createAuthSessionValue({
              secret: config.auth.sessionSecret,
              ttlMs: config.authSession.ttlMs,
              session: { subject: state.subject, label: state.label, role: dbRole, spaces: dbSpaces, isUnrestricted: dbUnrestricted }
            })
            setAuthSessionCookie(res, fresh.value)
            state = buildAuthState({
              authenticated: true, type: 'session', role: dbRole,
              subject: state.subject, label: state.label, spaces: dbSpaces,
              isUnrestricted: dbUnrestricted, session: { expiresAt: fresh.expiresAt }
            })
          }
        }
      } catch { /* non-fatal — keep cookie state */ }
    }

    if (!state.authenticated && config.requireAuth && config.auth.sessionSecret) {
      // Issuing a guest session provisions a sandbox space (FS + DB writes) —
      // gate NEW issuance per address; established sessions are never throttled.
      let allowed = false
      guestSessionLimiter(req, res, () => { allowed = true })
      if (!allowed) return
      const { guestId, expiresAt, spaces } = await issueGuestSession(res)
      state = buildAuthState({
        authenticated: true,
        type: 'guest',
        role: 'editor',
        subject: guestId,
        label: 'Guest',
        spaces,
        session: { expiresAt }
      })
    }

    const spaceLimit = config.freeSpaceLimit
    const exempt = Boolean(state.isUnrestricted) || state.role === 'admin'
    // A returning guest carries a normal session cookie; the guest: subject
    // prefix keeps it from counting as an owning account (create/quota) and
    // keeps the reported type honest for the client's guest indicator.
    const isGuest = state.type === 'guest' || (state.type === 'session' && isGuestSubject(state.subject))
    const ownerId = state.type === 'session' && !isGuest ? state.subject : null
    const ownedSpaceCount = ownerId ? countSpacesOwnedBy(ownerId) : 0
    const canCreateSpace = !config.requireAuth || exempt || (Boolean(ownerId) && ownedSpaceCount < spaceLimit)

    // Every session knows its places: the communal open space and its own
    // sandbox (deterministic from the subject; provisioned lazily on access).
    const sandboxSpaceId = state.authenticated && (state.type === 'guest' || state.type === 'session')
      ? normalizeSpaceId(getOwnSandboxSpaceId(state.subject) || '')
      : null

    res.json({
      requireAuth: config.requireAuth,
      authenticated: Boolean(state.authenticated),
      type: isGuest ? 'guest' : (state.type || null),
      role: state.role || null,
      subject: state.subject || null,
      label: state.label || null,
      spaces: state.spaces,
      isUnrestricted: Boolean(state.isUnrestricted),
      expiresAt: state.session?.expiresAt || null,
      openSpaceId: getCommunalSpaceId(),
      sandboxSpaceId,
      spaceLimit,
      ownedSpaceCount,
      canCreateSpace
    })
  } catch (error) {
    next(error)
  }
})

router.post('/api/auth/session', authAttemptLimiter, async (req, res) => {
  if (!config.requireAuth) {
    clearAuthSessionCookie(res)
    res.json({
      requireAuth: false,
      authenticated: true,
      type: 'disabled',
      expiresAt: null
    })
    return
  }

  const token = normalizeAuthToken(req.body?.token)
  const identity = config.auth.resolveIdentity(token)
  if (!identity) {
    clearAuthSessionCookie(res)
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  // Session upgrade: the request still carries the previous cookie, so a
  // guest's sandbox can follow them onto the new identity (keep the room).
  const keptSandbox = await promoteGuestSandbox(readAuthSession(req), identity.subject)

  const session = createAuthSessionValue({
    secret: config.auth.sessionSecret,
    ttlMs: config.authSession.ttlMs,
    session: {
      subject: identity.subject,
      label: identity.label,
      role: identity.role,
      spaces: identity.spaces,
      isUnrestricted: identity.isUnrestricted
    }
  })
  setAuthSessionCookie(res, session.value)
  res.json({
    requireAuth: true,
    authenticated: true,
    type: 'session',
    role: identity.role,
    subject: identity.subject,
    label: identity.label,
    spaces: identity.spaces,
    isUnrestricted: Boolean(identity.isUnrestricted),
    expiresAt: session.expiresAt,
    keptSandbox
  })
})

router.delete('/api/auth/session', (req, res) => {
  clearAuthSessionCookie(res)
  res.status(204).end()
})

// Dynamic, auth-scoped JSON — never let a CDN/edge cache (e.g. LiteSpeed LSCache on
// cPanel) serve a stale or cross-user response for these. Asset/static routes set
// their own explicit Cache-Control and are unaffected.
router.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

router.use((req, res, next) => {
  req.authState = getPublicAuthState(req)
  next()
})

const sendRoleError = (res, status, requiredRole, currentRole = null, error = null) => {
  res.status(status).json({
    error: error || (status === 401 ? 'Unauthorized' : `${formatAuthRoleLabel(requiredRole)} role required.`),
    requiredRole,
    ...(currentRole ? { currentRole } : {})
  })
}

const sendScopeError = (res, status, {
  requiredSpaceId = null,
  allowedSpaces = null,
  error = null
} = {}) => {
  res.status(status).json({
    error: error || 'Space access denied.',
    ...(requiredSpaceId ? { requiredSpaceId } : {}),
    allowedSpaces,
    allowedSpaceLabel: formatAuthScopeLabel(allowedSpaces)
  })
}

const requireWriteRole = (requiredRole = 'editor') => (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  if (!config.requireAuth) return next()
  const resolvedRole = req.requiredWriteRole || requiredRole
  const state = req.authState || getPublicAuthState(req)
  if (!state.authenticated) {
    return sendRoleError(res, 401, resolvedRole, state.role)
  }
  if (hasRequiredAuthRole(state.role, resolvedRole)) {
    const requiredSpaceId = req.requiredSpaceId || null
    if (!canAccessSpace(state, requiredSpaceId)) {
      return sendScopeError(res, 403, {
        requiredSpaceId,
        allowedSpaces: state.spaces
      })
    }
    return next()
  }
  return sendRoleError(res, 403, resolvedRole, state.role)
}

const requireAdminWrite = requireWriteRole('admin')

// Owner self-service: the signed-in account that created a space manages it
// (rename, visibility, publish target, delete); admins manage everything.
// Guests/tokens/sync-keys never qualify — only real session identities.
const isSpaceOwnerOrAdminState = (state, meta) => {
  if (!state) return false
  if (state.role === 'admin') return true
  return state.type === 'session' && Boolean(meta?.ownerUserId) && meta.ownerUserId === state.subject
}

// Route-level gate for space management writes. Sits on top of
// requireWriteRole('editor'), which already enforced auth + space scope.
const requireSpaceOwnerOrAdminWrite = async (req, res, next) => {
  if (!config.requireAuth) return next()
  try {
    const spaceId = normalizeSpaceId(req.params.spaceId) || req.params.spaceId
    const meta = await loadSpaceMeta(spaceId)
    if (!meta) return res.status(404).json({ error: 'Space not found.' })
    if (!isSpaceOwnerOrAdminState(req.authState || {}, meta)) {
      return res.status(403).json({ error: 'Only the space owner or an admin can manage this space.' })
    }
    req.spaceMeta = meta
    return next()
  } catch (error) {
    return next(error)
  }
}

// Unlike requireWriteRole, this applies to every method including GET/HEAD —
// for admin-only resources (like user management) that have no public read path.
const requireAdminAlways = (req, res, next) => {
  if (!config.requireAuth) return next()
  const state = req.authState || getPublicAuthState(req)
  if (!state.authenticated) {
    return sendRoleError(res, 401, 'admin', state.role)
  }
  if (!hasRequiredAuthRole(state.role, 'admin')) {
    return sendRoleError(res, 403, 'admin', state.role)
  }
  return next()
}

const requireReadRole = (requiredRole = 'viewer') => async (req, res, next) => {
  if (!['GET', 'HEAD'].includes(req.method)) return next()
  if (!config.requireAuth) return next()
  const spaceId = req.requiredSpaceId
  if (!spaceId) return next()
  try {
    const meta = await loadSpaceMeta(spaceId)
    if (meta?.isPublic) return next()
  } catch (error) {
    return next(error)
  }
  const state = req.authState || getPublicAuthState(req)
  if (!state.authenticated) {
    return sendRoleError(res, 401, requiredRole, state.role)
  }
  if (!hasRequiredAuthRole(state.role, requiredRole)) {
    return sendRoleError(res, 403, requiredRole, state.role)
  }
  if (!canAccessSpace(state, spaceId)) {
    return sendScopeError(res, 403, {
      requiredSpaceId: spaceId,
      allowedSpaces: state.spaces
    })
  }
  return next()
}

// ── One-click GitHub sync: webhook receiver (signature-authed, pre-gate) ──────
// Default loopback works on a normal TCP listen; under Passenger (cPanel) the app
// is fronted by a Unix socket and nothing binds config.port, so SELF_API_URL must
// point at the server's own public origin (e.g. https://di-studio.xyz/serverXR).
const internalApiBase = () =>
  process.env.SELF_API_URL?.replace(/\/$/, '') || `http://127.0.0.1:${config.port}${config.basePath || ''}`
const internalHeaders = () => ({ 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${config.apiToken}` })

// Upload one binary into a project through the server's own multipart asset
// route (the route computes the content-hash id and returns the public URL).
async function uploadSyncedAsset(base, projectId, rel, buf) {
  const boundary = 'dii-sync-' + crypto.randomBytes(8).toString('hex')
  const filename = path.basename(rel).replace(/"/g, '')
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="asset"; filename="${filename}"\r\n` +
    `Content-Type: ${spaceSyncPlan.mimeFor(rel)}\r\n\r\n`
  )
  const body = Buffer.concat([head, buf, Buffer.from(`\r\n--${boundary}--\r\n`)])
  const r = await httpRequest(`${base}/api/projects/${projectId}/assets`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length
    },
    body,
    timeoutMs: 120000
  })
  if (!r.ok) throw new Error(`asset upload failed (${r.status}) for ${rel}`)
  return r.json().asset
}

// Assets bigger than this are skipped (and reported) rather than buffered
// through base64 + multipart under cPanel/LVE memory limits.
const MAX_SYNC_ASSET_BYTES = 30 * 1024 * 1024

// Pull the linked repo into the space via the GitHub App installation token,
// writing through the server's OWN tested document/asset APIs (admin). With a
// di-space.json manifest in the repo this matches the CI push path: include
// globs become extra code files, asset globs upload referenced binaries and
// rewrite their URLs in the entry HTML. Without a manifest: entry file only.
async function syncLinkedSpace(link) {
  let token = null
  let installationId = link.installationId
  if (installationId) { try { token = await githubApp.installationToken(installationId) } catch {} }
  if (!token) {
    const got = await githubApp.getInstallationForRepo(link.owner, link.repo)
    if (got) { token = got.token; installationId = got.installationId }
  }
  if (!token) throw new Error(`No GitHub App installation can access ${link.owner}/${link.repo}`)
  const ref = link.ref || await githubApp.repoDefaultBranch(token, link.owner, link.repo)
  let entryHtml = await githubApp.fetchRepoFile(token, link.owner, link.repo, ref, link.entry)
  const base = internalApiBase()
  const codeFiles = [{ name: 'index.html', content: entryHtml }]
  let assetsUploaded = 0
  const skipped = []

  let manifest = null
  try {
    manifest = JSON.parse(await githubApp.fetchRepoFile(token, link.owner, link.repo, ref, 'di-space.json'))
  } catch { /* no manifest — entry-only sync */ }

  if (manifest && (manifest.include?.length || manifest.assets?.length)) {
    const repoPaths = await githubApp.repoTree(token, link.owner, link.repo, ref)
    const entryPath = String(link.entry).replace(/^\.?\//, '')
    const { codePaths, assetPaths } = spaceSyncPlan.planSync({ manifest, repoPaths, entryPath, entryHtml })
    for (const rel of assetPaths) {
      const buf = await githubApp.fetchRepoFileBuffer(token, link.owner, link.repo, ref, rel)
      if (buf.length > MAX_SYNC_ASSET_BYTES) { skipped.push(rel); continue }
      const asset = await uploadSyncedAsset(base, link.projectId, rel, buf)
      entryHtml = spaceSyncPlan.rewriteAssetUrl(entryHtml, rel, asset.url)
      assetsUploaded++
    }
    codeFiles[0].content = entryHtml
    for (const rel of codePaths) {
      codeFiles.push({
        name: path.basename(rel),
        content: await githubApp.fetchRepoFile(token, link.owner, link.repo, ref, rel)
      })
    }
  }

  const docUrl = `${base}/api/projects/${link.projectId}/document`
  const cur = await httpRequest(docUrl, { headers: internalHeaders() }).then((r) => r.json()).catch(() => ({}))
  const doc = cur.document || {}
  const put = await httpRequest(docUrl, {
    method: 'PUT', headers: internalHeaders(),
    body: JSON.stringify({
      ...doc,
      presentationState: { ...(doc.presentationState || {}), mode: 'code', entryView: 'code', codeFiles },
      publishState: { ...(doc.publishState || {}), shareEnabled: true }
    })
  })
  if (!put.ok) throw new Error(`internal document PUT failed (${put.status})`)
  await httpRequest(`${base}/api/spaces/${link.spaceId}`, {
    method: 'PATCH', headers: internalHeaders(),
    body: JSON.stringify({ publishedProjectId: link.projectId })
  }).catch(() => {})
  return {
    ref,
    bytes: entryHtml.length,
    codeFiles: codeFiles.length,
    assets: assetsUploaded,
    ...(skipped.length ? { skippedOversize: skipped } : {})
  }
}

router.post('/api/github/webhook', async (req, res) => {
  try {
    if (!githubApp.verifyWebhookSignature(req.rawBody, req.get('x-hub-signature-256'))) {
      return res.status(401).json({ error: 'Invalid signature.' })
    }
    const event = req.get('x-github-event')
    if (event === 'ping') return res.json({ ok: true, pong: true })
    if (event !== 'push') return res.json({ ok: true, ignored: event })
    const full = req.body?.repository?.full_name || ''
    const [owner, repo] = full.split('/')
    const after = req.body?.after || null
    const links = owner && repo ? spaceLinkStore.getLinksByRepo(owner, repo) : []
    if (!links.length) return res.json({ ok: true, linked: false, repo: full })
    const synced = []
    for (const link of links) {
      try {
        const r = await syncLinkedSpace(link)
        if (after) spaceLinkStore.setLastSyncSha(link.spaceId, after)
        synced.push({ space: link.spaceId, ok: true, ...r })
      } catch (e) { synced.push({ space: link.spaceId, ok: false, error: e.message }) }
    }
    res.json({ ok: true, repo: full, synced })
  } catch (error) {
    logger.error('[github-webhook]', error?.message || error)
    res.status(500).json({ error: 'Webhook processing failed.' })
  }
})

// Creating a space (POST /api/spaces) is open to any signed-in account; the
// route handler enforces the free-tier quota (and blocks guests/tokens). Space
// *management* (PATCH/DELETE below) is owner-or-admin, enforced by
// requireSpaceOwnerOrAdminWrite on the routes themselves.
router.use('/api/spaces/:spaceId', async (req, res, next) => {
  req.requiredSpaceId = normalizeSpaceId(req.params.spaceId) || null
  try {
    // Sandboxes are provisioned here, on first real space access, instead of
    // at session issuance — see resolveGuestSpaces / ensureOwnSandbox.
    await ensureOwnSandbox(req.authState || getPublicAuthState(req), req.requiredSpaceId)
  } catch (error) {
    return next(error)
  }
  next()
})

// Sync routes act on a space (pull/push/status) just like /api/spaces/:spaceId
// — without this, requireWriteRole below sees requiredSpaceId=null and skips
// the per-space scope check entirely.
router.use('/api/sync/spaces/:spaceId', (req, res, next) => {
  req.requiredSpaceId = normalizeSpaceId(req.params.spaceId) || null
  next()
})

router.use('/api/projects/:projectId', async (req, res, next) => {
  try {
    const project = await resolveProjectContext(req.params.projectId)
    req.requiredSpaceId = project?.spaceId || null
    if (req.method === 'DELETE' && (req.path === '/' || req.path === '')) {
      // Deleting a project is owner-or-admin, like managing its space: keep
      // the admin requirement unless the caller owns the parent space.
      const meta = project?.spaceId ? await loadSpaceMeta(project.spaceId) : null
      if (!isSpaceOwnerOrAdminState(req.authState || {}, meta)) {
        req.requiredWriteRole = 'admin'
      }
    }
    next()
  } catch (error) {
    next(error)
  }
})

// Resolves a bare /{spaceSlugOrId}/{projectSlugOrId} public link to its real
// ids — docs/architecture/SPEC_space_urls_and_portability.md. Must set
// req.requiredSpaceId (mirroring the /api/spaces/:spaceId and
// /api/projects/:projectId blocks above) BEFORE the blanket requireReadRole
// gate below, or a private space's slug would leak unauthenticated — the
// "silent hardcoded fallback"/fail-open bug class this session's known-fixes
// entry is about, applied here to a brand new route rather than an existing
// one.
router.use('/api/resolve/:spaceSegment/:projectSegment', async (req, res, next) => {
  try {
    const spaceSegment = req.params.spaceSegment
    const space = (await findSpaceBySlug(spaceSegment)) || (await loadSpaceMeta(normalizeSpaceId(spaceSegment) || spaceSegment))
    req.requiredSpaceId = space?.id || null
    next()
  } catch (error) {
    next(error)
  }
})

// Public, unauthenticated: open-call application submissions (registered
// before the /api auth gate below; permissive CORS handled at app level).
router.post('/api/open-calls/:callId/applications', openCallSubmitLimiter, (req, res, next) => {
  try {
    const { callId } = req.params
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const { name, email, phone, city, ...rest } = body
    const application = openCallStore.createApplication({ callId, name, email, phone, city, payload: rest })
    res.status(201).json({ ok: true, id: application.id })
  } catch (error) {
    next(error)
  }
})

// Shared with registerSpaceRoutes below (same instance, not just the same
// factory) so an inscription write and a normal /ops write to the same space
// serialize against each other instead of two independent lock maps letting
// them race (audit 2026-07-17). Created here, before either registration,
// since inscriptions must register ahead of the auth gate further down while
// spaceRoutes registers after it -- reordering either would change who needs
// auth for what.
const sharedSpaceOpsLock = createKeyedLock()

// Public, unauthenticated, append-only: space inscriptions (the br_id_ge
// portal write path). Registered before the gates like open-call submissions;
// per-space opt-in + sanitization live in the route itself.
registerInscriptionRoutes(router, {
  appendOpsHistory,
  applySceneOps,
  blankScene: BLANK_SCENE,
  broadcastLiveEvent,
  ensureSpaceScene,
  ensureSpaceWritable,
  getSpacePaths,
  inscriptionLimiter: createRateLimiter({ windowMs: 10 * 60_000, max: 12, name: 'inscriptions' }),
  loadSpaceMeta,
  maxOpHistory: MAX_OP_HISTORY,
  normalizeSpaceId,
  readJson,
  withSpaceOpsLock: sharedSpaceOpsLock,
  upsertSpaceMeta,
  writeJson
})

router.use('/api', requireReadRole('viewer'))
router.use('/api', requireWriteRole('editor'))

const resolveProjectContext = async (projectId) => {
  const normalized = normalizeProjectId(projectId)
  if (!normalized) {
    return null
  }
  return findProjectById(SPACES_DIR, normalized)
}

// Registered after the requireReadRole/requireWriteRole gates above (line
// ~1211-1212), so the req.requiredSpaceId set by the /api/resolve/... router.use
// block further up has already been enforced by the time this handler runs —
// a private space's slug/id 404s the same as a nonexistent one, never
// distinguishing "exists but private" from "doesn't exist" (avoids leaking
// existence). docs/architecture/SPEC_space_urls_and_portability.md.
router.get('/api/resolve/:spaceSegment/:projectSegment', async (req, res, next) => {
  try {
    const spaceSegment = req.params.spaceSegment
    const projectSegment = req.params.projectSegment
    const space = (await findSpaceBySlug(spaceSegment)) || (await loadSpaceMeta(normalizeSpaceId(spaceSegment) || spaceSegment))
    if (!space) return res.status(404).json({ error: 'Not found.' })
    const project = (await findProjectBySlug(space.id, projectSegment)) ||
      (await loadProjectMeta(SPACES_DIR, space.id, normalizeProjectId(projectSegment) || projectSegment))
    if (!project || project.spaceId !== space.id) return res.status(404).json({ error: 'Not found.' })
    res.json({ space, project })
  } catch (error) {
    next(error)
  }
})

registerStatusRoutes(router, {
  recentEvents,
  releaseInfo,
  startedAt
})

registerIntegrationRoutes(router)

registerOpenCallRoutes(router, {
  requireAdminAlways,
  listApplications: openCallStore.listApplications,
  updateApplication: openCallStore.updateApplication,
  deleteApplication: openCallStore.deleteApplication,
  getApplication: openCallStore.getApplication
})

registerUserRoutes(router, {
  requireAdminAlways,
  listUsers,
  findUserById,
  setUserSpaces,
  setUserUnrestricted,
  setUserRole
})

// Throttle asset uploads only (POST); asset reads on the same path stay free.
router.use('/api/spaces/:spaceId/assets', (req, res, next) =>
  req.method === 'POST' ? uploadLimiter(req, res, next) : next())

const { replaceSceneAndBroadcast } = registerSpaceRoutes(router, {
  appendOpsHistory,
  applySceneOps,
  blankScene: BLANK_SCENE,
  broadcastLiveEvent,
  buildMeta,
  collectSceneAssetRefs,
  config,
  countSpacesOwnedBy,
  withSpaceOpsLock: sharedSpaceOpsLock,
  spaceLimit: config.freeSpaceLimit,
  grantSpaceToSessionUser,
  deleteSpace,
  ensureSpaceScene,
  ensureSpaceWritable,
  findProjectById,
  findSpaceBySlug,
  findUserById,
  getLiveBucket,
  getPublicAuthState,
  isAllowedUpload,
  getSandboxStats,
  getSpacePaths,
  hydrateSceneAssetManifest,
  canAccessSpace,
  isAuthScopeAllowedForSpace,
  isReservedSpaceSlug,
  isValidAssetId,
  loadSpaceMeta,
  listSpaces,
  listProjectsInSpace,
  maxOpHistory: MAX_OP_HISTORY,
  normalizeIncomingOps,
  normalizeProjectId,
  normalizeSpaceId,
  normalizeSpaceSlug,
  readProjectDocument,
  requireAdminWrite,
  requireSpaceOwnerOrAdminWrite,
  readJson,
  readLatestSpaceSnapshot,
  readOpsHistory,
  readOpsHistorySince,
  removeAssetThumbnails,
  saveSpaceMeta,
  serveAsset,
  setUserSpaces,
  spacesDir: SPACES_DIR,
  spaceExists,
  upsertSpaceMeta,
  upload,
  writeJson,
  writeOpsHistory
})

// Space sync keys — mint/list/revoke. Management is restricted to the space
// OWNER (via session) or an ADMIN; editor/viewer/sync-key identities are
// rejected so a leaked sync key can never mint more keys (no escalation).
const requireSpaceOwnerOrAdmin = async (req, res) => {
  const raw = req.params.spaceId
  const spaceId = normalizeSpaceId(raw) || raw
  const meta = await loadSpaceMeta(spaceId)
  if (!meta) { res.status(404).json({ error: 'Space not found.' }); return null }
  const state = req.authState || {}
  if (!isSpaceOwnerOrAdminState(state, meta)) {
    res.status(403).json({ error: 'Only the space owner can manage sharing for this space.' })
    return null
  }
  return { spaceId, meta, state }
}

router.post('/api/spaces/:spaceId/sync-keys', syncKeyMintLimiter, async (req, res, next) => {
  try {
    const ctx = await requireSpaceOwnerOrAdmin(req, res)
    if (!ctx) return
    const label = String(req.body?.label || 'github-actions').slice(0, 80)
    const ttlMs = 365 * 24 * 60 * 60 * 1000 // default: 1 year
    const ownerUserId = ctx.state.type === 'session' ? ctx.state.subject : (ctx.meta.ownerUserId || null)
    const { token, key } = mintSyncKey({ spaceId: ctx.spaceId, ownerUserId, label, ttlMs })
    res.status(201).json({
      ok: true,
      token,
      key,
      note: 'Copy this token now — it is shown only once. Add it as the DI_SPACE_TOKEN secret in your GitHub repo.'
    })
  } catch (error) { next(error) }
})

router.get('/api/spaces/:spaceId/sync-keys', async (req, res, next) => {
  try {
    const ctx = await requireSpaceOwnerOrAdmin(req, res)
    if (!ctx) return
    res.json({ keys: listSyncKeys(ctx.spaceId) })
  } catch (error) { next(error) }
})

router.delete('/api/spaces/:spaceId/sync-keys/:id', async (req, res, next) => {
  try {
    const ctx = await requireSpaceOwnerOrAdmin(req, res)
    if (!ctx) return
    if (!revokeSyncKey(ctx.spaceId, req.params.id)) {
      return res.status(404).json({ error: 'Key not found.' })
    }
    res.json({ ok: true, revoked: req.params.id })
  } catch (error) { next(error) }
})

// Space invites — owner-minted share links. Management mirrors sync keys
// (owner-or-admin only); redeeming grants scope membership to the space, so
// the redeemer's own role still governs what they can do inside it.
router.post('/api/spaces/:spaceId/invites', inviteMintLimiter, async (req, res, next) => {
  try {
    const ctx = await requireSpaceOwnerOrAdmin(req, res)
    if (!ctx) return
    const label = String(req.body?.label || 'invite').slice(0, 80)
    const createdByUserId = ctx.state.type === 'session' ? ctx.state.subject : (ctx.meta.ownerUserId || null)
    const { token, invite } = mintInvite({ spaceId: ctx.spaceId, createdByUserId, label })
    res.status(201).json({
      ok: true,
      token,
      invite,
      note: 'Copy this invite now — it is shown only once.'
    })
  } catch (error) { next(error) }
})

router.get('/api/spaces/:spaceId/invites', async (req, res, next) => {
  try {
    const ctx = await requireSpaceOwnerOrAdmin(req, res)
    if (!ctx) return
    res.json({ invites: listInvites(ctx.spaceId) })
  } catch (error) { next(error) }
})

router.delete('/api/spaces/:spaceId/invites/:id', async (req, res, next) => {
  try {
    const ctx = await requireSpaceOwnerOrAdmin(req, res)
    if (!ctx) return
    if (!revokeInvite(ctx.spaceId, req.params.id)) {
      return res.status(404).json({ error: 'Invite not found.' })
    }
    res.json({ ok: true, revoked: req.params.id })
  } catch (error) { next(error) }
})

// Redeem an invite: append the space to the caller's scope. Works for both
// registered sessions (persisted to users.spaces + cookie re-mint) and guest
// sessions (cookie-only re-mint — the 30-day guest cookie carries the grant;
// sign-in later persists it via the normal keep-the-room path). Invalid,
// expired, and revoked tokens are indistinguishable, and the response never
// leaks space internals beyond id/label/visibility.
router.post('/api/invites/redeem', inviteRedeemLimiter, async (req, res, next) => {
  try {
    const state = req.authState || {}
    if (config.requireAuth && !state.authenticated) {
      return res.status(401).json({ error: 'A session is required to redeem an invite.' })
    }
    const resolved = resolveInvite(String(req.body?.token || ''))
    if (!resolved) return res.status(404).json({ error: 'Invite is invalid or has expired.' })
    const spaceId = resolved.spaceId
    const meta = await loadSpaceMeta(spaceId)
    if (!meta) return res.status(404).json({ error: 'Invite is invalid or has expired.' })
    const spacePublic = { id: meta.id, label: meta.label, isPublic: Boolean(meta.isPublic) }

    if (!config.requireAuth || canAccessSpace(state, spaceId)) {
      markInviteUsed(resolved.inviteId)
      return res.json({ ok: true, granted: false, space: spacePublic })
    }
    if (state.type !== 'session' && state.type !== 'guest') {
      return res.status(403).json({ error: 'Invites can only be redeemed by a browser session.' })
    }

    let dbUser = null
    if (!isGuestSubject(state.subject)) {
      try { dbUser = findUserById(state.subject) } catch { dbUser = null }
    }
    if (dbUser) {
      grantSpaceToSessionUser(req, res, state.subject, spaceId)
    } else {
      if (!config.auth.sessionSecret) {
        return res.status(503).json({ error: 'Sessions are unavailable.' })
      }
      const nextSpaces = [...(state.spaces || []), spaceId]
      const session = createAuthSessionValue({
        secret: config.auth.sessionSecret,
        ttlMs: GUEST_SESSION_TTL_MS,
        session: {
          subject: state.subject,
          label: state.label,
          role: state.role,
          spaces: nextSpaces,
          isUnrestricted: false
        }
      })
      setAuthSessionCookie(res, session.value)
    }
    markInviteUsed(resolved.inviteId)
    res.json({ ok: true, granted: true, space: spacePublic })
  } catch (error) { next(error) }
})

// GitHub App discovery for the no-code connect flow: signed-in users get the
// App's install URL and the repos the App can already reach, so linking a
// space is "install → pick from dropdown", never typed owner/repo.
const requireSignedInUser = (req, res) => {
  const state = req.authState || {}
  if (!config.requireAuth) return true
  if (state.authenticated && (state.type === 'session' || state.role === 'admin')) return true
  res.status(403).json({ error: 'Sign in to manage GitHub sync.' })
  return false
}

router.get('/api/github/app', async (req, res) => {
  if (!requireSignedInUser(req, res)) return
  if (!githubApp.isConfigured()) return res.json({ configured: false })
  try {
    const info = await githubApp.appInfo()
    res.json({ configured: true, name: info.name, installUrl: `https://github.com/apps/${info.slug}/installations/new` })
  } catch (error) {
    res.json({ configured: true, name: null, installUrl: null, error: error.message })
  }
})

// Repos here are those the *App* was installed on (by any collaborator), not
// the caller's private GitHub account — visible to every signed-in user by
// design, same audience that can see linked spaces in admin.
let _repoCache = { at: 0, repos: null }
router.get('/api/github/repos', async (req, res, next) => {
  if (!requireSignedInUser(req, res)) return
  if (!githubApp.isConfigured()) return res.json({ configured: false, repos: [] })
  try {
    const fresh = req.query?.refresh === '1'
    if (!fresh && _repoCache.repos && Date.now() - _repoCache.at < 60_000) {
      return res.json({ configured: true, repos: _repoCache.repos, cached: true })
    }
    const repos = await githubApp.listAccessibleRepos()
    _repoCache = { at: Date.now(), repos }
    res.json({ configured: true, repos })
  } catch (error) { next(error) }
})

// GitHub link — connect a space to a repo (owner/admin only). On connect we
// resolve the App installation, store the binding, and run an initial sync.
router.post('/api/spaces/:spaceId/github-link', async (req, res, next) => {
  try {
    const ctx = await requireSpaceOwnerOrAdmin(req, res)
    if (!ctx) return
    const { owner, repo, ref = null, projectId, entry = 'index.html' } = req.body || {}
    if (!owner || !repo || !projectId) return res.status(400).json({ error: 'owner, repo, projectId are required.' })
    let installationId = null
    try { installationId = (await githubApp.getInstallationForRepo(owner, repo))?.installationId || null } catch {}
    const link = spaceLinkStore.upsertLink({ spaceId: ctx.spaceId, owner, repo, ref, projectId, entry, installationId })
    let initialSync = null
    try { initialSync = await syncLinkedSpace(link) } catch (e) { initialSync = { error: e.message } }
    res.status(201).json({ ok: true, link, initialSync })
  } catch (error) { next(error) }
})

router.get('/api/spaces/:spaceId/github-link', async (req, res, next) => {
  try {
    const ctx = await requireSpaceOwnerOrAdmin(req, res)
    if (!ctx) return
    res.json({ link: spaceLinkStore.getLinkBySpace(ctx.spaceId) })
  } catch (error) { next(error) }
})

router.delete('/api/spaces/:spaceId/github-link', async (req, res, next) => {
  try {
    const ctx = await requireSpaceOwnerOrAdmin(req, res)
    if (!ctx) return
    res.json({ ok: true, removed: spaceLinkStore.removeLink(ctx.spaceId) })
  } catch (error) { next(error) }
})

// Same upload throttle as space assets — project asset uploads share the
// same disk/bandwidth cost and were missing this limiter entirely.
router.use('/api/projects/:projectId/assets', (req, res, next) =>
  req.method === 'POST' ? uploadLimiter(req, res, next) : next())

registerProjectRoutes(router, {
  appendProjectOps,
  applyProjectOps,
  blankProjectDocument: BLANK_PROJECT_DOCUMENT,
  broadcastProjectLiveEvent,
  buildProjectAssetMeta,
  deleteProjectWithIndex: async (spaceId, projectId) => deleteProject(SPACES_DIR, spaceId, projectId),
  ensureProject,
  ensureSpaceWritable,
  findProjectBySlug,
  getProjectLiveBucket,
  getProjectPaths,
  isReservedProjectSlug,
  isValidAssetId: isValidProjectAssetId,
  listProjectsInSpace,
  maxOpHistory: MAX_OP_HISTORY,
  normalizeIncomingOps,
  normalizeProjectDocument,
  normalizeProjectId,
  normalizeProjectSlug,
  normalizeSpaceId,
  readJson,
  readProjectDocument,
  readProjectOps,
  readProjectOpsSince,
  resolveProjectContext,
  spacesDir: SPACES_DIR,
  spaceExists,
  upload,
  upsertProjectMeta,
  writeJson,
  writeProjectDocument
})

router.use('/api/sync/spaces/:spaceId', syncLimiter)

registerSyncRoutes(router, {
  config,
  getSpacePaths,
  readJson,
  normalizeSpaceId,
  ensureSpaceWritable,
  replaceSceneAndBroadcast,
})

// Admin sweep for the hub's collapsed sandbox row: remove guest sandboxes the
// TTL has already expired — the same thing the 30-minute timer does, on demand.
router.post('/api/admin/sandboxes/purge', requireAdminAlways, async (req, res, next) => {
  try {
    const removed = await pruneStaleSandboxes()
    const archived = await archiveIdleAccountSandboxes()
    res.json({ ok: true, removed: removed.length, archived: archived.length })
  } catch (error) {
    next(error)
  }
})

registerConfigRoutes(router, {
  requireAdminAlways,
  configStore,
  // Repointing globalSpaceId moves the communal grant and ensures the new
  // open space exists.
  onConfigChanged: () => ensureOpenSpace()
})

const mountTargets = new Set([config.mountPath])
if (!mountTargets.has('/serverXR')) {
  mountTargets.add('/serverXR')
}
mountTargets.forEach((targetPath) => {
  const normalizedTarget = targetPath || '/'
  app.use(normalizedTarget, router)
})

app.use((err, req, res, next) => {
  pushEvent('error', { message: err.message })
  logger.error(err)
  if (err?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'Uploaded file is too large.' })
    return
  }
  if (err?.message === 'Unsupported asset type.') {
    res.status(400).json({ error: err.message })
    return
  }
  // Only forward err.message when the route deliberately set err.status —
  // that means it's a controlled, safe-to-show message ("Invalid space
  // id.", "Space is read-only."). An error with no status is unexpected
  // (e.g. a raw fs ENOENT, which embeds the absolute server path) and must
  // not leak internals to the client — the real message is already logged
  // above via logger.error/pushEvent for anyone operating the server.
  const status = err?.status || 500
  const message = err?.status ? (err.message || 'Server error') : 'Server error'
  res.status(status).json({ error: message })
})

const PORT = config.port

const snapshotOpenSpace = async () => {
  const openId = getCommunalSpaceId()
  if (!openId || !(await spaceExists(openId))) return
  await snapshotSpaceScene(openId)
}

initStorage()
  .then(async () => {
    await ensureDefaultSpace()
    await ensureOpenSpace()
    pruneSpaces().catch((error) => logger.warn('Failed to prune spaces', error))
    setInterval(() => {
      pruneSpaces().catch((error) => logger.warn('Failed to prune spaces', error))
    }, 1000 * 60 * 30)
    // Daily scene snapshot of the open space — vandalism insurance (admin
    // restores via POST /api/spaces/:id/restore-snapshot).
    snapshotOpenSpace().catch((error) => logger.warn('Failed to snapshot open space', error))
    setInterval(() => {
      snapshotOpenSpace().catch((error) => logger.warn('Failed to snapshot open space', error))
      // Long-idle account sandboxes fold down to a snapshot (revived on
      // return by ensureOwnSandbox) so permanent sandboxes never pile up.
      archiveIdleAccountSandboxes().catch((error) => logger.warn('Failed to archive idle sandboxes', error))
    }, 1000 * 60 * 60 * 24)

    const httpServer = http.createServer(app)

    initializeSocket(httpServer, {
      ...config,
      canEditSpace: async (spaceId) => {
        const normalized = normalizeSpaceId(spaceId)
        if (!normalized) return false
        const meta = await loadSpaceMeta(normalized)
        return meta?.allowEdits !== false
      },
      resolveProjectContext: async (projectId) => {
        return findProjectById(SPACES_DIR, projectId)
      }
    })
    logger.info('[Socket.IO] Initialized for real-time collaboration')

    initializeMesh(httpServer, config)

    httpServer.listen(PORT, () => {
      pushEvent('server-started', {
        port: PORT,
        node: process.version,
        releaseId: releaseInfo.releaseId,
        deployEnv: releaseInfo.deployEnv
      })
      logger.info(`Server running. Listening on: ${PORT}`)
    })
  })
  .catch((error) => {
    logger.error('Failed to initialize storage', error)
    process.exit(1)
  })
