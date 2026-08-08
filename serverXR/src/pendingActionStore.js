// Pending admin actions — the storage half of the approval gate. Companion
// of approvalGate.js, which owns the hashing/executor/reauthorization logic;
// this file only knows how to read and write rows. Modelled on inviteStore.js.
//
// A gated write does not run. It is recorded here, the owner is asked over
// Telegram, and only a matching decision (see decideAction) lets it proceed.
// Expiry and a boot-time recovery pass live in approvalGate.js, which is the
// only other module allowed to touch this table.

const crypto = require('node:crypto')
const { getDb } = require('./db')

const sha256Hex = (value) => crypto.createHash('sha256').update(String(value)).digest('hex')

const constantTimeEqualHex = (a, b) => {
  const bufA = Buffer.from(String(a || ''), 'hex')
  const bufB = Buffer.from(String(b || ''), 'hex')
  if (bufA.length !== bufB.length || bufA.length === 0) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

const rowToPublic = (row) => row && ({
  id: row.id,
  kind: row.kind,
  intentHash: row.intent_hash,
  summary: row.summary || '',
  actor: { subject: row.actor_subject, type: row.actor_type, role: row.actor_role, label: row.actor_label },
  status: row.status,
  decidedBy: row.decided_by || null,
  decidedAt: row.decided_at || null,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  executedAt: row.executed_at || null,
  error: row.error || null
})

// args is stored as-is (already validated by the route handler before this
// is called) and re-parsed at execution time — never trust a value that
// arrives back over the wire from the decision endpoint instead.
function createPendingAction({ id, kind, args, intentHash, summary, actor, requestMethod, requestPath, requestIp, decisionToken, ttlMs }) {
  const now = Date.now()
  getDb().prepare(
    `INSERT INTO pending_actions
      (id, kind, args, intent_hash, summary, actor_subject, actor_type, actor_role, actor_label,
       request_method, request_path, request_ip, status, decision_token_hash,
       notify_status, notify_attempts, created_at, expires_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'queued', 0, ?, ?, ?)`
  ).run(
    id, kind, JSON.stringify(args), intentHash, String(summary || '').slice(0, 500),
    actor?.subject || null, actor?.type || 'unknown', actor?.role || null, actor?.label || null,
    requestMethod, requestPath, requestIp || null, sha256Hex(decisionToken),
    now, now + ttlMs, now
  )
  return getPendingActionRow(id)
}

function getPendingActionRow(id) {
  return getDb().prepare('SELECT * FROM pending_actions WHERE id = ?').get(id)
}

function getPendingAction(id) {
  return rowToPublic(getPendingActionRow(id))
}

// Verifies the decision token against the stored hash. Returns the row (so
// the caller can re-check intentHash/expiry itself) or null if the token is
// wrong — indistinguishable from "not found" to the caller, on purpose.
function verifyDecisionToken(id, decisionToken) {
  const row = getPendingActionRow(id)
  if (!row) return null
  if (!constantTimeEqualHex(sha256Hex(decisionToken), row.decision_token_hash)) return null
  return row
}

// Single conditional UPDATE: a decision can only ever land once. A retry
// (or a genuine duplicate delivery) sees 0 rows changed and the caller
// treats that as "already decided" rather than deciding again.
function decideAction(id, { decision, decidedBy, note }) {
  const now = Date.now()
  const res = getDb().prepare(
    `UPDATE pending_actions
       SET status = ?, decided_by = ?, decided_at = ?, decision_note = ?, updated_at = ?
     WHERE id = ? AND status = 'pending' AND expires_at > ?`
  ).run(decision, decidedBy || null, now, String(note || '').slice(0, 500), now, id, now)
  return res.changes > 0
}

function markExecuted(id, error = null) {
  getDb().prepare(
    'UPDATE pending_actions SET executed_at = ?, error = ?, updated_at = ? WHERE id = ?'
  ).run(Date.now(), error ? String(error).slice(0, 1000) : null, Date.now(), id)
}

function markNotified(id, ok) {
  const now = Date.now()
  if (ok) {
    getDb().prepare(
      "UPDATE pending_actions SET notify_status = 'sent', notify_attempts = notify_attempts + 1, notified_at = ?, updated_at = ? WHERE id = ?"
    ).run(now, now, id)
  } else {
    getDb().prepare(
      "UPDATE pending_actions SET notify_status = 'queued', notify_attempts = notify_attempts + 1, updated_at = ? WHERE id = ?"
    ).run(now, id)
  }
}

function sweepExpired() {
  const now = Date.now()
  const res = getDb().prepare(
    "UPDATE pending_actions SET status = 'expired', updated_at = ? WHERE status = 'pending' AND expires_at <= ?"
  ).run(now, now)
  return res.changes
}

// Approved-but-not-yet-executed rows survive a restart (e.g. a decision
// landed but the process died before `applyIntent` ran). Recovered at boot.
function listApprovedUnexecuted() {
  return getDb().prepare(
    "SELECT * FROM pending_actions WHERE status = 'approved' AND executed_at IS NULL"
  ).all()
}

function listUnnotified() {
  return getDb().prepare(
    "SELECT * FROM pending_actions WHERE status = 'pending' AND notify_status = 'queued' AND notify_attempts < 5"
  ).all()
}

module.exports = {
  createPendingAction,
  getPendingAction,
  getPendingActionRow,
  verifyDecisionToken,
  decideAction,
  markExecuted,
  markNotified,
  sweepExpired,
  listApprovedUnexecuted,
  listUnnotified,
  sha256Hex,
  constantTimeEqualHex
}
