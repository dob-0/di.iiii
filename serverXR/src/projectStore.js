const path = require('node:path')
const fsp = require('node:fs/promises')
const crypto = require('node:crypto')
const { ensureDir, readJson, writeJson } = require('./jsonStore')
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

const safeSlug = (value = '') => {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

const normalizeProjectId = (value) => {
  const slug = safeSlug(value)
  if (!slug || !PROJECT_ID_REGEX.test(slug)) {
    return null
  }
  return slug
}

const isValidProjectId = (value = '') => PROJECT_ID_REGEX.test(String(value).trim())
const isValidAssetId = (value = '') => ASSET_ID_REGEX.test(String(value).trim())

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

const readProjectIndex = async (spacesDir) => {
  const index = await readJson(getProjectIndexPath(spacesDir), {})
  return index && typeof index === 'object' && !Array.isArray(index) ? index : {}
}

const writeProjectIndex = async (spacesDir, index = {}) => {
  await writeJson(getProjectIndexPath(spacesDir), index)
}

const setProjectIndexEntry = async (spacesDir, projectId, spaceId) => {
  const index = await readProjectIndex(spacesDir)
  index[projectId] = spaceId
  await writeProjectIndex(spacesDir, index)
  return index
}

const removeProjectIndexEntry = async (spacesDir, projectId) => {
  const index = await readProjectIndex(spacesDir)
  if (!(projectId in index)) {
    return index
  }
  delete index[projectId]
  await writeProjectIndex(spacesDir, index)
  return index
}

const removeProjectIndexEntriesForSpace = async (spacesDir, spaceId) => {
  const index = await readProjectIndex(spacesDir)
  let changed = false
  Object.entries(index).forEach(([projectId, indexedSpaceId]) => {
    if (indexedSpaceId === spaceId) {
      delete index[projectId]
      changed = true
    }
  })
  if (changed) {
    await writeProjectIndex(spacesDir, index)
  }
  return index
}

const normalizeProjectTimestamp = (value, fallback) => {
  const next = Number(value)
  if (Number.isFinite(next) && next > 0) {
    return next
  }
  return fallback
}

const loadProjectMeta = async (spacesDir, spaceId, projectId) => {
  const { metaPath } = getProjectPaths(spacesDir, spaceId, projectId)
  return readJson(metaPath, null)
}

const saveProjectMeta = async (spacesDir, spaceId, projectId, meta) => {
  const { metaPath } = getProjectPaths(spacesDir, spaceId, projectId)
  await writeJson(metaPath, meta)
}

const upsertProjectMeta = async (spacesDir, spaceId, projectId, updates = {}) => {
  const existing = await loadProjectMeta(spacesDir, spaceId, projectId)
  const nextMeta = existing
    ? {
        ...existing,
        ...(updates.title !== undefined ? { title: updates.title } : {}),
        ...(updates.documentVersion !== undefined ? { documentVersion: Number(updates.documentVersion) || 0 } : {}),
        ...(updates.source !== undefined ? { source: updates.source } : {}),
        updatedAt: Date.now(),
        lastTouchedAt: updates.touch === false ? existing.lastTouchedAt : Date.now()
      }
    : buildProjectMeta(spaceId, projectId, updates)
  await saveProjectMeta(spacesDir, spaceId, projectId, nextMeta)
  return nextMeta
}

const ensureProject = async (spacesDir, spaceId, projectId, overrides = {}) => {
  const { projectDir, assetsDir, documentPath, opsPath } = getProjectPaths(spacesDir, spaceId, projectId)
  await ensureDir(projectDir)
  await ensureDir(assetsDir)
  const meta = await upsertProjectMeta(spacesDir, spaceId, projectId, overrides)
  const existingDocument = await readJson(documentPath, null)
  if (!existingDocument) {
    await writeJson(documentPath, normalizeProjectDocument({
      ...defaultProjectDocument,
      projectMeta: {
        id: projectId,
        spaceId,
        title: meta.title,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        source: meta.source
      }
    }))
  }
  const existingOps = await readJson(opsPath, null)
  if (!existingOps) {
    await writeJson(opsPath, [])
  }
  await setProjectIndexEntry(spacesDir, projectId, spaceId)
  return meta
}

const coerceProjectDocument = (spaceId, projectId, document = null, projectMeta = null) => {
  const now = Date.now()
  const normalized = normalizeProjectDocument(document || {
    ...defaultProjectDocument,
    projectMeta: {
      ...defaultProjectDocument.projectMeta,
      id: projectId,
      spaceId
    }
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
      updatedAt: normalizeProjectTimestamp(
        normalized.projectMeta?.updatedAt,
        normalizeProjectTimestamp(projectMeta?.updatedAt, fallbackCreatedAt)
      ),
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

const readProjectOps = async (spacesDir, spaceId, projectId) => {
  const { opsPath } = getProjectPaths(spacesDir, spaceId, projectId)
  return readJson(opsPath, [])
}

const writeProjectOps = async (spacesDir, spaceId, projectId, ops) => {
  const { opsPath } = getProjectPaths(spacesDir, spaceId, projectId)
  await writeJson(opsPath, Array.isArray(ops) ? ops : [])
}

const appendProjectOps = async (spacesDir, spaceId, projectId, ops, maxHistory = 500) => {
  const existing = await readProjectOps(spacesDir, spaceId, projectId)
  const combined = existing.concat(Array.isArray(ops) ? ops : [])
  const trimmed = combined.length > maxHistory ? combined.slice(combined.length - maxHistory) : combined
  await writeProjectOps(spacesDir, spaceId, projectId, trimmed)
  return trimmed
}

const listProjectsInSpace = async (spacesDir, spaceId) => {
  const projectsDir = getSpaceProjectsDir(spacesDir, spaceId)
  await ensureDir(projectsDir)
  const entries = await fsp.readdir(projectsDir, { withFileTypes: true })
  const result = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const meta = await loadProjectMeta(spacesDir, spaceId, entry.name)
    if (meta) {
      result.push(meta)
    }
  }
  return result.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

const findProjectById = async (spacesDir, projectId) => {
  const normalizedId = normalizeProjectId(projectId)
  if (!normalizedId) return null
  const projectIndex = await readProjectIndex(spacesDir)
  const indexedSpaceId = typeof projectIndex[normalizedId] === 'string' ? projectIndex[normalizedId] : ''
  if (indexedSpaceId) {
    const indexedPaths = getProjectPaths(spacesDir, indexedSpaceId, normalizedId)
    const indexedMeta = await readJson(indexedPaths.metaPath, null)
    if (indexedMeta) {
      return {
        ...indexedPaths,
        spaceId: indexedSpaceId,
        projectId: normalizedId,
        meta: indexedMeta
      }
    }
    await removeProjectIndexEntry(spacesDir, normalizedId)
  }
  const spaceEntries = await fsp.readdir(spacesDir, { withFileTypes: true }).catch(() => [])
  for (const entry of spaceEntries) {
    if (!entry.isDirectory()) continue
    const paths = getProjectPaths(spacesDir, entry.name, normalizedId)
    const meta = await readJson(paths.metaPath, null)
    if (meta) {
      await setProjectIndexEntry(spacesDir, normalizedId, entry.name)
      return {
        ...paths,
        spaceId: entry.name,
        projectId: normalizedId,
        meta
      }
    }
  }
  return null
}

const deleteProject = async (spacesDir, spaceId, projectId) => {
  const { projectDir } = getProjectPaths(spacesDir, spaceId, projectId)
  await fsp.rm(projectDir, { recursive: true, force: true })
  await removeProjectIndexEntry(spacesDir, projectId)
}

const buildProjectAssetMeta = ({ assetId, file, source = 'server' }) => ({
  id: assetId || crypto.randomUUID(),
  name: file?.originalname || file?.name || 'Untitled Asset',
  mimeType: file?.mimetype || file?.type || 'application/octet-stream',
  size: file?.size || 0,
  createdAt: Date.now(),
  source
})

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
  setProjectIndexEntry,
  upsertProjectMeta,
  appendProjectOps,
  writeJson,
  writeProjectIndex,
  writeProjectDocument,
  writeProjectOps
}
