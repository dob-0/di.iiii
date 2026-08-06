import { useCallback, useEffect, useRef } from 'react'
import { MEDIA_CAPTURE_STATUS, useMicCapture } from '../utils/micCapture.js'

const STATUS_MESSAGE = {
    [MEDIA_CAPTURE_STATUS.REQUESTING]: 'Requesting microphone access…',
    [MEDIA_CAPTURE_STATUS.DENIED]: 'Microphone access denied. Allow it in your browser\'s site settings to use this node.',
    [MEDIA_CAPTURE_STATUS.UNAVAILABLE]: 'No microphone found. Plug one in or pick a different source.',
    [MEDIA_CAPTURE_STATUS.ERROR]: 'Could not access the microphone.'
}

// The analyser reports every animation frame, but lifting that into the
// graph's liveOutputs rebuilds graphContext for the whole document — fine
// once (webcam's texture), not 60 times a second. The meter itself still
// updates every frame via a direct DOM write (no React re-render); only the
// graph-facing report is throttled.
const REPORT_INTERVAL_MS = 100

export default function MicSourcePanel({ node, onLevelsChange }) {
    const meterRef = useRef(null)
    const lastReportRef = useRef(0)

    const handleLevels = useCallback((volume, frequency) => {
        if (meterRef.current) {
            meterRef.current.style.transform = `scaleX(${Math.min(1, volume * 2.2)})`
        }
        const now = typeof performance !== 'undefined' ? performance.now() : 0
        if (now - lastReportRef.current < REPORT_INTERVAL_MS) return
        lastReportRef.current = now
        onLevelsChange?.(node.id, volume, frequency)
    }, [node.id, onLevelsChange])

    const { status, errorMessage } = useMicCapture(handleLevels)

    useEffect(() => () => onLevelsChange?.(node.id, null, null), [node.id, onLevelsChange])

    return (
        <div className="raw-mic-panel">
            <div className="raw-mic-panel-meter">
                <div ref={meterRef} className="raw-mic-panel-meter-fill" />
            </div>
            {status !== MEDIA_CAPTURE_STATUS.ACTIVE && (
                <div className="raw-mic-panel-status" role="status">
                    {STATUS_MESSAGE[status] || errorMessage}
                </div>
            )}
        </div>
    )
}
