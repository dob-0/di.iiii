// THE BUILD, ASKED FOR FROM A PHONE — and the honest 404.
//
// Turning a walk into a room runs Meshroom on a GPU, reads and writes gigabytes,
// and spawns a process. That belongs on the studio machine and nowhere else: on a
// hosted tier the route does not exist, and says so the way /light does — 404,
// not 403, because a deployed server should not admit the route is a thing
// (serverXR/src/localRuntimeGuard.js).
//
// So a 404 here is not a fault and must not be printed as one. The footage still
// collects on every tier, which is the whole point of collecting it in the space
// rather than in an application on the phone: the walk is safe, and the copy is
// built later, on the machine that can build it.

import { apiFetch } from '../services/apiClient.js'

/** Ask for the hall. `scaleEdge` is the measured wall, in metres, or null. */
export const requestPlaceBuild = async (spaceId, { scaleEdge = null, gpu = null } = {}) =>
    apiFetch(`/api/spaces/${spaceId}/place/build`, {
        method: 'POST',
        body: {
            ...(Number.isFinite(Number(scaleEdge)) && Number(scaleEdge) > 0 ? { scaleEdge: Number(scaleEdge) } : {}),
            ...(gpu ? { gpu } : {})
        }
    })

/**
 * How it is going. A hosted tier answers 404 and that reads as "nothing here" —
 * the button then says the copy is built on the studio machine, which is true,
 * rather than showing a failure.
 */
export const readPlaceBuild = async (spaceId) => {
    try {
        return await apiFetch(`/api/spaces/${spaceId}/place/build`)
    } catch (error) {
        // 404: no such route here. 403: the route exists but is loopback-only
        // (DI_ALLOW_LAN_DEVICES unset), which is the ORDINARY answer for a phone
        // on the wifi — this surface has no other kind of caller. Both mean "not
        // this device's job", and neither is worth throwing a poll over.
        const status = Number(error?.status)
        if (status === 404 || status === 403) return null
        throw error
    }
}
