import { buildProjectAssetUrl } from '../services/projectsApi.js'
import { mountRelativeApiUrl } from '../../services/assetSources.js'

// Build the id -> asset lookup the viewport leaf renderer reads.
// Some imported projects never got a real asset URL written (a legacy import
// gap) — fall back to the standard project asset endpoint so those assets
// still resolve instead of silently failing to render. Stored urls recorded
// as site-root-relative `/api/...` paths are remounted onto the deployed API
// base (`/serverXR` on the VPS) — used verbatim they hit the nginx SPA
// fallback and every image renders as a blank placeholder tile.
export function buildAssetMap(projectDocument, fallbackProjectId = null) {
    const projectId = projectDocument?.projectMeta?.id || fallbackProjectId
    return new Map((projectDocument?.assets || []).map((asset) => {
        const mountedUrl = asset.url ? mountRelativeApiUrl(asset.url) : null
        const url = mountedUrl
            || asset.url
            || (projectId ? buildProjectAssetUrl(projectId, asset.id) : null)
        return [asset.id, !url || url === asset.url ? asset : { ...asset, url }]
    }))
}
