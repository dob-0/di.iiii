import { useEffect, useRef } from 'react'
import { WEBCAM_STATUS, useWebcamCapture } from '../utils/webcamCapture.js'

const STATUS_MESSAGE = {
    [WEBCAM_STATUS.REQUESTING]: 'Requesting camera access…',
    [WEBCAM_STATUS.DENIED]: 'Camera access denied. Allow it in your browser\'s site settings to use this node.',
    [WEBCAM_STATUS.UNAVAILABLE]: 'No camera found. Plug one in or pick a different source.',
    [WEBCAM_STATUS.ERROR]: 'Could not access the camera.'
}

export default function WebcamSourcePanel({ node, onFrameChange }) {
    const videoRef = useRef(null)
    const { status, texture, errorMessage } = useWebcamCapture(videoRef)

    useEffect(() => {
        onFrameChange?.(node.id, texture)
        return () => onFrameChange?.(node.id, null)
    }, [node.id, texture, onFrameChange])

    return (
        <div className="raw-webcam-panel">
            <video ref={videoRef} className="raw-webcam-panel-video" muted playsInline />
            {status !== WEBCAM_STATUS.ACTIVE && (
                <div className="raw-webcam-panel-status" role="status">
                    {STATUS_MESSAGE[status] || errorMessage}
                </div>
            )}
        </div>
    )
}
