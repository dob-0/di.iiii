// What Recorder and Still share: which WebM the browser can write, what the
// file is called, and how a picture on a wire becomes pixels on a canvas.
// Kept free of React so every rule here has a test that can fail
// (recording.test.js); the windows only wire these to buttons and signals.

// vp9 first, then vp8, then whatever WebM the browser picks — the order the
// asset pipeline already uses (useAssetPipeline.js), at a bitrate that keeps
// a projected picture's edges: 6 Mbps.
export const RECORDER_MIME_TYPES = Object.freeze([
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
])
export const RECORDER_BITS_PER_SECOND = 6_000_000
export const RECORDER_FPS = 30

/** The first type the browser says it can record, or '' (let it choose). */
export const pickRecorderMimeType = (isTypeSupported) => {
    if (typeof isTypeSupported !== 'function') return ''
    return RECORDER_MIME_TYPES.find((type) => {
        try { return isTypeSupported(type) } catch { return false }
    }) || ''
}

// 2026-10-21T14-03-07 — sortable, and legal in every file system (no colons).
export const fileStamp = (date = new Date()) => {
    const time = date instanceof Date ? date : new Date(date)
    if (!Number.isFinite(time.getTime())) return 'undated'
    return time.toISOString().slice(0, 19).replace(/:/g, '-')
}

const slugOf = (text) => String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

/**
 * The file a take lands as: what it is, what it was taken from, when.
 * `still-scene-2026-10-21T14-03-07.png`, `recording-picture-out-….webm`.
 * A project file has a name and a date and nothing else, so the source rides
 * in the name.
 */
export const takeFileName = ({ kind = 'still', source = '', date = new Date() } = {}) => {
    const extension = kind === 'recording' ? 'webm' : 'png'
    const parts = [kind === 'recording' ? 'recording' : 'still', slugOf(source), fileStamp(date)].filter(Boolean)
    return `${parts.join('-')}.${extension}`
}

/** A picture wire's pixels: the <video>/<canvas>/<img> behind a live texture. */
export const pictureMediaOf = (value) => {
    if (!value || typeof value !== 'object') return null
    const media = value.image || null
    return media && typeof media === 'object' ? media : null
}

export const pictureSizeOf = (media) => {
    const width = media?.videoWidth || media?.naturalWidth || media?.width || 0
    const height = media?.videoHeight || media?.naturalHeight || media?.height || 0
    return width > 0 && height > 0 ? { width, height } : null
}

/**
 * Copy the picture into a 2D canvas at its own size. False when there is no
 * picture yet (nothing wired, a window that is closed, a video that has not
 * decoded a frame) — never a blank canvas passed off as a picture.
 */
export const drawPicture = (media, canvas) => {
    const size = pictureSizeOf(media)
    const context = canvas?.getContext?.('2d')
    if (!size || !context) return false
    if (canvas.width !== size.width || canvas.height !== size.height) {
        canvas.width = size.width
        canvas.height = size.height
    }
    try {
        context.drawImage(media, 0, 0, size.width, size.height)
        return true
    } catch {
        return false
    }
}

/** Audio tracks carried by a Sound wire: a MediaStream, or anything holding one. */
export const audioTracksOf = (value) => {
    const stream = value && typeof value.getAudioTracks === 'function'
        ? value
        : (value?.stream && typeof value.stream.getAudioTracks === 'function' ? value.stream : null)
    if (!stream) return []
    try {
        return stream.getAudioTracks().filter((track) => track && track.readyState !== 'ended')
    } catch {
        return []
    }
}

export const formatSeconds = (seconds) => {
    const whole = Math.max(0, Math.floor(Number(seconds) || 0))
    const minutes = Math.floor(whole / 60)
    return `${minutes}:${String(whole % 60).padStart(2, '0')}`
}
