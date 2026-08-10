// The live-port contract.
//
// Some node outputs cannot be serialized into `node.values`: a webcam's
// THREE.VideoTexture, a mic's Uint8Array spectrum, a MIDI note that arrived
// between frames, an agent's streamed reply. Those ride a side channel —
// a Map the renderer owns and the evaluator reads — rather than the op-log,
// because the op-log is a document history and a video frame is not history.
//
// That side channel already existed as a bare `Map` keyed by an inline
// `${nodeId}:${portId}` template literal written out longhand in seven places.
// This module is that Map with the key spelled once, plus the one thing the
// bare Map could not express: WHY a port has no value.
//
// The status is not decoration. `null` on a webcam's frame port means five
// different things to the person looking at the node — the camera is warming
// up, they denied permission, the device is missing, the capture threw, or
// they simply have not started it. A bare Map collapses all five into
// "undefined", so the node can only ever say nothing. Every prior-art system
// that got this right (TouchDesigner's Info DAT, Notch's per-node error state,
// Wire's per-node stats) surfaces the reason next to the node, and the ones
// that did not are the ones whose users file "it just doesn't work" bugs.
//
// Ordering note: value and status are set together, always. A port that holds
// a value is LIVE by definition, and a port that reports an error must not
// still be handing out the last good frame — a stale texture that looks fine
// is worse than a blank one that says why.

export const PORT_STATUS = Object.freeze({
    // Nothing has asked for it yet. The resting state, and the only one that
    // is not worth showing the user.
    IDLE: 'idle',
    // Asked for, not arrived: getUserMedia is prompting, the socket is
    // connecting, the model is thinking.
    STARTING: 'starting',
    // Carrying a value right now.
    LIVE: 'live',
    // The person said no. Distinct from `error` because it is not a fault and
    // the remedy is a browser permission, not a retry.
    DENIED: 'denied',
    // The capability does not exist here: no MIDI in Safari, no camera on this
    // machine, no bridge running. Also not a fault — the honest answer is
    // "not on this device", and retrying will not change it.
    UNAVAILABLE: 'unavailable',
    // It broke. Carries a message.
    ERROR: 'error'
})

const VALID_STATUSES = new Set(Object.values(PORT_STATUS))

// The three that mean "there is no value, and here is why". Reporting one of
// these drops any value the port was holding; the other three leave it alone.
const FAILURE_STATUSES = new Set([PORT_STATUS.DENIED, PORT_STATUS.UNAVAILABLE, PORT_STATUS.ERROR])

export const livePortKey = (nodeId, portId) => `${nodeId}:${portId}`

// Cleared ports read as absent, not as a stored null, so `has()` stays honest
// and the Map does not grow a tombstone per port that ever ran.
const isCleared = (value) => value === null || value === undefined

/**
 * A live-port table. Immutable from the reader's side: every mutation returns
 * a NEW registry, so React identity comparison drives re-render exactly as the
 * bare Map did before. Mutating in place would leave the editor showing a
 * stale frame forever, which is how this class of bug always presents.
 */
export class LivePortRegistry {
    constructor(values = new Map(), statuses = new Map()) {
        this.values = values
        this.statuses = statuses
    }

    get(nodeId, portId) {
        return this.values.get(livePortKey(nodeId, portId))
    }

    /** Raw key access, for the evaluator's hot path. */
    getByKey(key) {
        return this.values.get(key)
    }

    has(nodeId, portId) {
        return this.values.has(livePortKey(nodeId, portId))
    }

    /**
     * Never returns undefined. A port nobody has reported on is IDLE, which is
     * a true statement about it — the alternative is every consumer writing the
     * same `?? 'idle'` and one of them forgetting.
     */
    status(nodeId, portId) {
        return this.statuses.get(livePortKey(nodeId, portId)) || { status: PORT_STATUS.IDLE }
    }

    /**
     * Set a port's value and status together.
     *
     * Returns `this` unchanged when nothing actually changed. That identity
     * check is load-bearing, not an optimisation: the capture panels report on
     * every animation frame, and a fresh registry per report would re-render
     * the whole editor 60 times a second. The mic at a steady level and the
     * same VideoTexture instance both hit this path constantly.
     */
    set(nodeId, portId, value, status = null) {
        const key = livePortKey(nodeId, portId)
        const clear = isCleared(value)
        // A port carrying a value is live unless the caller says otherwise;
        // a cleared port with no stated reason is idle rather than broken.
        const nextStatus = normalizeStatus(status) || {
            status: clear ? PORT_STATUS.IDLE : PORT_STATUS.LIVE
        }

        const hadValue = this.values.has(key)
        const sameValue = clear ? !hadValue : this.values.get(key) === value
        const sameStatus = statusEquals(this.statuses.get(key), nextStatus)
        if (sameValue && sameStatus) return this

        const values = new Map(this.values)
        const statuses = new Map(this.statuses)
        if (clear) values.delete(key)
        else values.set(key, value)
        // IDLE is the default, so storing it would make every port that ever
        // ran a permanent entry in a Map that is otherwise sparse.
        if (nextStatus.status === PORT_STATUS.IDLE && !nextStatus.message) statuses.delete(key)
        else statuses.set(key, nextStatus)
        return new LivePortRegistry(values, statuses)
    }

    /**
     * Report a status without supplying a value.
     *
     * This is the whole point of the module. `set(id, port, null)` says "gone";
     * `report(id, port, DENIED)` says "gone, because they said no", and only
     * the second one can be rendered as something a person can act on.
     *
     * A failure status ALSO clears the value, because a port reporting an
     * error while still handing out the last good frame is worse than a blank
     * one that says why. A non-failure status leaves the value alone — a MIDI
     * device going LIVE must not wipe the last note it sent, which is exactly
     * the bug the first version of this method had.
     */
    report(nodeId, portId, status, message = null) {
        const normalized = normalizeStatus(message ? { status, message } : status)
        if (!normalized) return this
        if (FAILURE_STATUSES.has(normalized.status)) {
            return this.set(nodeId, portId, null, normalized)
        }
        const key = livePortKey(nodeId, portId)
        if (statusEquals(this.statuses.get(key), normalized)) return this
        const statuses = new Map(this.statuses)
        if (normalized.status === PORT_STATUS.IDLE && !normalized.message) statuses.delete(key)
        else statuses.set(key, normalized)
        return new LivePortRegistry(this.values, statuses)
    }

    /**
     * Drop every port belonging to a node. Called when a node is deleted —
     * without it a deleted webcam's texture stays referenced by the registry
     * and the GPU never gets it back.
     */
    clearNode(nodeId) {
        const prefix = `${nodeId}:`
        const values = new Map(this.values)
        const statuses = new Map(this.statuses)
        let changed = false
        for (const key of this.values.keys()) {
            if (key.startsWith(prefix)) { values.delete(key); changed = true }
        }
        for (const key of this.statuses.keys()) {
            if (key.startsWith(prefix)) { statuses.delete(key); changed = true }
        }
        return changed ? new LivePortRegistry(values, statuses) : this
    }

    get size() {
        return this.values.size
    }
}

const normalizeStatus = (status) => {
    if (!status) return null
    if (typeof status === 'string') {
        return VALID_STATUSES.has(status) ? { status } : null
    }
    if (!VALID_STATUSES.has(status.status)) return null
    return status.message ? { status: status.status, message: String(status.message) } : { status: status.status }
}

const statusEquals = (a, b) => {
    const left = a || { status: PORT_STATUS.IDLE }
    const right = b || { status: PORT_STATUS.IDLE }
    return left.status === right.status && (left.message || null) === (right.message || null)
}

export const createLivePortRegistry = () => new LivePortRegistry()

// The evaluator and the panels both hold whatever the editor passes down, and
// during the migration that is sometimes still a bare Map (any caller building
// a context by hand, and every existing test). Reading through this keeps both
// shapes working rather than making the contract a breaking change on day one.
export const readLivePort = (source, nodeId, portId) => {
    if (!source) return undefined
    const key = livePortKey(nodeId, portId)
    if (typeof source.getByKey === 'function') return source.getByKey(key)
    if (typeof source.get === 'function') return source.get(key)
    return undefined
}

export const readLivePortStatus = (source, nodeId, portId) => {
    if (source && typeof source.status === 'function') return source.status(nodeId, portId)
    // A bare Map cannot say why, so the most it can honestly report is
    // whether something is there.
    const value = readLivePort(source, nodeId, portId)
    return { status: isCleared(value) ? PORT_STATUS.IDLE : PORT_STATUS.LIVE }
}
