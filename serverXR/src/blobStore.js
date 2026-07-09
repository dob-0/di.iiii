const path = require('node:path')
const fsp = require('node:fs/promises')

// Per-space content-addressed blob store: spaces/<spaceId>/blobs/<sha256>.
// Bytes live once per space; projects hold only <hash>.json references in
// their own assets dir. Blobs are never deleted by asset routes — only by
// scripts/gc-space-blobs.mjs once nothing references them.

const getSpaceBlobPaths = (spacesDir, spaceId) => {
  const blobsDir = path.join(spacesDir, spaceId, 'blobs')
  return {
    blobsDir,
    blobPath: (hash) => path.join(blobsDir, hash)
  }
}

const hasBlob = async (spacesDir, spaceId, hash) => {
  try {
    await fsp.access(getSpaceBlobPaths(spacesDir, spaceId).blobPath(hash))
    return true
  } catch {
    return false
  }
}

// Moves an uploaded temp file into the blob store; discards the temp file if
// the blob already exists. Content addressing makes overwrites meaningless.
const storeBlobFromFile = async (spacesDir, spaceId, hash, tempPath) => {
  const { blobsDir, blobPath } = getSpaceBlobPaths(spacesDir, spaceId)
  await fsp.mkdir(blobsDir, { recursive: true })
  const target = blobPath(hash)
  if (await hasBlob(spacesDir, spaceId, hash)) {
    await fsp.rm(tempPath, { force: true }).catch(() => {})
    return target
  }
  try {
    await fsp.rename(tempPath, target)
  } catch (error) {
    if (error.code !== 'EXDEV') throw error
    await fsp.copyFile(tempPath, target)
    await fsp.rm(tempPath, { force: true }).catch(() => {})
  }
  return target
}

module.exports = {
  getSpaceBlobPaths,
  hasBlob,
  storeBlobFromFile
}
