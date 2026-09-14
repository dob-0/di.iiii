import { useEffect } from 'react'
import { useVideoTextureSource } from '../../objectComponents/VideoObject.jsx'
import { useAssetUrl } from '../../hooks/useAssetUrl.js'

// The graph's eye on a playing video — no window, no mesh, no speakers. The
// scene only mounts VideoObject in the room, but a Frame wire has to carry
// the picture wherever the graph is looked at, so the editor keeps one of
// these per playing Video node for as long as the node exists.
//
// A SILENT picture tap, the SoundAnalysisFeed rule: the room's Video owns
// being heard. It used to key its element on the stored muted/volume, so an
// unmuted Video played a second, audible element beside the room's, and any
// volume change re-keyed the element and restarted the picture. Muted with a
// fixed volume, it never restarts for a volume move, never makes a sound, and
// shares the room's element whenever the room's is muted too (the cache in
// VideoObject is keyed on the settings). `values` are the RESOLVED inputs, so
// a wired Loop is honoured.
export default function VideoFrameFeed({ node, asset, values = null, onFrameChange }) {
    const assetUrl = useAssetUrl(asset, { preferRemoteSource: true })
    const resolved = values || node.values || {}
    const isVideoType = !asset?.mimeType || asset.mimeType.startsWith('video/')
    // Same resolution VideoObject uses: the resolved asset URL, then the
    // asset's own url as the fallback lane.
    const sourceUrl = ((isVideoType ? assetUrl : null) || asset?.url || '').trim() || null
    const { texture } = useVideoTextureSource(sourceUrl, {
        muted: true,
        volume: 1,
        loop: resolved.loop !== false
    })

    // null on source change/unmount: a dead video reads as NO frame
    // downstream, never a frozen last one.
    useEffect(() => {
        onFrameChange?.(node.id, texture || null)
        return () => onFrameChange?.(node.id, null)
    }, [node.id, texture, onFrameChange])

    return null
}
