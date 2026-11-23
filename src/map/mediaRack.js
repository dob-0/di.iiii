import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import MapTestPattern, { DEFAULT_TEST_PATTERN } from './mapTestPattern.jsx'
import { resolveMapSourceRef } from './MapSourceView.jsx'
import { announceVisualParams } from './visualParams.js'

// THE MEDIA RACK — every source the stage's slices draw from, once.
//
// 2026-10-25, "when I'm changing points the image is disappearing": a slice
// used to draw its picture one way while unbent (a CSS corner-pin over its own
// <video>, <img> or <iframe>) and another way once a warp point moved (WebGL,
// with ANOTHER copy of the source). The switch restarted the copy: a page
// visual began its animation again from nothing, a video from 0, a photo faded
// in from black — and with neighbouring slices following along, the whole wall
// blinked.
//
// So, the way Resolume renders a composition once and lets slices sample it:
// one video element, one image, one camera, one relayed page per source, held
// here; every slice — bent or not — draws from the same one through the shared
// mesh renderer (meshRenderer.js). Moving a point changes geometry and nothing
// else. A source is kept for a few seconds after its last slice lets go, so a
// crossfade, a re-render or a point snapping back never starts it over.

const KEEP_MS = 4000
const NO_FRAMES_MS = 6000
// How many unused clip PAGES may wait for reuse. Each is a live WebGL page:
// switching clips fast kept up to 30 alive for KEEP_MS each (+2.3 GB, past
// Chrome's WebGL context limit; audit 11-12). The oldest unused one goes
// first. Pictures, videos and cameras are cheap and keep the plain timer.
export const MAX_IDLE_PAGES = 2

// Which rack entry a source needs. A colour needs none; a page and a test card
// are laid out at a size, so the size is part of what they are.
export const rackKeyFor = (source, frame) => {
    if (!source) return null
    const size = `${Math.round(frame?.width || 0)}x${Math.round(frame?.height || 0)}`
    switch (source.kind) {
        case 'video':
        case 'image':
            return source.ref ? `${source.kind}|${source.ref}` : null
        case 'camera':
            return `camera|${source.ref || ''}`
        case 'test':
            return `test|${source.ref || DEFAULT_TEST_PATTERN}|${size}`
        case 'html':
            return source.ref ? `html|${source.ref}|${size}` : null
        default:
            return null
    }
}

export function createMediaRack({ onDispose = null } = {}) {
    const entries = new Map()
    const statusListeners = new Set()
    let statusVersion = 0
    let container = null
    let scale = 1

    const statusChanged = () => {
        statusVersion += 1
        statusListeners.forEach((listener) => listener())
    }
    const notify = (entry) => entry.listeners.forEach((listener) => listener())
    const markReady = (entry) => {
        const was = entry.status
        entry.ready = true
        entry.status = 'live'
        entry.version += 1
        notify(entry)
        if (was !== 'live') statusChanged()
    }

    const build = (entry, source, frame) => {
        const { kind } = entry
        const ref = source.ref || ''
        if (kind === 'video') {
            const video = document.createElement('video')
            Object.assign(video, { muted: true, loop: true, autoplay: true, playsInline: true, crossOrigin: 'anonymous', preload: 'auto' })
            video.addEventListener('loadeddata', () => markReady(entry))
            // A file that fails comes back on its own, like the desk's retrying media.
            video.addEventListener('error', () => {
                clearTimeout(entry.retry)
                entry.retry = setTimeout(() => { video.load(); video.play?.().catch(() => {}) }, 2000)
            })
            video.src = resolveMapSourceRef(ref)
            video.play?.().catch(() => {})
            entry.element = video
            entry.dispose = () => { clearTimeout(entry.retry); video.pause(); video.removeAttribute('src'); video.load?.() }
        } else if (kind === 'image') {
            const image = new Image()
            image.crossOrigin = 'anonymous'
            image.onload = () => markReady(entry)
            image.src = resolveMapSourceRef(ref)
            entry.element = image
        } else if (kind === 'camera') {
            const video = document.createElement('video')
            Object.assign(video, { muted: true, autoplay: true, playsInline: true })
            let stream = null
            let gone = false
            navigator.mediaDevices?.getUserMedia({ video: ref ? { deviceId: { exact: ref } } : true, audio: false })
                .then((result) => {
                    if (gone) { result.getTracks().forEach((track) => track.stop()); return }
                    stream = result
                    video.srcObject = result
                    video.addEventListener('loadeddata', () => markReady(entry), { once: true })
                    video.play?.().catch(() => {})
                })
                .catch(() => { entry.status = 'none'; statusChanged() })
            entry.element = video
            entry.dispose = () => { gone = true; stream?.getTracks().forEach((track) => track.stop()); video.srcObject = null }
        } else if (kind === 'test') {
            const markup = renderToStaticMarkup(createElement(MapTestPattern, { pattern: ref || DEFAULT_TEST_PATTERN, width: frame.width, height: frame.height, label: '' }))
            const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }))
            const image = new Image()
            image.onload = () => { URL.revokeObjectURL(url); markReady(entry) }
            image.onerror = () => URL.revokeObjectURL(url)
            image.src = url
            entry.element = image
        } else if (kind === 'html') {
            // The visual's page, hidden but alive, handing its frames over the
            // frame relay (serverXR/src/frameRelay.js).
            const iframe = document.createElement('iframe')
            iframe.className = 'map-relay-source'
            iframe.setAttribute('sandbox', 'allow-scripts allow-pointer-lock')
            iframe.setAttribute('referrerpolicy', 'no-referrer')
            iframe.setAttribute('allow', 'autoplay')
            iframe.setAttribute('aria-hidden', 'true')
            iframe.setAttribute('tabindex', '-1')
            iframe.setAttribute('scrolling', 'no')
            iframe.title = 'Visual (relay)'
            iframe.style.width = `${frame.width}px`
            iframe.style.height = `${frame.height}px`
            iframe.style.transform = `scale(${scale})`
            let channel = null
            let timer = null
            // The relay sends a frame only after a 'next', one in flight. A
            // 'next' sent only when a frame arrives often lands just after
            // the page's following animation frame, so every other frame was
            // skipped: a 60 fps visual reached the monitors at about 28
            // (measured 11-12; the copy itself takes ~0.2 ms). So the desk
            // also says 'next' on each of its own frames; the page still never
            // has more than one frame in flight, and a stalled desk stops
            // asking. Emily, 11-12: "lag and not smooth".
            // Twice a frame, half a frame apart: the desk's frames and the
            // page's run in different processes, and one 'next' a frame can
            // land just before the page's frame instead of just after it.
            let pump = 0
            let half = null
            const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null
            const askNext = () => { try { channel?.port1.postMessage('next') } catch { /* closed */ } }
            const stopPump = () => {
                if (pump && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(pump)
                pump = 0
                clearTimeout(half)
            }
            const startPump = () => {
                stopPump()
                if (!raf) return
                const ask = () => {
                    pump = raf(ask)
                    askNext()
                    clearTimeout(half)
                    half = setTimeout(askNext, 8)
                }
                pump = raf(ask)
            }
            const connect = () => {
                channel?.port1.close()
                channel = new MessageChannel()
                channel.port1.onmessage = (event) => {
                    const data = event.data
                    if (data?.type === 'frame' && data.bitmap) {
                        if (entry.bitmap && entry.bitmap !== data.bitmap) entry.bitmap.close?.()
                        entry.bitmap = data.bitmap
                        markReady(entry)
                        channel.port1.postMessage('next')
                    } else if (data?.type === 'none' && entry.status !== 'none') {
                        entry.status = 'none'
                        statusChanged()
                    }
                }
                clearTimeout(timer)
                timer = setTimeout(() => {
                    if (entry.status === 'starting') { entry.status = 'none'; statusChanged() }
                }, NO_FRAMES_MS)
                iframe.contentWindow?.postMessage(
                    { type: 'di-frame-relay', maxWidth: Math.min(4096, frame.width), maxHeight: Math.min(4096, frame.height) },
                    '*',
                    [channel.port2]
                )
                startPump()
            }
            // The clip's own settings (visualParams.js): it announces them,
            // we send the chosen values on every load and on every change.
            const onMessage = (event) => {
                if (event.source !== iframe.contentWindow) return
                const data = event.data
                if (data?.type === 'di-visual-params' && Array.isArray(data.params)) {
                    entry.paramSpec = data.params
                    announceVisualParams(ref, data.params)
                }
            }
            window.addEventListener('message', onMessage)
            entry.sendParams = () => {
                try { iframe.contentWindow?.postMessage({ type: 'di-visual-set', values: entry.params || {} }, '*') } catch { /* gone */ }
            }
            const onLoad = () => {
                connect()
                entry.sendParams()
                try { iframe.contentWindow?.postMessage({ type: 'di-visual-hello' }, '*') } catch { /* gone */ }
            }
            iframe.addEventListener('load', onLoad)
            iframe.src = resolveMapSourceRef(ref)
            entry.iframe = iframe
            if (container) container.appendChild(iframe)
            entry.dispose = () => {
                clearTimeout(timer)
                stopPump()
                window.removeEventListener('message', onMessage)
                iframe.removeEventListener('load', onLoad)
                channel?.port1.close()
                iframe.remove()
                entry.bitmap?.close?.()
                entry.bitmap = null
            }
        }
    }

    return {
        acquire(key, source, frame) {
            if (!key) return null
            let entry = entries.get(key)
            if (!entry) {
                entry = {
                    key, kind: key.split('|')[0], refs: 0, element: null, bitmap: null, iframe: null,
                    ready: false, status: 'starting', version: 0, listeners: new Set(), keep: null, dispose: null, retry: null
                }
                entries.set(key, entry)
                build(entry, source, frame)
            }
            clearTimeout(entry.keep)
            entry.keep = null
            entry.refs += 1
            return entry
        },
        release(key) {
            const entry = entries.get(key)
            if (!entry) return
            entry.refs = Math.max(0, entry.refs - 1)
            if (entry.refs > 0) return
            const drop = (dropKey, dropped) => {
                clearTimeout(dropped.keep)
                dropped.keep = null
                dropped.dispose?.()
                entries.delete(dropKey)
                onDispose?.(dropKey)
                statusChanged()
            }
            clearTimeout(entry.keep)
            entry.idleAt = Date.now()
            entry.keep = setTimeout(() => {
                if (entry.refs > 0) return
                drop(key, entry)
            }, KEEP_MS)
            if (entry.kind === 'html') {
                const idle = [...entries.entries()]
                    .filter(([, other]) => other.kind === 'html' && other.refs === 0 && other.keep)
                    .sort(([, a], [, b]) => a.idleAt - b.idleAt)
                while (idle.length > MAX_IDLE_PAGES) {
                    const [oldKey, oldest] = idle.shift()
                    drop(oldKey, oldest)
                }
            }
        },
        entry: (key) => entries.get(key) || null,
        // The values a clip's settings are at; sent only when they change.
        setParams(key, values) {
            const entry = entries.get(key)
            if (!entry) return
            const json = JSON.stringify(values || {})
            if (entry.paramsJson === json) return
            entry.paramsJson = json
            entry.params = values || {}
            entry.sendParams?.()
        },
        status: (key) => entries.get(key)?.status || 'starting',
        subscribe(key, listener) {
            const entry = entries.get(key)
            if (!entry) return () => {}
            entry.listeners.add(listener)
            return () => entry.listeners.delete(listener)
        },
        subscribeStatus(listener) {
            statusListeners.add(listener)
            return () => statusListeners.delete(listener)
        },
        statusVersion: () => statusVersion,
        setContainer(node) {
            container = node
            if (!node) return
            entries.forEach((entry) => { if (entry.iframe && entry.iframe.parentNode !== node) node.appendChild(entry.iframe) })
        },
        setScale(next) {
            scale = next
            entries.forEach((entry) => { if (entry.iframe) entry.iframe.style.transform = `scale(${scale})` })
        },
        destroy() {
            entries.forEach((entry) => { clearTimeout(entry.keep); entry.dispose?.() })
            entries.clear()
        }
    }
}
