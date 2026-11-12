// A clip's file, fetched whole and played from memory.
//
// Why: a <video> pointed at an address keeps its connection open for as long
// as it buffers. A browser gives one site 6 connections (HTTP/1.1), shared by
// every tab: a stage page and a tool page, each with its event stream and a
// few clips, fill them, and the next clip waits forever in "loading" while the
// engine keeps drawing the previous clip's last frame (measured 2026-11-10:
// 9 connections open, second clip readyState 0 for good). Two tabs playing the
// same address also queue behind the browser's cache lock for that address.
//
// So every clip on a page asks here: the file is fetched once (not through the
// HTTP cache, which is where the lock lives), kept as a blob, and every reader
// of the same address plays the same blob. The connection is free again the
// moment the download ends. A file larger than `maxBytes`, or a fetch that
// fails, resolves to null and the caller plays the address directly, as before.
//
// Parking: with a budget set (setClipParkBytes, 0 = off), a file nobody plays
// any more is kept in memory instead of dropped, oldest-first out once the
// parked files together pass the budget. Launching a clip again then costs no
// download, which is what a performer on a deck needs.

export const CLIP_MEMORY_MAX_BYTES = 768 * 1024 * 1024

const cache = new Map() // address → { promise: Promise<string|null>, refs, objectUrl, bytes, parkedAt, revoke }
let parkBudget = 0
let parkCounter = 0

const parkedEntries = () => [...cache.entries()].filter(([, entry]) => entry.parkedAt > 0)

// Over budget: drop the oldest parked file first. A file bigger than the whole budget goes at once.
const enforceBudget = () => {
    const parked = parkedEntries().sort((a, b) => a[1].parkedAt - b[1].parkedAt)
    let total = parked.reduce((sum, [, entry]) => sum + entry.bytes, 0)
    while (total > parkBudget && parked.length) {
        const [url, entry] = parked.shift()
        total -= entry.bytes
        cache.delete(url)
        if (entry.objectUrl) {
            entry.revoke(entry.objectUrl)
            entry.objectUrl = ''
        }
    }
}

const park = (entry) => {
    entry.parkedAt = ++parkCounter
    enforceBudget()
}

/** How much memory parked clips may hold; 0 (the default) keeps nothing once the last reader lets go. */
export const setClipParkBytes = (bytes) => {
    parkBudget = Math.max(0, Number(bytes) || 0)
    enforceBudget()
}

/** Bytes held by clips nobody is playing right now. */
export const clipSourceParkedBytes = () => parkedEntries().reduce((sum, [, entry]) => sum + entry.bytes, 0)

/**
 * @param {string} url
 * @param {object} [options]
 * @returns {{ promise: Promise<string|null>, release: () => void }}
 */
export const acquireClipSource = (url, {
    fetchImpl = globalThis.fetch,
    maxBytes = CLIP_MEMORY_MAX_BYTES,
    createObjectURL = (blob) => globalThis.URL.createObjectURL(blob),
    revokeObjectURL = (objectUrl) => globalThis.URL.revokeObjectURL(objectUrl)
} = {}) => {
    let entry = cache.get(url)
    if (!entry) {
        entry = { refs: 0, objectUrl: '', promise: null, bytes: 0, parkedAt: 0, revoke: revokeObjectURL }
        const created = entry
        created.promise = (async () => {
            try {
                if (typeof fetchImpl !== 'function') return null
                const response = await fetchImpl(url, { cache: 'no-store' })
                if (!response?.ok) return null
                const length = Number(response.headers?.get?.('content-length')) || 0
                if (length > maxBytes) {
                    try { await response.body?.cancel?.() } catch { /* already closed */ }
                    return null
                }
                const blob = await response.blob()
                if (blob.size > maxBytes) return null
                // Released while it was still downloading: nobody will play it, unless parking is on.
                if (created.refs <= 0 && parkBudget <= 0) return null
                created.bytes = Number(blob.size) || 0
                created.objectUrl = createObjectURL(blob)
                // Released during the download: it is parked now that its size is known.
                if (created.refs <= 0 && cache.get(url) === created) park(created)
                return created.objectUrl
            } catch {
                return null
            }
        })()
        cache.set(url, entry)
    }
    entry.parkedAt = 0
    entry.refs += 1
    const held = entry
    let released = false
    const release = () => {
        if (released) return
        released = true
        held.refs -= 1
        if (held.refs > 0) return
        if (parkBudget > 0 && cache.get(url) === held) {
            if (held.objectUrl) {
                park(held)
            } else {
                // Still downloading: the download parks itself when it ends. A failed one is simply dropped.
                held.promise.then((objectUrl) => {
                    if (!objectUrl && held.refs <= 0 && cache.get(url) === held) cache.delete(url)
                })
            }
            return
        }
        if (cache.get(url) === held) cache.delete(url)
        held.promise.then(() => {
            if (!held.objectUrl) return
            revokeObjectURL(held.objectUrl)
            held.objectUrl = ''
        })
    }
    return { promise: held.promise, release }
}

/** Entries in the cache, parked ones included. For tests. */
export const clipSourceCacheSize = () => cache.size
