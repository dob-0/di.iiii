import { PORT_STATUS } from '../../project/graph/livePorts.js'

// Shared status vocabulary for every getUserMedia-backed capture node
// (source.webcam, source.mic, ...). Permission denial and no-device-present
// are the normal outcomes for this node family, not edge cases — see
// docs/roadmaps/NODE_BACKLOG.md's capture-family note — so every capture
// hook reports a status a panel can render instead of sitting blank.
export const MEDIA_CAPTURE_STATUS = {
    REQUESTING: 'requesting',
    ACTIVE: 'active',
    DENIED: 'denied',
    UNAVAILABLE: 'unavailable',
    ERROR: 'error'
}

// The panel already knew all of this and kept it to itself — the status was
// rendered inside the window and never reached the graph, so a `frame` port
// with no texture looked identical whether the camera was warming up, denied,
// or absent. This maps the capture vocabulary onto the graph's port vocabulary
// so the reason travels with the (missing) value.
//
// The two vocabularies are deliberately separate: a capture hook should not
// have to know what a port is, and the graph should not grow a getUserMedia
// concept. They meet here, in the lane that owns both.
export const portStatusForCaptureStatus = (captureStatus) => {
    switch (captureStatus) {
        case MEDIA_CAPTURE_STATUS.REQUESTING: return PORT_STATUS.STARTING
        case MEDIA_CAPTURE_STATUS.ACTIVE: return PORT_STATUS.LIVE
        case MEDIA_CAPTURE_STATUS.DENIED: return PORT_STATUS.DENIED
        case MEDIA_CAPTURE_STATUS.UNAVAILABLE: return PORT_STATUS.UNAVAILABLE
        case MEDIA_CAPTURE_STATUS.ERROR: return PORT_STATUS.ERROR
        default: return PORT_STATUS.IDLE
    }
}

// getUserMedia's DOMException.name tells you why it failed.
export const statusForMediaError = (error) => {
    switch (error?.name) {
        case 'NotAllowedError':
        case 'SecurityError':
        case 'PermissionDeniedError':
            return MEDIA_CAPTURE_STATUS.DENIED
        case 'NotFoundError':
        case 'OverconstrainedError':
        case 'DevicesNotFoundError':
            return MEDIA_CAPTURE_STATUS.UNAVAILABLE
        default:
            return MEDIA_CAPTURE_STATUS.ERROR
    }
}
