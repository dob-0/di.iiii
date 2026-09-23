import { useCallback, useMemo, useRef } from 'react'
import { toTopNetwork, useTopNetwork } from '../../project/tops/useTopNetwork.js'

// Runs the project's picture operators while the editor is open: feeds every
// card its picture and publishes Analyze's numbers into liveOutputs, where any
// number node can read them. Invisible, like the video and sound feeds beside
// it in RawEditor — the pictures are on the cards, not here.
//
// A number is only re-published when it moved: every publish re-renders the
// whole editor, and a still room would otherwise do that ten times a second.
const MOVED = 0.004

// A Clip In (and every clip a VJ deck plays) finds its footage among the
// PROJECT's files — `assets` and `projectId`, the same ones a Video node reads.
export default function TopNetworkFeed({ document, spaceId = '', projectId = null, onLiveOutputChange }) {
    const network = useMemo(() => toTopNetwork(document), [document])
    const published = useRef(new Map())
    const onMeasure = useCallback((nodeId, numbers) => {
        for (const [portId, value] of Object.entries(numbers)) {
            const key = `${nodeId}:${portId}`
            const before = published.current.get(key)
            if (before !== undefined && Math.abs(before - value) < MOVED) continue
            published.current.set(key, value)
            onLiveOutputChange(nodeId, portId, value)
        }
    }, [onLiveOutputChange])
    useTopNetwork({
        network, spaceId, thumbnails: true, onMeasure,
        assets: document?.assets || null,
        projectId: projectId || document?.projectMeta?.id || null
    })
    return null
}
