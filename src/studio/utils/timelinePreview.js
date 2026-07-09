// Editor-only timeline preview state, read by the viewport at frame rate.
// `hold` freezes the pose at `time` (scrubbing / paused); `playing` advances it.
// The store never writes ops — authored data changes only via Record/key edits.

const state = { entityId: null, time: 0, playing: false, hold: false, duration: 5, loop: true }
let version = 0
const listeners = new Set()
const emit = () => {
    version += 1
    listeners.forEach((listener) => listener())
}

export const getTimelinePreview = () => state
export const getTimelinePreviewVersion = () => version
export const subscribeTimelinePreview = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

export const setTimelinePreview = (patch) => {
    Object.assign(state, patch)
    emit()
}

export const stopTimelinePreview = () => {
    setTimelinePreview({ entityId: null, time: 0, playing: false, hold: false })
}

export const isTimelinePreviewPosed = (entityId) =>
    state.entityId === entityId && (state.playing || state.hold)

export const advanceTimelinePreview = (delta) => {
    if (!state.playing) return
    let time = state.time + delta
    if (state.loop) {
        time = state.duration > 0 ? time % state.duration : 0
        setTimelinePreview({ time })
        return
    }
    if (time >= state.duration) {
        setTimelinePreview({ time: state.duration, playing: false, hold: true })
        return
    }
    setTimelinePreview({ time })
}
