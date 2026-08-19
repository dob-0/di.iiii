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
