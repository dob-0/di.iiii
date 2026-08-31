import { apiFetch, hasServerApi, apiBaseUrl } from './apiClient.js'
import { normalizeSpaceId } from '../utils/spaceNames.js'

export const supportsServerSpaces = hasServerApi

const resolveServerSpaceId = (spaceId = '') => normalizeSpaceId(spaceId) || String(spaceId || '').trim()

export const listServerSpaces = async () => {
    const data = await apiFetch('/api/spaces')
    return data.spaces || []
}

// Full index payload: the spaces plus, for admins, the collapsed sandbox
// summary ({ total, stale }) the hub shows instead of sandbox cards.
export const fetchServerSpacesIndex = async () => {
    const data = await apiFetch('/api/spaces')
    return { spaces: data.spaces || [], sandboxSummary: data.sandboxSummary || null }
}

export const purgeStaleSandboxes = async () =>
    apiFetch('/api/admin/sandboxes/purge', { method: 'POST' })

export const getServerSpace = async (spaceId) => {
    const data = await apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}`)
    return data.space || null
}

// Resolves a bare /{spaceSlugOrId}/{projectSlugOrId} public link to its real
// ids — docs/architecture/SPEC_space_urls_and_portability.md. Segments are
// forwarded verbatim (not run through resolveServerSpaceId) since the server
// does its own slug-or-id matching; returns null on a 404 rather than
// throwing, so callers can fall through to a plain space route instead of
// treating "not a real project slug" as an error.
export const resolveVanityProjectLink = async (spaceSegment, projectSegment) => {
    try {
        const data = await apiFetch(`/api/resolve/${encodeURIComponent(spaceSegment)}/${encodeURIComponent(projectSegment)}`)
        return { space: data.space || null, project: data.project || null }
    } catch (error) {
        if (error?.status === 404) return null
        throw error
    }
}

export const createServerSpace = async ({ label, slug, isPermanent = false } = {}) => {
    const data = await apiFetch('/api/spaces', {
        method: 'POST',
        body: { label, permanent: isPermanent, slug }
    })
    return data.space
}

/**
 * Save a space as one file — the same document `di save` writes, downloaded by
 * the browser instead of the terminal.
 *
 * A plain navigation rather than a fetch: the file can be large, and the point
 * is to land in the artist's Downloads folder with its own name, which is what
 * Content-Disposition already tells the browser to do. Reading a whole bundle
 * into memory to hand it back as a blob would only be a slower way to get to
 * the same place.
 */
export const saveSpaceToFile = (spaceId) => {
    const id = resolveServerSpaceId(spaceId)
    window.location.assign(`${apiBaseUrl}/api/spaces/${id}/bundle`)
}

/**
 * Open a file someone saved. Multipart because it is a file, and the server
 * hands it to the same tool `di open` uses — one implementation of the format.
 */
export const openSpaceFromFile = async (file, { as = null } = {}) => {
    const form = new FormData()
    form.append('bundle', file)
    if (as) form.append('as', as)
    const response = await fetch(`${apiBaseUrl}/api/spaces/bundle`, {
        method: 'POST',
        body: form,
        credentials: 'include'
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
        // The server passes the bundle tool's own sentence through — "this file
        // was written by a newer di.iiii" — and those are the words worth
        // showing. `code` travels with it so the caller can offer a way out of
        // the one failure that has one: a name already taken.
        const error = new Error(data?.error || 'That file could not be opened.')
        error.code = data?.code || null
        error.spaceId = data?.spaceId || null
        throw error
    }
    return data
}

export const updateServerSpace = async (spaceId, updates = {}) => {
    const data = await apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}`, {
        method: 'PATCH',
        body: {
            label: updates.label,
            permanent: updates.isPermanent,
            allowEdits: updates.allowEdits,
            isPublic: updates.isPublic,
            kind: updates.kind,
            publishedProjectId: updates.publishedProjectId,
            previewImageAssetId: updates.previewImageAssetId,
            // Forwarded explicitly because both are meaningfully null: a null
            // slug clears the public handle back to id-only addressing, and a
            // null owner returns the space to di.iiii. undefined (the key
            // absent) still means "don't touch" — JSON.stringify drops it.
            ...(updates.slug !== undefined ? { slug: updates.slug } : {}),
            ...(updates.ownerUserId !== undefined ? { ownerUserId: updates.ownerUserId } : {}),
            ...(updates.openInscriptions !== undefined ? { openInscriptions: updates.openInscriptions } : {})
        }
    })
    return data.space
}

export const mintSpaceInvite = async (spaceId, label = 'invite') => {
    const data = await apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/invites`, {
        method: 'POST',
        body: { label }
    })
    return data
}

export const redeemSpaceInvite = async (token) =>
    apiFetch('/api/invites/redeem', { method: 'POST', body: { token } })

// `width` requests a resized/cached image variant (ignored for non-image
// assets, or served at full size if generation fails) — see spaceStore.js
// serveAsset. Omit for the original file.
export const getServerSpaceAssetUrl = (spaceId, assetId, { width } = {}) =>
    `${apiBaseUrl}/api/spaces/${resolveServerSpaceId(spaceId)}/assets/${assetId}${width ? `?w=${width}` : ''}`

export const deleteServerSpace = async (spaceId) => {
    await apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}`, { method: 'DELETE' })
}

export const touchServerSpace = async (spaceId) => {
    const data = await apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/touch`, { method: 'POST' })
    return data.space
}

export const getServerScene = async (spaceId) => {
    const data = await apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/scene`)
    return {
        scene: data.scene,
        version: data.version ?? 0
    }
}

export const getServerSceneOps = async (spaceId, since) => {
    const query = Number.isFinite(since) ? `?since=${since}` : ''
    const data = await apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/ops${query}`)
    return {
        ops: data.ops || [],
        latestVersion: data.latestVersion ?? 0
    }
}

export const submitSceneOps = async (spaceId, baseVersion, ops = []) => {
    if (!spaceId) throw new Error('space id required')
    const payload = {
        baseVersion: Number.isFinite(baseVersion) ? baseVersion : 0,
        ops
    }
    return apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/ops`, {
        method: 'POST',
        body: payload
    })
}

/**
 * Replace a space's whole scene.
 *
 * `expectedVersion` is the version this overwrite is deliberately replacing.
 * Passing it makes even a forced publish conditional: the server refuses with
 * 409 if the scene moved AGAIN between the moment the person was shown a
 * version number and the moment they confirmed. Omitting it is unconditional
 * last-write-wins, which is what every caller did before preconditions existed.
 */
export const overwriteServerScene = async (spaceId, sceneData, { expectedVersion = null } = {}) => {
    if (!spaceId) throw new Error('space id required')
    if (!sceneData || typeof sceneData !== 'object') {
        throw new Error('scene data required')
    }
    return apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/scene`, {
        method: 'PUT',
        headers: Number.isInteger(expectedVersion) ? { 'If-Match': `"${expectedVersion}"` } : undefined,
        body: sceneData
    })
}

export const getSpaceGithubLink = async (spaceId) => {
    const data = await apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/github-link`)
    return data.link || null
}

export const connectSpaceGithub = async (spaceId, { owner, repo, projectId, ref, entry } = {}) => {
    return apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/github-link`, {
        method: 'POST',
        body: { owner, repo, projectId, ref, entry }
    })
}

export const disconnectSpaceGithub = async (spaceId) => {
    await apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/github-link`, { method: 'DELETE' })
}

export const getGithubAppInfo = async () => apiFetch('/api/github/app')

export const listGithubRepos = async ({ refresh = false } = {}) =>
    apiFetch(`/api/github/repos${refresh ? '?refresh=1' : ''}`)

export const getServerConfig = async () => {
    const data = await apiFetch('/api/config')
    return data.config || {}
}

export const patchServerConfig = async (updates = {}) => {
    const data = await apiFetch('/api/config', { method: 'PATCH', body: updates })
    return data.config || {}
}

export const listServerSpaceAssets = async (spaceId) => {
    const data = await apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/assets`)
    return data.assets || []
}

export const uploadServerAsset = async (spaceId, file, options = {}) => {
    if (!spaceId) throw new Error('space id required')
    if (!file) throw new Error('file required')
    const formData = new FormData()
    if (options.assetId) {
        formData.append('assetId', options.assetId)
    }
    if (options.filename) {
        formData.append('asset', file, options.filename)
    } else {
        formData.append('asset', file)
    }
    const data = await apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/assets`, {
        method: 'POST',
        body: formData
    })
    return data
}

export const importDriveAssets = async (spaceId, url) => {
    if (!spaceId) throw new Error('space id required')
    if (!url) throw new Error('drive url required')
    const data = await apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/assets/import-drive`, {
        method: 'POST',
        body: { url }
    })
    return data
}

// Asset commons — publicly shared assets, reusable across all spaces ---------

export const setAssetShared = async (spaceId, assetId, shared, license = '') => {
    if (!spaceId) throw new Error('space id required')
    if (!assetId) throw new Error('asset id required')
    return apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/assets/${assetId}/share`, {
        method: 'POST',
        body: { public: Boolean(shared), license }
    })
}

export const listCommonsAssets = async ({ q = '' } = {}) => {
    const suffix = q ? `?q=${encodeURIComponent(q)}` : ''
    const data = await apiFetch(`/api/commons/assets${suffix}`)
    return data.assets || []
}

// Delete a space file. Server answers 409 { usedBy } while entities still
// reference it; pass force after the user confirms.
export const deleteServerAsset = async (spaceId, assetId, { force = false } = {}) => {
    if (!spaceId) throw new Error('space id required')
    if (!assetId) throw new Error('asset id required')
    const suffix = force ? '?force=1' : ''
    return apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/assets/${assetId}${suffix}`, { method: 'DELETE' })
}

// Admin moderation — remove any commons entry regardless of origin space.
export const removeCommonsAsset = async (assetId) => {
    if (!assetId) throw new Error('asset id required')
    return apiFetch(`/api/commons/assets/${assetId}`, { method: 'DELETE' })
}

export const importCommonsAssets = async (spaceId, assetIds) => {
    if (!spaceId) throw new Error('space id required')
    const ids = Array.isArray(assetIds) ? assetIds.filter(Boolean) : []
    if (!ids.length) throw new Error('select at least one asset')
    return apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/assets/import-commons`, {
        method: 'POST',
        body: { assetIds: ids }
    })
}

// "Connect your Drive" (per-user OAuth) --------------------------------------

export const getDriveConnectUrl = () => `${apiBaseUrl}/api/integrations/google-drive/connect`

export const getDriveStatus = async () =>
    apiFetch('/api/integrations/google-drive/status')

export const listDriveFiles = async ({ q = '', folderId = '' } = {}) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (folderId) params.set('folderId', folderId)
    const suffix = params.toString() ? `?${params.toString()}` : ''
    return apiFetch(`/api/integrations/google-drive/files${suffix}`)
}

export const disconnectDrive = async () =>
    apiFetch('/api/integrations/google-drive/disconnect', { method: 'POST' })

export const getDrivePickerToken = async () =>
    apiFetch('/api/integrations/google-drive/picker-token')

export const importDriveSelection = async (spaceId, fileIds) => {
    if (!spaceId) throw new Error('space id required')
    const ids = Array.isArray(fileIds) ? fileIds.filter(Boolean) : []
    if (!ids.length) throw new Error('select at least one file')
    return apiFetch(`/api/spaces/${resolveServerSpaceId(spaceId)}/assets/import-drive-account`, {
        method: 'POST',
        body: { fileIds: ids }
    })
}
