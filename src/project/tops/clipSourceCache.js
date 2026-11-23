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

export const CLIP_MEMORY_MAX_BYTES = 768 * 1024 * 1024

const cache = new Map() // address → { promise: Promise<string|null>, refs, objectUrl }

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
        entry = { refs: 0, objectUrl: '', promise: null }
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
                // Released while it was still downloading: nobody will play it.
                if (created.refs <= 0) return null
                created.objectUrl = createObjectURL(blob)
                return created.objectUrl
            } catch {
                return null
            }
        })()
        cache.set(url, entry)
    }
    entry.refs += 1
    const held = entry
    let released = false
    const release = () => {
        if (released) return
        released = true
        held.refs -= 1
        if (held.refs > 0) return
        if (cache.get(url) === held) cache.delete(url)
        held.promise.then(() => {
            if (!held.objectUrl) return
            revokeObjectURL(held.objectUrl)
            held.objectUrl = ''
        })
    }
    return { promise: held.promise, release }
}

/** For tests. */
export const clipSourceCacheSize = () => cache.size
