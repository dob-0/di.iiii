// WALK AT — open a room standing at a named viewpoint (a test, a judge, the owner's link).
//
//   ?at=<id>             a view of the project (presentationState.viewPresets, views as data, viewData.js) that is
//                        live or marked `link: true`. `cafe` and `door_corridor` find `room-cafe` / `room-door-corridor` first, then a view of that exact id
//                        (the ids scripts/place/model-hall/write_place.py gives each room's viewpoint).
//   ?pose=x,y,z,yaw      a raw pose: eye at (x, y, z) in metres, yaw in degrees (0 = facing +Z, the walker's own
//                        convention: forward = (sin yaw, cos yaw)). For a tester; nothing is stored.
// Either opens the room walking at that pose (PublicProjectViewer), in place of worldState.spawn.
// A work view (live false, no `link`) is never reached by a link: the views-as-data rule (2026-10-13) keeps it to the Studio.
// Pure: no React, no three.js.

const num = (v) => (v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null))

/** { id } | { pose: [x, y, z, yawDeg] } | null, from a location.search string. */
export const parseWalkAt = (search) => {
    let params
    try { params = new URLSearchParams(search || '') } catch { return null }
    const pose = params.get('pose')
    if (pose) {
        const parts = pose.split(',').map(num)
        if (parts.length === 4 && parts.every((v) => v !== null)) return { pose: parts }
    }
    const id = String(params.get('at') || '').trim().toLowerCase()
    return /^[a-z][a-z0-9_-]{0,40}$/.test(id) ? { id } : null
}

const slug = (id) => id.replace(/_/g, '-')

/** The view an `at` id names: exact id, then `room-<id>`; only a live or linkable view with a camera. */
export const findWalkAtView = (viewPresets, id) => {
    if (!Array.isArray(viewPresets) || !id) return null
    // a room's own viewpoint first: another view may share the room's name (Cinema House has a 'door_corridor' view whose
    // camera stands outside the corridor, a solved photo camera, 2026-11-01)
    const wanted = [`room-${slug(id)}`, id, slug(id)]
    for (const want of wanted) {
        const v = viewPresets.find((item) => item && item.id === want)
        if (!v) continue
        const ok = Array.isArray(v.position) && v.position.length >= 3 && Array.isArray(v.target) && v.target.length >= 3
        if (ok && (v.live === true || v.link === true)) return v
    }
    return null
}

/** The walker's pose { x, z, yaw, pitch, altY } for an `at`, or null. */
export const walkAtSpawn = (doc, at) => {
    if (!at) return null
    if (at.pose) {
        const [x, y, z, yawDeg] = at.pose
        return { x, z, yaw: (yawDeg * Math.PI) / 180, pitch: 0, altY: y }
    }
    const v = findWalkAtView(doc?.presentationState?.viewPresets, at.id)
    if (!v) return null
    const [x, y, z] = v.position.map(Number)
    const [tx, ty, tz] = v.target.map(Number)
    const flat = Math.hypot(tx - x, tz - z)
    return { x, z, yaw: Math.atan2(tx - x, tz - z), pitch: flat > 1e-6 ? Math.atan2(ty - y, flat) : 0, altY: y }
}
