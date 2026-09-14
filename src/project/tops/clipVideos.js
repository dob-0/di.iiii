// Clip In's footage: one <video> per clip, playing the way the node's values
// say — speed, an in and an out point, loop / bounce / once, restart on a
// trigger. The engine reads the element like a camera (setVideo); nothing here
// knows about WebGL, React or the project document.
//
// Browsers do not play backwards (a negative playbackRate is refused), so the
// return leg of a bounce is stepped by hand, one animation frame at a time.
// While a clip is paused nothing ticks.

import { buildAssetMap } from '../viewport/buildAssetMap.js'
import { buildProjectAssetUrl } from '../services/projectsApi.js'
import { getServerSpaceAssetUrl } from '../../services/serverSpaces.js'
import { mountRelativeApiUrl } from '../../services/assetSources.js'

export const CLIP_MODE = Object.freeze({ LOOP: '0', BOUNCE: '1', ONCE: '2' })

const MAX_SPEED = 4
// Chrome refuses a playbackRate below 1/16; slower than that reads as still.
const MIN_RATE = 0.0625
const EPSILON = 0.001

const clamp01 = (value, fallback) => {
    const number = Number(value)
    return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback
}

/** A node's values as the player reads them, defaults filled in and clamped. */
export const normaliseClipValues = (values = {}) => {
    const speed = Number(values?.speed)
    const mode = String(values?.mode ?? CLIP_MODE.LOOP)
    const trigger = Number(values?.trigger)
    return {
        asset: typeof values?.asset === 'string' ? values.asset.trim() : '',
        speed: Number.isFinite(speed) ? Math.min(MAX_SPEED, Math.max(0, speed)) : 1,
        mode: Object.values(CLIP_MODE).includes(mode) ? mode : CLIP_MODE.LOOP,
        in: clamp01(values?.in, 0),
        out: clamp01(values?.out, 1),
        trigger: Number.isFinite(trigger) ? trigger : 0,
        playing: values?.playing === undefined ? true : values.playing !== false && values.playing !== 0 && values.playing !== '0'
    }
}

/**
 * The part of the file that plays, in seconds. In and out may be drawn either
 * way round; an empty window plays from in to the end rather than nothing.
 */
export const clipWindow = (duration, values = {}) => {
    const v = normaliseClipValues(values)
    if (!(duration > 0) || !Number.isFinite(duration)) return { start: 0, end: 0 }
    const low = Math.min(v.in, v.out)
    const high = Math.max(v.in, v.out)
    const start = low * duration
    const end = high - low > EPSILON ? high * duration : duration
    return { start, end }
}

/**
 * One tick of the transport, pure. `time` is where the clip is now (the
 * element's currentTime, or the hand-stepped position on a bounce's way back),
 * `dt` the seconds since the last tick, `direction` 1 forward / -1 back.
 * @returns {{ direction: number, seek: number|null, play: boolean }}
 *   play: should the element itself be playing; seek: move it here first
 */
export const stepClip = ({ time = 0, duration = NaN, dt = 0, direction = 1, values = {} } = {}) => {
    const v = normaliseClipValues(values)
    const running = v.playing && v.speed > 0
    if (!(duration > 0) || !Number.isFinite(duration)) return { direction: 1, seek: null, play: running }
    if (!running) return { direction, seek: null, play: false }
    const { start, end } = clipWindow(duration, v)

    if (v.mode === CLIP_MODE.BOUNCE) {
        if (direction < 0) {
            const next = time - dt * v.speed
            if (next <= start) return { direction: 1, seek: start, play: true }
            return { direction: -1, seek: next, play: false }
        }
        if (time >= end - EPSILON) return { direction: -1, seek: Math.min(time, end), play: false }
        if (time < start - EPSILON) return { direction: 1, seek: start, play: true }
        return { direction: 1, seek: null, play: true }
    }

    if (time >= end - EPSILON) {
        if (v.mode === CLIP_MODE.ONCE) return { direction: 1, seek: time > end + EPSILON ? end : null, play: false }
        return { direction: 1, seek: start, play: true }
    }
    if (time < start - EPSILON) return { direction: 1, seek: start, play: true }
    return { direction: 1, seek: null, play: true }
}

const URL_LIKE = /^(?:[a-z][a-z0-9+.-]*:|\/|\.{1,2}\/)/i

/**
 * The address a clip's `asset` plays from. A URL is used as it is (a
 * site-root `/api/...` path remounted onto the deployed API base); an id is
 * looked up the way the viewport does it — the project's own files first
 * (buildAssetMap), then the space's files.
 * @param {string} asset   an asset id, or a URL
 * @param {string} [spaceId]
 * @param {object} [options]
 * @param {Array|Map} [options.assets]   the project document's assets
 * @param {string} [options.projectId]
 */
export const resolveClipUrl = (asset, spaceId = '', { assets = null, projectId = null } = {}) => {
    const value = typeof asset === 'string' ? asset.trim() : ''
    if (!value) return ''
    if (URL_LIKE.test(value)) return mountRelativeApiUrl(value) || value
    const map = assets instanceof Map
        ? assets
        : buildAssetMap({ assets: Array.isArray(assets) ? assets : [], projectMeta: projectId ? { id: projectId } : null })
    const known = map.get(value)
    if (known?.url) return mountRelativeApiUrl(known.url) || known.url
    if (projectId) return buildProjectAssetUrl(projectId, value)
    return spaceId ? getServerSpaceAssetUrl(spaceId, value) : ''
}

const needsCrossOrigin = (url) => {
    if (!/^https?:/i.test(url)) return false
    try {
        return new URL(url).origin !== globalThis.location?.origin
    } catch {
        return false
    }
}

/**
 * @param {object} values   the node's values (see normaliseClipValues)
 * @param {object} [options]
 * @param {(asset: string) => string} [options.resolveAssetUrl]  asset → URL; default: the value itself
 * @returns {{ video: HTMLVideoElement, update: (values: object) => void, dispose: () => void }}
 */
export const createClipVideo = (values = {}, {
    resolveAssetUrl = (asset) => asset,
    document: doc = globalThis.document,
    requestFrame = (callback) => globalThis.requestAnimationFrame(callback),
    cancelFrame = (handle) => globalThis.cancelAnimationFrame(handle)
} = {}) => {
    const video = doc.createElement('video')
    video.muted = true
    video.defaultMuted = true
    video.playsInline = true
    video.setAttribute('playsinline', '')
    video.setAttribute('muted', '')
    video.preload = 'auto'

    let current = null
    let url = ''
    let direction = 1
    let position = 0
    let raf = 0
    let lastTick = 0
    let restartPending = false
    // A Once clip that reached its out point holds its last frame without
    // ticking, until it is triggered again or its window moves.
    let held = false
    let disposed = false

    const running = () => Boolean(url) && current.playing && current.speed > 0 && !held
    const play = () => {
        if (!video.paused) return
        try { video.play()?.catch?.(() => {}) } catch { /* not ready — the next tick asks again */ }
    }
    const seek = (time) => {
        if (!Number.isFinite(time)) return
        try { video.currentTime = time } catch { /* no metadata yet */ }
    }

    const tick = (now) => {
        raf = 0
        if (disposed) return
        const dt = lastTick ? Math.max(0, Math.min(0.25, (now - lastTick) / 1000)) : 0
        lastTick = now
        const duration = video.duration
        if (restartPending && duration > 0) {
            restartPending = false
            direction = 1
            seek(clipWindow(duration, current).start)
        }
        const time = direction < 0 ? position : video.currentTime
        const step = stepClip({ time, duration, dt, direction, values: current })
        direction = step.direction
        if (step.seek !== null) {
            position = step.seek
            // A seek still decoding would be thrown away by the next one; the
            // hand-stepped position keeps moving and the element catches up.
            if (direction > 0 || !video.seeking) seek(step.seek)
        }
        if (step.play) play()
        else {
            if (!video.paused) video.pause()
            if (current.mode === CLIP_MODE.ONCE) held = true
        }
        schedule()
    }

    function schedule() {
        if (raf || disposed || !running()) return
        raf = requestFrame(tick)
    }
    const stop = () => {
        if (raf) cancelFrame(raf)
        raf = 0
        lastTick = 0
    }

    const onMetadata = () => {
        if (disposed || !current) return
        restartPending = true
        stop()
        if (running()) schedule()
        else seek(clipWindow(video.duration, current).start)
    }
    video.addEventListener('loadedmetadata', onMetadata)

    const setSource = (next) => {
        if (next === url) return
        url = next
        direction = 1
        if (!url) {
            video.removeAttribute('src')
            try { video.load() } catch { /* nothing loaded */ }
            return
        }
        if (needsCrossOrigin(url)) video.crossOrigin = 'anonymous'
        else video.removeAttribute('crossorigin')
        video.src = url
    }

    const update = (nextValues = {}) => {
        if (disposed) return
        const next = normaliseClipValues(nextValues)
        const previous = current
        current = next
        const moved = !previous || next.trigger !== previous.trigger || next.mode !== previous.mode || next.in !== previous.in || next.out !== previous.out
        const nextUrl = resolveAssetUrl(next.asset) || ''
        if (moved || nextUrl !== url) held = false
        setSource(nextUrl)
        if (next.speed > 0) video.playbackRate = Math.max(MIN_RATE, next.speed)
        if (previous && next.trigger !== previous.trigger) {
            restartPending = true
            direction = 1
            if (video.duration > 0) {
                restartPending = false
                seek(clipWindow(video.duration, next).start)
            }
        }
        if (!running()) {
            stop()
            if (!video.paused) video.pause()
            return
        }
        if (direction > 0) play()
        schedule()
    }

    const dispose = () => {
        if (disposed) return
        stop()
        disposed = true
        video.removeEventListener('loadedmetadata', onMetadata)
        try { video.pause() } catch { /* already gone */ }
        video.removeAttribute('src')
        // Releases the decoder; a removed src alone keeps it until GC.
        try { video.load() } catch { /* nothing loaded */ }
    }

    update(values)
    return { video, update, dispose }
}
