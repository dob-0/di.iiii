import React, { useState, useEffect } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useAssetUrl } from '../hooks/useAssetUrl.js'
import { attachVideoPlaybackRetry, configureVideoElement } from '../utils/videoPlayback.js'

function useVideoTextureSource(sourceUrl) {
    const [texture, setTexture] = useState(null)
    const [playbackBlocked, setPlaybackBlocked] = useState(false)

    useEffect(() => {
        const resolvedSrc = typeof sourceUrl === 'string' ? sourceUrl.trim() : ''
        if (!resolvedSrc || resolvedSrc === 'blob:null') {
            setTexture(null)
            setPlaybackBlocked(false)
            return
        }

        const video = document.createElement('video')
        configureVideoElement(video, resolvedSrc, { preload: 'auto' })

        const tex = new THREE.VideoTexture(video)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.minFilter = THREE.LinearFilter
        tex.magFilter = THREE.LinearFilter
        tex.needsUpdate = true

        const detachPlaybackRetry = attachVideoPlaybackRetry(video, {
            onBlockedChange: setPlaybackBlocked
        })

        setTexture(tex)

        return () => {
            detachPlaybackRetry()
            video.pause()
            video.src = ''
            tex.dispose()
        }
    }, [sourceUrl])

    return { texture, playbackBlocked }
}

export default function VideoObject({ assetRef, data, opacity = 1, linkActive }) {
    const assetUrl = useAssetUrl(assetRef, { preferRemoteSource: true })
    const isVideoType = !assetRef?.mimeType || assetRef.mimeType.startsWith('video/')
    const rawSource = (isVideoType ? assetUrl : null) || data || null
    const sourceUrl = typeof rawSource === 'string' ? rawSource.trim() : null
    const [size, setSize] = useState([1, 1])
    const { texture, playbackBlocked } = useVideoTextureSource(sourceUrl)

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
            <meshBasicMaterial map={texture} toneMapped={false} transparent opacity={opacity} />
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
