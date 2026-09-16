// The safety net: every change has an author, and can be undone.
//
// Three things live here, because they share one idea — a BURST, the run of
// changes one person makes to one space without stopping for longer than
// `burstGapMs` (15 minutes unless CONTENT_BURST_GAP_MS says otherwise):
//
//  1. beforeChange() — called by every write path before it writes. At the
//     first change of a new burst (a different person, or the same person
//     after a pause) it takes a restore point, so whatever that burst does
//     can be put back. A whole replace (PUT scene/document, sync pull,
//     restore) always takes one, burst or not.
//  2. summarizeChanges() — the op log grouped by author and burst into a
//     plain summary ("+3 images, 1 object removed, title changed"). The
//     GET /changes route, the notice below, and later the proposals flow
//     all read the same one.
//  3. The notice — when someone who does not own the space finishes a burst,
//     ONE signed message goes to the inner bot (config.approval.botUrl +
//     /content-changed) carrying the summary, a link, and the restore point
//     to undo to. Off unless CONTENT_CHANGE_NOTICES_ENABLED is set along with
//     the approval gate's bot URL and secret. It never blocks a write and
//     never throws: a bot that is down costs a message, not an edit.
//
// Bursts are remembered in memory and rebuilt from the op log on a miss, so a
// restart costs at most one extra restore point and — for a burst that was
// still open when the process stopped — its notice.

const crypto = require('node:crypto')
const { createKeyedLock } = require('./asyncLock')
const { publicActor } = require('./opActor')

const DEFAULT_BURST_GAP_MS = 15 * 60 * 1000
const DEFAULT_CHANGES_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const MAX_SUMMARY_ROWS = 5000

const signPayload = (secret, timestamp, rawBody) =>
  crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')

const ADDED = new Set(['addObject', 'createEntity', 'createNode', 'createEdge', 'createMappingSurface', 'createMappingCue'])
const REMOVED = new Set(['deleteObject', 'deleteEntity', 'deleteNode', 'deleteEdge', 'deleteMappingSurface', 'deleteMappingCue'])
const CHANGED = new Set(['updateObject', 'updateEntity', 'updateComponent', 'updateNode', 'reparentNode', 'updateEdge', 'setMappingSurface', 'setMappingCue'])

const kindOf = (op) => {
  const payload = op?.payload || {}
  const item = payload.object || payload.entity || payload.node || null
  const kind = item?.type || item?.kind || null
  return typeof kind === 'string' && kind ? kind.slice(0, 40) : null
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const emptyCounts = () => ({
  added: 0,
  removed: 0,
  changed: 0,
  addedKinds: {},
  assetsAdded: 0,
  assetsRemoved: 0,
  titleChanges: 0,
  sceneReplaced: 0,
  projectsReplaced: 0,
  settings: 0,
  ops: 0
})

const countOp = (counts, op) => {
  const type = op?.type
  counts.ops += 1
  if (ADDED.has(type)) {
    counts.added += 1
    const kind = kindOf(op)
    if (kind) counts.addedKinds[kind] = (counts.addedKinds[kind] || 0) + 1
  } else if (REMOVED.has(type)) counts.removed += 1
  else if (CHANGED.has(type)) counts.changed += 1
  else if (type === 'upsertAsset') counts.assetsAdded += 1
  else if (type === 'deleteAsset') counts.assetsRemoved += 1
  else if (type === 'replaceScene') counts.sceneReplaced += 1
  else if (type === 'replaceDocument') counts.projectsReplaced += 1
  else if (type === 'setProjectMeta') {
    const patch = op?.payload?.patch || {}
    if (Object.prototype.hasOwnProperty.call(patch, 'title')) counts.titleChanges += 1
    else counts.settings += 1
  } else counts.settings += 1
}

// "+3 images, +1 object, 2 changed, 1 removed, title changed" — the words a
// person reads in a Telegram message or a history row.
const describeCounts = (counts) => {
  const parts = []
  const kinds = Object.entries(counts.addedKinds)
  const kindTotal = kinds.reduce((sum, [, n]) => sum + n, 0)
  for (const [kind, n] of kinds) parts.push(`+${plural(n, kind)}`)
  if (counts.added > kindTotal) parts.push(`+${plural(counts.added - kindTotal, 'object')}`)
  if (counts.changed) parts.push(`${counts.changed} changed`)
  if (counts.removed) parts.push(`${plural(counts.removed, 'object')} removed`)
  if (counts.assetsAdded) parts.push(`+${plural(counts.assetsAdded, 'file')}`)
  if (counts.assetsRemoved) parts.push(`${plural(counts.assetsRemoved, 'file')} removed`)
  if (counts.titleChanges) parts.push('title changed')
  if (counts.sceneReplaced) parts.push('whole scene replaced')
  if (counts.projectsReplaced) parts.push(`${plural(counts.projectsReplaced, 'whole project')} replaced`)
  if (counts.settings && !parts.length) parts.push(plural(counts.settings, 'setting'))
  return parts.join(', ') || 'no visible change'
}

function createSpaceHistory({
  getDb,
  takeRestorePoint,
  loadSpaceMeta,
  config = {},
  httpRequest = null,
  logger = console,
  burstGapMs = DEFAULT_BURST_GAP_MS,
  now = () => Date.now()
} = {}) {
  const gap = Number(burstGapMs) > 0 ? Number(burstGapMs) : DEFAULT_BURST_GAP_MS
  const bursts = new Map()
  const withSpaceLock = createKeyedLock()
  const sentNotices = []

  const noticesEnabled = () => Boolean(
    config?.approval?.contentNotices && config.approval.botUrl && config.approval.secret && typeof httpRequest === 'function'
  )

  const lastActivityFromDb = (spaceId) => {
    try {
      const db = getDb()
      const a = db.prepare('SELECT actor, actor_type, actor_label, created_at FROM space_ops WHERE space_id = ? ORDER BY created_at DESC, seq DESC LIMIT 1').get(spaceId)
      const b = db.prepare('SELECT o.actor, o.actor_type, o.actor_label, o.created_at FROM project_ops o JOIN projects p ON p.id = o.project_id WHERE p.space_id = ? ORDER BY o.created_at DESC, o.seq DESC LIMIT 1').get(spaceId)
      const latest = [a, b].filter(Boolean).sort((x, y) => y.created_at - x.created_at)[0]
      if (!latest) return null
      return {
        actor: { actor: latest.actor || 'unknown', type: latest.actor_type || null, label: latest.actor_label || null, role: null },
        startedAt: latest.created_at,
        lastAt: latest.created_at,
        restorePointId: null,
        fromDb: true
      }
    } catch {
      return null
    }
  }

  // ── summary ──────────────────────────────────────────────────────────────

  const readOpRows = (spaceId, since, until) => {
    const db = getDb()
    const upper = Number.isFinite(until) ? until : Number.MAX_SAFE_INTEGER
    const scene = db.prepare(
      'SELECT seq, data, created_at, actor, actor_type, actor_label FROM space_ops WHERE space_id = ? AND created_at > ? AND created_at <= ? ORDER BY created_at ASC, seq ASC LIMIT ?'
    ).all(spaceId, since, upper, MAX_SUMMARY_ROWS).map(row => ({ ...row, projectId: null, projectTitle: null }))
    const project = db.prepare(
      'SELECT o.seq, o.data, o.created_at, o.actor, o.actor_type, o.actor_label, o.project_id AS projectId, p.title AS projectTitle FROM project_ops o JOIN projects p ON p.id = o.project_id WHERE p.space_id = ? AND o.created_at > ? AND o.created_at <= ? ORDER BY o.created_at ASC, o.seq ASC LIMIT ?'
    ).all(spaceId, since, upper, MAX_SUMMARY_ROWS)
    return [...scene, ...project].sort((x, y) => (x.created_at - y.created_at) || (x.seq - y.seq))
  }

  // Groups the op log after `since` (ms) by author and burst. Newest group
  // last, the order things happened in. `actor` narrows to one author.
  const summarizeChanges = (spaceId, { since = null, until = null, actor = null } = {}) => {
    const from = Number.isFinite(Number(since)) && since !== null ? Number(since) : now() - DEFAULT_CHANGES_WINDOW_MS
    const groups = []
    let current = null
    for (const row of readOpRows(spaceId, from, until === null ? null : Number(until))) {
      const key = row.actor || 'unknown'
      if (actor && key !== actor) continue
      if (!current || current.key !== key || row.created_at - current.to > gap) {
        current = {
          key,
          actor: row.actor
            ? { subject: row.actor, type: row.actor_type || null, label: row.actor_label || row.actor }
            : { subject: null, type: null, label: 'Unknown (before authors were recorded)' },
          from: row.created_at,
          to: row.created_at,
          counts: emptyCounts(),
          projects: new Map(),
          scene: false
        }
        groups.push(current)
      }
      current.to = row.created_at
      let op = null
      try { op = JSON.parse(row.data) } catch { op = null }
      countOp(current.counts, op)
      if (row.projectId) current.projects.set(row.projectId, row.projectTitle || row.projectId)
      else current.scene = true
    }
    return groups.map(group => {
      const projects = Array.from(group.projects, ([id, title]) => ({ id, title }))
      const where = [group.scene ? 'scene' : null, ...projects.map(p => p.title)].filter(Boolean).join(', ')
      const text = `${group.actor.label} · ${spaceId}${where ? ` (${where})` : ''} · ${describeCounts(group.counts)}`
      return {
        actor: group.actor,
        from: group.from,
        to: group.to,
        scene: group.scene,
        projects,
        counts: group.counts,
        text
      }
    })
  }

  // ── notice ───────────────────────────────────────────────────────────────

  const isNoticeWorthy = (meta, actor) => {
    if (!meta || !actor) return false
    if (actor.type === 'server') return false
    // Somebody's own sandbox and the communal Open Space stay free: they are
    // where anyone is SUPPOSED to change things (owner's decision 2026-09-16).
    if (meta.kind === 'sandbox' || meta.kind === 'global') return false
    if (meta.ownerUserId) return actor.actor !== meta.ownerUserId
    // No owner: an admin is the owner in all but name.
    return actor.role !== 'admin'
  }

  const buildLink = (meta) => {
    const origin = String(process.env.SITE_ORIGIN || config.siteOrigin || '').replace(/\/+$/, '')
    return `${origin}/${meta.slug || meta.id}`
  }

  // `closedAt` bounds the summary. Not burst.lastAt: that is stamped when the
  // write is ANNOUNCED (beforeChange), and the op row's time is taken a moment
  // later inside the write lock — on a busy machine the burst's last op would
  // fall outside its own notice. Only this author's ops are counted, so
  // reading up to the close is exact.
  const buildNotice = async (spaceId, burst, closedAt = now()) => {
    const meta = await loadSpaceMeta(spaceId)
    if (!isNoticeWorthy(meta, burst.actor)) return null
    const groups = summarizeChanges(spaceId, { since: burst.startedAt - 1, until: closedAt, actor: burst.actor.actor })
    const counts = emptyCounts()
    const projects = new Map()
    let scene = false
    for (const group of groups) {
      for (const [k, v] of Object.entries(group.counts)) {
        if (k === 'addedKinds') {
          for (const [kind, n] of Object.entries(v)) counts.addedKinds[kind] = (counts.addedKinds[kind] || 0) + n
        } else counts[k] += v
      }
      group.projects.forEach(p => projects.set(p.id, p.title))
      scene = scene || group.scene
    }
    if (!counts.ops) return null
    const actor = publicActor(burst.actor)
    const projectList = Array.from(projects, ([id, title]) => ({ id, title }))
    const where = [scene ? 'scene' : null, ...projectList.map(p => p.title)].filter(Boolean).join(', ')
    return {
      kind: 'content.changed',
      id: crypto.randomBytes(12).toString('hex'),
      space: { id: meta.id, label: meta.label || meta.id, slug: meta.slug || null, ownerUserId: meta.ownerUserId || null },
      actor,
      burst: { startedAt: burst.startedAt, endedAt: burst.lastAt },
      summary: {
        text: `${actor.label} · ${meta.label || meta.id}${where ? ` (${where})` : ''} · ${describeCounts(counts)}`,
        counts,
        scene,
        projects: projectList
      },
      link: buildLink(meta),
      undo: burst.restorePointId
        ? { snapshotId: burst.restorePointId, method: 'POST', path: '/api/content-changes/undo', body: { spaceId: meta.id, snapshotId: burst.restorePointId } }
        : null,
      sentAt: now()
    }
  }

  const postNotice = async (payload) => {
    const body = JSON.stringify(payload)
    const ts = String(now())
    const r = await httpRequest(`${config.approval.botUrl}/content-changed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DII-Timestamp': ts,
        'X-DII-Signature': `sha256=${signPayload(config.approval.secret, ts, body)}`
      },
      body,
      timeoutMs: 15000
    })
    return Boolean(r?.ok)
  }

  // Never throws, never awaited by a write.
  const flushNotice = async (spaceId, burst, closedAt = now()) => {
    if (!burst || burst.noticeSent) return
    burst.noticeSent = true
    if (burst.timer) { clearTimeout(burst.timer); burst.timer = null }
    if (!noticesEnabled()) return
    try {
      const payload = await buildNotice(spaceId, burst, closedAt)
      if (!payload) return
      const ok = await postNotice(payload)
      sentNotices.push({ id: payload.id, spaceId, ok })
      if (sentNotices.length > 50) sentNotices.shift()
      if (!ok) logger.warn(`[spaceHistory] the inner bot did not accept the change notice for "${spaceId}"`)
    } catch (error) {
      logger.warn(`[spaceHistory] change notice for "${spaceId}" failed: ${error?.message || error}`)
    }
  }

  const scheduleNotice = (spaceId, burst) => {
    if (!noticesEnabled() || burst.actor?.type === 'server') return
    if (burst.timer) clearTimeout(burst.timer)
    burst.noticeSent = false
    burst.timer = setTimeout(() => { flushNotice(spaceId, burst) }, gap)
    burst.timer.unref?.()
  }

  // ── the hook every write path calls ──────────────────────────────────────

  // Returns the restore point taken for this change, or null when this change
  // continues a burst that already has one. `reason` marks a whole replace,
  // which always gets its own point. A failed restore point before a whole
  // replace throws — that write is exactly what the point exists for — while
  // one before an ordinary op is logged and the op goes ahead.
  const beforeChange = (spaceId, actor, { reason = null } = {}) => withSpaceLock(spaceId, async () => {
    const t = now()
    const previous = bursts.get(spaceId) || lastActivityFromDb(spaceId)
    const newBurst = !previous || previous.actor?.actor !== actor?.actor || t - previous.lastAt > gap
    if (newBurst && previous && !previous.fromDb && !previous.noticeSent) {
      // The person before has stopped — someone else started. Their burst is over.
      flushNotice(spaceId, previous)
    }
    let point = null
    if (reason || newBurst) {
      try {
        point = await takeRestorePoint(spaceId, { reason: reason || 'before-change', actor })
      } catch (error) {
        if (reason) throw error
        logger.warn(`[spaceHistory] restore point before a change to "${spaceId}" failed: ${error?.message || error}`)
      }
    }
    let burst
    if (newBurst) {
      burst = { actor, startedAt: t, lastAt: t, restorePointId: point?.id || null, noticeSent: false, timer: null }
    } else {
      burst = previous
      burst.actor = actor || burst.actor
      burst.lastAt = t
      burst.fromDb = false
      if (!burst.restorePointId && point) burst.restorePointId = point.id
    }
    bursts.set(spaceId, burst)
    scheduleNotice(spaceId, burst)
    return point
  })

  // Send every open notice now — tests, and a clean shutdown.
  const flushAll = async () => {
    await Promise.all(Array.from(bursts.entries()).map(([spaceId, burst]) =>
      burst.noticeSent || burst.fromDb ? null : flushNotice(spaceId, burst)))
  }

  const forget = (spaceId) => {
    const burst = bursts.get(spaceId)
    if (burst?.timer) clearTimeout(burst.timer)
    bursts.delete(spaceId)
  }

  return {
    beforeChange,
    summarizeChanges,
    flushAll,
    forget,
    noticesEnabled,
    burstGapMs: gap,
    // exposed for tests
    _buildNotice: buildNotice,
    _sentNotices: sentNotices
  }
}

module.exports = { createSpaceHistory, describeCounts, signPayload, DEFAULT_BURST_GAP_MS }
