import LiveTextureView, { isLiveTexture } from './LiveTextureView.jsx'

const getImageAssetFromNode = (node, assetMap = new Map()) => {
    const assetId = node?.values?.src || node?.assetRef || null
    if (!assetId || typeof assetId !== 'string') return null
    return assetMap.get(assetId) || null
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
