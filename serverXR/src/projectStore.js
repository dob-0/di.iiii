const path = require('node:path')
const fsp = require('node:fs/promises')
const { ensureDir, readJson, writeJson } = require('./jsonStore')
const { getDb } = require('./db')
const { loadSharedModule } = require('./sharedRuntime')
const { isValidAssetId } = require('./assetHash')
const {
  defaultProjectDocument,
  normalizeProjectDocument
} = loadSharedModule('projectSchema.cjs')

const PROJECTS_DIRNAME = 'projects'
const PROJECT_META_FILE = 'project.json'
const PROJECT_DOCUMENT_FILE = 'document.json'
const PROJECT_OPS_FILE = 'ops.json'

const PROJECT_ID_REGEX = /^[a-z0-9-]{3,64}$/

const safeSlug = (value = '') => String(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 64)

const normalizeProjectId = (value) => {
  const slug = safeSlug(value)
  return (slug && PROJECT_ID_REGEX.test(slug)) ? slug : null
}

// Public handle, independently renameable from the immutable id — see
// docs/architecture/SPEC_space_urls_and_portability.md. Unlike space slugs,
// project slugs only need to be unique within their own space (the public
// link shape is /{spaceSlugOrId}/{projectSlugOrId}), and are additionally
// blocked from every top-level app word — spaceRouting.js drops a reserved
// segment in that position, so a project slug matching one is unreachable at
// its own address. One shared list: shared/reservedSegments.cjs.
const { RESERVED_PROJECT_SLUGS: PROJECT_RESERVED_SLUGS } = require('../../shared/reservedSegments.cjs')
const normalizeProjectSlug = (value) => {
  if (value === null || value === undefined || value === '') return null
  const slug = safeSlug(value)
  return (slug && PROJECT_ID_REGEX.test(slug)) ? slug : undefined
}
const isReservedProjectSlug = (slug) => PROJECT_RESERVED_SLUGS.has(slug)

const rowToMeta = (row) => !row ? null : ({
  id: row.id,
  spaceId: row.space_id,
  slug: row.slug || null,
  title: row.title,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastTouchedAt: row.last_touched_at,
  documentVersion: row.document_version,
  source: row.source,
  // Which shelf, where on it, and what it is. See collectionStore.js.
  collectionId: row.collection_id || null,
  position: row.position ?? 0,
  state: row.state || 'live',
  // Who may see it inside its space — see PROJECT_VISIBILITIES below.
  visibility: normalizeProjectVisibility(row.visibility),
  deletedAt: row.deleted_at || null
})

// What a project can be. 'live' is the default and what every existing project
// became on migration; nothing is hidden by this landing.
const PROJECT_STATES = ['draft', 'live', 'archived']
const isProjectState = (value) => PROJECT_STATES.includes(value)

// Who may see a project INSIDE its space. The space's own isPublic decides
// whether a visitor reaches the space at all; this decides, per project,
// whether a visitor who reached it sees this one. 'public' is the default and
// means "as visible as its space" — every project that existed before this
// column reads 'public', so nothing that was on show changes. 'private' means
// only the space's members (anyone whose session may read the space when it
// is NOT public — canAccessSpace) see it; to everyone else it does not exist
// (404, never 401/403). A 'public' project in a private space is still
// private: the space gate runs first. docs/architecture/SPEC_project_visibility.md.
const PROJECT_VISIBILITIES = ['public', 'private']
const isProjectVisibility = (value) => PROJECT_VISIBILITIES.includes(value)
const normalizeProjectVisibility = (value) => (value === 'private' ? 'private' : 'public')
const isPrivateProject = (meta) => normalizeProjectVisibility(meta?.visibility) === 'private'

// How long deleted work waits before anything touches the bytes. Thirty days is
// the same promise the sandbox sweep makes, and long enough that "I deleted the
// wrong thing" is recoverable on the timescale a person actually notices.
const TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000

const buildProjectMeta = (spaceId, projectId, overrides = {}) => {
  const now = Date.now()
  return {
    id: projectId,
    spaceId,
    slug: overrides.slug || null,
    title: (typeof overrides.title === 'string' && overrides.title.trim()) || 'Untitled Project',
    createdAt: overrides.createdAt || now,
    updatedAt: now,
    lastTouchedAt: now,
    documentVersion: Number.isFinite(Number(overrides.documentVersion)) ? Number(overrides.documentVersion) : 0,
    source: overrides.source || 'project',
    // A new project is loose on no shelf, at the end of the order, and live —
    // the same three answers rowToMeta gives for a row written before any of
    // these columns existed, so a created project and a migrated one report
    // themselves identically.
    collectionId: overrides.collectionId || null,
    position: Number.isFinite(Number(overrides.position)) ? Number(overrides.position) : 0,
    state: isProjectState(overrides.state) ? overrides.state : 'live',
    visibility: normalizeProjectVisibility(overrides.visibility),
    deletedAt: null
  }
}

const getSpaceProjectsDir = (spacesDir, spaceId) => path.join(spacesDir, spaceId, PROJECTS_DIRNAME)

const getProjectPaths = (spacesDir, spaceId, projectId) => {
  const projectsDir = getSpaceProjectsDir(spacesDir, spaceId)
  const projectDir = path.join(projectsDir, projectId)
  return {
    projectsDir,
    projectDir,
    metaPath: path.join(projectDir, PROJECT_META_FILE),
    documentPath: path.join(projectDir, PROJECT_DOCUMENT_FILE),
    opsPath: path.join(projectDir, PROJECT_OPS_FILE),
    assetsDir: path.join(projectDir, 'assets')
  }
}

// Prepared statements cached per DB instance (auto-resets when DB is replaced, e.g. in tests)
let _s = null
let _dbRef = null
const s = () => {
  const db = getDb()
  if (_s && _dbRef === db) return _s
  _dbRef = db
  _s = {
    selectById:       db.prepare('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL'),
    selectBySpace:    db.prepare('SELECT * FROM projects WHERE id = ? AND space_id = ? AND deleted_at IS NULL'),
    // The trash's own lookups deliberately see what the rest cannot.
    selectAnyById:    db.prepare('SELECT * FROM projects WHERE id = ?'),
    // Ordered by the shelf, then by hand, then by recency — a project that has
    // never been dragged keeps exactly the order it had before collections.
    selectBySpaceAll: db.prepare('SELECT * FROM projects WHERE space_id = ? AND deleted_at IS NULL ORDER BY position ASC, updated_at DESC'),
    // A project that went to the trash WITH its space (same stamp) belongs to
    // the space's entry in the trash, not to this list: restoring it alone would
    // put live work inside a space nobody can open.
    selectTrashed:    db.prepare('SELECT p.* FROM projects p WHERE p.deleted_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM spaces s WHERE s.id = p.space_id AND s.deleted_at IS NOT NULL) ORDER BY p.deleted_at DESC'),
    selectTrashedInSpace: db.prepare('SELECT p.* FROM projects p WHERE p.space_id = ? AND p.deleted_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM spaces s WHERE s.id = p.space_id AND s.deleted_at IS NOT NULL) ORDER BY p.deleted_at DESC'),
    selectPurgeable:  db.prepare('SELECT * FROM projects WHERE deleted_at IS NOT NULL AND deleted_at < ?'),
    softDelete:       db.prepare('UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?'),
    restore:          db.prepare('UPDATE projects SET deleted_at = NULL, updated_at = ? WHERE id = ?'),
    setShelf:         db.prepare('UPDATE projects SET collection_id = ?, updated_at = ? WHERE id = ?'),
    setPosition:      db.prepare('UPDATE projects SET position = ?, updated_at = ? WHERE id = ?'),
    setState:         db.prepare('UPDATE projects SET state = ?, updated_at = ? WHERE id = ?'),
    setVisibility:    db.prepare('UPDATE projects SET visibility = ?, updated_at = ? WHERE id = ?'),
    selectBySlug:     db.prepare('SELECT * FROM projects WHERE space_id = ? AND slug = ?'),
    // scripts/project-move.mjs writes one row per move; the resolver below
    // reads the latest one for a given (old space, old id-or-slug).
    selectLatestMove: db.prepare('SELECT * FROM project_moves WHERE from_space = ? AND (project_id = ? OR old_slug = ?) ORDER BY moved_at DESC LIMIT 1'),
    // The index is what resolves a project id to its space, so a trashed
    // project must be absent from it — otherwise its url keeps working after it
    // was deleted, which is the opposite of what delete means.
    selectAllIndex:   db.prepare('SELECT id, space_id FROM projects WHERE deleted_at IS NULL'),
    // How many projects each space holds, and how many of those are on show —
    // the /contents rule: state live, and not wearing the pre-2026-09-10
    // "[archived]" title. Trashed rows are not held by anything.
    countBySpace:     db.prepare("SELECT space_id, COUNT(*) AS n, SUM(CASE WHEN COALESCE(state, 'live') = 'live' AND ltrim(COALESCE(title, '')) NOT LIKE '[archived]%' THEN 1 ELSE 0 END) AS shown FROM projects WHERE deleted_at IS NULL GROUP BY space_id"),
    // visibility is written at creation, never after: a project asked for as
    // private must not exist as public for even the moment between an INSERT
    // and a follow-up UPDATE.
    insert:           db.prepare('INSERT INTO projects (id, space_id, slug, title, document_version, source, created_at, updated_at, last_touched_at, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    update:           db.prepare('UPDATE projects SET slug=?, title=?, document_version=?, source=?, updated_at=?, last_touched_at=? WHERE id=?'),
    deleteById:       db.prepare('DELETE FROM projects WHERE id = ?'),
    opsSelect:        db.prepare('SELECT data FROM project_ops WHERE project_id = ? ORDER BY version ASC, seq ASC'),
    opsSelectSince:   db.prepare('SELECT data FROM project_ops WHERE project_id = ? AND version > ? ORDER BY version ASC, seq ASC'),
    opsDeleteAll:     db.prepare('DELETE FROM project_ops WHERE project_id = ?'),
    opsInsert:        db.prepare('INSERT INTO project_ops (project_id, version, data, created_at, actor, actor_type, actor_label) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    opsCount:         db.prepare('SELECT COUNT(*) as cnt FROM project_ops WHERE project_id = ?'),
    opsTrim:          db.prepare('DELETE FROM project_ops WHERE project_id = ? AND seq IN (SELECT seq FROM project_ops WHERE project_id = ? ORDER BY seq ASC LIMIT ?)'),
    opsTrimAged:      db.prepare('DELETE FROM project_ops WHERE project_id = ? AND created_at < ?'),
    ensureSpace:      db.prepare('INSERT OR IGNORE INTO spaces (id, label, permanent, allow_edits, scene_version, created_at, updated_at, last_touched_at) VALUES (?, ?, 0, 1, 0, ?, ?, ?)'),
  }
  return _s
}

// kept: projectStore.test.js exercises the projectId→spaceId map contract
const readProjectIndex = async (spacesDir) =>
  Object.fromEntries(s().selectAllIndex.all().map(r => [r.id, r.space_id]))

// What each space holds, in ONE grouped query: { [spaceId]: { projects, published } }.
//
// The space list had no way to say what a space contains: a card named the
// project its door opens on, or nothing at all, so the Open Space — which has
// no door project because it is the communal room itself — read as an empty
// card with everything made in it invisible (first fixed on 2026-08-24,
// 2efc05c7, on a branch that never landed; re-applied for the layers decision,
// 2026-09-23). Counted here rather than in the client: the alternative was one
// project list per space on every load of /spaces, pulling whole lists to
// learn their length. "Published" is the visitor's word for on show — the
// same rows GET /api/spaces/:id/contents lists.
const countProjectsBySpace = async () =>
  Object.fromEntries(s().countBySpace.all().map((r) => [r.space_id, { projects: Number(r.n) || 0, published: Number(r.shown) || 0 }]))

const loadProjectMeta = async (spacesDir, spaceId, projectId) =>
  rowToMeta(s().selectBySpace.get(projectId, spaceId))

const findProjectBySlug = async (spaceId, slug) => rowToMeta(s().selectBySlug.get(spaceId, slug))

// Was a project that no longer resolves in `fromSpaceId` moved out of it by
// scripts/project-move.mjs? `segment` is whatever the visitor typed — an id
// or a slug, either is checked. Returns { projectId, toSpace } or null.
const findProjectMove = (fromSpaceId, segment) => {
  if (!fromSpaceId || !segment) return null
  const row = s().selectLatestMove.get(fromSpaceId, segment, segment)
  return row ? { projectId: row.project_id, toSpace: row.to_space } : null
}

const upsertProjectMeta = async (spacesDir, spaceId, projectId, updates = {}) => {
  const db = getDb()
  const { insert, update, selectAnyById, restore } = s()
  const now = Date.now()
  return db.transaction(() => {
    // selectAnyById, not selectById: a project sitting in the trash still owns
    // its id. Writing to it — restoring a snapshot over it, or re-creating one
    // by the same name — is a request for it to exist again, so it comes back
    // rather than colliding with a row nobody can see.
    const row = selectAnyById.get(projectId)
    if (row?.deleted_at) restore.run(now, projectId)
    if (!row) {
      const meta = buildProjectMeta(spaceId, projectId, updates)
      insert.run(projectId, spaceId, meta.slug ?? null, meta.title, meta.documentVersion, meta.source, meta.createdAt, meta.updatedAt, meta.lastTouchedAt, meta.visibility)
      return meta
    }
    const nextSlug    = 'slug' in updates ? (updates.slug ?? null) : row.slug
    const nextTitle   = updates.title !== undefined ? (String(updates.title || '').trim() || row.title) : row.title
    const nextVersion = updates.documentVersion !== undefined ? (Number(updates.documentVersion) || 0) : row.document_version
    const nextSource  = updates.source !== undefined ? updates.source : row.source
    const nextTouched = updates.touch === false ? row.last_touched_at : now
    update.run(nextSlug, nextTitle, nextVersion, nextSource, now, nextTouched, projectId)
    return rowToMeta({ ...row, slug: nextSlug, title: nextTitle, document_version: nextVersion, source: nextSource, updated_at: now, last_touched_at: nextTouched })
  })()
}

const normalizeProjectTimestamp = (value, fallback) => {
  const next = Number(value)
  return (Number.isFinite(next) && next > 0) ? next : fallback
}

const coerceProjectDocument = (spaceId, projectId, document = null, projectMeta = null) => {
  const now = Date.now()
  const normalized = normalizeProjectDocument(document || {
    ...defaultProjectDocument,
    projectMeta: { ...defaultProjectDocument.projectMeta, id: projectId, spaceId }
  })
  const fallbackCreatedAt = normalizeProjectTimestamp(projectMeta?.createdAt, now)
  return {
    ...normalized,
    projectMeta: {
      ...normalized.projectMeta,
      id: projectId,
      spaceId,
      title: normalized.projectMeta?.title || projectMeta?.title || 'Untitled Project',
      createdAt: normalizeProjectTimestamp(normalized.projectMeta?.createdAt, fallbackCreatedAt),
      updatedAt: normalizeProjectTimestamp(normalized.projectMeta?.updatedAt, normalizeProjectTimestamp(projectMeta?.updatedAt, fallbackCreatedAt)),
      source: normalized.projectMeta?.source || projectMeta?.source || 'project'
    }
  }
}

// Short-circuiting deep-equal — used instead of comparing two full
// JSON.stringify passes on every read, which serializes the whole document
// twice even when nothing changed (the common case).
const deepEqual = (a, b) => {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, index) => deepEqual(item, b[index]))
  }
  const isObj = (v) => v !== null && typeof v === 'object'
  if (isObj(a) && isObj(b)) {
    const aKeys = Object.keys(a)
    if (aKeys.length !== Object.keys(b).length) return false
    return aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]))
  }
  return false
}

const readProjectDocument = async (spacesDir, spaceId, projectId) => {
  const { documentPath } = getProjectPaths(spacesDir, spaceId, projectId)
  const existing = await readJson(documentPath, null)
  const projectMeta = await loadProjectMeta(spacesDir, spaceId, projectId)
  const nextDocument = coerceProjectDocument(spaceId, projectId, existing, projectMeta)
  if (existing && !deepEqual(existing, nextDocument)) {
    await writeJson(documentPath, nextDocument)
  }
  return nextDocument
}

const writeProjectDocument = async (spacesDir, spaceId, projectId, document) => {
  const { documentPath } = getProjectPaths(spacesDir, spaceId, projectId)
  const projectMeta = await loadProjectMeta(spacesDir, spaceId, projectId)
  await writeJson(documentPath, coerceProjectDocument(spaceId, projectId, document, projectMeta))
}

const readProjectOps = async (spacesDir, spaceId, projectId) =>
  s().opsSelect.all(projectId).map(r => JSON.parse(r.data))

// Pushes the version filter into SQL via the existing (project_id, version)
// index instead of reading+parsing the whole retained history and
// filtering in JS -- used by GET .../ops?since=, the most frequent read of
// this table (2026-07-17 perf audit).
const readProjectOpsSince = async (spacesDir, spaceId, projectId, since) =>
  s().opsSelectSince.all(projectId, since).map(r => JSON.parse(r.data))

const writeProjectOps = async (spacesDir, spaceId, projectId, ops) => {
  const { opsDeleteAll, opsInsert } = s()
  const now = Date.now()
  getDb().transaction(() => {
    opsDeleteAll.run(projectId)
    for (const op of (Array.isArray(ops) ? ops : [])) {
      opsInsert.run(projectId, op.version ?? 0, JSON.stringify(op), op.timestamp ?? now, null, null, null)
    }
  })()
}

// maxAgeMs bounds the window by age as well as count; 0 disables it.
//
// Counting alone makes retention depend on how busy a project is, which is
// backwards: a project edited daily drops its dead history in a week, while a
// dormant one keeps its last ops — and every asset they mention — forever. On
// production that pinned 145 MB of blobs the garbage collector could otherwise
// have taken, one project holding seven of them behind four ops it made in
// June.
//
// Emptying the window is safe: the client's hasOpGap() sees a window that does
// not start at its next version and calls resyncDocument() for the whole
// materialized document instead. The one thing that does read the full window
// is the retry/idempotency guard in POST .../ops, which matches opIds to spot a
// resent batch — so the bound has to stay far longer than any retry. Days, not
// minutes.
//
// `actor` (opActor.js) is stamped into its own columns, not into the op.
const appendProjectOps = async (spacesDir, spaceId, projectId, ops, maxHistory = 500, maxAgeMs = 0, actor = null) => {
  if (!Array.isArray(ops) || ops.length === 0) return
  const { opsInsert, opsCount, opsTrim, opsTrimAged } = s()
  const now = Date.now()
  getDb().transaction(() => {
    for (const op of ops) {
      opsInsert.run(projectId, op.version ?? 0, JSON.stringify(op), op.timestamp ?? now,
        actor?.actor ?? null, actor?.type ?? null, actor?.label ?? null)
    }
    const { cnt } = opsCount.get(projectId)
    if (cnt > maxHistory) opsTrim.run(projectId, projectId, cnt - maxHistory)
    if (maxAgeMs > 0) opsTrimAged.run(projectId, now - maxAgeMs)
  })()
}

/*
 * Ops beyond the version their project stands at — and what is done with them.
 *
 * A project's version is `projects.document_version`; its log is the rows of
 * `project_ops`. They are written together (commitProjectOps below), so a row
 * above the version should never exist. It did, on 2026-10-02: two servers on
 * one data folder each ran a follower into the same database, and the old
 * three-step write (document, then ops, then version) let one process's ops
 * land while the other's version did not. The project sat at 809 with ops up
 * to 819, and every later write at 810 failed the UNIQUE index — a 500, every
 * 25 seconds, for hours, with nothing anywhere saying why.
 *
 * THE RULE: the version is the truth. It is what every reader, every editor and
 * every follower was told; the document on disk is the one written with it.
 * Ops above it never became the project — no reader could have been told about
 * them — so they are set aside, not replayed: moved whole into
 * `project_ops_quarantine` with the version the project stood at and the
 * reason, and logged. Nothing is deleted. A followed project then agrees with
 * its host again through the follow's own convergence (follow/followConverge.js),
 * which compares the documents and takes the host's.
 *
 * Replaying them instead (bumping the version to 819) was rejected: those ops
 * came from two processes at once, the document holds an unknown subset of
 * their effects, and publishing them would hand every reader a log that does
 * not describe the document it sits beside.
 */
const ORPHAN_REASON = 'ops above the version the project stands at (two writers on one data folder, or a write cut off between its steps)'

let _qs = null
let _qsDb = null
const qs = () => {
  const db = getDb()
  if (_qs && _qsDb === db) return _qs
  _qsDb = db
  _qs = {
    orphans:       db.prepare('SELECT * FROM project_ops WHERE project_id = ? AND version > ? ORDER BY version ASC, seq ASC'),
    quarantine:    db.prepare('INSERT INTO project_ops_quarantine (project_id, version, data, created_at, actor, actor_type, actor_label, original_seq, document_version, reason, quarantined_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    dropOrphans:   db.prepare('DELETE FROM project_ops WHERE project_id = ? AND version > ?'),
    // Every project with a row above its version — the state the heal is for.
    orphanedProjects: db.prepare('SELECT p.id AS id, p.space_id AS space_id, p.document_version AS document_version, MAX(o.version) AS max_version, COUNT(o.seq) AS n FROM projects p JOIN project_ops o ON o.project_id = p.id AND o.version > p.document_version GROUP BY p.id'),
    versionOf:     db.prepare('SELECT document_version FROM projects WHERE id = ?'),
    bumpVersion:   db.prepare('UPDATE projects SET title = ?, document_version = ?, updated_at = ?, last_touched_at = ? WHERE id = ?'),
    listQuarantined: db.prepare('SELECT * FROM project_ops_quarantine WHERE project_id = ? ORDER BY version ASC, seq ASC')
  }
  return _qs
}

// Must run inside a transaction (it is two statements that only make sense
// together). Returns null when there was nothing to move.
const quarantineOrphanOpsInTx = (projectId, documentVersion, reason = ORPHAN_REASON) => {
  const rows = qs().orphans.all(projectId, documentVersion)
  if (!rows.length) return null
  const at = Date.now()
  for (const row of rows) {
    qs().quarantine.run(projectId, row.version, row.data, row.created_at, row.actor ?? null, row.actor_type ?? null, row.actor_label ?? null, row.seq, documentVersion, reason, at)
  }
  qs().dropOrphans.run(projectId, documentVersion)
  return { projectId, documentVersion, moved: rows.length, from: rows[0].version, to: rows[rows.length - 1].version, reason }
}

const describeQuarantine = (healed) =>
  `[projects] ${healed.projectId}: ${healed.moved} op(s) v${healed.from}–v${healed.to} were above the version it stands at (v${healed.documentVersion}) — moved to project_ops_quarantine, document kept as it is. Reason: ${healed.reason}`

/**
 * At startup: every project with ops above its version is healed, each in its
 * own transaction, each said in the log. Returns what was moved.
 */
const healOrphanProjectOps = ({ log = null } = {}) => {
  const healed = []
  for (const row of qs().orphanedProjects.all()) {
    const result = getDb().transaction(() => {
      // Re-read inside the write lock: the version may have moved since the scan.
      const current = qs().versionOf.get(row.id)
      return current ? quarantineOrphanOpsInTx(row.id, Number(current.document_version) || 0) : null
    }, { immediate: true })()
    if (result) {
      healed.push(result)
      log?.warn?.(describeQuarantine(result))
    }
  }
  return healed
}

const listQuarantinedOps = (projectId) => qs().listQuarantined.all(projectId)

/**
 * The one database step of a project write: the version check, the op append
 * and the version bump, in ONE transaction that holds SQLite's write lock from
 * its first read (BEGIN IMMEDIATE). Two processes cannot both pass the check:
 * the loser of a race gets { conflict } — the ordinary 409 — and writes
 * nothing, never ops without the version that goes with them.
 *
 * Ops above the current version are quarantined first (see the rule above), so
 * a project left in that state takes its next write instead of failing it.
 *
 * `ops` must already carry versions baseVersion+1 … nextVersion.
 */
const commitProjectOps = ({ projectId, baseVersion, ops, nextVersion, title = undefined, maxHistory = 500, maxAgeMs = 0, actor = null }) => {
  const { selectAnyById, opsInsert, opsCount, opsTrim, opsTrimAged } = s()
  const db = getDb()
  return db.transaction(() => {
    const row = selectAnyById.get(projectId)
    if (!row) return { notFound: true }
    const current = Number(row.document_version) || 0
    if (current !== baseVersion) return { conflict: true, latestVersion: current }
    const healed = quarantineOrphanOpsInTx(projectId, current)
    const now = Date.now()
    for (const op of ops) {
      opsInsert.run(projectId, op.version ?? 0, JSON.stringify(op), op.timestamp ?? now,
        actor?.actor ?? null, actor?.type ?? null, actor?.label ?? null)
    }
    const { cnt } = opsCount.get(projectId)
    if (cnt > maxHistory) opsTrim.run(projectId, projectId, cnt - maxHistory)
    if (maxAgeMs > 0) opsTrimAged.run(projectId, now - maxAgeMs)
    const nextTitle = title !== undefined ? (String(title || '').trim() || row.title) : row.title
    qs().bumpVersion.run(nextTitle, nextVersion, now, now, projectId)
    if (row.deleted_at) s().restore.run(now, projectId)
    return {
      ok: true,
      healed,
      meta: rowToMeta({ ...row, title: nextTitle, document_version: nextVersion, updated_at: now, last_touched_at: now, deleted_at: null })
    }
  }, { immediate: true })()
}

/*
 * The document file and the database cannot share a transaction, so a write
 * is ordered so that a crash at any point leaves something whole
 * (write-ahead, then commit, then apply — the rename is atomic on POSIX):
 *
 *   1. the new document is written beside the old as document.json.v<N>.pending
 *   2. the database commits version N (commitProjectOps)
 *   3. the pending file is renamed over document.json
 *
 * Killed after 1: N never committed; the pending file is removed on the next
 * write. Killed after 2: N committed; the next write (or the next start) puts
 * the pending file in place before anything else. node --watch restarts a dev
 * server mid-request, so this is not a theoretical window.
 */
const PENDING_RE = /^document\.json\.v(\d+)\.pending$/
const pendingDocumentPath = (spacesDir, spaceId, projectId, version) =>
  path.join(getProjectPaths(spacesDir, spaceId, projectId).projectDir, `document.json.v${version}.pending`)

const stageProjectDocument = async (spacesDir, spaceId, projectId, document, version) => {
  const projectMeta = await loadProjectMeta(spacesDir, spaceId, projectId)
  const pendingPath = pendingDocumentPath(spacesDir, spaceId, projectId, version)
  const coerced = coerceProjectDocument(spaceId, projectId, document, projectMeta)
  await writeJson(pendingPath, coerced)
  return { pendingPath, document: coerced }
}

const applyStagedDocument = async (spacesDir, spaceId, projectId, pendingPath) => {
  const { documentPath } = getProjectPaths(spacesDir, spaceId, projectId)
  await fsp.rename(pendingPath, documentPath)
}

const discardStagedDocument = async (pendingPath) => {
  await fsp.rm(pendingPath, { force: true })
}

/**
 * Finish or drop what a stopped writer left. Call only while holding the
 * project's write lock (projectWrite.js). Returns what it did, for the log.
 */
const recoverStagedDocuments = async (spacesDir, spaceId, projectId) => {
  const { projectDir, documentPath } = getProjectPaths(spacesDir, spaceId, projectId)
  let names = []
  try { names = await fsp.readdir(projectDir) } catch { return [] }
  const pending = names.map((name) => [name, PENDING_RE.exec(name)]).filter(([, m]) => m)
  if (!pending.length) return []
  const current = Number(qs().versionOf.get(projectId)?.document_version) || 0
  const done = []
  for (const [name, match] of pending) {
    const version = Number(match[1])
    const file = path.join(projectDir, name)
    if (version === current) {
      await fsp.rename(file, documentPath)
      done.push({ version, action: 'applied' })
    } else {
      await fsp.rm(file, { force: true })
      done.push({ version, action: version > current ? 'dropped-uncommitted' : 'dropped-superseded' })
    }
  }
  return done
}

const ensureProject = async (spacesDir, spaceId, projectId, overrides = {}) => {
  const { projectDir, assetsDir, documentPath } = getProjectPaths(spacesDir, spaceId, projectId)
  await ensureDir(projectDir)
  await ensureDir(assetsDir)
  const now = Date.now()
  s().ensureSpace.run(spaceId, spaceId, now, now, now)
  const meta = await upsertProjectMeta(spacesDir, spaceId, projectId, overrides)
  const existingDocument = await readJson(documentPath, null)
  if (!existingDocument) {
    await writeJson(documentPath, normalizeProjectDocument({
      ...defaultProjectDocument,
      projectMeta: { id: projectId, spaceId, title: meta.title, createdAt: meta.createdAt, updatedAt: meta.updatedAt, source: meta.source }
    }))
  }
  return meta
}

const listProjectsInSpace = async (spacesDir, spaceId) =>
  s().selectBySpaceAll.all(spaceId).map(rowToMeta)

const findProjectById = async (spacesDir, projectId) => {
  const normalized = normalizeProjectId(projectId)
  if (!normalized) return null
  const row = s().selectById.get(normalized)
  if (!row) return null
  return {
    ...getProjectPaths(spacesDir, row.space_id, normalized),
    spaceId: row.space_id,
    projectId: normalized,
    meta: rowToMeta(row)
  }
}

// The same lookup, trash included. A project in the trash still owns its id and
// its files; anything that compares a file against what is HERE (a proposal's
// summary) must see it, or a trashed project reads as brand new on a round-trip.
// `meta.deletedAt` says which it is.
const findProjectByIdAny = async (spacesDir, projectId) => {
  const normalized = normalizeProjectId(projectId)
  if (!normalized) return null
  const row = s().selectAnyById.get(normalized)
  if (!row) return null
  return {
    ...getProjectPaths(spacesDir, row.space_id, normalized),
    spaceId: row.space_id,
    projectId: normalized,
    meta: rowToMeta(row)
  }
}

// Delete is a promise to forget, not an instruction to shred. The row stays,
// marked, and the files stay untouched until purgeTrash() passes TRASH_TTL_MS —
// so "delete" and "gone" are two different days.
const deleteProject = async (spacesDir, spaceId, projectId) => {
  const now = Date.now()
  s().softDelete.run(now, now, projectId)
  return { deletedAt: now, restorableUntil: now + TRASH_TTL_MS }
}

const restoreProject = async (projectId) => {
  s().restore.run(Date.now(), projectId)
  return rowToMeta(s().selectAnyById.get(projectId))
}

const listTrashedProjects = async (spaceId = null) =>
  (spaceId ? s().selectTrashedInSpace.all(spaceId) : s().selectTrashed.all()).map(rowToMeta)

// The only path that actually removes bytes. Called by the sweep, and by an
// explicit "empty the trash" — never by a delete.
const purgeProject = async (spacesDir, spaceId, projectId) => {
  s().deleteById.run(projectId)
  const { projectDir } = getProjectPaths(spacesDir, spaceId, projectId)
  await fsp.rm(projectDir, { recursive: true, force: true })
}

const purgeTrash = async (spacesDir, { now = Date.now(), ttlMs = TRASH_TTL_MS } = {}) => {
  const due = s().selectPurgeable.all(now - ttlMs)
  for (const row of due) await purgeProject(spacesDir, row.space_id, row.id)
  return due.map(row => row.id)
}

const setProjectShelf = async (projectId, collectionId) => {
  s().setShelf.run(collectionId || null, Date.now(), projectId)
  return rowToMeta(s().selectById.get(projectId))
}

const setProjectState = async (projectId, state) => {
  if (!isProjectState(state)) throw Object.assign(new Error(`Unknown state "${state}".`), { status: 400 })
  s().setState.run(state, Date.now(), projectId)
  return rowToMeta(s().selectById.get(projectId))
}

const setProjectVisibility = async (projectId, visibility) => {
  if (!isProjectVisibility(visibility)) throw Object.assign(new Error(`Unknown visibility "${visibility}". Use "public" or "private".`), { status: 400 })
  s().setVisibility.run(visibility, Date.now(), projectId)
  return rowToMeta(s().selectById.get(projectId))
}

// A drag is one intent: the whole order arrives at once. Applying it as a series
// of pairwise swaps is how two people reordering at the same time end up with an
// order neither of them asked for.
const reorderProjects = async (spaceId, ids = []) => {
  const known = new Map(s().selectBySpaceAll.all(spaceId).map(row => [row.id, row]))
  const now = Date.now()
  ids.filter(id => known.has(id)).forEach((id, index) => s().setPosition.run(index, now, id))
  return (await listProjectsInSpace(null, spaceId))
}

const buildProjectAssetMeta = ({ assetId, file, source = 'server', width = 0, height = 0 }) => {
  if (!assetId) throw new Error('buildProjectAssetMeta: assetId is required (must be SHA-256 hex)')
  return {
  id: assetId,
  name: file?.originalname || file?.name || 'Untitled Asset',
  mimeType: file?.mimetype || file?.type || 'application/octet-stream',
  size: file?.size || 0,
  // A picture's proportions, recorded once at upload. A room with build zones
  // needs them to scale a banner into its slot; without them it can only hang
  // everything at the row height. Absent for anything that is not a still.
  ...(Number(width) > 0 && Number(height) > 0 ? { width: Number(width), height: Number(height) } : {}),
  createdAt: Date.now(),
  source
  }
}

module.exports = {
  PROJECT_META_FILE,
  PROJECT_DOCUMENT_FILE,
  PROJECT_OPS_FILE,
  PROJECTS_DIRNAME,
  buildProjectAssetMeta,
  buildProjectMeta,
  deleteProject,
  ensureProject,
  findProjectById,
  findProjectByIdAny,
  findProjectBySlug,
  findProjectMove,
  getProjectPaths,
  isReservedProjectSlug,
  isValidAssetId,
  PROJECT_STATES,
  TRASH_TTL_MS,
  isProjectState,
  PROJECT_VISIBILITIES,
  isProjectVisibility,
  isPrivateProject,
  normalizeProjectVisibility,
  setProjectVisibility,
  listProjectsInSpace,
  countProjectsBySpace,
  listTrashedProjects,
  restoreProject,
  purgeProject,
  purgeTrash,
  setProjectShelf,
  setProjectState,
  reorderProjects,
  loadProjectMeta,
  normalizeProjectId,
  normalizeProjectSlug,
  readJson,
  readProjectIndex,
  readProjectDocument,
  readProjectOps,
  readProjectOpsSince,
  upsertProjectMeta,
  appendProjectOps,
  commitProjectOps,
  healOrphanProjectOps,
  listQuarantinedOps,
  quarantineOrphanOpsInTx,
  stageProjectDocument,
  applyStagedDocument,
  discardStagedDocument,
  recoverStagedDocuments,
  writeJson,
  writeProjectDocument,
  writeProjectOps
}
