import { useEffect, useRef } from 'react'

const getImageAssetFromNode = (node, assetMap = new Map()) => {
    const assetId = node?.values?.src || node?.assetRef || null
    if (!assetId || typeof assetId !== 'string') return null
    return assetMap.get(assetId) || null
}

// A wired `src` carries whatever the upstream texture port produced — for
// source.webcam that is a live VideoTexture whose .image is the panel's own
// <video> element. A DOM node cannot be mounted twice, so the frame is copied
// to a canvas instead of the element being re-parented.
const isLiveTexture = (value) => Boolean(value && typeof value === 'object' && value.image)

function LiveTextureView({ texture, label }) {
    const canvasRef = useRef(null)

    useEffect(() => {
        const canvas = canvasRef.current
        const media = texture?.image
        if (!canvas || !media) return undefined
        const context = canvas.getContext('2d')
        if (!context) return undefined

        let frame = null
        const draw = () => {
            const width = media.videoWidth || media.width || 0
            const height = media.videoHeight || media.height || 0
            if (width && height) {
                if (canvas.width !== width || canvas.height !== height) {
                    canvas.width = width
                    canvas.height = height
                }
                // A source that has not decoded its first frame throws rather
                // than drawing nothing; the next tick usually succeeds.
                try { context.drawImage(media, 0, 0, width, height) } catch { /* not ready */ }
            }
            frame = requestAnimationFrame(draw)
        }
        frame = requestAnimationFrame(draw)
        return () => { if (frame !== null) cancelAnimationFrame(frame) }
    }, [texture])

    return <canvas ref={canvasRef} className="raw-image-panel-media" aria-label={label} />
}

export default function ImagePanelWindow({ node, values = null, assetMap }) {
    const sourceNode = values ? { ...node, values } : node
    const wired = sourceNode?.values?.src
    const alt = sourceNode.values?.title || node.label || 'Image'

    if (isLiveTexture(wired)) {
        return (
            <div className="raw-image-panel">
                <LiveTextureView texture={wired} label={alt} />
            </div>
        )
    }

    const asset = getImageAssetFromNode(sourceNode, assetMap)
    const src = asset?.url || ''

    if (!src) {
        return (
            <div className="raw-window-stack raw-image-panel raw-image-panel-empty">
                <p>No image selected yet.</p>
            </div>
        )
    }

    return (
        <div className="raw-image-panel">
            <img className="raw-image-panel-media" src={src} alt={asset?.name || alt} />
        </div>
    )
}
