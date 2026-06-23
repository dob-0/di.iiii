import { buildProjectAssetUrl } from '../services/projectsApi.js'

// Build the id -> asset lookup the viewport leaf renderer reads.
// Some imported projects never got a real asset URL written (a legacy import
// gap) — fall back to the standard project asset endpoint so those assets
// still resolve instead of silently failing to render.
export function buildAssetMap(projectDocument) {
    const projectId = projectDocument?.projectMeta?.id
    return new Map((projectDocument?.assets || []).map((asset) => [
        asset.id,
        asset.url || !projectId ? asset : { ...asset, url: buildProjectAssetUrl(projectId, asset.id) }
    ]))
}
