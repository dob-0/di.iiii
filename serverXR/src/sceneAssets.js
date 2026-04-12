const path = require('node:path')
const fsp = require('node:fs/promises')

const ASSET_ID_REGEX = /^[a-z0-9][a-z0-9_-]{2,127}$/i

const isValidAssetId = (value = '') => ASSET_ID_REGEX.test(String(value).trim())

const filterAvailableSceneAssets = async (scene, assetsDir) => {
  if (!scene || typeof scene !== 'object' || !Array.isArray(scene.assets) || !scene.assets.length) {
    return scene
  }
  const availableAssets = []
  for (const asset of scene.assets) {
    if (!asset?.id || !isValidAssetId(asset.id)) continue
    try {
      await fsp.access(path.join(assetsDir, asset.id))
      availableAssets.push(asset)
    } catch {
      // Skip manifest entries whose asset file is missing on disk.
    }
  }
  if (availableAssets.length === scene.assets.length) {
    return scene
  }
  return {
    ...scene,
    assets: availableAssets
  }
}

module.exports = {
  ASSET_ID_REGEX,
  isValidAssetId,
  filterAvailableSceneAssets
}
