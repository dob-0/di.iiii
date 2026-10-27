import { useEffect } from 'react'
import { useAssetUrl } from '../../hooks/useAssetUrl.js'

// The bytes a Laser File node reads (laser Phase 9). One per Laser File with a file, mounted by the editor
// like SoundAnalysisFeed: it fetches the asset once per url and publishes the bytes as `${node.id}:bytes`
// on the live side channel; the node's runtime parses them (nodes/laser.file/laserFile.js, pure). A failed
// fetch publishes nothing and the node's Status says it is still loading. Cleared on unmount.
export default function LaserFileFeed({ node, asset, onBytesChange }) {
    const url = useAssetUrl(asset, { preferRemoteSource: true, acceptsGenericBinary: true }) || asset?.url || null

    useEffect(() => {
        if (!url) return undefined
        let cancelled = false
        fetch(url)
            .then((res) => (res.ok ? res.arrayBuffer() : null))
            .then((buffer) => { if (!cancelled && buffer) onBytesChange?.(node.id, new Uint8Array(buffer)) })
            .catch(() => {})
        return () => { cancelled = true }
    }, [url, node.id, onBytesChange])

    useEffect(() => () => onBytesChange?.(node.id, null), [node.id, onBytesChange])

    return null
}
