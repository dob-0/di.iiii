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
const {
  canAccessSpace,
  formatAuthScopeLabel,
  formatAuthRoleLabel,
  hasRequiredAuthRole,
  isAuthScopeAllowedForSpace,
  normalizeAuthRole,
  normalizeAuthScopeSpaces
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
const { loadReleaseInfo } = require('./releaseInfo')
const { registerProjectRoutes } = require('./routes/projectRoutes')
const { registerSpaceRoutes } = require('./routes/spaceRoutes')
const { registerStatusRoutes } = require('./routes/statusRoutes')
const { registerUserRoutes } = require('./routes/userRoutes')
const { listUsers, findUserById, setUserSpaces, setUserUnrestricted, setUserRole } = require('./userStore')
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
  getProjectPaths,
  isValidAssetId: isValidProjectAssetId,
  listProjectsInSpace,
  normalizeProjectId,
  readProjectDocument,
  readProjectOps,
  removeProjectIndexEntriesForSpace,
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
  buildMeta,
  countSpacesOwnedBy,
  deleteSpace,
  ensureDefaultSpace,
  ensureSpaceScene,
  ensureSpaceWritable,
  getSpacePaths,
  hydrateSceneAssetManifest,
  isValidAssetId,
  listSpaces,
  loadSpaceMeta,
  normalizeSpaceId,
  pruneSpaces,
  readOpsHistory,
  saveSpaceMeta,
  serveAsset,
  spaceExists,
  upsertSpaceMeta,
  writeOpsHistory
} = createSpaceStore({
  spacesDir: SPACES_DIR,
  defaultSpaceId: DEFAULT_SPACE_ID,
  defaultTtlMs: DEFAULT_TTL_MS,
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
      console.warn('Failed to write SSE event', error)
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
      console.warn('Failed to write project SSE event', error)
      client.res.end()
      entry.bucket.delete(clientId)
    }
  })
}

app.use(cors({
  origin: buildCorsOriginHandler(config.corsOrigins),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Origin', 'Accept', 'Authorization', 'X-Api-Key'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}))
app.use(express.json({ limit: '10mb' }))
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
  return {
    ...buildAuthState({
      authenticated: true,
      type: 'session',
      role,
      subject: result.session?.subject,
      label: result.session?.label,
      spaces: result.session?.spaces,
      isUnrestricted: result.session?.isUnrestricted,
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

// Decide what a brand-new guest can touch:
//  - a configured globalSpaceId (default: GUEST_SPACES[0], usually 'main') →
//    everyone shares that one editable 'global' space;
//  - globalSpaceId explicitly cleared (null) → each guest gets a private
//    'sandbox' space provisioned on demand.
const resolveGuestSpaces = async (guestId) => {
  const cfg = await configStore.read()
  const globalSpaceId = Object.prototype.hasOwnProperty.call(cfg, 'globalSpaceId')
    ? cfg.globalSpaceId
    : (GUEST_SPACES[0] || null)
  if (globalSpaceId) {
    return [normalizeSpaceId(globalSpaceId) || globalSpaceId]
  }
  const sandboxId = normalizeSpaceId(`sandbox-${guestId.replace(/[^a-z0-9]+/gi, '').slice(0, 16)}`)
  await ensureSpaceScene(sandboxId)
  await upsertSpaceMeta(sandboxId, { label: 'Guest Sandbox', kind: 'sandbox', allowEdits: true, permanent: false })
  return [sandboxId]
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

registerAuthRoutes(router, {
  config,
  createAuthSessionValue,
  setAuthSessionCookie
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
    const ownerId = state.type === 'session' ? state.subject : null
    const ownedSpaceCount = ownerId ? countSpacesOwnedBy(ownerId) : 0
    const canCreateSpace = !config.requireAuth || exempt || (Boolean(ownerId) && ownedSpaceCount < spaceLimit)

    res.json({
      requireAuth: config.requireAuth,
      authenticated: Boolean(state.authenticated),
      type: state.type || null,
      role: state.role || null,
      subject: state.subject || null,
      label: state.label || null,
      spaces: state.spaces,
      isUnrestricted: Boolean(state.isUnrestricted),
      expiresAt: state.session?.expiresAt || null,
      spaceLimit,
      ownedSpaceCount,
      canCreateSpace
    })
  } catch (error) {
    next(error)
  }
})

router.post('/api/auth/session', (req, res) => {
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
    expiresAt: session.expiresAt
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

// Creating a space (POST /api/spaces) is open to any signed-in account; the
// route handler enforces the free-tier quota (and blocks guests/tokens). Space
// *management* (PATCH/DELETE below) stays admin-only.
router.use('/api/spaces/:spaceId', (req, res, next) => {
  req.requiredSpaceId = normalizeSpaceId(req.params.spaceId) || null
  if (['PATCH', 'DELETE'].includes(req.method) && (req.path === '/' || req.path === '')) {
    req.requiredWriteRole = 'admin'
  }
  next()
})

router.use('/api/projects/:projectId', async (req, res, next) => {
  try {
    const project = await resolveProjectContext(req.params.projectId)
    req.requiredSpaceId = project?.spaceId || null
    if (req.method === 'DELETE' && (req.path === '/' || req.path === '')) {
      req.requiredWriteRole = 'admin'
    }
    next()
  } catch (error) {
    next(error)
  }
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

registerStatusRoutes(router, {
  recentEvents,
  releaseInfo,
  startedAt
})

registerUserRoutes(router, {
  requireAdminAlways,
  listUsers,
  findUserById,
  setUserSpaces,
  setUserUnrestricted,
  setUserRole
})

registerSpaceRoutes(router, {
  appendOpsHistory,
  applySceneOps,
  blankScene: BLANK_SCENE,
  broadcastLiveEvent,
  buildMeta,
  config,
  countSpacesOwnedBy,
  spaceLimit: config.freeSpaceLimit,
  grantSpaceToSessionUser,
  deleteSpace,
  ensureSpaceScene,
  ensureSpaceWritable,
  findProjectById,
  findUserById,
  getLiveBucket,
  getPublicAuthState,
  getSpacePaths,
  hydrateSceneAssetManifest,
  canAccessSpace,
  isAuthScopeAllowedForSpace,
  isValidAssetId,
  loadSpaceMeta,
  listSpaces,
  maxOpHistory: MAX_OP_HISTORY,
  normalizeIncomingOps,
  normalizeProjectId,
  normalizeSpaceId,
  requireAdminWrite,
  onDeleteSpace: async (spaceId) => removeProjectIndexEntriesForSpace(SPACES_DIR, spaceId),
  readJson,
  readOpsHistory,
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

registerProjectRoutes(router, {
  appendProjectOps,
  applyProjectOps,
  blankProjectDocument: BLANK_PROJECT_DOCUMENT,
  broadcastProjectLiveEvent,
  buildProjectAssetMeta,
  deleteProjectWithIndex: async (spaceId, projectId) => deleteProject(SPACES_DIR, spaceId, projectId),
  ensureProject,
  ensureSpaceWritable,
  getProjectLiveBucket,
  getProjectPaths,
  isValidAssetId: isValidProjectAssetId,
  listProjectsInSpace,
  maxOpHistory: MAX_OP_HISTORY,
  normalizeIncomingOps,
  normalizeProjectDocument,
  normalizeProjectId,
  normalizeSpaceId,
  readJson,
  readProjectDocument,
  readProjectOps,
  resolveProjectContext,
  spacesDir: SPACES_DIR,
  spaceExists,
  upload,
  upsertProjectMeta,
  writeJson,
  writeProjectDocument
})

registerSyncRoutes(router, {
  config,
  getSpacePaths,
  readJson,
  writeJson,
  upsertSpaceMeta,
})

registerConfigRoutes(router, {
  requireAdminAlways,
  configStore
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
  console.error(err)
  if (err?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'Uploaded file is too large.' })
    return
  }
  if (err?.message === 'Unsupported asset type.') {
    res.status(400).json({ error: err.message })
    return
  }
  res.status(err?.status || 500).json({ error: err.message || 'Server error' })
})

const PORT = config.port

initStorage()
  .then(async () => {
    await ensureDefaultSpace()
    pruneSpaces().catch((error) => console.warn('Failed to prune spaces', error))
    setInterval(() => {
      pruneSpaces().catch((error) => console.warn('Failed to prune spaces', error))
    }, 1000 * 60 * 30)

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
    console.log('[Socket.IO] Initialized for real-time collaboration')

    httpServer.listen(PORT, () => {
      pushEvent('server-started', {
        port: PORT,
        node: process.version,
        releaseId: releaseInfo.releaseId,
        deployEnv: releaseInfo.deployEnv
      })
      console.log(`Server running. Listening on: ${PORT}`)
    })
  })
  .catch((error) => {
    console.error('Failed to initialize storage', error)
    process.exit(1)
  })
