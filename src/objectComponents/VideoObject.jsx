import React, { useState, useEffect } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useAssetUrl } from '../hooks/useAssetUrl.js'
import { attachVideoPlaybackRetry, configureVideoElement } from '../utils/videoPlayback.js'
import { detectAssetMediaKind } from '../utils/mediaAssetTypes.js'

const HAVE_CURRENT_DATA = 2
const DEFAULT_VIDEO_SIZE = [1, 1]

export const hasUsableVideoFrame = (video) => {
    const readyState = Number(video?.readyState) || 0
    const width = Number(video?.videoWidth) || 0
    const height = Number(video?.videoHeight) || 0
    return readyState >= HAVE_CURRENT_DATA && width > 0 && height > 0
}

const getVideoPlaneSize = (video) => {
    const width = Number(video?.videoWidth) || 0
    const height = Number(video?.videoHeight) || 0
    if (width <= 0 || height <= 0) {
        return null
    }
    const aspect = width / height
    return [Math.max(aspect * 3, 1), 3]
}

function useVideoTextureSource(sourceUrl) {
    const [texture, setTexture] = useState(null)
    const [size, setSize] = useState(DEFAULT_VIDEO_SIZE)
    const [playbackBlocked, setPlaybackBlocked] = useState(false)

    useEffect(() => {
        const resolvedSrc = typeof sourceUrl === 'string' ? sourceUrl.trim() : ''
        if (!resolvedSrc || resolvedSrc === 'blob:null') {
            setTexture(null)
            setSize(DEFAULT_VIDEO_SIZE)
            setPlaybackBlocked(false)
            return () => {}
        }

        let disposed = false
        let tex = null
        const video = document.createElement('video')
        configureVideoElement(video, resolvedSrc, { preload: 'auto' })

        setTexture(null)
        setSize(DEFAULT_VIDEO_SIZE)
        setPlaybackBlocked(false)

        const disposeTexture = () => {
            if (!tex) return
            tex.dispose()
            tex = null
        }

        const syncSize = () => {
            const nextSize = getVideoPlaneSize(video)
            if (nextSize) {
                setSize(nextSize)
            }
        }

        const publishTextureWhenReady = () => {
            if (disposed) return
            syncSize()
            if (!hasUsableVideoFrame(video)) return
            if (!tex) {
                tex = new THREE.VideoTexture(video)
                tex.colorSpace = THREE.SRGBColorSpace
                tex.minFilter = THREE.LinearFilter
                tex.magFilter = THREE.LinearFilter
                tex.needsUpdate = true
            }
            setTexture(tex)
        }

        const detachPlaybackRetry = attachVideoPlaybackRetry(video, {
            onBlockedChange: setPlaybackBlocked
        })

        video.addEventListener('loadedmetadata', syncSize)
        video.addEventListener('loadeddata', publishTextureWhenReady)
        video.addEventListener('canplay', publishTextureWhenReady)
        video.addEventListener('playing', publishTextureWhenReady)
        publishTextureWhenReady()

        return () => {
            disposed = true
            video.removeEventListener('loadedmetadata', syncSize)
            video.removeEventListener('loadeddata', publishTextureWhenReady)
            video.removeEventListener('canplay', publishTextureWhenReady)
            video.removeEventListener('playing', publishTextureWhenReady)
            detachPlaybackRetry()
            video.pause()
            video.src = ''
            disposeTexture()
        }
    }, [sourceUrl])

    return { texture, playbackBlocked, size }
}

export default function VideoObject({ assetRef, data, opacity = 1, linkActive }) {
    const assetUrl = useAssetUrl(assetRef, { preferRemoteSource: true })
    const assetKind = detectAssetMediaKind(assetRef)
    const isVideoType = !assetRef?.mimeType || assetKind === 'video'
    const rawSource = (isVideoType ? assetUrl : null) || data || null
    const sourceUrl = typeof rawSource === 'string' ? rawSource.trim() : null
    const { texture, playbackBlocked, size } = useVideoTextureSource(sourceUrl)

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
