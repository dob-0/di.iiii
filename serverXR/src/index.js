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
const { createDiskWriteGuard } = require('./diskGuard')
const { ensureDir, readJson, writeJson } = require('./jsonStore')
const { initializeSocket } = require('./socketHandlers')
const { initializeMesh } = require('./meshHub')
const { loadReleaseInfo } = require('./releaseInfo')
const { registerProjectRoutes } = require('./routes/projectRoutes')
const { registerSpaceRoutes } = require('./routes/spaceRoutes')
const { createSpaceIdParam } = require('./routes/spaceIdParam')
const { createKeyedLock } = require('./asyncLock')
const { createSessionDbSync } = require('./sessionDbSync')
const { registerInscriptionRoutes } = require('./routes/inscriptionRoutes')
const { registerOgRoutes } = require('./routes/ogRoutes')
const { registerStatusRoutes } = require('./routes/statusRoutes')
const { registerWorkStatusRoutes } = require('./routes/workStatusRoutes')
const { registerAgentRunRoutes } = require('./routes/agentRunRoutes')
const { registerIntegrationRoutes } = require('./routes/integrationRoutes')
const { registerAiConnectionRoutes } = require('./routes/aiConnectionRoutes')
const { registerAgentBoardRoutes } = require('./routes/agentBoardRoutes')
const { registerAiChatRoutes } = require('./routes/aiChatRoutes')
const { registerUserRoutes } = require('./routes/userRoutes')
const { registerOpenCallRoutes } = require('./routes/openCallRoutes')
const { registerEstateRoutes } = require('./routes/estateRoutes')
const { registerTrackRoutes } = require('./routes/trackRoutes')
const openCallStore = require('./openCallStore')
const {
  listUsers,
  findUserById,
  setUserSpaces,
  setUserUnrestricted,
  setUserRole,
  getUserTokenVersion,
  bumpUserTokenVersion
} = require('./userStore')
const { mintSyncKey, resolveSyncKey, listSyncKeys, revokeSyncKey, PREFIX: syncKeyPrefix } = require('./syncKeyStore')
const { mintInvite, resolveInvite, markInviteUsed, listInvites, revokeInvite } = require('./inviteStore')
const githubApp = require('./githubApp')
const spaceSyncPlan = require('./spaceSyncPlan')
const spaceLinkStore = require('./spaceLinkStore')
const { httpRequest } = require('./httpClient')
const { createRateLimiter, clientKey } = require('./rateLimit')
const { registerSyncRoutes } = require('./routes/syncRoutes')
const { registerAuthRoutes, GUEST_SPACES } = require('./routes/authRoutes')
const { registerConfigRoutes } = require('./routes/configRoutes')
const { createApprovalGate, createGatedRequestNet, verifyInboundSignature, GATED_ROUTES } = require('./approvalGate')
const pendingActionStore = require('./pendingActionStore')
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
// Retention is bounded by age as well as count. Counting alone made how long a
// space or project keeps history — and therefore how long every asset that
// history mentions survives a garbage collection — depend on how busy it is:
// dormant work kept its last ops, and their blobs, permanently. 30 days is far
// longer than any reconnect window (a client that falls outside it resyncs the
// whole document via hasOpGap) and far longer than any retry the idempotency
// guard in POST /ops has to recognise.
const MAX_OP_AGE_MS = 30 * 24 * 60 * 60 * 1000
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
  restoreSpaceProjectDocuments,
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
  // the mark a crossing carries, changed after the fact (proof-gated PUT). Same
  // authority as the unmaking above and reachable from the same places — a rite
  // running on a mirror or an installation laptop is cross-origin to the field.
  { pattern: /\/api\/spaces\/[a-z0-9_-]+\/inscriptions\/insc-[A-Za-z0-9-]+\/mark\/?$/, methods: 'PUT, OPTIONS' },
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
// Before the body parsers: a write the disk can't take should be refused
// before its body is parsed or spooled anywhere.
if (config.minFreeDiskBytes > 0) {
  app.use(createDiskWriteGuard({
    dir: config.directories.dataDir,
    minFreeBytes: config.minFreeDiskBytes
  }))
}
app.use(express.json({ limit: '10mb', verify: (req, _res, buf) => { req.rawBody = buf } }))
app.use(morgan('tiny'))
app.use((req, res, next) => {
  pushEvent('request', { method: req.method, url: req.url })
  next()
})

const router = express.Router()
router.use(express.static(PUBLIC_DIR))

// `di up` sets DI_LOCAL=1. Read at request time rather than at boot so tests
// can toggle it, which is why it is a function and not a constant.
const isLocalInstall = () => process.env.DI_LOCAL === '1'

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

// Guest subjects never have a user row, so skip the query for them entirely —
// this runs on every request that carries a session cookie.
const lookupSessionTokenVersion = (subject) => {
  if (!subject || isGuestSubject(subject)) return null
  try {
    return getUserTokenVersion(subject)
  } catch {
    return null
  }
}

const readAuthSession = (req) => {
  const value = readCookie(req.get('cookie') || '', config.authSession.cookieName)
  const result = verifyAuthSessionValue(value, {
    secret: config.auth.sessionSecret,
    lookupTokenVersion: lookupSessionTokenVersion
  })
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

// The cookie's Max-Age must be the SAME ttl the session payload was minted
// with. It used to always stamp config.authSession.ttlMs (12h) while guest
// sessions were minted for GUEST_SESSION_TTL_MS (7 days) — so the browser
// dropped the cookie overnight and every returning guest came back as a
// brand-new subject: new sandbox, and any space grant redeemed from an
// invite gone with it. Callers minting anything other than an account
// session MUST pass the ttl they used; the default only covers the
// account/OAuth sessions that genuinely claim config.authSession.ttlMs.
const setAuthSessionCookie = (res, value, ttlMs = config.authSession.ttlMs) => {
  res.setHeader('Set-Cookie', serializeAuthSessionCookie(value, {
    name: config.authSession.cookieName,
    path: config.authSession.cookiePath,
    secure: config.authSession.cookieSecure,
    ttlMs
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
          isUnrestricted: Boolean(user.isUnrestricted),
          tokenVersion: user.tokenVersion
        }
      })
      setAuthSessionCookie(res, session.value)
      req.authState = { ...req.authState, spaces: nextSpaces }
    } catch { /* non-fatal — DB grant still applied */ }
  }
}

// The guest cookie lives as long as the guest sandbox's idle TTL
// (config.sandboxTtlMs, 7 days by default). It used to claim 30 days while
// the sweep archived the sandbox at 7 idle and guest snapshots are never
// revived — so a guest returning on day 10 carried a valid cookie scoped to
// a room that had already been emptied. A promise the sweep can't keep is
// worse than a shorter one it can. The one-hour floor keeps a test-tuned
// SANDBOX_TTL_MS (contract fixtures use 1ms to make sandboxes instantly
// stale) from minting cookies that expire before their first request lands.
const GUEST_SESSION_TTL_MS = Math.max(config.sandboxTtlMs, 60 * 60 * 1000)

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
  setAuthSessionCookie(res, result.value, GUEST_SESSION_TTL_MS)
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
// A separate multer from `upload`: the asset filter is an allow-list of media
// types, and a space bundle is none of them. Its own filter (the two names a
// bundle is ever written under) and its own destination, so a rejected upload
// never lands anywhere the asset pipeline looks.
const bundleUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-bundle.diiii`)
  }),
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase()
    if (name.endsWith('.diiii') || name.endsWith('.space-bundle.tar.gz') || name.endsWith('.tar.gz')) {
      cb(null, true)
      return
    }
    cb(new Error('Not a di.iiii file. Save one with `di save`, or from the Spaces page.'))
  }
})

// Uploads are keyed per PERSON, not per address. A venue — a classroom, a
// gallery, a day camp — is a dozen people behind one NAT, so an address key
// gave the whole room a single 60-per-10-minutes budget and the first few
// uploaders spent everyone's. Every browser caller has a subject by the time
// this runs (the authState middleware issues/reads the session cookie before
// any route), guests included; the address key stays as the fallback for
// callers with no subject at all, so an anonymous flood is still bounded.
// With REQUIRE_AUTH off, getPublicAuthState hands EVERY caller the same
// 'auth-disabled' sentinel subject — keying on that would put a whole server
// in one bucket, strictly worse than the address. Type 'disabled' is not a
// person, so it falls back with the anonymous callers.
const uploadKey = (req) => {
  const state = req.authState
  const subject = state && state.type !== 'disabled' ? state.subject : null
  return subject ? `subject:${subject}` : `addr:${clientKey(req)}`
}
const uploadLimiter = createRateLimiter({
  windowMs: 10 * 60_000,
  max: 60,
  name: 'uploads',
  keyFn: uploadKey,
  scope: 'from this session'
})
// pull/push do real disk I/O plus an outbound HTTP call to the configured
// live server, with no limiter previously — same class of gap the upload
// route already had one for (audit finding #9).
const syncLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 30, name: 'space sync' })
const openCallSubmitLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 20, name: 'open-call applications' })
// Generous like the guest cap above (one NAT can be a whole venue) — a real
// visit fires 1-2 events, so this only bounds deliberate table-filling.
const trackEventLimiter = createRateLimiter({ windowMs: 60_000, max: 60, name: 'track events' })

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
              session: { subject: state.subject, label: state.label, role: dbRole, spaces: dbSpaces, isUnrestricted: dbUnrestricted, tokenVersion: dbUser.tokenVersion }
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
      // One boolean, read at request time so tests can toggle it: this server
      // is a `di up` install on the artist's own machine (the CLI runner sets
      // DI_LOCAL=1). The client uses it to stop speaking hosted-product copy
      // ("sign in to edit", space quotas) to someone who owns the whole disk.
      local: isLocalInstall(),
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
      // null, not 3, on a local install. The comment above promises this page
      // stops speaking quotas to someone who owns the disk, and canCreateSpace
      // already ignores the limit here (requireAuth is off) — but the number
      // was still sent, and SpaceHub renders it: "+ Create · 0/3" on a machine
      // with no quota at all. SpaceHub already guards on Number.isFinite, so
      // null is the value that makes the counter disappear rather than a
      // second branch in the client.
      spaceLimit: isLocalInstall() ? null : spaceLimit,
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
  // Clearing the cookie only ends the session on this browser; the signed
  // payload stays valid until its TTL, so a copy of it kept anywhere else
  // survived logout. Bumping the account's token_version is what actually
  // revokes it — on every device at once. Subjects with no user row (guests,
  // API-token identities) have nothing to bump and just lose the cookie.
  const state = readAuthSession(req)
  if (state.authenticated && state.subject && !isGuestSubject(state.subject)) {
    try { bumpUserTokenVersion(state.subject) } catch { /* no user row — clearing the cookie is the whole logout */ }
  }
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
  if (state.type !== 'session') return false
  // A sandbox carries no ownerUserId on purpose (it must not count toward the
  // owned-space quota — see ensureOwnSandbox), so ownership is derived from
  // the id instead, or an account would be locked out of its own sandbox.
  if (meta?.kind === 'sandbox' && meta.id && !isGuestSubject(state.subject) &&
    meta.id === getOwnSandboxSpaceId(state.subject)) return true
  return Boolean(meta?.ownerUserId) && meta.ownerUserId === state.subject
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
    if (!meta) {
      // A space that was never created answers 404, not a scope error — so
      // the client can tell a mistyped address from a locked door (the
      // restricted card used to say "your session isn't scoped to 'br_id_gr'"
      // about a typo). Existence is not a secret here: space ids live in
      // public URLs, and the auth-off mode has always answered 404 for these.
      return res.status(404).json({ error: 'Space not found.' })
    }
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

// ── the approval gate ────────────────────────────────────────────────────
// One instance, shared by every gated route below. Each route module (user/
// config/space routes) registers its own executor + reauthorizer closures at
// setup time via approvalGate.registerExecutor/registerReauthorizer — see
// approvalGate.js for why (recovery after a restart needs to look an
// executor up by kind, independent of any single request).
const approvalGate = createApprovalGate()

// Re-derives a role from the CURRENT database/config state for a given actor
// — never trusts the role captured in the actor snapshot at request time.
// Covers both identity shapes that can reach an admin-gated route: a real
// session/account (subject == users.id) and a static bearer-token identity
// (ADMIN_API_TOKEN etc. — subject is the configured token subject, e.g.
// "admin"; there is no DB row, so config.auth.identities is the source of
// truth). Anything else (guest, sync-key) can never legitimately be admin.
function currentRoleForActor(actorType, actorSubject) {
  if (!actorSubject) return null
  // getPublicAuthState treats EVERY request as admin when config.requireAuth
  // is false (type 'disabled', subject 'auth-disabled') — every other admin
  // gate in this file (requireAdminAlways etc.) already short-circuits the
  // same way. Re-authorization has to agree, or a self-hosted no-auth
  // deployment would see every gated action denied at execution time no
  // matter who approved it — the opposite of what "auth is off" means here.
  if (actorType === 'disabled') return 'admin'
  if (actorType === 'session') {
    try {
      const user = findUserById(actorSubject)
      return user ? normalizeAuthRole(user.role, null) : null
    } catch { return null }
  }
  if (actorType === 'token') {
    const identity = config.auth.identities.find((i) => i.subject === actorSubject)
    return identity ? normalizeAuthRole(identity.role, null) : null
  }
  return null
}
const requireAdminNow = (args, subject, actorType) => hasRequiredAuthRole(currentRoleForActor(actorType, subject), 'admin')
approvalGate.registerReauthorizer('users.patch', requireAdminNow)
approvalGate.registerReauthorizer('config.patch', requireAdminNow)
approvalGate.registerReauthorizer('sandboxes.purge', requireAdminNow)
approvalGate.registerReauthorizer('commons.asset.delete', requireAdminNow)
// spaces.patch/spaces.delete are owner-or-admin, not admin-only — re-derived
// against the space's CURRENT ownership, which may have changed during the
// pending hour (e.g. the owner transferred it, or lost their account).
async function currentlyOwnerOrAdmin(spaceId, actorType, actorSubject) {
  if (hasRequiredAuthRole(currentRoleForActor(actorType, actorSubject), 'admin')) return true
  if (actorType !== 'session') return false
  const meta = await loadSpaceMeta(spaceId).catch(() => null)
  if (!meta) return false
  if (meta.kind === 'sandbox' && meta.id && !isGuestSubject(actorSubject) && meta.id === getOwnSandboxSpaceId(actorSubject)) return true
  return Boolean(meta.ownerUserId) && meta.ownerUserId === actorSubject
}
approvalGate.registerReauthorizer('spaces.patch', (args, subject, actorType) => currentlyOwnerOrAdmin(args?.spaceId, actorType, subject))
approvalGate.registerReauthorizer('spaces.delete', (args, subject, actorType) => currentlyOwnerOrAdmin(args?.spaceId, actorType, subject))

// ── One-click GitHub sync: webhook receiver (signature-authed, pre-gate) ──────
// Default loopback works on a normal TCP listen; under Passenger (cPanel) the app
// is fronted by a Unix socket and nothing binds config.port, so SELF_API_URL must
// point at the server's own public origin (e.g. https://di-studio.xyz/serverXR).
const internalApiBase = () =>
  process.env.SELF_API_URL?.replace(/\/$/, '') || `http://127.0.0.1:${config.port}${config.basePath || ''}`
const internalHeaders = () => ({ 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${config.internalApiToken}` })

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
      Authorization: `Bearer ${config.internalApiToken}`,
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
  // The PUT below is a full no-baseVersion replace, so `doc` MUST be the real
  // current document. Swallowing a failed GET into {} used to publish an empty
  // base -- assets, projectMeta and owner opt-ins (deviceAccess) wiped, sync
  // still reporting success. Fail the sync run instead.
  const curRes = await httpRequest(docUrl, { headers: internalHeaders() })
    .catch((error) => { throw new Error(`internal document GET failed (${error.message})`) })
  if (!curRes.ok) throw new Error(`internal document GET failed (${curRes.status})`)
  const put = await httpRequest(docUrl, {
    method: 'PUT', headers: internalHeaders(),
    body: JSON.stringify(spaceSyncPlan.buildSyncedDocumentBody({ current: await curRes.json(), codeFiles }))
  })
  if (!put.ok) throw new Error(`internal document PUT failed (${put.status})`)
  // Non-fatal (the document is already published) but never silent: a dropped
  // publishedProjectId leaves the space pointing at the wrong project.
  const patch = await httpRequest(`${base}/api/spaces/${link.spaceId}`, {
    method: 'PATCH', headers: internalHeaders(),
    body: JSON.stringify({ publishedProjectId: link.projectId })
  }).catch((error) => ({ ok: false, status: error.message }))
  if (!patch.ok) {
    console.warn(`[github-sync] publishedProjectId PATCH failed for ${link.spaceId} (${patch.status})`)
  }
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

// di-bo posts the owner's Telegram decision here. Signature-authed (same
// shape as the GitHub webhook above), not session-authed — di-bo has no
// di.iiii account. Pre-gate on purpose: it must work even when the gate
// itself is what's blocking every other /api route for this actor.
router.post('/api/approvals/decision', async (req, res) => {
  if (!verifyInboundSignature(req)) {
    return res.status(401).json({ error: 'Invalid or missing signature.' })
  }
  const { id, intentHash, decision, decisionToken, decidedBy, note } = req.body || {}
  if (!id || !intentHash || !decisionToken) {
    return res.status(400).json({ error: 'id, intentHash and decisionToken are required.' })
  }
  const outcome = await approvalGate.handleDecision({ id, intentHash, decision, decisionToken, decidedBy, note })
  res.status(outcome.status).json(outcome.body)
})

// A space's public slug resolves to its real id here, once, for every route
// on this router matching `:spaceId` (spaceRoutes, projectRoutes, syncRoutes,
// inscriptionRoutes) — an id always wins, so a slug can never shadow another
// space's id. Everything downstream (route handlers, req.requiredSpaceId
// below, response bodies) already reads req.params.spaceId as the real id.
router.param('spaceId', createSpaceIdParam({ normalizeSpaceId, spaceExists, findSpaceBySlug }))

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

// Public, unauthenticated ingest + admin-only aggregates: anonymous usage
// counts (no IP/UA/cookie/id — see trackRoutes.js). Registered before the
// /api auth gates below because a visitor's first page view precedes any
// session; the stats route carries its own requireAdminAlways gate.
registerTrackRoutes(router, {
  trackLimiter: trackEventLimiter,
  requireAdminAlways
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
// Public, unauthenticated, and registered before the /api gates: a crawler
// carries no session and must still get a card.
// A URL segment is not a space id. `br_id_ge` is the handle people share; the
// space's id is `br-id-ge`, and loadSpaceMeta is an exact selectById — so the
// og route resolved nothing for the one link this was built for and served the
// platform tile. Same resolver the /api/resolve middleware above uses: slug
// first, then the normalized id.
registerOgRoutes(router, {
  loadSpaceMeta: async (segment) =>
    (await findSpaceBySlug(segment)) || (await loadSpaceMeta(normalizeSpaceId(segment) || segment)),
  siteOrigin: process.env.SITE_ORIGIN || '',
})

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
  maxOpAgeMs: MAX_OP_AGE_MS,
  normalizeSpaceId,
  readJson,
  withSpaceOpsLock: sharedSpaceOpsLock,
  upsertSpaceMeta,
  writeJson,
  // Shared with di.bo. Unset on both sides = the tunnel does not exist; unset
  // here alone = the mint 404s and no link is ever handed out, which is the
  // safe direction to fail in.
  tunnelSecret: process.env.TUNNEL_SHARED_SECRET || '',
  tunnelBotUsername: process.env.TUNNEL_BOT_USERNAME || 'diiii111bot'
})

router.use('/api', requireReadRole('viewer'))
router.use('/api', requireWriteRole('editor'))
// Must run after the two lines above (role/scope already enforced by the
// time this sees the request) and before every route registration below —
// see approvalGate.js for why this can only ever be a net, not enforcement.
// Mounted WITHOUT a path prefix on purpose: `router.use('/api', …)` would
// make Express strip `/api` off req.path inside the net, so the registry's
// `^/api/…` patterns could never match and the net would be inert. Mounted
// bare, req.path is the router-relative path (`/api/users/42`) under every
// mount target (/, /serverXR). Regression: approvalGate.test.js.
router.use(createGatedRequestNet(GATED_ROUTES))

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

registerWorkStatusRoutes(router, {})
registerAgentRunRoutes(router, {})

registerIntegrationRoutes(router)
registerAiConnectionRoutes(router)

registerAgentBoardRoutes(router)

registerAiChatRoutes(router)

registerEstateRoutes(router, {
  requireAdminAlways,
  estateMapPath: config.directories.estateMapPath
})

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
  setUserRole,
  approvalGate
})

// Throttle asset uploads only (POST); asset reads on the same path stay free.
router.use('/api/spaces/:spaceId/assets', (req, res, next) =>
  req.method === 'POST' ? uploadLimiter(req, res, next) : next())

const { replaceSceneAndBroadcast } = registerSpaceRoutes(router, {
  appendOpsHistory,
  applySceneOps,
  blankScene: BLANK_SCENE,
  broadcastLiveEvent,
  broadcastProjectLiveEvent,
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
  maxOpAgeMs: MAX_OP_AGE_MS,
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
  restoreSpaceProjectDocuments,
  saveSpaceMeta,
  serveAsset,
  setUserSpaces,
  spacesDir: SPACES_DIR,
  spaceExists,
  upsertSpaceMeta,
  upload,
  bundleUpload,
  writeJson,
  approvalGate
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
      // Minted with GUEST_SESSION_TTL_MS above — the cookie has to say the
      // same, or the grant this invite just handed out expires with the
      // cookie long before the payload it is written into does.
      setAuthSessionCookie(res, session.value, GUEST_SESSION_TTL_MS)
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
  // Anonymous guests carry the SAME signed session cookie as accounts and
  // resolve to type 'session' on every request after issuance — so a type-only
  // test is a no-op for them, and this route's "same audience that can see
  // linked spaces in admin" scoping leaked the App's whole repo list to any
  // visitor who had merely loaded a page. Identify by subject, as every other
  // guest check in the codebase does.
  const isGuest = state.type === 'guest' || isGuestSubject(state.subject)
  if (state.authenticated && !isGuest && (state.type === 'session' || state.role === 'admin')) return true
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
    // requireSpaceOwnerOrAdmin above proves the caller owns the space in the
    // URL — it says nothing about the projectId in the BODY. Without this
    // check any signed-in account could point their own space's link at a
    // stranger's project, and syncLinkedSpace (below) then writes that repo's
    // contents into it using the server's own credentials. Scope the lookup to
    // the space: loadProjectMeta selects on (id AND space_id), so a project
    // belonging to anyone else simply is not found.
    const linkedProject = await loadProjectMeta(SPACES_DIR, ctx.spaceId, normalizeProjectId(projectId) || projectId)
    if (!linkedProject) return res.status(404).json({ error: 'Project not found in this space.' })
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
  maxOpAgeMs: MAX_OP_AGE_MS,
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
  loadSpaceMeta,
  snapshotSpaceScene,
})

// Admin sweep for the hub's collapsed sandbox row: remove guest sandboxes the
// TTL has already expired — the same thing the 30-minute timer does, on demand.
approvalGate.registerExecutor('sandboxes.purge', async () => {
  const removed = await pruneStaleSandboxes()
  const archived = await archiveIdleAccountSandboxes()
  return { removed: removed.length, archived: archived.length }
})
router.post('/api/admin/sandboxes/purge', requireAdminAlways, async (req, res, next) => {
  try {
    const outcome = await approvalGate.gateOrApply({
      kind: 'sandboxes.purge',
      args: {},
      actorState: req.authState,
      summary: 'purge stale/idle sandboxes',
      req
    })
    if (outcome.pending) {
      return res.status(202).json({ status: 'pending_approval', approvalId: outcome.id, expiresAt: outcome.expiresAt })
    }
    res.json({ ok: true, ...outcome.result })
  } catch (error) {
    next(error)
  }
})

registerConfigRoutes(router, {
  requireAdminAlways,
  configStore,
  // Repointing globalSpaceId moves the communal grant and ensures the new
  // open space exists.
  onConfigChanged: () => ensureOpenSpace(),
  approvalGate,
  requireAuth: config.requireAuth
})

const mountTargets = new Set([config.mountPath])
if (!mountTargets.has('/serverXR')) {
  mountTargets.add('/serverXR')
}
mountTargets.forEach((targetPath) => {
  const normalizedTarget = targetPath || '/'
  app.use(normalizedTarget, router)
})

// ── the SPA, when this process is also the web server ──
// Only for a local `di` install (CLIENT_DIR set). In the deployed topology nginx
// serves dist/ and this block never runs, so the API's shape is unchanged.
//
// Order matters and is the whole trick: this sits AFTER the router mounts above,
// so /serverXR/api/* is already answered and can never fall through to index.html.
const CLIENT_DIR = config.directories.clientDir
if (CLIENT_DIR) {
  app.use(express.static(CLIENT_DIR))

  app.get(/.*/, (req, res, next) => {
    // Anything the API owns is not ours, even unmatched — a wrong URL under the
    // API must 404 as an API, not hand back an HTML page a fetch() can't parse.
    if (req.path.startsWith('/serverXR') || req.path.startsWith('/api')) {
      next()
      return
    }
    // A request for a real file that express.static already declined is a 404,
    // not the app: serving index.html for /assets/missing.js turns a cache miss
    // into a JS syntax error thrown from inside the page.
    if (path.extname(req.path)) {
      next()
      return
    }
    // `root` + a relative name, never sendFile(absolutePath). With no root,
    // send applies its dotfiles:'ignore' rule to every segment of the absolute
    // path — and the default install lives in ~/.di, so a hidden directory in
    // the path 404s the entire app. Relative to root, there is no dot segment.
    res.sendFile('index.html', { root: CLIENT_DIR })
  })

  logger.info(`[client] serving the built app from ${CLIENT_DIR}`)
}

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
    // A decision can land, then the process dies before executing it. Catch
    // up on boot rather than leaving an approved action stuck forever.
    if (approvalGate.isEnabled()) {
      const recovered = await approvalGate.recoverPendingActions()
      if (recovered) logger.info(`[approvalGate] recovered ${recovered} approved-but-unexecuted action(s)`)
    }
    approvalGate.startSweepLoop()
    pruneSpaces().catch((error) => logger.warn('Failed to prune spaces', error))
    setInterval(() => {
      pruneSpaces().catch((error) => logger.warn('Failed to prune spaces', error))
    }, 1000 * 60 * 30)
    // Daily snapshot of the open space — its scene and its project documents,
    // which is where the jam's contributions actually live. Vandalism
    // insurance (admin restores via POST /api/spaces/:id/restore-snapshot).
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
      lookupTokenVersion: lookupSessionTokenVersion,
      getFreshDbIdentity,
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

    httpServer.listen(PORT, config.host, () => {
      pushEvent('server-started', {
        port: PORT,
        host: config.host,
        node: process.version,
        releaseId: releaseInfo.releaseId,
        deployEnv: releaseInfo.deployEnv
      })
      logger.info(`Server running. Listening on: ${config.host}:${PORT}`)
    })
  })
  .catch((error) => {
    logger.error('Failed to initialize storage', error)
    process.exit(1)
  })
