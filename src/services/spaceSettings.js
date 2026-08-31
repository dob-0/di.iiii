import { apiFetch } from './apiClient.js'
import { normalizeSpaceId } from '../utils/spaceNames.js'

// One small JSON object per space, beside its scene. It exists for CODE
// spaces — a piece written as React in src/ has no project document, so
// anything its author tunes had nowhere on the server to live.
//
// di.iiii does not know what the keys mean; the piece does. Namespace
// yours (see algoVrithm/timingOverlay.js) so two code spaces sharing this
// blob cannot overwrite each other.

const resolve = (spaceId = '') => normalizeSpaceId(spaceId) || String(spaceId || '').trim()

/**
 * Never throws for the reader's benefit: a piece must render whether or not
 * the server answered, so an unreachable backend reads as "nothing saved"
 * rather than a blank page.
 */
export const getSpaceSettings = async (spaceId) => {
    try {
        const data = await apiFetch(`/api/spaces/${resolve(spaceId)}/settings`)
        const settings = data?.settings
        return settings && typeof settings === 'object' ? settings : {}
    } catch {
        return {}
    }
}

/** Throws — a save that failed must say so, unlike a read that found nothing. */
export const putSpaceSettings = async (spaceId, settings) => {
    const data = await apiFetch(`/api/spaces/${resolve(spaceId)}/settings`, {
        method: 'PUT',
        body: { settings }
    })
    return data?.settings || settings
}
