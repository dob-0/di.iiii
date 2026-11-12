// Fetch every clip of the deck once, at load, one file at a time.
//
// Why: a clip launched from the deck must start at once. With the files already
// in the clip memory (clipSourceCache, parked) the launch costs no download;
// without them a 43-72 MB file arrives seconds late. One at a time, so the
// warm-up never fills the browser's connections that the live clips need.

import { useEffect, useRef } from 'react'
import { acquireClipSource } from './clipSourceCache.js'
import { resolveClipUrl } from './clipVideos.js'

const warmed = new Set() // addresses this page has already fetched

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
                    const url = latest.current.find((candidate) => !warmed.has(candidate))
                    if (!url) return
                    warmed.add(url)
                    const handle = acquire(url)
                    try { await handle.promise } finally { handle.release() }
                }
            } finally {
                running.current = false
            }
        }
        run()
    }, [key, acquire])
}
