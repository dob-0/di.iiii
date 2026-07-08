import React, { useState, useEffect, useRef } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useAssetUrl } from '../hooks/useAssetUrl.js'
import { attachVideoPlaybackRetry, attachVideoSound, configureVideoElement } from '../utils/videoPlayback.js'

function useVideoTextureSource(sourceUrl, { muted = true, volume = 1, loop = true } = {}) {
    const [texture, setTexture] = useState(null)
    const [playbackBlocked, setPlaybackBlocked] = useState(false)
    const videoRef = useRef(null)

    useEffect(() => {
        const resolvedSrc = typeof sourceUrl === 'string' ? sourceUrl.trim() : ''
        if (!resolvedSrc || resolvedSrc === 'blob:null') {
            setTexture(null)
            setPlaybackBlocked(false)
            return
        }

        const video = document.createElement('video')
        videoRef.current = video
        configureVideoElement(video, resolvedSrc, { preload: 'auto' })

        const tex = new THREE.VideoTexture(video)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.minFilter = THREE.LinearFilter
        tex.magFilter = THREE.LinearFilter
        tex.needsUpdate = true

        const detachPlaybackRetry = attachVideoPlaybackRetry(video, {
            onBlockedChange: setPlaybackBlocked
        })

        // Only show the texture once the video has a decoded frame — avoids
        // a solid black rectangle while the video source is still loading or
        // when the URL is inaccessible (auth-gated, 404, etc.)
        const onData = () => setTexture(tex)
        video.addEventListener('loadeddata', onData, { once: true })

        return () => {
            video.removeEventListener('loadeddata', onData)
            detachPlaybackRetry()
            video.pause()
            video.src = ''
            tex.dispose()
            videoRef.current = null
            setTexture(null)
        }
    }, [sourceUrl])

    // Sound and loop apply live without recreating the video/texture.
    useEffect(() => {
        const video = videoRef.current
        if (!video) return undefined
        video.loop = loop !== false
        return attachVideoSound(video, { muted, volume })
    }, [texture, muted, volume, loop])

    return { texture, playbackBlocked }
}

export default function VideoObject({ assetRef, data, opacity = 1, linkActive, muted = true, volume = 1, loop = true }) {
    const assetUrl = useAssetUrl(assetRef, { preferRemoteSource: true })
    const isVideoType = !assetRef?.mimeType || assetRef.mimeType.startsWith('video/')
    const rawSource = (isVideoType ? assetUrl : null) || data || null
    const sourceUrl = typeof rawSource === 'string' ? rawSource.trim() : null
    const [size, setSize] = useState([1, 1])
    const { texture, playbackBlocked } = useVideoTextureSource(sourceUrl, { muted, volume, loop })

    useEffect(() => {
        const resolvedSrc = typeof sourceUrl === 'string' ? sourceUrl.trim() : ''
        if (!resolvedSrc || resolvedSrc === 'blob:null') {
            setSize([1, 1])
            return
        }

        const video = document.createElement('video')
        configureVideoElement(video, resolvedSrc, { preload: 'metadata' })
        const handleMetadata = () => {
            const aspect = video.videoWidth / (video.videoHeight || 1)
            setSize([Math.max(aspect * 3, 1), 3])
            video.removeEventListener('loadedmetadata', handleMetadata)
        }
        video.addEventListener('loadedmetadata', handleMetadata)
        return () => {
            video.removeEventListener('loadedmetadata', handleMetadata)
            video.src = ''
        }
    }, [sourceUrl])

    if (!texture) {
        return null
    }

    return (
        <mesh position-y={0.01} rotation-x={-Math.PI / 2}>
            <planeGeometry args={size} />
            <meshBasicMaterial map={texture} toneMapped={false} transparent opacity={opacity} side={THREE.DoubleSide} />
            {playbackBlocked && (
                <Html position={[0, 0.08, 0]} center>
                    <span className="link-label">Click or press a key to start video</span>
                </Html>
            )}
            {linkActive && (
                <Html position={[0, 0.05, 0]} center>
                    <span className="link-label">🔗</span>
                </Html>
            )}
        </mesh>
    )
}
