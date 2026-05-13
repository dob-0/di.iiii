const path = require('node:path')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const { ensureDir, readJson, writeJson } = require('./jsonStore')

const SLUG_REGEX = /^[a-z0-9-]{3,48}$/
const ASSET_ID_REGEX = /^[a-f0-9-]{8,64}$/i
const OPS_FILE_NAME = 'ops.json'

function createSpaceStore({
  spacesDir,
  defaultSpaceId = 'main',
  defaultTtlMs = 0,
  blankScene
} = {}) {
  const safeSlug = (value = '') => {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
  }

  const normalizeSpaceId = (value) => {
    const slug = safeSlug(value)
    if (!slug || !SLUG_REGEX.test(slug)) {
      return null
    }
    return slug
  }

  const getSpacePaths = (spaceId) => {
    const spaceDir = path.join(spacesDir, spaceId)
    return {
      spaceDir,
      scenePath: path.join(spaceDir, 'scene.json'),
      assetsDir: path.join(spaceDir, 'assets'),
      metaPath: path.join(spaceDir, 'meta.json'),
      opsPath: path.join(spaceDir, OPS_FILE_NAME)
    }
  }

  const isValidAssetId = (value = '') => ASSET_ID_REGEX.test(String(value).trim())

  const readOpsHistory = async (spaceId) => {
    const { opsPath } = getSpacePaths(spaceId)
    return readJson(opsPath, [])
  }

  const writeOpsHistory = async (spaceId, ops) => {
    const { opsPath } = getSpacePaths(spaceId)
    await ensureDir(path.dirname(opsPath))
    await writeJson(opsPath, ops)
  }

  const appendOpsHistory = async (spaceId, newOps = [], maxHistory = 500) => {
    if (!Array.isArray(newOps) || newOps.length === 0) return []
    const history = await readOpsHistory(spaceId)
    const combined = history.concat(newOps)
    const trimmed = combined.length > maxHistory
      ? combined.slice(combined.length - maxHistory)
      : combined
    await writeOpsHistory(spaceId, trimmed)
    return trimmed
  }

  const buildMeta = (spaceId, overrides = {}) => {
    const now = Date.now()
    return {
      id: spaceId,
      label: (overrides.label && String(overrides.label).trim()) || spaceId,
      permanent: Boolean(overrides.permanent),
      allowEdits: overrides.allowEdits !== false,
      publishedProjectId: overrides.publishedProjectId || null,
      createdAt: overrides.createdAt || now,
      updatedAt: now,
      lastTouchedAt: now,
      sceneVersion: Number.isFinite(overrides.sceneVersion) ? Number(overrides.sceneVersion) : 0
    }
  }

  const loadSpaceMeta = async (spaceId) => {
    const { metaPath } = getSpacePaths(spaceId)
    return readJson(metaPath, null)
  }

  const saveSpaceMeta = async (spaceId, meta) => {
    const { spaceDir, metaPath } = getSpacePaths(spaceId)
    await ensureDir(spaceDir)
    await writeJson(metaPath, meta)
  }

  const spaceExists = async (spaceId) => {
    try {
      const { metaPath } = getSpacePaths(spaceId)
      await fsp.access(metaPath)
      return true
    } catch {
      return false
    }
  }

  const ensureSpaceWritable = async (spaceId) => {
    const meta = await loadSpaceMeta(spaceId)
    if (meta?.allowEdits === false) {
      const error = new Error('Space is read-only.')
      error.status = 403
      throw error
    }
    return meta
  }

  const upsertSpaceMeta = async (spaceId, updates = {}) => {
    let meta = await loadSpaceMeta(spaceId)
    if (!meta) {
      meta = buildMeta(spaceId, updates)
    } else {
      meta = {
        ...meta,
        ...('label' in updates ? { label: updates.label } : {}),
        ...('permanent' in updates ? { permanent: Boolean(updates.permanent) } : {}),
        ...('allowEdits' in updates ? { allowEdits: Boolean(updates.allowEdits) } : {}),
        ...('publishedProjectId' in updates ? { publishedProjectId: updates.publishedProjectId || null } : {}),
        ...('sceneVersion' in updates
          ? { sceneVersion: Number.isFinite(Number(updates.sceneVersion)) ? Number(updates.sceneVersion) : (meta.sceneVersion || 0) }
          : {})
      }
      meta.updatedAt = Date.now()
    }
    if (updates.touch !== false) {
      meta.lastTouchedAt = Date.now()
    }
    await saveSpaceMeta(spaceId, meta)
    return meta
  }

  const ensureDefaultSpace = async () => {
    const id = normalizeSpaceId(defaultSpaceId) || defaultSpaceId
    const meta = await loadSpaceMeta(id)
    if (!meta) {
      await saveSpaceMeta(id, buildMeta(id, { label: 'Main Space', permanent: true }))
    }
    const { spaceDir, assetsDir } = getSpacePaths(id)
    await ensureDir(spaceDir)
    await ensureDir(assetsDir)
  }

  const ensureSpaceScene = async (spaceId) => {
    const { scenePath, assetsDir, opsPath } = getSpacePaths(spaceId)
    await ensureDir(path.dirname(scenePath))
    await ensureDir(assetsDir)
    try {
      await fsp.access(scenePath)
    } catch (error) {
      if (error.code === 'ENOENT') {
        await writeJson(scenePath, blankScene)
      } else {
        throw error
      }
    }
    try {
      await fsp.access(opsPath)
    } catch (error) {
      if (error.code === 'ENOENT') {
        await writeJson(opsPath, [])
      } else {
        throw error
      }
    }
  }

  const listSpaces = async () => {
    await ensureDir(spacesDir)
    const entries = await fsp.readdir(spacesDir, { withFileTypes: true })
    const result = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const meta = await loadSpaceMeta(entry.name)
      if (meta) {
        result.push(meta)
      }
    }
    return result.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  }

  const deleteSpace = async (spaceId) => {
    const { spaceDir } = getSpacePaths(spaceId)
    await fsp.rm(spaceDir, { recursive: true, force: true })
  }

  const pruneSpaces = async () => {
    if (!defaultTtlMs) return
    const cutoff = Date.now() - defaultTtlMs
    const spaces = await listSpaces()
    const stale = spaces.filter(space => !space.permanent && (space.lastTouchedAt || space.updatedAt || space.createdAt || 0) < cutoff)
    await Promise.all(stale.map(space => deleteSpace(space.id)))
  }

  const collectSceneAssetRefs = (objects = []) => {
    const refs = new Map()
    const addRef = (asset) => {
      if (!asset?.id) return
      if (!refs.has(asset.id)) {
        refs.set(asset.id, asset)
      }
    }

    objects.forEach((obj) => {
      addRef(obj?.asset)
      addRef(obj?.assetRef)
      addRef(obj?.materialsAssetRef)
      if (Array.isArray(obj?.assets)) {
        obj.assets.forEach(addRef)
      }
      if (obj?.mediaVariants && typeof obj.mediaVariants === 'object') {
        Object.values(obj.mediaVariants).forEach(addRef)
      }
    })

    return Array.from(refs.values())
  }

  const hydrateSceneAssetManifest = (scene, assetBaseUrl = '') => {
    if (!scene || typeof scene !== 'object') return scene

    const baseUrl = String(assetBaseUrl || '').replace(/\/+$/g, '')
    const merged = new Map()
    const addAsset = (asset) => {
      if (!asset?.id) return
      const current = merged.get(asset.id) || {}
      merged.set(asset.id, {
        ...current,
        ...asset,
        ...(baseUrl ? { url: `${baseUrl}/${asset.id}` } : {})
      })
    }

    if (Array.isArray(scene.assets)) {
      scene.assets.forEach(addAsset)
    }
    collectSceneAssetRefs(Array.isArray(scene.objects) ? scene.objects : []).forEach(addAsset)

    if (!merged.size) {
      return scene
    }

    return {
      ...scene,
      assets: Array.from(merged.values()),
      ...(baseUrl ? { assetsBaseUrl: scene.assetsBaseUrl || baseUrl } : {})
    }
  }

  const serveAsset = async (spaceId, assetId, res) => {
    const { assetsDir } = getSpacePaths(spaceId)
    const filePath = path.join(assetsDir, assetId)
    const metaPath = path.join(assetsDir, `${assetId}.json`)
    const meta = await readJson(metaPath, null)
    await fsp.access(filePath)
    res.setHeader('Content-Type', meta?.mimeType || 'application/octet-stream')
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    const stream = fs.createReadStream(filePath)
    stream.on('error', (error) => {
      console.error(error)
      res.status(500).end('Failed to read asset')
    })
    stream.pipe(res)
  }

  return {
    appendOpsHistory,
    buildMeta,
    collectSceneAssetRefs,
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
  }
}

module.exports = {
  createSpaceStore
}
