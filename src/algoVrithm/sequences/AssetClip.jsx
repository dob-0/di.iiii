import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { fadeEnvelope } from '../../timeline/clock.js'

// One component for every asset-backed beat: an image, a video, or a model.
//
// This is the sequence type you do NOT write code for. A hand-written sequence
// (WhiteTunnel, PixelField) is a bespoke idea in GLSL and geometry; an asset
// clip is a thing placed in the room for a while. The director panel creates
// these, so adding media to the piece is a drag, not a file.
//
// The viewer never moves and never turns to find anything (see the VR rule in
// WhiteTunnel.jsx), so placement is polar around the standing position rather
// than free XYZ: how far in front, how high, how far round. Three numbers a
// non-technical author can reason about, instead of a transform matrix.

// Placement maths moved to assetPlacement.js so the drag handles can run it
// backwards — see the note at the top of that file. Re-exported here because
// this was its home and callers should not have to care that it moved.
// Imported as well as re-exported: `export ... from` is a pure pass-through
// and does not bind the names locally, which this file needs below.
import {
    DEFAULT_PLACEMENT,
    placementPosition,
    resolvePlacement
} from '../../timeline/assetPlacement.js'

export { DEFAULT_PLACEMENT, placementPosition, resolvePlacement }

function ImagePlane({ asset, placement, envelope }) {
    const materialRef = useRef(null)
    const texture = useTexture(asset.src)

    // Aspect from the decoded image, so a wide still is not squashed into a
    // square. `size` is the HEIGHT — the one dimension that stays predictable
    // when you swap one image for another.
    const width = useMemo(() => {
        const image = texture.image
        const ratio = image?.width && image?.height ? image.width / image.height : 1
        return placement.size * ratio
    }, [texture, placement.size])

    useFrame(() => {
        if (materialRef.current) materialRef.current.opacity = envelope
    })

    return (
        <mesh>
            <planeGeometry args={[width, placement.size]} />
            <meshBasicMaterial
                ref={materialRef}
                map={texture}
                transparent
                opacity={0}
                side={THREE.DoubleSide}
                toneMapped={false}
                depthWrite={false}
            />
        </mesh>
    )
}

// One video element per source file, alive for as long as the page is.
//
// THE REEL NEVER STOPS. This is an installation, not a screening: the footage
// must run continuously and must never restart under the viewer. That is not
// what a component-owned video gives you. Sequence groups mount and unmount as
// the playhead crosses their window, and the ritual clock loops
// 0 -> duration -> 0 forever — so a video owned by its clip was being torn down
// and rebuilt on every pass (pause, drop src, load), which restarted the
// footage from frame 0 each time round the piece.
//
// Hoisting the element out of the component makes playback a property of the
// PIECE rather than of one clip's window: it keeps rolling while its clip is
// off screen, and a clip that comes back around rejoins the reel wherever it
// has got to. The feed was already running before you looked at it, which is
// the whole idea.
//
// Deliberately never disposed. The pool is bounded by the number of files in
// src/algoVrithm/assets/, an off-screen muted video is cheap, and the only
// alternative — free it when the last clip unmounts — is exactly the restart
// this exists to remove.
//
// Two clips on the same file now SHARE one element and one decode, so they
// show the same frame. That is wanted: it is one decode instead of two on a
// headset that can only manage a couple, and a ring of panels showing the same
// instant is the piece's subject rather than a compromise.
const VIDEO_POOL = new Map()

// Built by hand rather than via drei's <Video>: the element has to be muted and
// playsInline BEFORE the first play() call or mobile Safari and the Quest
// browser reject it outright, and the piece has no UI to offer a "tap to play"
// fallback.
const acquireVideo = (src) => {
    const cached = VIDEO_POOL.get(src)
    if (cached) return cached

    const video = document.createElement('video')
    video.src = src
    video.crossOrigin = 'anonymous'
    video.loop = true
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'

    const entry = { element: video, texture: new THREE.VideoTexture(video) }
    VIDEO_POOL.set(src, entry)
    return entry
}

function VideoPlane({ asset, placement, envelope }) {
    const materialRef = useRef(null)

    const { texture, element } = useMemo(() => acquireVideo(asset.src), [asset.src])

    useEffect(() => {
        // Only ever started, never stopped. Autoplay can still be refused
        // before the first gesture, so this retries on each mount instead of
        // surfacing it — an autoplay-blocked video shows its first frame and
        // nothing else breaks.
        if (element.paused) element.play().catch(() => {})
    }, [element])

    // videoWidth is 0 until metadata arrives, so the real aspect has to be
    // picked up on the event rather than read once at mount — otherwise every
    // clip is 16:9 forever, silently stretching anything shot portrait.
    const [aspect, setAspect] = useState(16 / 9)

    useEffect(() => {
        const readAspect = () => {
            if (element.videoWidth && element.videoHeight) {
                setAspect(element.videoWidth / element.videoHeight)
            }
        }
        readAspect()
        element.addEventListener('loadedmetadata', readAspect)
        return () => element.removeEventListener('loadedmetadata', readAspect)
    }, [element])

    const width = placement.size * aspect

    useFrame(() => {
        if (materialRef.current) materialRef.current.opacity = envelope
    })

    return (
        <mesh>
            <planeGeometry args={[width, placement.size]} />
            <meshBasicMaterial
                ref={materialRef}
                map={texture}
                transparent
                opacity={0}
                side={THREE.DoubleSide}
                toneMapped={false}
                depthWrite={false}
            />
        </mesh>
    )
}

function Model({ asset, placement, envelope }) {
    const { scene } = useGLTF(asset.src)

    // Cloned because the same .glb dropped on the timeline twice would
    // otherwise be one object teleporting between both clips.
    const model = useMemo(() => scene.clone(true), [scene])

    // Normalised to `size` metres tall whatever units it was exported in —
    // Blender metres and centimetres both show up in practice, and a model
    // that lands 100x too big is indistinguishable from one that failed.
    const scale = useMemo(() => {
        const box = new THREE.Box3().setFromObject(model)
        const height = box.max.y - box.min.y
        return height > 0 ? placement.size / height : 1
    }, [model, placement.size])

    useEffect(() => {
        model.traverse((child) => {
            if (!child.isMesh) return
            // Per-clip material instances, else fading one clip fades every
            // other clip sharing the same source file.
            child.material = child.material.clone()
            child.material.transparent = true
        })
    }, [model])

    useFrame(() => {
        model.traverse((child) => {
            if (child.isMesh) child.material.opacity = envelope
        })
    })

    return <primitive object={model} scale={scale} />
}

function AssetClipInner({ progress, asset }) {
    const placement = resolvePlacement(asset)
    const envelope = fadeEnvelope(progress, 0.18)

    if (!asset?.src) return null

    // Rendered at the local origin. The group Director wraps every sequence in
    // now carries the polar placement, so the group sits exactly where the
    // asset is — which is what lets the drag handles land on it instead of on
    // the floor at the viewer's feet. See assetPlacement.js.
    return asset.kind === 'video'
        ? <VideoPlane asset={asset} placement={placement} envelope={envelope} />
        : asset.kind === 'model'
            ? <Model asset={asset} placement={placement} envelope={envelope} />
            : <ImagePlane asset={asset} placement={placement} envelope={envelope} />
}

export default function AssetClip({ progress, asset }) {
    // Its own boundary, not the stage's. Suspending the whole Stage while a
    // texture decodes would blank the piece mid-play; this way a slow asset is
    // simply absent for a frame or two and everything else keeps running.
    return (
        <Suspense fallback={null}>
            <AssetClipInner progress={progress} asset={asset} />
        </Suspense>
    )
}
