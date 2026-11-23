// Which <video> frames are new. A 30 fps camera drawn by a 60 Hz page used to be
// uploaded to the GPU on all 60 ticks (currentTime of a live stream moves on
// every tick); requestVideoFrameCallback says exactly when the browser has a
// new picture, so the engine uploads once per picture and keeps the rest of the
// tick for drawing. Where the callback does not exist, the old currentTime
// check stays in charge.

/**
 * Start counting the new frames of a video.
 * @returns {{fresh: boolean, stop: () => void} | null} null when the browser
 *   cannot say (no requestVideoFrameCallback).
 */
export const watchVideoFrames = (video) => {
    if (!video || typeof video.requestVideoFrameCallback !== 'function') return null
    const watch = { fresh: true, stopped: false, handle: 0, stop() {} }
    const again = () => {
        if (watch.stopped) return
        watch.handle = video.requestVideoFrameCallback(() => { watch.fresh = true; again() })
    }
    watch.stop = () => {
        watch.stopped = true
        video.cancelVideoFrameCallback?.(watch.handle)
    }
    again()
    return watch
}

/**
 * Does this video hold a picture that has not been uploaded yet? `moved` is
 * the old currentTime answer (videoMoved). With a watch, a playing video is
 * uploaded only when its frame callback fired; a paused one (a seek, another
 * file in the same slot) and the very first look still use `moved`.
 * Consumes the watch's flag.
 */
export const hasNewFrame = (slot, video, watch, moved) => {
    if (!watch) return moved
    if (watch.fresh) { watch.fresh = false; return true }
    if (!moved) return false
    return video.paused || slot.lastVideoTime === undefined
}
