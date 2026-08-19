import React, { useState, useEffect, useRef } from 'react'
import { Html } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useAssetUrl } from '../hooks/useAssetUrl.js'
import { attachVideoPlaybackRetry, attachVideoSound, configureVideoElement } from '../utils/videoPlayback.js'
import {
    attachPositionalVideoSound,
    getOrCreateAudioListener,
    resumeContextOnGesture
} from '../utils/positionalVideoSound.js'

const DEFAULT_SIZE = [1, 1]

// Plane dimensions come from this element's own metadata. They used to come
// from a second <video> created solely to read videoWidth/videoHeight, which
// doubled the network cost of every video in the app: /wcc/main embeds ten
// artist projects at once, and the same 12.36MB file was fetched six times —
// three objects referencing it, two elements each.
const sizeFromVideo = (video) => {
    const aspect = video.videoWidth / (video.videoHeight || 1)
    return Number.isFinite(aspect) && aspect > 0 ? [Math.max(aspect * 3, 1), 3] : DEFAULT_SIZE
}

// One element and one texture per (source, playback settings), shared by every
// object that asks for the same thing and torn down when the last one lets go.
//
// The key includes muted/volume/loop deliberately. A single HTMLVideoElement
// has ONE volume and ONE loop flag, so sharing across objects that disagree
// would make the last one mounted silently win for all of them. Objects that
// differ keep their own element — they cost what they always cost — and only
// genuinely identical requests collapse.
const videoCache = new Map()

const cacheKey = (src, muted, volume, loop) => `${src}|${muted ? 1 : 0}|${volume}|${loop === false ? 0 : 1}`

const acquireVideo = (src, { muted, volume, loop }) => {
    const key = cacheKey(src, muted, volume, loop)
    const existing = videoCache.get(key)
    if (existing) {
        existing.refs += 1
        return existing
    }

    const video = document.createElement('video')
    configureVideoElement(video, src, { preload: 'auto' })
    video.loop = loop !== false

    const texture = new THREE.VideoTexture(video)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.needsUpdate = true

    const entry = { key, video, texture, refs: 1, ready: false, size: DEFAULT_SIZE, blocked: false, subscribers: new Set() }
    const publish = () => { for (const notify of entry.subscribers) notify() }

    entry.detachSound = attachVideoSound(video, { muted, volume })
    entry.detachRetry = attachVideoPlaybackRetry(video, {
        onBlockedChange: (blocked) => { entry.blocked = blocked; publish() }
    })

    // Only show the texture once the video has a decoded frame — avoids
    // a solid black rectangle while the video source is still loading or
    // when the URL is inaccessible (auth-gated, 404, etc.)
    entry.onData = () => { entry.ready = true; publish() }
    video.addEventListener('loadeddata', entry.onData, { once: true })

    // HAVE_METADATA. A cached video can reach it before this listener is
    // attached, and then the event never comes.
    entry.onMetadata = () => { entry.size = sizeFromVideo(video); publish() }
    if (video.readyState >= 1) entry.onMetadata()
    else video.addEventListener('loadedmetadata', entry.onMetadata, { once: true })

    videoCache.set(key, entry)
    return entry
}

const releaseVideo = (entry) => {
    entry.refs -= 1
    if (entry.refs > 0) return
    videoCache.delete(entry.key)
    entry.video.removeEventListener('loadeddata', entry.onData)
    entry.video.removeEventListener('loadedmetadata', entry.onMetadata)
    entry.detachRetry?.()
    entry.detachSound?.()
    entry.video.pause()
    entry.video.src = ''
    entry.texture.dispose()
    entry.subscribers.clear()
}

export function useVideoTextureSource(sourceUrl, { muted = true, volume = 1, loop = true } = {}) {
    const [state, setState] = useState({ texture: null, playbackBlocked: false, size: DEFAULT_SIZE, video: null })

    useEffect(() => {
        const resolvedSrc = typeof sourceUrl === 'string' ? sourceUrl.trim() : ''
        if (!resolvedSrc || resolvedSrc === 'blob:null') {
            setState({ texture: null, playbackBlocked: false, size: DEFAULT_SIZE, video: null })
            return undefined
        }

        const entry = acquireVideo(resolvedSrc, { muted, volume, loop })
        const sync = () => setState({
            texture: entry.ready ? entry.texture : null,
            playbackBlocked: entry.blocked,
            size: entry.size,
            // The element itself, for callers that need to route its audio
            // (positional sound). Owned by the cache — do not mutate it here.
            video: entry.video
        })
        entry.subscribers.add(sync)
        sync()

        return () => {
            entry.subscribers.delete(sync)
            releaseVideo(entry)
        }
    }, [sourceUrl, muted, volume, loop])

    return state
}

// Spatial sound is opt-in: routing every video through a panner would change
// how every existing space sounds. A muted video has no audio to place.
//
// A separate component rather than an effect in VideoObject because useThree()
// only works inside a Canvas, and VideoObject is also rendered by plain
// react-dom tests that never open one. Mounted only when a video actually asks
// for spatial sound, so those tests never reach the hook.
//
// The element is shared per (source, muted, volume, loop) by the cache above,
// and a media element can be routed into Web Audio only ONCE — so when two
// spatial objects genuinely collapse onto one element, the second gets null
// back and keeps the flat path rather than both going silent.
function SpatialVideoSound({ targetRef, video, volume, distance, maxDistance }) {
    const { camera } = useThree()

    useEffect(() => {
        const target = targetRef.current
        if (!target || !video) return undefined

        const listener = getOrCreateAudioListener(camera)
        const stopWaiting = resumeContextOnGesture(listener)
        const detach = attachPositionalVideoSound(target, video, listener, {
            volume,
            refDistance: distance,
            maxDistance
        })
        return () => {
            stopWaiting()
            detach?.()
        }
    }, [targetRef, video, camera, volume, distance, maxDistance])

    return null
}

export default function VideoObject({
    assetRef, data, opacity = 1, linkActive, muted = true, volume = 1, loop = true,
    spatial = false, distance, maxDistance
}) {
    const assetUrl = useAssetUrl(assetRef, { preferRemoteSource: true })
    const isVideoType = !assetRef?.mimeType || assetRef.mimeType.startsWith('video/')
    const rawSource = (isVideoType ? assetUrl : null) || data || null
    const sourceUrl = typeof rawSource === 'string' ? rawSource.trim() : null
    const { texture, playbackBlocked, size, video } = useVideoTextureSource(sourceUrl, { muted, volume, loop })
    const meshRef = useRef(null)

    if (!texture) {
        return null
    }

    return (
        <mesh ref={meshRef} position-y={0.01} rotation-x={-Math.PI / 2}>
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
            {spatial && muted === false && video ? (
                <SpatialVideoSound
                    targetRef={meshRef}
                    video={video}
                    volume={volume}
                    distance={distance}
                    maxDistance={maxDistance}
                />
            ) : null}
        </mesh>
    )
}
