import { useEffect, useRef } from 'react'

// Analyses a playing audio FILE the way micCapture analyses the microphone —
// an rAF loop over an AnalyserNode — with one deliberate difference: the
// element's output is routed into the analyser and NOWHERE else, so the
// analysis is SILENT. The scene's Sound object owns being heard (/out plays
// it for the audience); this taps the same file so wires can see it move.
// Two playbacks of one file started at different moments drift apart — a
// known seam, owed to the show clock, stated in the manual.
//
// `onLevels({ volume, low, mid, high })` fires every frame, all 0..1: volume
// is time-domain RMS (the mic's exact measure); low/mid/high average the
// byte spectrum under 250 Hz, 250–2000 Hz, and above — band edges chosen
// where stage material actually separates (kick / voice / air).
export function useSoundAnalysis(sourceUrl, { loop = true, onLevels } = {}) {
    const onLevelsRef = useRef(onLevels)
    useEffect(() => { onLevelsRef.current = onLevels }, [onLevels])

    useEffect(() => {
        const resolvedSrc = typeof sourceUrl === 'string' ? sourceUrl.trim() : ''
        if (!resolvedSrc) return undefined
        const AudioCtx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
        if (!AudioCtx) return undefined

        let cancelled = false
        let rafId = null
        let detachGestureResume = null

        const audio = document.createElement('audio')
        audio.crossOrigin = 'anonymous'
        audio.loop = loop
        audio.preload = 'auto'
        audio.src = resolvedSrc

        const audioContext = new AudioCtx()
        // Same suspended-context dance as micCapture: created outside any
        // gesture stack, Chrome starts it suspended — resume now if the page
        // has ever been touched, otherwise on the next gesture.
        if (audioContext.state === 'suspended') {
            const resumeOnGesture = () => { audioContext?.resume().catch(() => {}) }
            const gestureEvents = ['pointerdown', 'keydown']
            gestureEvents.forEach((name) => window.addEventListener(name, resumeOnGesture))
            detachGestureResume = () => {
                gestureEvents.forEach((name) => window.removeEventListener(name, resumeOnGesture))
                detachGestureResume = null
            }
            audioContext.addEventListener?.('statechange', () => {
                if (audioContext?.state === 'running') detachGestureResume?.()
            })
            audioContext.resume().catch(() => {})
        }

        const source = audioContext.createMediaElementSource(audio)
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 1024
        source.connect(analyser)
        // Deliberately NOT connected to audioContext.destination — see above.

        const timeDomain = new Uint8Array(analyser.fftSize)
        const frequencyData = new Uint8Array(analyser.frequencyBinCount)
        const binHz = audioContext.sampleRate / analyser.fftSize
        const lowEnd = Math.max(1, Math.round(250 / binHz))
        const midEnd = Math.max(lowEnd + 1, Math.round(2000 / binHz))

        const bandAverage = (from, to) => {
            let sum = 0
            const end = Math.min(to, frequencyData.length)
            for (let i = from; i < end; i++) sum += frequencyData[i]
            const count = Math.max(1, end - from)
            return sum / count / 255
        }

        const tick = () => {
            if (cancelled) return
            analyser.getByteTimeDomainData(timeDomain)
            analyser.getByteFrequencyData(frequencyData)
            let sumSquares = 0
            for (let i = 0; i < timeDomain.length; i++) {
                const centered = (timeDomain[i] - 128) / 128
                sumSquares += centered * centered
            }
            onLevelsRef.current?.({
                volume: Math.sqrt(sumSquares / timeDomain.length),
                low: bandAverage(0, lowEnd),
                mid: bandAverage(lowEnd, midEnd),
                high: bandAverage(midEnd, frequencyData.length)
            })
            rafId = requestAnimationFrame(tick)
        }

        audio.play().catch(() => {
            // Autoplay refused: the levels stay silent until the gesture
            // resume above lets the context run — retry play alongside it.
            const playOnGesture = () => { audio.play().catch(() => {}) }

            window.addEventListener('pointerdown', playOnGesture, { once: true })
        })
        rafId = requestAnimationFrame(tick)

        return () => {
            cancelled = true
            if (rafId) cancelAnimationFrame(rafId)
            detachGestureResume?.()
            audio.pause()
            audio.removeAttribute('src')
            audio.load()
            source.disconnect()
            audioContext.close().catch(() => {})
        }
    }, [sourceUrl, loop])
}
