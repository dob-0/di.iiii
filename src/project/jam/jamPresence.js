// Where everybody is standing.
//
// The presence channel already carries a cursor: a 2D screen fraction emitted
// on `pointermove` and drawn as an HTML dot over the other person's viewport
// (StudioViewport emits it, EditorOverlays and RawViewport draw it). That is the
// right answer for two people looking at the same orbit view on laptops. It is
// no answer at all for twenty phones in a jam — a touch screen fires no
// `pointermove`, so every phone emits nothing, and twenty people in one scene
// read to each other as twenty empty solo sessions.
//
// So this adds a SECOND field, `standing`, beside the existing `x`/`y` rather
// than replacing them. Every existing reader keeps reading exactly the key it
// always read; a reader that knows nothing about `standing` ignores it, which is
// what "additively" has to mean if Studio and the node editor are not to break.
//
// `x`/`y` are still sent, pinned to the centre of the screen. That is not filler:
// in a first-person view the crosshair IS the pointer — the walker's own canvas
// sets `cursor: 'crosshair'` and pointer lock parks it dead centre — so a jam
// visitor showing up mid-viewport in somebody's Studio is the true picture, and
// omitting the field would instead have parked them in the top-left corner,
// where `(cursor.x || 0)` sends anything missing.

// Screen-centre, the first-person crosshair. See the note above.
export const JAM_CURSOR_CENTRE = Object.freeze({ x: 0.5, y: 0.5 })

// Presence is chatter, not a document: one decimal place on metres and radians
// is far finer than a marker a person can see, and keeps a still visitor from
// re-emitting on floating-point noise.
const round = (value, places = 2) => {
    const factor = 10 ** places
    return Math.round(value * factor) / factor
}

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value)

/**
 * The payload a jam walker emits through `emitCursor`.
 *
 * @param {object} pose — the walker's own pose: { x, z, altY, yaw }.
 * @returns {object} { x, y, standing: { position: [x, y, z], heading } }
 */
export const buildJamCursorPayload = (pose = {}) => {
    const { x, z, altY, yaw } = pose
    if (!isFiniteNumber(x) || !isFiniteNumber(z)) return { ...JAM_CURSOR_CENTRE }
    return {
        ...JAM_CURSOR_CENTRE,
        standing: {
            position: [round(x), round(isFiniteNumber(altY) ? altY : 1.6), round(z)],
            heading: round(isFiniteNumber(yaw) ? yaw : 0)
        }
    }
}

// Worth re-sending? Presence is throttled at 80ms upstream, but a walker's pose
// changes every frame, so this is what stops a still visitor emitting 12 times a
// second saying nothing.
export const JAM_PRESENCE_MOVE_EPSILON = 0.15
export const JAM_PRESENCE_TURN_EPSILON = 0.05

// A marker goes stale and disappears after 3s of silence (CURSOR_STALE_MS in
// useProjectPresence). Somebody standing perfectly still is still standing
// there, so a pose is re-sent on this heartbeat even when nothing changed —
// without it, the people who stop to look at something are exactly the people
// who vanish.
export const JAM_PRESENCE_HEARTBEAT_MS = 2000

export const hasMovedEnough = (previous, next) => {
    if (!previous) return true
    const moved = Math.hypot((next.x || 0) - (previous.x || 0), (next.z || 0) - (previous.z || 0))
    let turned = Math.abs((next.yaw || 0) - (previous.yaw || 0))
    // yaw is unbounded — a walker spinning past 2π must not read as a huge turn.
    turned = Math.abs(((turned + Math.PI) % (Math.PI * 2)) - Math.PI)
    return moved >= JAM_PRESENCE_MOVE_EPSILON || turned >= JAM_PRESENCE_TURN_EPSILON
}

/**
 * Should this pose go out? Either the walker actually moved, or the heartbeat
 * is due and the marker would otherwise go stale.
 */
export const shouldEmitPose = (previous, next, elapsedMs = 0) => (
    hasMovedEnough(previous, next) || elapsedMs >= JAM_PRESENCE_HEARTBEAT_MS
)

const readStanding = (entry) => {
    const standing = entry?.cursor?.standing
    const position = standing?.position
    if (!Array.isArray(position) || position.length < 3) return null
    if (!position.every(isFiniteNumber)) return null
    return {
        position: [position[0], position[1], position[2]],
        heading: isFiniteNumber(standing.heading) ? standing.heading : 0
    }
}

/**
 * Everyone else who is standing somewhere in the scene, ready to be drawn as a
 * marker. Entries with no `standing` — a laptop in Studio, an older client —
 * are skipped rather than dropped at the origin.
 *
 * @param {object} cursors — the presence hook's `cursors` map, keyed by socket.
 * @param {object} options — { selfUserId } so you never mark your own feet.
 */
export const readStandingVisitors = (cursors = {}, { selfUserId = '' } = {}) => (
    Object.entries(cursors || {})
        .map(([key, entry]) => {
            if (selfUserId && entry?.userId === selfUserId) return null
            const standing = readStanding(entry)
            if (!standing) return null
            return {
                key,
                label: entry?.userName || '',
                position: standing.position,
                heading: standing.heading
            }
        })
        .filter(Boolean)
)

/**
 * Are these the same people, standing in the same places?
 *
 * Presence arrives as fast as twenty phones can send it, and every new array of
 * visitors re-reconciles the three.js subtree that draws the markers. This is
 * what lets the surface throw away an update that would redraw the identical
 * picture. Compares what is actually drawn — who, where, facing which way — and
 * nothing else.
 */
export const sameStandingVisitors = (a = [], b = []) => {
    if (a === b) return true
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) {
        const left = a[i]
        const right = b[i]
        if (left.key !== right.key) return false
        if (left.label !== right.label) return false
        if (left.heading !== right.heading) return false
        if (left.position[0] !== right.position[0]) return false
        if (left.position[1] !== right.position[1]) return false
        if (left.position[2] !== right.position[2]) return false
    }
    return true
}

/**
 * "7 people here" — the count at the top of the jam.
 *
 * Counts distinct people, not sockets: one person with the scene open in two
 * tabs is one person. Always at least 1, because you are here.
 */
export const countPeopleHere = (users = [], { selfUserId = '' } = {}) => {
    const ids = new Set()
    if (selfUserId) ids.add(selfUserId)
    for (const user of Array.isArray(users) ? users : []) {
        const id = user?.userId || user?.socketId
        if (id) ids.add(id)
    }
    return Math.max(1, ids.size)
}

export const describePeopleHere = (count) => (
    count === 1 ? 'Just you here' : `${count} people here`
)
