import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import MapSourceView from '../../map/MapSourceView.jsx'
import { CARD_PALETTE } from '../../map/mapTestPattern.jsx'
import { toTopNetwork } from '../../project/tops/useTopNetwork.js'
import { liveScreenPlan, liveScreenRate, pickPictureElement, referencedSurfaceIds } from '../../project/viewport/liveScreen.js'

// THE SOURCES BEHIND THE SCREENS. Editor furniture, outside the WebGL canvas.
//
// A plane with `components.surface` shows a mapping surface, and a mapping
// surface is drawn by the map lane as a DOM element — MapSourceView already
// knows how to open a camera, find a stream by name, retry a late file, run the
// picture network into a canvas, and say WHY when it cannot. None of that is
// written twice here. Each surface a screen points at gets one real
// MapSourceView, mounted in a 1px hidden host beside the viewport, and the
// element it produces is wrapped in a THREE.Texture that the plane draws.
//
// One source per SURFACE, not per plane: two screens showing the same wall
// share one decode. A surface no screen points at is not mounted at all, so an
// idle room costs nothing.
//
// The texture is re-uploaded at a capped rate (liveScreen.js): the network at
// 15, an NDI® image at 30, a still once, and a <video> once per frame the
// browser presents (three.js's VideoTexture, which is the ONLY texture that
// can read a <video> — a plain Texture sizes it from image.width, 0 on a
// <video>, and uploads nothing). Uploads are the whole GPU cost of a screen —
// measured, see the session note.

const PLATE_WIDTH = 640
const PLATE_HEIGHT = 360

// The card's colours, read from the stylesheet so the plate IS the card
// (`--di-card-*` in src/styles/base.css). The stylesheet is unreachable from a
// test, and from a canvas the fallback is the same three values by contract.
const readToken = (name, fallback) => {
    try {
        const value = globalThis.getComputedStyle?.(globalThis.document.documentElement)?.getPropertyValue(name)?.trim()
        return value || fallback
    } catch {
        return fallback
    }
}

const cardTokens = () => ({
    ground: readToken('--di-card-ground', CARD_PALETTE.ground),
    ink: readToken('--di-card-ink', CARD_PALETTE.ink),
    frame: readToken('--di-card-frame', CARD_PALETTE.frame),
    font: readToken('--di-mono', 'monospace')
})

// A dim named plate, drawn once. The same words the map's placeholder shows —
// the surface's name large, the reason small — in the same palette, and for
// the same reason: a plate is on a screen in somebody's room, and it must not
// light the room up. Everything here stays under the card's ~38% luminance.
export const drawPlate = (canvas, { title = '', detail = '' } = {}) => {
    const context = canvas.getContext?.('2d')
    if (!context) return canvas
    const { width, height } = canvas
    const tokens = cardTokens()
    context.fillStyle = tokens.ground
    context.fillRect(0, 0, width, height)
    context.strokeStyle = tokens.frame
    context.lineWidth = 4
    context.strokeRect(2, 2, width - 4, height - 4)
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    const scale = Math.min(width, height)
    context.fillStyle = tokens.ink
    context.font = `${Math.max(18, Math.round(scale / 9))}px ${tokens.font}`
    context.fillText(title, width / 2, detail ? height / 2 - scale / 22 : height / 2, width - 40)
    if (detail) {
        context.fillStyle = tokens.frame
        context.font = `${Math.max(11, Math.round(scale / 20))}px ${tokens.font}`
        context.fillText(detail, width / 2, height / 2 + scale / 14, width - 40)
    }
    return canvas
}

const pictureTexture = (element) => {
    const texture = element?.tagName?.toLowerCase() === 'video' ? new THREE.VideoTexture(element) : new THREE.Texture(element)
    texture.colorSpace = THREE.SRGBColorSpace
    // Video and canvas sizes are whatever the source is; no mipmaps, no
    // power-of-two rounding, no blur on a wall that is already 640 wide.
    texture.generateMipmaps = false
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    return texture
}

const plateTexture = (words) => {
    const canvas = globalThis.document.createElement('canvas')
    canvas.width = PLATE_WIDTH
    canvas.height = PLATE_HEIGHT
    drawPlate(canvas, words)
    const texture = pictureTexture(canvas)
    texture.needsUpdate = true
    return texture
}

// A test pattern is an inline <svg>, which WebGL cannot read; it is drawn into
// a canvas through an <img> first. The result is still and uploaded once.
const rasterised = (svg, texture) => {
    const canvas = texture.image
    const width = Number(svg.getAttribute('width')) || PLATE_WIDTH
    const height = Number(svg.getAttribute('height')) || PLATE_HEIGHT
    canvas.width = width
    canvas.height = height
    const xml = new XMLSerializer().serializeToString(svg)
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }))
    const image = new Image()
    image.onload = () => {
        canvas.getContext('2d')?.drawImage(image, 0, 0, width, height)
        URL.revokeObjectURL(url)
        texture.needsUpdate = true
    }
    image.onerror = () => URL.revokeObjectURL(url)
    image.src = url
}

const readyToUpload = (element) => {
    const tag = element?.tagName?.toLowerCase()
    if (tag === 'video') return element.readyState >= 2
    if (tag === 'img') return element.complete && element.naturalWidth > 0
    return true
}

// A source's picture element, as a texture the room can draw. Re-made whenever
// the map lane swaps its element (a retry remounts a <video>; an NDI® <img>
// turns from hidden to painted; a placeholder's words change), disposed with
// the previous one.
const textureFor = (element, kind) => {
    const tag = element.tagName.toLowerCase()
    if (element.classList.contains('map-source-placeholder')) {
        const title = element.querySelector('.map-source-placeholder-label')?.textContent || ''
        const detail = element.querySelector('.map-source-placeholder-detail')?.textContent || ''
        return { texture: plateTexture({ title, detail }), rate: 0, signature: `plate|${title}|${detail}` }
    }
    if (tag === 'svg') {
        const canvas = globalThis.document.createElement('canvas')
        const texture = pictureTexture(canvas)
        rasterised(element, texture)
        return { texture, rate: 0, signature: `svg|${element.outerHTML.length}|${element.textContent}` }
    }
    const texture = pictureTexture(element)
    // A video texture updates itself as frames arrive; the others upload when
    // ready and then on the shared clock below.
    if (tag !== 'video' && readyToUpload(element)) texture.needsUpdate = true
    else if (tag === 'img') element.addEventListener('load', () => { texture.needsUpdate = true }, { once: true })
    return { texture, rate: liveScreenRate(kind, tag), signature: `${tag}|${element}`, element }
}

function LiveScreenSource({ surfaceId, surface, spaceId, network, register }) {
    const hostRef = useRef(null)
    const plan = useMemo(() => liveScreenPlan(surface, surfaceId), [surface, surfaceId])

    // The flat and the plate: no DOM source, one answer, disposed on the way out.
    useEffect(() => {
        if (plan.mode === 'colour') {
            register(surfaceId, { colour: plan.colour })
            return () => register(surfaceId, null)
        }
        if (plan.mode === 'plate') {
            const texture = plateTexture({ title: plan.title, detail: plan.detail })
            register(surfaceId, { texture, rate: 0 })
            return () => { texture.dispose(); register(surfaceId, null) }
        }
        return undefined
    }, [plan, surfaceId, register])

    // The live kinds: watch the host for the element the map lane draws.
    useEffect(() => {
        if (plan.mode !== 'live') return undefined
        const host = hostRef.current
        if (!host) return undefined
        let current = null
        const sync = () => {
            const element = pickPictureElement(host)
            if (!element) {
                if (current) { current.texture.dispose(); current = null; register(surfaceId, null) }
                return
            }
            const next = textureFor(element, plan.kind)
            if (current && current.element === element && current.signature === next.signature) {
                next.texture.dispose()
                return
            }
            current?.texture.dispose()
            current = { ...next, element }
            register(surfaceId, { texture: next.texture, rate: next.rate, element })
        }
        sync()
        const observer = new MutationObserver(sync)
        observer.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'], characterData: true })
        return () => {
            observer.disconnect()
            current?.texture.dispose()
            register(surfaceId, null)
        }
    }, [plan, surfaceId, register])

    if (plan.mode !== 'live') return null
    return (
        <div ref={hostRef} className="studio-live-screen-host" data-surface-id={surfaceId}>
            <MapSourceView surface={surface} spaceId={spaceId} live network={network} label={surface.name || surface.id} />
        </div>
    )
}

export default function LiveScreens({ document, onScreens }) {
    const ids = useMemo(() => referencedSurfaceIds(document?.entities), [document?.entities])
    const surfaces = document?.mappingState?.surfaces
    const byId = useMemo(() => new Map((surfaces || []).map((surface) => [surface.id, surface])), [surfaces])
    // The picture network, read the way the map's output reads it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const network = useMemo(() => toTopNetwork(document), [document?.nodes, document?.edges])
    const spaceId = document?.projectMeta?.spaceId || ''

    const registry = useRef(new Map())
    const onScreensRef = useRef(onScreens)
    useEffect(() => { onScreensRef.current = onScreens })

    const publish = () => {
        const screens = new Map()
        for (const [id, entry] of registry.current) {
            screens.set(id, entry.texture ? { texture: entry.texture } : { colour: entry.colour })
        }
        onScreensRef.current?.(screens)
    }
    const registerRef = useRef(null)
    if (!registerRef.current) {
        registerRef.current = (surfaceId, entry) => {
            if (entry) registry.current.set(surfaceId, { ...entry, last: 0 })
            else registry.current.delete(surfaceId)
            publish()
        }
    }

    // One clock for every picture with a numeric rate (a canvas, an NDI® image):
    // a texture is marked for upload when its own interval has passed and its
    // element has a frame to give. A <video> is not on this clock — see above.
    useEffect(() => {
        let frame = 0
        const tick = (now) => {
            for (const entry of registry.current.values()) {
                if (typeof entry.rate !== 'number' || !entry.rate || !entry.texture || !entry.element) continue
                if (now - entry.last < 1000 / entry.rate) continue
                if (!readyToUpload(entry.element)) continue
                entry.last = now
                entry.texture.needsUpdate = true
            }
            frame = globalThis.requestAnimationFrame?.(tick) || 0
        }
        frame = globalThis.requestAnimationFrame?.(tick) || 0
        return () => globalThis.cancelAnimationFrame?.(frame)
    }, [])

    if (!ids.length) return null
    return (
        <div className="studio-live-screens" aria-hidden="true">
            {ids.map((id) => (
                <LiveScreenSource
                    key={id}
                    surfaceId={id}
                    surface={byId.get(id) || null}
                    spaceId={spaceId}
                    network={network}
                    register={registerRef.current}
                />
            ))}
        </div>
    )
}
