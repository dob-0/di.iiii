const path = require('node:path')
const fsp = require('node:fs/promises')
const crypto = require('node:crypto')
const { loadSharedModule } = require('./sharedRuntime')
const {
  defaultProjectDocument,
  normalizeProjectDocument
} = loadSharedModule('projectSchema.cjs')

const PROJECTS_DIRNAME = 'projects'
const PROJECT_META_FILE = 'project.json'
const PROJECT_DOCUMENT_FILE = 'document.json'
const PROJECT_OPS_FILE = 'ops.json'

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

const ensureDir = async (dirPath) => {
  await fsp.mkdir(dirPath, { recursive: true })
}

const tryRecoverJson = (raw = '') => {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null
  let cursor = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'))
  while (cursor >= 0) {
    const candidate = trimmed.slice(0, cursor + 1)
    try {
      return JSON.parse(candidate)
    } catch {
      const previousObject = trimmed.lastIndexOf('}', cursor - 1)
      const previousArray = trimmed.lastIndexOf(']', cursor - 1)
      cursor = Math.max(previousObject, previousArray)
    }
  }
  return null
}

const writeJson = async (filePath, data) => {
  await ensureDir(path.dirname(filePath))
  const serialized = JSON.stringify(data, null, 2)
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`
  await fsp.writeFile(tempPath, serialized)
  await fsp.rename(tempPath, filePath)
}

const readJson = async (filePath, fallback = null) => {
  try {
    const raw = await fsp.readFile(filePath, 'utf8')
    try {
      return JSON.parse(raw)
    } catch (error) {
      const recovered = tryRecoverJson(raw)
      if (recovered !== null) {
        await writeJson(filePath, recovered)
        return recovered
      }
      throw error
    }
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

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
  return meta
}

const readProjectDocument = async (spacesDir, spaceId, projectId) => {
  const { documentPath } = getProjectPaths(spacesDir, spaceId, projectId)
  const existing = await readJson(documentPath, null)
  return normalizeProjectDocument(existing || {
    ...defaultProjectDocument,
    projectMeta: {
      ...defaultProjectDocument.projectMeta,
      id: projectId,
      spaceId
    }
  })
}

const writeProjectDocument = async (spacesDir, spaceId, projectId, document) => {
  const { documentPath } = getProjectPaths(spacesDir, spaceId, projectId)
  await writeJson(documentPath, normalizeProjectDocument(document))
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
  const spaceEntries = await fsp.readdir(spacesDir, { withFileTypes: true }).catch(() => [])
  for (const entry of spaceEntries) {
    if (!entry.isDirectory()) continue
    const paths = getProjectPaths(spacesDir, entry.name, normalizedId)
    const meta = await readJson(paths.metaPath, null)
    if (meta) {
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
  PROJECTS_DIRNAME,
  buildProjectAssetMeta,
  buildProjectMeta,
  deleteProject,
  ensureProject,
  findProjectById,
  getProjectPaths,
  isValidAssetId,
  isValidProjectId,
  listProjectsInSpace,
  loadProjectMeta,
  normalizeProjectId,
  readJson,
  readProjectDocument,
  readProjectOps,
  saveProjectMeta,
  upsertProjectMeta,
  appendProjectOps,
  writeJson,
  writeProjectDocument,
  writeProjectOps
}
