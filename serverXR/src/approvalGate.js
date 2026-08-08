// The human-approval gate for admin-level writes.
//
// A gated route does not call its store function directly. It calls
// gate.gateOrApply({kind, args, actorState, summary, req}) instead. With the
// gate disabled (the default — APPROVAL_GATE_ENABLED unset) that runs the
// executor immediately and behaves exactly as before this file existed. With
// it enabled, the call is stored as a `pending_actions` row and the route
// returns 202 — nothing runs until a matching decision arrives from di-bo.
//
// Design notes (see docs/architecture — di-bo approval gate plan):
//  - Semantic intent, not request replay. Replaying the stored HTTP request
//    would require re-forging the absent actor's session — a new
//    privilege-granting primitive and the worst possible addition to an auth
//    system. Instead each gated route validates normally, THEN calls this
//    with already-validated args; the executor registry (wired by index.js)
//    calls the same store function the route would have called directly.
//  - intent_hash binds the decision to the exact args. di-bo only ever sees
//    id/summary/intentHash and must echo the hash back — approval for A can
//    never execute B.
//  - Authorization is RE-DERIVED at execution time via the reauthorizers
//    registry, never restored from the actor snapshot. Lost the right during
//    the pending hour → denied, never executes as admin.
//  - Fails closed: bot unreachable → row stays pending, nothing runs, it
//    expires denied at ttlMs. Enabled but unconfigured (no botUrl/secret) →
//    503, no row created at all.

const crypto = require('node:crypto')
const { config } = require('./config')
const { httpRequest } = require('./httpClient')
const logger = require('./logger')
const store = require('./pendingActionStore')

const sha256Hex = (value) => crypto.createHash('sha256').update(String(value)).digest('hex')

// Stable stringify: object keys sorted recursively so the same logical args
// always hash the same way regardless of property insertion order.
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`
}

function computeIntentHash({ kind, args, actorSubject }) {
  return sha256Hex(canonicalJson({ kind, args, actorSubject: actorSubject || null }))
}

function signPayload(secret, timestamp, rawBody) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
}

// Used by the inbound decision route (index.js) — req.rawBody is already
// captured globally by the express.json() verify callback.
function verifyInboundSignature(req) {
  const secret = config.approval.secret
  if (!secret) return false
  const ts = String(req.get('x-dii-timestamp') || '')
  const sig = String(req.get('x-dii-signature') || '').replace(/^sha256=/, '')
  if (!ts || !sig) return false
  // ±5 minutes absorbs clock skew on the bot's side without leaving the
  // window open long enough for a captured signature to be replayed later.
  if (Math.abs(Date.now() - Number(ts)) > 5 * 60 * 1000) return false
  const expected = signPayload(secret, ts, req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {}))
  const a = Buffer.from(sig, 'hex')
  const b = Buffer.from(expected, 'hex')
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b)
}

function createApprovalGate() {
  // Populated by each route module at registration time (registerExecutor),
  // via closures over that module's own already-destructured deps — not
  // re-wired here. Kept keyed by `kind` (not per-request) so a boot-time
  // recovery pass can replay a row without anything from the original request.
  const executors = {}
  const reauthorizers = {}
  const registerExecutor = (kind, fn) => { executors[kind] = fn }
  const registerReauthorizer = (kind, fn) => { reauthorizers[kind] = fn }

  const isEnabled = () => Boolean(config.approval.enabled)
  const isConfigured = () => Boolean(config.approval.enabled && config.approval.botUrl && config.approval.secret)

  async function notifyBot(pending) {
    if (!isConfigured()) return false
    const body = JSON.stringify(pending)
    const ts = String(Date.now())
    try {
      const r = await httpRequest(`${config.approval.botUrl}/approvals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-DII-Timestamp': ts,
          'X-DII-Signature': `sha256=${signPayload(config.approval.secret, ts, body)}`
        },
        body,
        timeoutMs: 15000
      })
      return r.ok
    } catch (e) {
      logger.warn('[approvalGate] notify failed:', e?.message || e)
      return false
    }
  }

  // Route handlers call this in place of the direct store mutation. Returns
  // {applied:true, result} (gate off — unchanged prior behaviour) or
  // {pending:true, id, expiresAt} (gate on — nothing has run yet).
  async function gateOrApply({ kind, args, actorState, summary, req }) {
    if (!executors[kind]) throw new Error(`approvalGate: no executor registered for kind "${kind}"`)
    // Marks the request as having gone through the gate at all — the net
    // (createGatedRequestNet) only cares whether this ran, not what it
    // returned. A 202 "pending" response is the gate working correctly, not
    // a bypass; only a route that skipped calling this entirely should trip it.
    if (req) req.gateCleared = true
    if (!isEnabled()) {
      return { applied: true, result: await executors[kind](args) }
    }
    if (!isConfigured()) {
      const err = new Error('Approval gate is enabled but not configured (APPROVAL_BOT_URL / APPROVAL_SHARED_SECRET missing).')
      err.status = 503
      throw err
    }
    const id = crypto.randomBytes(12).toString('hex')
    const decisionToken = crypto.randomBytes(24).toString('base64url')
    const actorSubject = actorState?.subject || null
    const intentHash = computeIntentHash({ kind, args, actorSubject })
    const row = store.createPendingAction({
      id, kind, args, intentHash, summary,
      actor: { subject: actorSubject, type: actorState?.type || 'unknown', role: actorState?.role || null, label: actorState?.label || actorState?.email || actorSubject },
      requestMethod: req.method,
      requestPath: req.originalUrl || req.path,
      requestIp: req.ip,
      decisionToken,
      ttlMs: config.approval.ttlMs
    })
    const ok = await notifyBot({
      id, kind, summary, intentHash,
      actor: { subject: actorSubject, label: actorState?.label || actorState?.email || actorSubject, role: actorState?.role || null },
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      decisionToken
    })
    store.markNotified(id, ok)
    return { pending: true, id, expiresAt: row.expires_at }
  }

  async function applyIntent(row) {
    let args
    try { args = JSON.parse(row.args) } catch { args = null }
    const reauth = reauthorizers[row.kind]
    try {
      if (reauth) {
        const allowed = await reauth(args, row.actor_subject, row.actor_type)
        if (!allowed) {
          store.markExecuted(row.id, 'actor_no_longer_authorized')
          return { ok: false, error: 'actor_no_longer_authorized' }
        }
      }
      const result = await executors[row.kind](args)
      store.markExecuted(row.id, null)
      return { ok: true, result }
    } catch (e) {
      store.markExecuted(row.id, e?.message || String(e))
      return { ok: false, error: e?.message || String(e) }
    }
  }

  // The inbound decision route (index.js) calls this after verifyInboundSignature
  // has already authenticated the request as genuinely coming from di-bo.
  async function handleDecision({ id, intentHash, decision, decisionToken, decidedBy, note }) {
    if (!['approve', 'deny'].includes(decision)) return { status: 400, body: { error: 'decision must be approve or deny' } }
    const row = store.verifyDecisionToken(id, decisionToken)
    if (!row) return { status: 200, body: { ok: true, status: 'not_found' } } // indistinguishable from wrong-token, on purpose
    if (row.intent_hash !== intentHash) return { status: 409, body: { error: 'intent hash mismatch — refusing to decide' } }
    // Expiry is re-checked here, not only by the periodic sweep — a stalled
    // sweeper must never let a stale approval through.
    if (row.status !== 'pending' || row.expires_at <= Date.now()) {
      return { status: 200, body: { ok: true, status: row.status === 'pending' ? 'expired' : row.status } }
    }
    const status = decision === 'approve' ? 'approved' : 'denied'
    const changed = store.decideAction(id, { decision: status, decidedBy, note })
    if (!changed) {
      // Someone else's decision landed first — report current state, execute nothing.
      const fresh = store.getPendingActionRow(id)
      return { status: 200, body: { ok: true, status: fresh?.status || 'unknown' } }
    }
    if (status === 'denied') return { status: 200, body: { ok: true, status: 'denied' } }
    const fresh = store.getPendingActionRow(id)
    const result = await applyIntent(fresh)
    return { status: 200, body: { ok: true, status: 'approved', executed: result.ok, error: result.error || null } }
  }

  // Boot-time recovery: a decision landed but the process died before
  // execution ran. And a periodic sweep of anything that expired meanwhile.
  async function recoverPendingActions() {
    const rows = store.listApprovedUnexecuted()
    for (const row of rows) {
      logger.warn(`[approvalGate] recovering unexecuted approved action ${row.id} (${row.kind})`)
      await applyIntent(row)
    }
    return rows.length
  }

  function startSweepLoop(intervalMs = 60000) {
    return setInterval(() => {
      try {
        const n = store.sweepExpired()
        if (n) logger.info(`[approvalGate] expired ${n} pending action(s)`)
      } catch (e) {
        logger.warn('[approvalGate] sweep failed:', e?.message || e)
      }
    }, intervalMs).unref()
  }

  return {
    isEnabled,
    isConfigured,
    registerExecutor,
    registerReauthorizer,
    gateOrApply,
    handleDecision,
    recoverPendingActions,
    startSweepLoop,
    computeIntentHash
  }
}

// ── fail-loud net ────────────────────────────────────────────────────────
// Mounted once on the API router (index.js, right after the blanket role
// gates). It does NOT enforce anything by itself — the per-route
// requireAdminAlways etc. already ran, or hasn't, by the time this runs at
// that depth. It only catches the case a gated route was added later and
// someone forgot to call gateOrApply: a 2xx response where the registry says
// a decision was required and none was recorded is refused, turning a silent
// bypass into a loud failure.

// The registry the net matches against. pathTest sees the router-relative
// path (leading `/api/...`), which is why the net must be mounted WITHOUT a
// path prefix — `router.use('/api', net)` would strip `/api` off req.path
// and no pattern here could ever match (that exact bug shipped once; see
// approvalGate.test.js). `bodyTest` on spaces.patch mirrors the "only
// sensitive fields gate" rule in routes/spaceRoutes.js — the net must agree
// with the route on WHEN a response is required to have cleared the gate, or
// every ordinary space edit would trip it.
const SENSITIVE_SPACE_PATCH_FIELDS = ['isPublic', 'publishedProjectId', 'slug', 'openInscriptions', 'ownerUserId', 'kind', 'permanent']
const GATED_ROUTES = [
  { method: 'PATCH', pathTest: (p) => /^\/api\/users\/[^/]+$/.test(p), kind: 'users.patch' },
  { method: 'PATCH', pathTest: (p) => p === '/api/config', kind: 'config.patch' },
  { method: 'POST', pathTest: (p) => p === '/api/admin/sandboxes/purge', kind: 'sandboxes.purge' },
  { method: 'DELETE', pathTest: (p) => /^\/api\/spaces\/[^/]+$/.test(p), kind: 'spaces.delete' },
  { method: 'DELETE', pathTest: (p) => /^\/api\/commons\/assets\/[^/]+$/.test(p), kind: 'commons.asset.delete' },
  {
    method: 'PATCH',
    pathTest: (p) => /^\/api\/spaces\/[^/]+$/.test(p),
    kind: 'spaces.patch',
    bodyTest: (body) => SENSITIVE_SPACE_PATCH_FIELDS.some((f) => body && Object.prototype.hasOwnProperty.call(body, f))
  }
]

function createGatedRequestNet(routeRegistry) {
  return function markGatedRequest(req, res, next) {
    const match = routeRegistry.find(
      (r) => r.method === req.method && r.pathTest(req.path) && (!r.bodyTest || r.bodyTest(req.body))
    )
    if (!match) return next()
    req.gateRequired = match.kind
    // Intercept end/write, NOT writeHead: writeHead runs inside node's own
    // end() when headers are implicit, and calling res.end from there is a
    // recursive end — ERR_INTERNAL_ASSERTION and a crashed response. Here the
    // response is swapped before the original end ever runs.
    const originalWrite = res.write.bind(res)
    const originalEnd = res.end.bind(res)
    const originalWriteHead = res.writeHead.bind(res)
    let blocked = false
    const mustBlock = (statusCode) =>
      !blocked && !res.headersSent && statusCode >= 200 && statusCode < 300 && req.gateRequired && !req.gateCleared
    const block = () => {
      blocked = true
      logger.error(`[approvalGate] BLOCKED unguarded response on gated route ${req.method} ${req.path} (kind=${req.gateRequired}) — a route was added without calling gateOrApply`)
      const body = JSON.stringify({ error: 'approval gate misconfigured — route not wired to gateOrApply' })
      res.statusCode = 500
      res.removeHeader('Content-Length')
      res.removeHeader('ETag')
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Length', Buffer.byteLength(body))
      originalEnd(body)
    }
    res.write = (...args) => {
      if (mustBlock(res.statusCode)) { block(); return true }
      if (blocked) return true
      return originalWrite(...args)
    }
    res.end = (...args) => {
      if (mustBlock(res.statusCode)) { block(); return res }
      if (blocked) return res
      return originalEnd(...args)
    }
    // Explicit res.writeHead(2xx) sends headers before end can intercept —
    // catch that shape too. block() ends with statusCode 500, so the
    // implicit-header call from inside originalEnd passes straight through.
    res.writeHead = (statusCode, ...rest) => {
      if (mustBlock(statusCode)) { block(); return res }
      // Once blocked, the only legitimate caller left is the implicit-header
      // path inside block()'s originalEnd — let it send the 500; swallow any
      // later attempt after headers went out.
      if (blocked && res.headersSent) return res
      return originalWriteHead(statusCode, ...rest)
    }
    next()
  }
}

module.exports = { createApprovalGate, createGatedRequestNet, verifyInboundSignature, computeIntentHash, GATED_ROUTES, SENSITIVE_SPACE_PATCH_FIELDS }
