import { useCallback, useEffect, useRef } from 'react'
import { MEDIA_CAPTURE_STATUS, useMicCapture } from '../utils/micCapture.js'
import { clearFeedReport, reportFeed, useFeedReport } from '../utils/feedReports.js'

const STATUS_MESSAGE = {
    [MEDIA_CAPTURE_STATUS.REQUESTING]: 'Requesting microphone access…',
    [MEDIA_CAPTURE_STATUS.DENIED]: 'Microphone access denied. Allow it in your browser\'s site settings to use this node.',
    [MEDIA_CAPTURE_STATUS.UNAVAILABLE]: 'No microphone found. Plug one in or pick a different source.',
    [MEDIA_CAPTURE_STATUS.ERROR]: 'Could not access the microphone.'
}

// The analyser reports every animation frame, but lifting that into the
// graph's liveOutputs rebuilds graphContext for the whole document — fine
// once (webcam's texture), not 60 times a second. Only the graph-facing
// report is throttled.
const REPORT_INTERVAL_MS = 100

// The microphone, held for as long as the Mic NODE exists — its window can
// close and Volume keeps flowing. One capture per node, here only.
export function MicFeed({ node, onLevelsChange }) {
    const lastReportRef = useRef(0)

    const handleLevels = useCallback((volume, frequency) => {
        const now = typeof performance !== 'undefined' ? performance.now() : 0
        if (now - lastReportRef.current < REPORT_INTERVAL_MS) return
        lastReportRef.current = now
        onLevelsChange?.(node.id, volume, frequency)
    }, [node.id, onLevelsChange])

    const { status, errorMessage } = useMicCapture(handleLevels)

    useEffect(() => () => onLevelsChange?.(node.id, null, null), [node.id, onLevelsChange])
    useEffect(() => { reportFeed(node.id, { status, errorMessage }) }, [node.id, status, errorMessage])
    useEffect(() => () => clearFeedReport(node.id), [node.id])

    return null
}

// The Mic's window: a meter over the feed's Volume, never a second capture.
export default function MicSourcePanel({ node, volume = 0 }) {
    const { status = MEDIA_CAPTURE_STATUS.REQUESTING, errorMessage = '' } = useFeedReport(node.id)
    const level = Math.min(1, Math.max(0, (Number(volume) || 0) * 2.2))

    return (
        <div className="raw-mic-panel">
            <div className="raw-mic-panel-meter">
                <div className="raw-mic-panel-meter-fill" style={{ transform: `scaleX(${level})` }} />
            </div>
            {status !== MEDIA_CAPTURE_STATUS.ACTIVE && (
                <div className="raw-mic-panel-status" role="status">
                    {STATUS_MESSAGE[status] || errorMessage}
                </div>
            )}
        </div>
    )
}
