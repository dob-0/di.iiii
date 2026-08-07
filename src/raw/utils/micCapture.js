import { useEffect, useRef, useState } from 'react'
import { MEDIA_CAPTURE_STATUS, statusForMediaError } from './mediaCaptureStatus.js'

export { MEDIA_CAPTURE_STATUS }

// Captures the default microphone and analyses it on every animation frame.
// `onLevels(volume, frequency)` fires every frame — volume is the RMS of the
// time-domain signal (0..1), frequency is a snapshot spectrum (Uint8Array,
// 0..255 per bin, analyser.frequencyBinCount long). Both change continuously,
// so the CALLER decides how often to lift them into anything that triggers a
// re-render or a graph-context rebuild (see WebcamSourcePanel's throttling) —
// this hook never writes them to node.values itself, which would spam the
// op log/undo history every tick the same way an un-gated clock would.
export function useMicCapture(onLevels) {
    const [status, setStatus] = useState(MEDIA_CAPTURE_STATUS.REQUESTING)
    const [errorMessage, setErrorMessage] = useState('')
    const onLevelsRef = useRef(onLevels)
    useEffect(() => { onLevelsRef.current = onLevels }, [onLevels])

    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            setStatus(MEDIA_CAPTURE_STATUS.UNAVAILABLE)
            setErrorMessage('Microphone access is not supported in this browser.')
            return undefined
        }
        const AudioCtx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
        if (!AudioCtx) {
            setStatus(MEDIA_CAPTURE_STATUS.UNAVAILABLE)
            setErrorMessage('Web Audio is not supported in this browser.')
            return undefined
        }

        let cancelled = false
        let stream = null
        let audioContext = null
        let rafId = null
        setStatus(MEDIA_CAPTURE_STATUS.REQUESTING)
        setErrorMessage('')

        navigator.mediaDevices.getUserMedia({ audio: true, video: false })
            .then((mediaStream) => {
                if (cancelled) {
                    mediaStream.getTracks().forEach((track) => track.stop())
                    return
                }
                stream = mediaStream
                audioContext = new AudioCtx()
                const source = audioContext.createMediaStreamSource(stream)
                const analyser = audioContext.createAnalyser()
                analyser.fftSize = 1024
                source.connect(analyser)

                const timeDomain = new Uint8Array(analyser.fftSize)
                const frequencyData = new Uint8Array(analyser.frequencyBinCount)

                const tick = () => {
                    if (cancelled) return
                    analyser.getByteTimeDomainData(timeDomain)
                    analyser.getByteFrequencyData(frequencyData)
                    let sumSquares = 0
                    for (let i = 0; i < timeDomain.length; i++) {
                        const centered = (timeDomain[i] - 128) / 128
                        sumSquares += centered * centered
                    }
                    const volume = Math.sqrt(sumSquares / timeDomain.length)
                    onLevelsRef.current?.(volume, frequencyData.slice())
                    rafId = requestAnimationFrame(tick)
                }
                rafId = requestAnimationFrame(tick)
                setStatus(MEDIA_CAPTURE_STATUS.ACTIVE)
            })
            .catch((error) => {
                if (cancelled) return
                setStatus(statusForMediaError(error))
                setErrorMessage(error?.message || 'Could not access the microphone.')
            })

        // A leaked mic stream is a hot mic the user cannot explain — every
        // track stopped, the audio graph torn down, not just the rAF loop.
        return () => {
            cancelled = true
            if (rafId !== null) cancelAnimationFrame(rafId)
            if (stream) stream.getTracks().forEach((track) => track.stop())
            audioContext?.close?.()
        }
    }, [])

    return { status, errorMessage }
}
