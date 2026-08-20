import { useEffect } from 'react'
import { useVideoTextureSource } from '../../objectComponents/VideoObject.jsx'
import { useAssetUrl } from '../../hooks/useAssetUrl.js'

// The graph's eye on a playing video — no window, no mesh. The scene only
// mounts VideoObject in the fullscreen room, but a Frame wire has to carry
// the picture wherever the graph is looked at, so the editor keeps one of
// these per playing Video node (the webcam idiom: the window that owns the
// element publishes into liveOutputs). The texture registry inside
// VideoObject is shared and refcounted by (source, settings), so when the
// room shows the same video there is still ONE <video> element behind both.
export default function VideoFrameFeed({ node, asset, onFrameChange }) {
    const assetUrl = useAssetUrl(asset, { preferRemoteSource: true })
    const values = node.values || {}
    const isVideoType = !asset?.mimeType || asset.mimeType.startsWith('video/')
    // Same resolution VideoObject uses: the resolved asset URL, then the
    // asset's own url as the fallback lane.
    const sourceUrl = ((isVideoType ? assetUrl : null) || asset?.url || '').trim() || null
    const volume = Number.isFinite(Number(values.volume)) ? Number(values.volume) : 1
    const { texture } = useVideoTextureSource(sourceUrl, {
        muted: values.muted !== false,
        volume: Math.min(1, Math.max(0, volume)),
        loop: values.loop !== false
    })

    // null on source change/unmount: a dead video reads as NO frame
    // downstream, never a frozen last one.
    useEffect(() => {
        onFrameChange?.(node.id, texture || null)
        return () => onFrameChange?.(node.id, null)
    }, [node.id, texture, onFrameChange])

    return null
}
