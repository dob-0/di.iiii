const path = require('node:path')
const fsp = require('node:fs/promises')
const { ensureDir, readJson, writeJson } = require('./jsonStore')
const { getDb } = require('./db')
const { loadSharedModule } = require('./sharedRuntime')
const {
  defaultProjectDocument,
  normalizeProjectDocument
} = loadSharedModule('projectSchema.cjs')

const PROJECTS_DIRNAME = 'projects'
const PROJECT_META_FILE = 'project.json'
const PROJECT_DOCUMENT_FILE = 'document.json'
const PROJECT_OPS_FILE = 'ops.json'
const PROJECT_INDEX_FILE = 'project-index.json'

const PROJECT_ID_REGEX = /^[a-z0-9-]{3,64}$/
const ASSET_ID_REGEX = /^[a-f0-9-]{8,64}$/i

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

const isValidProjectId = (value = '') => PROJECT_ID_REGEX.test(String(value).trim())
const isValidAssetId = (value = '') => ASSET_ID_REGEX.test(String(value).trim())

const rowToMeta = (row) => !row ? null : ({
  id: row.id,
  spaceId: row.space_id,
  title: row.title,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastTouchedAt: row.last_touched_at,
  documentVersion: row.document_version,
  source: row.source
})

const buildProjectMeta = (spaceId, projectId, overrides = {}) => {
  const now = Date.now()
  return {
    id: projectId,
    spaceId,
    title: (typeof overrides.title === 'string' && overrides.title.trim()) || 'Untitled Project',
    createdAt: overrides.createdAt || now,
    updatedAt: now,
    lastTouchedAt: now,
    documentVersion: Number.isFinite(Number(overrides.documentVersion)) ? Number(overrides.documentVersion) : 0,
    source: overrides.source || 'project'
  }
}

const getSpaceProjectsDir = (spacesDir, spaceId) => path.join(spacesDir, spaceId, PROJECTS_DIRNAME)
const getProjectIndexPath = (spacesDir) => path.join(spacesDir, PROJECT_INDEX_FILE)

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
    selectById:       db.prepare('SELECT * FROM projects WHERE id = ?'),
    selectBySpace:    db.prepare('SELECT * FROM projects WHERE id = ? AND space_id = ?'),
    selectBySpaceAll: db.prepare('SELECT * FROM projects WHERE space_id = ? ORDER BY updated_at DESC'),
    selectAllIndex:   db.prepare('SELECT id, space_id FROM projects'),
    insert:           db.prepare('INSERT INTO projects (id, space_id, title, document_version, source, created_at, updated_at, last_touched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    upsert:           db.prepare('INSERT OR REPLACE INTO projects (id, space_id, title, document_version, source, created_at, updated_at, last_touched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    update:           db.prepare('UPDATE projects SET title=?, document_version=?, source=?, updated_at=?, last_touched_at=? WHERE id=?'),
    deleteById:       db.prepare('DELETE FROM projects WHERE id = ?'),
    opsSelect:        db.prepare('SELECT data FROM project_ops WHERE project_id = ? ORDER BY version ASC'),
    opsDeleteAll:     db.prepare('DELETE FROM project_ops WHERE project_id = ?'),
    opsInsert:        db.prepare('INSERT INTO project_ops (project_id, version, data, created_at) VALUES (?, ?, ?, ?)'),
    opsCount:         db.prepare('SELECT COUNT(*) as cnt FROM project_ops WHERE project_id = ?'),
    opsTrim:          db.prepare('DELETE FROM project_ops WHERE project_id = ? AND seq IN (SELECT seq FROM project_ops WHERE project_id = ? ORDER BY seq ASC LIMIT ?)'),
    ensureSpace:      db.prepare('INSERT OR IGNORE INTO spaces (id, label, permanent, allow_edits, scene_version, created_at, updated_at, last_touched_at) VALUES (?, ?, 0, 1, 0, ?, ?, ?)'),
  }
  return _s
}

// readProjectIndex and writeProjectIndex kept for backward-compat with callers
const readProjectIndex = async (spacesDir) =>
  Object.fromEntries(s().selectAllIndex.all().map(r => [r.id, r.space_id]))

const writeProjectIndex = async (spacesDir, index = {}) => {}

const loadProjectMeta = async (spacesDir, spaceId, projectId) =>
  rowToMeta(s().selectBySpace.get(projectId, spaceId))

const saveProjectMeta = async (spacesDir, spaceId, projectId, meta) => {
  s().upsert.run(
    projectId, spaceId,
    meta.title ?? 'Untitled Project',
    meta.documentVersion ?? 0,
    meta.source ?? 'project',
    meta.createdAt ?? Date.now(),
    meta.updatedAt ?? Date.now(),
    meta.lastTouchedAt ?? Date.now()
  )
}

const upsertProjectMeta = async (spacesDir, spaceId, projectId, updates = {}) => {
  const db = getDb()
  const { insert, update, selectById } = s()
  const now = Date.now()
  return db.transaction(() => {
    const row = selectById.get(projectId)
    if (!row) {
      const meta = buildProjectMeta(spaceId, projectId, updates)
      insert.run(projectId, spaceId, meta.title, meta.documentVersion, meta.source, meta.createdAt, meta.updatedAt, meta.lastTouchedAt)
      return meta
    }
    const nextTitle   = updates.title !== undefined ? (String(updates.title || '').trim() || row.title) : row.title
    const nextVersion = updates.documentVersion !== undefined ? (Number(updates.documentVersion) || 0) : row.document_version
    const nextSource  = updates.source !== undefined ? updates.source : row.source
    const nextTouched = updates.touch === false ? row.last_touched_at : now
    update.run(nextTitle, nextVersion, nextSource, now, nextTouched, projectId)
    return rowToMeta({ ...row, title: nextTitle, document_version: nextVersion, source: nextSource, updated_at: now, last_touched_at: nextTouched })
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

const readProjectDocument = async (spacesDir, spaceId, projectId) => {
  const { documentPath } = getProjectPaths(spacesDir, spaceId, projectId)
  const existing = await readJson(documentPath, null)
  const projectMeta = await loadProjectMeta(spacesDir, spaceId, projectId)
  const nextDocument = coerceProjectDocument(spaceId, projectId, existing, projectMeta)
  if (existing && JSON.stringify(existing) !== JSON.stringify(nextDocument)) {
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

const writeProjectOps = async (spacesDir, spaceId, projectId, ops) => {
  const { opsDeleteAll, opsInsert } = s()
  const now = Date.now()
  getDb().transaction(() => {
    opsDeleteAll.run(projectId)
    for (const op of (Array.isArray(ops) ? ops : [])) {
      opsInsert.run(projectId, op.version ?? 0, JSON.stringify(op), op.timestamp ?? now)
    }
  })()
}

const appendProjectOps = async (spacesDir, spaceId, projectId, ops, maxHistory = 500) => {
  if (!Array.isArray(ops) || ops.length === 0) return
  const { opsInsert, opsCount, opsTrim } = s()
  const now = Date.now()
  getDb().transaction(() => {
    for (const op of ops) {
      opsInsert.run(projectId, op.version ?? 0, JSON.stringify(op), op.timestamp ?? now)
    }
    const { cnt } = opsCount.get(projectId)
    if (cnt > maxHistory) opsTrim.run(projectId, projectId, cnt - maxHistory)
  })()
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

const deleteProject = async (spacesDir, spaceId, projectId) => {
  s().deleteById.run(projectId)
  const { projectDir } = getProjectPaths(spacesDir, spaceId, projectId)
  await fsp.rm(projectDir, { recursive: true, force: true })
}

const removeProjectIndexEntriesForSpace = async (spacesDir, spaceId) => {}

const buildProjectAssetMeta = ({ assetId, file, source = 'server' }) => {
  if (!assetId) throw new Error('buildProjectAssetMeta: assetId is required (must be SHA-256 hex)')
  return {
  id: assetId,
  name: file?.originalname || file?.name || 'Untitled Asset',
  mimeType: file?.mimetype || file?.type || 'application/octet-stream',
  size: file?.size || 0,
  createdAt: Date.now(),
  source
  }
}

module.exports = {
  PROJECT_META_FILE,
  PROJECT_DOCUMENT_FILE,
  PROJECT_OPS_FILE,
  PROJECT_INDEX_FILE,
  PROJECTS_DIRNAME,
  buildProjectAssetMeta,
  buildProjectMeta,
  deleteProject,
  ensureProject,
  findProjectById,
  getProjectPaths,
  getProjectIndexPath,
  isValidAssetId,
  isValidProjectId,
  listProjectsInSpace,
  loadProjectMeta,
  normalizeProjectId,
  readJson,
  readProjectIndex,
  readProjectDocument,
  readProjectOps,
  removeProjectIndexEntriesForSpace,
  saveProjectMeta,
  setProjectIndexEntry: async () => {},
  upsertProjectMeta,
  appendProjectOps,
  writeJson,
  writeProjectIndex,
  writeProjectDocument,
  writeProjectOps
}
