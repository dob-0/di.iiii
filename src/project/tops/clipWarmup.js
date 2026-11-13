// Fetch every clip of the deck once, at load, one file at a time.
//
// Why: a clip launched from the deck must start at once. With the files already
// in the clip memory (clipSourceCache, parked) the launch costs no download;
// without them a 43-72 MB file arrives seconds late. One at a time, so the
// warm-up never fills the browser's connections that the live clips need.

import { useEffect, useRef } from 'react'
import { acquireClipSource } from './clipSourceCache.js'
import { resolveClipUrl } from './clipVideos.js'

const MAX_TRIES = 3
const RETRY_WAIT_MS = 500
const warmed = new Set() // addresses this page has fetched successfully
const tries = new Map() // address → failed tries so far; at MAX_TRIES it is given up for this page

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// The next address still to fetch: not warmed, not given up, fewest failed tries first (deck order among equals).
const nextUrl = (list) => {
    let best = ''
    for (const candidate of list) {
        if (warmed.has(candidate)) continue
        const count = tries.get(candidate) || 0
        if (count >= MAX_TRIES) continue
        if (!best || count < (tries.get(best) || 0)) best = candidate
    }
    return best
}

/** Unique, non-empty addresses of the deck's asset clips, in deck order. */
export const deckClipUrls = (document, resolveUrl) => {
    const nodes = Array.isArray(document?.nodes) ? document.nodes : []
    const seen = new Set()
    const out = []
    for (const node of nodes) {
        const layers = node?.values?.deck?.layers
        if (!Array.isArray(layers)) continue
        for (const layer of layers) {
            const clips = Array.isArray(layer?.clips) ? layer.clips : []
            for (const clip of clips) {
                if (clip?.kind !== 'asset') continue
                const url = resolveUrl(clip.asset)
                if (!url || typeof url !== 'string' || seen.has(url)) continue
                seen.add(url)
                out.push(url)
            }
        }
    }
    return out
}

const skipped = (url) => /^(blob|data):/i.test(url)

export function useClipWarmup(document, { spaceId = '', projectId = null, enabled = true, acquire = acquireClipSource } = {}) {
    const running = useRef(false)
    const stopped = useRef(false)
    const latest = useRef([])
    const urls = enabled
        ? deckClipUrls(document, (asset) => resolveClipUrl(asset, spaceId, { assets: document?.assets || null, projectId })).filter((url) => !skipped(url))
        : []
    // Keyed on the list as a string: the document object changes on every edit.
    const key = JSON.stringify(urls)
    useEffect(() => {
        stopped.current = false
        return () => { stopped.current = true }
    }, [])
    useEffect(() => {
        latest.current = JSON.parse(key)
        if (running.current) return // the run going now reads the newest list when it comes round again
        const run = async () => {
            running.current = true
            try {
                // Re-read the list after every file: a clip added meanwhile is picked up by this same run.
                for (;;) {
                    if (stopped.current) return
                    const url = nextUrl(latest.current)
                    if (!url) return
                    // A retry of the same address waits a moment, so a 502 is not hammered; other addresses go first.
                    if (tries.get(url)) {
                        await wait(RETRY_WAIT_MS)
                        if (stopped.current) return
                    }
                    const handle = acquire(url)
                    let result = null
                    try { result = await handle.promise } catch { result = null } finally { handle.release() }
                    if (result) warmed.add(url)
                    else tries.set(url, (tries.get(url) || 0) + 1)
                }
            } finally {
                running.current = false
            }
        }
        run()
    }, [key, acquire])
}
