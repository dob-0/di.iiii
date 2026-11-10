// One camera device, one reader per page.
//
// A phone camera (and most capture cards) allows ONE reader per browser
// process. A stage page can now run a VJ deck whose clips are cameras AND a
// camera surface of its own; if each called getUserMedia the second one failed
// and the wall went black on that input. Every opener on a page asks this pool
// instead: the first request opens the device, later ones for the same device
// get a CLONE of that stream (same capture, no second open), and the device is
// released when the last clone has been stopped.
//
// The caller keeps its old contract: it gets a MediaStream and stops its tracks
// when done. Stopping is how it reports "I am finished" — track.stop is wrapped
// so the pool can count.
//
// Keyed by the device ('default' when none is named). Constraints other than
// the device come from whoever opened it first.

const pool = new Map() // key → { master: Promise<MediaStream>, refs: number }

const keyOf = (constraints) => {
    const video = constraints?.video
    const exact = video && typeof video === 'object' ? video.deviceId?.exact || video.deviceId : null
    return typeof exact === 'string' && exact ? exact : 'default'
}

export const openSharedCamera = async (media, constraints) => {
    const key = keyOf(constraints)
    let entry = pool.get(key)
    if (!entry) {
        entry = { master: null, refs: 0 }
        entry.master = media.getUserMedia(constraints).catch((error) => {
            if (pool.get(key) === entry) pool.delete(key)
            throw error
        })
        pool.set(key, entry)
    }
    entry.refs += 1
    let master
    try {
        master = await entry.master
    } catch (error) {
        entry.refs -= 1
        throw error
    }
    // A stream that cannot be cloned is not shared: the caller owns it alone.
    if (typeof master?.clone !== 'function') {
        entry.refs -= 1
        if (pool.get(key) === entry) pool.delete(key)
        return master
    }
    const stream = master.clone()
    let released = false
    const release = () => {
        if (released) return
        released = true
        entry.refs -= 1
        if (entry.refs <= 0) {
            if (pool.get(key) === entry) pool.delete(key)
            master.getTracks().forEach((track) => track.stop())
        }
    }
    for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track)
        track.stop = () => { stop(); release() }
    }
    return stream
}

/** For tests. */
export const cameraPoolSize = () => pool.size
