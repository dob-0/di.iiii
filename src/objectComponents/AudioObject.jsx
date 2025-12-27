import React from 'react'
import { PositionalAudio, Sphere } from '@react-three/drei'
import { useAssetUrl } from '../hooks/useAssetUrl.js'

export default function AudioObject({
    assetRef,
    data,
    color,
    audioVolume,
    audioDistance,
    audioLoop,
    audioAutoplay,
    audioPaused
}) {
    const assetUrl = useAssetUrl(assetRef)
    const sourceUrl = assetUrl || data || null
    const [canUsePositional, setCanUsePositional] = React.useState(true)
    const audioRef = React.useRef(null)
    const htmlAudioRef = React.useRef(null)
    const htmlAudioElRef = React.useRef(null)
    const mimeType = (assetRef?.mimeType || '').toLowerCase()
    const forceHtmlAudio = mimeType.includes('flac')

    const volume = Number.isFinite(audioVolume) ? audioVolume : (assetRef?.volume ?? 0.8)
    const distance = Number.isFinite(audioDistance) ? audioDistance : 8
    const loop = typeof audioLoop === 'boolean' ? audioLoop : true
    const autoplay = typeof audioAutoplay === 'boolean' ? audioAutoplay : true
    const paused = typeof audioPaused === 'boolean' ? audioPaused : false

    React.useEffect(() => {
        let cancelled = false
        if (!sourceUrl || forceHtmlAudio) {
            setCanUsePositional(false)
            return
        }
        const testPlayback = async () => {
            try {
                const response = await fetch(sourceUrl)
                if (!response.ok) throw new Error(`HTTP ${response.status}`)
                const arrayBuffer = await response.arrayBuffer()
                const AudioCtx = window.AudioContext || window.webkitAudioContext
                if (!AudioCtx) {
                    setCanUsePositional(true)
                    return
                }
                const ctx = new AudioCtx()
                await ctx.decodeAudioData(arrayBuffer.slice(0))
                ctx.close?.()
                if (!cancelled) setCanUsePositional(true)
            } catch (error) {
                console.warn('Skipping positional audio; decode failed', error)
                if (!cancelled) setCanUsePositional(false)
            }
        }
        testPlayback()
        return () => { cancelled = true }
    }, [sourceUrl])

    React.useEffect(() => {
        const audio = audioRef.current
        if (!audio) return
        audio.setLoop(loop)
        audio.setVolume(volume)
        audio.setRefDistance?.(distance)
        const syncPlayback = async () => {
            if (!canUsePositional) return
            try {
                if (paused) {
                    if (audio.isPlaying) {
                        audio.pause?.()
                    }
                } else if (!audio.isPlaying) {
                    await audio.play().catch(() => {})
                }
            } catch (error) {
                console.warn('Audio playback failed', error)
            }
        }
        syncPlayback()
    }, [autoplay, distance, canUsePositional, loop, paused, volume])

    React.useEffect(() => {
        if (canUsePositional || !sourceUrl) {
            if (htmlAudioElRef.current) {
                htmlAudioElRef.current.pause?.()
                htmlAudioElRef.current.src = ''
                htmlAudioElRef.current = null
            }
            return
        }
        let audioEl = htmlAudioElRef.current
        if (!audioEl) {
            audioEl = new Audio(sourceUrl)
            htmlAudioElRef.current = audioEl
        } else if (audioEl.src !== sourceUrl) {
            audioEl.pause()
            audioEl.src = sourceUrl
        }
        audioEl.loop = loop
        audioEl.volume = Math.max(0, Math.min(1, volume ?? 0.8))
        const sync = async () => {
            try {
                if (paused) {
                    audioEl.pause()
                } else if (autoplay) {
                    await audioEl.play().catch(() => {})
                }
            } catch {
                // ignore playback errors on fallback element
            }
        }
        sync()
        return () => {
            if (htmlAudioElRef.current) {
                htmlAudioElRef.current.pause?.()
            }
        }
    }, [autoplay, canUsePositional, loop, paused, sourceUrl, volume])

    return (
        <mesh position-y={0.5}>
            <Sphere args={[0.3, 16, 16]}>
                <meshStandardMaterial color={color} />
            </Sphere>
            {sourceUrl && canUsePositional && !forceHtmlAudio && (
                <PositionalAudio
                    ref={audioRef}
                    url={sourceUrl}
                    autoplay={autoplay && !paused}
                    loop={loop}
                    distance={distance}
                />
            )}
        </mesh>
    )
}
