import { useCallback, useEffect, useRef } from 'react'
import { useSoundAnalysis } from '../utils/soundAnalysis.js'
import { useAssetUrl } from '../../hooks/useAssetUrl.js'

const REPORT_INTERVAL_MS = 100

// The graph's ear on a playing Sound — no window, no mesh, no speakers
// (soundAnalysis taps the file silently; the scene's Sound object owns being
// heard). One per Sound node with a file, mounted by the editor exactly like
// VideoFrameFeed, throttled exactly like the mic panel: the analyser runs at
// frame rate but the graph-facing report every REPORT_INTERVAL_MS, because
// every report rebuilds the graph context.
export default function SoundAnalysisFeed({ node, asset, onLevelsChange }) {
    const assetUrl = useAssetUrl(asset, { preferRemoteSource: true })
    const values = node.values || {}
    const isAudioType = !asset?.mimeType || asset.mimeType.startsWith('audio/')
    const sourceUrl = ((isAudioType ? assetUrl : null) || asset?.url || '').trim() || null
    const lastReportRef = useRef(0)

    const handleLevels = useCallback((levels) => {
        const now = typeof performance !== 'undefined' ? performance.now() : 0
        if (now - lastReportRef.current < REPORT_INTERVAL_MS) return
        lastReportRef.current = now
        onLevelsChange?.(node.id, levels)
    }, [node.id, onLevelsChange])

    useSoundAnalysis(sourceUrl, { loop: values.loop !== false, onLevels: handleLevels })

    // Cleared on unmount: a deleted Sound reads as silence, not a held level.
    useEffect(() => () => onLevelsChange?.(node.id, null), [node.id, onLevelsChange])

    return null
}
