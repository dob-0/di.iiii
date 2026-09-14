import { useEffect, useMemo, useState } from 'react'
import { WEBCAM_STATUS, useWebcamCapture } from '../utils/webcamCapture.js'
import { clearFeedReport, reportFeed, useFeedReport } from '../utils/feedReports.js'
import LiveTextureView, { isLiveTexture } from './LiveTextureView.jsx'

const STATUS_MESSAGE = {
    [WEBCAM_STATUS.REQUESTING]: 'Requesting camera access…',
    [WEBCAM_STATUS.DENIED]: 'Camera access denied. Allow it in your browser\'s site settings to use this node.',
    [WEBCAM_STATUS.UNAVAILABLE]: 'No camera found. Plug one in or pick a different source.',
    [WEBCAM_STATUS.ERROR]: 'Could not access the camera.'
}

// The camera itself, held for as long as the Webcam NODE exists — not its
// window. Its own <video> element, never in the page: a closed window, a
// fullscreen room or another scope no longer blacks every Plane, Monitor and
// picture operator the frame is wired into. One capture per node, here only.
export function WebcamFeed({ node, onFrameChange }) {
    const [video] = useState(() => {
        const element = globalThis.document?.createElement('video') || null
        if (element) {
            element.muted = true
            element.playsInline = true
        }
        return element
    })
    const videoRef = useMemo(() => ({ current: video }), [video])
    const { status, texture, errorMessage } = useWebcamCapture(videoRef)

    useEffect(() => {
        onFrameChange?.(node.id, texture)
        return () => onFrameChange?.(node.id, null)
    }, [node.id, texture, onFrameChange])

    useEffect(() => { reportFeed(node.id, { status, errorMessage }) }, [node.id, status, errorMessage])
    useEffect(() => () => clearFeedReport(node.id), [node.id])

    return null
}

// The Webcam's window: a view of the feed above, never a second capture.
export default function WebcamSourcePanel({ node, texture = null }) {
    const { status = WEBCAM_STATUS.REQUESTING, errorMessage = '' } = useFeedReport(node.id)
    const active = status === WEBCAM_STATUS.ACTIVE && isLiveTexture(texture)

    return (
        <div className="raw-webcam-panel">
            {active ? <LiveTextureView texture={texture} label="Webcam" className="raw-webcam-panel-video" /> : null}
            {status !== WEBCAM_STATUS.ACTIVE && (
                <div className="raw-webcam-panel-status" role="status">
                    {STATUS_MESSAGE[status] || errorMessage}
                </div>
            )}
        </div>
    )
}
