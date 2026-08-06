import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { MEDIA_CAPTURE_STATUS, statusForMediaError } from './mediaCaptureStatus.js'

export const WEBCAM_STATUS = MEDIA_CAPTURE_STATUS
export const statusForError = statusForMediaError

// Captures the default camera onto `videoRef`'s element and builds a
// THREE.VideoTexture from it. The video element is owned by the caller (so
// the same element can double as the on-screen preview) — this hook only
// starts/stops the stream and reports status.
export function useWebcamCapture(videoRef) {
    const [status, setStatus] = useState(WEBCAM_STATUS.REQUESTING)
    const [texture, setTexture] = useState(null)
    const [errorMessage, setErrorMessage] = useState('')

    useEffect(() => {
        const video = videoRef.current
        if (!video) return undefined

        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            setStatus(WEBCAM_STATUS.UNAVAILABLE)
            setErrorMessage('Camera access is not supported in this browser.')
            return undefined
        }

        let cancelled = false
        let stream = null
        let tex = null
        setStatus(WEBCAM_STATUS.REQUESTING)
        setErrorMessage('')

        const onPlaying = () => {
            if (cancelled) return
            setTexture(tex)
            setStatus(WEBCAM_STATUS.ACTIVE)
        }
        video.addEventListener('playing', onPlaying)

        navigator.mediaDevices.getUserMedia({ video: true, audio: false })
            .then((mediaStream) => {
                if (cancelled) {
                    mediaStream.getTracks().forEach((track) => track.stop())
                    return
                }
                stream = mediaStream
                video.srcObject = stream
                tex = new THREE.VideoTexture(video)
                tex.colorSpace = THREE.SRGBColorSpace
                tex.minFilter = THREE.LinearFilter
                tex.magFilter = THREE.LinearFilter
                video.play?.()?.catch(() => {})
            })
            .catch((error) => {
                if (cancelled) return
                setStatus(statusForError(error))
                setErrorMessage(error?.message || 'Could not access the camera.')
            })

        // A leaked webcam stream is a lit camera light the user cannot
        // explain — every track gets stopped, not just paused, on cleanup.
        return () => {
            cancelled = true
            video.removeEventListener('playing', onPlaying)
            if (stream) stream.getTracks().forEach((track) => track.stop())
            if (tex) tex.dispose()
            video.pause?.()
            video.srcObject = null
            setTexture(null)
        }
    }, [videoRef])

    return { status, texture, errorMessage }
}
