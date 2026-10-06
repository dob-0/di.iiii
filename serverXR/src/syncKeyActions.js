// What a sync key did to projects, and how much more it may do.
// docs/architecture/SPEC_space_sync_keys.md §13.5 (limits) and §13.6 (the log).
//
// A `manage` key may move a project of its space to the trash, make one
// private, and move one between two spaces it manages. A key can leak, so the
// host does not trust the follower's own limits (5 trashes a pass): it counts
// every key's actions here, in the database, so a restart does not hand a
// leaked key a fresh budget. Every attempt — done or refused — is one row, and
// the owner reads them (GET /api/spaces/:id/sync-keys/actions).
//
// No secret is ever written here: key_id is the public half of the token.

const { getDb } = require('./db')

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const KEEP_MS = 180 * DAY

/** Per key. Restore is not limited: it is the undo. */
const LIMITS = Object.freeze({
  trash: Object.freeze({ hour: 10, day: 30, says: 'moved {n} projects to the trash' }),
  move: Object.freeze({ hour: 10, day: 30, says: 'moved {n} projects to another space' }),
  private: Object.freeze({ hour: 30, day: 100, says: 'made {n} projects private' })
})

const ACTIONS = ['trash', 'restore', 'private', 'move', 'undo-restore', 'undo-public', 'undo-move', 'undo-revoke']

let lastPrune = 0
const prune = (now) => {
  if (now - lastPrune < HOUR) return
  lastPrune = now
  try { getDb().prepare('DELETE FROM sync_key_actions WHERE at < ?').run(now - KEEP_MS) } catch { /* never fatal */ }
}

const countDone = (keyId, action, since) => getDb().prepare(
  "SELECT COUNT(*) AS n, MIN(at) AS first FROM sync_key_actions WHERE key_id = ? AND action = ? AND outcome = 'done' AND at >= ?"
).get(keyId, action, since)

/**
 * May this key do one more of `action` now? Reads the log; writes nothing.
 * @returns {{ ok: true } | { ok: false, limit: number, window: 'hour'|'day', retryAfterMs: number, reason: string }}
 */
const checkBudget = ({ keyId, action, now = Date.now() }) => {
  const limit = LIMITS[action]
  if (!limit) return { ok: true }
  for (const [window, span] of [['hour', HOUR], ['day', DAY]]) {
    const max = limit[window]
    const row = countDone(keyId, action, now - span)
    if (row.n >= max) {
      // Frees up when the oldest counted action leaves the window.
      const oldest = getDb().prepare(
        "SELECT at FROM sync_key_actions WHERE key_id = ? AND action = ? AND outcome = 'done' AND at >= ? ORDER BY at ASC LIMIT 1 OFFSET ?"
      ).get(keyId, action, now - span, row.n - max)
      const retryAfterMs = Math.max(0, (oldest?.at ?? now) + span - now)
      const minutes = Math.max(1, Math.ceil(retryAfterMs / 60000))
      return {
        ok: false,
        limit: max,
        window,
        retryAfterMs,
        reason: `this key has ${limit.says.replace('{n}', String(row.n))} in the last ${window === 'hour' ? 'hour' : '24 hours'}, the most a key may (${max}); the space's owner can, or wait ${minutes} min`
      }
    }
  }
  return { ok: true }
}

/** One row. Never throws into the route that called it: the log must not break the action. */
const recordAction = ({ keyId, keyLabel = '', spaceId, action, projectId = null, toSpaceId = null, outcome = 'done', reason = null, now = Date.now() }) => {
  if (!keyId || !spaceId || !action) return
  try {
    getDb().prepare(
      `INSERT INTO sync_key_actions (key_id, key_label, space_id, action, project_id, to_space_id, outcome, reason, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(String(keyId), String(keyLabel || '').slice(0, 80), String(spaceId), String(action), projectId, toSpaceId, String(outcome), reason ? String(reason).slice(0, 300) : null, now)
    prune(now)
  } catch { /* the action stands; the log is best-effort */ }
}

const rowToPublic = (row) => ({
  id: row.id,
  keyId: row.key_id,
  keyLabel: row.key_label,
  spaceId: row.space_id,
  action: row.action,
  projectId: row.project_id || null,
  toSpaceId: row.to_space_id || null,
  outcome: row.outcome,
  reason: row.reason || null,
  at: row.at
})

/** The space's log, newest first: actions IN this space, and moves INTO it. */
const listActions = (spaceId, { keyId = null, limit = 200 } = {}) => {
  const max = Math.max(1, Math.min(1000, Number(limit) || 200))
  const rows = keyId
    ? getDb().prepare('SELECT * FROM sync_key_actions WHERE key_id = ? AND (space_id = ? OR to_space_id = ?) ORDER BY at DESC, id DESC LIMIT ?').all(keyId, spaceId, spaceId, max)
    : getDb().prepare('SELECT * FROM sync_key_actions WHERE space_id = ? OR to_space_id = ? ORDER BY at DESC, id DESC LIMIT ?').all(spaceId, spaceId, max)
  return rows.map(rowToPublic)
}

/** Everything one key did that is still in effect-able order, oldest first — for the undo. */
const doneByKey = (keyId) => getDb().prepare(
  "SELECT * FROM sync_key_actions WHERE key_id = ? AND outcome = 'done' ORDER BY at ASC, id ASC"
).all(keyId).map(rowToPublic)

module.exports = { LIMITS, ACTIONS, checkBudget, recordAction, listActions, doneByKey, HOUR, DAY }
