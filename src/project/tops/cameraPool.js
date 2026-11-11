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

import { cameraSourceKey, getSourcesOff, subscribeSourcesOff } from './sourceSwitch.js'

// A source the person switched off (sourceSwitch.js) is not opened here, and what is open of it
// is stopped at once: every clone, then the capture itself. The caller of a blocked open gets an
// error named SourceOff: it is a choice, not a fault, so nobody retries it or reports it.
export const SOURCE_OFF = 'SourceOff'
const sourceOffError = (label) => Object.assign(new Error(`Source "${label}" is switched off`), { name: SOURCE_OFF, camera: label })

const pool = new Map() // key → { master: Promise<MediaStream>, refs: number, label, clones: Set<MediaStream> }

const keyOf = (constraints) => {
    const video = constraints?.video
    const exact = video && typeof video === 'object' ? video.deviceId?.exact || video.deviceId : null
    return typeof exact === 'string' && exact ? exact : 'default'
}

const labelOfStream = (stream) => stream?.getTracks?.()[0]?.label || ''

// The label behind a device id, asked only while something is switched off.
const labelOfDevice = async (media, key) => {
    if (key === 'default' || typeof media?.enumerateDevices !== 'function') return ''
    try {
        return (await media.enumerateDevices()).find((device) => device.kind === 'videoinput' && device.deviceId === key)?.label || ''
    } catch {
        return ''
    }
}

// The switch went off or on: stop what is open of a source that is now off.
const onSwitch = () => {
    const off = getSourcesOff()
    if (!off.size) return
    for (const [key, entry] of [...pool]) {
        if (!entry.label || !off.has(cameraSourceKey(entry.label))) continue
        entry.dead = true
        pool.delete(key)
        for (const clone of [...entry.clones]) clone.getTracks().forEach((track) => track.stop())
        entry.master?.then?.((master) => master.getTracks().forEach((track) => track.stop()), () => {})
    }
}

export const openSharedCamera = async (media, constraints) => {
    const key = keyOf(constraints)
    subscribeSourcesOff(onSwitch) // a Set add: once per page, and again after the listeners were reset
    // Nothing off (the usual case): not one extra call.
    if (getSourcesOff().size) {
        const label = await labelOfDevice(media, key)
        if (label && getSourcesOff().has(cameraSourceKey(label))) throw sourceOffError(label)
    }
    let entry = pool.get(key)
    // A capture that has ended is not shared again: the next opener gets a fresh one.
    if (entry?.dead) { pool.delete(key); entry = null }
    if (!entry) {
        entry = { master: null, refs: 0, label: '', clones: new Set() }
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
    // The switch may have gone off while the device was opening (or the id was the default camera):
    // the capture's own label settles it. The opener gives its share back; the last one stops the device.
    entry.label = entry.label || labelOfStream(master)
    if (entry.label && getSourcesOff().has(cameraSourceKey(entry.label))) {
        entry.refs -= 1
        if (entry.refs <= 0) {
            entry.dead = true
            if (pool.get(key) === entry) pool.delete(key)
            master.getTracks?.().forEach((track) => track.stop())
        }
        throw sourceOffError(entry.label)
    }
    // A stream that cannot be cloned is not shared: the caller owns it alone.
    if (typeof master?.clone !== 'function') {
        entry.refs -= 1
        if (pool.get(key) === entry) pool.delete(key)
        return master
    }
    if (master.getVideoTracks?.()[0]?.readyState === 'ended') {
        entry.refs -= 1
        entry.dead = true
        if (pool.get(key) === entry) pool.delete(key)
        return openSharedCamera(media, constraints)
    }
    const stream = master.clone()
    entry.clones.add(stream)
    let released = false
    const release = () => {
        if (released) return
        released = true
        entry.clones.delete(stream)
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
