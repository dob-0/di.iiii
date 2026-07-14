// public_assets — the asset commons: space assets a user marked public so any
// space can discover and reuse them. Rows are keyed by the content-hash asset
// id, so the same bytes shared twice stay one entry; space_id points at the
// origin space whose asset store still holds the bytes.

const { getDb } = require('./db')

const toPublic = (row) => row && ({
  assetId: row.asset_id,
  spaceId: row.space_id,
  name: row.name,
  mimeType: row.mime_type || '',
  size: row.size || 0,
  license: row.license || null,
  sharedBy: row.shared_by || null,
  sharedByLabel: row.shared_by_label || null,
  createdAt: row.created_at
})

const shareAsset = ({ assetId, spaceId, name, mimeType = '', size = 0, license = null, sharedBy = null, sharedByLabel = null }) => {
  getDb().prepare(
    `INSERT INTO public_assets (asset_id, space_id, name, mime_type, size, license, shared_by, shared_by_label, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(asset_id) DO UPDATE SET
       space_id=excluded.space_id, name=excluded.name, mime_type=excluded.mime_type,
       size=excluded.size, license=excluded.license,
       shared_by=excluded.shared_by, shared_by_label=excluded.shared_by_label`
  ).run(assetId, spaceId, name, mimeType, size, license, sharedBy, sharedByLabel, Date.now())
  return getAsset(assetId)
}

const unshareAsset = (assetId) =>
  getDb().prepare('DELETE FROM public_assets WHERE asset_id = ?').run(assetId).changes > 0

// Space moved (e.g. guest sandbox -> account) — repoint any commons entries
// still referencing the old id so they don't go stale pointing at a space
// id that no longer exists.
const updateSpaceId = (fromSpaceId, toSpaceId) =>
  getDb().prepare('UPDATE public_assets SET space_id = ? WHERE space_id = ?').run(toSpaceId, fromSpaceId)

// Space deleted outright — its shared commons entries no longer point at
// anything real and would otherwise survive forever in listings.
const deleteBySpace = (spaceId) =>
  getDb().prepare('DELETE FROM public_assets WHERE space_id = ?').run(spaceId)

const getAsset = (assetId) =>
  toPublic(getDb().prepare('SELECT * FROM public_assets WHERE asset_id = ?').get(assetId))

const listAssets = ({ q = '', limit = 100 } = {}) => {
  const capped = Math.max(1, Math.min(Number(limit) || 100, 200))
  if (q) {
    return getDb().prepare(
      'SELECT * FROM public_assets WHERE name LIKE ? ORDER BY created_at DESC LIMIT ?'
    ).all(`%${q}%`, capped).map(toPublic)
  }
  return getDb().prepare(
    'SELECT * FROM public_assets ORDER BY created_at DESC LIMIT ?'
  ).all(capped).map(toPublic)
}

// Which of these asset ids are shared? Used to annotate a space's asset list.
const getSharedIdSet = (assetIds = []) => {
  const ids = assetIds.filter(Boolean)
  if (!ids.length) return new Set()
  const placeholders = ids.map(() => '?').join(',')
  const rows = getDb().prepare(
    `SELECT asset_id FROM public_assets WHERE asset_id IN (${placeholders})`
  ).all(...ids)
  return new Set(rows.map((r) => r.asset_id))
}

module.exports = { shareAsset, unshareAsset, getAsset, listAssets, getSharedIdSet, updateSpaceId, deleteBySpace }
