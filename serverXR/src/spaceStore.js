const path = require('node:path')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const { ensureDir, readJson, writeJson } = require('./jsonStore')
const { getDb } = require('./db')

const SLUG_REGEX = /^[a-z0-9-]{3,48}$/
const ASSET_ID_REGEX = /^[a-f0-9-]{8,64}$/i

function createSpaceStore({
  spacesDir,
  defaultSpaceId = 'main',
  defaultTtlMs = 0,
  blankScene
} = {}) {
  const safeSlug = (value = '') => String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

  const normalizeSpaceId = (value) => {
    const slug = safeSlug(value)
    return (slug && SLUG_REGEX.test(slug)) ? slug : null
  }

  const getSpacePaths = (spaceId) => {
    const spaceDir = path.join(spacesDir, spaceId)
    return {
      spaceDir,
      scenePath: path.join(spaceDir, 'scene.json'),
      assetsDir: path.join(spaceDir, 'assets'),
      metaPath: path.join(spaceDir, 'meta.json'),
      opsPath: path.join(spaceDir, 'ops.json')
    }
  }

  const isValidAssetId = (value = '') => ASSET_ID_REGEX.test(String(value).trim())

  const rowToMeta = (row) => !row ? null : ({
    id: row.id,
    label: row.label,
    permanent: Boolean(row.permanent),
    allowEdits: Boolean(row.allow_edits),
    publishedProjectId: row.published_project_id || null,
    sceneVersion: row.scene_version || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastTouchedAt: row.last_touched_at
  })

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

  // Prepared statements cached per DB instance (auto-resets when DB is replaced, e.g. in tests)
  let _s = null
  let _dbRef = null
  const s = () => {
    const db = getDb()
    if (_s && _dbRef === db) return _s
    _dbRef = db
    _s = {
      selectById:    db.prepare('SELECT * FROM spaces WHERE id = ?'),
      selectExists:  db.prepare('SELECT 1 FROM spaces WHERE id = ?'),
      selectAll:     db.prepare('SELECT * FROM spaces ORDER BY updated_at DESC'),
      selectStale:   db.prepare('SELECT id FROM spaces WHERE permanent = 0 AND last_touched_at < ?'),
      upsert:        db.prepare('INSERT OR REPLACE INTO spaces (id, label, permanent, allow_edits, published_project_id, scene_version, created_at, updated_at, last_touched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
      insert:        db.prepare('INSERT INTO spaces (id, label, permanent, allow_edits, published_project_id, scene_version, created_at, updated_at, last_touched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
      update:        db.prepare('UPDATE spaces SET label=?, permanent=?, allow_edits=?, published_project_id=?, scene_version=?, updated_at=?, last_touched_at=? WHERE id=?'),
      deleteById:    db.prepare('DELETE FROM spaces WHERE id = ?'),
      opsSelect:     db.prepare('SELECT data FROM space_ops WHERE space_id = ? ORDER BY version ASC'),
      opsDeleteAll:  db.prepare('DELETE FROM space_ops WHERE space_id = ?'),
      opsInsert:     db.prepare('INSERT INTO space_ops (space_id, version, data, created_at) VALUES (?, ?, ?, ?)'),
      opsCount:      db.prepare('SELECT COUNT(*) as cnt FROM space_ops WHERE space_id = ?'),
      opsTrim:       db.prepare('DELETE FROM space_ops WHERE space_id = ? AND seq IN (SELECT seq FROM space_ops WHERE space_id = ? ORDER BY seq ASC LIMIT ?)'),
    }
    return _s
  }

  const loadSpaceMeta = async (spaceId) => rowToMeta(s().selectById.get(spaceId))

  const saveSpaceMeta = async (spaceId, meta) => {
    s().upsert.run(
      spaceId,
      meta.label ?? '',
      meta.permanent ? 1 : 0,
      meta.allowEdits !== false ? 1 : 0,
      meta.publishedProjectId ?? null,
      meta.sceneVersion ?? 0,
      meta.createdAt ?? Date.now(),
      meta.updatedAt ?? Date.now(),
      meta.lastTouchedAt ?? Date.now()
    )
    const { spaceDir } = getSpacePaths(spaceId)
    await ensureDir(spaceDir)
  }

  const spaceExists = async (spaceId) => Boolean(s().selectExists.get(spaceId))

  const upsertSpaceMeta = async (spaceId, updates = {}) => {
    const db = getDb()
    const { insert, update, selectById } = s()
    const now = Date.now()
    return db.transaction(() => {
      const row = selectById.get(spaceId)
      if (!row) {
        const meta = buildMeta(spaceId, updates)
        insert.run(spaceId, meta.label, meta.permanent ? 1 : 0, meta.allowEdits !== false ? 1 : 0, meta.publishedProjectId ?? null, meta.sceneVersion ?? 0, meta.createdAt, meta.updatedAt, meta.lastTouchedAt)
        return meta
      }
      const nextLabel     = 'label'            in updates ? (updates.label ?? '')                                                                    : row.label
      const nextPermanent = 'permanent'        in updates ? (Boolean(updates.permanent) ? 1 : 0)                                                    : row.permanent
      const nextEdits     = 'allowEdits'       in updates ? (updates.allowEdits !== false ? 1 : 0)                                                  : row.allow_edits
      const nextPublished = 'publishedProjectId' in updates ? (updates.publishedProjectId ?? null)                                                   : row.published_project_id
      const nextVersion   = 'sceneVersion'     in updates ? (Number.isFinite(Number(updates.sceneVersion)) ? Number(updates.sceneVersion) : row.scene_version) : row.scene_version
      const nextTouched   = updates.touch !== false ? now : row.last_touched_at
      update.run(nextLabel, nextPermanent, nextEdits, nextPublished, nextVersion, now, nextTouched, spaceId)
      return rowToMeta({ ...row, label: nextLabel, permanent: nextPermanent, allow_edits: nextEdits, published_project_id: nextPublished, scene_version: nextVersion, updated_at: now, last_touched_at: nextTouched })
    })()
  }

  const ensureDefaultSpace = async () => {
    const id = normalizeSpaceId(defaultSpaceId) || defaultSpaceId
    if (!await loadSpaceMeta(id)) {
      await saveSpaceMeta(id, buildMeta(id, { label: 'Main Space', permanent: true }))
    }
    const { spaceDir, assetsDir } = getSpacePaths(id)
    await ensureDir(spaceDir)
    await ensureDir(assetsDir)
  }

  const ensureSpaceScene = async (spaceId) => {
    const { scenePath, assetsDir } = getSpacePaths(spaceId)
    await ensureDir(path.dirname(scenePath))
    await ensureDir(assetsDir)
    try {
      await fsp.access(scenePath)
    } catch (error) {
      if (error.code === 'ENOENT') await writeJson(scenePath, blankScene)
      else throw error
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

  const listSpaces = async () => s().selectAll.all().map(rowToMeta)

  const deleteSpace = async (spaceId) => {
    s().deleteById.run(spaceId)
    const { spaceDir } = getSpacePaths(spaceId)
    await fsp.rm(spaceDir, { recursive: true, force: true })
  }

  const pruneSpaces = async () => {
    if (!defaultTtlMs) return
    const cutoff = Date.now() - defaultTtlMs
    const rows = s().selectStale.all(cutoff)
    await Promise.all(rows.map(row => deleteSpace(row.id)))
  }

  const readOpsHistory = async (spaceId) =>
    s().opsSelect.all(spaceId).map(row => JSON.parse(row.data))

  const writeOpsHistory = async (spaceId, ops) => {
    const { opsDeleteAll, opsInsert } = s()
    const now = Date.now()
    getDb().transaction(() => {
      opsDeleteAll.run(spaceId)
      for (const op of (Array.isArray(ops) ? ops : [])) {
        opsInsert.run(spaceId, op.version ?? 0, JSON.stringify(op), op.timestamp ?? now)
      }
    })()
  }

  const appendOpsHistory = async (spaceId, newOps = [], maxHistory = 500) => {
    if (!Array.isArray(newOps) || newOps.length === 0) return
    const { opsInsert, opsCount, opsTrim } = s()
    const now = Date.now()
    getDb().transaction(() => {
      for (const op of newOps) {
        opsInsert.run(spaceId, op.version ?? 0, JSON.stringify(op), op.timestamp ?? now)
      }
      const { cnt } = opsCount.get(spaceId)
      if (cnt > maxHistory) opsTrim.run(spaceId, spaceId, cnt - maxHistory)
    })()
  }

  const collectSceneAssetRefs = (objects = []) => {
    const refs = new Map()
    const addRef = (asset) => {
      if (asset?.id && !refs.has(asset.id)) refs.set(asset.id, asset)
    }
    objects.forEach((obj) => {
      addRef(obj?.asset)
      addRef(obj?.assetRef)
      addRef(obj?.materialsAssetRef)
      if (Array.isArray(obj?.assets)) obj.assets.forEach(addRef)
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
      merged.set(asset.id, {
        ...(merged.get(asset.id) || {}),
        ...asset,
        ...(baseUrl ? { url: `${baseUrl}/${asset.id}` } : {})
      })
    }
    if (Array.isArray(scene.assets)) scene.assets.forEach(addAsset)
    collectSceneAssetRefs(Array.isArray(scene.objects) ? scene.objects : []).forEach(addAsset)
    if (!merged.size) return scene
    return {
      ...scene,
      assets: Array.from(merged.values()),
      ...(baseUrl ? { assetsBaseUrl: scene.assetsBaseUrl || baseUrl } : {})
    }
  }

  const serveAsset = async (spaceId, assetId, res) => {
    const { assetsDir } = getSpacePaths(spaceId)
    const filePath = path.join(assetsDir, assetId)
    const meta = await readJson(path.join(assetsDir, `${assetId}.json`), null)
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

module.exports = { createSpaceStore }
